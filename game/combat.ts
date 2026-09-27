import {
  area,
  cloneCells,
  colOf,
  createBoard,
  drawTile,
  findGroups,
  gravity,
  growBoard,
  idx,
  isSpecialTile,
  applyMove,
  isValidMove,
  lineCells,
  lineFree,
  MAX_SIDE,
  MIN_SIDE,
  makeTile,
  moveBlock,
  moveCells,
  moveKind,
  neighbors,
  randomCells,
  reshuffle,
  rowOf,
  shiftCells,
  validMoves,
  type MoveRules,
} from './board.ts';
import { chance, next, pick, shuffle, weighted } from './rng.ts';
import { ENEMIES } from './content/enemies.ts';
import { ACTS } from './content/acts.ts';
import { CHARACTERS } from './content/acts.ts';
import { BASE_GEAR, GEAR, GEAR_SWAP_COST, withUpgrade, type GearDef } from './content/gear.ts';
import { heartText, heartsText } from './text.ts';
import { FINDS, FIND_BOMB_COINS, FIND_COINS, FIND_ENERGY, FIND_KINDS, FIND_METER } from './content/finds.ts';
import { gainCoins, loseCoins } from './economy.ts';
import { ITEMS, POCKETS, computeMods, type Mods } from './content/items.ts';
import {
  BAG_COPIES,
  FAMS,
  H,
  W,
  type BagToken,
  type Blast,
  type Combat,
  type Dims,
  type Effect,
  type EnemyState,
  type Fam,
  type FindKind,
  type GameEvent,
  type Group,
  type Intent,
  type LineShift,
  type Move,
  type RunState,
  type Tally,
  type Tile,
  type TileKind,
  type TileScore,
} from './types.ts';

export const MAX_ENEMIES = 3;
/** Bosses hit harder than the act's regular enemies (their blows must break through two hearts of armour). */
export const BOSS_DMG = 1.3;
/** After this many moves in a fight, enemies hit harder every 5 moves. */
export const OVERTIME_AFTER = 20;
const isDead = (run: RunState) => run.phase === 'dead';
/** A damage bonus as the player reads it: 0.25 → «25%». */
export const pct = (k: number) => `${Math.round(k * 100)}%`;

// ── Move scoring state ───────────────────────────────────────────────

/** Everything a move accumulates before the final strike. */
export interface MoveState {
  tally: Tally;
  /** Damage bonus the move's gold tiles put aside for the next strike (the abacus). */
  bank: number;
  /** Groups of each family scored this move. */
  famGroups: Record<Fam, number>;
  /** Damage bonus of the weapon against paper targets this move. */
  paperBonus: number;
  redGroups: number;
  redTiles: number;
  fams: Set<Fam>;
  copyNext: number;
  echoUsed: boolean;
  flags: Set<string>;
  pierce: boolean;
  armorX: number;
  bleed: number;
  stun: boolean;
  delay: number;
  heal: number;
  selfDmg: number;
  ward: number;
  reflect: number;
  /** Cells whose neighbours get cleaned of junk (and pins with the corrector). */
  cleanse: number[];
  cleansePins: boolean;
  /** Random tiles of the board turning red after the strike (the copy stamp). */
  stamp: number;
  /** Damage the drawer adds when red and blue both scored this move. */
  redBonus: number;
  floodDown: number;
  burn: boolean;
  freeze: boolean;
  plane: number;
  junkCleared: number;
  /** Blue and yellow tiles blasted this wave (they block and pay in threes). */
  blueBlasted: number;
  coinBlasted: number;
  /** The group being scored works as its colour's super. */
  superGroup: boolean;
  /** «Заряд»: every group of the first wave is a super. */
  charged: boolean;
  /** The accountant's double entry: the groups of the first wave score twice. */
  double: boolean;
  /** «Вне очереди»: the enemies do not tick after this move. */
  rush: boolean;
  /** Share of the target's maximum health the strike takes at once (the cutter's guillotine). */
  hpPct: number;
  bonusCoins: number;
  /** Finds-meter points of the move (yellow tiles) and the finds picked up. */
  findPts: number;
  found: FindKind[];
  notes: string[];
}

export function newTally(): Tally {
  return { dmg: 0, armor: 0, aoe: 0, bonus: 0, coins: 0, charge: 0 };
}

function newMoveState(): MoveState {
  return {
    tally: newTally(),
    bank: 0,
    famGroups: { blade: 0, shield: 0, ink: 0, coin: 0 },
    paperBonus: 0,
    redGroups: 0,
    redTiles: 0,
    fams: new Set(),
    copyNext: 0,
    echoUsed: false,
    flags: new Set(),
    pierce: false,
    armorX: 1,
    bleed: 0,
    stun: false,
    delay: 0,
    heal: 0,
    selfDmg: 0,
    ward: 0,
    reflect: 0,
    cleanse: [],
    cleansePins: false,
    stamp: 0,
    redBonus: 0,
    floodDown: 0,
    burn: false,
    freeze: false,
    plane: 0,
    junkCleared: 0,
    blueBlasted: 0,
    coinBlasted: 0,
    superGroup: false,
    charged: false,
    double: false,
    rush: false,
    hpPct: 0,
    bonusCoins: 0,
    findPts: 0,
    found: [],
    notes: [],
  };
}

export interface Ctx {
  run: RunState;
  c: Combat;
  mods: Mods;
  /** The items held for every colour (upgrades merged in). */
  gear: Record<Fam, GearDef>;
  ev: GameEvent[];
  /** Current effect sink (a wave or a standalone effects batch). */
  fx: Effect[];
  wave: number;
  pendingDeaths: GameEvent[];
  rocketsThisMove: number;
  ms: MoveState;
}

export function newCtx(run: RunState, mods: Mods, ev: GameEvent[]): Ctx {
  return { run, c: run.combat!, mods, gear: heldGear(run), ev, fx: [], wave: 0, pendingDeaths: [], rocketsThisMove: 0, ms: newMoveState() };
}

// ── Gear ─────────────────────────────────────────────────────────────

/** The item held for a colour, its upgrade merged in (the value adds, effects replace). */
export function gearOf(run: RunState, fam: Fam): GearDef {
  const id = run.hero.equip?.[fam] ?? BASE_GEAR[fam];
  const def = ITEMS[id]?.gear ?? GEAR[BASE_GEAR[fam]].gear;
  return withUpgrade(def, !!run.hero.ups?.includes(id));
}

export function heldGear(run: RunState): Record<Fam, GearDef> {
  return { blade: gearOf(run, 'blade'), shield: gearOf(run, 'shield'), ink: gearOf(run, 'ink'), coin: gearOf(run, 'coin') };
}

/** The item's value in this act (the awl grows with the shift). */
export function gearValue(def: GearDef, run: RunState): number {
  return def.value + (def.valueAct ?? 0) * run.act;
}

// ── Enemies ──────────────────────────────────────────────────────────

export function intentsOf(e: EnemyState): Intent[] {
  const def = ENEMIES[e.def];
  return e.phase > 0 && def.phases ? def.phases[e.phase - 1].intents : def.intents;
}

export function currentIntent(e: EnemyState): Intent {
  const list = intentsOf(e);
  return list[e.cycle % list.length];
}

export function alive(c: Combat): EnemyState[] {
  return c.enemies.filter((e) => e.hp > 0);
}

export function overtimeBonus(c: Combat): number {
  return c.moves > OVERTIME_AFTER ? 1 + Math.floor((c.moves - OVERTIME_AFTER - 1) / 5) : 0;
}

const DAMAGING = new Set(['attack', 'heavy', 'strike']);

/** Damage an enemy's current intent will deal, as shown to the player. */
export function intentDamage(c: Combat, e: EnemyState): number {
  const i = currentIntent(e);
  return DAMAGING.has(i.kind) ? Math.round(i.value * e.dmgMul) + overtimeBonus(c) : 0;
}

/**
 * The act's scale for effects outside the strike: damage to enemies (bleed, burn, bites, thorns)
 * and their shields, armour and heals grow with enemy health; the hero's flat armour grows with
 * enemy blows. A flat 3 means the same in the last act as in the first.
 */
export function actScale(run: RunState): { hp: number; dmg: number } {
  const act = ACTS[Math.min(run.act, ACTS.length - 1)];
  return { hp: act.hpMul, dmg: act.dmgMul };
}

/** Ticks an enemy can be held back between two of its actions: then it acts whatever you stamp. */
export const MAX_HOLD = 2;

/**
 * Pushes an enemy's timer back by up to n ticks, no more than MAX_HOLD since its last action
 * (stacked delays held enemies for good). Returns the ticks actually added.
 */
export function holdBack(e: EnemyState, n: number): number {
  const k = Math.max(0, Math.min(n, MAX_HOLD - (e.held ?? 0)));
  e.countdown += k;
  e.held = (e.held ?? 0) + k;
  return k;
}

export function makeEnemy(run: RunState, c: Combat, defId: string, mods: Mods): EnemyState {
  const def = ENEMIES[defId];
  const act = ACTS[Math.min(run.act, ACTS.length - 1)];
  // Elites of the later acts are their regular enemies with more health and harder blows (the first act has its own).
  const elite = c.kind === 'elite' ? (act.eliteHp ?? 1) : 1;
  const hp = Math.max(1, Math.round(def.hp * act.hpMul * elite * (run.dev?.enemyHp ?? 1)));
  const e: EnemyState = {
    uid: c.nextUid++,
    def: defId,
    hp,
    maxHp: hp,
    block: 0,
    armor: Math.round((def.armor ?? 0) * act.hpMul),
    cycle: 0,
    countdown: 0,
    phase: 0,
    bleed: 0,
    burn: 0,
    burnTurns: 0,
    stunned: false,
    stunImmune: false,
    submerged: false,
    shining: false,
    hitOnce: false,
    dmgMul: act.dmgMul * (c.kind === 'elite' ? (act.eliteDmg ?? 1) : c.kind === 'boss' ? BOSS_DMG : 1) * (run.dev?.enemyDmg ?? 1),
    stolen: 0,
  };
  // The first action comes a tick early: a fight is short, and a blow that never lands is no threat.
  e.countdown = Math.max(1, currentIntent(e).timer - 1 + mods.timerBonus);
  return e;
}

export function snap(cells: Tile[]): Tile[] {
  return cloneCells(cells);
}

function snapQueue(c: Combat): Tile[][] {
  return c.board.queue.map((q) => q.map((t) => ({ ...t })));
}

/** Bag weights of the colours (yellow is rarer); a hero may have its own. */
export const BASE_WEIGHTS: Record<Fam, number> = { blade: 4, shield: 4, ink: 3, coin: 2 };
/** Every colour keeps a share of the bag: a board of three colours cascaded without end. */
export const WEIGHT_MIN = 2;
export const WEIGHT_MAX = 6;

export function bagWeights(run: RunState): Record<Fam, number> {
  const own = CHARACTERS[run.hero.char]?.weights ?? {};
  const out = { ...BASE_WEIGHTS };
  for (const f of FAMS) out[f] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, own[f] ?? BASE_WEIGHTS[f]));
  return out;
}

/**
 * The fight's bag: BAG_COPIES tiles for every point of a colour's weight, and as many junk tiles
 * for every red tape curse the hero carries.
 */
export function bagTokens(run: RunState): BagToken[] {
  const out: BagToken[] = [];
  const w = bagWeights(run);
  for (const fam of FAMS) for (let k = 0; k < w[fam] * BAG_COPIES; k++) out.push({ kind: fam });
  for (let k = 0; k < (run.hero.tape ?? 0) * BAG_COPIES; k++) out.push({ kind: 'junk', tape: true });
  return out;
}

/** How tiles move in this fight: the hero's items open slides and diagonals, a turnstile allows only up and down. */
export function moveRules(run: RunState, mods: Mods, enemyIds?: readonly string[]): MoveRules {
  const c = run.combat;
  const ids = enemyIds ?? (c ? alive(c).map((e) => e.def) : []);
  const vertical = ids.some((id) => !!ENEMIES[id]?.traits?.includes('turnstile'));
  return { wrap: mods.wrap, slide: mods.slide, diagonal: mods.diagonal, vertical, unpinned: mods.unpinned };
}

/**
 * Board size of a fight: 6×6 plus what the hero's items add, a column less for every cramped enemy
 * on the field (5 to 8 cells a side).
 */
export function boardDims(run: RunState, mods: Mods, enemyIds: readonly string[]): Dims {
  void run;
  const cramped = enemyIds.filter((id) => ENEMIES[id]?.traits?.includes('cramped')).length;
  const side = (n: number) => Math.max(MIN_SIDE, Math.min(MAX_SIDE, n));
  return { w: side(W + mods.boardW - cramped), h: side(H + mods.boardH) };
}

/** A cramped enemy fell: its column comes back (the board only grows during a fight). */
function fitBoard(ctx: Ctx) {
  const { run, c, mods } = ctx;
  const want = boardDims(run, mods, alive(c).map((e) => e.def));
  if (want.w <= c.board.w && want.h <= c.board.h) return;
  growBoard(c.board, want, run.rng.board, mods.wrap);
  syncIds(run, c);
  ctx.ev.push({ t: 'resize', w: c.board.w, h: c.board.h, board: snap(c.board.cells), queue: snapQueue(c) });
}

export function startCombat(run: RunState, kind: Combat['kind'], enemyIds: string[], mods: Mods, ev: GameEvent[]): Combat {
  const board = createBoard(run.rng.board, bagTokens(run), mods.wrap, 6, run.nextId, boardDims(run, mods, enemyIds));
  const c: Combat = {
    kind,
    board,
    enemies: [],
    target: -1,
    moves: 0,
    ticks: 0,
    freeTicks: 0,
    damageTaken: 0,
    nextUid: 1,
    garland: 0,
    nextBonus: 0,
    bonusCoins: 0,
  };
  for (const id of enemyIds) c.enemies.push(makeEnemy(run, c, id, mods));
  c.target = c.enemies[0]?.uid ?? -1;
  run.hero.armor = Math.min(armorCap(run), Math.round(mods.startArmor * actScale(run).dmg));
  run.hero.ward = 0;
  run.hero.reflect = 0;
  if (mods.sealStart > 0)
    for (const i of randomCells(run.rng.fx, board.cells, mods.sealStart, (t) => t.kind !== 'junk' && t.kind !== 'prism')) board.cells[i].seal = true;
  if (mods.startRockets > 0)
    randomCells(run.rng.fx, board.cells, mods.startRockets, (t) => t.kind !== 'junk' && t.kind !== 'prism' && !t.special).forEach(
      (i, k) => (board.cells[i].special = k % 2 ? 'rocketV' : 'rocketH'),
    );
  if (mods.interest) {
    const bonus = gainCoins(run, Math.floor(run.hero.coins / 20));
    if (bonus > 0) ev.push({ t: 'message', text: `Проценты: +${bonus}` });
  }
  // A find left on the last board (or promised by an event) waits on this one.
  if (run.hero.findNext) {
    const [i] = randomCells(run.rng.fx, board.cells, 1, findable);
    if (i !== undefined) board.cells[i].find = run.hero.findNext;
    delete run.hero.findNext;
  }
  // A board dealt for plain swaps may have no move under the fight's rules (a turnstile allows only
  // up and down): shuffle it until it has some.
  const rules = moveRules(run, mods, enemyIds);
  if (validMoves(board, rules).length === 0) reshuffle(board, run.rng.board, rules);
  ev.push({ t: 'combatStart', kind });
  return c;
}

function syncIds(run: RunState, c: Combat) {
  run.nextId = Math.max(run.nextId, c.board.nextId);
}

export function targetEnemy(c: Combat): EnemyState | undefined {
  const t = c.enemies.find((e) => e.uid === c.target && e.hp > 0);
  if (t) return t;
  const first = alive(c)[0];
  if (first) c.target = first.uid;
  return first;
}

export function activeCost(run: RunState): number {
  const id = run.hero.active;
  const base = id ? (ITEMS[id]?.charge ?? 6) : 6;
  let share = 1;
  for (const r of run.hero.relics) share *= ITEMS[r]?.skillCost ?? 1;
  return share === 1 ? base : Math.max(1, Math.ceil(base * share - 1e-9));
}

/** Energy a gear swap costs in a fight. */
export function swapCost(run: RunState): number {
  return Math.max(0, GEAR_SWAP_COST - modsOfRelics(run).swapDiscount);
}

/** The energy meter: it holds this much (items add room) and keeps its charge between fights. */
export const ENERGY_MAX = 10;
/** «Заряд»: every group of the next move's first wave works as its colour's super. */
export const CHARGE_COST = 4;
/** «Вне очереди»: the enemies do not tick after the next move (never two such moves in a row). */
export const RUSH_COST = 7;

export function energyCap(run: RunState): number {
  return ENERGY_MAX + modsOfRelics(run).energyMax;
}

export function armCost(what: 'charge' | 'rush'): number {
  return what === 'charge' ? CHARGE_COST : RUSH_COST;
}

/**
 * Why energy cannot ready this for the next move, or null. `on` is what is readied already: it can
 * always be cancelled.
 */
export function armBlock(run: RunState, what: 'charge' | 'rush'): string | null {
  const c = run.combat;
  if (!c) return 'Только в бою';
  if (c.armed?.[what]) return null;
  if (what === 'rush') {
    if (c.lastRush !== undefined && c.lastRush === c.moves) return 'Вне очереди — не два хода подряд';
    if (c.freeTicks > 0) return 'Враги и так ждут';
  }
  const cost = armCost(what);
  if (!run.dev?.ink && run.hero.charge < cost) return `Нужно ${cost} энергии`;
  return null;
}

/** Readies (or cancels, with the energy back) «Заряд» or «Вне очереди» for the next move; spends no time. */
export function armMove(run: RunState, what: 'charge' | 'rush', ev: GameEvent[]): boolean {
  const c = run.combat!;
  const hero = run.hero;
  const armed = (c.armed ??= {});
  const cost = armCost(what);
  if (armed[what]) {
    armed[what] = false;
    if (!run.dev?.ink) hero.charge = Math.min(energyCap(run), hero.charge + cost);
    ev.push({ t: 'armed', what, on: false });
    return true;
  }
  const block = armBlock(run, what);
  if (block) {
    ev.push({ t: 'invalid', reason: block });
    return false;
  }
  if (!run.dev?.ink) hero.charge -= cost;
  armed[what] = true;
  ev.push({ t: 'armed', what, on: true });
  return true;
}

/** Energy readied for a move that never came (the fight ended first) goes back to the meter. */
export function unarm(run: RunState) {
  const c = run.combat;
  if (!c?.armed) return;
  let back = 0;
  if (c.armed.charge) back += CHARGE_COST;
  if (c.armed.rush) back += RUSH_COST;
  if (back && !run.dev?.ink) run.hero.charge = Math.min(energyCap(run), run.hero.charge + back);
  c.armed = undefined;
}

/** Damage from a move's energy that does not fit the meter: 1 per point (no meter: every point). */
export function inkOverflow(run: RunState, charge: number): number {
  const room = Math.max(0, energyCap(run) - run.hero.charge);
  return Math.max(0, Math.round(charge) - room);
}

/** The hero's item mods without the combat (for costs read outside a fight). */
function modsOfRelics(run: RunState): Mods {
  return computeMods(run.hero.relics);
}

/** Most armour the hero holds at once, in half-hearts: two hearts. */
export const ARMOR_CAP = 4;

/**
 * Armour holds at most two hearts (and never more than the hero's health): blows up to that can be
 * blocked in full, heavier ones always wound — stun them, delay them or take them.
 */
export function armorCap(run: RunState): number {
  return Math.min(run.hero.maxHp, ARMOR_CAP);
}

export function armorRoom(run: RunState): number {
  return Math.max(0, armorCap(run) - run.hero.armor);
}

/** The mop: half a heart of armour for every two junk tiles cleared (grows with the act). */
export function mopArmor(junk: number, mods: Mods, dmgScale: number): number {
  return Math.floor(junk / 2) * mods.mopJunk * dmgScale;
}

/** Adds armour up to the cap; returns what fit. */
export function gainArmor(run: RunState, n: number): number {
  const k = Math.min(armorRoom(run), Math.max(0, Math.round(n)));
  run.hero.armor += k;
  return k;
}

// ── Damage ───────────────────────────────────────────────────────────

/** Damage per half-heart where hearts turn into blows: the clipboard (grows with the act), the tape. */
export const REFLECT_PER_HALF = 4;

/** Armor takes one enemy blow and burns out; the umbrella's ward softens the blow first. */
export function hurtHero(ctx: Ctx, amount: number, source: string, burnsArmor = false, attacker?: EnemyState) {
  const hero = ctx.run.hero;
  // Dev god mode: nothing gets through.
  let left = ctx.run.dev?.god ? 0 : Math.max(0, Math.round(amount));
  if (hero.ward > 0 && left > 0) {
    left = Math.max(0, left - hero.ward);
    hero.ward = 0;
  }
  if (attacker && hero.reflect > 0 && amount > 0) {
    const back = Math.round(amount * hero.reflect * actScale(ctx.run).hp);
    hero.reflect = 0;
    if (back > 0) {
      ctx.fx.push({ kind: 'proc', amount: back, uid: attacker.uid, source: 'reflect', text: `Отражено ${back}` });
      hitEnemy(ctx, attacker.uid, back, { source: 'reflect', pierce: true });
    }
  }
  const armor = Math.min(hero.armor, left);
  hero.armor -= armor;
  // A blow burns the rest of the armour, unless the steel door keeps it for the end of the tick.
  if (burnsArmor && !ctx.mods.armorKeep) hero.armor = 0;
  left -= armor;
  const red = Math.min(hero.hp, left);
  hero.hp -= red;
  ctx.c.damageTaken += red;
  ctx.run.stats.damageTaken += red;
  if (hero.hp <= 0) {
    if (ctx.mods.flash && !hero.flashUsed) {
      hero.flashUsed = true;
      hero.hp = 1;
      ctx.fx.push({ kind: 'proc', amount: 0, source: 'flash', text: 'Резервная копия!' });
    } else {
      ctx.run.phase = 'dead';
      ctx.run.stats.deathCause = source;
    }
  }
  return { amount: Math.round(amount), armor, red };
}

function killEnemy(ctx: Ctx, e: EnemyState) {
  const { run, c } = ctx;
  ctx.fx.push({ kind: 'kill', amount: 0, uid: e.uid });
  run.stats.kills++;
  const def = ENEMIES[e.def];
  const coins = (def.coins ?? 0) + e.stolen;
  if (coins > 0) {
    const got = gainCoins(run, coins);
    if (got > 0) ctx.fx.push({ kind: 'coins', amount: got, uid: e.uid, source: 'loot' });
  }
  const split: EnemyState[] = [];
  if (def.splitInto) {
    for (let k = 0; k < 2 && alive(c).length < MAX_ENEMIES + 1; k++) {
      const child = makeEnemy(run, c, def.splitInto, ctx.mods);
      c.enemies.push(child);
      split.push(child);
    }
  }
  if (e.def === 'censor' || e.def === 'archivist' || e.def === 'secretary') {
    // Censorship ends with its author.
    if (!alive(c).some((x) => x.def === 'censor' || x.def === 'archivist' || x.def === 'secretary'))
      for (const t of c.board.cells) delete t.hidden;
  }
  ctx.pendingDeaths.push({ t: 'enemyDie', uid: e.uid, split: split.length ? split : undefined });
}

export function hitEnemy(ctx: Ctx, uid: number, raw: number, opts: { source: string; pierce?: boolean }): number {
  const e = ctx.c.enemies.find((x) => x.uid === uid && x.hp > 0);
  if (!e || raw <= 0) return 0;
  let dmg = Math.round(raw);
  if (!opts.pierce) dmg = Math.max(0, dmg - e.armor);
  let blocked = 0;
  if (e.block > 0 && !opts.pierce) {
    blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    dmg -= blocked;
  }
  const dealt = Math.min(e.hp, dmg);
  e.hp -= dmg;
  e.hitOnce = true;
  ctx.run.stats.damageDealt += dealt;
  ctx.fx.push({ kind: 'damage', amount: dmg, uid, blocked, source: opts.source });
  if (e.shining && e.hp > 0 && opts.source === 'strike' && dmg > 0) {
    // Every blow at a shining mirror costs the hero half its own blow (a heart in the boiler room):
    // a tax on striking while it shines, not a wall (a whole blow was two hearts, fights waited it out).
    const back = mirrorBack(e);
    const hurt = hurtHero(ctx, back, 'Отражение Кривого зеркала');
    ctx.fx.push({ kind: 'proc', amount: hurt.red, uid, source: 'mirror', text: `Отражение −${hurt.red}` });
  }
  if (e.hp <= 0) killEnemy(ctx, e);
  return dmg;
}

// ── Scoring ──────────────────────────────────────────────────────────

/** Half-hearts a blow at a shining mirror costs the hero: half of the mirror's own blow scale. */
export function mirrorBack(e: EnemyState): number {
  return Math.max(1, Math.round(e.dmgMul / 2));
}

/** Cascade waves that score: later waves still clear the board, but for nothing (endless chains ran away). */
export const SCORED_WAVES = 6;

/** The abacus holds at most this much damage bonus. */
export const BANK_MAX = 0.5;


/** The plain bonus items give every tile of a colour (the coffee, the binder clip, the cartridge). */
function famPlus(fam: Fam, mods: Mods): number {
  return fam === 'blade' ? mods.redPlus : fam === 'ink' ? mods.inkPlus : 0;
}

/**
 * One tile adds to the move's tally by the item held for its colour. Pure with respect to the board
 * and enemies: effects that change them are recorded in the move state and applied at the strike.
 * Per-group effects fire once per group (a blasted tile has no group and scores its plain value).
 */
export function scoreTile(ctx: Ctx, tile: Tile, i: number, g: Group | null, wave: number, scores: TileScore[], rep = 0) {
  if (tile.kind === 'junk') return;
  const { ms, mods, run } = ctx;
  const t = ms.tally;
  const fam: Fam = tile.kind === 'prism' ? (g?.fam ?? 'blade') : tile.kind;
  const gear = ctx.gear[fam];
  const value = gearValue(gear, run) + famPlus(fam, mods);
  const s: TileScore = { i, id: tile.id, fam };
  const add = (k: keyof Tally, n: number) => {
    if (!n) return;
    t[k] += n;
    s[k] = (s[k] ?? 0) + n;
  };
  ms.fams.add(fam);
  // Once per group (a group scored again by the carbon or the echo is a new time), or per move.
  const once = (tag: string, perMove = false) => {
    const key = perMove ? tag : `${tag}:${wave}:${g ? g.cells[0] : `b${i}`}:${rep}`;
    if (ms.flags.has(key)) return false;
    ms.flags.add(key);
    return true;
  };
  // Blasted tiles (no group) score their plain value; blue and yellow ones count in threes.
  if (!g) {
    if (fam === 'blade') add('dmg', value);
    else if (fam === 'shield') ms.blueBlasted++;
    else if (fam === 'ink') add('charge', value);
    else {
      ms.coinBlasted++;
      ms.findPts += 1 + (gear.strike.finds ?? 0);
    }
    if (fam === 'blade') ms.redTiles++;
    scores.push(s);
    return;
  }
  const st = gear.strike;
  const su = ms.superGroup ? gear.super : null;
  switch (fam) {
    case 'blade': {
      // The weapon: damage per tile (in cascades its own), to all enemies, and its group effects.
      add('dmg', wave >= 2 && st.cascadeTile ? st.cascadeTile + famPlus(fam, mods) : value);
      if (st.allPerTile) add('aoe', st.allPerTile);
      if (su?.perTile) add('dmg', su.perTile);
      if (su?.allPerTile) add('aoe', su.allPerTile);
      if (once('weapon')) {
        if (st.bleed) ms.bleed += st.bleed;
        if (st.pierce) ms.pierce = true;
        if (st.paper) ms.paperBonus = Math.max(ms.paperBonus, st.paper);
        if (st.delay && once('weaponDelay', true)) ms.delay += st.delay;
        if (su?.bleed) ms.bleed += su.bleed;
        if (su?.hpPct) ms.hpPct = Math.max(ms.hpPct, su.hpPct);
        if (su?.pierce) ms.pierce = true;
        if (su?.stun) ms.stun = true;
        if (su?.selfDmg) ms.selfDmg += su.selfDmg;
        if (su) s.note = 'супер-удар';
      }
      ms.redTiles++;
      break;
    }
    case 'shield': {
      // The shield blocks once per group (groupArmor); here what it does besides.
      if (st.cleanse) {
        ms.cleanse.push(i);
        if (st.cleanse === 'all') ms.cleansePins = true;
      }
      if (once('shield')) {
        const ward = su?.ward ?? st.ward;
        if (ward) ms.ward += ward;
        if (st.redBonus) ms.redBonus = Math.max(ms.redBonus, st.redBonus);
        if (st.armorX) ms.armorX = Math.max(ms.armorX, st.armorX);
        if (st.reflect) ms.reflect = REFLECT_PER_HALF;
        if (su?.heal) ms.heal += su.heal;
        if (su) s.note = 'супер-блок';
      }
      break;
    }
    case 'ink': {
      // The battery: energy per tile (the blot pays in damage to all instead).
      add('charge', value + (su?.energy ?? 0));
      if (st.aoe) add('aoe', st.aoe + (su?.aoe ?? 0));
      if (st.cleanse) {
        ms.cleanse.push(i);
        if (st.cleanse === 'all') ms.cleansePins = true;
      }
      if (st.delay && once('urgent', true)) ms.delay += st.delay;
      if (once('ink')) {
        if (st.copyNext) ms.copyNext += st.copyNext;
        if (st.stamp) ms.stamp += st.stamp + (su?.stamp ?? 0);
        if (su?.stun) ms.stun = true;
        if (su) s.note = 'супер-заряд';
      }
      break;
    }
    case 'coin': {
      // The coin: coins per group (and per tile for the receipt), damage for some, the abacus's savings;
      // every yellow tile fills the finds meter.
      if (mods.bankPer) ms.bank += mods.bankPer;
      ms.findPts += 1 + (st.finds ?? 0);
      if (st.coinsPerTile) add('coins', st.coinsPerTile);
      const paidKey = `paid:${wave}:${g.cells[0]}:${rep}`;
      if (once('coin')) {
        add('coins', value + (su?.coins ?? 0) + mods.coinPlus);
        if (st.afterFight) ms.bonusCoins += st.afterFight;
        // The credit card: the group pays for its damage, or does nothing.
        if (st.costPerGroup && run.hero.coins + t.coins >= st.costPerGroup) {
          ms.flags.add(paidKey);
          add('coins', -st.costPerGroup);
        }
        if (st.bonusPct && once('goldclip', true)) add('bonus', st.bonusPct);
        if (st.famDmg && once('report', true)) add('dmg', st.famDmg * ms.fams.size);
        if (su) s.note = 'супер-находка';
      }
      const paid = !st.costPerGroup || ms.flags.has(paidKey);
      if (st.dmgPerTile && paid) add('dmg', st.dmgPerTile + (su?.dmgPerTile ?? 0));
      break;
    }
  }
  if (fam === 'ink' && mods.inkDamage) add('dmg', mods.inkDamage);
  if (fam === 'coin' && mods.coinDamage) add('dmg', mods.coinDamage);
  if (rep > 0) s.note = 'дважды';
  scores.push(s);
}

/**
 * A blue group blocks once: the shield's value in half-hearts, its super adds (the laminator doubles
 * the group), plus the binder clip. Health is counted in half-hearts, so per-tile armour was a wall.
 */
export function groupArmor(ctx: Ctx, g: Group, cells: Tile[], scores: TileScore[]) {
  const gear = ctx.gear.shield;
  const su = ctx.ms.superGroup ? gear.super : null;
  let n = gearValue(gear, ctx.run) + (su?.block ?? 0) + ctx.mods.bluePlus;
  if (su?.groupX) n *= su.groupX;
  const at = g.cells[0];
  ctx.ms.tally.armor += n;
  const s = [...scores].reverse().find((x) => x.i === at);
  if (s) s.armor = (s.armor ?? 0) + n;
  else scores.push({ i: at, id: cells[at].id, fam: 'shield', armor: n });
}

/**
 * A group works as its colour's super: 4+ tiles, a stamped tile in it, or the red pen's first red
 * group of the move.
 */
function isSuper(ctx: Ctx, g: Group, cells: Tile[], wave: number): boolean {
  if (g.size >= 4 || g.cells.some((i) => cells[i]?.seal)) return true;
  if (ctx.ms.charged && wave === 1) return true;
  if (g.fam === 'blade' && ctx.mods.redPenFirst && !ctx.ms.flags.has('redpen')) {
    ctx.ms.flags.add('redpen');
    return true;
  }
  return false;
}

function scoreGroup(ctx: Ctx, g: Group, cells: Tile[], wave: number, scores: TileScore[]) {
  const { ms, mods, c } = ctx;
  if (g.fam === 'blade') ms.redGroups++;
  ms.superGroup = isSuper(ctx, g, cells, wave);
  // The alarm button: damage for every red group of the move.
  if (g.fam === 'blade' && mods.redGroupDmg) {
    ms.tally.dmg += mods.redGroupDmg;
    scores.push({ i: g.cells[0], id: -1, fam: 'blade', dmg: mods.redGroupDmg, note: 'Тревожная кнопка' });
  }
  let reps = 1;
  if (ms.double && wave === 1) reps++;
  if (ms.copyNext > 0) {
    reps++;
    ms.copyNext--;
  }
  if (mods.echo && !ms.echoUsed) {
    reps++;
    ms.echoUsed = true;
  }
  for (let r = 0; r < reps; r++) {
    for (const i of g.cells) scoreTile(ctx, cells[i], i, g, wave, scores, r);
    if (g.fam === 'shield') groupArmor(ctx, g, cells, scores);
    // The quill: damage when the group's energy fills the meter (counted after all its tiles).
    const quill = g.fam === 'ink' ? ctx.gear.ink.strike.quill : 0;
    const cap = quill ? energyCap(ctx.run) : 0;
    if (quill && cap > 0 && ctx.run.hero.charge + ms.tally.charge >= cap) {
      ms.tally.dmg += quill;
      scores.push({ i: g.cells[0], id: -1, fam: 'ink', dmg: quill, note: 'Перо' });
    }
  }
  ms.famGroups[g.fam]++;
  if (g.fam === 'blade' && mods.bleedOnRed) ms.bleed += mods.bleedOnRed;
  // Group damage bonuses, shown on the tally at the group.
  if (g.size >= 5 && mods.bigGroupBonus) {
    ms.tally.bonus += mods.bigGroupBonus;
    scores.push({ i: g.cells[0], id: -1, fam: g.fam, bonus: mods.bigGroupBonus, note: 'Брошюровщик' });
  }
  if (g.size >= 4) {
    if (mods.igniteOn4) ms.burn = true;
    if (g.fam === 'blade' && mods.planeOn4) ms.plane += mods.planeOn4;
    if (g.fam === 'shield' && mods.freezeOn4Shields) ms.freeze = true;
  }
  if (g.fam === 'shield' && c.board.flood > 0 && g.cells.some((i) => rowOf(c.board, i) >= c.board.h - c.board.flood)) ms.floodDown++;
}

function mostCommonFam(cells: Tile[]): Fam {
  let best: Fam = 'blade';
  let count = -1;
  for (const f of FAMS) {
    const n = cells.filter((t) => t.kind === f).length;
    if (n > count) {
      best = f;
      count = n;
    }
  }
  return best;
}

const rowCells = (d: Dims, i: number) => Array.from({ length: d.w }, (_, k) => idx(d, rowOf(d, i), k));
const colCells = (d: Dims, i: number) => Array.from({ length: d.h }, (_, k) => idx(d, k, colOf(d, i)));
const uniq = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);

/** Cells a rocket or a bomb clears from cell i. */
function specialArea(d: Dims, t: Tile, i: number, mods: Mods): number[] {
  if (t.special === 'rocketH') return uniq(mods.crossRockets ? [...rowCells(d, i), ...colCells(d, i)] : rowCells(d, i));
  if (t.special === 'rocketV') return uniq(mods.crossRockets ? [...colCells(d, i), ...rowCells(d, i)] : colCells(d, i));
  return area(d, i, mods.bombRadius);
}

/**
 * What a swap sets off by itself (on the board after the swap). A lone special fires where it
 * lands; a prism wipes the family it was swapped with; two specials swapped together combine.
 * `spent` are the swapped specials, already used up by this blast.
 */
export function swapBlast(d: Dims, cells: Tile[], m: Move, mods: Mods, kind: 'swap' | 'slide' = 'swap'): { blast: Blast; spent: number[] } | null {
  if (kind === 'slide') {
    // A slide carries one tile: a special fires where it lands, a prism wipes the commonest family.
    const t = cells[m.to];
    if (!isSpecialTile(t)) return null;
    if (t.kind === 'prism') {
      const fam = mostCommonFam(cells);
      return { blast: { kind: 'prism', at: m.to, cells: uniq([...cells.map((x, k) => (x.kind === fam ? k : -1)).filter((k) => k >= 0), m.to]) }, spent: [m.to] };
    }
    return { blast: { kind: t.special!, at: m.to, cells: specialArea(d, t, m.to, mods) }, spent: [m.to] };
  }
  const a = cells[m.to];
  const b = cells[m.from];
  const sa = isSpecialTile(a);
  const sb = isSpecialTile(b);
  if (!sa && !sb) return null;
  const at = m.to;
  const all = cells.map((_, k) => k);
  const famCells = (fam: TileKind) => all.filter((k) => cells[k].kind === fam);
  if (sa && sb) {
    const spent = [m.to, m.from];
    if (a.kind === 'prism' && b.kind === 'prism') return { blast: { kind: 'nova', at, cells: all }, spent };
    if (a.kind === 'prism' || b.kind === 'prism') {
      const [other, otherAt] = a.kind === 'prism' ? [b, m.from] : [a, m.to];
      return { blast: { kind: 'prism', at, cells: uniq([...famCells(other.kind), ...specialArea(d, other, otherAt, mods), m.to, m.from]) }, spent };
    }
    const rocketA = a.special === 'rocketH' || a.special === 'rocketV';
    const rocketB = b.special === 'rocketH' || b.special === 'rocketV';
    if (rocketA && rocketB) return { blast: { kind: 'cross', at, cells: uniq([...rowCells(d, at), ...colCells(d, at)]) }, spent };
    if (rocketA || rocketB) {
      const wide: number[] = [];
      for (const k of [-1, 0, 1]) {
        const r = rowOf(d, at) + k;
        const c = colOf(d, at) + k;
        if (r >= 0 && r < d.h) wide.push(...rowCells(d, idx(d, r, 0)));
        if (c >= 0 && c < d.w) wide.push(...colCells(d, idx(d, 0, c)));
      }
      return { blast: { kind: 'bigCross', at, cells: uniq(wide) }, spent };
    }
    return { blast: { kind: 'bigBomb', at, cells: area(d, at, mods.bombRadius + 1) }, spent };
  }
  const i = sa ? m.to : m.from;
  const t = cells[i];
  if (t.kind === 'prism') {
    const partner = cells[sa ? m.from : m.to];
    const fam = partner.kind === 'junk' || partner.kind === 'prism' ? mostCommonFam(cells) : partner.kind;
    return { blast: { kind: 'prism', at: i, cells: uniq([...famCells(fam), i]) }, spent: [i] };
  }
  return { blast: { kind: t.special!, at: i, cells: specialArea(d, t, i, mods) }, spent: [i] };
}

function blastArea(ctx: Ctx, i: number, t: Tile, fam: Fam | undefined, cells: Tile[]): { kind: Blast['kind']; cells: number[] } {
  if (t.kind === 'prism') {
    const f = fam ?? mostCommonFam(cells);
    return { kind: 'prism', cells: cells.map((x, k) => (x.kind === f || k === i ? k : -1)).filter((k) => k >= 0) };
  }
  if (t.special === 'rocketH' || t.special === 'rocketV') return { kind: t.special, cells: specialArea(ctx.c.board, t, i, ctx.mods) };
  return { kind: 'bomb', cells: area(ctx.c.board, i, ctx.mods.bombRadius) };
}

/**
 * Groups in the order they score: with the carbon copy held, violet groups go first, so «the next
 * group of the move» is really the next one, whatever its colour.
 */
export function scoringOrder(groups: Group[], gear: Record<Fam, GearDef>): Group[] {
  if (!gear.ink.strike.copyNext) return groups;
  const first = (g: Group) => (g.fam === 'ink' ? 1 : 0);
  return [...groups].sort((a, b) => first(b) - first(a));
}

/**
 * Resolve matches and cascades until the board is stable, scoring every wave into the move's
 * tally. `forced` is an initial blast (pocket bomb, shredder, a swapped special) that happens with
 * the first wave; `spent` are specials that blast already used up. With `score` off (board tools:
 * the eraser, the corrector) lines that fall into place clear without scoring: tools are not moves.
 */
export function resolve(ctx: Ctx, prefer: number[], forced?: Blast, spent: number[] = [], score: boolean | 'first' = true) {
  const { c, mods, ms } = ctx;
  let first = true;
  for (let wave = 1; wave <= 30; wave++) {
    const cells = c.board.cells;
    const groups: Group[] = findGroups(c.board, cells, mods.wrap, first ? prefer : []);
    if (!groups.length && !forced) break;
    ctx.wave = wave;
    // 'first': only the forced blast scores, what falls into place after it clears for nothing.
    const scoring = score === 'first' ? wave === 1 : score && wave <= SCORED_WAVES;
    const waveFx: Effect[] = [];
    ctx.fx = waveFx;
    const scores: TileScore[] = [];
    const matched = new Set<number>();
    for (const g of groups) for (const i of g.cells) matched.add(i);

    // Specials activated by this wave (matched specials, forced blasts, chains).
    const blasts: Blast[] = [];
    const blasted = new Set<number>();
    const activated = new Set<number>(forced ? spent : []);
    const queue: { i: number; fam?: Fam }[] = [];
    if (forced) {
      blasts.push(forced);
      for (const i of forced.cells) {
        if (!matched.has(i)) blasted.add(i);
        if (cells[i].special || cells[i].kind === 'prism') queue.push({ i });
      }
    }
    for (const g of groups)
      for (const i of g.cells) if (cells[i].special || cells[i].kind === 'prism') queue.push({ i, fam: g.fam });
    while (queue.length) {
      const { i, fam } = queue.shift()!;
      if (activated.has(i)) continue;
      activated.add(i);
      const t = cells[i];
      const fromKind = t.kind === 'prism' || t.kind === 'junk' ? undefined : t.kind;
      const b = blastArea(ctx, i, t, fam ?? (t.kind === 'prism' ? undefined : fromKind), cells);
      blasts.push({ kind: b.kind, at: i, cells: b.cells });
      for (const k of b.cells) {
        if (!matched.has(k)) blasted.add(k);
        const u = cells[k];
        if ((u.special || u.kind === 'prism') && !activated.has(k)) {
          const f = u.kind === 'prism' || u.kind === 'junk' ? undefined : (u.kind as Fam);
          queue.push({ i: k, fam: f });
        }
      }
    }
    // Cascade waves already pay in tiles; the poster adds a damage bonus for each of them.
    if (scoring && wave >= 2 && mods.cascadeBonus) {
      const n = mods.cascadeBonus;
      ms.tally.bonus += n;
      scores.push({ i: -1, id: -1, fam: 'prism', bonus: n, note: `каскад, волна ${wave}` });
    }
    for (const b of blasts) {
      if (b.kind === 'rocketH' || b.kind === 'rocketV') ctx.rocketsThisMove++;
      if (b.kind === 'cross') ctx.rocketsThisMove += 2;
    }
    if (scoring && blasts.length && mods.igniteOn4) ms.burn = true;

    // Score: groups first, then blasted tiles one by one.
    if (scoring) {
      for (const g of scoringOrder(groups, ctx.gear)) scoreGroup(ctx, g, cells, wave, scores);
      ms.blueBlasted = 0;
      ms.coinBlasted = 0;
      for (const i of blasted) scoreTile(ctx, cells[i], i, null, wave, scores);
      // Blasted blue and yellow tiles work like a group: half a heart, a coin, for every three.
      const blue = Math.floor(ms.blueBlasted / 3);
      if (blue > 0) {
        ms.tally.armor += blue;
        scores.push({ i: -1, id: -1, fam: 'shield', armor: blue, note: 'синие во взрыве' });
      }
      const gold = Math.floor(ms.coinBlasted / 3);
      if (gold > 0) {
        ms.tally.coins += gold;
        scores.push({ i: -1, id: -1, fam: 'coin', coins: gold, note: 'жёлтые во взрыве' });
      }
    }

    // Junk next to a match is washed away.
    const splashed = new Set<number>();
    for (const i of matched)
      for (const n of neighbors(c.board, i)) if (!matched.has(n) && !blasted.has(n) && cells[n].kind === 'junk') splashed.add(n);
    for (const i of blasted) if (cells[i].kind === 'junk') ms.junkCleared++;
    ms.junkCleared += splashed.size;

    // Remove, create specials, drop.
    const cleared: { i: number; id: number; kind: TileKind; cause: 'match' | 'blast' | 'splash' }[] = [];
    const nextCells: (Tile | null)[] = cells.slice();
    for (const i of matched) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'match' });
      if (cells[i].find) ms.found.push(cells[i].find!);
      nextCells[i] = null;
    }
    for (const i of blasted) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'blast' });
      if (cells[i].find) ms.found.push(cells[i].find!);
      nextCells[i] = null;
    }
    for (const i of splashed) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'splash' });
      nextCells[i] = null;
    }
    const created: { at: number; tile: Tile }[] = [];
    for (const g of groups) {
      let make = g.make;
      if (!make || g.at < 0) continue;
      // The rainbow clip turns the first line of four of a move into a prism (chains of prisms ran away).
      if (mods.prismOn4 && (make === 'rocketH' || make === 'rocketV') && !ms.flags.has('prismpact')) {
        make = 'prism';
        ms.flags.add('prismpact');
      }
      if (created.some((x) => x.at === g.at)) continue;
      const tile = make === 'prism' ? makeTile(c.board, 'prism') : makeTile(c.board, g.fam, { special: make });
      nextCells[g.at] = tile;
      created.push({ at: g.at, tile: { ...tile } });
    }
    const { falls, spawns } = gravity(c.board, ctx.run.rng.board, nextCells);
    syncIds(ctx.run, c);
    ctx.ev.push({
      t: 'wave',
      n: wave,
      ...(scoring ? {} : { idle: true }),
      groups,
      blasts,
      cleared,
      created,
      scores,
      tally: { ...ms.tally },
      effects: waveFx,
      falls,
      spawns,
      board: snap(c.board.cells),
      queue: snapQueue(c),
      flood: c.board.flood,
    });
    ctx.run.stats.maxCombo = Math.max(ctx.run.stats.maxCombo, wave);
    forced = undefined;
    first = false;
  }
  ctx.wave = 0;
}

function flushDeaths(ctx: Ctx) {
  if (ctx.pendingDeaths.length) {
    ctx.ev.push(...ctx.pendingDeaths);
    ctx.pendingDeaths = [];
  }
}

function batch(ctx: Ctx, body: () => void) {
  const list: Effect[] = [];
  const prev = ctx.fx;
  ctx.fx = list;
  body();
  ctx.fx = prev;
  if (list.length) ctx.ev.push({ t: 'effects', effects: list });
  flushDeaths(ctx);
}

/**
 * The move's single strike: damage × mult at the target, the same mult on armor, then all
 * deferred effects (statuses, cleanup, copies). Also used by pocket bombs and actives.
 */
export function strike(ctx: Ctx, fromMove: boolean) {
  const { run, c, mods, ms } = ctx;
  const t = ms.tally;
  const hero = run.hero;
  const notes = ms.notes;
  // Flat damage from the move's groups: the calculator (gold), the desk lamp (violet), the drawer.
  if (mods.goldGroupDmg && ms.famGroups.coin) {
    t.dmg += mods.goldGroupDmg * ms.famGroups.coin;
    notes.push(`Калькулятор +${mods.goldGroupDmg * ms.famGroups.coin}`);
  }
  if (mods.inkGroupDmg && ms.famGroups.ink) {
    t.dmg += mods.inkGroupDmg * ms.famGroups.ink;
    notes.push(`Лампа +${mods.inkGroupDmg * ms.famGroups.ink}`);
  }
  if (ms.redBonus && ms.fams.has('blade') && ms.fams.has('shield')) {
    t.dmg += ms.redBonus;
    notes.push(`Картотека +${ms.redBonus}`);
  }
  // Ink beyond a full meter burns: it deals damage (with nothing to charge, all of it does).
  const spare = inkOverflow(run, t.charge);
  if (spare > 0) {
    t.dmg += spare;
    notes.push(`Лишняя энергия +${spare} урона`);
  }
  // Damage bonuses (no explicit multiplier): items give them for good, the move earns some.
  let bonus = t.bonus + mods.dmgBonus;
  if (mods.coinBonus && fromMove) {
    const k = Math.round(Math.floor(hero.coins / 10) * mods.coinBonus * 100) / 100;
    if (k > 0) {
      bonus += k;
      notes.push(`Сейф +${pct(k)}`);
    }
  }
  if (c.nextBonus && fromMove) {
    bonus += c.nextBonus;
    notes.push(`Шоколадка +${pct(c.nextBonus)}`);
    c.nextBonus = 0;
  }
  if (fromMove) {
    // The abacus: gold tiles put a bonus aside; the next strike that deals damage takes it.
    const saved = c.bank ?? 0;
    if (saved && t.dmg > 0) {
      bonus += saved;
      notes.push(`Счёты +${pct(saved)}`);
      c.bank = 0;
    }
    if (ms.bank) {
      c.bank = Math.min(BANK_MAX, (c.bank ?? 0) + ms.bank);
      notes.push(`Счёты: отложено +${pct(c.bank)}`);
    }
    // The hot key: the move after a skill strikes harder.
    if (c.skillBonus) {
      bonus += c.skillBonus;
      notes.push(`Горячая клавиша +${pct(c.skillBonus)}`);
      c.skillBonus = 0;
    }
    if (mods.firstStrikeBonus && c.moves === 1) {
      bonus += mods.firstStrikeBonus;
      notes.push(`Кофемашина +${pct(mods.firstStrikeBonus)}`);
    }
  }
  if (mods.chaos) {
    const k = Math.round((-0.5 + next(run.rng.fx) * 1.5) * 10) / 10;
    bonus += k;
    notes.push(`Калькулятор ${k >= 0 ? '+' : '−'}${pct(Math.abs(k))}`);
  }
  let target = targetEnemy(c);
  if (target?.submerged) {
    const other = alive(c).find((e) => !e.submerged);
    if (other) target = other;
  }
  // Bonuses against the target: the weapon on paper, the timesheet on a first hit.
  let aimed = bonus;
  if (target && ms.paperBonus && ENEMIES[target.def].material === 'paper') {
    aimed += ms.paperBonus;
    notes.push(`Бумага +${pct(ms.paperBonus)}`);
  }
  if (target && mods.firstHitBonus && !target.hitOnce) {
    aimed += mods.firstHitBonus;
    notes.push(`Табель +${pct(mods.firstHitBonus)}`);
  }
  const crit = mods.luck && chance(run.rng.fx, mods.luck) ? 2 : 1;
  if (crit > 1) notes.push('Удача: удар вдвое');
  let damage = Math.round(t.dmg * Math.max(0, 1 + aimed)) * crit;
  // Armour is not boosted: it stays on the scale of enemy blows and the hero's hearts.
  const raw = Math.max(0, Math.round(t.armor * ms.armorX));
  // The double-sided tape: armour counts in half-hearts, damage in points.
  if (mods.armorToDamage && raw > 0) damage += raw * REFLECT_PER_HALF;
  const armor = Math.min(raw, armorRoom(run));
  if (armor < raw) notes.push(`Броня: не больше ${heartsText(armorCap(run))}`);
  const scale = actScale(run);
  let aoe = Math.max(0, Math.round(t.aoe * Math.max(0, 1 + bonus))) * crit + Math.round(ms.plane * scale.hp);
  const tune = run.dev?.heroDmg;
  if (tune && tune !== 1) {
    damage = Math.round(damage * tune);
    aoe = Math.round(aoe * tune);
    // Dev cheat: named first, so the strike's result never passes for the real math.
    notes.unshift(`Чит ×${String(tune).replace('.', ',')}`);
  }
  const submerged = target?.submerged;
  ctx.ev.push({ t: 'strike', tally: { ...t, bonus: aimed }, damage, aoe, armor, target: target?.uid ?? -1, notes: [...notes] });
  run.stats.maxHit = Math.max(run.stats.maxHit, damage);
  run.stats.maxMult = Math.max(run.stats.maxMult, Math.round((1 + aimed) * 10) / 10);
  batch(ctx, () => {
    hero.armor += armor;
    if (ms.junkCleared && mods.mopJunk) gainArmor(run, mopArmor(ms.junkCleared, mods, scale.dmg));
    const coins = Math.round(t.coins);
    if (coins > 0) gainCoins(run, coins);
    else if (coins < 0) loseCoins(run, -coins);
    hero.finds = Math.min(FIND_METER, (hero.finds ?? 0) + ms.findPts);
    ms.findPts = 0;
    c.bonusCoins += ms.bonusCoins;
    hero.charge = run.dev?.ink ? energyCap(run) : Math.min(energyCap(run), hero.charge + Math.round(t.charge));
    if (target && damage > 0) {
      if (submerged) ctx.fx.push({ kind: 'damage', amount: 0, uid: target.uid, source: 'strike', text: 'Под водой' });
      else hitEnemy(ctx, target.uid, damage, { source: 'strike', pierce: ms.pierce || mods.pierce });
    }
    if (aoe > 0) for (const e of alive(c)) hitEnemy(ctx, e.uid, aoe, { source: 'aoe', pierce: true });
    const tgt = targetEnemy(c);
    // The guillotine: a share of the target's maximum health, through armour and shields.
    if (tgt && ms.hpPct && !tgt.submerged) {
      const cut = Math.max(1, Math.round(tgt.maxHp * ms.hpPct));
      ctx.fx.push({ kind: 'proc', amount: cut, uid: tgt.uid, source: 'guillotine', text: 'Гильотина!' });
      hitEnemy(ctx, tgt.uid, cut, { source: 'guillotine', pierce: true });
    }
    if (tgt && tgt.hp > 0) {
      if (ms.bleed) {
        tgt.bleed += ms.bleed;
        ctx.fx.push({ kind: 'status', amount: tgt.bleed, uid: tgt.uid, status: 'bleed' });
      }
      if (ms.burn) {
        tgt.burn = Math.max(tgt.burn, Math.round(4 * scale.hp));
        tgt.burnTurns = Math.max(tgt.burnTurns, 3);
        ctx.fx.push({ kind: 'status', amount: 3, uid: tgt.uid, status: 'burn' });
      }
      if (ms.stun && !tgt.stunImmune && !tgt.stunned) {
        tgt.stunned = true;
        ctx.fx.push({ kind: 'status', amount: 1, uid: tgt.uid, status: 'stun' });
      }
      if (ms.delay) {
        const k = holdBack(tgt, ms.delay);
        if (k) ctx.fx.push({ kind: 'status', amount: k, uid: tgt.uid, status: 'freeze' });
      }
    }
    if (ms.freeze)
      for (const e of alive(c)) {
        const k = holdBack(e, 1);
        if (k) ctx.fx.push({ kind: 'status', amount: k, uid: e.uid, status: 'freeze' });
      }
    // A reflected blow may have killed the hero already: the dead are not healed.
    if (ms.heal && !isDead(run)) {
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + ms.heal);
      if (hero.hp > before) ctx.fx.push({ kind: 'heal', amount: hero.hp - before });
    }
    if (ms.selfDmg && !isDead(run)) hurtHero(ctx, ms.selfDmg, 'Шило');
    // The umbrella softens the next blow; umbrellas of several moves do not stack into a wall.
    hero.ward = Math.max(hero.ward, ms.ward);
    if (ms.reflect) hero.reflect = Math.max(hero.reflect, ms.reflect);
  });
  // Board after-effects.
  let boardChanged = false;
  const cells = c.board.cells;
  if (ms.cleanse.length) {
    let washed = 0;
    for (const i of ms.cleanse)
      for (const n of [i, ...neighbors(c.board, i)]) {
        const u = cells[n];
        if (!u) continue;
        if (u.kind === 'junk') {
          cells[n] = drawTile(c.board, run.rng.board);
          washed++;
          boardChanged = true;
        } else if (ms.cleansePins && (u.pin || u.fuse)) {
          delete u.pin;
          delete u.fuse;
          boardChanged = true;
        }
      }
    if (washed && mods.mopJunk) gainArmor(run, mopArmor(washed, mods, actScale(run).dmg));
  }
  if (ms.stamp) {
    // The copy stamp: plain tiles of other colours turn red (the weapon).
    for (const i of randomCells(run.rng.fx, cells, ms.stamp, (u) => !u.special && u.kind !== 'prism' && u.kind !== 'junk' && u.kind !== 'blade' && !u.pin && !u.find))
      cells[i] = { ...cells[i], kind: 'blade' };
    boardChanged = true;
  }
  if (ms.floodDown) {
    c.board.flood = Math.max(0, c.board.flood - ms.floodDown);
    ctx.ev.push({ t: 'effects', effects: [{ kind: 'proc', amount: 0, source: 'tide', text: 'Вода отступает' }] });
    boardChanged = true;
  }
  if (boardChanged) {
    syncIds(run, c);
    ctx.ev.push({ t: 'board', reason: 'active', board: snap(cells) });
  }
}

// ── Time ─────────────────────────────────────────────────────────────

function phaseCheck(ctx: Ctx) {
  for (const e of alive(ctx.c)) {
    const def = ENEMIES[e.def];
    if (!def.phases) continue;
    let target = 0;
    def.phases.forEach((p, k) => {
      if (e.hp <= p.at * e.maxHp) target = k + 1;
    });
    if (target > e.phase) {
      e.phase = target;
      e.cycle = 0;
      e.countdown = currentIntent(e).timer + ctx.mods.timerBonus;
      e.shining = false;
      ctx.ev.push({ t: 'phase', uid: e.uid, phase: target });
    }
  }
}

function moveEnd(ctx: Ctx) {
  const { c, mods, run } = ctx;
  batch(ctx, () => {
    for (const e of alive(c)) {
      if (e.bleed > 0) {
        hitEnemy(ctx, e.uid, e.bleed * actScale(run).hp, { source: 'bleed', pierce: true });
        e.bleed = Math.max(0, e.bleed - 1);
      }
      if (e.hp > 0 && e.burnTurns > 0) {
        hitEnemy(ctx, e.uid, e.burn, { source: 'burn', pierce: true });
        e.burnTurns--;
      }
    }
    if (mods.spider > 0) {
      const weakest = alive(c).sort((a, b) => a.hp - b.hp)[0];
      if (weakest) hitEnemy(ctx, weakest.uid, mods.spider * actScale(run).hp, { source: 'spider', pierce: true });
    }
    if (mods.energyPerMove > 0 && energyCap(run) > 0) {
      const before = run.hero.charge;
      run.hero.charge = Math.min(energyCap(run), run.hero.charge + mods.energyPerMove);
      if (run.hero.charge > before) ctx.fx.push({ kind: 'charge', amount: run.hero.charge - before, source: 'powerbank' });
    }
  });
  if (mods.garlandEvery > 0 && alive(c).length) {
    c.garland++;
    if (c.garland % mods.garlandEvery === 0) {
      const [i] = randomCells(run.rng.fx, c.board.cells, 1, (t) => !t.special && t.kind !== 'prism' && t.kind !== 'junk');
      if (i !== undefined) {
        c.board.cells[i].special = 'bomb';
        ctx.ev.push({ t: 'board', reason: 'active', board: snap(c.board.cells) });
        ctx.ev.push({ t: 'effects', effects: [{ kind: 'proc', amount: 0, source: 'garland', text: 'Гирлянда!', from: [i] }] });
      }
    }
  }
  phaseCheck(ctx);
}

function advanceCycle(ctx: Ctx, e: EnemyState) {
  e.cycle++;
  e.countdown = currentIntent(e).timer + ctx.mods.timerBonus;
  e.held = 0;
}

/** Tiles an enemy may spoil: plain ones without a find. */
const spoilable = (t: Tile) => !t.special && t.kind !== 'prism' && t.kind !== 'junk' && !t.pin && !t.fuse && !t.find;

function enemyAct(ctx: Ctx, e: EnemyState) {
  const { c, run, mods } = ctx;
  const intent = currentIntent(e);
  e.block = 0;
  e.submerged = false;
  e.shining = false;
  if (e.stunned) {
    e.stunned = false;
    e.stunImmune = true;
    ctx.ev.push({ t: 'enemyAct', uid: e.uid, intent, skipped: true });
    advanceCycle(ctx, e);
    return;
  }
  e.stunImmune = false;
  const cells = c.board.cells;
  const act: Extract<GameEvent, { t: 'enemyAct' }> = { t: 'enemyAct', uid: e.uid, intent };
  const attack = (dmg: number) => {
    const prev = ctx.fx;
    const list: Effect[] = [];
    ctx.fx = list;
    // The guard's vest: the first blow of the fight lands at half strength (a whole blow blocked was
    // worth a heart or two every fight).
    let blowDmg = dmg;
    if (ctx.mods.firstBlowGuard && !c.guarded && dmg > 0) {
      c.guarded = true;
      const cut = Math.ceil(dmg / 2);
      blowDmg = dmg - cut;
      ctx.fx.push({ kind: 'proc', amount: cut, source: 'vest', text: `Жилет: −${heartText(cut)}` });
    }
    act.hurt = hurtHero(ctx, blowDmg, ENEMIES[e.def].name, true, e);
    ctx.fx = prev;
    ctx.ev.push(act);
    if (list.length) ctx.ev.push({ t: 'effects', effects: list });
    flushDeaths(ctx);
    if (mods.cactus > 0 && !isDead(run) && e.hp > 0) batch(ctx, () => hitEnemy(ctx, e.uid, mods.cactus * actScale(run).hp, { source: 'cactus', pierce: true }));
  };
  const blow = (v: number) => Math.round(v * e.dmgMul) + overtimeBonus(c);
  switch (intent.kind) {
    case 'attack':
    case 'heavy':
      attack(blow(intent.value));
      break;
    case 'strike': {
      const pinned = randomCells(run.rng.ai, cells, 1, (t) => t.kind !== 'junk' && !t.pin);
      for (const i of pinned) cells[i].pin = true;
      act.cells = pinned;
      act.board = snap(cells);
      attack(blow(intent.value));
      break;
    }
    case 'block':
      // Shields and heals are about enemy health: they grow with it.
      e.block = Math.round(intent.value * actScale(run).hp);
      act.block = e.block;
      ctx.ev.push(act);
      break;
    case 'heal': {
      const hurt = alive(c)
        .filter((x) => x.hp < x.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const amount = Math.min(Math.round(intent.value * actScale(run).hp), hurt.maxHp - hurt.hp);
        hurt.hp += amount;
        act.healed = { uid: hurt.uid, amount };
      }
      ctx.ev.push(act);
      break;
    }
    case 'summon': {
      const summoned: EnemyState[] = [];
      for (let k = 0; k < intent.value && alive(c).length < MAX_ENEMIES; k++) {
        const s = makeEnemy(run, c, intent.summon ?? 'rat', mods);
        c.enemies.push(s);
        summoned.push(s);
      }
      act.summoned = summoned;
      ctx.ev.push(act);
      break;
    }
    case 'ink': {
      const chosen = randomCells(run.rng.ai, cells, intent.value, spoilable);
      for (const i of chosen) cells[i] = { id: cells[i].id, kind: 'junk' };
      act.cells = chosen;
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    }
    case 'tape': {
      // Red tape: board tiles turn into useless paperwork, and one more slips into the bag.
      const chosen = randomCells(run.rng.ai, cells, intent.value, spoilable);
      for (const i of chosen) cells[i] = { id: cells[i].id, kind: 'junk', tape: true };
      c.board.source.push({ kind: 'junk', tape: true });
      c.board.bag.splice(Math.floor(next(run.rng.ai) * (c.board.bag.length + 1)), 0, { kind: 'junk', tape: true });
      act.cells = chosen;
      act.board = snap(cells);
      act.added = 1;
      ctx.ev.push(act);
      break;
    }
    case 'hurry': {
      for (const o of alive(c)) if (o.uid !== e.uid) o.countdown = Math.max(1, o.countdown - 1);
      ctx.ev.push(act);
      break;
    }
    case 'pin': {
      const chosen = randomCells(run.rng.ai, cells, intent.value, (t) => t.kind !== 'junk' && !t.pin && !t.find);
      for (const i of chosen) cells[i].pin = true;
      act.cells = chosen;
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    }
    case 'ember': {
      const chosen = randomCells(run.rng.ai, cells, intent.value, spoilable);
      for (const i of chosen) cells[i].fuse = 3;
      act.cells = chosen;
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    }
    case 'censor': {
      if (!mods.censorImmune) {
        const chosen = randomCells(run.rng.ai, cells, intent.value, (t) => !t.hidden && !t.find);
        for (const i of chosen) cells[i].hidden = 4;
        act.cells = chosen;
        act.board = snap(cells);
      } else act.skipped = true;
      ctx.ev.push(act);
      break;
    }
    case 'stealCharge': {
      const stolen = Math.min(run.hero.charge, intent.value);
      run.hero.charge -= stolen;
      act.stolen = stolen;
      ctx.ev.push(act);
      break;
    }
    case 'stealCoins': {
      const stolen = Math.min(run.hero.coins, Math.round(intent.value * e.dmgMul));
      run.hero.coins -= stolen;
      e.stolen += stolen;
      act.stolen = stolen;
      ctx.ev.push(act);
      break;
    }
    case 'pinch': {
      const b = c.board;
      const rows = Array.from({ length: b.h }, (_, r) => r).filter((r) => lineFree(b, 'row', r));
      const options: LineShift[] = [];
      for (const r of rows)
        for (const d of [1, b.w - 1]) {
          const m: LineShift = { line: 'row', index: r, delta: d };
          if (!findGroups(b, shiftCells(b, cells, m), mods.wrap).length) options.push(m);
        }
      if (options.length) {
        const m = pick(run.rng.ai, options);
        b.cells = shiftCells(b, cells, m);
        act.cells = lineCells(b, m.line, m.index);
        act.board = snap(c.board.cells);
        ctx.ev.push(act);
      } else attack(blow(4));
      break;
    }
    case 'tide':
      c.board.flood = Math.min(3, c.board.flood + intent.value);
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    case 'submerge':
      e.submerged = true;
      ctx.ev.push(act);
      break;
    case 'shine':
      e.shining = true;
      ctx.ev.push(act);
      break;
    case 'anchor': {
      const cols = Array.from({ length: c.board.w }, (_, k) => k).filter((k) => c.board.colLock[k] === 0);
      if (cols.length) {
        const col = pick(run.rng.ai, cols);
        c.board.colLock[col] = 3;
        act.cells = lineCells(c.board, 'col', col);
      }
      ctx.ev.push(act);
      break;
    }
    case 'erase': {
      const specials = cells.map((t, i) => (t.special || t.kind === 'prism' ? i : -1)).filter((i) => i >= 0);
      if (specials.length) {
        const i = pick(run.rng.ai, specials);
        const t = cells[i];
        cells[i] = t.kind === 'prism' ? drawTile(c.board, run.rng.ai) : { ...t, special: undefined };
        delete cells[i].special;
        act.cells = [i];
        act.board = snap(cells);
        ctx.ev.push(act);
      } else attack(blow(4));
      break;
    }
  }
  if (e.hp > 0) {
    if (intent.kind === 'submerge') e.submerged = true;
    if (intent.kind === 'shine') e.shining = true;
  }
  advanceCycle(ctx, e);
  if (e.submerged) e.dive = e.countdown;
  else delete e.dive;
}

function boardTimers(ctx: Ctx) {
  const { c, mods } = ctx;
  const cells = c.board.cells;
  const burnt: number[] = [];
  let changed = false;
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i];
    if (t.hidden) {
      changed = true;
      t.hidden -= 1;
      if (t.hidden <= 0) delete t.hidden;
    }
    if (t.fuse) {
      changed = true;
      t.fuse -= 1;
      if (t.fuse <= 0) {
        burnt.push(i);
        cells[i] = { id: t.id, kind: 'junk' };
      }
    }
  }
  for (let k = 0; k < c.board.w; k++)
    if (c.board.colLock[k] > 0) {
      c.board.colLock[k]--;
      changed = true;
    }
  for (let k = 0; k < c.board.h; k++)
    if (c.board.rowLock[k] > 0) {
      c.board.rowLock[k]--;
      changed = true;
    }
  if (burnt.length) {
    const prev = ctx.fx;
    ctx.fx = [];
    const dmg = Math.round(burnt.length * ACTS[Math.min(ctx.run.act, ACTS.length - 1)].dmgMul);
    const hurt = mods.emberImmune ? { amount: 0, armor: 0, red: 0 } : hurtHero(ctx, dmg, 'Уголёк');
    const list = ctx.fx;
    ctx.fx = prev;
    ctx.ev.push({ t: 'ember', cells: burnt, hurt });
    if (list.length) ctx.ev.push({ t: 'effects', effects: list });
  }
  if (changed) ctx.ev.push({ t: 'board', reason: 'timers', board: snap(cells) });
}

function advanceTime(ctx: Ctx) {
  const { c, mods } = ctx;
  if (!alive(c).length) return;
  let skip: string | null = null;
  if (ctx.ms.rush) skip = 'Вне очереди: враги ждут';
  else if (c.freeTicks > 0) {
    c.freeTicks--;
    skip = 'Кофе: враги ждут';
  } else if (mods.clockEvery > 0 && c.moves % mods.clockEvery === 0) skip = 'Часы остановились';
  if (skip) {
    ctx.ev.push({ t: 'effects', effects: [{ kind: 'proc', amount: 0, source: 'time', text: skip }] });
    return;
  }
  c.ticks++;
  // Dev freeze: the enemies' timers stand still.
  if (!ctx.run.dev?.freeze) for (const e of alive(c)) e.countdown -= 1;
  // A dive lasts as long as it was meant to: pushing the timer back (urgent stamps, ice, the
  // megaphone) must not keep an enemy out of reach for ever.
  for (const e of alive(c))
    if (e.submerged && e.dive !== undefined && --e.dive <= 0) {
      e.submerged = false;
      delete e.dive;
    }
  ctx.ev.push({ t: 'tick', timers: alive(c).map((e) => ({ uid: e.uid, countdown: e.countdown })) });
  boardTimers(ctx);
  if (isDead(ctx.run)) return;
  for (const e of c.enemies) {
    if (e.hp <= 0 || e.countdown > 0) continue;
    enemyAct(ctx, e);
    flushDeaths(ctx);
    if (isDead(ctx.run)) return;
  }
  // Armour holds for one tick: it meets this tick's blows and burns out, so you defend right before
  // a blow, not in advance (the steel door keeps half).
  if (ctx.run.hero.armor > 0) {
    const kept = Math.round(ctx.run.hero.armor * mods.armorKeep);
    const lost = ctx.run.hero.armor - kept;
    ctx.run.hero.armor = kept;
    ctx.ev.push({ t: 'effects', effects: [{ kind: 'armor', amount: -lost, source: 'expire' }] });
  }
}

export function ensurePlayable(ctx: Ctx) {
  const { c, mods, run } = ctx;
  if (!alive(c).length) return;
  const rules = moveRules(run, mods);
  if (validMoves(c.board, rules).length === 0) {
    reshuffle(c.board, run.rng.board, rules);
    syncIds(run, c);
    ctx.ev.push({ t: 'board', reason: 'reshuffle', board: snap(c.board.cells), queue: snapQueue(c) });
  }
}

// ── Player actions ──────────────────────────────────────────────────

export function playerMove(run: RunState, mods: Mods, move: Move, ev: GameEvent[]): boolean {
  const c = run.combat!;
  const m: Move = { from: move.from, to: move.to };
  const rules = moveRules(run, mods);
  const block = moveBlock(c.board, m, rules);
  if (block || !isValidMove(c.board, m, rules)) {
    ev.push({ t: 'invalid', reason: block ?? 'Нет совпадения' });
    return false;
  }
  const ctx = newCtx(run, mods, ev);
  const kind = moveKind(c.board, m, rules)!;
  c.board.cells = applyMove(c.board, c.board.cells, m, kind);
  c.moves++;
  run.stats.moves++;
  // What energy readied goes into this move.
  const armed = c.armed ?? {};
  ctx.ms.charged = !!armed.charge;
  ctx.ms.double = !!armed.double;
  ctx.ms.rush = !!armed.rush;
  if (armed.charge) ctx.ms.notes.push('Заряд: все группы — супер');
  if (armed.double) ctx.ms.notes.push('Двойная запись');
  if (armed.rush) c.lastRush = c.moves;
  c.armed = undefined;
  ev.push({ t: 'swap', move: m, board: snap(c.board.cells), ...(kind === 'slide' ? { slide: true } : {}) });
  const set = swapBlast(c.board, c.board.cells, m, mods, kind);
  resolve(ctx, moveCells(m), set?.blast, set?.spent);
  run.stats.maxRocketsInMove = Math.max(run.stats.maxRocketsInMove, ctx.rocketsThisMove);
  strike(ctx, true);
  afterAction(ctx, true);
  return true;
}

/** Shared tail for moves, bombs and actives. */
export function afterAction(ctx: Ctx, spendsTime: boolean) {
  if (isDead(ctx.run)) return;
  takeFinds(ctx);
  if (alive(ctx.c).length) fitBoard(ctx);
  if (spendsTime) moveEnd(ctx);
  else phaseCheck(ctx);
  if (spendsTime && alive(ctx.c).length && !isDead(ctx.run)) advanceTime(ctx);
  syncIds(ctx.run, ctx.c);
  if (!isDead(ctx.run) && alive(ctx.c).length) fitBoard(ctx);
  if (!isDead(ctx.run) && alive(ctx.c).length) spawnFind(ctx);
  if (!isDead(ctx.run)) ensurePlayable(ctx);
}

// ── Finds ────────────────────────────────────────────────────────────

/** A plain tile a find can wait on (it keeps its colour: a group or a blast picks it up). */
const findable = (t: Tile) => FAMS.includes(t.kind as Fam) && !t.special && !t.pin && !t.hidden && !t.find && !t.fuse;

/** A find to put down: never a heart for a hero at full health. */
export function rollFind(run: RunState): FindKind {
  const full = run.hero.hp >= run.hero.maxHp;
  return weighted(
    run.rng.loot,
    FIND_KINDS.filter((k) => !(full && k === 'heart')).map((k) => [k, FINDS[k].weight] as [FindKind, number]),
  );
}

/** A full meter puts a find on the board (one at a time: the meter waits while one lies there). */
function spawnFind(ctx: Ctx) {
  const { run, c } = ctx;
  if ((run.hero.finds ?? 0) < FIND_METER || c.board.cells.some((t) => t.find)) return;
  const [i] = randomCells(run.rng.fx, c.board.cells, 1, findable);
  if (i === undefined) return;
  const find = rollFind(run);
  c.board.cells[i] = { ...c.board.cells[i], find };
  run.hero.finds = 0;
  run.stats.finds = (run.stats.finds ?? 0) + 1;
  ctx.ev.push({ t: 'findSpawn', cell: i, find });
}

/** What the move picked up pays at once. */
function takeFinds(ctx: Ctx) {
  const { run, ms } = ctx;
  const hero = run.hero;
  for (const find of ms.found) {
    run.stats.findsTaken = (run.stats.findsTaken ?? 0) + 1;
    let text = FINDS[find].name;
    switch (find) {
      case 'coins':
        text = `+${gainCoins(run, FIND_COINS)} монет`;
        break;
      case 'key':
        hero.keys = Math.min(9, hero.keys + 1);
        ctx.ev.push({ t: 'keys', amount: 1 });
        text = 'Ключ от сейфа';
        break;
      case 'heart': {
        const before = hero.hp;
        hero.hp = Math.min(hero.maxHp, hero.hp + 2);
        ctx.ev.push({ t: 'heal', amount: hero.hp - before });
        text = 'Сердце';
        break;
      }
      case 'battery': {
        const before = hero.charge;
        hero.charge = Math.min(energyCap(run), hero.charge + FIND_ENERGY);
        text = `+${hero.charge - before} энергии`;
        break;
      }
      case 'bomb': {
        const slot = hero.pockets.indexOf(null);
        if (slot >= 0) {
          hero.pockets[slot] = 'bomb';
          ctx.ev.push({ t: 'pocket', pocket: 'bomb' });
          text = 'Бомба в кармане';
        } else text = `Карманы полны: +${gainCoins(run, FIND_BOMB_COINS)} монеты`;
        break;
      }
    }
    ctx.ev.push({ t: 'found', find, text });
  }
  ms.found = [];
}

/** Junk a board tool cleared still pays the mop (the tool has no strike to pay it). */
function toolArmor(ctx: Ctx) {
  const { run, mods, ms } = ctx;
  if (!ms.junkCleared || !mods.mopJunk) return;
  const got = gainArmor(run, mopArmor(ms.junkCleared, mods, actScale(run).dmg));
  if (got > 0) ctx.ev.push({ t: 'effects', effects: [{ kind: 'armor', amount: got, source: 'mop' }] });
}

function removeCell(ctx: Ctx, i: number) {
  const { c, run, ev } = ctx;
  const cells = c.board.cells;
  const next: (Tile | null)[] = cells.slice();
  const removed = cells[i];
  if (removed.find) ctx.ms.found.push(removed.find);
  next[i] = null;
  const { falls, spawns } = gravity(c.board, run.rng.board, next);
  ev.push({
    t: 'wave',
    n: 0,
    groups: [],
    blasts: [{ kind: 'active', at: i, cells: [i] }],
    cleared: [{ i, id: removed.id, kind: removed.kind, cause: 'blast' }],
    created: [],
    scores: [],
    tally: newTally(),
    effects: [],
    falls,
    spawns,
    board: snap(c.board.cells),
    queue: snapQueue(c),
    flood: c.board.flood,
  });
  if (removed.kind === 'junk') ctx.ms.junkCleared++;
}

export function playerPocket(run: RunState, mods: Mods, slot: number, cell: number | undefined, ev: GameEvent[]): boolean {
  const id = run.hero.pockets[slot];
  const c = run.combat;
  const def = id ? POCKETS[id] : undefined;
  if (!def) {
    ev.push({ t: 'invalid', reason: 'Карман пуст' });
    return false;
  }
  if (!c && id !== 'coffee') {
    ev.push({ t: 'invalid', reason: 'Только в бою' });
    return false;
  }
  if (def.aim === 'cell' && (cell === undefined || cell < 0 || !c || cell >= c.board.cells.length)) {
    ev.push({ t: 'invalid', reason: 'Выбери клетку' });
    return false;
  }
  run.hero.pockets[slot] = null;
  ev.push({ t: 'pocketUsed', pocket: def.id });
  if (id === 'coffee') {
    const before = run.hero.hp;
    run.hero.hp = Math.min(run.hero.maxHp, run.hero.hp + 2);
    ev.push({ t: 'heal', amount: run.hero.hp - before });
    return true;
  }
  const ctx = newCtx(run, mods, ev);
  switch (id) {
    case 'bomb':
      resolve(ctx, [], { kind: 'bomb-item', at: cell!, cells: area(c!.board, cell!, mods.bombRadius) });
      strike(ctx, false);
      break;
    case 'eraser':
      // A board tool: what falls into place clears for nothing (a free move would break the clock).
      removeCell(ctx, cell!);
      resolve(ctx, [], undefined, [], false);
      toolArmor(ctx);
      break;
    case 'sticker':
      ev.push({
        t: 'effects',
        effects: alive(c!)
          .map((e) => ({ kind: 'status' as const, amount: holdBack(e, 2), uid: e.uid, status: 'freeze' as const }))
          .filter((f) => f.amount > 0),
      });
      break;
    case 'choco':
      c!.nextBonus += 1;
      ev.push({ t: 'effects', effects: [{ kind: 'proc', amount: 1, source: 'choco', text: 'Следующий ход: урон +100%' }] });
      break;
  }
  afterAction(ctx, false);
  return true;
}

export function playerActive(run: RunState, mods: Mods, arg: { cell?: number; col?: number; uid?: number }, ev: GameEvent[]): boolean {
  const hero = run.hero;
  const id = hero.active;
  const def = id ? ITEMS[id] : undefined;
  const c = run.combat;
  if (!def || !c) {
    ev.push({ t: 'invalid', reason: 'Сейчас нельзя' });
    return false;
  }
  const cost = activeCost(run);
  if (hero.charge < cost) {
    ev.push({ t: 'invalid', reason: 'Мало энергии' });
    return false;
  }
  const ctx = newCtx(run, mods, ev);
  const cells = c.board.cells;
  const needCell = def.aim === 'cell' && (arg.cell === undefined || arg.cell < 0 || arg.cell >= cells.length);
  const needCol = def.aim === 'col' && (arg.col === undefined || arg.col < 0 || arg.col >= c.board.w);
  const needEnemy = def.aim === 'enemy' && !alive(c).some((e) => e.uid === arg.uid);
  if (needCell || needCol || needEnemy) {
    ev.push({ t: 'invalid', reason: 'Выбери цель' });
    return false;
  }
  // A stunned enemy, or one just out of a stun, cannot be stunned again (no stun lock); no energy spent.
  const aimed = def.aim === 'enemy' ? c.enemies.find((x) => x.uid === arg.uid) : undefined;
  if (def.id === 'stapler' && aimed && (aimed.stunned || aimed.stunImmune)) {
    ev.push({ t: 'invalid', reason: 'Недавно оглушён' });
    return false;
  }
  if (def.id === 'eraser' && (cells[arg.cell!].kind === 'junk' || cells[arg.cell!].kind === 'prism')) {
    ev.push({ t: 'invalid', reason: 'Выбери цветную фишку' });
    return false;
  }
  if (def.id === 'doubleentry' && c.armed?.double) {
    ev.push({ t: 'invalid', reason: 'Уже готово' });
    return false;
  }
  hero.charge = run.dev?.ink ? hero.charge : hero.charge - cost;
  if (mods.skillBonus) c.skillBonus = mods.skillBonus;
  ev.push({ t: 'activeUsed', item: def.id });
  switch (def.id) {
    case 'eraser': {
      // Every tile of the chosen colour goes at once and fires, like a prism; what falls into place
      // after it clears for nothing (a skill is not a move).
      const fam = cells[arg.cell!].kind;
      const wiped = cells.map((t, k) => (t.kind === fam ? k : -1)).filter((k) => k >= 0);
      resolve(ctx, [], { kind: 'prism', at: arg.cell!, cells: wiped }, [], 'first');
      strike(ctx, false);
      break;
    }
    case 'doubleentry':
      c.armed = { ...c.armed, double: true };
      ev.push({ t: 'armed', what: 'double', on: true });
      break;
    case 'coffeeToGo':
      // Two ticks of quiet; uses do not stack into a frozen fight.
      c.freeTicks = Math.max(c.freeTicks, 2);
      break;
    case 'stapler': {
      const e = c.enemies.find((x) => x.uid === arg.uid)!;
      e.stunned = true;
      ev.push({ t: 'effects', effects: [{ kind: 'status', amount: 1, uid: e.uid, status: 'stun' }] });
      break;
    }
    case 'corrector': {
      let washed = 0;
      for (let i = 0; i < cells.length; i++) {
        const t = cells[i];
        if (t.kind === 'junk') {
          cells[i] = drawTile(c.board, run.rng.board);
          washed++;
        } else {
          delete t.pin;
          delete t.fuse;
          delete t.hidden;
        }
      }
      if (washed && mods.mopJunk) gainArmor(run, mopArmor(washed, mods, actScale(run).dmg));
      c.board.colLock.fill(0);
      c.board.rowLock.fill(0);
      c.board.flood = 0;
      ev.push({ t: 'board', reason: 'active', board: snap(cells) });
      // Every blot washed away hurts every enemy (grows with the act like every effect outside the strike).
      if (washed) {
        const per = Math.round(3 * actScale(run).hp);
        batch(ctx, () => {
          for (const e of alive(c)) hitEnemy(ctx, e.uid, washed * per, { source: 'cleanup', pierce: true });
        });
      }
      resolve(ctx, [], undefined, [], false);
      break;
    }
    case 'shredder': {
      const col = arg.col!;
      resolve(ctx, [], { kind: 'active', at: idx(c.board, 0, col), cells: lineCells(c.board, 'col', col) });
      strike(ctx, false);
      break;
    }
    case 'megaphone':
      ev.push({
        t: 'effects',
        effects: alive(c)
          .map((e) => ({ kind: 'status' as const, amount: holdBack(e, 2), uid: e.uid, status: 'freeze' as const }))
          .filter((f) => f.amount > 0),
      });
      break;
    case 'giftbox': {
      const chosen = randomCells(run.rng.fx, cells, 3, (t) => !t.special && t.kind !== 'prism' && t.kind !== 'junk' && !t.pin);
      chosen.forEach((i, k) => {
        if (k < 2) cells[i] = { ...cells[i], special: 'bomb' };
        else cells[i] = { id: cells[i].id, kind: 'prism' };
      });
      ev.push({ t: 'board', reason: 'active', board: snap(cells) });
      break;
    }
  }
  syncIds(run, c);
  afterAction(ctx, false);
  return true;
}

export function setTarget(run: RunState, uid: number, ev: GameEvent[]) {
  const c = run.combat;
  if (!c) return false;
  const e = c.enemies.find((x) => x.uid === uid && x.hp > 0);
  if (!e) {
    ev.push({ t: 'invalid', reason: 'Нет такой цели' });
    return false;
  }
  c.target = uid;
  return true;
}

// ── Preview for the UI and bots (first wave only, no hidden info) ──────

export interface MovePreview {
  valid: boolean;
  groups: Group[];
  /** What the swap sets off by itself (a swapped special or combo), if anything. */
  blast: Blast | null;
  tally: Tally;
  /** First-wave estimate of the final numbers (cascades stay a surprise). */
  damage: number;
  armor: number;
  charge: number;
  coins: number;
  specials: number;
  /** Damage bonus the move's gold tiles put aside (the abacus). */
  bank: number;
  /** Damage to every enemy (the ruler, a knife's super strike, ink blots). */
  aoe: number;
  /** What the strike leaves on the target: bleed, a stun, a timer pushed back, armour pierced. */
  bleed: number;
  stun: boolean;
  delay: number;
  pierce: boolean;
  /** Share of the target's maximum health the strike takes at once (the guillotine). */
  hpPct: number;
  /** Finds the move picks up (first wave). */
  finds: number;
}

/**
 * What a move would do, first wave only. `armed` asks «as if readied» (a bot weighing «Заряд» or the
 * double entry); by default the move takes what is readied now.
 */
export function previewMove(run: RunState, mods: Mods, move: Move, armed?: { charge?: boolean; double?: boolean }): MovePreview {
  const c = run.combat;
  const empty: MovePreview = { valid: false, groups: [], blast: null, tally: newTally(), damage: 0, armor: 0, charge: 0, coins: 0, specials: 0, bank: 0, aoe: 0, bleed: 0, stun: false, delay: 0, pierce: false, hpPct: 0, finds: 0 };
  const rules = c ? moveRules(run, mods) : null;
  if (!c || !rules || !isValidMove(c.board, move, rules)) return empty;
  const kind = moveKind(c.board, move, rules)!;
  const cells = applyMove(c.board, c.board.cells, move, kind);
  const groups = findGroups(c.board, cells, mods.wrap, moveCells(move));
  const set = swapBlast(c.board, cells, move, mods, kind);
  const ctx: Ctx = { run, c, mods, gear: heldGear(run), ev: [], fx: [], wave: 1, pendingDeaths: [], rocketsThisMove: 0, ms: newMoveState() };
  ctx.ms.charged = armed?.charge ?? !!c.armed?.charge;
  ctx.ms.double = armed?.double ?? !!c.armed?.double;
  const scores: TileScore[] = [];
  const matched = new Set(groups.flatMap((g) => g.cells));
  for (const g of scoringOrder(groups, ctx.gear)) scoreGroup(ctx, g, cells, 1, scores);
  if (set) for (const i of set.blast.cells) if (!matched.has(i)) scoreTile(ctx, cells[i], i, null, 1, scores);
  const t = ctx.ms.tally;
  const base = t.dmg + inkOverflow(run, t.charge) + (mods.goldGroupDmg * ctx.ms.famGroups.coin) + mods.inkGroupDmg * ctx.ms.famGroups.ink;
  // The bonuses the strike adds (a first-wave estimate): items, the abacus's savings on a hit,
  // the hot key, the energy drink, the weapon against paper.
  const target = targetEnemy(c);
  const paper = target && ENEMIES[target.def].material === 'paper' ? ctx.ms.paperBonus : 0;
  const bonus = t.bonus + mods.dmgBonus + (base > 0 ? (c.bank ?? 0) : 0) + (c.skillBonus ?? 0) + c.nextBonus + paper;
  const damage = Math.round(base * Math.max(0, 1 + bonus));
  const ms = ctx.ms;
  return {
    valid: true,
    groups,
    blast: set?.blast ?? null,
    tally: t,
    damage,
    armor: Math.round(t.armor * ms.armorX),
    charge: Math.round(t.charge),
    coins: Math.round(t.coins),
    specials: groups.filter((g) => g.make).length,
    bank: ms.bank,
    aoe: Math.round(t.aoe * Math.max(0, 1 + t.bonus + mods.dmgBonus)),
    bleed: ms.bleed + (groups.some((g) => g.fam === 'blade') ? mods.bleedOnRed : 0),
    stun: ms.stun,
    delay: ms.delay,
    pierce: ms.pierce || mods.pierce,
    hpPct: ms.hpPct,
    finds: [...matched, ...(set ? set.blast.cells : [])].filter((i, k, all) => all.indexOf(i) === k && cells[i]?.find).length,
  };
}

export { shuffle };

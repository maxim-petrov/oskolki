import {
  area,
  cloneCells,
  colOf,
  createBoard,
  drawTile,
  findGroups,
  gravity,
  idx,
  isSpecialTile,
  isValidMove,
  lineCells,
  lineFree,
  makeTile,
  moveCells,
  neighbors,
  randomCells,
  reshuffle,
  rowOf,
  shiftCells,
  swapBlock,
  swapCells,
  tokenTile,
  validMoves,
} from './board.ts';
import { chance, next, pick, shuffle } from './rng.ts';
import { ENEMIES } from './content/enemies.ts';
import { ACTS } from './content/acts.ts';
import { CARDS, cardValue } from './content/cards.ts';
import { ITEMS, POCKETS, type Mods } from './content/items.ts';
import {
  BAG_COPIES,
  CELLS,
  FAMS,
  H,
  W,
  type BagToken,
  type Blast,
  type Combat,
  type Effect,
  type EnemyState,
  type Fam,
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
/** After this many moves in a fight, enemies hit harder every 5 moves. */
export const OVERTIME_AFTER = 20;
const isDead = (run: RunState) => run.phase === 'dead';

// ── Move scoring state ───────────────────────────────────────────────

/** Everything a move accumulates before the final strike. */
export interface MoveState {
  tally: Tally;
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
  copyStamp: number;
  floodDown: number;
  burn: boolean;
  freeze: boolean;
  plane: number;
  junkCleared: number;
  bonusCoins: number;
  /** Multiplier already added by blasts this move (capped). */
  blastMult: number;
  notes: string[];
}

export function newTally(): Tally {
  return { dmg: 0, armor: 0, aoe: 0, mult: 1, xmult: 1, coins: 0, charge: 0 };
}

function newMoveState(): MoveState {
  return {
    tally: newTally(),
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
    copyStamp: 0,
    floodDown: 0,
    burn: false,
    freeze: false,
    plane: 0,
    junkCleared: 0,
    bonusCoins: 0,
    blastMult: 0,
    notes: [],
  };
}

export interface Ctx {
  run: RunState;
  c: Combat;
  mods: Mods;
  ev: GameEvent[];
  /** Current effect sink (a wave or a standalone effects batch). */
  fx: Effect[];
  wave: number;
  pendingDeaths: GameEvent[];
  rocketsThisMove: number;
  ms: MoveState;
}

export function newCtx(run: RunState, mods: Mods, ev: GameEvent[]): Ctx {
  return { run, c: run.combat!, mods, ev, fx: [], wave: 0, pendingDeaths: [], rocketsThisMove: 0, ms: newMoveState() };
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
  return c.moves > OVERTIME_AFTER ? 2 * (1 + Math.floor((c.moves - OVERTIME_AFTER - 1) / 5)) : 0;
}

const DAMAGING = new Set(['attack', 'heavy', 'strike']);

/** Damage an enemy's current intent will deal, as shown to the player. */
export function intentDamage(c: Combat, e: EnemyState): number {
  const i = currentIntent(e);
  return DAMAGING.has(i.kind) ? Math.round(i.value * e.dmgMul) + overtimeBonus(c) : 0;
}

export function makeEnemy(run: RunState, c: Combat, defId: string, mods: Mods): EnemyState {
  const def = ENEMIES[defId];
  const act = ACTS[Math.min(run.act, ACTS.length - 1)];
  const hp = Math.max(1, Math.round(def.hp * act.hpMul * (run.dev?.enemyHp ?? 1)));
  const e: EnemyState = {
    uid: c.nextUid++,
    def: defId,
    hp,
    maxHp: hp,
    block: 0,
    armor: def.armor ?? 0,
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
    dmgMul: act.dmgMul * (run.dev?.enemyDmg ?? 1),
    stolen: 0,
  };
  e.countdown = currentIntent(e).timer + mods.timerBonus;
  return e;
}

export function snap(cells: Tile[]): Tile[] {
  return cloneCells(cells);
}

function snapQueue(c: Combat): Tile[][] {
  return c.board.queue.map((q) => q.map((t) => ({ ...t })));
}

/** The fight's bag: every deck card puts BAG_COPIES tiles in. */
export function deckTokens(run: RunState): BagToken[] {
  const out: BagToken[] = [];
  for (const card of run.hero.deck)
    for (let k = 0; k < BAG_COPIES; k++) out.push({ card: card.id, up: card.up, ...(card.finish ? { finish: card.finish } : {}) });
  return out;
}

export function startCombat(run: RunState, kind: Combat['kind'], enemyIds: string[], mods: Mods, ev: GameEvent[]): Combat {
  const board = createBoard(run.rng.board, deckTokens(run), mods.wrap, 6, run.nextId);
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
    nextMult: 0,
    bonusCoins: 0,
  };
  for (const id of enemyIds) c.enemies.push(makeEnemy(run, c, id, mods));
  c.target = c.enemies[0]?.uid ?? -1;
  run.hero.armor = mods.startArmor;
  run.hero.ward = 0;
  run.hero.reflect = 0;
  if (mods.sealStart > 0)
    for (const i of randomCells(run.rng.fx, board.cells, mods.sealStart, (t) => t.kind !== 'junk' && t.kind !== 'prism')) board.cells[i].finish = 'seal';
  if (mods.interest) {
    const bonus = Math.floor(run.hero.coins / 10);
    if (bonus > 0) {
      run.hero.coins = Math.min(999, run.hero.coins + bonus);
      ev.push({ t: 'message', text: `Проценты: +${bonus}` });
    }
  }
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
  return id ? (ITEMS[id]?.charge ?? 6) : 6;
}

// ── Damage ───────────────────────────────────────────────────────────

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
    const back = Math.round(amount * hero.reflect);
    hero.reflect = 0;
    if (back > 0) {
      ctx.fx.push({ kind: 'proc', amount: back, uid: attacker.uid, source: 'reflect', text: `Отражено ${back}` });
      hitEnemy(ctx, attacker.uid, back, { source: 'reflect', pierce: true });
    }
  }
  const armor = Math.min(hero.armor, left);
  hero.armor -= armor;
  if (burnsArmor) hero.armor = 0;
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
    run.hero.coins = Math.min(999, run.hero.coins + coins);
    run.stats.coinsEarned += coins;
    ctx.fx.push({ kind: 'coins', amount: coins, uid: e.uid, source: 'loot' });
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
    // A quarter of the blow comes back, but never more than a heavy hit of this act.
    const back = Math.max(1, Math.min(Math.round(dmg * 0.25), Math.round(18 * e.dmgMul)));
    const hurt = hurtHero(ctx, back, 'Отражение Кривого зеркала');
    ctx.fx.push({ kind: 'proc', amount: hurt.red, uid, source: 'mirror', text: `Отражение −${hurt.red}` });
  }
  if (e.hp <= 0) killEnemy(ctx, e);
  return dmg;
}

// ── Scoring ──────────────────────────────────────────────────────────

/** Most multiplier blasts can add in one move. */
export const BLAST_MULT_CAP = 6;
const WAVE_MULT: Partial<Record<Blast['kind'], number>> = { rocketH: 1, rocketV: 1, bomb: 1, prism: 2, cross: 2, bigCross: 2, bigBomb: 2, nova: 3 };

/**
 * One tile adds its value to the move's tally. Pure with respect to the board and enemies:
 * effects that change them are recorded in the move state and applied at the strike.
 */
export function scoreTile(ctx: Ctx, tile: Tile, i: number, g: Group | null, wave: number, scores: TileScore[], again = false) {
  if (tile.kind === 'junk') return;
  const { ms, mods } = ctx;
  const t = ms.tally;
  const fam: Fam = tile.kind === 'prism' ? (g?.fam ?? 'blade') : tile.kind;
  const card = tile.card;
  const up = !!tile.up;
  let v = card ? cardValue(card, up) : 2;
  if (tile.finish === 'sharp') v += 1;
  v += fam === 'blade' ? mods.redPlus : fam === 'shield' ? mods.bluePlus : fam === 'ink' ? mods.inkPlus : mods.coinPlus;
  const size = g?.size ?? 1;
  const s: TileScore = { i, id: tile.id, card, fam };
  const add = (k: keyof Tally, n: number) => {
    if (!n) return;
    t[k] += n;
    s[k] = (s[k] ?? 0) + n;
  };
  const target = targetEnemy(ctx.c);
  ms.fams.add(fam);
  // Multiplier effects fire once per group (per blasted tile when there is no group).
  const once = (tag: string, perMove = false) => {
    const key = perMove ? tag : `${tag}:${wave}:${g ? g.cells[0] : `b${i}`}`;
    if (ms.flags.has(key)) return false;
    ms.flags.add(key);
    return true;
  };
  // Blasted tiles (no group) score their plain value: card rules need a match.
  if (!g) {
    if (fam === 'blade') add('dmg', v);
    else if (fam === 'shield') add('armor', v);
    else if (fam === 'ink') add('charge', v);
    else add('coins', v);
    if (fam === 'blade') ms.redTiles++;
    if (tile.finish === 'gild') add('coins', 1);
    scores.push(s);
    return;
  }
  switch (card) {
    case 'punch':
      add('dmg', v);
      ms.pierce = true;
      break;
    case 'redpen':
      add('dmg', v);
      ms.bleed += 2;
      break;
    case 'sharpener':
      add('dmg', wave >= 2 ? v * 5 : v);
      break;
    case 'pins':
      add('dmg', v);
      add('aoe', v);
      break;
    case 'scissors':
      add('dmg', v);
      if (size >= 4 && once('scissors')) add('mult', 1);
      break;
    case 'ruler':
      add('dmg', v * size);
      break;
    case 'stapler':
      add('dmg', v + ms.redTiles);
      break;
    case 'awl':
      add('dmg', v);
      ms.selfDmg += 2;
      break;
    case 'cutter':
      add('dmg', target && ENEMIES[target.def].material === 'paper' ? v * 3 : v);
      break;
    case 'alarm':
      add('dmg', v);
      if (once('alarm')) add('mult', ms.redGroups);
      break;
    case 'sleeve':
      add('armor', v);
      ms.cleanse.push(i);
      break;
    case 'umbrella':
      add('armor', v);
      ms.ward += 4;
      break;
    case 'drawer':
      add('armor', v);
      ms.flags.add('drawer');
      break;
    case 'laminator':
      add('armor', size >= 4 ? v * 2 : v);
      break;
    case 'archivebox':
      add('armor', v);
      if (size >= 4 && g && !ms.flags.has(`box:${g.cells[0]}`)) {
        ms.flags.add(`box:${g.cells[0]}`);
        ms.heal += 4;
      }
      break;
    case 'vest':
      add('armor', v);
      ms.armorX = 2;
      break;
    case 'clipboard':
      add('armor', v);
      ms.reflect = 0.5;
      break;
    case 'corrector':
      add('charge', v);
      ms.cleanse.push(i);
      ms.cleansePins = true;
      break;
    case 'urgent':
      add('charge', v);
      ms.delay += 1;
      break;
    case 'blotcurse':
      add('aoe', v);
      break;
    case 'quill':
      add('charge', v);
      if (ctx.run.hero.active && ctx.run.hero.charge + t.charge >= activeCost(ctx.run) && once('quill')) add('mult', 1);
      break;
    case 'copystamp':
      add('charge', v);
      ms.copyStamp += up ? 3 : 2;
      break;
    case 'carbon':
      add('charge', v);
      ms.copyNext += 1;
      break;
    case 'weight':
      add('charge', v);
      if (size >= 4) ms.stun = true;
      break;
    case 'receipt':
      add('coins', v * size);
      break;
    case 'bonus':
      add('mult', v);
      break;
    case 'card':
      if (ctx.run.hero.coins + t.coins >= 2) {
        add('mult', v);
        add('coins', -2);
      }
      break;
    case 'piggy':
      add('coins', v);
      ms.bonusCoins += 3;
      break;
    case 'report':
      add('coins', 1);
      if (once('report', true)) add('mult', v * ms.fams.size);
      break;
    case 'goldclip':
      add('coins', v);
      // Once per move, however many gold clips it holds: the multiplier must not snowball.
      if (once('gold', true)) {
        t.xmult *= up ? 2 : 1.5;
        s.xmult = up ? 2 : 1.5;
      }
      break;
    default:
      if (fam === 'blade') add('dmg', v);
      else if (fam === 'shield') add('armor', v);
      else if (fam === 'ink') add('charge', v);
      else add('coins', v);
  }
  if (fam === 'blade') ms.redTiles++;
  if (fam === 'ink' && mods.inkDamage) add('dmg', mods.inkDamage);
  if (fam === 'coin' && mods.coinDamage) add('dmg', mods.coinDamage);
  if (tile.finish === 'gild') add('coins', 1);
  if (tile.finish === 'seal') add('mult', 1);
  if (again) s.note = 'дважды';
  scores.push(s);
  if (tile.finish === 'copy' && !again) scoreTile(ctx, tile, i, g, wave, scores, true);
}

function scoreGroup(ctx: Ctx, g: Group, cells: Tile[], wave: number, scores: TileScore[]) {
  const { ms, mods, c } = ctx;
  if (g.fam === 'blade') ms.redGroups++;
  let reps = 1;
  if (ms.copyNext > 0) {
    reps++;
    ms.copyNext--;
  }
  if (mods.echo && !ms.echoUsed) {
    reps++;
    ms.echoUsed = true;
  }
  for (let r = 0; r < reps; r++) for (const i of g.cells) scoreTile(ctx, cells[i], i, g, wave, scores, r > 0);
  if (g.fam === 'blade' && mods.bleedOnRed) ms.bleed += mods.bleedOnRed;
  if (g.size >= 4) {
    if (mods.igniteOn4) ms.burn = true;
    if (g.fam === 'blade' && mods.planeOn4) ms.plane += mods.planeOn4;
    if (g.fam === 'shield' && mods.freezeOn4Shields) ms.freeze = true;
  }
  if (g.fam === 'shield' && c.board.flood > 0 && g.cells.some((i) => rowOf(i) >= H - c.board.flood)) ms.floodDown++;
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

const rowCells = (i: number) => Array.from({ length: W }, (_, k) => idx(rowOf(i), k));
const colCells = (i: number) => Array.from({ length: H }, (_, k) => idx(k, colOf(i)));
const uniq = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);

/** Cells a rocket or a bomb clears from cell i. */
function specialArea(t: Tile, i: number, mods: Mods): number[] {
  if (t.special === 'rocketH') return uniq(mods.crossRockets ? [...rowCells(i), ...colCells(i)] : rowCells(i));
  if (t.special === 'rocketV') return uniq(mods.crossRockets ? [...colCells(i), ...rowCells(i)] : colCells(i));
  return area(i, mods.bombRadius);
}

/**
 * What a swap sets off by itself (on the board after the swap). A lone special fires where it
 * lands; a prism wipes the family it was swapped with; two specials swapped together combine.
 * `spent` are the swapped specials, already used up by this blast.
 */
export function swapBlast(cells: Tile[], m: Move, mods: Mods): { blast: Blast; spent: number[] } | null {
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
      return { blast: { kind: 'prism', at, cells: uniq([...famCells(other.kind), ...specialArea(other, otherAt, mods), m.to, m.from]) }, spent };
    }
    const rocketA = a.special === 'rocketH' || a.special === 'rocketV';
    const rocketB = b.special === 'rocketH' || b.special === 'rocketV';
    if (rocketA && rocketB) return { blast: { kind: 'cross', at, cells: uniq([...rowCells(at), ...colCells(at)]) }, spent };
    if (rocketA || rocketB) {
      const wide: number[] = [];
      for (const d of [-1, 0, 1]) {
        const r = rowOf(at) + d;
        const c = colOf(at) + d;
        if (r >= 0 && r < H) wide.push(...rowCells(idx(r, 0)));
        if (c >= 0 && c < W) wide.push(...colCells(idx(0, c)));
      }
      return { blast: { kind: 'bigCross', at, cells: uniq(wide) }, spent };
    }
    return { blast: { kind: 'bigBomb', at, cells: area(at, mods.bombRadius + 1) }, spent };
  }
  const i = sa ? m.to : m.from;
  const t = cells[i];
  if (t.kind === 'prism') {
    const partner = cells[sa ? m.from : m.to];
    const fam = partner.kind === 'junk' || partner.kind === 'prism' ? mostCommonFam(cells) : partner.kind;
    return { blast: { kind: 'prism', at: i, cells: uniq([...famCells(fam), i]) }, spent: [i] };
  }
  return { blast: { kind: t.special!, at: i, cells: specialArea(t, i, mods) }, spent: [i] };
}

function blastArea(ctx: Ctx, i: number, t: Tile, fam: Fam | undefined, cells: Tile[]): { kind: Blast['kind']; cells: number[] } {
  if (t.kind === 'prism') {
    const f = fam ?? mostCommonFam(cells);
    return { kind: 'prism', cells: cells.map((x, k) => (x.kind === f || k === i ? k : -1)).filter((k) => k >= 0) };
  }
  if (t.special === 'rocketH' || t.special === 'rocketV') return { kind: t.special, cells: specialArea(t, i, ctx.mods) };
  return { kind: 'bomb', cells: area(i, ctx.mods.bombRadius) };
}

/**
 * Resolve matches and cascades until the board is stable, scoring every wave into the move's
 * tally. `forced` is an initial blast (pocket bomb, shredder, a swapped special) that happens with
 * the first wave; `spent` are specials that blast already used up.
 */
export function resolve(ctx: Ctx, prefer: number[], forced?: Blast, spent: number[] = []) {
  const { c, mods, ms } = ctx;
  let first = true;
  for (let wave = 1; wave <= 30; wave++) {
    const cells = c.board.cells;
    const groups: Group[] = findGroups(cells, mods.wrap, first ? prefer : []);
    if (!groups.length && !forced) break;
    ctx.wave = wave;
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
    // Multiplier: specials add to it; cascade waves only with the poster (more waves already mean more tiles).
    if (wave >= 2 && mods.cascadeMult) {
      const n = mods.cascadeMult;
      ms.tally.mult += n;
      scores.push({ i: -1, id: -1, fam: 'prism', mult: n, note: `каскад ×${wave}` });
    }
    for (const b of blasts) {
      // Blasts add to the multiplier up to BLAST_MULT_CAP per move: long chains still pay in tiles.
      const n = Math.min(WAVE_MULT[b.kind] ?? 0, BLAST_MULT_CAP - ms.blastMult);
      if (b.kind === 'rocketH' || b.kind === 'rocketV') ctx.rocketsThisMove++;
      if (b.kind === 'cross') ctx.rocketsThisMove += 2;
      if (n > 0) {
        ms.blastMult += n;
        ms.tally.mult += n;
        scores.push({ i: b.at, id: -1, fam: 'prism', mult: n, note: 'взрыв' });
      }
    }
    if (blasts.length && mods.igniteOn4) ms.burn = true;

    // Score: groups first, then blasted tiles one by one.
    for (const g of groups) scoreGroup(ctx, g, cells, wave, scores);
    for (const i of blasted) scoreTile(ctx, cells[i], i, null, wave, scores);

    // Junk next to a match is washed away.
    const splashed = new Set<number>();
    for (const i of matched)
      for (const n of neighbors(i)) if (!matched.has(n) && !blasted.has(n) && cells[n].kind === 'junk') splashed.add(n);
    for (const i of blasted) if (cells[i].kind === 'junk') ms.junkCleared++;
    ms.junkCleared += splashed.size;

    // Remove, create specials, drop.
    const cleared: { i: number; id: number; kind: TileKind; cause: 'match' | 'blast' | 'splash' }[] = [];
    const nextCells: (Tile | null)[] = cells.slice();
    for (const i of matched) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'match' });
      nextCells[i] = null;
    }
    for (const i of blasted) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'blast' });
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
      if (mods.prismOn4 && (make === 'rocketH' || make === 'rocketV')) make = 'prism';
      if (created.some((x) => x.at === g.at)) continue;
      // The special keeps the card of the tile it grew from.
      const src = cells[g.at];
      const tile =
        make === 'prism'
          ? makeTile(c.board, 'prism')
          : makeTile(c.board, g.fam, { special: make, ...(src?.card && src.kind === g.fam ? { card: src.card, up: src.up, finish: src.finish } : {}) });
      nextCells[g.at] = tile;
      created.push({ at: g.at, tile: { ...tile } });
    }
    const { falls, spawns } = gravity(c.board, ctx.run.rng.board, nextCells);
    syncIds(ctx.run, c);
    ctx.ev.push({
      t: 'wave',
      n: wave,
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

/** The best card of the deck (rarity, then value): the copy stamp prints it. */
function bestCard(run: RunState) {
  const rank = { starter: 0, common: 1, uncommon: 2, rare: 3, status: -1 };
  return [...run.hero.deck].sort((a, b) => {
    const da = CARDS[a.id];
    const db = CARDS[b.id];
    return rank[db.rarity] - rank[da.rarity] || cardValue(b.id, b.up) - cardValue(a.id, a.up);
  })[0];
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
  if (mods.calcGoldMult && ms.fams.has('coin')) {
    t.mult += 1;
    notes.push('Калькулятор +1');
  }
  if (mods.lampMult && ms.fams.has('ink')) {
    t.mult += 1;
    notes.push('Лампа +1');
  }
  if (ms.flags.has('drawer') && ms.fams.has('blade') && ms.fams.has('shield')) t.mult += 1;
  if (mods.multFlat && fromMove) t.mult += mods.multFlat;
  if (c.nextMult && fromMove) {
    t.mult += c.nextMult;
    notes.push(`Энергетик +${c.nextMult}`);
    c.nextMult = 0;
  }
  let mult = t.mult * t.xmult;
  if (mods.firstMoveX && fromMove && c.moves === 1) {
    mult *= 2;
    notes.push('Кофемашина ×2');
  }
  if (mods.luck && chance(run.rng.fx, mods.luck)) {
    mult *= 2;
    notes.push('Удача ×2');
  }
  if (mods.chaos) {
    const k = Math.round((0.5 + next(run.rng.fx) * 2) * 10) / 10;
    mult *= k;
    notes.push(`Калькулятор ×${String(k).replace('.', ',')}`);
  }
  mult = Math.round(mult * 10) / 10;
  let target = targetEnemy(c);
  if (target?.submerged) {
    const other = alive(c).find((e) => !e.submerged);
    if (other) target = other;
  }
  let damage = Math.round(t.dmg * mult);
  if (target && damage > 0 && ENEMIES[target.def].material === 'paper' && mods.paperX > 1) {
    damage *= mods.paperX;
    notes.push(`Бумага ×${mods.paperX}`);
  }
  if (target && damage > 0 && mods.firstHitDouble && !target.hitOnce) {
    damage *= 2;
    notes.push('Табель ×2');
  }
  const armor = Math.max(0, Math.round(t.armor * mult * ms.armorX));
  if (mods.armorToDamage && armor > 0) damage += armor;
  let aoe = Math.max(0, Math.round(t.aoe * mult)) + ms.plane;
  const tune = run.dev?.heroDmg;
  if (tune && tune !== 1) {
    damage = Math.round(damage * tune);
    aoe = Math.round(aoe * tune);
    // Dev cheat: named first, so the strike's result never passes for the real math.
    notes.unshift(`Чит ×${String(tune).replace('.', ',')}`);
  }
  const submerged = target?.submerged;
  ctx.ev.push({ t: 'strike', tally: { ...t, mult }, damage, aoe, armor, target: target?.uid ?? -1, notes: [...notes] });
  run.stats.maxHit = Math.max(run.stats.maxHit, damage);
  run.stats.maxMult = Math.max(run.stats.maxMult, mult);
  batch(ctx, () => {
    hero.armor += armor;
    if (ms.junkCleared && mods.mopJunk) hero.armor += ms.junkCleared * mods.mopJunk;
    const coins = Math.round(t.coins);
    hero.coins = Math.max(0, Math.min(999, hero.coins + coins));
    if (coins > 0) run.stats.coinsEarned += coins;
    c.bonusCoins += ms.bonusCoins;
    hero.charge = run.dev?.ink ? activeCost(run) : Math.min(activeCost(run), hero.charge + Math.round(t.charge));
    if (target && damage > 0) {
      if (submerged) ctx.fx.push({ kind: 'damage', amount: 0, uid: target.uid, source: 'strike', text: 'Под водой' });
      else hitEnemy(ctx, target.uid, damage, { source: 'strike', pierce: ms.pierce || mods.pierce });
    }
    if (aoe > 0) for (const e of alive(c)) hitEnemy(ctx, e.uid, aoe, { source: 'aoe', pierce: true });
    const tgt = targetEnemy(c);
    if (tgt) {
      if (ms.bleed) {
        tgt.bleed += ms.bleed;
        ctx.fx.push({ kind: 'status', amount: tgt.bleed, uid: tgt.uid, status: 'bleed' });
      }
      if (ms.burn) {
        tgt.burn = Math.max(tgt.burn, 4);
        tgt.burnTurns = Math.max(tgt.burnTurns, 3);
        ctx.fx.push({ kind: 'status', amount: 3, uid: tgt.uid, status: 'burn' });
      }
      if (ms.stun && !tgt.stunImmune && !tgt.stunned) {
        tgt.stunned = true;
        ctx.fx.push({ kind: 'status', amount: 1, uid: tgt.uid, status: 'stun' });
      }
      if (ms.delay) {
        tgt.countdown += ms.delay;
        ctx.fx.push({ kind: 'status', amount: ms.delay, uid: tgt.uid, status: 'freeze' });
      }
    }
    if (ms.freeze)
      for (const e of alive(c)) {
        e.countdown += 1;
        ctx.fx.push({ kind: 'status', amount: 1, uid: e.uid, status: 'freeze' });
      }
    if (ms.heal) {
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + ms.heal);
      if (hero.hp > before) ctx.fx.push({ kind: 'heal', amount: hero.hp - before });
    }
    if (ms.selfDmg) hurtHero(ctx, ms.selfDmg, 'Шило');
    hero.ward += ms.ward;
    if (ms.reflect) hero.reflect = Math.max(hero.reflect, ms.reflect);
  });
  // Board after-effects.
  let boardChanged = false;
  const cells = c.board.cells;
  if (ms.cleanse.length) {
    for (const i of ms.cleanse)
      for (const n of [i, ...neighbors(i)]) {
        const u = cells[n];
        if (!u) continue;
        if (u.kind === 'junk') {
          cells[n] = drawTile(c.board, run.rng.board);
          if (mods.mopJunk) hero.armor += mods.mopJunk;
          boardChanged = true;
        } else if (ms.cleansePins && (u.pin || u.fuse)) {
          delete u.pin;
          delete u.fuse;
          boardChanged = true;
        }
      }
  }
  if (ms.copyStamp) {
    const best = bestCard(run);
    if (best) {
      for (const i of randomCells(run.rng.fx, cells, ms.copyStamp, (u) => !u.special && u.kind !== 'prism' && !u.pin)) {
        cells[i] = tokenTile(c.board, { card: best.id, up: best.up, ...(best.finish ? { finish: best.finish } : {}) });
      }
      boardChanged = true;
    }
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
        hitEnemy(ctx, e.uid, e.bleed, { source: 'bleed', pierce: true });
        e.bleed = Math.max(0, e.bleed - 1);
      }
      if (e.hp > 0 && e.burnTurns > 0) {
        hitEnemy(ctx, e.uid, e.burn, { source: 'burn', pierce: true });
        e.burnTurns--;
      }
    }
    if (mods.spider > 0) {
      const weakest = alive(c).sort((a, b) => a.hp - b.hp)[0];
      if (weakest) hitEnemy(ctx, weakest.uid, mods.spider, { source: 'spider', pierce: true });
    }
    if (mods.battery > 0) {
      const before = run.hero.charge;
      run.hero.charge = Math.min(activeCost(run), run.hero.charge + mods.battery);
      if (run.hero.charge > before) ctx.fx.push({ kind: 'charge', amount: run.hero.charge - before, source: 'battery' });
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
}

/** Tiles an enemy may spoil: plain, not laminated. */
const spoilable = (t: Tile) => !t.special && t.kind !== 'prism' && t.kind !== 'junk' && !t.pin && !t.fuse && t.finish !== 'laminate';

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
    act.hurt = hurtHero(ctx, dmg, ENEMIES[e.def].name, true, e);
    ctx.fx = prev;
    ctx.ev.push(act);
    if (list.length) ctx.ev.push({ t: 'effects', effects: list });
    flushDeaths(ctx);
    if (mods.cactus > 0 && !isDead(run) && e.hp > 0) batch(ctx, () => hitEnemy(ctx, e.uid, mods.cactus, { source: 'cactus', pierce: true }));
  };
  const blow = (v: number) => Math.round(v * e.dmgMul) + overtimeBonus(c);
  switch (intent.kind) {
    case 'attack':
    case 'heavy':
      attack(blow(intent.value));
      break;
    case 'strike': {
      const pinned = randomCells(run.rng.ai, cells, 1, (t) => t.kind !== 'junk' && !t.pin && t.finish !== 'laminate');
      for (const i of pinned) cells[i].pin = true;
      act.cells = pinned;
      act.board = snap(cells);
      attack(blow(intent.value));
      break;
    }
    case 'block':
      e.block = Math.round(intent.value * e.dmgMul);
      ctx.ev.push(act);
      break;
    case 'heal': {
      const hurt = alive(c)
        .filter((x) => x.hp < x.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const amount = Math.min(Math.round(intent.value * e.dmgMul), hurt.maxHp - hurt.hp);
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
      for (const i of chosen) cells[i] = { id: cells[i].id, kind: 'junk', card: 'redtape' };
      c.board.source.push({ card: 'redtape', up: false });
      c.board.bag.splice(Math.floor(next(run.rng.ai) * (c.board.bag.length + 1)), 0, { card: 'redtape', up: false });
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
      const chosen = randomCells(run.rng.ai, cells, intent.value, (t) => t.kind !== 'junk' && !t.pin && t.finish !== 'laminate');
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
        const chosen = randomCells(run.rng.ai, cells, intent.value, (t) => !t.hidden && t.finish !== 'laminate');
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
      const rows = Array.from({ length: H }, (_, r) => r).filter((r) => lineFree(c.board, 'row', r));
      const options: LineShift[] = [];
      for (const r of rows)
        for (const d of [1, W - 1]) {
          const m: LineShift = { line: 'row', index: r, delta: d };
          if (!findGroups(shiftCells(cells, m), mods.wrap).length) options.push(m);
        }
      if (options.length) {
        const m = pick(run.rng.ai, options);
        c.board.cells = shiftCells(cells, m);
        act.cells = lineCells(m.line, m.index);
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
      const cols = Array.from({ length: W }, (_, k) => k).filter((k) => c.board.colLock[k] === 0);
      if (cols.length) {
        const col = pick(run.rng.ai, cols);
        c.board.colLock[col] = 3;
        act.cells = Array.from({ length: H }, (_, r) => idx(r, col));
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
}

function boardTimers(ctx: Ctx) {
  const { c, mods } = ctx;
  const cells = c.board.cells;
  const burnt: number[] = [];
  let changed = false;
  for (let i = 0; i < CELLS; i++) {
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
  for (let k = 0; k < W; k++)
    if (c.board.colLock[k] > 0) {
      c.board.colLock[k]--;
      changed = true;
    }
  for (let k = 0; k < H; k++)
    if (c.board.rowLock[k] > 0) {
      c.board.rowLock[k]--;
      changed = true;
    }
  if (burnt.length) {
    const prev = ctx.fx;
    ctx.fx = [];
    const dmg = Math.round(4 * burnt.length * (ACTS[Math.min(ctx.run.act, ACTS.length - 1)].dmgMul));
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
  if (c.freeTicks > 0) {
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
  ctx.ev.push({ t: 'tick', timers: alive(c).map((e) => ({ uid: e.uid, countdown: e.countdown })) });
  boardTimers(ctx);
  if (isDead(ctx.run)) return;
  let acted = false;
  for (const e of c.enemies) {
    if (e.hp <= 0 || e.countdown > 0) continue;
    acted = true;
    enemyAct(ctx, e);
    flushDeaths(ctx);
    if (isDead(ctx.run)) return;
  }
  // Armor is for the enemies' next action: whatever they did, it is spent.
  if (acted && ctx.run.hero.armor > 0) {
    const lost = ctx.run.hero.armor;
    ctx.run.hero.armor = 0;
    ctx.ev.push({ t: 'effects', effects: [{ kind: 'armor', amount: -lost, source: 'expire' }] });
  }
}

export function ensurePlayable(ctx: Ctx) {
  const { c, mods, run } = ctx;
  if (!alive(c).length) return;
  if (validMoves(c.board, mods.wrap).length === 0) {
    reshuffle(c.board, run.rng.board, mods.wrap);
    syncIds(run, c);
    ctx.ev.push({ t: 'board', reason: 'reshuffle', board: snap(c.board.cells), queue: snapQueue(c) });
  }
}

// ── Player actions ──────────────────────────────────────────────────

export function playerMove(run: RunState, mods: Mods, move: Move, ev: GameEvent[]): boolean {
  const c = run.combat!;
  const m: Move = { from: move.from, to: move.to };
  const block = swapBlock(c.board, m, mods.wrap);
  if (block || !isValidMove(c.board, m, mods.wrap)) {
    ev.push({ t: 'invalid', reason: block ?? 'Нет совпадения' });
    return false;
  }
  const ctx = newCtx(run, mods, ev);
  c.board.cells = swapCells(c.board.cells, m);
  c.moves++;
  run.stats.moves++;
  ev.push({ t: 'swap', move: m, board: snap(c.board.cells) });
  const set = swapBlast(c.board.cells, m, mods);
  resolve(ctx, moveCells(m), set?.blast, set?.spent);
  run.stats.maxRocketsInMove = Math.max(run.stats.maxRocketsInMove, ctx.rocketsThisMove);
  strike(ctx, true);
  afterAction(ctx, true);
  return true;
}

/** Shared tail for moves, bombs and actives. */
export function afterAction(ctx: Ctx, spendsTime: boolean) {
  if (isDead(ctx.run)) return;
  if (spendsTime) moveEnd(ctx);
  else phaseCheck(ctx);
  if (spendsTime && alive(ctx.c).length && !isDead(ctx.run)) advanceTime(ctx);
  syncIds(ctx.run, ctx.c);
  if (!isDead(ctx.run)) ensurePlayable(ctx);
}

function removeCell(ctx: Ctx, i: number) {
  const { c, run, ev } = ctx;
  const cells = c.board.cells;
  const next: (Tile | null)[] = cells.slice();
  const removed = cells[i];
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
  if (def.aim === 'cell' && (cell === undefined || cell < 0 || cell >= CELLS)) {
    ev.push({ t: 'invalid', reason: 'Выбери клетку' });
    return false;
  }
  run.hero.pockets[slot] = null;
  ev.push({ t: 'pocketUsed', pocket: def.id });
  if (id === 'coffee') {
    const before = run.hero.hp;
    run.hero.hp = Math.min(run.hero.maxHp, run.hero.hp + 12);
    ev.push({ t: 'heal', amount: run.hero.hp - before });
    return true;
  }
  const ctx = newCtx(run, mods, ev);
  switch (id) {
    case 'bomb':
      resolve(ctx, [], { kind: 'bomb-item', at: cell!, cells: area(cell!, mods.bombRadius) });
      strike(ctx, false);
      break;
    case 'eraser':
      removeCell(ctx, cell!);
      resolve(ctx, []);
      strike(ctx, false);
      break;
    case 'sticker':
      for (const e of alive(c!)) e.countdown += 2;
      ev.push({ t: 'effects', effects: alive(c!).map((e) => ({ kind: 'status' as const, amount: 2, uid: e.uid, status: 'freeze' as const })) });
      break;
    case 'energy':
      c!.nextMult += 2;
      ev.push({ t: 'effects', effects: [{ kind: 'proc', amount: 2, source: 'energy', text: '+2 множ к следующему ходу' }] });
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
  if (hero.charge < (def.charge ?? 0)) {
    ev.push({ t: 'invalid', reason: 'Мало чернил' });
    return false;
  }
  const ctx = newCtx(run, mods, ev);
  const cells = c.board.cells;
  const needCell = def.aim === 'cell' && (arg.cell === undefined || arg.cell < 0 || arg.cell >= CELLS);
  const needCol = def.aim === 'col' && (arg.col === undefined || arg.col < 0 || arg.col >= W);
  const needEnemy = def.aim === 'enemy' && !alive(c).some((e) => e.uid === arg.uid);
  if (needCell || needCol || needEnemy) {
    ev.push({ t: 'invalid', reason: 'Выбери цель' });
    return false;
  }
  hero.charge = run.dev?.ink ? hero.charge : hero.charge - (def.charge ?? 0);
  ev.push({ t: 'activeUsed', item: def.id });
  switch (def.id) {
    case 'eraser':
      removeCell(ctx, arg.cell!);
      resolve(ctx, []);
      strike(ctx, false);
      break;
    case 'coffeeToGo':
      c.freeTicks += 2;
      break;
    case 'stapler': {
      const e = c.enemies.find((x) => x.uid === arg.uid)!;
      e.stunned = true;
      ev.push({ t: 'effects', effects: [{ kind: 'status', amount: 1, uid: e.uid, status: 'stun' }] });
      break;
    }
    case 'corrector': {
      for (let i = 0; i < CELLS; i++) {
        const t = cells[i];
        if (t.kind === 'junk') {
          cells[i] = drawTile(c.board, run.rng.board);
          if (mods.mopJunk) hero.armor += mods.mopJunk;
        } else {
          delete t.pin;
          delete t.fuse;
          delete t.hidden;
        }
      }
      c.board.colLock.fill(0);
      c.board.rowLock.fill(0);
      ev.push({ t: 'board', reason: 'active', board: snap(cells) });
      resolve(ctx, []);
      strike(ctx, false);
      break;
    }
    case 'shredder': {
      const col = arg.col!;
      resolve(ctx, [], { kind: 'active', at: idx(0, col), cells: Array.from({ length: H }, (_, r) => idx(r, col)) });
      strike(ctx, false);
      break;
    }
    case 'megaphone':
      for (const e of alive(c)) e.countdown += 2;
      ev.push({ t: 'effects', effects: alive(c).map((e) => ({ kind: 'status' as const, amount: 2, uid: e.uid, status: 'freeze' as const })) });
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
}

export function previewMove(run: RunState, mods: Mods, move: Move): MovePreview {
  const c = run.combat;
  const empty: MovePreview = { valid: false, groups: [], blast: null, tally: newTally(), damage: 0, armor: 0, charge: 0, coins: 0, specials: 0 };
  if (!c || !isValidMove(c.board, move, mods.wrap)) return empty;
  const cells = swapCells(c.board.cells, move);
  const groups = findGroups(cells, mods.wrap, moveCells(move));
  const set = swapBlast(cells, move, mods);
  const ctx: Ctx = { run, c, mods, ev: [], fx: [], wave: 1, pendingDeaths: [], rocketsThisMove: 0, ms: newMoveState() };
  const scores: TileScore[] = [];
  const matched = new Set(groups.flatMap((g) => g.cells));
  if (set) ctx.ms.tally.mult += WAVE_MULT[set.blast.kind] ?? 0;
  for (const g of groups) scoreGroup(ctx, g, cells, 1, scores);
  if (set) for (const i of set.blast.cells) if (!matched.has(i)) scoreTile(ctx, cells[i], i, null, 1, scores);
  const t = ctx.ms.tally;
  const mult = t.mult * t.xmult;
  let damage = Math.round(t.dmg * mult);
  const target = targetEnemy(c);
  if (target && ENEMIES[target.def].material === 'paper') damage *= mods.paperX;
  return {
    valid: true,
    groups,
    blast: set?.blast ?? null,
    tally: t,
    damage,
    armor: Math.round(t.armor * mult * ctx.ms.armorX),
    charge: Math.round(t.charge),
    coins: Math.round(t.coins),
    specials: groups.filter((g) => g.make).length,
  };
}

export { shuffle };

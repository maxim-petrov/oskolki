import {
  area,
  canShift,
  cloneCells,
  colOf,
  createBoard,
  findGroups,
  gravity,
  idx,
  isValidMove,
  makeTile,
  moveCells,
  neighbors,
  randomCells,
  randomFam,
  reshuffle,
  rowOf,
  shiftCells,
  validMoves,
} from './board.ts';
import { chance, next, pick } from './rng.ts';
import { ENEMIES } from './content/enemies.ts';
import { FLOORS } from './content/floors.ts';
import { ITEMS, type Mods } from './content/items.ts';
import {
  CELLS,
  FAMS,
  H,
  W,
  type Blast,
  type Combat,
  type Effect,
  type EnemyState,
  type Fam,
  type GameEvent,
  type Group,
  type Intent,
  type Move,
  type Room,
  type RunState,
  type Tile,
  type TileKind,
} from './types.ts';

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
  coinsThisMove: number;
  echoUsed: boolean;
}

export const MAX_ENEMIES = 3;
/** Read through a function so TypeScript does not narrow away later mutations. */
const isDead = (run: RunState) => run.phase === 'dead';
export const OVERTIME_AFTER = 20;

export function damageStat(run: RunState, mods: Mods): number {
  return Math.max(0.25, (run.hero.baseDamage + mods.damage) * mods.damageMul * (mods.lamp ? 1.2 : 1));
}

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

/** Damage an attack intent will deal, as shown to the player. */
export function intentDamage(c: Combat, e: EnemyState): number {
  const i = currentIntent(e);
  if (i.kind === 'attack' || i.kind === 'heavy' || i.kind === 'strike') return i.value + e.dmgBonus + overtimeBonus(c);
  return 0;
}

export function makeEnemy(run: RunState, c: Combat, defId: string, mods: Mods): EnemyState {
  const def = ENEMIES[defId];
  const floor = FLOORS[run.floor];
  const hp = Math.max(1, Math.round(def.hp * floor.hpMul));
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
    pendingPhase: 0,
    bleed: 0,
    burn: 0,
    burnTurns: 0,
    stunned: false,
    submerged: false,
    shining: false,
    hitOnce: false,
    dmgBonus: floor.dmgAdd,
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

export function startCombat(run: RunState, room: Room, mods: Mods, ev: GameEvent[]): Combat {
  const board = createBoard(run.rng.board, mods.wrap, 6, run.nextId);
  const c: Combat = {
    roomId: room.id,
    board,
    enemies: [],
    target: -1,
    moves: 0,
    ticks: 0,
    freeTicks: 0,
    damageTaken: 0,
    boss: room.kind === 'boss',
    nextUid: 1,
    garland: 0,
    clock: 0,
  };
  for (const id of room.enemies) c.enemies.push(makeEnemy(run, c, id, mods));
  c.target = c.enemies[0]?.uid ?? -1;
  run.hero.armor = Math.min(mods.armorCap, mods.startArmor);
  ev.push({ t: 'combatStart', room: room.id, boss: c.boss });
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

// ── Effects ──────────────────────────────────────────────────────────

/** Armor takes one enemy blow and burns out: shields answer the next hit, not every hit. */
export function hurtHero(ctx: Ctx, amount: number, source: string, burnsArmor = false) {
  const hero = ctx.run.hero;
  let left = Math.max(0, amount);
  const armor = Math.min(hero.armor, left);
  hero.armor -= armor;
  if (burnsArmor) hero.armor = 0;
  left -= armor;
  const soul = Math.min(hero.soul, left);
  hero.soul -= soul;
  left -= soul;
  const red = Math.min(hero.hp, left);
  hero.hp -= red;
  ctx.c.damageTaken += soul + red;
  ctx.run.stats.damageTaken += soul + red;
  if (hero.hp + hero.soul <= 0) {
    if (ctx.mods.flash && !hero.flashUsed) {
      hero.flashUsed = true;
      hero.hp = 1;
      ctx.fx.push({ kind: 'proc', amount: 0, source: 'flash', text: 'Резервная копия!' });
    } else {
      ctx.run.phase = 'dead';
      ctx.run.stats.deathCause = source;
    }
  }
  return { amount, armor, soul, red };
}

function killEnemy(ctx: Ctx, e: EnemyState) {
  const { run, c } = ctx;
  ctx.fx.push({ kind: 'kill', amount: 0, uid: e.uid });
  run.stats.kills++;
  const def = ENEMIES[e.def];
  let coins = def.coins ?? 0;
  coins += e.stolen;
  if (coins > 0) {
    run.hero.coins = Math.min(99, run.hero.coins + coins);
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

export function hitEnemy(
  ctx: Ctx,
  uid: number,
  raw: number,
  opts: { from?: number[]; source: string; blade?: boolean; fam?: Fam | 'prism' },
): number {
  const e = ctx.c.enemies.find((x) => x.uid === uid && x.hp > 0);
  if (!e || raw <= 0) return 0;
  if (e.submerged && opts.source === 'blade') {
    ctx.fx.push({ kind: 'damage', amount: 0, uid, blocked: raw, from: opts.from, source: opts.source, text: 'Под водой' });
    return 0;
  }
  let dmg = raw;
  if (opts.blade) {
    if (!e.hitOnce && ctx.mods.firstHitDouble) {
      dmg *= 2;
      ctx.fx.push({ kind: 'proc', amount: 0, source: 'timesheet', text: 'Точно!' });
    }
    e.hitOnce = true;
    if (!ctx.mods.pierce) dmg = Math.max(0, dmg - e.armor);
  }
  if (ctx.mods.chaos) dmg = dmg * (0.5 + next(ctx.run.rng.fx) * 2);
  dmg = Math.max(0, Math.round(dmg));
  let blocked = 0;
  if (e.block > 0 && !(opts.blade && ctx.mods.pierce)) {
    blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    dmg -= blocked;
  }
  const dealt = Math.min(e.hp, dmg);
  e.hp -= dmg;
  ctx.run.stats.damageDealt += dealt;
  if (ctx.wave >= 2) ctx.run.stats.cascadeDamage += dealt;
  else if (ctx.wave === 1) ctx.run.stats.matchDamage += dealt;
  ctx.fx.push({ kind: 'damage', amount: dmg, uid, blocked, from: opts.from, source: opts.source, fam: opts.fam });
  if (opts.blade && e.shining && e.hp > 0) {
    const hurt = hurtHero(ctx, 1, 'Отражение Кривого зеркала');
    ctx.fx.push({ kind: 'proc', amount: hurt.red + hurt.soul, uid, source: 'reflect', text: 'Отражение!' });
  }
  if (e.hp <= 0) killEnemy(ctx, e);
  return dmg;
}

function gainArmor(ctx: Ctx, n: number, from: number[] | undefined, source: string) {
  const hero = ctx.run.hero;
  const before = hero.armor;
  hero.armor = Math.min(ctx.mods.armorCap, hero.armor + n);
  ctx.fx.push({ kind: 'armor', amount: hero.armor - before, from, source, fam: 'shield' });
}

function gainCharge(ctx: Ctx, n: number, from: number[] | undefined, source: string) {
  const hero = ctx.run.hero;
  const cap = activeCost(ctx.run);
  const before = hero.charge;
  hero.charge = Math.min(cap, hero.charge + n);
  ctx.fx.push({ kind: 'charge', amount: hero.charge - before, from, source, fam: 'ink' });
}

function gainCoins(ctx: Ctx, n: number, from: number[] | undefined, source: string) {
  const hero = ctx.run.hero;
  const before = hero.coins;
  hero.coins = Math.min(99, hero.coins + n);
  const got = hero.coins - before;
  ctx.run.stats.coinsEarned += got;
  ctx.coinsThisMove += got;
  ctx.fx.push({ kind: 'coins', amount: got, from, source, fam: 'coin' });
}

function setStatus(ctx: Ctx, e: EnemyState, status: 'bleed' | 'burn' | 'stun' | 'freeze', value: number) {
  ctx.fx.push({ kind: 'status', amount: value, uid: e.uid, status });
}

/** Family effect for n tiles. `group` = a real match group (items that react to matches). */
function famEffect(ctx: Ctx, fam: Fam, n: number, from: number[], mult: number, group: boolean) {
  const { run, mods, c } = ctx;
  if (n <= 0) return;
  const big = group && n >= 4;
  let target = targetEnemy(c);
  if (fam === 'blade' && group && target?.submerged) target = alive(c).find((e) => !e.submerged) ?? target;
  switch (fam) {
    case 'blade': {
      const dmg = Math.round(n * damageStat(run, mods) * mult);
      if (target) {
        hitEnemy(ctx, target.uid, dmg, { from, source: group ? 'blade' : 'blast', blade: true, fam });
        if (mods.bleedOnHit && target.hp > 0) {
          target.bleed += 1;
          setStatus(ctx, target, 'bleed', target.bleed);
        }
      }
      if (mods.planeOn4 && big) {
        ctx.fx.push({ kind: 'proc', amount: 0, source: 'plane', text: 'Самолётик!' });
        for (const e of alive(c)) hitEnemy(ctx, e.uid, 2, { source: 'plane' });
      }
      break;
    }
    case 'shield': {
      const gain = Math.round(Math.max(0, n - 2) * mult);
      if (gain > 0) gainArmor(ctx, gain, from, group ? 'shield' : 'blast');
      if (mods.shieldDamage && gain > 0 && target) hitEnemy(ctx, target.uid, gain * 2, { from, source: 'tape', fam });
      if (mods.freezeOn4Shields && big) {
        for (const e of alive(c)) {
          e.countdown += 1;
          setStatus(ctx, e, 'freeze', 1);
        }
      }
      if (group && c.board.flood > 0 && from.some((i) => rowOf(i) >= H - c.board.flood)) {
        c.board.flood -= 1;
        ctx.fx.push({ kind: 'proc', amount: 0, source: 'tide', text: 'Вода отступает' });
      }
      break;
    }
    case 'ink': {
      const gain = Math.round(n * mult);
      gainCharge(ctx, gain, from, group ? 'ink' : 'blast');
      if (mods.inkDamage && target) hitEnemy(ctx, target.uid, Math.round(n * mods.inkDamage * mult), { from, source: 'inkwell', fam });
      break;
    }
    case 'coin': {
      const gain = Math.round((Math.max(0, n - 2) + (group ? mods.coinBonus : 0)) * mult);
      if (gain > 0) gainCoins(ctx, gain, from, group ? 'coin' : 'blast');
      if (mods.coinDamage && target) hitEnemy(ctx, target.uid, Math.round(n * mods.coinDamage * mult), { from, source: 'register', fam });
      break;
    }
  }
  const burnTarget = targetEnemy(c);
  if (mods.igniteOn4 && big && burnTarget) {
    burnTarget.burn = Math.max(burnTarget.burn, 2);
    burnTarget.burnTurns = Math.max(burnTarget.burnTurns, 3);
    setStatus(ctx, burnTarget, 'burn', 3);
  }
}

// ── Resolution ───────────────────────────────────────────────────────

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

function blastArea(ctx: Ctx, i: number, t: Tile, fam: Fam | undefined, cells: Tile[]): { kind: Blast['kind']; cells: number[] } {
  const r = rowOf(i);
  const col = colOf(i);
  const row = Array.from({ length: W }, (_, k) => idx(r, k));
  const column = Array.from({ length: H }, (_, k) => idx(k, col));
  if (t.kind === 'prism') {
    const f = fam ?? mostCommonFam(cells);
    return { kind: 'prism', cells: cells.map((x, k) => (x.kind === f || k === i ? k : -1)).filter((k) => k >= 0) };
  }
  if (t.special === 'rocketH') return { kind: 'rocketH', cells: ctx.mods.crossRockets ? [...new Set([...row, ...column])] : row };
  if (t.special === 'rocketV') return { kind: 'rocketV', cells: ctx.mods.crossRockets ? [...new Set([...column, ...row])] : column };
  return { kind: 'bomb', cells: area(i, ctx.mods.bombRadius) };
}

/**
 * Resolve matches and cascades until the board is stable.
 * `forced` is an initial blast (player bomb, shredder) that happens before matching.
 */
export function resolve(ctx: Ctx, prefer: number[], forced?: Blast) {
  const { c, mods } = ctx;
  let first = true;
  for (let wave = 1; wave <= 30; wave++) {
    const cells = c.board.cells;
    const groups: Group[] = findGroups(cells, mods.wrap, first ? prefer : []);
    if (!groups.length && !forced) break;
    ctx.wave = wave;
    const waveFx: Effect[] = [];
    ctx.fx = waveFx;
    const matched = new Set<number>();
    for (const g of groups) for (const i of g.cells) matched.add(i);

    // Specials activated by this wave (matched specials, forced blasts, chains).
    const blasts: Blast[] = [];
    const blasted = new Set<number>();
    const activated = new Set<number>();
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
    let rocketsNow = 0;
    while (queue.length) {
      const { i, fam } = queue.shift()!;
      if (activated.has(i)) continue;
      activated.add(i);
      const t = cells[i];
      const fromKind = t.kind === 'prism' || t.kind === 'junk' ? undefined : t.kind;
      const b = blastArea(ctx, i, t, fam ?? (t.kind === 'prism' ? undefined : fromKind), cells);
      blasts.push({ kind: b.kind, at: i, cells: b.cells });
      if (b.kind === 'rocketH' || b.kind === 'rocketV') rocketsNow++;
      for (const k of b.cells) {
        if (!matched.has(k)) blasted.add(k);
        const u = cells[k];
        if ((u.special || u.kind === 'prism') && !activated.has(k)) {
          const f = u.kind === 'prism' || u.kind === 'junk' ? undefined : (u.kind as Fam);
          queue.push({ i: k, fam: f });
        }
      }
    }
    ctx.rocketsThisMove += rocketsNow;
    if (blasts.length && mods.pyroBlast) {
      const t = targetEnemy(c);
      if (t) {
        t.burn = Math.max(t.burn, 2);
        t.burnTurns = Math.max(t.burnTurns, 3);
        setStatus(ctx, t, 'burn', 3);
      }
    }

    // Junk next to a match is washed away; magnet pulls neighbouring coins.
    const splashed = new Set<number>();
    for (const i of matched)
      for (const n of neighbors(i)) {
        if (matched.has(n) || blasted.has(n)) continue;
        if (cells[n].kind === 'junk') splashed.add(n);
        else if (mods.magnet && cells[n].kind === 'coin' && !cells[n].special) splashed.add(n);
      }

    // Effects: groups first (in family order), then blasted tiles per family, then magnet coins.
    for (const g of groups) {
      let n = g.size + (mods.bureau ? 1 : 0);
      let mult = 1;
      if (mods.luck > 0 && chance(ctx.run.rng.fx, mods.luck)) {
        mult = 2;
        waveFx.push({ kind: 'proc', amount: 0, source: 'lucky', text: 'Удача ×2' });
      }
      famEffect(ctx, g.fam, n, g.cells, mult, true);
      if (mods.echo && !ctx.echoUsed) {
        ctx.echoUsed = true;
        waveFx.push({ kind: 'proc', amount: 0, source: 'carbon', text: 'Копирка!' });
        famEffect(ctx, g.fam, n, g.cells, 0.5, false);
      }
      n = 0;
    }
    const blastCount = new Map<Fam, number[]>();
    for (const i of blasted) {
      const k = cells[i].kind;
      if (k === 'prism' || k === 'junk') continue;
      blastCount.set(k, [...(blastCount.get(k) ?? []), i]);
    }
    for (const f of FAMS) {
      const list = blastCount.get(f);
      if (list?.length) famEffect(ctx, f, list.length, list, 1, false);
    }
    const magnetCoins = [...splashed].filter((i) => cells[i].kind === 'coin');
    if (magnetCoins.length) gainCoins(ctx, magnetCoins.length, magnetCoins, 'magnet');

    // Remove, create specials, drop.
    const cleared: { i: number; id: number; kind: TileKind; cause: 'match' | 'blast' | 'splash' }[] = [];
    const next: (Tile | null)[] = cells.slice();
    for (const i of matched) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'match' });
      next[i] = null;
    }
    for (const i of blasted) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'blast' });
      next[i] = null;
    }
    for (const i of splashed) {
      cleared.push({ i, id: cells[i].id, kind: cells[i].kind, cause: 'splash' });
      next[i] = null;
    }
    const created: { at: number; tile: Tile }[] = [];
    for (const g of groups) {
      let make = g.make;
      if (!make || g.at < 0) continue;
      if (mods.prismOn4 && (make === 'rocketH' || make === 'rocketV')) make = 'prism';
      if (created.some((x) => x.at === g.at)) continue;
      const tile =
        make === 'prism'
          ? makeTile(c.board, 'prism')
          : makeTile(c.board, g.fam, { special: make });
      next[g.at] = tile;
      created.push({ at: g.at, tile: { ...tile } });
    }
    const { falls, spawns } = gravity(c.board, ctx.run.rng.board, next);
    syncIds(ctx.run, c);
    ctx.ev.push({
      t: 'wave',
      n: wave,
      groups,
      blasts,
      cleared,
      created,
      effects: waveFx,
      falls,
      spawns,
      board: snap(c.board.cells),
      queue: snapQueue(c),
      flood: c.board.flood,
    });
    ctx.run.stats.maxCombo = Math.max(ctx.run.stats.maxCombo, wave);
    flushDeaths(ctx);
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
        hitEnemy(ctx, e.uid, e.bleed, { source: 'bleed' });
        e.bleed = Math.max(0, e.bleed - 1);
      }
      if (e.hp > 0 && e.burnTurns > 0) {
        hitEnemy(ctx, e.uid, e.burn, { source: 'burn' });
        e.burnTurns--;
      }
    }
    if (mods.spider > 0) {
      const weakest = alive(c).sort((a, b) => a.hp - b.hp)[0];
      if (weakest) hitEnemy(ctx, weakest.uid, mods.spider, { source: 'spider' });
    }
    if (mods.battery > 0) gainCharge(ctx, mods.battery, undefined, 'battery');
    if (mods.accountant && ctx.coinsThisMove >= 5) gainArmor(ctx, Math.floor(ctx.coinsThisMove / 5), undefined, 'accountant');
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

const plain = (t: Tile) => !t.special && t.kind !== 'prism' && t.kind !== 'junk' && !t.pin && !t.fuse;

function enemyAct(ctx: Ctx, e: EnemyState) {
  const { c, run, mods } = ctx;
  const intent = currentIntent(e);
  e.block = 0;
  e.submerged = false;
  e.shining = false;
  if (e.stunned) {
    e.stunned = false;
    ctx.ev.push({ t: 'enemyAct', uid: e.uid, intent, skipped: true });
    advanceCycle(ctx, e);
    return;
  }
  const cells = c.board.cells;
  const act: Extract<GameEvent, { t: 'enemyAct' }> = { t: 'enemyAct', uid: e.uid, intent };
  const attack = (dmg: number) => {
    const prev = ctx.fx;
    const list: Effect[] = [];
    ctx.fx = list;
    act.hurt = hurtHero(ctx, dmg, ENEMIES[e.def].name, true);
    ctx.fx = prev;
    ctx.ev.push(act);
    if (list.length) ctx.ev.push({ t: 'effects', effects: list });
    if (mods.cactus > 0 && !isDead(run)) batch(ctx, () => hitEnemy(ctx, e.uid, mods.cactus, { source: 'cactus' }));
  };
  switch (intent.kind) {
    case 'attack':
    case 'heavy':
      attack(intent.value + e.dmgBonus + overtimeBonus(c));
      break;
    case 'strike': {
      const pinned = randomCells(run.rng.ai, cells, 1, (t) => t.kind !== 'junk' && !t.pin);
      for (const i of pinned) cells[i].pin = true;
      act.cells = pinned;
      act.board = snap(cells);
      attack(intent.value + e.dmgBonus + overtimeBonus(c));
      break;
    }
    case 'block':
      e.block = intent.value;
      ctx.ev.push(act);
      break;
    case 'heal': {
      const hurt = alive(c)
        .filter((x) => x.hp < x.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const amount = Math.min(intent.value, hurt.maxHp - hurt.hp);
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
      const chosen = randomCells(run.rng.ai, cells, intent.value, plain);
      for (const i of chosen) {
        cells[i] = { id: cells[i].id, kind: 'junk' };
      }
      act.cells = chosen;
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    }
    case 'pin': {
      const chosen = randomCells(run.rng.ai, cells, intent.value, (t) => t.kind !== 'junk' && !t.pin);
      for (const i of chosen) cells[i].pin = true;
      act.cells = chosen;
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    }
    case 'ember': {
      const chosen = randomCells(run.rng.ai, cells, intent.value, plain);
      for (const i of chosen) cells[i].fuse = 3;
      act.cells = chosen;
      act.board = snap(cells);
      ctx.ev.push(act);
      break;
    }
    case 'censor': {
      if (!mods.censorImmune) {
        const chosen = randomCells(run.rng.ai, cells, intent.value, (t) => !t.hidden);
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
      const stolen = Math.min(run.hero.coins, intent.value);
      run.hero.coins -= stolen;
      e.stolen += stolen;
      act.stolen = stolen;
      ctx.ev.push(act);
      break;
    }
    case 'pinch': {
      const rows = Array.from({ length: H }, (_, r) => r).filter((r) => canShift(c.board, 'row', r));
      const options: Move[] = [];
      for (const r of rows)
        for (const d of [1, W - 1]) {
          const m: Move = { line: 'row', index: r, delta: d };
          if (!findGroups(shiftCells(cells, m), mods.wrap).length) options.push(m);
        }
      if (options.length) {
        const m = pick(run.rng.ai, options);
        c.board.cells = shiftCells(cells, m);
        act.cells = moveCells(m);
        act.board = snap(c.board.cells);
        ctx.ev.push(act);
      } else attack(1 + e.dmgBonus);
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
        cells[i] = { id: cells[i].id, kind: cells[i].kind === 'prism' ? randomFam(run.rng.ai) : cells[i].kind, pin: cells[i].pin };
        act.cells = [i];
        act.board = snap(cells);
        ctx.ev.push(act);
      } else attack(1 + e.dmgBonus + overtimeBonus(c));
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
    const hurt = mods.emberImmune ? { amount: 0, armor: 0, soul: 0, red: 0 } : hurtHero(ctx, burnt.length, 'Уголёк');
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
  } else if (mods.coffeeFirstMove && c.moves === 1) skip = 'Кофеман: первый ход даром';
  else if (mods.clockEvery > 0 && c.moves % mods.clockEvery === 0) skip = 'Часы остановились';
  if (skip) {
    ctx.ev.push({ t: 'effects', effects: [{ kind: 'proc', amount: 0, source: 'time', text: skip }] });
    return;
  }
  c.ticks++;
  for (const e of alive(c)) e.countdown -= 1;
  ctx.ev.push({ t: 'tick', timers: alive(c).map((e) => ({ uid: e.uid, countdown: e.countdown })) });
  boardTimers(ctx);
  if (isDead(ctx.run)) return;
  for (const e of c.enemies) {
    if (e.hp <= 0 || e.countdown > 0) continue;
    enemyAct(ctx, e);
    flushDeaths(ctx);
    if (isDead(ctx.run)) return;
  }
}

export function ensurePlayable(ctx: Ctx) {
  const { c, mods, run } = ctx;
  if (!alive(c).length) return;
  if (validMoves(c.board, mods.wrap).length === 0) {
    reshuffle(c.board, run.rng.board, mods.wrap);
    ctx.ev.push({ t: 'board', reason: 'reshuffle', board: snap(c.board.cells), queue: snapQueue(c) });
  }
}

export function newCtx(run: RunState, mods: Mods, ev: GameEvent[]): Ctx {
  return {
    run,
    c: run.combat!,
    mods,
    ev,
    fx: [],
    wave: 0,
    pendingDeaths: [],
    rocketsThisMove: 0,
    coinsThisMove: 0,
    echoUsed: false,
  };
}

// ── Player actions ──────────────────────────────────────────────────

export function playerMove(run: RunState, mods: Mods, move: Move, ev: GameEvent[]): boolean {
  const c = run.combat!;
  const size = move.line === 'row' ? W : H;
  const m: Move = { ...move, delta: ((move.delta % size) + size) % size };
  if (!isValidMove(c.board, m, mods.wrap)) {
    ev.push({ t: 'invalid', reason: canShift(c.board, m.line, m.index) ? 'Нет совпадения' : 'Линия закреплена' });
    return false;
  }
  const ctx = newCtx(run, mods, ev);
  c.board.cells = shiftCells(c.board.cells, m);
  c.moves++;
  run.stats.moves++;
  ev.push({ t: 'shift', move: m, board: snap(c.board.cells) });
  resolve(ctx, moveCells(m));
  run.stats.maxRocketsInMove = Math.max(run.stats.maxRocketsInMove, ctx.rocketsThisMove);
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

export function playerBomb(run: RunState, mods: Mods, cell: number, ev: GameEvent[]): boolean {
  if (run.hero.bombs <= 0 || cell < 0 || cell >= CELLS) {
    ev.push({ t: 'invalid', reason: 'Нет бомб' });
    return false;
  }
  run.hero.bombs--;
  run.stats.bombsUsed++;
  const ctx = newCtx(run, mods, ev);
  resolve(ctx, [], { kind: 'bomb-item', at: cell, cells: area(cell, mods.bombRadius) });
  afterAction(ctx, false);
  return true;
}

export function playerActive(
  run: RunState,
  mods: Mods,
  arg: { cell?: number; col?: number; uid?: number },
  ev: GameEvent[],
): boolean {
  const hero = run.hero;
  const id = hero.active;
  const def = id ? ITEMS[id] : undefined;
  const c = run.combat;
  if (!def || !c || def.when === 'explore') {
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
  hero.charge -= def.charge ?? 0;
  ev.push({ t: 'activeUsed', item: def.id });
  switch (def.id) {
    case 'eraser': {
      const i = arg.cell!;
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
        effects: [],
        falls,
        spawns,
        board: snap(c.board.cells),
        queue: snapQueue(c),
        flood: c.board.flood,
      });
      resolve(ctx, []);
      break;
    }
    case 'coffeeToGo':
      c.freeTicks += 2;
      break;
    case 'stapler': {
      const e = c.enemies.find((x) => x.uid === arg.uid)!;
      e.stunned = true;
      ev.push({ t: 'effects', effects: [{ kind: 'status', amount: 1, uid: e.uid, status: 'stun' }] });
      break;
    }
    case 'corrector':
    case 'mop': {
      for (let i = 0; i < CELLS; i++) {
        const t = cells[i];
        if (t.kind === 'junk') cells[i] = { id: t.id, kind: randomFam(run.rng.board) };
        else cells[i] = { ...t, pin: undefined, fuse: undefined, hidden: undefined };
        if (!cells[i].pin) delete cells[i].pin;
        if (!cells[i].fuse) delete cells[i].fuse;
        if (!cells[i].hidden) delete cells[i].hidden;
      }
      c.board.colLock.fill(0);
      c.board.rowLock.fill(0);
      ev.push({ t: 'board', reason: 'active', board: snap(cells) });
      if (def.id === 'mop') batch(ctx, () => gainArmor(ctx, 1, undefined, 'mop'));
      resolve(ctx, []);
      break;
    }
    case 'shredder': {
      const col = arg.col!;
      resolve(ctx, [], { kind: 'active', at: idx(0, col), cells: Array.from({ length: H }, (_, r) => idx(r, col)) });
      break;
    }
    case 'megaphone':
      for (const e of alive(c)) e.countdown += 2;
      ev.push({
        t: 'effects',
        effects: alive(c).map((e) => ({ kind: 'status' as const, amount: 2, uid: e.uid, status: 'freeze' as const })),
      });
      break;
    case 'giftbox': {
      const chosen = randomCells(run.rng.fx, cells, 3, (t) => !t.special && t.kind !== 'prism' && t.kind !== 'junk' && !t.pin);
      chosen.forEach((i, k) => {
        if (k < 2) cells[i] = { ...cells[i], special: 'bomb' };
        else cells[i] = { id: cells[i].id, kind: 'prism' };
      });
      ev.push({ t: 'board', reason: 'active', board: snap(cells) });
      resolve(ctx, []);
      break;
    }
    default:
      break;
  }
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
  damage: number;
  armor: number;
  charge: number;
  coins: number;
  specials: number;
}

export function previewMove(run: RunState, mods: Mods, move: Move): MovePreview {
  const c = run.combat;
  const empty = { valid: false, groups: [], damage: 0, armor: 0, charge: 0, coins: 0, specials: 0 };
  if (!c) return empty;
  const size = move.line === 'row' ? W : H;
  const m: Move = { ...move, delta: ((move.delta % size) + size) % size };
  if (m.delta === 0 || !canShift(c.board, m.line, m.index)) return empty;
  const cells = shiftCells(c.board.cells, m);
  const groups = findGroups(cells, mods.wrap, moveCells(m));
  if (!groups.length) return empty;
  const dmgStat = damageStat(run, mods);
  let damage = 0;
  let armor = 0;
  let charge = 0;
  let coins = 0;
  let specials = 0;
  for (const g of groups) {
    const n = g.size + (mods.bureau ? 1 : 0);
    if (g.fam === 'blade') damage += Math.round(n * dmgStat);
    if (g.fam === 'shield') armor += Math.max(0, n - 2);
    if (g.fam === 'ink') charge += n;
    if (g.fam === 'coin') coins += Math.max(0, n - 2) + mods.coinBonus;
    if (g.make) specials++;
  }
  return { valid: true, groups, damage, armor, charge, coins, specials };
}


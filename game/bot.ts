/**
 * Simple players for balance simulation and smoke tests.
 * They only read what a human sees: the board (censored tiles unknown), the visible queue,
 * enemy intents and timers. They never inspect hidden refills or RNG state.
 */
import { validMoves } from './board.ts';
import { alive, currentIntent, intentDamage, previewMove } from './combat.ts';
import { ITEMS } from './content/items.ts';
import { chance, int, next, rng, type Rng } from './rng.ts';
import { currentRoom, dispatch, doorDirs, modsOf } from './run.ts';
import type { Action, Dir, Move, RunState } from './types.ts';
import { DIRS, STEP } from './mapgen.ts';

export type Policy = 'random' | 'greedy' | 'first';

export interface BotOptions {
  policy: Policy;
  /** Take items from pedestals/shops. */
  items: boolean;
  seed: number;
}

function threat(run: RunState): number {
  const c = run.combat!;
  let t = 0;
  for (const e of alive(c)) if (e.countdown <= 1) t += intentDamage(c, e);
  return Math.max(0, t - run.hero.armor);
}

function scoreMove(run: RunState, m: Move): number {
  const mods = modsOf(run);
  const p = previewMove(run, mods, m);
  if (!p.valid) return -1;
  const danger = threat(run);
  const hpFactor = run.hero.hp + run.hero.soul <= 2 ? 1.6 : 1;
  const armorValue = danger > 0 ? 7 * hpFactor : run.hero.armor < 2 ? 2.5 : 0.6;
  const cost = run.hero.active ? (ITEMS[run.hero.active].charge ?? 6) : 0;
  const chargeValue = run.hero.charge < cost ? 1.2 : 0.1;
  return p.damage * 3 + Math.min(p.armor, 4) * armorValue + p.charge * chargeValue + p.coins * 1.5 + p.specials * 5;
}

function pickTarget(run: RunState): number | null {
  const c = run.combat!;
  const list = alive(c).filter((e) => !e.submerged);
  if (!list.length) return null;
  const rank = (e: (typeof list)[number]) => {
    const i = currentIntent(e);
    const dmg = intentDamage(c, e);
    const support = i.kind === 'heal' || i.kind === 'summon' ? 3 : 0;
    return (dmg + support) / Math.max(1, e.countdown) + 8 / Math.max(1, e.hp);
  };
  return list.sort((a, b) => rank(b) - rank(a))[0].uid;
}

function combatAction(run: RunState, policy: Policy, r: Rng): Action | null {
  const c = run.combat!;
  const mods = modsOf(run);
  // Actives: spend when charged, with simple aims.
  const active = run.hero.active ? ITEMS[run.hero.active] : null;
  if (policy !== 'random' && active && active.when !== 'explore' && run.hero.charge >= (active.charge ?? 99)) {
    if (active.aim === 'enemy') {
      const t = pickTarget(run);
      if (t !== null) return { type: 'active', uid: t };
    } else if (active.aim === 'cell') {
      const bad = c.board.cells.findIndex((t) => t.fuse || t.pin || t.kind === 'junk');
      if (bad >= 0) return { type: 'active', cell: bad };
    } else if (active.aim === 'col') {
      return { type: 'active', col: int(r, 6) };
    } else return { type: 'active' };
  }
  if (policy !== 'random') {
    const t = pickTarget(run);
    if (t !== null && t !== c.target) return { type: 'target', uid: t };
  }
  const moves = validMoves(c.board, mods.wrap);
  if (!moves.length) return null;
  if (policy === 'random') return { type: 'move', move: moves[int(r, moves.length)] };
  if (policy === 'first') return { type: 'move', move: moves[0] };
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = scoreMove(run, m) + next(r) * 0.01;
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return { type: 'move', move: best };
}

/** BFS path (first step) to the nearest room that satisfies `want`. */
function stepToward(run: RunState, want: (id: number) => boolean): Dir | null {
  const start = run.room;
  const prev = new Map<number, { from: number; dir: Dir }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const id = queue.shift()!;
    if (id !== start && want(id)) {
      let cur = id;
      let dir: Dir | null = null;
      while (cur !== start) {
        const p = prev.get(cur)!;
        dir = p.dir;
        cur = p.from;
      }
      return dir;
    }
    const room = run.map.rooms[id];
    for (const d of DIRS) {
      const n = room.doors[d];
      if (n === undefined || seen.has(n)) continue;
      const nr = run.map.rooms[n];
      if (nr.hidden) continue;
      if (nr.locked && run.hero.keys <= 0) continue;
      seen.add(n);
      prev.set(n, { from: id, dir: d });
      queue.push(n);
    }
  }
  return null;
}

function exploreAction(run: RunState, opts: BotOptions, r: Rng): Action | null {
  const room = currentRoom(run);
  if (opts.items) {
    const ped = room.pedestals.find((p) => !p.taken && (!p.hearts || run.hero.hearts > p.hearts + 1));
    if (ped && !(ITEMS[ped.item].kind === 'active' && run.hero.active && chance(r, 0.5))) return { type: 'pedestal', id: ped.id };
    if (room.kind === 'shop') {
      const slot = room.shop
        .filter((s) => !s.sold && s.price <= run.hero.coins)
        .filter((s) => s.kind === 'item' || ((s.kind === 'half' || s.kind === 'heart') && run.hero.hp < run.hero.hearts * 2))
        .sort((a, b) => (a.kind === 'item' ? -1 : 1) - (b.kind === 'item' ? -1 : 1))[0];
      if (slot) return { type: 'buy', id: slot.id };
    }
  }
  const chest = room.pickups.find((p) => p.kind === 'lockedChest' && run.hero.keys > 0);
  if (chest) return { type: 'take', pickup: chest.id };
  const heartPick = room.pickups.find((p) => (p.kind === 'half' || p.kind === 'heart') && run.hero.hp < run.hero.hearts * 2);
  if (heartPick) return { type: 'take', pickup: heartPick.id };
  // Secret room guess: bomb the wall with most neighbouring rooms when rich in bombs.
  if (run.hero.bombs >= 3 && opts.policy !== 'random') {
    for (const d of DIRS) {
      if (room.doors[d] !== undefined) continue;
      const x = room.x + STEP[d][0];
      const y = room.y + STEP[d][1];
      const touching = DIRS.filter((dd) =>
        run.map.rooms.some((o) => !o.hidden && o.x === x + STEP[dd][0] && o.y === y + STEP[dd][1]),
      ).length;
      if (touching >= 3) return { type: 'bombWall', dir: d };
    }
  }
  if (room.kind === 'boss' && room.trapdoor && !room.pedestals.some((p) => !p.taken && !p.hearts)) return { type: 'descend' };
  // Visit unexplored rooms first (boss last), then the boss.
  const unvisited = (id: number) => {
    const rr = run.map.rooms[id];
    return !rr.visited && rr.kind !== 'boss' && !rr.hidden;
  };
  const dir = stepToward(run, unvisited) ?? stepToward(run, (id) => run.map.rooms[id].kind === 'boss' && !run.map.rooms[id].cleared);
  if (dir) return { type: 'go', dir };
  if (room.kind === 'boss' && room.trapdoor) return { type: 'descend' };
  const doors = doorDirs(run);
  return doors.length ? { type: 'go', dir: doors[int(r, doors.length)] } : null;
}

/** One decision for the current state (used by the in-browser autoplay debug hook). */
export function decide(run: RunState, opts: BotOptions, r: Rng): Action | null {
  if (run.phase === 'combat') return combatAction(run, opts.policy, r);
  if (run.phase === 'explore') return exploreAction(run, opts, r);
  return null;
}

export interface SimResult {
  won: boolean;
  floor: number;
  room: number;
  moves: number;
  cause: string;
  stats: RunState['stats'];
  items: string[];
  hearts: number;
  fights: { floor: number; moves: number; enemyActs: number; damageTaken: number; boss: boolean }[];
}

export function playRun(start: RunState, opts: BotOptions, maxSteps = 6000): SimResult {
  let run = start;
  const r = rng(opts.seed ^ 0x5bd1e995);
  const fights: SimResult['fights'] = [];
  let fight: SimResult['fights'][number] | null = null;
  let takenAtStart = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (run.phase === 'dead' || run.phase === 'won') break;
    const action = run.phase === 'combat' ? combatAction(run, opts.policy, r) : exploreAction(run, opts, r);
    if (!action) break;
    const res = dispatch(run, action);
    for (const e of res.events) {
      if (e.t === 'combatStart') {
        fight = { floor: res.run.floor, moves: 0, enemyActs: 0, damageTaken: 0, boss: e.boss };
        takenAtStart = run.stats.damageTaken;
      }
      if (e.t === 'enemyAct' && fight) fight.enemyActs++;
      if (e.t === 'swap' && fight) fight.moves++;
      if ((e.t === 'roomClear' || e.t === 'dead') && fight) {
        fight.damageTaken = res.run.stats.damageTaken - takenAtStart;
        fights.push(fight);
        fight = null;
      }
    }
    if (res.events.some((e) => e.t === 'invalid') && action.type !== 'bombWall') {
      // Avoid loops on invalid choices: fall back to a random door or random move.
      if (run.phase === 'combat') {
        const moves = validMoves(run.combat!.board, modsOf(run).wrap);
        if (!moves.length) break;
        run = dispatch(run, { type: 'move', move: moves[int(r, moves.length)] }).run;
        continue;
      }
      const doors = doorDirs(run);
      if (!doors.length) break;
      run = dispatch(run, { type: 'go', dir: doors[int(r, doors.length)] }).run;
      continue;
    }
    run = res.run;
  }
  return {
    won: run.phase === 'won',
    floor: run.floor,
    room: run.room,
    moves: run.stats.moves,
    cause: run.stats.deathCause,
    stats: run.stats,
    items: run.hero.items,
    hearts: run.hero.hearts,
    fights,
  };
}

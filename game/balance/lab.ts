/**
 * Balance lab: plays fights and whole runs with the simulation bots under controlled builds. Used by
 * the balance tests (tests/*.test.mjs) and the report (scripts/balance.mjs). Pure and deterministic:
 * the same spec always gives the same result.
 */
import { decide, type BotOptions, type Policy } from '../bot.ts';
import { addCard, dispatch, gainRelic, newRun } from '../run.ts';
import type { CharId, DevOp, DevState, Finish, GameEvent, RunState } from '../types.ts';
import { checkRun } from './invariants.ts';

export interface CardSpec {
  id: string;
  up?: boolean;
  finish?: Finish;
}

/** The hero's kit at some moment: what a fight is played with. */
export interface Build {
  char: CharId;
  deck: CardSpec[];
  relics: string[];
  active: string | null;
  pockets: (string | null)[];
  hp: number;
  maxHp: number;
  coins: number;
}

export type FightKind = 'fight' | 'elite' | 'boss';

/** A fight as it happened in a simulated run: the build going in and the enemies met. */
export interface Snapshot {
  act: number;
  kind: FightKind;
  /** Fights of this act before this one (the first two draw from the weak encounters). */
  index: number;
  enemies: string[];
  build: Build;
  /** Seed of the run it came from. */
  seed: number;
}

export function buildOf(run: RunState): Build {
  const h = run.hero;
  return {
    char: h.char,
    deck: h.deck.map((c) => ({
      id: c.id,
      ...(c.up ? { up: true } : {}),
      ...(c.finish ? { finish: c.finish } : {}),
    })),
    relics: [...h.relics],
    active: h.active,
    pockets: [...h.pockets],
    hp: h.hp,
    maxHp: h.maxHp,
    coins: h.coins,
  };
}

// ── Fights ───────────────────────────────────────────────────────────

export interface FightSpec {
  act: number;
  kind: FightKind;
  enemies: string[];
  build: Build;
  seed: number;
  policy?: Policy;
  erase?: BotOptions['erase'];
  /** Test knobs (cheats) for benchmarks: frozen enemies, tougher enemies… */
  dev?: DevState;
  /** Stop after this many moves (benchmarks against enemies that cannot die). */
  moves?: number;
  /** Check the engine invariants after every action. */
  check?: boolean;
}

export interface FightResult {
  won: boolean;
  dead: boolean;
  moves: number;
  /** Enemy actions (including skipped, stunned ones). */
  enemyActs: number;
  hpBefore: number;
  hpLost: number;
  /** Damage dealt to enemies (strikes, splash, bleed, burn…). */
  damage: number;
  maxHit: number;
  maxMult: number;
  /** Damage the hero took, by source. */
  hurtBy: Record<string, number>;
  /** The bot had no action or kept making invalid ones: the player would be stuck. */
  stuck: boolean;
  /** The fight hit the step limit while still going (a stalemate build). */
  timeout: boolean;
  invalid: number;
  violations: string[];
}

/** A test run standing right at the start of a fight with the given build. */
export function setupFight(spec: FightSpec): RunState {
  let run = newRun({
    seed: spec.seed,
    char: spec.build.char,
    customSeed: true,
    lastAct: 3,
  }).run;
  const dev = (op: DevOp) => {
    run = dispatch(run, { type: 'dev', op }).run;
  };
  dev({ op: 'act', act: spec.act });
  if (spec.dev) dev({ op: 'set', dev: spec.dev });
  const b = spec.build;
  dev({
    op: 'build',
    deck: b.deck,
    relics: b.relics,
    active: b.active,
    pockets: b.pockets,
  });
  dev({ op: 'hero', maxHp: b.maxHp, hp: b.hp, coins: b.coins, charge: 0 });
  dev({ op: 'enter', kind: spec.kind, enemies: spec.enemies });
  return run;
}

const FIGHT_STEPS = 800;

function seedRng(seed: number) {
  return { s: (seed * 2654435761) >>> 0 || 1 };
}

/** Plays the fight the run stands in with a bot until it ends (or `moves` are made). */
export function playFight(
  start: RunState,
  opts: {
    policy?: Policy;
    erase?: BotOptions['erase'];
    seed: number;
    moves?: number;
    check?: boolean;
  },
): FightResult {
  const policy = opts.policy ?? 'greedy';
  const r = seedRng(opts.seed);
  let run = start;
  const hpBefore = run.hero.hp;
  const dealt0 = run.stats.damageDealt;
  const res: FightResult = {
    won: false,
    dead: false,
    moves: 0,
    enemyActs: 0,
    hpBefore,
    hpLost: 0,
    damage: 0,
    maxHit: 0,
    maxMult: 0,
    hurtBy: {},
    stuck: false,
    timeout: false,
    invalid: 0,
    violations: [],
  };
  let steps = 0;
  let invalidRun = 0;
  while (run.phase === 'combat' && run.combat) {
    if (opts.moves !== undefined && run.combat.moves >= opts.moves) break;
    if (steps >= FIGHT_STEPS) {
      res.timeout = true;
      break;
    }
    const action = decide(run, { policy, seed: opts.seed, erase: opts.erase }, r);
    if (!action) {
      res.stuck = true;
      break;
    }
    const out = dispatch(run, action);
    steps++;
    if (out.events.some((e) => e.t === 'invalid')) {
      res.invalid++;
      if (++invalidRun > 20) {
        res.stuck = true;
        break;
      }
    } else invalidRun = 0;
    tallyEvents(out.events, res, run);
    if (opts.check) for (const v of checkRun(out.run, run)) res.violations.push(`ход ${run.combat.moves}: ${v}`);
    run = out.run;
  }
  res.dead = run.phase === 'dead';
  res.won = !res.dead && run.phase !== 'combat';
  res.hpLost = hpBefore - run.hero.hp;
  res.damage = run.stats.damageDealt - dealt0;
  return res;
}

function tallyEvents(events: GameEvent[], res: FightResult, before: RunState) {
  const c = before.combat;
  for (const e of events) {
    if (e.t === 'swap') res.moves++;
    else if (e.t === 'enemyAct') {
      res.enemyActs++;
      const red = e.hurt?.red ?? 0;
      if (red > 0) {
        const def = c?.enemies.find((x) => x.uid === e.uid)?.def ?? '?';
        res.hurtBy[def] = (res.hurtBy[def] ?? 0) + red;
      }
    } else if (e.t === 'ember' && e.hurt.red > 0) res.hurtBy.ember = (res.hurtBy.ember ?? 0) + e.hurt.red;
    else if (e.t === 'strike') {
      res.maxHit = Math.max(res.maxHit, e.damage);
      res.maxMult = Math.max(res.maxMult, e.tally.mult);
    } else if (e.t === 'effects' || e.t === 'wave')
      for (const f of e.effects) if (f.kind === 'proc' && f.source === 'mirror') res.hurtBy.mirror = (res.hurtBy.mirror ?? 0) + f.amount;
  }
}

export function labFight(spec: FightSpec): FightResult {
  const run = setupFight(spec);
  return playFight(run, {
    policy: spec.policy,
    erase: spec.erase,
    seed: spec.seed,
    moves: spec.moves,
    check: spec.check,
  });
}

// ── Runs ─────────────────────────────────────────────────────────────

export interface RunSpec {
  seed: number;
  char?: CharId;
  policy?: Policy;
  erase?: BotOptions['erase'];
  unlocked?: string[];
  lastAct?: number;
  intro?: boolean;
  /** Given at the start, as if found: passive items or an active skill. */
  relics?: string[];
  /** Added to the deck at the start. */
  cards?: CardSpec[];
  /** Starter cards taken out of the deck at the start (one copy per entry). */
  without?: string[];
  pockets?: string[];
  coins?: number;
  check?: boolean;
  /** Keep the build before every fight (for the fight lab). */
  snapshots?: boolean;
}

export interface FightLog {
  act: number;
  kind: FightKind | 'intro';
  index: number;
  enemies: string[];
  moves: number;
  enemyActs: number;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  won: boolean;
  maxHit: number;
  maxMult: number;
  /** Health of the enemies met (sum at spawn). */
  enemyHp: number;
}

export interface ShopLog {
  act: number;
  coins: number;
  bought: string[];
}

export interface RunResult {
  seed: number;
  won: boolean;
  /** Act reached (0-based) and nodes cleared. */
  act: number;
  floors: number;
  cause: string;
  /** Where the run ended: fight kind or 'event' / '' when won. */
  diedIn: string;
  fights: FightLog[];
  shops: ShopLog[];
  events: { act: number; id: string; option: number }[];
  rests: { heal: number; upgrade: number };
  /** Map nodes entered, by `act:kind`. */
  nodes: Record<string, number>;
  /** Health share at the start of each act and before each boss. */
  actHp: number[];
  bossHp: number[];
  coinsEnd: number;
  deck: number;
  relics: string[];
  maxMult: number;
  maxHit: number;
  /** Damage of strikes made by moves and by free actions (skills and pockets spend no time). */
  dmgMoves: number;
  dmgFree: number;
  moves: number;
  freeActions: number;
  shards: number;
  steps: number;
  stuck: boolean;
  violations: string[];
  snapshots: Snapshot[];
}

/** A fresh run for the spec, with the given kit applied. */
export function startRun(spec: RunSpec): RunState {
  const { run } = newRun({
    seed: spec.seed,
    char: spec.char,
    unlocked: spec.unlocked,
    lastAct: spec.lastAct,
    intro: spec.intro ?? true,
    pockets: spec.pockets,
    coins: spec.coins,
  });
  const ev: GameEvent[] = [];
  for (const id of spec.without ?? []) {
    const k = run.hero.deck.findIndex((c) => c.id === id);
    if (k >= 0) run.hero.deck.splice(k, 1);
  }
  for (const c of spec.cards ?? []) addCard(run, c.id, !!c.up, 'test', ev, c.finish);
  for (const id of spec.relics ?? []) gainRelic(run, id, 'test', ev);
  return run;
}

const RUN_STEPS = 30000;

export function simRun(spec: RunSpec): RunResult {
  const policy = spec.policy ?? 'greedy';
  let run = startRun(spec);
  const r = seedRng(spec.seed);
  const out: RunResult = {
    seed: spec.seed,
    won: false,
    act: 0,
    floors: 0,
    cause: '',
    diedIn: '',
    fights: [],
    shops: [],
    events: [],
    rests: { heal: 0, upgrade: 0 },
    nodes: {},
    actHp: [run.hero.hp / run.hero.maxHp],
    bossHp: [],
    coinsEnd: 0,
    deck: 0,
    relics: [],
    maxMult: 0,
    maxHit: 0,
    dmgMoves: 0,
    dmgFree: 0,
    moves: 0,
    freeActions: 0,
    shards: 0,
    steps: 0,
    stuck: false,
    violations: [],
    snapshots: [],
  };
  let fight: FightLog | null = run.combat ? newLog(run, run, 'intro') : null;
  let shop: ShopLog | null = null;
  let stuck = 0;
  while (out.steps < RUN_STEPS && run.phase !== 'dead' && run.phase !== 'won') {
    const action = decide(run, { policy, seed: spec.seed, erase: spec.erase }, r);
    if (!action) {
      out.stuck = true;
      break;
    }
    const res = dispatch(run, action);
    out.steps++;
    if (res.events.some((e) => e.t === 'invalid')) {
      if (++stuck > 20) {
        // The bot keeps asking for something impossible: leave the screen like playRun does.
        out.stuck = true;
        run = dispatch(res.run, { type: 'leave' }).run;
        stuck = 0;
        continue;
      }
    } else stuck = 0;
    if (spec.check) for (const v of checkRun(res.run, run)) out.violations.push(`шаг ${out.steps} (${action.type}): ${v}`);
    const next = res.run;
    // Book-keeping by action and event.
    const struck = res.events.reduce((s, e) => s + (e.t === 'strike' ? e.damage : 0), 0);
    if (action.type === 'move' && !res.events.some((e) => e.t === 'invalid')) {
      out.moves++;
      out.dmgMoves += struck;
    } else if ((action.type === 'active' || action.type === 'pocket') && !res.events.some((e) => e.t === 'invalid')) {
      out.freeActions++;
      out.dmgFree += struck;
    }
    if (action.type === 'rest' && run.phase === 'rest') out.rests[action.choice]++;
    if (action.type === 'event' && run.event)
      out.events.push({
        act: run.act,
        id: run.event.id,
        option: action.option,
      });
    if (action.type === 'buy' && shop && !res.events.some((e) => e.t === 'invalid')) shop.bought.push(action.kind);
    if (action.type === 'pick' && run.pick?.from === 'shop' && run.pick.purpose === 'remove' && shop) shop.bought.push('remove');
    for (const e of res.events) {
      if (e.t === 'combatStart') {
        fight = newLog(run, next, e.kind);
        if (e.kind === 'boss') out.bossHp.push(next.hero.hp / next.hero.maxHp);
        if (spec.snapshots && e.kind !== 'intro')
          out.snapshots.push({
            act: next.act,
            kind: e.kind,
            index: fight.index,
            enemies: fight.enemies,
            build: buildOf(run),
            seed: spec.seed,
          });
      }
      if (e.t === 'strike' && fight) {
        fight.maxHit = Math.max(fight.maxHit, e.damage);
        fight.maxMult = Math.max(fight.maxMult, e.tally.mult);
      }
      if (e.t === 'swap' && fight) fight.moves++;
      if (e.t === 'enemyAct' && fight) fight.enemyActs++;
      if ((e.t === 'combatWon' || e.t === 'dead') && fight) {
        fight.won = e.t === 'combatWon';
        fight.hpAfter = next.hero.hp;
        out.fights.push(fight);
        if (e.t === 'dead') out.diedIn = fight.kind;
        fight = null;
      }
      if (e.t === 'dead' && !out.diedIn) out.diedIn = run.phase;
      if (e.t === 'act' && e.act > 0) out.actHp.push(next.hero.hp / next.hero.maxHp);
      if (e.t === 'enterNode') out.nodes[`${next.act}:${e.kind}`] = (out.nodes[`${next.act}:${e.kind}`] ?? 0) + 1;
      if (e.t === 'enterNode' && e.kind === 'shop') {
        shop = { act: next.act, coins: next.hero.coins, bought: [] };
        out.shops.push(shop);
      }
    }
    if (next.phase !== 'shop' && next.phase !== 'pick') shop = null;
    run = next;
  }
  out.won = run.phase === 'won';
  out.act = run.act;
  out.floors = run.stats.floors;
  out.cause = run.stats.deathCause;
  out.coinsEnd = run.hero.coins;
  out.deck = run.hero.deck.length;
  out.relics = [...run.hero.relics];
  out.maxMult = run.stats.maxMult;
  out.maxHit = run.stats.maxHit;
  out.shards = run.stats.shards;
  if (out.steps >= RUN_STEPS) out.stuck = true;
  return out;
}

function newLog(before: RunState, after: RunState, kind: FightLog['kind']): FightLog {
  const c = after.combat!;
  return {
    act: after.act,
    kind,
    index: kind === 'fight' ? Math.max(0, after.fightsInAct - 1) : 0,
    enemies: c.enemies.map((e) => e.def),
    moves: 0,
    enemyActs: 0,
    hpBefore: before.hero.hp,
    hpAfter: before.hero.hp,
    maxHp: after.hero.maxHp,
    won: false,
    maxHit: 0,
    maxMult: 0,
    enemyHp: c.enemies.reduce((s, e) => s + e.maxHp, 0),
  };
}

// ── Numbers ──────────────────────────────────────────────────────────

export const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
export const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : 0);

export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs: readonly number[]) => quantile(xs, 0.5);

/** Standard error of the mean. */
export function stderr(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1) / xs.length);
}

/** Mean of paired differences b − a with its standard error. */
export function paired(a: readonly number[], b: readonly number[]) {
  const d = a.map((x, k) => b[k] - x);
  return { diff: mean(d), se: stderr(d), n: d.length };
}

export type { Policy };

/**
 * Event trials for the balance report: one option of one event, taken by a hero with a given build,
 * played out to the end (an item to pick, a fight to win), measured as what the hero gained or lost.
 */
import { decide } from '../bot.ts';
import { dispatch, newRun } from '../run.ts';
import { FAMS } from '../types.ts';
import type { DevOp, RunState } from '../types.ts';
import type { Build } from './lab.ts';

export interface EventTrialSpec {
  act: number;
  build: Build;
  seed: number;
  event: string;
  option: number;
}

export interface EventTrialResult {
  /** Why the option was closed, or null. */
  locked: string | null;
  hp: number;
  maxHp: number;
  coins: number;
  gear: number;
  ups: number;
  curses: number;
  keys: number;
  relics: number;
  pockets: number;
  shards: number;
  fight: boolean;
  died: boolean;
}

const count = (run: RunState) => ({
  hp: run.hero.hp,
  maxHp: run.hero.maxHp,
  coins: run.hero.coins,
  gear: FAMS.reduce((n, f) => n + run.hero.gear[f].length, 0),
  ups: run.hero.ups.length,
  curses: run.hero.tape,
  keys: run.hero.keys,
  relics: run.hero.relics.length,
  pockets: run.hero.pockets.filter(Boolean).length,
  shards: run.stats.shards,
});

export function eventTrial(spec: EventTrialSpec): EventTrialResult {
  let run = newRun({
    seed: spec.seed,
    char: spec.build.char,
    customSeed: true,
    lastAct: 3,
  }).run;
  const dev = (op: DevOp) => {
    run = dispatch(run, { type: 'dev', op }).run;
  };
  const b = spec.build;
  dev({ op: 'act', act: spec.act });
  dev({
    op: 'build',
    gear: b.gear,
    equip: b.equip,
    ups: b.ups,
    tape: b.tape,
    relics: b.relics,
    active: b.active,
    pockets: b.pockets,
  });
  dev({ op: 'hero', maxHp: b.maxHp, hp: b.hp, coins: b.coins, charge: 0 });
  dev({ op: 'enter', kind: 'event', event: spec.event });
  const before = count(run);
  const res = dispatch(run, { type: 'event', option: spec.option });
  const invalid = res.events.find((e) => e.t === 'invalid');
  const zero = {
    hp: 0,
    maxHp: 0,
    coins: 0,
    gear: 0,
    ups: 0,
    curses: 0,
    keys: 0,
    relics: 0,
    pockets: 0,
    shards: 0,
  };
  if (invalid && invalid.t === 'invalid') return { locked: invalid.reason, ...zero, fight: false, died: false };
  run = res.run;
  // Play out what the choice started: a pick, a fight and its rewards.
  const r = { s: (spec.seed * 2654435761) >>> 0 || 1 };
  let fight = false;
  for (let k = 0; k < 400 && (run.phase === 'pick' || run.phase === 'combat' || run.phase === 'reward'); k++) {
    if (run.phase === 'combat') fight = true;
    const action = decide(run, { policy: 'greedy', seed: spec.seed }, r);
    if (!action) break;
    const next = dispatch(run, action);
    if (next.events.some((e) => e.t === 'invalid')) {
      run = dispatch(next.run, { type: 'leave' }).run;
      continue;
    }
    run = next.run;
  }
  const after = count(run);
  const delta = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v - before[k as keyof typeof before]])) as typeof zero;
  return { locked: null, ...delta, fight, died: run.phase === 'dead' };
}

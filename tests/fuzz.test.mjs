// Robustness: whole runs and fights with random builds, heroes, unlocks and bots, the engine's
// invariants checked after every action; determinism; saving and loading in the middle of a run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { labFight, simRun, startRun } from '../game/balance/lab.ts';
import { checkRun } from '../game/balance/invariants.ts';
import { decide } from '../game/bot.ts';
import { dispatch, loadRun, saveRun } from '../game/run.ts';
import { ACTS } from '../game/content/acts.ts';
import { CARDS } from '../game/content/cards.ts';
import { ENEMIES } from '../game/content/enemies.ts';
import { ITEMS, POCKETS } from '../game/content/items.ts';
import { REQUESTS } from '../render/profile.ts';
import { derive, int, rng, shuffle } from '../game/rng.ts';

const HEROES = ['intern', 'accountant', 'janitor'];
const POLICIES = ['greedy', 'random', 'randomCards', 'noCards'];
const UNLOCKS = REQUESTS.map((r) => r.id);

test('whole runs keep the engine sound: random heroes, unlocks, bots and lengths', () => {
  for (let seed = 1; seed <= 16; seed++) {
    const r = rng(derive(seed, 'fuzz-run'));
    const spec = {
      seed: 5000 + seed,
      char: HEROES[seed % 3],
      policy: POLICIES[seed % 4],
      unlocked: shuffle(r, [...UNLOCKS]).slice(0, int(r, UNLOCKS.length + 1)),
      lastAct: seed % 2 ? 3 : 2,
      check: true,
    };
    const res = simRun(spec);
    assert.deepEqual(res.violations.slice(0, 5), [], JSON.stringify(spec));
    assert.equal(res.stuck, false, `завис: ${JSON.stringify(spec)}`);
    assert.ok(res.won || res.cause, 'забег закончился');
  }
});

/** A random build: any cards (upgraded, finished, curses), any items, any skill and pockets. */
function chaosSpec(k) {
  const r = rng(derive(k, 'fuzz-chaos'));
  const cards = Object.keys(CARDS);
  const passives = Object.values(ITEMS)
    .filter((d) => d.kind === 'passive')
    .map((d) => d.id);
  const actives = Object.values(ITEMS)
    .filter((d) => d.kind === 'active')
    .map((d) => d.id);
  const pockets = Object.keys(POCKETS);
  const enemyIds = Object.keys(ENEMIES);
  const maxHp = 20 + int(r, 150);
  return {
    act: int(r, ACTS.length),
    kind: ['fight', 'elite', 'boss'][int(r, 3)],
    enemies: int(r, 2) ? Array.from({ length: 1 + int(r, 3) }, () => enemyIds[int(r, enemyIds.length)]) : [],
    build: {
      char: HEROES[int(r, 3)],
      deck: Array.from({ length: 5 + int(r, 30) }, () => ({
        id: cards[int(r, cards.length)],
        up: int(r, 3) === 0,
        ...(int(r, 5) === 0 ? { finish: ['sharp', 'gild', 'seal', 'copy', 'laminate'][int(r, 5)] } : {}),
      })),
      relics: shuffle(r, [...passives]).slice(0, int(r, 14)),
      active: int(r, 4) ? actives[int(r, actives.length)] : null,
      pockets: Array.from({ length: 5 }, () => (int(r, 2) ? pockets[int(r, pockets.length)] : null)),
      hp: 1 + int(r, maxHp),
      maxHp,
      coins: int(r, 500),
    },
    seed: 70000 + k,
    policy: int(r, 3) ? 'greedy' : 'random',
    check: true,
  };
}

test('fights with random builds against any enemies of any act keep the engine sound', () => {
  for (let k = 0; k < 80; k++) {
    const spec = chaosSpec(k);
    const res = labFight(spec);
    const what = `#${k} отдел ${spec.act + 1}, ${spec.enemies.join('+') || spec.kind}, колода ${spec.build.deck.length}, предметы ${spec.build.relics.join(',')}`;
    assert.deepEqual(res.violations.slice(0, 5), [], what);
    assert.equal(res.stuck, false, `завис: ${what}`);
    // A build without damage may stall a boss for hundreds of moves: that is balance, not the engine.
    assert.ok(res.won || res.dead || res.timeout, `бой оборвался: ${what}`);
  }
});

test('a run is deterministic: the same seed and bot give the same shift', () => {
  const spec = { seed: 77, policy: 'greedy', snapshots: true };
  assert.deepEqual(simRun(spec), simRun(spec));
  const fight = {
    act: 1,
    kind: 'elite',
    enemies: ['crab', 'crab'],
    build: chaosSpec(3).build,
    seed: 5,
  };
  assert.deepEqual(labFight(fight), labFight(fight));
});

test('saving and loading at any moment changes nothing', () => {
  let run = startRun({ seed: 21 });
  const r = { s: 99 };
  for (let step = 0; step < 3000 && run.phase !== 'dead' && run.phase !== 'won'; step++) {
    const action = decide(run, { policy: 'greedy', seed: 21 }, r);
    if (!action) break;
    if (step % 37 === 0) {
      // JSON drops keys holding undefined (a rocket grown from a plain tile has `up: undefined`):
      // the engine reads them the same, so states are compared as saved.
      const plain = (x) => JSON.parse(JSON.stringify(x));
      const loaded = loadRun(saveRun(run));
      assert.deepEqual(loaded, plain(run), `шаг ${step}`);
      assert.deepEqual(plain(dispatch(loaded, action)), plain(dispatch(run, action)), `шаг ${step}: после загрузки игра идёт так же`);
    }
    const res = dispatch(run, action);
    assert.deepEqual(checkRun(res.run, run), [], `шаг ${step}`);
    run = res.run;
  }
});

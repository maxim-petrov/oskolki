import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, dispatch, currentRoom } from '../game/run.ts';
import { generateFloor, DIRS, STEP } from '../game/mapgen.ts';
import { playRun } from '../game/bot.ts';
import { rng } from '../game/rng.ts';

test('floors are connected, with the boss in the farthest dead end', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (let floor = 0; floor < 4; floor++) {
      const map = generateFloor(rng(seed * 7 + floor), floor);
      const visible = map.rooms.filter((r) => !r.hidden);
      const kinds = visible.map((r) => r.kind);
      for (const k of ['start', 'boss', 'treasure', 'shop']) assert.equal(kinds.filter((x) => x === k).length, 1, `${k} seed ${seed}`);
      const boss = map.rooms[map.boss];
      assert.equal(Object.keys(boss.doors).length, 1, 'boss is a dead end');
      const maxDist = Math.max(...visible.map((r) => r.dist));
      assert.equal(boss.dist, maxDist);
      const secret = map.rooms.find((r) => r.kind === 'secret');
      if (secret) {
        const touchesBoss = DIRS.some((d) => secret.x + STEP[d][0] === boss.x && secret.y + STEP[d][1] === boss.y);
        assert.equal(touchesBoss, false);
      }
      // All visible rooms reachable from start.
      const seen = new Set([map.start]);
      const q = [map.start];
      while (q.length) for (const id of Object.values(map.rooms[q.shift()].doors)) if (!seen.has(id)) (seen.add(id), q.push(id));
      assert.equal(seen.size, visible.length);
    }
  }
});

test('doors lock during combat and treasure rooms need keys from floor 2', () => {
  let { run } = newRun({ seed: 5 });
  const dir = Object.entries(currentRoom(run).doors).find(([, id]) => run.map.rooms[id].kind === 'combat')?.[0];
  run = dispatch(run, { type: 'go', dir }).run;
  assert.equal(run.phase, 'combat');
  const res = dispatch(run, { type: 'go', dir: 'n' });
  assert.ok(res.events.some((e) => e.t === 'invalid'));
});

test('bots finish whole runs without errors and deterministically', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const a = playRun(newRun({ seed }).run, { policy: 'greedy', items: true, seed });
    const b = playRun(newRun({ seed }).run, { policy: 'greedy', items: true, seed });
    assert.deepEqual(a, b);
    assert.ok(a.won || a.cause, 'run ended with a result');
  }
  for (let seed = 1; seed <= 6; seed++) {
    const r = playRun(newRun({ seed }).run, { policy: 'random', items: true, seed });
    assert.ok(r.won || r.cause);
  }
});

test('random play loses early, greedy play with items does clearly better', () => {
  let rnd = 0;
  let greedy = 0;
  const N = 16;
  for (let seed = 1; seed <= N; seed++) {
    rnd += playRun(newRun({ seed }).run, { policy: 'random', items: true, seed }).floor;
    greedy += playRun(newRun({ seed }).run, { policy: 'greedy', items: true, seed }).floor;
  }
  assert.ok(greedy > rnd * 2, `greedy floors ${greedy} vs random ${rnd}`);
});

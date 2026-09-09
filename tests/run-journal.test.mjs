import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
test('terminal history records exact source, seed, build and path once across reloads', () => {
  const s = g.startRun(42);
  s.hp = 1;
  s.block = 2;
  s.relics = ['coil'];
  s.runId = 'history-test';
  const r = g.endTurn(s).state;
  assert.equal(r.phase, 'defeat');
  assert.equal(r.damageEvents.at(-1).amount, 1);
  assert.equal(r.damageEvents.at(-1).blocked, 2);
  assert.match(g.defeatExplanation(r), /Костяной налётчик/);
  const m = g.updateMeta(g.EMPTY_META, r);
  assert.equal(m.history.length, 1);
  assert.equal(m.history[0].seed, 42);
  assert.deepEqual(m.history[0].relics, ['coil']);
  assert.ok(g.isMeta(m));
  assert.deepEqual(g.updateMeta(m, g.loadSave(r)), m);
});
test('poison and tide defeats have honest causes and recent logs are bounded', () => {
  let s = g.startRun(3);
  s.hp = 1;
  s.heroPoison = 2;
  let r = g.endTurn(s).state;
  assert.match(g.defeatExplanation(r), /Яд/);
  assert.equal(r.damageEvents.at(-1).amount, 1);
  s = g.startRun(4);
  s.hp = 1;
  s.tide = { row: 0, turns: 1, cleared: false };
  r = g.endTurn(s).state;
  assert.match(g.defeatExplanation(r), /Прилив/);
  s = g.startRun(5);
  s.hp = s.maxHp = 10000;
  for (let i = 0; i < 100; i++) s = g.endTurn(s).state;
  assert.ok(s.chronicle.length <= 80);
  assert.ok(s.damageEvents.length <= 20);
});
test('history keeps thirty runs, abandoning does not masquerade as a defeat, old metadata still loads', () => {
  let m = g.copy(g.EMPTY_META);
  assert.ok(g.isMeta(m));
  for (let i = 0; i < 35; i++) {
    const s = g.startRun(i);
    s.runId = `h${i}`;
    m = g.abandonMeta(m, s);
  }
  assert.equal(m.history.length, 30);
  assert.equal(m.history[0].outcome, 'abandoned');
  assert.equal(m.history[0].seed, 34);
  assert.ok(g.isMeta(m));
  assert.deepEqual(
    g.updateMeta(m, { ...g.startRun(34), runId: 'h34', phase: 'defeat' }),
    g.updateMeta(m, { ...g.startRun(34), runId: 'h34', phase: 'defeat' }),
  );
  assert.equal(g.isMeta({ ...m, history: [{ id: 'bad' }] }), false);
  assert.equal(
    g.isSave({
      ...g.startRun(1),
      damageEvents: [{ source: 'bad', amount: -1 }],
    }),
    false,
  );
});
test('laboratory runs are recorded as experiments without advancing normal unlocks or streaks', () => {
  const s = g.startRun(1);
  s.modified = true;
  s.hp = 1;
  const m = g.updateMeta(g.EMPTY_META, g.endTurn(s).state);
  assert.equal(m.history[0].modified, true);
  assert.equal(m.streak, 0);
  assert.deepEqual(m.unlocked, []);
  assert.equal(m.seen, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import { accept, matchFixture, finish } from './helpers/stage2-fixtures.mjs';
const winner = { ...g.EMPTY_META, wins: 1, streak: 2, best: 2 };
const start = (id) =>
  g.startAdventure(42, g.DEFAULT_BALANCE, winner, 'warden', 1, id);
test('challenge starts are gated, have explicit fixed rules and preserve the first-match board seed', () => {
  const locked = g.startAdventure(
    42,
    g.DEFAULT_BALANCE,
    g.EMPTY_META,
    'wanderer',
    0,
    'precision',
  );
  assert.equal(locked.challenge, undefined);
  for (const { id } of g.CHALLENGES) {
    const s = start(id);
    assert.equal(s.hero, 'wanderer');
    assert.equal(s.difficulty, 0);
    assert.equal(s.challenge, id);
    assert.equal(s.modified, false);
    assert.equal(s.hp, 40);
    assert.ok(!s.flags.includes('run:alternate-access'));
    assert.deepEqual(s.board, g.startRun(42).board);
    assert.deepEqual(g.loadSave(s), s);
  }
  const s = start('short-circuit');
  assert.equal(g.energyMax(s), 6);
  s.upgrades.spark = 1;
  assert.equal(g.energyMax(s), 9);
});
test('precision blocks short weapon activations for every weapon, preserves 4+ hits and agrees with move preview', () => {
  for (const weapon of g.EQUIPMENT.filter((e) => e.slot === 'weapon'))
    for (const count of [3, 4]) {
      const s = start('precision');
      s.equipment.weapon = weapon.id;
      s.enemies[0].hp = s.enemies[0].maxHp = 200;
      const { board, m } = matchFixture('blade', count);
      s.board = board;
      const p = g.previewMove(s, m.axis, m.line, m.amount),
        r = g.move(s, m.axis, m.line, m.amount),
        first = r.frames[0].state;
      assert.equal(
        p.targets.reduce((n, e) => n + e.damage, 0),
        first.stats.damage,
      );
      if (count === 3) {
        assert.equal(first.stats.damage, 0);
        assert.equal(first.enemies[0].poison, 0);
        assert.equal(first.energy, s.energy);
        assert.ok(!first.flags.includes('turn:rune-armed'));
      } else assert.ok(first.stats.damage > 0);
    }
});
test('challenge victories are idempotent separate marks; defeat, abandon and laboratory versions never change the normal streak', () => {
  let s = start('precision');
  while (s.room < 20) {
    s = finish(s);
    s = accept(g.enterRoom(s, g.nextRooms(s)[0].id));
    assert.ok(g.isSave(s));
  }
  s = finish(s);
  assert.equal(s.phase, 'victory');
  const m = g.updateMeta(winner, s);
  assert.deepEqual(m.challengeWins, ['precision']);
  assert.equal(m.wins, 1);
  assert.equal(m.streak, 2);
  assert.deepEqual(m.unlocked, []);
  assert.equal(m.marks, undefined);
  assert.equal(m.history[0].challenge, 'precision');
  assert.deepEqual(g.updateMeta(m, s), m);
  assert.ok(g.isMeta(m));
  s.modified = true;
  assert.equal(g.updateMeta(winner, s).challengeWins, undefined);
  const live = start('short-circuit');
  assert.equal(g.abandonMeta(winner, live).streak, 2);
  const dead = { ...live, hp: 0, phase: 'defeat' };
  assert.equal(g.updateMeta(winner, dead).streak, 2);
  live.modified = true;
  assert.equal(g.abandonMeta(winner, live).history[0].outcome, 'abandoned');
});

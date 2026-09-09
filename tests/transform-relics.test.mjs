import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import {
  accept,
  matchFixture,
  finish,
  at,
} from './helpers/stage2-fixtures.mjs';
function battle(family = 'shield', n = 4) {
  const { board, m } = matchFixture(family, n),
    s = g.startRun(42);
  s.board = board;
  s.enemies[0].hp = s.enemies[0].maxHp = 200;
  s.relics = ['tape'];
  return { s, m };
}
test('tape records only a manual first-wave 4+, persists through a response and resumes the identical next move', () => {
  let { s } = battle();
  const { m } = battle();
  s = accept(g.move(s, m.axis, m.line, m.amount));
  assert.equal(s.echo, 'shield');
  assert.deepEqual(g.loadSave(s), s);
  s = accept(g.endTurn(s));
  assert.equal(s.echo, 'shield');
  const f = matchFixture('focus', 3);
  s.board = f.board;
  const r = g.move(s, f.m.axis, f.m.line, f.m.amount),
    first = r.frames[0].state;
  assert.equal(first.block, 4);
  assert.equal(first.echo, undefined);
  assert.equal(first.focus - s.focus, 3);
  assert.deepEqual(g.move(g.loadSave(s), f.m.axis, f.m.line, f.m.amount), r);
  assert.ok(r.state.chronicle.some((x) => x.includes('эхо «Щит»')));
});
test('tape does not consume on the same family or on edit and clears when leaving a battle or timed trial', () => {
  let { s } = battle('blade', 3);
  const { m } = battle('blade', 3);
  s.echo = 'blade';
  const same = g.move(s, m.axis, m.line, m.amount).frames[0].state;
  assert.equal(same.echo, 'blade');
  s.focus = 3;
  const edit = g.castSkill(s, 'edit', 0, 'focus');
  assert.equal(edit.frames[0].state.echo, 'blade');
  s = finish(s);
  assert.equal(s.echo, undefined);
  assert.ok(g.isSave(s));
  s = at(7, 'trial');
  s.relics = ['tape'];
  s.echo = 'focus';
  s = accept(g.tickTrial(accept(g.pauseTrial(s, false)), 46));
  assert.equal(s.echo, undefined);
  assert.ok(g.isSave(s));
});
test('echo applies once across multiple groups, does not trigger weapon/toxin/coil, and can cause one energy overflow', () => {
  let { s, m } = battle('shield', 4);
  s.echo = 'blade';
  s.relics.push('toxin');
  s.enemies[0].poison = 1;
  s.equipment.weapon = 'gear-axe';
  s.weaponQuality = 2;
  let first = g.move(s, m.axis, m.line, m.amount).frames[0].state;
  assert.equal(first.stats.damage, 4);
  assert.equal(first.enemies[0].poison, 1);
  assert.equal(first.echo, 'shield');
  ({ s, m } = battle('focus', 3));
  s.echo = 'shield';
  s.relics.push('coil');
  first = g.move(s, m.axis, m.line, m.amount).frames[0].state;
  assert.equal(first.energy, s.energy);
  assert.equal(first.block, 4);
  ({ s, m } = battle('shield', 3));
  s.echo = 'spark';
  s.relics.push('lamp');
  s.energy = 12;
  first = g.move(s, m.axis, m.line, m.amount).frames[0].state;
  assert.equal(first.energy, 12);
  assert.equal(first.stats.damage, 4);
  assert.equal(first.echo, undefined);
  // Two differently colored manual groups consume a single stored echo.
  const shifted = g.shifted(s.board, m.axis, m.line, m.amount);
  shifted[0].family = shifted[1].family = shifted[2].family = 'focus';
  s.board = g.shifted(shifted, m.axis, m.line, -m.amount);
  first = g.move(s, m.axis, m.line, m.amount).frames[0].state;
  assert.equal(first.stats.damage, 4);
});
test('binding trades actual available block for one action, respects target armor and the seal spell penalty', () => {
  const s = g.startRun(42);
  s.relics = ['binding', 'toxin'];
  s.block = 12;
  s.enemies[0].hp = 50;
  s.enemies[0].block = 5;
  s.enemies[0].poison = 1;
  assert.ok(g.canCast(s, 'binding'));
  let r = g.castSkill(s, 'binding');
  assert.equal(r.state.block, 4);
  assert.equal(r.state.enemies[0].hp, 39);
  assert.equal(r.state.enemies[0].poison, 1);
  assert.equal(r.state.energy, s.energy);
  assert.equal(r.state.cast, true);
  assert.ok(!g.canCast(r.state, 'edit'));
  assert.deepEqual(g.castSkill(r.state, 'binding').state, r.state);
  s.seal = 'double-edit';
  s.block = 2;
  r = g.castSkill(s, 'binding');
  assert.equal(r.state.block, 0);
  assert.equal(r.state.enemies[0].block, 4);
  s.block = 0;
  assert.ok(!g.canCast(s, 'binding'));
  assert.ok(g.castSkill(s, 'binding').error);
  s.block = 8;
  s.relics = [];
  assert.ok(g.castSkill(s, 'binding').error);
});
test('hero/finale discoveries expand only future rule-4 loot pools; ordinary core and old versions stay intact', () => {
  const meta = {
    ...g.EMPTY_META,
    wins: 1,
    marks: ['warden:tide-keeper', 'wanderer:redactor'],
  };
  assert.deepEqual(g.progressionRewards(meta), ['binding', 'tape']);
  assert.equal(g.availableRelics(meta, 3).length, 12);
  const s = g.startAdventure(42, g.DEFAULT_BALANCE, meta);
  assert.ok(s.flags.includes('run:available:tape'));
  assert.ok(s.flags.includes('run:available:binding'));
  assert.equal(s.relics.length, 0);
  assert.ok(!g.startRun(42).flags.includes('run:available:tape'));
});

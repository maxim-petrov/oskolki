import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import {
  at,
  finish,
  accept,
  clear,
  matchFixture,
} from './helpers/stage2-fixtures.mjs';
const winner = { ...g.EMPTY_META, wins: 1, unlocked: ['win'] };
test('first normal victory unlocks a different hero and optional difficulty without giving permanent stat bonuses', () => {
  const locked = g.startAdventure(
    42,
    g.DEFAULT_BALANCE,
    g.EMPTY_META,
    'warden',
    1,
  );
  assert.equal(locked.hero, 'wanderer');
  assert.equal(locked.hp, 40);
  assert.equal(locked.difficulty, 0);
  assert.ok(!locked.flags.includes('run:alternate-access'));
  const s = g.startAdventure(42, g.DEFAULT_BALANCE, winner, 'warden');
  assert.equal(s.hp, 48);
  assert.equal(s.energy, 0);
  assert.equal(s.modified, false);
  assert.equal(s.relics.length, 0);
  assert.ok(s.flags.includes('run:alternate-access'));
  assert.deepEqual(g.loadSave(s), s);
  const harder = g.startAdventure(42, g.DEFAULT_BALANCE, winner, 'wanderer', 1);
  assert.equal(
    g.intent(harder, harder.enemies[0]).value,
    g.intent(locked, locked.enemies[0]).value + 2,
  );
  assert.equal(harder.modified, false);
});
test('warden carries only unused block and begins each battle with zero energy; a seal replaces rather than adds carry', () => {
  let s = g.startAdventure(42, g.DEFAULT_BALANCE, winner, 'warden');
  s.block = 12;
  s = accept(g.endTurn(s));
  assert.equal(s.block, 4);
  s.block = 12;
  s.seal = 'enduring-record';
  s = accept(g.endTurn(s));
  assert.equal(s.block, 6);
  s = finish(s);
  s = accept(g.enterRoom(s, g.nextRooms(s)[0].id));
  assert.equal(s.energy, 0);
  assert.equal(s.block, 0);
});
function alternate() {
  let s = at(17, 'event');
  s = g.withUnlocks(s, winner);
  return accept(g.eventChoice(s, 'forbidden'));
}
test('alternate finale has explicit exclusive max-health cost and persists in the route; locked and repeated attempts do nothing', () => {
  const s = at(17, 'event'),
    before = g.copy(s);
  assert.ok(g.eventChoice(s, 'forbidden').error);
  assert.deepEqual(s, before);
  g.withUnlocks(s, winner);
  const r = accept(g.eventChoice(s, 'forbidden'));
  assert.equal(r.maxHp, s.maxHp - 6);
  assert.equal(r.hp, Math.min(s.hp, s.maxHp - 6));
  assert.ok(!r.flags.includes('run:sluice'));
  assert.equal(
    r.journey.nodes.find((n) => n.depth === 20).roster[0],
    'redactor',
  );
  assert.deepEqual(g.loadSave(r), r);
  assert.deepEqual(g.eventChoice(r, 'forbidden').state, r);
});
test('alternate twenty-room path reaches its own boss, records a separate completion and survives repeated loading', () => {
  let s = alternate();
  s.hero = 'warden';
  s.difficulty = 1;
  while (s.room < 20) {
    s = finish(s);
    s = accept(g.enterRoom(s, g.nextRooms(s)[0].id));
    assert.ok(g.isSave(s));
    s = g.loadSave(s);
  }
  assert.equal(s.enemies[0].kind, 'redactor');
  s = clear(s);
  assert.equal(s.phase, 'victory');
  const m = g.updateMeta(winner, s);
  assert.ok(m.marks.includes('warden:redactor'));
  assert.ok(m.marks.includes('hard:warden:redactor'));
  assert.equal(m.history[0].ending, 'redactor');
  assert.equal(m.history[0].hero, 'warden');
  assert.ok(g.isMeta(m));
  assert.deepEqual(g.updateMeta(m, s), m);
});
test('Redactor announces a family, grants armor for its matches, and edit clears the rule before its own matches', () => {
  let s = alternate();
  while (s.room < 20) {
    s = finish(s);
    s = accept(g.enterRoom(s, g.nextRooms(s)[0].id));
  }
  assert.equal(g.intent(s, s.enemies[0]).type, 'redact');
  assert.equal(g.intent(s, s.enemies[0]).family, 'blade');
  s = accept(g.endTurn(s));
  assert.equal(s.redaction.family, 'blade');
  assert.equal(s.redaction.expires, 3);
  assert.ok(g.isSave(s));
  const { board, m } = matchFixture('blade', 3);
  s.board = board;
  s.enemies[0].hp = s.enemies[0].maxHp = 200;
  const r = g.move(s, m.axis, m.line, m.amount),
    first = r.frames[0].state;
  assert.equal(first.stats.damage - s.stats.damage, 2);
  assert.equal(first.enemies[0].block, 2);
  s.board = g.shifted(board, m.axis, m.line, m.amount);
  const cells = g.groups(s.board)[0];
  s.board[cells[0]].family = 'focus';
  s.focus = 3;
  const edited = g.castSkill(s, 'edit', cells[0], 'blade');
  assert.equal(edited.state.redaction, undefined);
  assert.equal(edited.frames[1].state.stats.damage - s.stats.damage, 6);
  s = accept(g.endTurn(s));
  s = accept(g.endTurn(s));
  assert.equal(s.redaction, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage2-engine.mjs';
import { matchFixture, accept, at, clear } from './helpers/stage2-fixtures.mjs';
function arena() {
  const s = g.startRun(42);
  s.enemies[0].hp = s.enemies[0].maxHp = 100;
  return s;
}
function fixture(family) {
  const s = arena(),
    { board, m } = matchFixture(family, 3);
  s.board = board;
  return { s, m };
}
const play = (s, m) => g.move(s, m.axis, m.line, m.amount);
test('v4 thorns retaliate per hit against its source; shield collection, poison and tide do not trigger them', () => {
  const { s, m } = fixture('shield');
  s.relics = ['thorns'];
  assert.equal(play(s, m).frames[0].state.stats.damage, 0);
  s.enemies.push({ ...s.enemies[0], id: 900, damage: 4 });
  s.target = 900;
  s.block = 8;
  const r = accept(g.endTurn(s));
  assert.equal(r.enemies[0].hp, 97);
  assert.equal(r.enemies[1].hp, 99);
  assert.equal(r.hp, 38);
  assert.equal(r.stats.blocked, 8);
  s.enemies = s.enemies.slice(0, 1);
  s.enemies[0].kind = 'ink-eel';
  s.block = 10;
  s.heroPoison = 1;
  assert.equal(accept(g.endTurn(s)).enemies[0].hp, 100);
  s.enemies[0].kind = 'bell';
  s.round = 1;
  s.tide = { row: 0, turns: 1, cleared: false };
  assert.equal(accept(g.endTurn(s)).enemies[0].hp, 100);
});
test('vessel expires at end of turn and can arm on the next turn, with unchanged health payment', () => {
  let s = arena();
  s.relics = ['vessel'];
  s.skills.push('blood');
  s = accept(g.castSkill(s, 'blood'));
  assert.equal(s.hp, 38);
  assert.ok(s.flags.includes('vessel:armed'));
  s = accept(g.endTurn(s));
  assert.ok(!s.flags.includes('vessel:armed'));
  s = accept(g.castSkill(s, 'blood'));
  assert.ok(s.flags.includes('vessel:armed'));
  const { board, m } = matchFixture('blade', 3);
  s.board = board;
  assert.equal(play(s, m).frames[0].state.block, 4);
});
test('carbon applies immediately to the match made by edit and never on subsequent groups', () => {
  const { s, m } = fixture('blade');
  s.board = g.shifted(s.board, m.axis, m.line, m.amount);
  const cells = g.groups(s.board)[0];
  s.board[cells[0]].family = 'focus';
  s.focus = 3;
  const base = accept(g.castSkill(s, 'edit', cells[0], 'blade'));
  s.relics = ['carbon'];
  const buff = accept(g.castSkill(s, 'edit', cells[0], 'blade'));
  assert.equal(buff.stats.damage - base.stats.damage, 3);
  assert.equal(buff.stats.edits, 1);
  assert.ok(!buff.flags.includes('turn:carbon-armed'));
  assert.deepEqual(g.loadSave(buff), buff);
});
test('bookmark transfers remaining poison after decrement and transferred poison waits for the next enemy phase', () => {
  const s = arena();
  s.relics = ['bookmark'];
  s.enemies[0].hp = 1;
  s.enemies[0].poison = 5;
  s.enemies.push({ ...s.enemies[0], id: 900, hp: 100, maxHp: 100, poison: 0 });
  const r = accept(g.endTurn(s));
  assert.equal(r.enemies[1].hp, 100);
  assert.equal(r.enemies[1].poison, 2);
  assert.equal(r.stats.poisonKills, 1);
  const next = accept(g.endTurn(r));
  assert.equal(next.enemies[1].hp, 98);
  assert.equal(next.enemies[1].poison, 1);
});
test('bookmark direct-kill transfer can tick in the next response, without extra kills or healing', () => {
  const s = arena();
  s.relics = ['bookmark', 'heart'];
  s.skills.push('pierce');
  s.focus = 3;
  s.hp = 30;
  s.enemies[0].hp = 1;
  s.enemies[0].poison = 6;
  s.enemies.push({ ...s.enemies[0], id: 900, hp: 100, maxHp: 100, poison: 0 });
  const r = accept(g.castSkill(s, 'pierce'));
  assert.equal(r.enemies[1].poison, 3);
  assert.equal(r.hp, 33);
  assert.equal(r.stats.kills, 1);
  assert.equal(accept(g.endTurn(r)).enemies[1].hp, 97);
});
test('spiked and marked tiles give their distinct matched effects; preview and actual first wave agree', () => {
  for (const [family, variant] of [
    ['shield', 'spiked'],
    ['focus', 'marked'],
  ]) {
    const { s, m } = fixture(family);
    s.board.forEach((t) => {
      if (t.family === family) t.variant = variant;
    });
    const r = play(s, m),
      p = g.previewMove(s, m.axis, m.line, m.amount),
      first = r.frames[0].state;
    assert.equal(first.block, family === 'shield' ? 6 : 3);
    assert.equal(first.stats.damage, family === 'shield' ? 3 : 0);
    assert.equal(p.block, first.block);
    assert.deepEqual(g.loadSave(r.state), r.state);
    if (variant === 'marked') {
      s.flags.push('turn:marked');
      assert.equal(play(s, m).frames[0].state.block, 0);
    }
  }
});
test('adjacent bombs chain once; destruction does not produce shield, poison or marked match effects', () => {
  const { s, m } = fixture('spark');
  s.board = g.shifted(s.board, m.axis, m.line, m.amount);
  const matched = g.groups(s.board)[0];
  const adjacent = (i) =>
    [
      i - 6,
      i + 6,
      ...(i % 6 ? [i - 1] : []),
      ...(i % 6 < 5 ? [i + 1] : []),
    ].filter((j) => j >= 0 && j < 36);
  const a = matched.find((i) => adjacent(i).some((j) => !matched.includes(j))),
    b = adjacent(a).find((j) => !matched.includes(j));
  s.board[a].variant = 'bomb';
  s.board[b].variant = 'bomb';
  s.relics = ['conductor'];
  s.energy = 0;
  // Edit the already matching spark back to spark: produces exactly this first wave.
  s.focus = 3;
  const r = g.castSkill(
      s,
      'edit',
      matched.find((i) => i !== a),
      'spark',
    ),
    frame = r.frames[1];
  const expected = new Set(matched);
  for (const j of [...adjacent(a), ...adjacent(b)]) expected.add(j);
  assert.deepEqual(
    [...frame.cells].sort((a, b) => a - b),
    [...expected].sort((a, b) => a - b),
  );
  assert.equal(frame.state.block, 0);
  assert.ok(frame.state.energy <= 6);
});
test('core twelve remain available; new content unlocks next run only and never in legacy or modified runs', () => {
  const s = arena();
  s.stats.edits = 3;
  s.stats.poisonKills = 3;
  s.stats.shieldGroups = 5;
  s.stats.focusGroups = 5;
  const m = g.updateMeta(g.EMPTY_META, s);
  assert.ok(m.unlocked.includes('three-edits'));
  const fresh = g.withUnlocks(g.startRun(2), m);
  assert.ok(fresh.flags.includes('run:available:carbon'));
  assert.ok(fresh.flags.includes('run:available:spiked'));
  assert.ok(!s.flags.includes('run:available:carbon'));
  assert.equal(g.availableRelics(m, 3).length, 12);
  assert.equal(g.availableRelics(g.EMPTY_META, 4).length, 12);
  s.modified = true;
  assert.deepEqual(g.updateMeta(g.EMPTY_META, s), g.EMPTY_META);
  for (const rv of [2, 3]) {
    const x = g.startRun(2, g.DEFAULT_BALANCE, rv);
    x.room = 8;
    for (let i = 0; i < 30; i++)
      assert.ok(
        !g
          .rewardOffers(x, true)
          .some((o) =>
            ['carbon', 'bookmark', 'spiked', 'marked'].includes(o.id),
          ),
      );
  }
});
test('late curated rosters create protection/drain and ink/pressure encounters without changing first-room readability', () => {
  const s = g.startRun(1),
    nodes = s.journey.nodes;
  assert.deepEqual(nodes.find((n) => n.depth === 1).roster, ['raider']);
  assert.deepEqual(
    nodes.find((n) => n.depth === 8 && n.kind === 'elite').roster,
    ['safe', 'moth'],
  );
  assert.deepEqual(
    nodes.find((n) => n.depth === 18 && n.kind === 'battle').roster,
    ['ink-scribe', 'paper-rat'],
  );
  assert.ok(g.isSave(clear(at(18, 'elite'))));
});

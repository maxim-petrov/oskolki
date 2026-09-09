import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import {
  accept,
  at,
  clear,
  sealed,
  matchFixture,
  finish,
} from './helpers/stage2-fixtures.mjs';

const fixture = (id, family = 'blade', count = 3) => {
  const s = sealed(id),
    { board, m } = matchFixture(family, count);
  s.board = board;
  s.enemies[0].hp = s.enemies[0].maxHp = 10000;
  s.enemies[0].block = 0;
  return { s, m };
};
const move = (s, m) => g.move(s, m.axis, m.line, m.amount);

test('Censor seal is optional, unique, charged before healing and survives a reload without repeating either effect', () => {
  for (const id of [null, ...g.SEALS.map((o) => o.id)]) {
    const base = at(10);
    base.hp = 30;
    base.potions = 0;
    const reward = clear(base),
      rng = reward.rng,
      streams = g.copy(reward.streams);
    assert.equal(reward.hp, 30);
    assert.equal(reward.potions, 0);
    const chosen = accept(g.chooseReward(g.loadSave(reward), id));
    assert.equal(chosen.seal, id ?? undefined);
    assert.equal(chosen.maxHp, id === 'red-line' ? 32 : 40);
    assert.equal(chosen.hp, chosen.maxHp);
    assert.equal(chosen.potions, 1);
    assert.equal(chosen.rng, rng);
    assert.deepEqual(chosen.streams, streams);
    assert.deepEqual(g.loadSave(chosen), chosen);
    assert.equal(g.chooseReward(chosen, id).state, chosen);
    const archive = accept(g.enterRoom(chosen, g.nextRooms(chosen)[0].id));
    assert.equal(archive.seal, chosen.seal);
    assert.ok(g.isSave(archive));
  }
  const reward = clear(at(10));
  reward.hp = 5;
  const red = accept(g.chooseReward(reward, 'red-line'));
  assert.equal(red.hp, 21);
  assert.equal(red.maxHp, 32);
  const impossible = g.copy(reward);
  impossible.hp = 5;
  impossible.maxHp = 8;
  assert.ok(g.chooseReward(impossible, 'red-line').error);
  assert.equal(g.chooseReward(impossible, 'red-line').state, impossible);
  const low = accept(g.chooseReward(impossible, null));
  assert.equal(low.hp, 8);
  assert.equal(low.maxHp, 8);
});

test('Red Line adds exactly four per weapon match before cleaver distribution, including low damage and first-wave forecast', () => {
  for (const weapon of g.WEAPONS)
    for (const count of [3, 4, 5])
      for (const perTile of [0, 2]) {
        const { s, m } = fixture('red-line', 'blade', count);
        s.equipment.weapon = weapon.id;
        s.balance.blade = perTile;
        s.enemies.push({ ...g.copy(s.enemies[0]), id: 9000 });
        const plain = g.copy(s);
        delete plain.seal;
        const before = move(plain, m).frames[0].state;
        const r = move(s, m),
          first = r.frames[0].state;
        assert.equal(
          first.stats.damage - before.stats.damage,
          4,
          `${weapon.id}:${count}:${perTile}`,
        );
        const forecast = g.previewMove(s, m.axis, m.line, m.amount);
        assert.equal(
          forecast.targets.reduce((n, e) => n + e.damage, 0),
          first.stats.damage - s.stats.damage,
        );
        if (weapon.id === 'gear-cleaver')
          assert.equal(
            10000 - first.enemies[1].hp,
            Math.floor(first.stats.damage / 3),
          );
        assert.ok(r.state.stats.matches >= 1);
      }
});

test('Enduring Record penalizes each shield group and relics use actual generated block, then carries only unused block after attacks', () => {
  const { s, m } = fixture('enduring-record', 'shield', 3);
  s.relics = ['coil', 'thorns'];
  s.block = 0;
  s.energy = 0;
  const r = move(s, m),
    first = r.frames[0].state;
  assert.equal(first.block, 4);
  assert.equal(first.energy, 1);
  assert.equal(first.stats.damage - s.stats.damage, 2);
  assert.equal(g.previewMove(s, m.axis, m.line, m.amount).block, 4);
  s.balance.shield = 0;
  const zero = move(s, m).frames[0].state;
  assert.equal(zero.block, 0);
  assert.equal(zero.energy, 0);
  assert.equal(zero.stats.damage, s.stats.damage);
  for (const block of [0, 3, 12, 30]) {
    const t = sealed('enduring-record');
    delete t.tide;
    t.tide = { row: 0, turns: 3, cleared: false };
    t.round = 1;
    t.enemies[0].kind = 'raider';
    t.enemies[0].damage = 5;
    t.enemies[0].hp = 1000;
    t.enemies[0].maxHp = 1000;
    t.block = block;
    t.heroPoison = 0;
    const damage = g.intent(t, t.enemies[0]).value;
    const next = accept(g.endTurn(t));
    assert.equal(next.block, Math.min(6, Math.max(0, block - damage)));
    assert.deepEqual(g.loadSave(next), next);
  }
  let t = sealed('enduring-record');
  t.block = 22;
  t = finish(t);
  t = accept(g.enterRoom(t, g.nextRooms(t)[0].id));
  assert.equal(t.block, 0);
});

test('Double Edit rejects partial or duplicate choices atomically and replaces two cells before resolving any match', () => {
  const s = sealed('double-edit');
  s.focus = 3;
  s.relics = ['order'];
  s.block = 0;
  // Two selected cells must be replaced in the same pre-resolution frame.
  const rows = ['fsbsfs', 'sfsfsf', 'fsfsfs', 'sfsfsf', 'fsfsfs', 'sfsfsf'];
  const families = { f: 'focus', s: 'shield', b: 'blade' };
  s.board = rows
    .join('')
    .split('')
    .map((x, i) => ({ id: i + 10000, family: families[x], variant: null }));
  s.board[1].family = 'blade';
  s.board[2].family = 'blade';
  const snapshot = g.copy(s);
  for (const args of [
    [0, 'blade'],
    [0, 'blade', 0],
    [0, 'blade', 36],
    [0.5, 'blade', 2],
    [0, 'blade', 1.5],
  ]) {
    const r = g.castSkill(s, 'edit', ...args);
    assert.ok(r.error);
    assert.equal(r.state, s);
    assert.deepEqual(s, snapshot);
  }
  // Use focus at both positions: second cell is not left as an intermediate blade.
  const r = g.castSkill(s, 'edit', 0, 'focus', 1);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.frames[0].cells, [0, 1]);
  assert.equal(r.frames[0].state.board[0].family, 'focus');
  assert.equal(r.frames[0].state.board[1].family, 'focus');
  assert.equal(r.frames[0].state.focus, 0);
  assert.equal(r.frames[0].state.block, 3);
  assert.equal(r.state.stats.skills, s.stats.skills + 1);
  assert.equal(r.state.enemies[0].hp, s.enemies[0].hp);
  assert.ok(r.state.cast);
  assert.ok(g.isSave(r.state));
  assert.ok(g.castSkill(r.state, 'edit', 3, 'focus', 4).error);
  assert.deepEqual(g.loadSave(r.state), r.state);
  const single = sealed(null);
  single.focus = 3;
  assert.equal(g.castSkill(single, 'edit', 0, 'focus').error, undefined);
});

test('Double Edit resolves a long combination once and the Order relic triggers once for the whole skill', () => {
  const s = sealed('double-edit');
  s.focus = 3;
  s.relics = ['order', 'thread'];
  s.hp = 20;
  s.block = 0;
  s.equipment.weapon = 'gear-axe';
  s.enemies[0].hp = s.enemies[0].maxHp = 10000;
  const layout = [
    'bsbsbf',
    'sfsfsf',
    'fsfsfs',
    'sfsfsf',
    'fsfsfs',
    'sfsfsf',
  ].join('');
  const family = { b: 'blade', s: 'shield', f: 'focus' };
  s.board = layout
    .split('')
    .map((x, i) => ({ id: 10000 + i, family: family[x], variant: null }));
  const r = g.castSkill(s, 'edit', 1, 'blade', 3);
  assert.equal(r.error, undefined);
  assert.equal(r.frames[0].state.block, 3);
  const first = r.frames[1].state;
  assert.equal(first.stats.damage - s.stats.damage, 14); // Five blades × 2 + axe 4, no attacking-skill penalty.
  assert.equal(first.hp, 23);
  assert.equal(first.stats.big - s.stats.big, 1);
  assert.equal(r.state.stats.skills - s.stats.skills, 1);
});

test('Double Edit skill penalty includes rune and sacrifice bonuses, preserves costs, and never affects Guard or weapon-generated damage', () => {
  for (const [id, base, costHp] of [
    ['bolt', 12, 0],
    ['pierce', 8, 0],
    ['blood', 8, 2],
    ['seal', 16, 2],
  ])
    for (const lens of [false, true])
      for (const rune of [false, true]) {
        const s = sealed('double-edit');
        s.skills = [id, 'guard'];
        s.energy = 12;
        s.focus = 8;
        s.enemies[0].hp = s.enemies[0].maxHp = 10000;
        s.enemies[0].block = 0;
        if (lens) s.relics = ['lens'];
        if (rune) s.flags.push('turn:rune-armed');
        const expected =
          base +
          (lens && costHp ? 4 : 0) +
          (rune && ['bolt', 'seal'].includes(id) ? 2 : 0) -
          3;
        const r = g.castSkill(s, id);
        assert.equal(r.error, undefined);
        assert.equal(
          r.state.stats.damage - s.stats.damage,
          expected,
          `${id}/${lens}/${rune}`,
        );
        assert.equal(r.state.hp, s.hp - costHp);
        assert.ok(
          g.itemForRun(s, id).description.includes(`${expected} урона`),
        );
      }
  const s = sealed('double-edit');
  s.energy = 8;
  s.block = 0;
  assert.equal(accept(g.castSkill(s, 'guard')).block, 8);
});

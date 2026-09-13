import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { startLevel, levelAction, parallaxOffset, LEVEL_ACTIONS } =
  await import('../game/figma-level.ts');
import {
  copy,
  groups,
  validMoves,
  previewMove,
  actionLeft,
  canCast,
  shifted,
} from '../game/engine.ts';
const { HeroHUD } = await import('../components/figma-level-art.tsx');

const accept = (result) => {
  assert.equal(result.error, undefined);
  return result.state;
};
function setupMove(s, amount = 1) {
  for (const axis of ['row', 'col']) {
    for (let line = 0; line < 8; line++) {
      if (!groups(shifted(s.board, axis, line, amount)).length)
        return { type: 'shift', axis, line, amount };
    }
  }
  throw new Error('Expected a preparation move without a match');
}

test('Figma room starts with a playable 8×8 board and an isolated deterministic run', () => {
  const s = startLevel();
  assert.deepEqual(s, startLevel());
  assert.equal(s.board.length, 64);
  assert.equal(new Set(s.board.map((t) => t.id)).size, 64);
  assert.deepEqual(groups(s.board), []);
  assert.ok(validMoves(s.board).length > 0);
  assert.ok(s.runId.startsWith('figma-level-'));
  assert.equal(s.modified, true);
  assert.equal(s.equipment.weapon, 'bare-hands');
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].name, 'Завал отчётов');
  assert.equal(actionLeft(s), LEVEL_ACTIONS);
});

test('five small preparation shifts use the turn without triggering the enemy', () => {
  const input = startLevel(),
    untouched = copy(input);
  let s = input;
  for (let left = 4; left >= 0; left--) {
    s = accept(levelAction(s, setupMove(s)));
    assert.equal(actionLeft(s), left);
    assert.equal(s.round, 1);
    assert.equal(s.hp, input.hp);
    assert.equal(s.enemies[0].hp, input.enemies[0].hp);
  }
  assert.deepEqual(input, untouched);
  const rejected = levelAction(s, setupMove(s));
  assert.ok(rejected.error);
  assert.deepEqual(rejected.state, s);
  assert.deepEqual(rejected.frames, []);
  s = accept(levelAction(s, { type: 'end' }));
  assert.equal(s.round, 2);
  assert.equal(s.hp, 24);
  assert.equal(actionLeft(s), LEVEL_ACTIONS);
});

test('long shifts use the shortest cyclic distance and cannot overspend actions', () => {
  let s = startLevel();
  const action = setupMove(s, 4);
  const p = previewMove(s, action.axis, action.line, action.amount);
  assert.equal(p.actionCost, 4);
  s = accept(levelAction(s, action));
  assert.equal(actionLeft(s), 1);
  const rejected = levelAction(s, { ...action, amount: 2 });
  assert.ok(rejected.error);
  assert.deepEqual(rejected.state, s);
  const a = accept(levelAction(s, { ...action, amount: 7 }));
  const b = accept(levelAction(s, { ...action, amount: -1 }));
  assert.deepEqual(a, b);
  assert.equal(actionLeft(a), 0);
});

test('preview describes the first match without revealing refill cascades or mutating RNG', () => {
  const s = startLevel(),
    before = copy(s);
  const m = validMoves(s.board).find((m) =>
    previewMove(s, m.axis, m.line, m.amount).targets?.some((t) => t.damage > 0),
  );
  assert.ok(m);
  const p = previewMove(s, m.axis, m.line, m.amount);
  assert.deepEqual(s, before);
  const result = levelAction(s, { type: 'shift', ...m });
  const after = accept(result),
    first = result.frames[0].state;
  assert.equal(before.enemies[0].hp - first.enemies[0].hp, p.targets[0].damage);
  assert.equal(first.block - before.block, p.block);
  assert.equal(first.energy - before.energy, p.energy);
  assert.equal(first.focus - before.focus, p.focus);
  assert.ok(after.enemies[0].hp <= first.enemies[0].hp);
  assert.equal(actionLeft(after), p.actionsRemaining);
  assert.equal(after.board.length, 64);
});

test('all five illustrated abilities spend real resources and one action', () => {
  const cases = [
    ['pierce', { damage: 8, energy: 9, focus: 0, hp: 32, block: 0 }],
    ['seal', { damage: 16, energy: 6, focus: 3, hp: 30, block: 0 }],
    ['guard', { damage: 0, energy: 5, focus: 3, hp: 32, block: 8 }],
    ['bolt', { damage: 12, energy: 3, focus: 3, hp: 32, block: 0 }],
  ];
  for (const [id, expected] of cases) {
    const s = startLevel();
    assert.ok(canCast(s, id));
    const after = accept(levelAction(s, { type: 'skill', id }));
    assert.equal(actionLeft(after), 4, id);
    assert.deepEqual(
      {
        damage: s.enemies[0].hp - after.enemies[0].hp,
        energy: after.energy,
        focus: after.focus,
        hp: after.hp,
        block: after.block,
      },
      expected,
      id,
    );
  }
  const s = startLevel();
  const edited = accept(
    levelAction(s, { type: 'skill', id: 'edit', index: 0, family: 'spark' }),
  );
  assert.equal(edited.board[0].family, 'spark');
  assert.equal(edited.focus, 0);
  assert.equal(actionLeft(edited), 4);
  assert.equal(canCast(edited, 'edit'), false);
  assert.ok(
    levelAction(edited, {
      type: 'skill',
      id: 'edit',
      index: 1,
      family: 'blade',
    }).error,
  );
  assert.equal(s.board[0].family, 'shield');
});

test('guard absorbs the response and the next turn refreshes all five actions', () => {
  const s = accept(levelAction(startLevel(), { type: 'skill', id: 'guard' }));
  const result = levelAction(s, { type: 'end' });
  const after = accept(result);
  assert.equal(after.hp, s.hp);
  assert.equal(after.block, 0);
  assert.equal(actionLeft(after), 5);
  for (const f of result.frames.filter((f) => f.state.round === after.round))
    assert.equal(actionLeft(f.state), 5);
});

test('victory ends the single room without campaign rewards; defeat is terminal too', () => {
  const s = startLevel();
  s.enemies[0].hp = 8;
  const victory = accept(levelAction(s, { type: 'skill', id: 'pierce' }));
  assert.equal(victory.phase, 'victory');
  assert.deepEqual(victory.offers, []);
  let lost = startLevel();
  for (let i = 0; i < 10 && lost.phase === 'battle'; i++)
    lost = accept(levelAction(lost, { type: 'end' }));
  assert.equal(lost.phase, 'defeat');
  for (const final of [lost, victory]) {
    const rejected = levelAction(final, { type: 'end' });
    assert.ok(rejected.error);
    assert.deepEqual(rejected.state, final);
  }
});

test('a complete room is winnable and replay is identical after every player action', () => {
  let s = startLevel();
  const actions = [],
    states = [];
  for (let n = 0; n < 60 && s.phase === 'battle'; n++) {
    const choices = validMoves(s.board)
      .map((m) => ({ m, p: previewMove(s, m.axis, m.line, m.amount) }))
      .filter(({ p }) => !p.error);
    const value = ({ p }) =>
      ((p.targets?.reduce((sum, t) => sum + t.damage, 0) || 0) +
        p.block * 0.7 +
        p.focus * 0.2) /
      p.actionCost;
    choices.sort((a, b) => value(b) - value(a));
    const action = choices.length
      ? { type: 'shift', ...choices[0].m }
      : { type: 'end' };
    s = accept(levelAction(s, action));
    actions.push(action);
    states.push(s);
  }
  assert.equal(s.phase, 'victory');
  assert.ok(s.hp > 0);
  let replay = startLevel();
  actions.forEach((action, i) => {
    replay = accept(levelAction(replay, action));
    assert.deepEqual(replay, states[i]);
  });
});

test('parallax remains subtle, clamps out-of-stage pointers and supports reduced motion', () => {
  assert.deepEqual(parallaxOffset(0, 0), { x: -0, y: -0 });
  assert.deepEqual(parallaxOffset(1, 1), { x: -10, y: -5.5 });
  assert.deepEqual(parallaxOffset(900, -900, 200), { x: -18, y: 9.9 });
  const reduced = parallaxOffset(1, -1, 18, true);
  assert.equal(Math.abs(reduced.x) + Math.abs(reduced.y), 0);
  assert.equal(Math.abs(parallaxOffset(1, 1, 0).x), 0);
});

test('HUD announces changing health and energy independently of baked artwork', () => {
  const html = renderToStaticMarkup(
    createElement(HeroHUD, { hp: 16, maxHp: 40, energy: 3 }),
  );
  assert.match(html, /Здоровье 16 из 40\. Энергия 3 из 12/);
  assert.match(html, /16\/40 HP/);
  assert.match(html, /Энергия 3\/12/);
  assert.equal((html.match(/class="level-heart"/g) || []).length, 5);
  assert.equal((html.match(/class="level-drop"/g) || []).length, 5);
});

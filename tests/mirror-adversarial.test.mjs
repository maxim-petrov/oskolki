import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  dispatch,
  saveGame,
  loadGame,
  previewSwap,
  enemyFor,
  TURN_LIMIT,
  DEFAULT_SKILLS,
} from '../game/mirror/engine.ts';
import { CHANNELS, findMatches, legalSwaps } from '../game/mirror/board.ts';

const config = (patch = {}) => ({
  seed: 71,
  classId: 'blade',
  mode: 'duel',
  foe: 0,
  testGear: [],
  ...patch,
});
function quiet(exclude = 'strike') {
  const kinds = CHANNELS.filter((kind) => kind !== exclude);
  return Array.from({ length: 56 }, (_, i) => ({
    id: 100 + i,
    kind: kinds[((i % 8) + Math.floor(i / 8)) % kinds.length],
    level: 1,
  }));
}
function triple(state, kind = 'strike') {
  state.board = quiet(kind);
  for (const cell of [8, 9, 18]) state.board[cell].kind = kind;
  state.nextId = 200;
  return { type: 'swap', a: 10, b: 18 };
}
function ready(patch = {}) {
  const state = createGame(config(patch));
  state.enemy.hp = state.enemy.maxHp = 9999;
  return state;
}
function step(state, command) {
  const result = dispatch(state, command);
  assert.equal(result.error, undefined);
  return result;
}

test('winning swaps count as actions and the fortieth winning swap is recorded as forty', () => {
  for (const preceding of [0, TURN_LIMIT - 1]) {
    const state = ready();
    state.turn = preceding;
    state.metrics.swaps = preceding;
    state.enemy.hp = 1;
    const { state: next } = step(state, triple(state));
    assert.equal(next.phase, 'won');
    assert.equal(next.turn, preceding + 1);
    assert.equal(next.metrics.swaps, preceding + 1);
    assert.equal(next.metrics.victories, 1);
    const repeated = dispatch(next, { type: 'swap', a: 0, b: 1 });
    assert.ok(repeated.error);
    assert.strictEqual(repeated.state, next);
  }
});

test('Diploma converts only new enhanced XP and never consumes previously earned XP', () => {
  const state = ready({ testGear: ['infiniteDiploma'] });
  state.hero.xp = 7;
  state.board = quiet();
  state.board[0].kind = 'super';
  state.nextId = 200;
  const { state: next } = step(state, { type: 'super', cell: 0 });
  assert.equal(next.hero.xp, 7);
  assert.ok(CHANNELS.every((kind) => next.hero.resonance[kind] >= 1));
});

test('enhanced attack items modify a damaging S, once per group rather than once per repeated hit', () => {
  const ordinary = ready();
  ordinary.board = quiet();
  ordinary.board[0].kind = 'super';
  ordinary.nextId = 200;
  const stylus = structuredClone(ordinary);
  stylus.hero.gear.weapon = 'stylus';
  const base = step(ordinary, { type: 'super', cell: 0 });
  const boosted = step(stylus, { type: 'super', cell: 0 });
  assert.equal(base.frames[0].enemyHp - boosted.frames[0].enemyHp, 2);
  assert.equal(base.state.turn, boosted.state.turn);
});

test('Ward cancels an incoming hit without independently deleting the enemy board mechanic', () => {
  const state = ready({ foe: 10, testGear: ['ward'] });
  state.enemy.cycle = 1;
  state.enemy.countdown = 1;
  state.rng.effect = 2200; // First deterministic effect roll is below 20%.
  const result = step(state, triple(state));
  assert.equal(result.state.hero.hp, state.hero.hp);
  assert.equal(result.state.board.filter((tile) => tile.bomb === 3).length, 2);
  assert.equal(result.state.enemy.cycle, 2);
});

test('a consumed run-wide Insurance never reappears in route rewards after replacement', () => {
  for (let seed = 0; seed < 100; seed++) {
    const state = createGame(
      config({ seed, mode: 'route', testGear: undefined }),
    );
    state.hero.itemState.run.insurance = 1;
    state.hero.gear = {};
    state.room = 18;
    state.enemy = enemyFor(18);
    state.enemy.hp = 1;
    const { state: won } = step(state, triple(state));
    assert.equal(won.phase, 'camp');
    assert.ok(!won.offers.includes('insurance'), `seed ${seed}`);
    assert.ok(!won.stock.includes('insurance'), `seed ${seed}`);
  }
});

test('once reflected bomb damage defeats the foe, later bombs cannot damage the winner', () => {
  const state = ready({ seed: 1, testGear: ['mirrorVest'] });
  state.enemy.hp = 1;
  const command = triple(state, 'mend');
  state.board[47].bomb = 1;
  state.board[55].bomb = 1;
  const { state: next } = step(state, command);
  assert.equal(next.phase, 'won');
  assert.equal(
    next.log.filter((line) => line.includes('Чернильная бомба взорвалась'))
      .length,
    1,
  );
  assert.equal(next.metrics.victories, 1);
});

test('a cleansed bomb respawned on the same physical tile retains its full new timer', () => {
  const state = ready({
    seed: 1,
    foe: 10,
    skills: { ...DEFAULT_SKILLS, mend: 'cleanse' },
  });
  const command = triple(state, 'mend');
  state.board[8].level = 2;
  state.board[55].bomb = 1;
  state.enemy.cycle = 1;
  state.enemy.countdown = 1;
  state.rng.effect = 30;
  const id = state.board[55].id;
  const { state: next } = step(state, command);
  assert.equal(next.board.find((tile) => tile.id === id)?.bomb, 3);
  assert.equal(next.board.filter((tile) => tile.bomb === 3).length, 2);
});

test('an entirely pinned board recovers after a free S without losing earned tiles or a turn', () => {
  const state = ready();
  state.board = quiet().map((tile) => ({ ...tile, locked: 3 }));
  delete state.board[0].locked;
  state.board[0].kind = 'super';
  state.board[55].level = 3;
  state.nextId = 200;
  const earned = state.board[55].id;
  const { state: next, frames } = step(state, { type: 'super', cell: 0 });
  assert.equal(next.phase, 'battle');
  assert.equal(next.turn, 0);
  assert.equal(next.enemy.countdown, 3);
  assert.equal(findMatches(next.board).length, 0);
  assert.ok(
    legalSwaps(next.board).length > 0 ||
      next.board.some((tile) => tile.kind === 'super' && !tile.locked),
  );
  assert.ok(next.board.some((tile) => tile.id === earned && tile.level === 3));
  assert.ok(frames.some((frame) => frame.kind === 'shuffle'));
});

test('visible previews do not leak effect, loot or refill streams even with proc-heavy equipment', () => {
  const state = ready({
    testGear: ['glassNib', 'overflowRobe', 'mint', 'spinningTop'],
  });
  const move = legalSwaps(state.board)[0];
  const original = structuredClone(state);
  const preview = previewSwap(state, move.a, move.b);
  for (const seed of [0, 1, 999, 0xffffffff]) {
    const other = structuredClone(state);
    other.rng = { board: seed, effect: seed, loot: seed };
    assert.deepEqual(previewSwap(other, move.a, move.b), preview);
  }
  assert.deepEqual(state, original);
});

test('normal dispatcher stress stays finite, stable and replayable across foe mechanics', () => {
  for (let foe = 0; foe < 20; foe++) {
    let state = createGame(config({ seed: 250 + foe, foe }));
    for (let action = 0; action < 50 && state.phase === 'battle'; action++) {
      assert.equal(findMatches(state.board).length, 0);
      const cell = state.board.findIndex(
        (tile) => tile.kind === 'super' && !tile.locked,
      );
      const moves = legalSwaps(state.board);
      assert.ok(cell >= 0 || moves.length > 0, `foe ${foe}, action ${action}`);
      const command =
        cell >= 0
          ? { type: 'super', cell }
          : { type: 'swap', ...moves[action % moves.length] };
      state = step(state, command).state;
      assert.equal(state.board.length, 56);
      assert.equal(new Set(state.board.map((tile) => tile.id)).size, 56);
      assert.ok(
        Number.isFinite(
          state.hero.hp + state.enemy.hp + state.hero.rage + state.hero.barrier,
        ),
      );
      assert.ok(state.hero.hp >= 0 && state.hero.hp <= state.hero.maxHp);
      assert.ok(state.hero.barrier >= 0 && state.hero.barrier <= 12);
    }
    assert.deepEqual(loadGame(saveGame(state)), state, `foe ${foe}`);
  }
});

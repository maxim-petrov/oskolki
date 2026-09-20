import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGame,
  dispatch,
  defenseForGroup,
  enemyHitDamage,
  intentText,
  enemyFor,
  saveGame,
  loadGame,
} from '../game/mirror/engine.ts';
import {
  CHANNELS,
  findMatches,
  swapBoard,
  legalSwaps,
} from '../game/mirror/board.ts';
import * as legacy from '../game/mirror/legacy-v1/engine.ts';
import { legalSwaps as oldSwaps } from '../game/mirror/legacy-v1/board.ts';

function ready() {
  const s = createGame({
    seed: 1,
    classId: 'blade',
    mode: 'duel',
    foe: 0,
    testGear: [],
  });
  s.enemy.hp = s.enemy.maxHp = 99999;
  return s;
}
function group(s, kind = 'strike', size = 3, level = 1) {
  const alternatives = CHANNELS.filter((c) => c !== kind);
  s.board = Array.from({ length: 56 }, (_, i) => ({
    id: ++s.nextId,
    kind: alternatives[((i % 8) + Math.floor(i / 8)) % 3],
    level: 1,
  }));
  for (let i = 0; i < size - 1; i++) s.board[8 + i].kind = kind;
  s.board[8].level = level;
  s.board[16 + size - 1].kind = kind;
  return { type: 'swap', a: 8 + size - 1, b: 16 + size - 1 };
}
function step(s, c) {
  const result = dispatch(s, c);
  assert.equal(result.error, undefined);
  return result;
}

test('defense strength ignores rage and level; shape and highest stone level matter', () => {
  const s = ready();
  for (const [size, level, expected] of [
    [3, 1, 4],
    [4, 1, 8],
    [3, 2, 6],
    [3, 3, 8],
  ]) {
    const cmd = group(s, 'mend', size, level);
    const board = swapBoard(s.board, cmd),
      match = findMatches(board)[0];
    s.hero.rage = 0;
    s.hero.level = 1;
    assert.equal(defenseForGroup(s, match, board), expected);
    s.hero.rage = 60;
    s.hero.level = 20;
    assert.equal(defenseForGroup(s, match, board), expected);
    s.buffs.healing = 3;
    assert.equal(defenseForGroup(s, match, board), expected + 2);
    s.buffs.healing = 0;
  }
});

test('barrier survives countdown, delay and free S, then expires even after a zero-damage action', () => {
  let s = ready();
  s.hero.barrier = 12;
  s.enemy.intents = [
    { kind: 'lock', name: 'Пауза', wait: 2, damage: 0, hits: 0, count: 0 },
  ];
  s.enemy.countdown = 2;
  s.enemy.delay = 1;
  s = step(s, group(s)).state;
  assert.equal(s.enemy.countdown, 2);
  assert.equal(s.hero.barrier, 12);
  s = step(s, group(s)).state;
  assert.equal(s.enemy.countdown, 1);
  assert.equal(s.hero.barrier, 12);
  s.board[55] = { id: ++s.nextId, kind: 'super', level: 1 };
  s = step(s, { type: 'super', cell: 55 }).state;
  assert.equal(s.enemy.countdown, 1);
  assert.equal(s.hero.barrier, 12);
  assert.deepEqual(enemyHitDamage(s), []);
  assert.ok(intentText(s).includes('0 урона'));
  s = step(s, group(s)).state;
  assert.equal(s.enemy.cycle, 1);
  assert.equal(s.hero.barrier, 0);
  assert.equal(s.hero.hp, 120);
});

test('a combo queues the next phase without repricing the already announced attack', () => {
  const s = ready();
  s.enemy.hp = s.enemy.maxHp = 120;
  s.enemy.countdown = 1;
  s.enemy.intents = [
    { kind: 'attack', name: 'Удар', wait: 2, damage: 20, hits: 1 },
  ];
  const cmd = group(s, 'strike', 5);
  assert.deepEqual(enemyHitDamage(s), [20]);
  const result = step(s, cmd),
    next = result.state;
  assert.equal(next.phase, 'battle');
  assert.ok(next.last.damage >= 36);
  assert.equal(next.enemy.stage, 2);
  assert.equal(next.enemy.pendingStage, 2);
  assert.equal(next.hero.hp, 100);
  assert.deepEqual(enemyHitDamage(next), [26]);
  assert.ok(intentText(next).includes('26 урона'));
});

test('boss multi-hits divide one budget and first-hit weakening does not apply three times', () => {
  for (const room of [4, 9, 14, 19]) {
    const s = ready();
    s.enemy = enemyFor(room);
    s.enemy.cycle = 2;
    s.enemy.stage = 2;
    const total = Math.floor(s.enemy.intents[2].damage * 1.3);
    const hits = enemyHitDamage(s);
    assert.equal(hits.length, 3);
    assert.equal(
      hits.reduce((a, b) => a + b, 0),
      total,
    );
    assert.ok(total <= 42, `room ${room + 1}: ${total}`);
    s.enemy.weaken = 2;
    assert.deepEqual(enemyHitDamage(s), [
      Math.max(0, hits[0] - 2),
      hits[1],
      hits[2],
    ]);
    s.buffs.weakness = 1;
    const reduced = enemyHitDamage(s);
    assert.equal(
      reduced.reduce((a, b) => a + b, 0),
      Math.floor(s.enemy.intents[2].damage * 1.3 * 0.7) - 2,
    );
    assert.ok(intentText(s).includes(reduced.join(' + ')));
  }
});

test('weakened series telegraph and execution agree, including a partially used barrier', () => {
  const s = ready();
  s.enemy.stage = s.enemy.pendingStage = 2;
  s.enemy.countdown = 1;
  s.enemy.weaken = 2;
  s.buffs.weakness = 2;
  s.hero.barrier = 5;
  s.enemy.intents = [
    { kind: 'flurry', name: 'Серия', wait: 2, damage: 33, hits: 3 },
  ];
  const hits = enemyHitDamage(s),
    total = hits.reduce((a, b) => a + b, 0);
  const next = step(s, group(s)).state;
  assert.equal(next.hero.hp, 120 - total + 5);
  assert.equal(next.hero.barrier, 0);
});

test('v1 journals remain byte-compatible in their frozen engine and cannot be reinterpreted as v2', () => {
  const raw = readFileSync(
    new URL('./fixtures/mirror-v1-journal.json', import.meta.url),
    'utf8',
  ).trim();
  const s = legacy.loadGame(raw);
  assert.ok(s);
  assert.equal(s.version, 1);
  assert.equal(s.room, 4);
  assert.equal(s.hero.hp, 128);
  assert.equal(s.hero.gold, 61);
  assert.equal(legacy.saveGame(s), raw);
  assert.equal(loadGame(raw), null);
  const cmd = { type: 'swap', ...oldSwaps(s.board)[0] };
  const continued = legacy.dispatch(s, cmd);
  assert.equal(continued.error, undefined);
  assert.deepEqual(
    legacy.loadGame(legacy.saveGame(continued.state)),
    continued.state,
  );
  let v2 = createGame({ seed: 71, classId: 'blade', mode: 'duel', foe: 0 });
  v2 = step(v2, { type: 'swap', ...legalSwaps(v2.board)[0] }).state;
  assert.equal(JSON.parse(saveGame(v2)).schema, 'oskolki-mirror-2');
  assert.equal(legacy.loadGame(saveGame(v2)), null);
  assert.deepEqual(loadGame(saveGame(v2)), v2);
});

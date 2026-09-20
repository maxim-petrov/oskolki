import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIDTH,
  HEIGHT,
  CHANNELS,
  KINDS,
  adjacent,
  swapBoard,
  findMatches,
  legalSwaps,
  freshBoard,
  fall,
  reshuffle,
} from '../game/mirror/board.ts';

const clone = (value) => structuredClone(value);
const quiet = (excluded = 'super') => {
  const kinds = CHANNELS.filter((kind) => kind !== excluded);
  return Array.from({ length: WIDTH * HEIGHT }, (_, i) => ({
    id: i,
    kind: kinds[((i % WIDTH) + Math.floor(i / WIDTH)) % kinds.length],
    level: 1,
  }));
};
function paint(board, cells, kind = 'strike') {
  for (const i of cells) board[i] = { ...board[i], kind };
  return board;
}
const counter =
  (start = 1000) =>
  () =>
    start++;
const rng = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const matching = (cells, kind = 'strike') =>
  findMatches(paint(quiet(kind), cells, kind)).filter(
    (match) => match.kind === kind,
  );

test('mirror board uses 8×7 orthogonal geometry with no wrapped edges', () => {
  assert.equal(WIDTH * HEIGHT, 56);
  assert.equal(KINDS.length, 5);
  assert.ok(adjacent(47, 55));
  assert.ok(adjacent(54, 55));
  for (const [a, b] of [
    [7, 8],
    [48, 55],
    [55, 56],
    [-1, 0],
    [0, 1.1],
    [0, 9],
  ])
    assert.equal(adjacent(a, b), false);
});

test('match shape selects cast count and upgrade independently from stone levels', () => {
  /** @type {[number[], string, number, number | string | undefined, number][]} */
  const expected = [
    [[8, 9, 10], 'three', 1, undefined, 0],
    [[8, 9, 10, 11], 'four', 2, 2, 0],
    [[9, 10, 11, 2, 18], 'cross', 3, 3, 0],
    [[8, 9, 10, 11, 12], 'five', 4, 'super', 0],
    [[8, 9, 10, 11, 12, 13], 'five', 4, 'super', 0.5],
    [[8, 9, 10, 11, 12, 2, 18], 'five', 4, 'super', 1],
  ];
  for (const [cells, shape, casts, upgrade, bonus] of expected) {
    const [match] = matching(cells);
    assert.equal(match.shape, shape);
    assert.equal(match.casts, casts);
    assert.equal(match.upgrade, upgrade);
    assert.equal(match.bonus, bonus);
    assert.deepEqual(
      match.cells,
      [...cells].sort((a, b) => a - b),
    );
  }
  const board = paint(quiet('strike'), [8, 9, 10]);
  board[8].level = 2;
  board[10].level = 3;
  const [match] = findMatches(board);
  assert.equal(match.shape, 'three');
  assert.equal(match.casts, 1);
  assert.equal(match.bonus, 1.5);
  assert.equal(match.upgrade, undefined);
});

test('connected intersections collect once; independent parallel triples stay separate', () => {
  const [cross] = matching([9, 10, 11, 2, 18]);
  assert.equal(cross.cells.length, 5);
  assert.equal(new Set(cross.cells).size, 5);
  assert.equal(cross.longest, 3);
  const two = matching([0, 1, 2, 8, 9, 10]);
  assert.equal(two.length, 2);
  assert.deepEqual(
    two.map((m) => m.shape),
    ['three', 'three'],
  );
  assert.equal(two.flatMap((m) => m.cells).length, 6);
});

test('S is a separate type, never a wildcard or a source of more S by matching', () => {
  const board = paint(quiet('strike'), [8, 10]);
  board[9].kind = 'super';
  assert.equal(
    findMatches(board).some((m) => m.kind === 'strike'),
    false,
  );
  for (const size of [3, 4, 5]) {
    const [match] = matching(
      Array.from({ length: size }, (_, i) => 8 + i),
      'super',
    );
    assert.equal(match.kind, 'super');
    assert.equal(match.casts, 1);
    assert.equal(match.bonus, 0);
    assert.equal(match.upgrade, undefined);
    assert.equal(match.cells.length, size);
  }
});

test('locks prevent selected swaps but locked neighbors still match and swaps are pure', () => {
  const board = paint(quiet('strike'), [8, 9, 18]);
  const move = { a: 10, b: 18 };
  const contains = (moves) =>
    moves.some(({ a, b }) => a === move.a && b === move.b);
  assert.ok(contains(legalSwaps(board)));
  board[9].locked = 3;
  assert.ok(contains(legalSwaps(board)));
  const before = clone(board);
  const swapped = swapBoard(board, move);
  assert.deepEqual(board, before);
  assert.equal(swapped[10].id, 18);
  assert.ok(findMatches(swapped).some((m) => m.cells.includes(9)));
  board[10].locked = 1;
  assert.equal(contains(legalSwaps(board)), false);
  board[10].locked = 0;
  assert.ok(contains(legalSwaps(board)));
});

test('unrelated existing matches never authorize an otherwise invalid swap', () => {
  const board = paint(quiet('strike'), [0, 1, 2]);
  assert.ok(findMatches(board).length > 0);
  assert.equal(
    legalSwaps(board).some(({ a, b }) => a === 54 && b === 55),
    false,
  );
});

test('fresh boards are stable, playable, base-only, uniquely identified and seeded', () => {
  for (let seed = 0; seed < 100; seed++) {
    const board = freshBoard(rng(seed), counter(0));
    assert.equal(board.length, 56);
    assert.equal(new Set(board.map((tile) => tile.id)).size, 56);
    assert.equal(findMatches(board).length, 0, `stable seed ${seed}`);
    assert.ok(legalSwaps(board).length > 0, `playable seed ${seed}`);
    assert.ok(
      board.every((tile) => CHANNELS.includes(tile.kind) && tile.level === 1),
    );
    assert.deepEqual(board, freshBoard(rng(seed), counter(0)));
  }
  for (const value of [0, 0.999999]) {
    const board = freshBoard(() => value, counter(0));
    assert.equal(findMatches(board).length, 0);
    assert.ok(legalSwaps(board).length > 0);
  }
});

test('surviving locked stones divide gravity into anchored column segments', () => {
  const board = quiet();
  board[24].locked = 3;
  board[16].level = 3;
  board[16].bomb = 2;
  const before = clone(board);
  const next = fall(board, new Set([8, 40]), rng(3), counter());
  assert.deepEqual(board, before);
  assert.equal(next[24].id, 24);
  assert.equal(next[24].locked, 3);
  assert.equal(next[16].id, 16);
  assert.equal(next[16].level, 3);
  assert.equal(next[16].bomb, 2);
  assert.equal(next[8].id, 0);
  assert.equal(next[48].id, 48);
  assert.equal(next[40].id, 32);
  assert.ok(next[0].id >= 1000);
  assert.ok(next[32].id >= 1000);
  assert.equal(new Set(next.map((tile) => tile.id)).size, 56);
  assert.equal(next.filter((tile) => tile.id >= 1000).length, 2);
});

test('consuming a locked tile removes its anchor; protected upgrades survive and fall', () => {
  const board = quiet();
  board[24].locked = 2;
  const next = fall(board, new Set([8, 24, 40]), rng(3), counter());
  assert.deepEqual(
    [48, 40, 32, 24].map((i) => next[i].id),
    [48, 32, 16, 0],
  );
  assert.equal(
    next.some((tile) => tile.id === 24),
    false,
  );
  const replacement = { id: 2000, kind: 'strike', level: 2 };
  const upgraded = fall(
    quiet(),
    new Set([0, 8]),
    rng(3),
    counter(),
    new Map([[0, replacement]]),
  );
  assert.equal(upgraded[8].id, 2000);
  assert.equal(upgraded[8].level, 2);
  assert.equal(
    upgraded.filter((tile) => tile.id >= 1000 && tile.id !== 2000).length,
    1,
  );
});

test('protected locked replacements remain anchors, including at the top and bottom', () => {
  const board = quiet();
  const fixedTop = { id: 2000, kind: 'rage', level: 3, locked: 2 };
  const fixedBottom = { id: 2001, kind: 'mend', level: 2, locked: 1 };
  const next = fall(
    board,
    new Set([0, 8, 48]),
    rng(2),
    counter(),
    new Map([
      [0, fixedTop],
      [48, fixedBottom],
    ]),
  );
  assert.deepEqual(next[0], fixedTop);
  assert.deepEqual(next[48], fixedBottom);
  assert.equal(next[40].id, 40);
  assert.ok(next[8].id >= 1000);
});

test('reshuffle keeps all upgrades, bombs and fixed locks without introducing immediate lines', () => {
  const board = quiet();
  paint(board, [8, 9, 10]);
  board[8].level = 3;
  board[9].bomb = 2;
  board[24].locked = 2;
  board[25].kind = 'super';
  const before = clone(board);
  const next = reshuffle(board, rng(71));
  assert.deepEqual(board, before);
  assert.deepEqual(next[24], before[24]);
  assert.equal(findMatches(next).length, 0);
  assert.ok(
    legalSwaps(next).length > 0 || next.some((tile) => tile.kind === 'super'),
  );
  assert.deepEqual(
    [...next].sort((a, b) => a.id - b.id),
    [...before].sort((a, b) => a.id - b.id),
  );
  assert.deepEqual(next, reshuffle(board, rng(71)));
});

test('impossible locked boards are returned honestly without erasing hazards or consuming ids', () => {
  const board = quiet().map((tile) => ({ ...tile, locked: 2 }));
  board[0].level = 3;
  board[1].bomb = 3;
  assert.equal(legalSwaps(board).length, 0);
  assert.deepEqual(reshuffle(board, rng(19)), board);
});

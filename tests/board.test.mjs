import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoard,
  findGroups,
  gravity,
  idx,
  shiftCells,
  validMoves,
  isValidMove,
  canShift,
} from '../game/board.ts';
import { rng } from '../game/rng.ts';
import { QUEUE_LEN } from '../game/types.ts';

const F = { b: 'blade', s: 'shield', i: 'ink', c: 'coin', p: 'prism', j: 'junk' };
/** Board from 6 strings of letters b/s/i/c/p/j. */
function cells(rows) {
  let id = 1;
  return rows.flatMap((row) => [...row].map((ch) => ({ id: id++, kind: F[ch] })));
}
const filler = ['sicbsi', 'cbsicb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];

test('rows and columns shift cyclically', () => {
  const c = cells(['bsicbs', ...filler.slice(1)]);
  const right = shiftCells(c, { line: 'row', index: 0, delta: 1 });
  assert.deepEqual(right.slice(0, 6).map((t) => t.kind), ['shield', 'blade', 'shield', 'ink', 'coin', 'blade']);
  const down = shiftCells(c, { line: 'col', index: 0, delta: 1 });
  assert.equal(down[idx(1, 0)].id, c[idx(0, 0)].id);
  assert.equal(down[idx(0, 0)].id, c[idx(5, 0)].id);
});

test('a filler board has no matches', () => {
  assert.equal(findGroups(cells(filler), false).length, 0);
});

test('lines of 3, 4 and 5 create nothing, a rocket and a prism', () => {
  const three = cells(['bbbics', ...filler.slice(1)]);
  const g3 = findGroups(three, false);
  assert.equal(g3.length, 1);
  assert.equal(g3[0].make, null);
  const four = cells(['bbbbcs', ...filler.slice(1)]);
  const g4 = findGroups(four, false, [0, 1, 2, 3, 4, 5]);
  assert.equal(g4[0].make, 'rocketH');
  const five = cells(['bbbbbs', ...filler.slice(1)]);
  assert.equal(findGroups(five, false)[0].make, 'prism');
});

test('an L shape becomes one group that makes a bomb', () => {
  const l = cells(['bsicbs', 'bicbsi', 'bbbics', ...filler.slice(3)]);
  const groups = findGroups(l, false).filter((g) => g.fam === 'blade');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 5);
  assert.equal(groups[0].make, 'bomb');
  assert.equal(groups[0].at, idx(2, 0));
});

test('prisms are wild and wrap mode joins opposite edges', () => {
  const wild = cells(['bpbics', ...filler.slice(1)]);
  assert.equal(findGroups(wild, false)[0].fam, 'blade');
  const wrap = cells(['bsicbb', ...filler.slice(1)]);
  assert.equal(findGroups(wrap, false).length, 0);
  const g = findGroups(wrap, true);
  assert.equal(g.length, 1);
  // Row 0 wraps (cells 4,5,0) and column 5 wraps (rows 5,0,1): one cross group.
  assert.deepEqual(g[0].cells, [0, 4, 5, 11, 35]);
  assert.equal(g[0].make, 'bomb');
});

test('gravity drops tiles and refills from the queue head first', () => {
  const r = rng(7);
  const b = createBoard(r);
  const next = b.cells.slice();
  const head = b.queue[0][0];
  const second = b.queue[0][1];
  next[idx(5, 0)] = null;
  next[idx(4, 0)] = null;
  const above = b.cells[idx(3, 0)];
  const { falls, spawns } = gravity(b, r, next);
  assert.equal(b.cells[idx(5, 0)].id, above.id);
  assert.ok(falls.some((f) => f.id === above.id && f.to === idx(5, 0)));
  assert.equal(b.cells[idx(1, 0)].id, head.id, 'head lands lowest among new tiles');
  assert.equal(b.cells[idx(0, 0)].id, second.id);
  assert.equal(spawns.length, 2);
  assert.equal(b.queue[0].length, QUEUE_LEN);
});

test('fresh boards are deterministic, match-free and playable', () => {
  const a = createBoard(rng(42));
  const b = createBoard(rng(42));
  assert.deepEqual(a.cells, b.cells);
  assert.equal(findGroups(a.cells, false).length, 0);
  assert.ok(validMoves(a, false).length >= 6);
});

test('pins lock their row and column; floods lock rows horizontally', () => {
  const b = createBoard(rng(3));
  b.cells[idx(2, 3)].pin = true;
  assert.equal(canShift(b, 'row', 2), false);
  assert.equal(canShift(b, 'col', 3), false);
  assert.equal(canShift(b, 'row', 1), true);
  b.flood = 2;
  assert.equal(canShift(b, 'row', 5), false);
  assert.equal(canShift(b, 'col', 0), true);
  assert.equal(isValidMove(b, { line: 'row', index: 2, delta: 1 }, false), false);
});

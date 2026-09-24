import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacent,
  createBoard,
  findGroups,
  gravity,
  idx,
  isValidMove,
  lineFree,
  shiftCells,
  swapBlock,
  swapCells,
  validMoves,
} from '../game/board.ts';
import { rng } from '../game/rng.ts';
import { QUEUE_LEN } from '../game/types.ts';
import { STARTER_BAG } from './helpers.mjs';

const F = { b: 'blade', s: 'shield', i: 'ink', c: 'coin', p: 'prism', j: 'junk' };
/** Board from 6 strings of letters b/s/i/c/p/j. */
function cells(rows) {
  let id = 1;
  return rows.flatMap((row) => [...row].map((ch) => ({ id: id++, kind: F[ch] })));
}
const filler = ['sicbsi', 'cbsicb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];

test('a swap exchanges two neighbours; only neighbours may swap', () => {
  const c = cells(['bsicbs', ...filler.slice(1)]);
  const out = swapCells(c, { from: idx(0, 0), to: idx(0, 1) });
  assert.deepEqual(out.slice(0, 3).map((t) => t.kind), ['shield', 'blade', 'ink']);
  assert.ok(adjacent(idx(2, 2), idx(3, 2), false));
  assert.ok(!adjacent(idx(2, 2), idx(3, 3), false), 'no diagonals');
  assert.ok(!adjacent(idx(0, 5), idx(0, 0), false));
  assert.ok(adjacent(idx(0, 5), idx(0, 0), true), 'the ring joins the edges');
});

test('a swap is a move only when it matches or sets off a special', () => {
  const b = { cells: cells(['sicbsi', 'bbiccs', ...filler.slice(2)]), queue: [], nextId: 100, flood: 0, colLock: Array(6).fill(0), rowLock: Array(6).fill(0), bag: [], source: [] };
  b.cells[idx(0, 2)].kind = 'blade';
  assert.ok(isValidMove(b, { from: idx(0, 2), to: idx(1, 2) }, false), 'completes b b b in row 1');
  assert.ok(!isValidMove(b, { from: idx(4, 4), to: idx(4, 5) }, false), 'no match anywhere');
  b.cells[idx(4, 4)].special = 'bomb';
  assert.ok(isValidMove(b, { from: idx(4, 4), to: idx(4, 5) }, false), 'a swapped bomb goes off');
});

test('the crab still drags whole rows cyclically', () => {
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
  const b = createBoard(r, STARTER_BAG);
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
  const a = createBoard(rng(42), STARTER_BAG);
  const b = createBoard(rng(42), STARTER_BAG);
  assert.deepEqual(a.cells, b.cells);
  assert.equal(findGroups(a.cells, false).length, 0);
  assert.ok(validMoves(a, false).length >= 6);
});

test('staples, anchors and water block swaps', () => {
  const b = createBoard(rng(3), STARTER_BAG);
  b.cells[idx(2, 3)].pin = true;
  assert.equal(swapBlock(b, { from: idx(2, 3), to: idx(2, 4) }, false), 'Фишка прибита скобой');
  assert.equal(swapBlock(b, { from: idx(1, 3), to: idx(2, 3) }, false), 'Фишка прибита скобой', 'nothing swaps into a staple');
  assert.equal(swapBlock(b, { from: idx(2, 4), to: idx(2, 5) }, false), null);
  assert.equal(lineFree(b, 'row', 2), false, 'the crab cannot drag a stapled row');
  b.colLock[0] = 2;
  assert.equal(swapBlock(b, { from: idx(3, 0), to: idx(3, 1) }, false), 'Столбец на якоре');
  b.colLock[0] = 0;
  b.flood = 2;
  assert.equal(swapBlock(b, { from: idx(5, 1), to: idx(5, 2) }, false), 'Под водой фишки не ходят вбок');
  assert.equal(swapBlock(b, { from: idx(3, 1), to: idx(4, 1) }, false), null, 'tiles still float up out of the water');
  assert.equal(isValidMove(b, { from: idx(5, 1), to: idx(5, 2) }, false), false);
});

test('the board is dealt from the deck bag and refills from it', () => {
  const bag = [...Array(18).fill({ card: 'fist', up: false }), ...Array(18).fill({ card: 'folder', up: false })];
  const b = createBoard(rng(5), bag);
  assert.ok(b.cells.every((t) => t.card === 'fist' || t.card === 'folder'), 'only deck cards on the board');
  assert.ok(b.cells.every((t) => (t.card === 'fist' ? t.kind === 'blade' : t.kind === 'shield')));
  assert.ok(b.queue.flat().every((t) => t.card === 'fist' || t.card === 'folder'), 'the queue comes from the bag too');
  const redtape = createBoard(rng(5), [...bag, { card: 'redtape', up: false }]);
  assert.ok(redtape.cells.concat(redtape.queue.flat()).filter((t) => t.card === 'redtape').every((t) => t.kind === 'junk'), 'status cards become junk');
});

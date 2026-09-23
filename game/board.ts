import {
  CELLS,
  FAMS,
  H,
  QUEUE_LEN,
  W,
  type BoardState,
  type Fam,
  type Group,
  type Move,
  type Tile,
  type TileKind,
} from './types.ts';
import { int, next, shuffle, type Rng } from './rng.ts';

export const idx = (r: number, c: number) => r * W + c;
export const rowOf = (i: number) => Math.floor(i / W);
export const colOf = (i: number) => i % W;

export const FAM_WEIGHTS: readonly (readonly [Fam, number])[] = [
  ['blade', 28],
  ['shield', 26],
  ['ink', 24],
  ['coin', 22],
];

export function randomFam(r: Rng, weights = FAM_WEIGHTS): Fam {
  let total = 0;
  for (const [, w] of weights) total += w;
  let roll = next(r) * total;
  for (const [fam, w] of weights) {
    roll -= w;
    if (roll < 0) return fam;
  }
  return weights[weights.length - 1][0];
}

export function makeTile(b: { nextId: number }, kind: TileKind, extra: Partial<Tile> = {}): Tile {
  return { id: b.nextId++, kind, ...extra };
}

export const cloneTile = (t: Tile): Tile => ({ ...t });
export const cloneCells = (cells: Tile[]) => cells.map(cloneTile);

export function cloneBoard(b: BoardState): BoardState {
  return {
    cells: cloneCells(b.cells),
    queue: b.queue.map((q) => q.map(cloneTile)),
    nextId: b.nextId,
    flood: b.flood,
    colLock: b.colLock.slice(),
    rowLock: b.rowLock.slice(),
  };
}

const lineCells = (line: 'row' | 'col', index: number) =>
  line === 'row'
    ? Array.from({ length: W }, (_, c) => idx(index, c))
    : Array.from({ length: H }, (_, r) => idx(r, index));

/** Rows and columns that the player may shift right now. */
export function canShift(b: BoardState, line: 'row' | 'col', index: number): boolean {
  if (line === 'row') {
    if (index >= H - b.flood) return false;
    if (b.rowLock[index] > 0) return false;
  } else if (b.colLock[index] > 0) return false;
  return !lineCells(line, index).some((i) => b.cells[i]?.pin);
}

export function shiftCells(cells: Tile[], m: Move): Tile[] {
  const out = cells.slice();
  if (m.line === 'row') {
    const d = ((m.delta % W) + W) % W;
    for (let c = 0; c < W; c++) out[idx(m.index, (c + d) % W)] = cells[idx(m.index, c)];
  } else {
    const d = ((m.delta % H) + H) % H;
    for (let r = 0; r < H; r++) out[idx((r + d) % H, m.index)] = cells[idx(r, m.index)];
  }
  return out;
}

/** Runs of cells where ok() holds, length >= 3, containing at least one real family tile. */
function runsInLine(
  line: number[],
  ok: (i: number) => boolean,
  real: (i: number) => boolean,
  circular: boolean,
): number[][] {
  const n = line.length;
  if (circular) {
    let start = -1;
    for (let k = 0; k < n; k++)
      if (!ok(line[k])) {
        start = k;
        break;
      }
    if (start < 0) return line.some(real) ? [line.slice()] : [];
    const rotated = [...line.slice(start + 1), ...line.slice(0, start + 1)];
    return runsInLine(rotated, ok, real, false);
  }
  const out: number[][] = [];
  let s = 0;
  while (s < n) {
    if (!ok(line[s])) {
      s++;
      continue;
    }
    let e = s;
    while (e + 1 < n && ok(line[e + 1])) e++;
    if (e - s + 1 >= 3) {
      const cells = line.slice(s, e + 1);
      if (cells.some(real)) out.push(cells);
    }
    s = e + 1;
  }
  return out;
}

const ROWS = Array.from({ length: H }, (_, r) => lineCells('row', r));
const COLS = Array.from({ length: W }, (_, c) => lineCells('col', c));

/**
 * All match groups on the board. Prisms are wild and may join several families.
 * `prefer` biases where a created special appears (the cells of the moved line).
 */
export function findGroups(cells: Tile[], wrap: boolean, prefer: readonly number[] = []): Group[] {
  const groups: Group[] = [];
  for (const fam of FAMS) {
    const ok = (i: number) => {
      const t = cells[i];
      return !!t && (t.kind === fam || t.kind === 'prism');
    };
    const real = (i: number) => cells[i]?.kind === fam;
    const runs: { cells: number[]; h: boolean }[] = [];
    for (const line of ROWS) for (const cs of runsInLine(line, ok, real, wrap)) runs.push({ cells: cs, h: true });
    for (const line of COLS) for (const cs of runsInLine(line, ok, real, wrap)) runs.push({ cells: cs, h: false });
    if (!runs.length) continue;
    const parent = runs.map((_, k) => k);
    const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
    for (let a = 0; a < runs.length; a++)
      for (let b = a + 1; b < runs.length; b++)
        if (runs[a].cells.some((c) => runs[b].cells.includes(c))) parent[find(a)] = find(b);
    const byRoot = new Map<number, number[]>();
    runs.forEach((_, k) => {
      const root = find(k);
      byRoot.set(root, [...(byRoot.get(root) ?? []), k]);
    });
    for (const members of byRoot.values()) {
      const set = new Set<number>();
      for (const k of members) for (const c of runs[k].cells) set.add(c);
      const groupRuns = members.map((k) => runs[k]);
      const longestRun = groupRuns.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const hasH = groupRuns.some((r) => r.h);
      const hasV = groupRuns.some((r) => !r.h);
      const cross = hasH && hasV;
      const size = set.size;
      const longest = longestRun.cells.length;
      const make: Group['make'] =
        longest >= 5 ? 'prism' : cross && size >= 5 ? 'bomb' : longest === 4 ? (longestRun.h ? 'rocketH' : 'rocketV') : null;
      let at = -1;
      if (make) {
        let candidates: number[];
        if (make === 'bomb') {
          const hCells = new Set(groupRuns.filter((r) => r.h).flatMap((r) => r.cells));
          candidates = groupRuns.filter((r) => !r.h).flatMap((r) => r.cells).filter((c) => hCells.has(c));
        } else candidates = longestRun.cells;
        if (!candidates.length) candidates = [...set];
        const preferred = candidates.filter((c) => prefer.includes(c));
        const pool = preferred.length ? preferred : candidates;
        at = pool[Math.floor((pool.length - 1) / 2)];
        // Keep specials on real tiles where possible (a prism turning into a rocket reads badly).
        const realPool = pool.filter((c) => cells[c]?.kind === fam);
        if (realPool.length && cells[at]?.kind !== fam) at = realPool[Math.floor((realPool.length - 1) / 2)];
      }
      groups.push({
        fam,
        cells: [...set].sort((a, b) => a - b),
        size,
        longest,
        cross,
        horizontal: longestRun.h,
        make,
        at,
      });
    }
  }
  return groups;
}

export function hasMatch(cells: Tile[], wrap: boolean): boolean {
  return findGroups(cells, wrap).length > 0;
}

export function allMoves(): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < H; r++) for (let d = 1; d < W; d++) out.push({ line: 'row', index: r, delta: d });
  for (let c = 0; c < W; c++) for (let d = 1; d < H; d++) out.push({ line: 'col', index: c, delta: d });
  return out;
}
const ALL_MOVES = allMoves();

export function validMoves(b: BoardState, wrap: boolean): Move[] {
  return ALL_MOVES.filter(
    (m) => canShift(b, m.line, m.index) && hasMatch(shiftCells(b.cells, m), wrap),
  );
}

export function isValidMove(b: BoardState, m: Move, wrap: boolean): boolean {
  if (!Number.isInteger(m.index) || !Number.isInteger(m.delta)) return false;
  const size = m.line === 'row' ? W : H;
  if (m.index < 0 || m.index >= (m.line === 'row' ? H : W)) return false;
  const d = ((m.delta % size) + size) % size;
  if (d === 0) return false;
  if (!canShift(b, m.line, m.index)) return false;
  return hasMatch(shiftCells(b.cells, { ...m, delta: d }), wrap);
}

export const moveCells = (m: Move) => lineCells(m.line, m.index);

function wouldMatchAt(cells: (Tile | undefined)[], i: number, kind: TileKind): boolean {
  const r = rowOf(i);
  const c = colOf(i);
  const at = (rr: number, cc: number) => cells[idx(rr, cc)]?.kind;
  if (c >= 2 && at(r, c - 1) === kind && at(r, c - 2) === kind) return true;
  if (r >= 2 && at(r - 1, c) === kind && at(r - 2, c) === kind) return true;
  return false;
}

export function fillQueue(b: BoardState, r: Rng) {
  for (let c = 0; c < W; c++) {
    while (b.queue[c].length < QUEUE_LEN) b.queue[c].push(makeTile(b, randomFam(r)));
  }
}

/** Fresh board without ready matches and with enough legal moves. */
export function createBoard(r: Rng, wrap = false, minMoves = 6, firstId = 1): BoardState {
  for (let attempt = 0; attempt < 200; attempt++) {
    const b: BoardState = {
      cells: [],
      queue: Array.from({ length: W }, () => []),
      nextId: firstId,
      flood: 0,
      colLock: Array(W).fill(0),
      rowLock: Array(H).fill(0),
    };
    const cells: Tile[] = [];
    for (let i = 0; i < CELLS; i++) {
      let fam = randomFam(r);
      for (let tries = 0; tries < 12 && wouldMatchAt(cells, i, fam); tries++) fam = randomFam(r);
      cells.push(makeTile(b, fam));
    }
    b.cells = cells;
    if (hasMatch(cells, wrap)) continue;
    if (validMoves(b, wrap).length < minMoves) continue;
    fillQueue(b, r);
    return b;
  }
  throw new Error('createBoard: could not build a playable board');
}

/**
 * Compact every column downwards and refill from its queue.
 * Returns falls (moved tiles) and spawns (tiles entering from above, rank = order from the bottom).
 */
export function gravity(b: BoardState, r: Rng, cells: (Tile | null)[]) {
  const falls: { id: number; from: number; to: number }[] = [];
  const spawns: { id: number; to: number; rank: number }[] = [];
  for (let c = 0; c < W; c++) {
    const stack: { tile: Tile; from: number }[] = [];
    for (let row = H - 1; row >= 0; row--) {
      const t = cells[idx(row, c)];
      if (t) stack.push({ tile: t, from: row });
    }
    let row = H - 1;
    for (const { tile, from } of stack) {
      if (from !== row) falls.push({ id: tile.id, from: idx(from, c), to: idx(row, c) });
      cells[idx(row, c)] = tile;
      row--;
    }
    let rank = 0;
    while (row >= 0) {
      const tile = b.queue[c].shift() ?? makeTile(b, randomFam(r));
      cells[idx(row, c)] = tile;
      spawns.push({ id: tile.id, to: idx(row, c), rank: rank++ });
      row--;
    }
  }
  b.cells = cells as Tile[];
  fillQueue(b, r);
  return { falls, spawns };
}

/** Free reshuffle when no legal move exists. Keeps specials, pins and fuses on their tiles. */
export function reshuffle(b: BoardState, r: Rng, wrap: boolean) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const cells = shuffle(r, b.cells.slice());
    if (hasMatch(cells, wrap)) continue;
    const test = { ...b, cells };
    if (validMoves(test, wrap).length >= 3) {
      b.cells = cells;
      return;
    }
  }
  // Last resort: reroll plain tiles.
  for (let attempt = 0; attempt < 300; attempt++) {
    const cells = b.cells.map((t) =>
      t.special || t.kind === 'prism' || t.pin ? t : { ...t, kind: randomFam(r) as TileKind },
    );
    if (hasMatch(cells, wrap)) continue;
    const test = { ...b, cells };
    if (validMoves(test, wrap).length >= 3) {
      b.cells = cells;
      return;
    }
  }
  const fresh = createBoard(r, wrap, 3, b.nextId);
  b.cells = fresh.cells;
  b.nextId = fresh.nextId;
}

export function neighbors(i: number): number[] {
  const r = rowOf(i);
  const c = colOf(i);
  const out: number[] = [];
  if (r > 0) out.push(idx(r - 1, c));
  if (r < H - 1) out.push(idx(r + 1, c));
  if (c > 0) out.push(idx(r, c - 1));
  if (c < W - 1) out.push(idx(r, c + 1));
  return out;
}

export function area(i: number, radius: number): number[] {
  const r0 = rowOf(i);
  const c0 = colOf(i);
  const out: number[] = [];
  for (let r = r0 - radius; r <= r0 + radius; r++)
    for (let c = c0 - radius; c <= c0 + radius; c++)
      if (r >= 0 && r < H && c >= 0 && c < W) out.push(idx(r, c));
  return out;
}

export function randomCells(r: Rng, cells: Tile[], count: number, filter: (t: Tile, i: number) => boolean) {
  const pool = cells.map((t, i) => (filter(t, i) ? i : -1)).filter((i) => i >= 0);
  shuffle(r, pool);
  return pool.slice(0, count);
}

export const pickInt = int;

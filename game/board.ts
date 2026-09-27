import {
  FAMS,
  H,
  QUEUE_LEN,
  W,
  type BagToken,
  type BoardState,
  type Dims,
  type Group,
  type Line,
  type LineShift,
  type Move,
  type Tile,
  type TileKind,
} from './types.ts';
import { int, pick, shuffle, type Rng } from './rng.ts';

/** The usual board: 6×6. */
export const BASE_DIMS: Dims = { w: W, h: H };
/** Smallest and largest boards items and enemies may make. */
export const MIN_SIDE = 5;
export const MAX_SIDE = 8;

export const idx = (d: Dims, r: number, c: number) => r * d.w + c;
export const rowOf = (d: Dims, i: number) => Math.floor(i / d.w);
export const colOf = (d: Dims, i: number) => i % d.w;
export const cellCount = (d: Dims) => d.w * d.h;
export const dimsOf = (b: Dims): Dims => ({ w: b.w, h: b.h });

/** Kind of tile a bag token turns into on the board: its colour, or junk for red tape. */
export function tokenKind(t: BagToken): TileKind {
  return t.kind;
}

export function tokenTile(b: { nextId: number }, t: BagToken): Tile {
  const tile: Tile = { id: b.nextId++, kind: t.kind };
  if (t.kind === 'junk') tile.tape = true;
  return tile;
}

/** Next token from the fight's bag; an empty bag is refilled from the colour weights and shuffled. */
export function drawToken(b: BoardState, r: Rng): BagToken {
  if (!b.bag.length) b.bag = shuffle(r, b.source.map((t) => ({ ...t })));
  return b.bag.pop() ?? { kind: 'blade' };
}

export function drawTile(b: BoardState, r: Rng): Tile {
  return tokenTile(b, drawToken(b, r));
}

export function makeTile(b: { nextId: number }, kind: TileKind, extra: Partial<Tile> = {}): Tile {
  return { id: b.nextId++, kind, ...extra };
}

export const cloneTile = (t: Tile): Tile => ({ ...t });
export const cloneCells = (cells: Tile[]) => cells.map(cloneTile);

export function cloneBoard(b: BoardState): BoardState {
  return {
    w: b.w,
    h: b.h,
    cells: cloneCells(b.cells),
    queue: b.queue.map((q) => q.map(cloneTile)),
    nextId: b.nextId,
    flood: b.flood,
    colLock: b.colLock.slice(),
    rowLock: b.rowLock.slice(),
    bag: b.bag.map((t) => ({ ...t })),
    source: b.source.map((t) => ({ ...t })),
  };
}

export const lineCells = (d: Dims, line: Line, index: number) =>
  line === 'row'
    ? Array.from({ length: d.w }, (_, c) => idx(d, index, c))
    : Array.from({ length: d.h }, (_, r) => idx(d, r, index));

/** Rows and columns an enemy may grab and drag (the crab): not flooded, not locked, no staples. */
export function lineFree(b: BoardState, line: Line, index: number): boolean {
  if (line === 'row') {
    if (index >= b.h - b.flood) return false;
    if (b.rowLock[index] > 0) return false;
  } else if (b.colLock[index] > 0) return false;
  return !lineCells(b, line, index).some((i) => b.cells[i]?.pin);
}

export function shiftCells(dims: Dims, cells: Tile[], m: LineShift): Tile[] {
  const out = cells.slice();
  const { w, h } = dims;
  if (m.line === 'row') {
    const d = ((m.delta % w) + w) % w;
    for (let c = 0; c < w; c++) out[idx(dims, m.index, (c + d) % w)] = cells[idx(dims, m.index, c)];
  } else {
    const d = ((m.delta % h) + h) % h;
    for (let r = 0; r < h; r++) out[idx(dims, (r + d) % h, m.index)] = cells[idx(dims, r, m.index)];
  }
  return out;
}

/** Rockets, bombs and prisms: swapping one sets it off even without a match. */
export const isSpecialTile = (t: Tile | undefined) => !!t && (!!t.special || t.kind === 'prism');

/**
 * Orthogonal neighbours; with `wrap` (the ring binder) the left and right edges touch too. The ring
 * joins rows only: rows and columns both joined made every line endless and every cascade run away.
 */
export function adjacent(d: Dims, a: number, b: number, wrap: boolean): boolean {
  const n = cellCount(d);
  if (a === b || a < 0 || b < 0 || a >= n || b >= n) return false;
  const ra = rowOf(d, a);
  const ca = colOf(d, a);
  const rb = rowOf(d, b);
  const cb = colOf(d, b);
  if (ra === rb) {
    const k = Math.abs(ca - cb);
    return k === 1 || (wrap && k === d.w - 1);
  }
  if (ca === cb) return Math.abs(ra - rb) === 1;
  return false;
}

/**
 * How tiles may move. The ring joins the edges of rows; items add slides and diagonals, an enemy
 * may allow only up-and-down moves.
 */
export interface MoveRules {
  wrap: boolean;
  /** A tile may be dragged along its row or column any distance: the tiles between shift by one. */
  slide?: boolean;
  /** Diagonal neighbours swap too. */
  diagonal?: boolean;
  /** Only up and down (sideways swaps and slides are closed). */
  vertical?: boolean;
  /** Staples, anchors and water do not hold tiles. */
  unpinned?: boolean;
}

export const PLAIN_RULES: MoveRules = { wrap: false };

/** A swap of two tiles, or a slide of one tile along its line; null when the rules do not allow it. */
export function moveKind(d: Dims, m: Move, rules: MoveRules): 'swap' | 'slide' | null {
  const n = cellCount(d);
  if (!Number.isInteger(m.from) || !Number.isInteger(m.to) || m.from === m.to || m.from < 0 || m.to < 0 || m.from >= n || m.to >= n) return null;
  const [ra, ca, rb, cb] = [rowOf(d, m.from), colOf(d, m.from), rowOf(d, m.to), colOf(d, m.to)];
  const sideways = ra === rb;
  if (rules.vertical && sideways) return null;
  if (adjacent(d, m.from, m.to, rules.wrap)) return 'swap';
  if (rules.diagonal && !rules.vertical && Math.abs(ra - rb) === 1 && Math.abs(ca - cb) === 1) return 'swap';
  if (rules.slide && (sideways || ca === cb)) return 'slide';
  return null;
}

/** Cells a move touches: both ends of a swap, the whole stretch of a slide. */
export function moveSpan(d: Dims, m: Move, kind: 'swap' | 'slide'): number[] {
  if (kind === 'swap') return [m.from, m.to];
  const step = rowOf(d, m.from) === rowOf(d, m.to) ? Math.sign(m.to - m.from) : Math.sign(m.to - m.from) * d.w;
  const out: number[] = [];
  for (let i = m.from; ; i += step) {
    out.push(i);
    if (i === m.to) break;
  }
  return out;
}

/** The board after a move: a swap exchanges two tiles; a slide carries one and shifts the rest back. */
export function applyMove(d: Dims, cells: Tile[], m: Move, kind: 'swap' | 'slide'): Tile[] {
  if (kind === 'swap') return swapCells(cells, m);
  const span = moveSpan(d, m, kind);
  const out = cells.slice();
  out[m.to] = cells[m.from];
  for (let k = 0; k < span.length - 1; k++) out[span[k]] = cells[span[k + 1]];
  return out;
}

/** Why this move cannot be made, or null when it is physically possible. */
export function moveBlock(b: BoardState, m: Move, rules: MoveRules): string | null {
  const kind = moveKind(b, m, rules);
  if (!kind) {
    if (rules.vertical && Number.isInteger(m.from) && Number.isInteger(m.to) && rowOf(b, m.from) === rowOf(b, m.to)) return 'Турникет: только вверх и вниз';
    return rules.slide ? 'Только по строке или столбцу' : 'Только с соседней фишкой';
  }
  if (rules.unpinned) return null;
  for (const i of moveSpan(b, m, kind)) {
    if (b.cells[i]?.pin) return 'Фишка прибита скобой';
    if (b.colLock[colOf(b, i)] > 0) return 'Столбец на якоре';
    if (b.rowLock[rowOf(b, i)] > 0) return 'Строка закреплена';
  }
  // Under water tiles do not move sideways (they still float up out of it).
  const low = b.h - b.flood;
  if (rowOf(b, m.from) !== rowOf(b, m.to) && colOf(b, m.from) !== colOf(b, m.to)) {
    if (rowOf(b, m.from) >= low || rowOf(b, m.to) >= low) return 'Под водой фишки не ходят вбок';
  } else if (rowOf(b, m.from) === rowOf(b, m.to) && rowOf(b, m.from) >= low) return 'Под водой фишки не ходят вбок';
  return null;
}

/** Old name: why this pair cannot be swapped under the plain rules (plus the ring). */
export function swapBlock(b: BoardState, m: Move, wrap: boolean): string | null {
  return moveBlock(b, m, { wrap });
}

export function swapCells(cells: Tile[], m: Move): Tile[] {
  const out = cells.slice();
  out[m.from] = cells[m.to];
  out[m.to] = cells[m.from];
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

/** Rows and columns of a board size, built once per size. */
const LINES = new Map<string, { rows: number[][]; cols: number[][] }>();
function linesOf(d: Dims) {
  const key = `${d.w}x${d.h}`;
  let l = LINES.get(key);
  if (!l) {
    l = {
      rows: Array.from({ length: d.h }, (_, r) => lineCells(d, 'row', r)),
      cols: Array.from({ length: d.w }, (_, c) => lineCells(d, 'col', c)),
    };
    LINES.set(key, l);
  }
  return l;
}

/**
 * All match groups on the board. Prisms are wild and may join several families.
 * `prefer` biases where a created special appears (the cells of the moved line).
 */
export function findGroups(d: Dims, cells: Tile[], wrap: boolean, prefer: readonly number[] = []): Group[] {
  const groups: Group[] = [];
  const { rows, cols } = linesOf(d);
  for (const fam of FAMS) {
    const ok = (i: number) => {
      const t = cells[i];
      return !!t && (t.kind === fam || t.kind === 'prism');
    };
    const real = (i: number) => cells[i]?.kind === fam;
    const runs: { cells: number[]; h: boolean }[] = [];
    for (const line of rows) for (const cs of runsInLine(line, ok, real, wrap)) runs.push({ cells: cs, h: true });
    for (const line of cols) for (const cs of runsInLine(line, ok, real, false)) runs.push({ cells: cs, h: false });
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
        // The special appears where the player dropped the tile (the first preferred cell).
        const preferred = prefer.filter((c) => candidates.includes(c));
        const pool = preferred.length ? preferred : candidates;
        at = preferred.length ? preferred[0] : pool[Math.floor((pool.length - 1) / 2)];
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

export function hasMatch(d: Dims, cells: Tile[], wrap: boolean): boolean {
  return anyMatch(d, cells, wrap);
}

/** Moves the rules allow on a board size (swaps once as from < to; slides both ways), built once. */
const MOVES = new Map<string, Move[]>();

export function allMoves(d: Dims, rules: MoveRules): readonly Move[] {
  const key = `${d.w}x${d.h}:${+rules.wrap}${+!!rules.slide}${+!!rules.diagonal}${+!!rules.vertical}`;
  let list = MOVES.get(key);
  if (!list) {
    list = [];
    for (let r = 0; r < d.h; r++)
      for (let c = 0; c < d.w; c++) {
        const from = idx(d, r, c);
        if (c + 1 < d.w) list.push({ from, to: idx(d, r, c + 1) });
        if (r + 1 < d.h) list.push({ from, to: idx(d, r + 1, c) });
        if (rules.diagonal && r + 1 < d.h) {
          if (c + 1 < d.w) list.push({ from, to: idx(d, r + 1, c + 1) });
          if (c > 0) list.push({ from, to: idx(d, r + 1, c - 1) });
        }
      }
    if (rules.wrap) for (let r = 0; r < d.h; r++) list.push({ from: idx(d, r, d.w - 1), to: idx(d, r, 0) });
    if (rules.slide)
      for (let a = 0; a < cellCount(d); a++)
        for (let b = 0; b < cellCount(d); b++) {
          const far = (rowOf(d, a) === rowOf(d, b) && Math.abs(colOf(d, a) - colOf(d, b)) >= 2) || (colOf(d, a) === colOf(d, b) && Math.abs(rowOf(d, a) - rowOf(d, b)) >= 2);
          if (far) list.push({ from: a, to: b });
        }
    list = list.filter((m) => moveKind(d, m, rules) !== null);
    MOVES.set(key, list);
  }
  return list;
}

/**
 * Is there a line of three or more of one family (prisms are wild)? Faster than findGroups. With
 * `changed`, only the rows and columns through those cells are looked at.
 */
function anyMatch(d: Dims, cells: Tile[], wrap: boolean, changed?: number[]): boolean {
  const { rows, cols } = linesOf(d);
  const rs = changed ? [...new Set(changed.map((i) => rowOf(d, i)))].map((r) => rows[r]) : rows;
  const cs = changed ? [...new Set(changed.map((i) => colOf(d, i)))].map((c) => cols[c]) : cols;
  for (const fam of FAMS) {
    const ok = (i: number) => {
      const t = cells[i];
      return !!t && (t.kind === fam || t.kind === 'prism');
    };
    const real = (i: number) => cells[i]?.kind === fam;
    for (const line of rs) if (runsInLine(line, ok, real, wrap).length) return true;
    for (const line of cs) if (runsInLine(line, ok, real, false).length) return true;
  }
  return false;
}

/**
 * A move is valid when it builds a match or sets off a special tile it carries. `settled` says the
 * board before the move has no line (the usual case): then only the lines the move touched can
 * hold one. An unsettled board (an enemy or an item made a line) lets every move through.
 */
function validMove(b: BoardState, m: Move, rules: MoveRules, settled: boolean): boolean {
  if (moveBlock(b, m, rules)) return false;
  const kind = moveKind(b, m, rules)!;
  if (isSpecialTile(b.cells[m.from]) || (kind === 'swap' && isSpecialTile(b.cells[m.to]))) return true;
  if (!settled) return true;
  const after = applyMove(b, b.cells, m, kind);
  const changed: number[] = [];
  for (let i = 0; i < after.length; i++) if (after[i] !== b.cells[i]) changed.push(i);
  return anyMatch(b, after, rules.wrap, changed);
}

export function isValidMove(b: BoardState, m: Move, rules: MoveRules): boolean {
  return validMove(b, m, rules, !anyMatch(b, b.cells, rules.wrap));
}

export function validMoves(b: BoardState, rules: MoveRules): Move[] {
  const settled = !anyMatch(b, b.cells, rules.wrap);
  return allMoves(b, rules).filter((m) => validMove(b, m, rules, settled));
}

/** Is there any valid move (stops at the first)? */
export function hasValidMove(b: BoardState, rules: MoveRules): boolean {
  const settled = !anyMatch(b, b.cells, rules.wrap);
  return allMoves(b, rules).some((m) => validMove(b, m, rules, settled));
}

/** Where a created special prefers to appear: the dropped tile first, then its partner. */
export const moveCells = (m: Move) => [m.to, m.from];

/**
 * Would `kind` at `i` complete a line of three with the tiles already dealt? Counts both ways along
 * the row and the column; with `wrap` (the ring relic) rows run on across the edge.
 */
function wouldMatchAt(d: Dims, cells: (Tile | undefined)[], i: number, kind: TileKind, wrap = false): boolean {
  if (kind === 'junk') return false;
  const r = rowOf(d, i);
  const c = colOf(d, i);
  const run = (len: number, pos: number, get: (k: number) => TileKind | undefined, wrap: boolean) => {
    let n = 1;
    for (let d = 1; d < len; d++) {
      let p = pos - d;
      if (p < 0) {
        if (!wrap) break;
        p += len;
      }
      if (get(p) !== kind) break;
      n++;
    }
    for (let d = 1; d < len; d++) {
      let p = pos + d;
      if (p >= len) {
        if (!wrap) break;
        p -= len;
      }
      if (get(p) !== kind) break;
      n++;
    }
    return n;
  };
  return run(d.w, c, (cc) => cells[idx(d, r, cc)]?.kind, wrap) >= 3 || run(d.h, r, (rr) => cells[idx(d, rr, c)]?.kind, false) >= 3;
}

/**
 * The token for cell `i` that does not complete a line: the bag's next one if it fits, else the
 * nearest fitting one further down the bag, else a copy of a fitting colour of the fight (a bag
 * heavy in one colour still starts without ready lines).
 */
function dealToken(b: BoardState, r: Rng, cells: Tile[], i: number, wrap: boolean): BagToken {
  const tok = drawToken(b, r);
  if (!wouldMatchAt(b, cells, i, tokenKind(tok), wrap)) return tok;
  for (let k = b.bag.length - 1; k >= 0; k--) {
    if (wouldMatchAt(b, cells, i, tokenKind(b.bag[k]), wrap)) continue;
    const [fit] = b.bag.splice(k, 1);
    b.bag.unshift(tok);
    return fit;
  }
  const spare = b.source.filter((t) => !wouldMatchAt(b, cells, i, tokenKind(t), wrap));
  if (!spare.length) return tok;
  b.bag.unshift(tok);
  return { ...pick(r, spare) };
}

/** How many cells stand in ready lines. */
function matchedCells(d: Dims, cells: Tile[], wrap: boolean): number {
  const seen = new Set<number>();
  for (const g of findGroups(d, cells, wrap)) for (const k of g.cells) seen.add(k);
  return seen.size;
}

export function fillQueue(b: BoardState, r: Rng) {
  for (let c = 0; c < b.w; c++) {
    while (b.queue[c].length < QUEUE_LEN) b.queue[c].push(drawTile(b, r));
  }
}

export function emptyBoard(source: BagToken[], firstId = 1, dims: Dims = BASE_DIMS): BoardState {
  return {
    w: dims.w,
    h: dims.h,
    cells: [],
    queue: Array.from({ length: dims.w }, () => []),
    nextId: firstId,
    flood: 0,
    colLock: Array(dims.w).fill(0),
    rowLock: Array(dims.h).fill(0),
    bag: [],
    source: source.map((t) => ({ ...t })),
  };
}

/**
 * Board for a fight, dealt from the deck's bag: no ready matches where the deck allows it,
 * and enough legal swaps. A one-family deck may leave matches in place — its payoff.
 */
export function createBoard(r: Rng, source: BagToken[], wrap = false, minMoves = 6, firstId = 1, dims: Dims = BASE_DIMS): BoardState {
  let best: { b: BoardState; score: number } | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const b = emptyBoard(source, firstId, dims);
    const cells: Tile[] = [];
    for (let i = 0; i < cellCount(dims); i++) cells.push(tokenTile(b, dealToken(b, r, cells, i, wrap)));
    b.cells = cells;
    const matched = matchedCells(b, cells, wrap);
    const moves = validMoves(b, { wrap }).length;
    if (!matched && moves >= minMoves) {
      fillQueue(b, r);
      return b;
    }
    // Keep the closest try: ready lines weigh far more than a lack of moves.
    const score = matched * 100 + Math.max(0, minMoves - moves);
    if (!best || score < best.score) best = { b, score };
  }
  fillQueue(best!.b, r);
  return best!.b;
}

/**
 * A bigger board mid-fight (a cramped enemy fell): tiles keep their column and their row counted
 * from the bottom, new rows come in on top and new columns on the right, dealt from the bag
 * without ready lines.
 */
export function growBoard(b: BoardState, dims: Dims, r: Rng, wrap: boolean) {
  const w = Math.max(dims.w, b.w);
  const h = Math.max(dims.h, b.h);
  if (w === b.w && h === b.h) return;
  const next: BoardState = { ...b, w, h };
  const dy = h - b.h;
  const cells: Tile[] = [];
  for (let row = 0; row < b.h; row++) for (let c = 0; c < b.w; c++) cells[idx(next, row + dy, c)] = b.cells[idx(b, row, c)];
  for (let i = 0; i < w * h; i++) if (!cells[i]) cells[i] = tokenTile(next, dealToken(next, r, cells, i, wrap));
  b.w = w;
  b.h = h;
  b.cells = cells;
  b.nextId = next.nextId;
  b.bag = next.bag;
  while (b.queue.length < w) b.queue.push([]);
  b.colLock = [...b.colLock, ...Array(w - b.colLock.length).fill(0)];
  b.rowLock = [...Array(h - b.rowLock.length).fill(0), ...b.rowLock];
  fillQueue(b, r);
}

/**
 * Compact every column downwards and refill from its queue.
 * Returns falls (moved tiles) and spawns (tiles entering from above, rank = order from the bottom).
 */
export function gravity(b: BoardState, r: Rng, cells: (Tile | null)[]) {
  const falls: { id: number; from: number; to: number }[] = [];
  const spawns: { id: number; to: number; rank: number }[] = [];
  for (let c = 0; c < b.w; c++) {
    const stack: { tile: Tile; from: number }[] = [];
    for (let row = b.h - 1; row >= 0; row--) {
      const t = cells[idx(b, row, c)];
      if (t) stack.push({ tile: t, from: row });
    }
    let row = b.h - 1;
    for (const { tile, from } of stack) {
      if (from !== row) falls.push({ id: tile.id, from: idx(b, from, c), to: idx(b, row, c) });
      cells[idx(b, row, c)] = tile;
      row--;
    }
    let rank = 0;
    while (row >= 0) {
      const tile = b.queue[c].shift() ?? drawTile(b, r);
      cells[idx(b, row, c)] = tile;
      spawns.push({ id: tile.id, to: idx(b, row, c), rank: rank++ });
      row--;
    }
  }
  b.cells = cells as Tile[];
  fillQueue(b, r);
  return { falls, spawns };
}

/** Free reshuffle when no legal move exists. Keeps specials, pins and fuses on their tiles. */
export function reshuffle(b: BoardState, r: Rng, rules: MoveRules) {
  const wrap = rules.wrap;
  for (let attempt = 0; attempt < 300; attempt++) {
    const cells = shuffle(r, b.cells.slice());
    if (hasMatch(b, cells, wrap)) continue;
    const test = { ...b, cells };
    if (validMoves(test, rules).length >= 3) {
      b.cells = cells;
      return;
    }
  }
  // Last resort: plain tiles go back and fresh ones are dealt from the bag.
  for (let attempt = 0; attempt < 60; attempt++) {
    const cells = b.cells.map((t) => (t.special || t.kind === 'prism' || t.pin || t.find ? t : drawTile(b, r)));
    const test = { ...b, cells };
    if (validMoves(test, rules).length >= 3) {
      b.cells = cells;
      return;
    }
  }
  const fresh = createBoard(r, b.source, wrap, 3, b.nextId, b);
  b.cells = fresh.cells;
  b.nextId = fresh.nextId;
}

export function neighbors(d: Dims, i: number): number[] {
  const r = rowOf(d, i);
  const c = colOf(d, i);
  const out: number[] = [];
  if (r > 0) out.push(idx(d, r - 1, c));
  if (r < d.h - 1) out.push(idx(d, r + 1, c));
  if (c > 0) out.push(idx(d, r, c - 1));
  if (c < d.w - 1) out.push(idx(d, r, c + 1));
  return out;
}

export function area(d: Dims, i: number, radius: number): number[] {
  const r0 = rowOf(d, i);
  const c0 = colOf(d, i);
  const out: number[] = [];
  for (let r = r0 - radius; r <= r0 + radius; r++)
    for (let c = c0 - radius; c <= c0 + radius; c++)
      if (r >= 0 && r < d.h && c >= 0 && c < d.w) out.push(idx(d, r, c));
  return out;
}

export function randomCells(r: Rng, cells: Tile[], count: number, filter: (t: Tile, i: number) => boolean) {
  const pool = cells.map((t, i) => (filter(t, i) ? i : -1)).filter((i) => i >= 0);
  shuffle(r, pool);
  return pool.slice(0, count);
}

export const pickInt = int;
export const FAMILIES = FAMS;

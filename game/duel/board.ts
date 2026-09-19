import { COLORS, KINDS, type Color, type Kind } from './catalog.ts';
export const SIZE = 8;
export type Tile = { kind: Kind; power?: 5 };
export type Match = {
  kind: Exclude<Kind, 'wild'>;
  cells: number[];
  longest: number;
};
export type Swap = { a: number; b: number };
export const isColor = (kind: Kind): kind is Color =>
  (COLORS as readonly string[]).includes(kind);
export const adjacent = (a: number, b: number) =>
  Number.isInteger(a) &&
  Number.isInteger(b) &&
  a >= 0 &&
  b >= 0 &&
  a < 64 &&
  b < 64 &&
  Math.abs((a % 8) - (b % 8)) +
    Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) ===
    1;
export function swapBoard(board: Tile[], { a, b }: Swap): Tile[] {
  const next = board.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
// Wildcards belong to mana lines only. Shared cells in L/T groups collect once.
export function findMatches(board: Tile[]): Match[] {
  const matches: Match[] = [];
  for (const kind of KINDS) {
    const lines: number[][] = [];
    for (const vertical of [false, true])
      for (let line = 0; line < 8; line++) {
        let run: number[] = [];
        const flush = () => {
          if (run.length >= 3 && run.some((i) => board[i].kind === kind))
            lines.push(run);
          run = [];
        };
        for (let pos = 0; pos <= 8; pos++) {
          const index = vertical ? pos * 8 + line : line * 8 + pos;
          const tile = pos < 8 ? board[index] : undefined;
          if (
            tile &&
            (tile.kind === kind || (tile.kind === 'wild' && isColor(kind)))
          )
            run.push(index);
          else flush();
        }
      }
    const groups: Match[] = [];
    for (const cells of lines) {
      const connected = groups.filter((g) =>
        g.cells.some((i) => cells.includes(i)),
      );
      const all = [
        ...new Set([...cells, ...connected.flatMap((g) => g.cells)]),
      ].sort((a, b) => a - b);
      for (const g of connected) groups.splice(groups.indexOf(g), 1);
      groups.push({
        kind,
        cells: all,
        longest: Math.max(cells.length, ...connected.map((g) => g.longest)),
      });
    }
    matches.push(...groups);
  }
  return matches;
}
function matchesThrough(board: Tile[], index: number): boolean {
  const tile = board[index];
  const kinds = tile.kind === 'wild' ? COLORS : [tile.kind];
  for (const kind of kinds)
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      let length = 1,
        real = tile.kind === kind;
      for (const direction of [-1, 1]) {
        let x = (index % 8) + dx * direction,
          y = Math.floor(index / 8) + dy * direction;
        while (x >= 0 && x < 8 && y >= 0 && y < 8) {
          const next = board[y * 8 + x];
          if (next.kind !== kind && !(next.kind === 'wild' && isColor(kind)))
            break;
          length++;
          real ||= next.kind === kind;
          x += dx * direction;
          y += dy * direction;
        }
      }
      if (length >= 3 && real) return true;
    }
  return false;
}
export function legalSwaps(board: Tile[]): Swap[] {
  const result: Swap[] = [];
  for (let a = 0; a < 64; a++)
    for (const b of [a % 8 < 7 ? a + 1 : -1, a + 8]) {
      if (
        !adjacent(a, b) ||
        (board[a].kind === board[b].kind && board[a].power === board[b].power)
      )
        continue;
      const swapped = swapBoard(board, { a, b });
      if (matchesThrough(swapped, a) || matchesThrough(swapped, b))
        result.push({ a, b });
    }
  return result;
}
export function randomTile(random: () => number, specials = true): Tile {
  const kind = KINDS[Math.floor(random() * KINDS.length)];
  return kind === 'skull' && specials && random() < 0.055
    ? { kind, power: 5 }
    : { kind };
}
export function freshBoard(random: () => number): Tile[] {
  for (let attempt = 0; attempt < 128; attempt++) {
    const board: Tile[] = [];
    for (let i = 0; i < 64; i++) {
      const choices = KINDS.filter(
        (kind) =>
          !(
            i % 8 >= 2 &&
            board[i - 1].kind === kind &&
            board[i - 2].kind === kind
          ) &&
          !(
            i >= 16 &&
            board[i - 8].kind === kind &&
            board[i - 16].kind === kind
          ),
      );
      board.push({ kind: choices[Math.floor(random() * choices.length)] });
    }
    if (legalSwaps(board).length) return board;
  }
  // Guaranteed playable fallback (also works with an adversarial RNG).
  const board: Tile[] = Array.from({ length: 64 }, (_, i) => ({
    kind: KINDS[((i % 8) + Math.floor(i / 8) * 2) % 7],
  }));
  board[0] = { kind: 'fire' };
  board[1] = { kind: 'fire' };
  board[2] = { kind: 'air' };
  board[10] = { kind: 'fire' };
  return board;
}
export function fall(
  board: Tile[],
  removed: Set<number>,
  random: () => number,
  protectedTiles: Map<number, Tile> = new Map(),
): Tile[] {
  const next: Tile[] = Array(64);
  for (let col = 0; col < 8; col++) {
    const kept: Tile[] = [];
    for (let row = 7; row >= 0; row--) {
      const i = row * 8 + col;
      if (protectedTiles.has(i)) kept.push(protectedTiles.get(i)!);
      else if (!removed.has(i)) kept.push(board[i]);
    }
    for (let row = 7; row >= 0; row--)
      next[row * 8 + col] = kept[7 - row] ?? randomTile(random);
  }
  return next;
}
export function blastCells(
  board: Tile[],
  initial: Iterable<number>,
): Set<number> {
  const removed = new Set(initial),
    queue = [...removed];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    if (board[i].kind !== 'skull' || !board[i].power) continue;
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const row = Math.floor(i / 8) + y,
          col = (i % 8) + x;
        if (row < 0 || row >= 8 || col < 0 || col >= 8) continue;
        const n = row * 8 + col;
        if (!removed.has(n)) {
          removed.add(n);
          queue.push(n);
        }
      }
  }
  return removed;
}

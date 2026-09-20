/** The Mirror experiment owns its geometry; legacy duel boards stay unchanged. */
export const WIDTH = 8;
export const HEIGHT = 7;
export const CHANNELS = ['strike', 'arcane', 'mend', 'rage'] as const;
export const KINDS = [...CHANNELS, 'super'] as const;
export type Channel = (typeof CHANNELS)[number];
export type Kind = (typeof KINDS)[number];
export const CHANNEL_NAMES: Record<Kind, string> = {
  strike: 'Удар',
  arcane: 'Магия',
  mend: 'Лечение',
  rage: 'Ярость',
  super: 'Суперприём',
};
export type Tile = {
  id: number;
  kind: Kind;
  level: 1 | 2 | 3;
  locked?: number;
  bomb?: number;
};
export type Swap = { a: number; b: number };
export type Match = {
  kind: Kind;
  cells: number[];
  longest: number;
  shape: 'three' | 'four' | 'cross' | 'five';
  casts: number;
  bonus: number;
  upgrade?: 2 | 3 | 'super';
};
const CELLS = WIDTH * HEIGHT;
const indexFrom = (random: () => number, length: number) =>
  Math.max(0, Math.min(length - 1, Math.floor(random() * length)));
export const isChannel = (kind: Kind): kind is Channel => kind !== 'super';
export const adjacent = (a: number, b: number): boolean =>
  Number.isInteger(a) &&
  Number.isInteger(b) &&
  a >= 0 &&
  b >= 0 &&
  a < CELLS &&
  b < CELLS &&
  Math.abs((a % WIDTH) - (b % WIDTH)) +
    Math.abs(Math.floor(a / WIDTH) - Math.floor(b / WIDTH)) ===
    1;

export function swapBoard(board: Tile[], { a, b }: Swap): Tile[] {
  const next = board.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/**
 * Intersecting lines form one command, with every physical cell paid once.
 * Our deliberate, deterministic simplification of complex figures is:
 * five > cross > four > three, then +0.5 for each cell beyond the five-cell
 * footprint of a cross/five. Parallel lines do not merge without an intersection.
 * Levels affect power, never matching; S matches S only and uses a separate cast.
 */
export function findMatches(board: Tile[]): Match[] {
  const matches: Match[] = [];
  for (const kind of KINDS) {
    type Group = { cells: number[]; longest: number; axes: Set<boolean> };
    const groups: Group[] = [];
    for (const vertical of [false, true]) {
      const lines = vertical ? WIDTH : HEIGHT;
      const length = vertical ? HEIGHT : WIDTH;
      for (let line = 0; line < lines; line++) {
        let run: number[] = [];
        const flush = () => {
          if (run.length >= 3) {
            const overlaps = groups.filter((g) =>
              g.cells.some((i) => run.includes(i)),
            );
            const cells = [
              ...new Set([...run, ...overlaps.flatMap((g) => g.cells)]),
            ].sort((a, b) => a - b);
            for (const g of overlaps) groups.splice(groups.indexOf(g), 1);
            groups.push({
              cells,
              longest: Math.max(run.length, ...overlaps.map((g) => g.longest)),
              axes: new Set([
                vertical,
                ...overlaps.flatMap((g) => [...g.axes]),
              ]),
            });
          }
          run = [];
        };
        for (let pos = 0; pos <= length; pos++) {
          const index = vertical ? pos * WIDTH + line : line * WIDTH + pos;
          if (pos < length && board[index]?.kind === kind) run.push(index);
          else flush();
        }
      }
    }
    for (const group of groups) {
      const shape =
        group.longest >= 5
          ? 'five'
          : group.axes.size > 1
            ? 'cross'
            : group.longest === 4
              ? 'four'
              : 'three';
      const casts =
        shape === 'five' ? 4 : shape === 'cross' ? 3 : shape === 'four' ? 2 : 1;
      const bonus =
        group.cells.reduce((sum, i) => sum + (board[i].level - 1) * 0.5, 0) +
        (shape === 'five' || shape === 'cross'
          ? Math.max(0, group.cells.length - 5) * 0.5
          : 0);
      const match: Match = {
        kind,
        cells: group.cells,
        longest: group.longest,
        shape,
        casts: kind === 'super' ? 1 : casts,
        bonus: kind === 'super' ? 0 : bonus,
      };
      if (kind !== 'super' && shape !== 'three')
        match.upgrade = shape === 'five' ? 'super' : shape === 'cross' ? 3 : 2;
      matches.push(match);
    }
  }
  return matches;
}

function matchesThrough(board: Tile[], index: number): boolean {
  const kind = board[index]?.kind;
  if (!kind) return false;
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    let length = 1;
    for (const direction of [-1, 1]) {
      let x = (index % WIDTH) + dx * direction;
      let y = Math.floor(index / WIDTH) + dy * direction;
      while (
        x >= 0 &&
        x < WIDTH &&
        y >= 0 &&
        y < HEIGHT &&
        board[y * WIDTH + x]?.kind === kind
      ) {
        length++;
        x += dx * direction;
        y += dy * direction;
      }
    }
    if (length >= 3) return true;
  }
  return false;
}

/** A legal swap must itself make a match; unrelated existing lines do not count. */
export function legalSwaps(board: Tile[]): Swap[] {
  const swaps: Swap[] = [];
  for (let a = 0; a < CELLS; a++) {
    if (!board[a] || (board[a].locked ?? 0) > 0) continue;
    for (const b of [a + 1, a + WIDTH]) {
      if (
        !adjacent(a, b) ||
        !board[b] ||
        (board[b].locked ?? 0) > 0 ||
        board[a].kind === board[b].kind
      )
        continue;
      const changed = swapBoard(board, { a, b });
      if (matchesThrough(changed, a) || matchesThrough(changed, b))
        swaps.push({ a, b });
    }
  }
  return swaps;
}

export function randomTile(random: () => number, nextId: () => number): Tile {
  return {
    id: nextId(),
    kind: CHANNELS[indexFrom(random, CHANNELS.length)],
    level: 1,
  };
}

/** Base tiles only, no immediate matches, and at least one legal swap. */
export function freshBoard(random: () => number, nextId: () => number): Tile[] {
  for (let attempt = 0; attempt < 32; attempt++) {
    const board: Tile[] = [];
    for (let i = 0; i < CELLS; i++) {
      const choices = CHANNELS.filter(
        (kind) =>
          !(
            i % WIDTH >= 2 &&
            board[i - 1].kind === kind &&
            board[i - 2].kind === kind
          ) &&
          !(
            i >= WIDTH * 2 &&
            board[i - WIDTH].kind === kind &&
            board[i - WIDTH * 2].kind === kind
          ),
      );
      board.push({
        id: nextId(),
        kind: choices[indexFrom(random, choices.length)],
        level: 1,
      });
    }
    if (legalSwaps(board).length) return board;
  }
  // A stable, playable layout even if a supplied deterministic RNG is constant.
  const board: Tile[] = Array.from({ length: CELLS }, (_, i) => ({
    id: nextId(),
    kind: CHANNELS[((i % WIDTH) + Math.floor(i / WIDTH) * 2) % CHANNELS.length],
    level: 1,
  }));
  board[0].kind = 'strike';
  board[1].kind = 'strike';
  board[2].kind = 'arcane';
  board[WIDTH + 2].kind = 'strike';
  return board;
}

/**
 * Gravity runs inside each column segment separated by a surviving locked tile.
 * Consuming a locked tile removes the anchor too. Protected upgrade replacements
 * survive removal, but fall normally unless the replacement itself is locked.
 */
export function fall(
  board: Tile[],
  removed: Set<number>,
  random: () => number,
  nextId: () => number,
  protectedTiles: Map<number, Tile> = new Map(),
): Tile[] {
  const next: Tile[] = Array(CELLS);
  for (let col = 0; col < WIDTH; col++) {
    let top = 0;
    const fillSegment = (bottom: number) => {
      const kept: Tile[] = [];
      for (let row = bottom; row >= top; row--) {
        const i = row * WIDTH + col;
        if (protectedTiles.has(i)) kept.push(protectedTiles.get(i)!);
        else if (!removed.has(i)) kept.push(board[i]);
      }
      for (let row = bottom; row >= top; row--)
        next[row * WIDTH + col] =
          kept[bottom - row] ?? randomTile(random, nextId);
    };
    for (let row = 0; row < HEIGHT; row++) {
      const i = row * WIDTH + col;
      const tile = protectedTiles.get(i) ?? board[i];
      if ((tile.locked ?? 0) <= 0 || (removed.has(i) && !protectedTiles.has(i)))
        continue;
      fillSegment(row - 1);
      next[i] = tile;
      top = row + 1;
    }
    fillSegment(HEIGHT - 1);
  }
  return next;
}

/**
 * Keep the exact tile inventory, upgrades, bombs and fixed locks. This function
 * never silently erases hazards to force a move. An impossible locked board is
 * returned unchanged so the engine can make its recovery rule explicit.
 */
export function reshuffle(board: Tile[], random: () => number): Tile[] {
  const positions = board.flatMap((tile, i) =>
    (tile.locked ?? 0) > 0 ? [] : [i],
  );
  const playable = (next: Tile[]) =>
    !findMatches(next).length &&
    (next.some((tile) => tile.kind === 'super' && (tile.locked ?? 0) <= 0) ||
      legalSwaps(next).length > 0);
  if (playable(board)) return board.slice();
  for (let attempt = 0; attempt < 128; attempt++) {
    const tiles = positions.map((i) => board[i]);
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = indexFrom(random, i + 1);
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    const next = board.slice();
    positions.forEach((i, n) => {
      next[i] = tiles[n];
    });
    if (playable(next)) return next;
  }
  // Bounded deterministic fallback for unlucky/constant random sources.
  for (let a = 0; a < positions.length; a++)
    for (let b = a + 1; b < positions.length; b++) {
      const next = swapBoard(board, { a: positions[a], b: positions[b] });
      if (playable(next)) return next;
    }
  return board.slice();
}

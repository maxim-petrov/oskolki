import type { Family, Tile } from './engine.ts';

export type MatchSource = 'shift' | 'edit' | 'skill';
export type MatchGroup = {
  family: Family;
  cells: number[];
  orientation: 'horizontal' | 'vertical' | 'cross';
  wrapped: boolean;
  wave: number;
  source: MatchSource;
};
export type MatchRules = { minimum: number; ring?: boolean };

/** Stable row/column order, including the original merge order for legacy replays. */
export function findMatchGroups(
  board: Tile[],
  rules: MatchRules = { minimum: 3 },
  wave = 0,
  source: MatchSource = 'shift',
): MatchGroup[] {
  const size = Math.sqrt(board.length);
  if (!Number.isInteger(size) || size < 1) return [];
  const runs: MatchGroup[] = [];
  for (const axis of ['row', 'col']) {
    for (let line = 0; line < size; line++) {
      const idx = (n: number) =>
        axis === 'row' ? line * size + n : n * size + line;
      const segments: number[][] = [];
      let start = 0;
      while (start < size) {
        let end = start + 1;
        while (
          end < size &&
          board[idx(end)].family === board[idx(start)].family
        )
          end++;
        segments.push(
          Array.from({ length: end - start }, (_, n) => idx(start + n)),
        );
        start = end;
      }
      let wrapped: number[] | undefined;
      if (
        rules.ring &&
        segments.length > 1 &&
        board[idx(0)].family === board[idx(size - 1)].family
      ) {
        wrapped = [...segments.pop()!, ...segments.shift()!];
        segments.push(wrapped);
      }
      for (const cells of segments)
        if (cells.length >= rules.minimum) {
          runs.push({
            family: board[cells[0]].family,
            cells,
            orientation: axis === 'row' ? 'horizontal' : 'vertical',
            wrapped: cells === wrapped,
            wave,
            source,
          });
        }
    }
  }
  const merged: MatchGroup[] = [];
  for (const run of runs) {
    const combined = new Set(run.cells);
    let orientation = run.orientation,
      wrapped = run.wrapped,
      touched = true;
    while (touched) {
      touched = false;
      for (let i = merged.length - 1; i >= 0; i--) {
        const group = merged[i];
        if (group.cells.some((cell) => combined.has(cell))) {
          group.cells.forEach((cell) => combined.add(cell));
          if (orientation !== group.orientation) orientation = 'cross';
          wrapped ||= group.wrapped;
          merged.splice(i, 1);
          touched = true;
        }
      }
    }
    merged.push({ ...run, cells: [...combined], orientation, wrapped });
  }
  return merged;
}

import { int, next, pick, weighted, type Rng } from './rng.ts';
import type { ActMap, MapNode, NodeKind } from './types.ts';

/**
 * An act's map, generated like Slay the Spire: six paths climb from the bottom row to the
 * top, each step moving to a neighbouring column without crossing another path; where
 * paths meet they merge. Node kinds follow placement rules, then the boss caps the map.
 */
export const MAP_ROWS = 10;
export const MAP_COLS = 7;
const PATHS = 6;

const WEIGHTS: [NodeKind, number][] = [
  ['fight', 46],
  ['event', 22],
  ['elite', 14],
  ['rest', 11],
  ['shop', 7],
];

export function generateActMap(r: Rng, looks: number): ActMap {
  const grid: (MapNode | null)[][] = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(null));
  const edges = new Set<string>();
  const nodes: MapNode[] = [];
  const at = (row: number, col: number) => {
    let n = grid[row][col];
    if (!n) {
      n = { id: nodes.length, row, col, kind: 'fight', next: [], visited: false, look: 0 };
      grid[row][col] = n;
      nodes.push(n);
    }
    return n;
  };
  const crosses = (row: number, c0: number, c1: number) => {
    // Moving diagonally from (row, c0) to (row+1, c1) crosses an edge (row, c1) → (row+1, c0).
    if (c0 === c1) return false;
    return edges.has(`${row}:${c1}>${c0}`);
  };
  let firstStart = -1;
  for (let p = 0; p < PATHS; p++) {
    let col = int(r, MAP_COLS);
    if (p === 1) while (col === firstStart) col = int(r, MAP_COLS);
    if (p === 0) firstStart = col;
    at(0, col);
    for (let row = 0; row < MAP_ROWS - 1; row++) {
      const options = [col - 1, col, col + 1].filter((c) => c >= 0 && c < MAP_COLS && !crosses(row, col, c));
      const nextCol = options.length ? pick(r, options) : col;
      const from = at(row, col);
      const to = at(row + 1, nextCol);
      edges.add(`${row}:${col}>${nextCol}`);
      if (!from.next.includes(to.id)) from.next.push(to.id);
      col = nextCol;
    }
  }
  // Kinds.
  const parents = new Map<number, MapNode[]>();
  for (const n of nodes) for (const id of n.next) parents.set(id, [...(parents.get(id) ?? []), n]);
  const sorted = [...nodes].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of sorted) {
    if (n.row === 0) n.kind = 'fight';
    else if (n.row === 5) n.kind = 'treasure';
    else if (n.row === MAP_ROWS - 1) n.kind = 'rest';
    else {
      const ps = parents.get(n.id) ?? [];
      const siblings = ps.flatMap((p) => p.next.map((id) => nodes[id])).filter((s) => s.id !== n.id && s.row === n.row);
      let kind: NodeKind = 'fight';
      for (let tries = 0; tries < 20; tries++) {
        kind = weighted(r, WEIGHTS);
        if (kind === 'elite' && n.row < 3) continue;
        if (kind === 'rest' && (n.row < 3 || n.row === MAP_ROWS - 2)) continue;
        if (kind === 'shop' && n.row < 2) continue;
        // No two elites, rests or shops in a row along a path.
        if ((kind === 'elite' || kind === 'rest' || kind === 'shop') && ps.some((p) => p.kind === kind)) continue;
        // Siblings (children of one parent) should differ where it matters.
        if ((kind === 'elite' || kind === 'rest' || kind === 'shop') && siblings.some((s) => s.kind === kind)) continue;
        break;
      }
      n.kind = kind;
    }
    n.look = int(r, Math.max(1, looks));
  }
  // Neighbouring nodes lean towards the same look so rooms flow into each other.
  for (const n of sorted) {
    const ps = parents.get(n.id) ?? [];
    if (ps.length && next(r) < 0.55) n.look = ps[0].look;
  }
  const boss: MapNode = { id: nodes.length, row: MAP_ROWS, col: Math.floor(MAP_COLS / 2), kind: 'boss', next: [], visited: false, look: 0 };
  nodes.push(boss);
  for (const n of nodes) if (n.row === MAP_ROWS - 1) n.next.push(boss.id);
  for (const n of nodes) n.next.sort((a, b) => nodes[a].col - nodes[b].col);
  return { nodes, rows: MAP_ROWS, cols: MAP_COLS, boss: boss.id };
}

/** Nodes the player may step onto from the current node (-1 = the bottom row). */
export function reachable(map: ActMap, node: number): number[] {
  if (node < 0) return map.nodes.filter((n) => n.row === 0).map((n) => n.id);
  return map.nodes[node]?.next ?? [];
}

/** Seeded randomness. The engine never calls Math.random. */
export interface Rng {
  s: number;
}

export function rng(seed: number): Rng {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

/** Mulberry32 step, [0, 1). */
export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function int(r: Rng, n: number): number {
  return Math.floor(next(r) * n);
}

export function range(r: Rng, lo: number, hi: number): number {
  return lo + int(r, hi - lo + 1);
}

export function chance(r: Rng, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[int(r, items.length)];
}

export function shuffle<T>(r: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function weighted<T>(r: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  let roll = next(r) * total;
  for (const [value, w] of entries) {
    roll -= Math.max(0, w);
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Independent stream derived from a seed and a label. */
export function derive(seed: number, label: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

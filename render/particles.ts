import { hex } from './palette.ts';
import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';

export type Layer = 'sky' | 'back' | 'mid' | 'front' | 'ui';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  drag: number;
  life: number;
  max: number;
  /** Colour ramp over lifetime (palette names). */
  ramp: string[];
  size: number;
  kind: 'dot' | 'streak' | 'smoke' | 'ring' | 'shard';
  layer: Layer;
  add: boolean;
  /** Streak length in px / smoke radius / ring radius. */
  len: number;
  grow: number;
  wobble: number;
  seed: number;
  alpha: number;
  floorY?: number;
  onFloor?: (p: Particle) => void;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Dithered soft disc, alpha stepped with a 4×4 Bayer matrix: smoke that stays pixel art. */
const discs = new Map<string, Canvas>();
export function ditherDisc(radius: number, color: string, density = 1): Canvas {
  const r = Math.max(1, Math.round(radius));
  const key = `${r}:${color}:${density}`;
  let c = discs.get(key);
  if (c) return c;
  const size = r * 2 + 1;
  c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  ctx.fillStyle = hex(color);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d > 1) continue;
      const a = (1 - d * d) * density;
      if (a * 16 > BAYER[y & 3][x & 3] + 0.5) ctx.fillRect(x, y, 1, 1);
    }
  discs.set(key, c);
  return c;
}

export class Particles {
  list: Particle[] = [];
  max = 1600;

  spawn(p: Partial<Particle> & { x: number; y: number }) {
    if (this.list.length >= this.max) this.list.shift();
    const q: Particle = {
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      drag: 0,
      life: 0,
      max: 1,
      ramp: ['white'],
      size: 1,
      kind: 'dot',
      layer: 'front',
      add: false,
      len: 3,
      grow: 0,
      wobble: 0,
      seed: Math.random() * 1000,
      alpha: 1,
      ...p,
    };
    this.list.push(q);
    return q;
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += (p.vx + (p.wobble ? Math.sin(p.life * 5 + p.seed) * p.wobble : 0)) * dt;
      p.y += p.vy * dt;
      p.len += p.grow * dt;
      if (p.floorY !== undefined && p.y >= p.floorY) {
        p.onFloor?.(p);
        continue;
      }
      keep.push(p);
    }
    this.list = keep;
  }

  draw(ctx: Ctx2D, layer: Layer, additive: boolean) {
    const prevOp = ctx.globalCompositeOperation;
    const prevA = ctx.globalAlpha;
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    for (const p of this.list) {
      if (p.layer !== layer || p.add !== additive) continue;
      const t = p.life / p.max;
      const color = hex(p.ramp[Math.min(p.ramp.length - 1, Math.floor(t * p.ramp.length))]);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      ctx.globalAlpha = prevA * p.alpha * (p.kind === 'smoke' ? Math.min(1, (1 - t) * 1.6) : 1);
      switch (p.kind) {
        case 'dot':
        case 'shard':
          ctx.fillStyle = color;
          ctx.fillRect(x, y, p.size, p.size);
          break;
        case 'streak': {
          ctx.fillStyle = color;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const dx = -p.vx / sp;
          const dy = -p.vy / sp;
          const n = Math.max(1, Math.round(p.len));
          for (let k = 0; k < n; k++) ctx.fillRect(Math.round(p.x + dx * k), Math.round(p.y + dy * k), p.size, p.size);
          break;
        }
        case 'smoke': {
          const disc = ditherDisc(p.len, p.ramp[Math.min(p.ramp.length - 1, Math.floor(t * p.ramp.length))], 0.9);
          ctx.drawImage(disc as CanvasImageSource, Math.round(p.x - disc.width / 2), Math.round(p.y - disc.height / 2));
          break;
        }
        case 'ring': {
          ctx.fillStyle = color;
          const r = Math.max(1, Math.round(p.len));
          const steps = Math.max(8, r * 6);
          for (let k = 0; k < steps; k++) {
            const a = (k / steps) * Math.PI * 2;
            ctx.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r * 0.45), 1, 1);
          }
          break;
        }
      }
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevA;
  }

  clear(layer?: Layer) {
    this.list = layer ? this.list.filter((p) => p.layer !== layer) : [];
  }
}

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export const pickOne = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Burst helper: debris / sparks / shards flying out of a point. */
export function burst(
  ps: Particles,
  x: number,
  y: number,
  n: number,
  opts: Partial<Particle> & { speed?: [number, number]; spread?: number; dir?: number },
) {
  const [lo, hi] = opts.speed ?? [30, 90];
  for (let i = 0; i < n; i++) {
    const a = (opts.dir ?? 0) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2);
    const s = rand(lo, hi);
    ps.spawn({
      ...opts,
      x: x + rand(-2, 2),
      y: y + rand(-2, 2),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      max: (opts.max ?? 0.5) * rand(0.7, 1.2),
    });
  }
}

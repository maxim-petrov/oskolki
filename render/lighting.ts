import { rgb } from './palette.ts';
import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';

export type Flicker = 'none' | 'fluor' | 'fire' | 'candle' | 'pulse' | 'lantern';

export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  intensity: number;
  flicker: Flicker;
  seed: number;
  /** Squash the pool vertically (floor pools, window spill). */
  squash?: number;
  /** Runtime state for fluorescent stutter. */
  state?: { until: number; next: number; on: boolean };
  current?: number;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const LEVELS = [0, 0.16, 0.32, 0.52, 0.76, 1];
const sprites = new Map<string, Canvas>();

/** Banded, dithered radial light: reads as pixel art instead of a smooth gradient. */
export function lightSprite(radius: number, color: string, squash = 1): Canvas {
  const r = Math.max(2, Math.round(radius));
  const key = `${r}:${color}:${squash}`;
  let c = sprites.get(key);
  if (c) return c;
  const w = r * 2 + 1;
  const h = Math.max(3, Math.round(r * 2 * squash) + 1);
  c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, h);
  const [cr, cg, cb] = rgb(color);
  const steps = LEVELS.length - 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - r) / r;
      const dy = (y - (h - 1) / 2) / ((h - 1) / 2 || 1);
      const d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      const v = Math.pow(1 - d, 1.35) * steps;
      const lo = Math.floor(v);
      const frac = v - lo;
      const level = frac * 16 > BAYER[y & 3][x & 3] + 0.5 ? lo + 1 : lo;
      const k = LEVELS[Math.min(steps, level)];
      const p = (y * w + x) * 4;
      img.data[p] = cr * k;
      img.data[p + 1] = cg * k;
      img.data[p + 2] = cb * k;
      img.data[p + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  sprites.set(key, c);
  return c;
}

function noise(t: number, seed: number) {
  return (
    Math.sin(t * 7.3 + seed) * 0.5 +
    Math.sin(t * 13.1 + seed * 1.7) * 0.3 +
    Math.sin(t * 23.7 + seed * 2.9) * 0.2
  );
}

export function flickerValue(l: Light, t: number): number {
  switch (l.flicker) {
    case 'fire':
      return 0.82 + noise(t, l.seed) * 0.16;
    case 'candle':
      return 0.8 + noise(t * 1.8, l.seed) * 0.2;
    case 'lantern':
      return 0.9 + noise(t * 0.6, l.seed) * 0.08;
    case 'pulse':
      return 0.85 + Math.sin(t * 2.2 + l.seed) * 0.15;
    case 'fluor': {
      const s = (l.state ??= { until: 0, next: t + 2 + (l.seed % 5), on: true });
      if (t >= s.next) {
        s.until = t + 0.08 + Math.random() * 0.45;
        s.next = s.until + 1.5 + Math.random() * 6;
      }
      if (t < s.until) return Math.random() < 0.5 ? 0.15 : 0.95;
      return 1;
    }
    default:
      return 1;
  }
}

export class Lighting {
  canvas: Canvas;
  ctx: Ctx2D;
  ambient = '#262b48';
  lights: Light[] = [];
  flash = 0;
  flashColor = '#dfe9ff';
  w: number;
  h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas);
  }

  compose(t: number, extra: Light[] = []) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.ambient;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of [...this.lights, ...extra]) {
      const k = Math.max(0, l.intensity * flickerValue(l, t));
      l.current = k;
      if (k <= 0.01) continue;
      const s = lightSprite(l.r, l.color, l.squash ?? 1);
      ctx.globalAlpha = Math.min(1, k);
      ctx.drawImage(s as CanvasImageSource, Math.round(l.x - s.width / 2), Math.round(l.y - s.height / 2));
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Multiply the scene by the light map, then add a gentle warm spill for glow. */
  apply(target: Ctx2D, bloom = 0.18) {
    target.globalCompositeOperation = 'multiply';
    target.drawImage(this.canvas as CanvasImageSource, 0, 0);
    if (bloom > 0) {
      target.globalCompositeOperation = 'lighter';
      target.globalAlpha = bloom;
      target.drawImage(this.canvas as CanvasImageSource, 0, 0);
      target.globalAlpha = 1;
    }
    target.globalCompositeOperation = 'source-over';
  }
}

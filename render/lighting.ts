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

/** Look of the light pools; tuned live in the light lab (F2) and kept in localStorage. */
export const LIGHT_STYLE = {
  /**
   * 0 — smooth pools; 1 — every lamp in its own steps (rings);
   * 2 — the summed light map in steps: organic zones instead of rings.
   */
  mode: 2,
  /** Brightness steps from the edge of a pool to its core (twice as many in the zone mode). */
  bands: 6,
  /** Width of the checker seam between steps, as a share of one step (0 = hard edges). */
  seam: 0.34,
  /** Falloff curve: higher = tighter hot core. */
  falloff: 1.15,
  /** Multiplier on every room's ambient colour. */
  ambient: 1.05,
  /** Additive glow of the light map on top of the scene. */
  bloom: 0.14,
  /** Dark frame around the screen. */
  vignette: 1,
  /** 1 — «Дворец слов»: flat rooms without a light map, bloom, glows or vignette; 0 — lit rooms. */
  flat: 1,
};

const sprites = new Map<string, Canvas>();

export function resetLightCache() {
  sprites.clear();
}

/**
 * Radial light as flat pixel-art steps. Each step boundary gets a thin 50% checker seam, so the
 * pool reads soft from afar but stays clean up close — no screen-wide dither noise.
 */
export function lightSprite(radius: number, color: string, squash = 1): Canvas {
  const r = Math.max(2, Math.round(radius));
  const st = LIGHT_STYLE;
  const stepped = st.mode === 1;
  const key = `${r}:${color}:${squash}:${stepped ? `${st.bands}:${st.seam}` : 'smooth'}:${st.falloff}`;
  let c = sprites.get(key);
  if (c) return c;
  const w = r * 2 + 1;
  const h = Math.max(3, Math.round(r * 2 * squash) + 1);
  c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, h);
  const [cr, cg, cb] = rgb(color);
  const steps = Math.max(1, st.bands);
  const half = st.seam / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - r) / r;
      const dy = (y - (h - 1) / 2) / ((h - 1) / 2 || 1);
      const d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      let k = Math.pow(1 - d, st.falloff);
      if (stepped) {
        const v = k * steps;
        let level = Math.floor(v);
        const frac = v - level;
        // Near a step edge, alternate pixels between the two steps (a checker seam).
        if (frac > 1 - half && ((x + y) & 1) === 0) level += 1;
        else if (frac < half && level > 0 && ((x + y) & 1) === 1) level -= 1;
        k = Math.min(steps, level) / steps;
      }
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
    // The stepped map is read back every frame, so keep this canvas on the CPU.
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D;
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Steps the summed light map: brightness snaps to bands, hue is kept, and each band edge
   * gets a one-pixel checker seam. Zones follow the combined light, so no target rings.
   */
  private posterize() {
    const st = LIGHT_STYLE;
    const levels = Math.max(2, Math.round(st.bands * 2));
    const half = st.seam / 2;
    const img = this.ctx.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    for (let y = 0, p = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++, p += 4) {
        const r = d[p];
        const g = d[p + 1];
        const b = d[p + 2];
        const l = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (l === 0) continue;
        // Nearest step, so the average brightness stays where the lamps put it; right at a
        // step edge the two steps alternate in a checker.
        const v = (l / 255) * levels;
        const lo = Math.floor(v);
        const frac = v - lo;
        const q = Math.abs(frac - 0.5) < half ? lo + (((x + y) & 1) === 0 ? 1 : 0) : frac >= 0.5 ? lo + 1 : lo;
        const k = Math.max(1, Math.min(levels, q)) / levels / (l / 255);
        d[p] = Math.min(255, r * k);
        d[p + 1] = Math.min(255, g * k);
        d[p + 2] = Math.min(255, b * k);
      }
    this.ctx.putImageData(img, 0, 0);
  }

  compose(t: number, extra: Light[] = []) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const [ar, ag, ab] = rgb(this.ambient);
    const m = LIGHT_STYLE.ambient;
    ctx.fillStyle = `rgb(${Math.min(255, ar * m)},${Math.min(255, ag * m)},${Math.min(255, ab * m)})`;
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
    if (LIGHT_STYLE.mode === 2) this.posterize();
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

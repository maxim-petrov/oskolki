import { hex } from './palette.ts';
import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';

/**
 * Screen-space pixel effects that depend on the canvas size: the vignette, the dithered
 * fade and the low-health edge. Each caches its pattern per size.
 */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const vignettes = new Map<string, Canvas>();

/** Vignette in flat dark steps with a checker seam only at each step. */
export function drawVignette(ctx: Ctx2D, x: number, y: number, w: number, h: number, strength = 1) {
  const key = `${w}x${h}`;
  let v = vignettes.get(key);
  if (!v) {
    v = makeCanvas(w, h);
    const c = ctx2d(v);
    const img = c.createImageData(w, h);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const dx = (px - w / 2) / (w / 2);
        const dy = (py - h / 2) / (h / 2);
        const d = Math.max(0, Math.hypot(dx * 0.9, dy) - 0.74) * 2.6;
        const v3 = d * 3;
        let level = Math.floor(v3);
        if (v3 - level > 0.85 && ((px + py) & 1) === 0) level += 1;
        if (level <= 0) continue;
        const p = (py * w + px) * 4;
        img.data[p] = 7;
        img.data[p + 1] = 7;
        img.data[p + 2] = 15;
        img.data[p + 3] = Math.min(3, level) * 55;
      }
    c.putImageData(img, 0, 0);
    vignettes.set(key, v);
  }
  ctx.globalAlpha = strength;
  ctx.drawImage(v as CanvasImageSource, x, y);
  ctx.globalAlpha = 1;
}

const fadePatterns = new Map<string, Canvas>();

/** Ordered-dither fade over a rectangle: covers `k` (0..1) in `color`. */
export function ditherFade(ctx: Ctx2D, k: number, w: number, h: number, color = 'ink0', x = 0, y = 0) {
  const level = Math.max(0, Math.min(16, Math.round(k * 16)));
  if (level === 0) return;
  if (level === 16) {
    ctx.fillStyle = hex(color);
    ctx.fillRect(x, y, w, h);
    return;
  }
  const key = `${level}:${color}`;
  let tile = fadePatterns.get(key);
  if (!tile) {
    tile = makeCanvas(4, 4);
    const t = ctx2d(tile);
    t.fillStyle = hex(color);
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) if (BAYER4[py][px] < level) t.fillRect(px, py, 1, 1);
    fadePatterns.set(key, tile);
  }
  const pattern = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
}

const dangers = new Map<string, Canvas>();

/** Red dithered edge pulse for low health. */
export function drawDanger(ctx: Ctx2D, k: number, w: number, h: number) {
  if (k <= 0) return;
  const key = `${w}x${h}`;
  let v = dangers.get(key);
  if (!v) {
    v = makeCanvas(w, h);
    const c = ctx2d(v);
    const img = c.createImageData(w, h);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const dx = Math.min(px, w - 1 - px) / 60;
        const dy = Math.min(py, h - 1 - py) / 44;
        const d = 1 - Math.min(1, Math.min(dx, dy));
        if (d * d * 16 > BAYER4[py & 3][px & 3] + 0.5) {
          const p = (py * w + px) * 4;
          img.data[p] = 168;
          img.data[p + 1] = 38;
          img.data[p + 2] = 58;
          img.data[p + 3] = 255;
        }
      }
    c.putImageData(img, 0, 0);
    dangers.set(key, v);
  }
  ctx.globalAlpha = Math.min(0.55, k);
  ctx.drawImage(v as CanvasImageSource, 0, 0);
  ctx.globalAlpha = 1;
}

/** Fills a rectangle with a flat colour (integer coordinates). */
export function rect(ctx: Ctx2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A one-pixel frame. */
export function frame(ctx: Ctx2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = hex(color);
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

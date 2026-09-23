import { hex, rgb } from './palette.ts';

/**
 * Pixel sprites authored as text: one character per pixel, mapped through `legend`
 * to palette names (or #rrggbb). '.' and ' ' are transparent.
 */
export interface SpriteDef {
  w: number;
  h: number;
  legend: Record<string, string>;
  frames: Record<string, string[]>;
  /** Anchor in sprite pixels (default: bottom centre). */
  ox?: number;
  oy?: number;
  /** Add a 1px outline in this colour around opaque pixels. */
  outline?: string;
}

export type Canvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Frame {
  canvas: Canvas;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: Canvas): Ctx2D {
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

const registry = new Map<string, Map<string, Frame>>();
const variants = new Map<string, Frame>();

function decode(def: SpriteDef, rows: string[], pad: number): Frame {
  const w = def.w + pad * 2;
  const h = def.h + pad * 2;
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(w, h);
  const colors = new Map<string, [number, number, number]>();
  for (const [ch, name] of Object.entries(def.legend)) if (name) colors.set(ch, rgb(hex(name)));
  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < def.h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < def.w; x++) {
      const ch = row[x];
      if (!ch || ch === '.' || ch === ' ') continue;
      const c = colors.get(ch);
      if (!c) continue;
      const p = ((y + pad) * w + (x + pad)) * 4;
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = 255;
      opaque[(y + pad) * w + (x + pad)] = 1;
    }
  }
  if (def.outline) {
    const oc = rgb(hex(def.outline));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (opaque[y * w + x]) continue;
        const near =
          (x > 0 && opaque[y * w + x - 1]) ||
          (x < w - 1 && opaque[y * w + x + 1]) ||
          (y > 0 && opaque[(y - 1) * w + x]) ||
          (y < h - 1 && opaque[(y + 1) * w + x]);
        if (!near) continue;
        const p = (y * w + x) * 4;
        img.data[p] = oc[0];
        img.data[p + 1] = oc[1];
        img.data[p + 2] = oc[2];
        img.data[p + 3] = 255;
      }
  }
  ctx.putImageData(img, 0, 0);
  return {
    canvas,
    w,
    h,
    ox: (def.ox ?? Math.floor(def.w / 2)) + pad,
    oy: (def.oy ?? def.h - 1) + pad,
  };
}

export function registerSprites(defs: Record<string, SpriteDef>) {
  for (const [id, def] of Object.entries(defs)) {
    const frames = new Map<string, Frame>();
    const pad = def.outline ? 1 : 0;
    for (const [name, rows] of Object.entries(def.frames)) frames.set(name, decode(def, rows, pad));
    registry.set(id, frames);
  }
}

export function registerFrame(id: string, frame: string, f: Frame) {
  if (!registry.has(id)) registry.set(id, new Map());
  registry.get(id)!.set(frame, f);
}

export function hasSprite(id: string) {
  return registry.has(id);
}

export function frameNames(id: string): string[] {
  return [...(registry.get(id)?.keys() ?? [])];
}

const placeholders = new Map<string, Frame>();
function placeholder(id: string): Frame {
  let f = placeholders.get(id);
  if (f) return f;
  const canvas = makeCanvas(16, 16);
  const ctx = ctx2d(canvas);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  ctx.fillStyle = `hsl(${h % 360},55%,45%)`;
  ctx.fillRect(1, 1, 14, 14);
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  f = { canvas, w: 16, h: 16, ox: 8, oy: 15 };
  placeholders.set(id, f);
  return f;
}

export function getFrame(id: string, frame = 'idle0'): Frame {
  const frames = registry.get(id);
  if (!frames) return placeholder(id);
  return frames.get(frame) ?? frames.get('idle0') ?? frames.values().next().value ?? placeholder(id);
}

/** Recoloured copy (white hit-flash silhouette, red telegraph, etc.). Cached. */
export function silhouette(f: Frame, color: string): Frame {
  const key = `${(f.canvas as { __id?: number }).__id ?? tag(f)}:${color}`;
  let v = variants.get(key);
  if (v) return v;
  const canvas = makeCanvas(f.w, f.h);
  const ctx = ctx2d(canvas);
  ctx.drawImage(f.canvas as CanvasImageSource, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, f.w, f.h);
  v = { ...f, canvas };
  variants.set(key, v);
  return v;
}

let nextTag = 1;
function tag(f: Frame): number {
  const c = f.canvas as { __id?: number };
  if (!c.__id) c.__id = nextTag++;
  return c.__id;
}

/** 1px ring just outside the opaque pixels: a glow rim that leaves the sprite itself untouched. Cached. */
export function halo(f: Frame, color: string): Frame {
  const key = `${tag(f)}:halo:${color}`;
  let v = variants.get(key);
  if (v) return v;
  const w = f.w + 2;
  const h = f.h + 2;
  const src = ctx2d(makeCanvas(w, h));
  src.drawImage(f.canvas as CanvasImageSource, 1, 1);
  const a = src.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = hex(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) ctx.fillRect(x, y, 1, 1);
    }
  }
  v = { canvas, w, h, ox: f.ox + 1, oy: f.oy + 1 };
  variants.set(key, v);
  return v;
}

export function flipped(f: Frame): Frame {
  const key = `${tag(f)}:flip`;
  let v = variants.get(key);
  if (v) return v;
  const canvas = makeCanvas(f.w, f.h);
  const ctx = ctx2d(canvas);
  ctx.translate(f.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(f.canvas as CanvasImageSource, 0, 0);
  v = { ...f, canvas, ox: f.w - 1 - f.ox };
  variants.set(key, v);
  return v;
}

/** Draw a frame with its anchor at (x, y). Integer positions only. */
export function draw(ctx: Ctx2D, f: Frame, x: number, y: number, alpha = 1) {
  if (alpha <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(f.canvas as CanvasImageSource, Math.round(x - f.ox), Math.round(y - f.oy));
  ctx.globalAlpha = prev;
}

/** Draw at integer scale (2x icons, 4x title art). */
export function drawScaled(ctx: Ctx2D, f: Frame, x: number, y: number, scale: number, alpha = 1) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(
    f.canvas as CanvasImageSource,
    Math.round(x - f.ox * scale),
    Math.round(y - f.oy * scale),
    f.w * scale,
    f.h * scale,
  );
  ctx.globalAlpha = prev;
}

import { BIG_FONT } from './art/font-big.ts';
import { hex, rgb } from './palette.ts';
import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';

/**
 * Tiny5 rendered at 8px lands exactly on the pixel grid (1 font unit = 128/1024 em).
 * Glyphs are rasterised once, thresholded to 1-bit and cached per colour, so text is
 * as crisp as the sprites at any integer scale.
 */
const SIZE = 8;
const ASCENT = 7;
export const LINE = 9;

let loaded = false;
const masks = new Map<string, { canvas: Canvas; adv: number }>();
const tinted = new Map<string, Canvas>();

export async function loadFont(url = '/fonts/tiny5-regular.ttf') {
  if (loaded) return;
  const face = new FontFace('Tiny5', `url(${url})`);
  await face.load();
  (document.fonts as unknown as { add(f: FontFace): void }).add(face);
  loaded = true;
}

function mask(ch: string) {
  let m = masks.get(ch);
  if (m) return m;
  const probe = ctx2d(makeCanvas(4, 4));
  probe.font = `${SIZE}px Tiny5`;
  const adv = Math.max(1, Math.round(probe.measureText(ch).width));
  const w = adv + 2;
  const h = LINE + 3;
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.font = `${SIZE}px Tiny5`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, 0, ASCENT);
  const img = ctx.getImageData(0, 0, w, h);
  for (let p = 0; p < img.data.length; p += 4) {
    const on = img.data[p + 3] >= 110;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
    img.data[p + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  m = { canvas, adv };
  masks.set(ch, m);
  return m;
}

function glyph(ch: string, color: string): Canvas {
  const key = ch + '\u0000' + color;
  let c = tinted.get(key);
  if (c) return c;
  const m = mask(ch);
  c = makeCanvas(m.canvas.width, m.canvas.height);
  const ctx = ctx2d(c);
  ctx.drawImage(m.canvas as CanvasImageSource, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, c.width, c.height);
  tinted.set(key, c);
  return c;
}

export function measure(text: string, scale = 1): number {
  let w = 0;
  for (const ch of text) w += mask(ch).adv;
  return w * scale;
}

export interface TextOpts {
  scale?: number;
  align?: 'left' | 'center' | 'right';
  shadow?: string;
  outline?: string;
  /** Per-letter wave: time in seconds. */
  wave?: number;
  alpha?: number;
}

// ── Display font: native bold caps for headings and big numbers (never a scaled Tiny5) ──

/** Fill ramp (top rows, middle, bottom) and drop shadow per base colour. */
function bigRamp(color: string): [string, string, string, string] {
  if (color.startsWith('gold') || color.startsWith('orange')) return ['gold4', 'gold3', 'orange3', 'red1'];
  if (color.startsWith('red')) return ['red5', 'red4', 'red2', 'red0'];
  if (color.startsWith('vio')) return ['vio5', 'vio4', 'vio3', 'vio1'];
  if (color.startsWith('cold')) return ['cold6', 'cold5', 'cold4', 'cold1'];
  if (color.startsWith('teal')) return ['teal5', 'teal4', 'teal3', 'teal1'];
  if (color.startsWith('green')) return ['green4', 'green3', 'green2', 'green0'];
  if (color === 'cream' || color === 'white' || color.startsWith('paper')) return ['white', 'cream', 'paper2', 'ink2'];
  return [color, color, color, 'ink0'];
}

const bigCache = new Map<string, Canvas>();

/** One glyph with its outline and shadow baked in; 2 px margin around the glyph box. */
function bigGlyph(ch: string, color: string, outline: string): Canvas | null {
  const rows = BIG_FONT.glyphs[ch];
  if (!rows) return null;
  const key = `${ch}|${color}|${outline}`;
  let c = bigCache.get(key);
  if (c) return c;
  const [light, mid, dark, shadow] = bigRamp(color);
  const gw = rows[0].length;
  const gh = BIG_FONT.height;
  const w = gw + 4;
  const h = gh + 4;
  c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, h);
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && rows[y][x] === '#';
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ink(x + dx, y + dy)) return true;
    return false;
  };
  const put = (x: number, y: number, name: string) => {
    const [r, g, b] = rgb(hex(name));
    const p = ((y + 1) * w + (x + 1)) * 4;
    img.data[p] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = 255;
  };
  // Shadow of the outlined shape, one pixel down-right; then the outline; then the fill.
  for (let y = -1; y <= gh; y++) for (let x = -1; x <= gw; x++) if (near(x - 1, y - 1)) put(x, y, shadow);
  for (let y = -1; y <= gh; y++) for (let x = -1; x <= gw; x++) if (!ink(x, y) && near(x, y)) put(x, y, outline);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (ink(x, y)) put(x, y, y < 4 ? light : y < 7 ? mid : dark);
  ctx.putImageData(img, 0, 0);
  bigCache.set(key, c);
  return c;
}

export function measureBig(str: string): number {
  let w = 0;
  let n = 0;
  for (const ch of str.toUpperCase()) {
    const rows = BIG_FONT.glyphs[ch];
    w += (rows ? rows[0].length : BIG_FONT.space) + BIG_FONT.spacing;
    n++;
  }
  return n ? w - BIG_FONT.spacing : 0;
}

/** Big caps; (x, y) is the top of the caps (or centre/right with align). Returns the width. */
export function bigText(ctx: Ctx2D, str: string, x: number, y: number, color = 'gold4', opts: TextOpts = {}) {
  const up = str.toUpperCase();
  const w = measureBig(up);
  let cx = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
  const cy = Math.round(y);
  const prev = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
  let i = 0;
  for (const ch of up) {
    const rows = BIG_FONT.glyphs[ch];
    const g = rows ? bigGlyph(ch, color, opts.outline ?? 'ink0') : null;
    const dy = opts.wave !== undefined ? Math.round(Math.sin(opts.wave * 8 + i * 0.7)) : 0;
    if (g) ctx.drawImage(g as CanvasImageSource, cx - 2, cy - 2 + dy);
    cx += (rows ? rows[0].length : BIG_FONT.space) + BIG_FONT.spacing;
    i++;
  }
  ctx.globalAlpha = prev;
  return w;
}

/** Draw a single line; (x, y) is the top-left of the line box (or centre/right with align). */
export function text(ctx: Ctx2D, str: string, x: number, y: number, color = 'white', opts: TextOpts = {}) {
  const s = opts.scale ?? 1;
  // Bigger text uses the native display font instead of fat Tiny5 pixels.
  if (s >= 2) return bigText(ctx, str, x, y + 2 * s, color, { ...opts, scale: 1 });
  const w = measure(str, s);
  let cx = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
  const cy = Math.round(y);
  const prev = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
  let i = 0;
  for (const ch of str) {
    const m = mask(ch);
    const dy = opts.wave !== undefined ? Math.round(Math.sin(opts.wave * 8 + i * 0.7) * 1) * s : 0;
    const gw = m.canvas.width * s;
    const gh = m.canvas.height * s;
    if (ch !== ' ') {
      if (opts.outline) {
        const o = glyph(ch, opts.outline);
        for (const [ox, oy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          ctx.drawImage(o as CanvasImageSource, cx + ox, cy + dy + oy, gw, gh);
      }
      if (opts.shadow) ctx.drawImage(glyph(ch, opts.shadow) as CanvasImageSource, cx + Math.max(1, s >> 1), cy + dy + Math.max(1, s >> 1), gw, gh);
      ctx.drawImage(glyph(ch, color) as CanvasImageSource, cx, cy + dy, gw, gh);
    }
    cx += m.adv * s;
    i++;
  }
  ctx.globalAlpha = prev;
  return w;
}

/** Greedy word wrap for a pixel width. */
export function wrap(str: string, maxWidth: number, scale = 1): string[] {
  const lines: string[] = [];
  for (const para of str.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (measure(test, scale) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export function paragraph(
  ctx: Ctx2D,
  str: string,
  x: number,
  y: number,
  maxWidth: number,
  color = 'white',
  opts: TextOpts & { lineGap?: number } = {},
) {
  const s = opts.scale ?? 1;
  const lines = wrap(str, maxWidth, s);
  lines.forEach((line, k) => text(ctx, line, x, y + k * (LINE + (opts.lineGap ?? 1)) * s, color, opts));
  return lines.length * (LINE + (opts.lineGap ?? 1)) * s;
}

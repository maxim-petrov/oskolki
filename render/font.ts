import { hex } from './palette.ts';
import { ctx2d, makeCanvas, type Ctx2D } from './sprite.ts';

/**
 * «Дворец слов» type: a readable serif (Georgia / Times), drawn by the browser at screen
 * resolution — the main canvas carries the pixel scale as its transform, so sprites stay crisp
 * while letters stay smooth, like the paper interface of the old branch. Positions and widths
 * are in internal pixels. Text on paper is dark ink; light text with an outline is for words
 * over the stage.
 */
export const SERIF = 'Georgia, "Times New Roman", Times, "Noto Serif", serif';
/** Body text size in internal pixels and its baseline inside the line box. */
const SIZE = 8;
const ASCENT = 7;
export const LINE = 9;
/** Display text: bold serif, caps about 11 px. */
const BIG_SIZE = 15;
const BIG_ASCENT = 11;

/** Kept for the app's start-up sequence; the serif is a system font. */
export async function loadFont() {}

let probe: Ctx2D | null = null;
const widths = new Map<string, number>();
function measureRaw(str: string, font: string): number {
  if (!probe) probe = ctx2d(makeCanvas(4, 4));
  const key = font + '\u0000' + str;
  let w = widths.get(key);
  if (w === undefined) {
    probe.font = font;
    w = probe.measureText(str).width;
    if (widths.size > 6000) widths.clear();
    widths.set(key, w);
  }
  return w;
}

const bodyFont = (s = 1, bold = false) => `${bold ? 'bold ' : ''}${SIZE * s}px ${SERIF}`;
const bigFont = () => `bold ${BIG_SIZE}px ${SERIF}`;

/** Light colours meant for dark panels, turned into ink for paper (words with an outline keep theirs). */
const ON_PAPER: Record<string, string> = {
  white: 'ink0',
  cream: 'ink0',
  paper: 'ink0',
  paper2: 'ink0',
  grey4: 'ink1',
  grey3: 'grey1',
  grey2: 'grey1',
  cold6: 'ink0',
  cold5: 'ink1',
  cold4: 'grey1',
  cold3: 'grey1',
  cold2: 'cold2',
  gold4: 'gold1',
  gold3: 'gold1',
  gold2: 'gold1',
  orange4: 'orange1',
  orange3: 'orange1',
  red5: 'red2',
  red4: 'red2',
  red3: 'red2',
  vio5: 'vio3',
  vio4: 'vio3',
  teal5: 'teal2',
  teal4: 'teal2',
  teal3: 'teal2',
  green4: 'green2',
  green3: 'green2',
};
export function inkOnPaper(color: string): string {
  return ON_PAPER[color] ?? color;
}

export function measure(text: string, scale = 1, bold = false): number {
  return Math.ceil(measureRaw(text, bodyFont(scale, bold)));
}

export interface TextOpts {
  scale?: number;
  align?: 'left' | 'center' | 'right';
  shadow?: string;
  outline?: string;
  /** Per-letter wave: time in seconds. */
  wave?: number;
  alpha?: number;
  /** Exact colour (no light-to-ink swap): light letters on a dark button. */
  raw?: boolean;
  bold?: boolean;
}

function paint(ctx: Ctx2D, str: string, x: number, baseline: number, font: string, color: string, opts: TextOpts) {
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const fill = opts.outline || opts.raw ? hex(color) : hex(inkOnPaper(color));
  const draw = (s: string, cx: number, cy: number) => {
    if (opts.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = hex(opts.outline);
      ctx.strokeText(s, cx, cy);
    }
    ctx.fillStyle = fill;
    ctx.fillText(s, cx, cy);
  };
  if (opts.wave === undefined) draw(str, x, baseline);
  else {
    let cx = x;
    let i = 0;
    for (const ch of str) {
      draw(ch, cx, baseline + Math.round(Math.sin(opts.wave * 8 + i * 0.7)));
      cx += measureRaw(ch, font);
      i++;
    }
  }
}

export function measureBig(str: string): number {
  return Math.ceil(measureRaw(str.toUpperCase(), bigFont()));
}

/** Big bold caps; (x, y) is the top of the caps (or centre/right with align). Returns the width. */
export function bigText(ctx: Ctx2D, str: string, x: number, y: number, color = 'gold4', opts: TextOpts = {}) {
  const up = str.toUpperCase();
  const w = measureBig(up);
  const cx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  const prev = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
  paint(ctx, up, Math.round(cx), Math.round(y) + BIG_ASCENT, bigFont(), color, opts);
  ctx.globalAlpha = prev;
  return w;
}

/** A display line in bold serif at any size (mixed case), like the old branch's page titles. */
export function display(ctx: Ctx2D, str: string, x: number, y: number, size: number, color = 'ink0', opts: TextOpts = {}) {
  const font = `bold ${size}px ${SERIF}`;
  const w = Math.ceil(measureRaw(str, font));
  const cx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  const prev = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
  paint(ctx, str, Math.round(cx), Math.round(y + size * 0.78), font, color, { ...opts, raw: opts.raw ?? true });
  ctx.globalAlpha = prev;
  return w;
}

/** Draw a single line; (x, y) is the top-left of the line box (or centre/right with align). */
export function text(ctx: Ctx2D, str: string, x: number, y: number, color = 'white', opts: TextOpts = {}) {
  const s = opts.scale ?? 1;
  if (s >= 2) return bigText(ctx, str, x, y + 2 * s, color, { ...opts, scale: 1 });
  const w = measure(str, s, opts.bold);
  const cx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  const prev = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
  paint(ctx, str, Math.round(cx), Math.round(y) + ASCENT * s, bodyFont(s, opts.bold), color, opts);
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

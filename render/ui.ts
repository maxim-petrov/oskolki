import { LINE, measure, paragraph, text, wrap } from './font.ts';
import { hex } from './palette.ts';
import type { Ctx2D } from './sprite.ts';

export interface Pointer {
  x: number;
  y: number;
  down: boolean;
  pressed: boolean;
  released: boolean;
  right: boolean;
  inside: boolean;
}

/** Paper tint for a panel: the dark fills of the night interface become «Дворец слов» paper. */
const PAPER_FILL: Record<string, string> = {
  ink0: 'paper',
  ink1: 'paper',
  ink2: 'rose',
  ink3: 'rose',
  red0: 'rose',
  red1: 'rose',
  red2: 'rose',
  vio0: 'vio5',
  vio1: 'vio5',
  vio2: 'vio5',
  cold0: 'cold5',
  cold1: 'cold5',
  cold2: 'cold5',
  teal0: 'cold5',
  teal1: 'cold5',
  teal2: 'cold5',
  green0: 'green4',
  green1: 'green4',
  green2: 'green4',
  gold1: 'tile',
  gold2: 'tile',
  wood1: 'tile',
  wood2: 'tile',
  grey0: 'paper2',
  grey1: 'paper2',
};
export function paperFill(name: string): string {
  return PAPER_FILL[name] ?? name;
}

/**
 * A sheet of paper: a hard offset shadow, a straight ink frame, a flat paper fill and a darker
 * band along the bottom edge (the old branch's `note-shadow`). `raw` keeps the fill as given.
 */
export function panel(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { border?: string; fill?: string; alpha?: number; glow?: string; raw?: boolean; shadow?: number } = {},
) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const sh = opts.shadow ?? 2;
  if (sh > 0) {
    ctx.fillStyle = hex('grey1');
    ctx.fillRect(x + sh, y + sh, w, h);
  }
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x, y, w, h);
  const fill = opts.raw ? (opts.fill ?? 'paper') : paperFill(opts.fill ?? 'ink1');
  ctx.fillStyle = hex(fill);
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (h > 8) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.globalAlpha = 1;
  }
}

export class UI {
  p: Pointer = { x: -1, y: -1, down: false, pressed: false, released: false, right: false, inside: false };
  tip: { title?: string; text: string; x: number; y: number; accent?: string } | null = null;
  hovered: string | null = null;
  clickSound: (() => void) | null = null;
  private pressedOn: string | null = null;

  begin(p: Pointer) {
    this.p = p;
    this.tip = null;
    this.hovered = null;
    if (p.pressed) this.pressedOn = null;
  }

  over(x: number, y: number, w: number, h: number) {
    return this.p.inside && this.p.x >= x && this.p.x < x + w && this.p.y >= y && this.p.y < y + h;
  }

  /** Returns true on click (press and release inside). */
  area(id: string, x: number, y: number, w: number, h: number): boolean {
    const hot = this.over(x, y, w, h);
    if (hot) this.hovered = id;
    if (hot && this.p.pressed) this.pressedOn = id;
    if (this.p.released && this.pressedOn === id) {
      this.pressedOn = null;
      if (hot) {
        this.clickSound?.();
        return true;
      }
    }
    return false;
  }

  button(
    ctx: Ctx2D,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    opts: { accent?: string; disabled?: boolean; small?: boolean } = {},
  ): boolean {
    const clicked = !opts.disabled && this.area(id, x, y, w, h);
    const hot = !opts.disabled && this.hovered === id;
    const down = hot && this.p.down;
    const o = down ? 1 : 0;
    // The old branch's buttons: a dark primary, grey paper for the rest, dusty pink under the pointer.
    const primary = opts.accent === 'gold3';
    const fill = opts.disabled
      ? 'grey4'
      : primary
        ? hot
          ? 'ink3'
          : 'ink2'
        : hot
          ? 'rose'
          : opts.accent === 'red3'
            ? 'rose2'
            : opts.accent === 'green3'
              ? 'green4'
              : 'paper2';
    panel(ctx, x + o, y + o, w, h, { fill, raw: true, shadow: opts.disabled || down ? 0 : 1 });
    const color = opts.disabled ? 'grey2' : primary ? 'cream' : opts.accent === 'red3' ? 'red2' : 'ink0';
    text(ctx, label, x + o + w / 2, y + o + Math.floor((h - LINE) / 2) + 1, color, { align: 'center', raw: true });
    return clicked;
  }

  tooltip(title: string | undefined, body: string, x: number, y: number, accent?: string) {
    this.tip = { title, text: body, x, y, accent };
  }

  end(ctx: Ctx2D, vw: number, vh: number) {
    const t = this.tip;
    if (!t) return;
    const maxW = 170;
    const lines = wrap(t.text, maxW - 10);
    const titleW = t.title ? measure(t.title) : 0;
    const w = Math.min(maxW, Math.max(titleW, ...lines.map((l) => measure(l))) + 12);
    const h = lines.length * (LINE + 1) + (t.title ? LINE + 4 : 0) + 8;
    let x = Math.round(t.x + 10);
    let y = Math.round(t.y + 10);
    if (x + w > vw - 2) x = Math.round(t.x - w - 6);
    if (y + h > vh - 2) y = vh - h - 2;
    if (x < 2) x = 2;
    panel(ctx, x, y, w, h, { fill: 'rose', raw: true });
    let cy = y + 5;
    if (t.title) {
      text(ctx, t.title, x + 6, cy, 'ink0', { bold: true });
      cy += LINE + 4;
    }
    paragraph(ctx, t.text, x + 6, cy, maxW - 10, 'ink1');
  }
}

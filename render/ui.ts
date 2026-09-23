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

export function panel(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { border?: string; fill?: string; alpha?: number; glow?: string } = {},
) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.globalAlpha = opts.alpha ?? 0.94;
  ctx.fillStyle = hex(opts.fill ?? 'ink1');
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = hex(opts.border ?? 'cold2');
  ctx.fillRect(x + 2, y + 1, w - 4, 1);
  ctx.fillRect(x + 1, y + 2, 1, h - 4);
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x + 2, y + h - 2, w - 4, 1);
  ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
  if (opts.glow) {
    ctx.fillStyle = hex(opts.glow);
    ctx.fillRect(x + 3, y + 2, w - 6, 1);
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
    const oy = down ? 1 : 0;
    panel(ctx, x, y + oy, w, h, {
      border: opts.disabled ? 'grey1' : hot ? (opts.accent ?? 'gold3') : 'cold2',
      fill: hot ? 'ink2' : 'ink1',
      glow: hot ? (opts.accent ?? 'gold4') : undefined,
    });
    const color = opts.disabled ? 'grey2' : hot ? 'cream' : 'cold5';
    text(ctx, label, x + w / 2, y + oy + Math.floor((h - LINE) / 2) + 1, color, { align: 'center', shadow: 'ink0' });
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
    panel(ctx, x, y, w, h, { border: t.accent ?? 'gold2', fill: 'ink0', alpha: 0.96 });
    let cy = y + 5;
    if (t.title) {
      text(ctx, t.title, x + 6, cy, t.accent ?? 'gold4', { shadow: 'ink0' });
      cy += LINE + 4;
    }
    paragraph(ctx, t.text, x + 6, cy, maxW - 10, 'cold5');
  }
}

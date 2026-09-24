import type { Tally } from '../game/types.ts';
import { bigText, measureBig, text } from './font.ts';
import { hex } from './palette.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';
import { L } from './view.ts';

/**
 * The move's counter, Balatro-style: УРОН × МНОЖ. Every scored tile bumps a number; the
 * multiplier flares; at the end the product slams in as the strike. Display values chase the
 * engine's tally so the counting reads even when waves come fast.
 */
export class TallyView {
  dmg = 0;
  mult = 1;
  armor = 0;
  coins = 0;
  charge = 0;
  /** Bump timers per field (pop scale and colour). */
  bumpD = 0;
  bumpM = 0;
  bumpA = 0;
  /** Result of the strike: shown big for a moment. */
  result: { damage: number; armor: number; t: number; notes: string[] } | null = null;
  /** 0 = idle (last result fades), 1 = counting. */
  live = false;
  idleT = 0;
  shake = 0;

  reset() {
    this.dmg = 0;
    this.mult = 1;
    this.armor = 0;
    this.coins = 0;
    this.charge = 0;
    this.result = null;
    this.live = true;
    this.idleT = 0;
  }

  add(k: 'dmg' | 'mult' | 'armor' | 'coins' | 'charge', n: number) {
    if (!n) return;
    this[k] = Math.round((this[k] + n) * 10) / 10;
    if (k === 'dmg') this.bumpD = 1;
    if (k === 'mult') {
      this.bumpM = 1;
      this.shake = 0.3;
    }
    if (k === 'armor') this.bumpA = 1;
  }

  /** Snap to the engine's numbers after a wave. */
  sync(t: Tally) {
    this.dmg = t.dmg;
    this.mult = Math.round(t.mult * t.xmult * 10) / 10;
    this.armor = t.armor;
    this.coins = t.coins;
    this.charge = t.charge;
  }

  strike(damage: number, armor: number, notes: string[]) {
    this.result = { damage, armor, t: 0, notes };
    this.shake = 1;
  }

  end() {
    this.live = false;
    this.idleT = 0;
  }

  update(dt: number) {
    this.bumpD = Math.max(0, this.bumpD - dt * 6);
    this.bumpM = Math.max(0, this.bumpM - dt * 5);
    this.bumpA = Math.max(0, this.bumpA - dt * 6);
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.result) this.result.t += dt;
    if (!this.live) this.idleT += dt;
  }

  /** Fades out a while after the move; the box stays with its labels. */
  private alpha() {
    return this.live ? 1 : Math.max(0.25, 1 - Math.max(0, this.idleT - 1.4) * 1.5);
  }

  draw(ctx: Ctx2D, t: number) {
    const r = L.tally;
    if (L.mode === 'wide') this.drawWide(ctx, r.x, r.y, r.w, t);
    else this.drawStrip(ctx, r.x, r.y, r.w, r.h, t);
  }

  private num(v: number) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
  }

  private box(ctx: Ctx2D, x: number, y: number, w: number, h: number, fill: string, edge: string) {
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hex(fill);
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = hex(edge);
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
  }

  /** Wide screens: a panel left of the board with two big boxes and the result line. */
  private drawWide(ctx: Ctx2D, x: number, y: number, w: number, t: number) {
    const a = this.alpha();
    const sx = this.shake > 0 ? Math.round(Math.sin(t * 80) * this.shake * 2) : 0;
    ctx.globalAlpha = 1;
    // Panel.
    this.box(ctx, x, y, w, 60, 'ink1', 'ink2');
    text(ctx, 'ХОД', x + 5, y + 3, 'cold3');
    const bw = Math.floor((w - 26) / 2);
    const by = y + 14;
    // УРОН box (red).
    this.box(ctx, x + 4 + sx, by, bw, 26, this.bumpD > 0.5 ? 'red2' : 'red1', 'red3');
    text(ctx, 'УРОН', x + 7 + sx, by + 2, 'red5', { alpha: 0.8 });
    const dStr = this.num(this.dmg);
    ctx.globalAlpha = a;
    bigText(ctx, dStr, x + 4 + bw - 4 + sx, by + 12 - Math.round(this.bumpD * 2), 'cream', { align: 'right' });
    ctx.globalAlpha = 1;
    // ×
    text(ctx, '×', x + 4 + bw + 7, by + 9, 'gold4', { outline: 'ink0' });
    // МНОЖ box (violet).
    const mx = x + w - 4 - bw;
    this.box(ctx, mx - sx, by, bw, 26, this.bumpM > 0.5 ? 'vio3' : 'vio1', 'vio4');
    text(ctx, 'МНОЖ', mx + 3 - sx, by + 2, 'vio5', { alpha: 0.8 });
    ctx.globalAlpha = a;
    bigText(ctx, this.num(this.mult), mx + bw - 4 - sx, by + 12 - Math.round(this.bumpM * 3), this.mult >= 5 ? 'gold4' : 'cream', { align: 'right' });
    ctx.globalAlpha = 1;
    // Small resources of the move.
    let cx = x + 5;
    const cy = by + 30;
    const small = (icon: string, v: number, color: string) => {
      if (!v) return;
      draw(ctx, getFrame(icon), cx + 4, cy + 4);
      cx += 10;
      cx += text(ctx, `+${this.num(v)}`, cx, cy, color, { alpha: a }) + 6;
    };
    small('ui_armor', this.armor, 'cold5');
    small('ui_charge', this.charge, 'vio5');
    small('ui_coin', this.coins, 'gold4');
    // Result of the strike.
    const res = this.result;
    if (res) {
      const k = Math.min(1, res.t * 6);
      const ry = y + 62 + Math.round((1 - k) * -6);
      const str = `= ${res.damage}`;
      const ww = measureBig(str) + 10;
      ctx.globalAlpha = a;
      this.box(ctx, x + w - ww - 2, ry, ww, 16, 'red2', 'red4');
      bigText(ctx, str, x + w - 7, ry + 3, 'gold4', { align: 'right' });
      if (res.notes.length) text(ctx, res.notes.slice(0, 2).join(' · '), x + 4, ry + 4, 'gold4', { outline: 'ink0' });
      ctx.globalAlpha = 1;
    }
  }

  /** Tall screens: one strip between the stage and the board. */
  private drawStrip(ctx: Ctx2D, x: number, y: number, w: number, h: number, t: number) {
    const a = this.alpha();
    const sx = this.shake > 0 ? Math.round(Math.sin(t * 80) * this.shake * 2) : 0;
    this.box(ctx, x, y, w, h, 'ink1', 'ink2');
    const bw = Math.min(88, Math.floor((w - 70) / 2));
    const cx = Math.round(x + w / 2);
    // УРОН
    this.box(ctx, cx - 10 - bw + sx, y + 3, bw, h - 6, this.bumpD > 0.5 ? 'red2' : 'red1', 'red3');
    text(ctx, 'УРОН', cx - 7 - bw + sx, y + 5, 'red5', { alpha: 0.75 });
    ctx.globalAlpha = a;
    bigText(ctx, this.num(this.dmg), cx - 14 + sx, y + 8 - Math.round(this.bumpD * 2), 'cream', { align: 'right' });
    ctx.globalAlpha = 1;
    text(ctx, '×', cx - 3, y + 8, 'gold4', { outline: 'ink0' });
    // МНОЖ
    this.box(ctx, cx + 10 - sx, y + 3, bw, h - 6, this.bumpM > 0.5 ? 'vio3' : 'vio1', 'vio4');
    text(ctx, 'МНОЖ', cx + 13 - sx, y + 5, 'vio5', { alpha: 0.75 });
    ctx.globalAlpha = a;
    bigText(ctx, this.num(this.mult), cx + 6 + bw - sx, y + 8 - Math.round(this.bumpM * 3), this.mult >= 5 ? 'gold4' : 'cream', { align: 'right' });
    ctx.globalAlpha = 1;
    // Side notes: armor on the left, the result on the right.
    if (this.armor) {
      draw(ctx, getFrame('ui_armor'), x + 8, y + h / 2);
      text(ctx, `+${this.num(this.armor)}`, x + 14, y + h / 2 - 4, 'cold5', { alpha: a });
    }
    const res = this.result;
    if (res) text(ctx, `=${res.damage}`, x + w - 4, y + h / 2 - 4, 'gold4', { align: 'right', outline: 'ink0', alpha: a });
  }
}

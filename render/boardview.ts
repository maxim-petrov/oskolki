import { H, W, type Group, type Move, type Tile } from '../game/types.ts';
import { text } from './font.ts';
import { FAM_COLORS, hex } from './palette.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';
import { clamp, easeDrop, easeOut } from './tween.ts';

export const T = 26;
export const BX = 242;
export const BY = 102;
export const BW = W * T;
export const BH = H * T;

export interface VTile {
  tile: Tile;
  x: number;
  y: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  ease: (k: number) => number;
  scale: number;
  alpha: number;
  flash: number;
  pop: number;
  popping: boolean;
  born: number;
}

export interface Drag {
  line: 'row' | 'col' | null;
  index: number;
  sx: number;
  sy: number;
  offset: number;
  cell: number;
}

const CARD: Record<string, [string, string, string]> = {
  blade: ['red1', 'red2', 'red0'],
  shield: ['cold1', 'cold2', 'ink3'],
  ink: ['vio1', 'vio2', 'vio0'],
  coin: ['gold1', 'gold2', 'wood1'],
  prism: ['grey1', 'grey3', 'ink2'],
};

export class BoardView {
  tiles = new Map<number, VTile>();
  queue: Tile[][] = [];
  flood = 0;
  colLock: number[] = Array(W).fill(0);
  rowLock: number[] = Array(H).fill(0);
  drag: Drag | null = null;
  highlight: Group[] = [];
  previewText = '';
  shake = 0;
  cursor = -1;
  hover = -1;
  glintId = -1;
  glintT = 1;
  glintK = 1;
  aimCells: number[] = [];
  visible = 0;

  cellXY(i: number): [number, number] {
    return [(i % W) * T, Math.floor(i / W) * T];
  }

  center(i: number): [number, number] {
    const [x, y] = this.cellXY(i);
    return [BX + x + T / 2, BY + y + T / 2];
  }

  cellAt(px: number, py: number): number {
    const c = Math.floor((px - BX) / T);
    const r = Math.floor((py - BY) / T);
    if (c < 0 || r < 0 || c >= W || r >= H) return -1;
    return r * W + c;
  }

  /** Snap every tile to the snapshot; keeps existing tiles' visual state. */
  set(cells: Tile[], now: number) {
    const seen = new Set<number>();
    cells.forEach((tile, i) => {
      const [x, y] = this.cellXY(i);
      const v = this.tiles.get(tile.id);
      seen.add(tile.id);
      if (v) {
        v.tile = { ...tile };
        v.x = v.tx = v.fx = x;
        v.y = v.ty = v.fy = y;
        v.dur = 0;
        v.popping = false;
        v.alpha = 1;
        v.scale = 1;
      } else this.tiles.set(tile.id, this.make(tile, x, y, now));
    });
    for (const id of this.tiles.keys()) if (!seen.has(id)) this.tiles.delete(id);
  }

  make(tile: Tile, x: number, y: number, now: number): VTile {
    return { tile: { ...tile }, x, y, fx: x, fy: y, tx: x, ty: y, t: 0, dur: 0, ease: easeOut, scale: 1, alpha: 1, flash: 0, pop: 0, popping: false, born: now };
  }

  moveTo(id: number, i: number, dur: number, ease = easeDrop, from?: [number, number]) {
    const v = this.tiles.get(id);
    if (!v) return;
    const [x, y] = this.cellXY(i);
    v.fx = from ? from[0] : v.x;
    v.fy = from ? from[1] : v.y;
    if (from) {
      v.x = from[0];
      v.y = from[1];
    }
    v.tx = x;
    v.ty = y;
    v.t = 0;
    v.dur = dur;
    v.ease = ease;
  }

  update(dt: number) {
    for (const v of this.tiles.values()) {
      if (v.dur > 0) {
        v.t += dt;
        const k = clamp(v.t / v.dur);
        const e = v.ease(k);
        v.x = v.fx + (v.tx - v.fx) * e;
        v.y = v.fy + (v.ty - v.fy) * e;
        if (k >= 1) v.dur = 0;
      }
      if (v.flash > 0) v.flash = Math.max(0, v.flash - dt * 5);
      if (v.popping) {
        v.pop += dt / 0.13;
        v.scale = 1 + v.pop * 0.35;
        v.alpha = Math.max(0, 1 - v.pop);
      } else if (v.scale !== 1 && !v.popping) {
        v.scale += (1 - v.scale) * Math.min(1, dt * 14);
        if (Math.abs(v.scale - 1) < 0.02) v.scale = 1;
      }
    }
    for (const [id, v] of this.tiles) if (v.popping && v.pop >= 1) this.tiles.delete(id);
    // Idle glint: a highlight sweeps across a random tile now and then.
    this.glintT -= dt;
    if (this.glintT <= 0) {
      const ids = [...this.tiles.keys()];
      this.glintId = ids[Math.floor(Math.random() * ids.length)] ?? -1;
      this.glintT = 0.6 + Math.random() * 0.9;
      this.glintK = 0;
    }
    this.glintK += dt / 0.28;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 4);
    this.visible = this.active ? Math.min(1, this.visible + dt * 3) : Math.max(0, this.visible - dt * 3);
  }

  /** True while a fight is on screen; the board fades in and out with it. */
  active = false;

  /** Tile cell index at rest (ignores in-flight tiles). */
  gridIds(): (number | null)[] {
    const grid: (number | null)[] = Array(W * H).fill(null);
    for (const v of this.tiles.values()) {
      if (v.popping || v.dur > 0) continue;
      const c = Math.round(v.x / T);
      const r = Math.round(v.y / T);
      if (c >= 0 && r >= 0 && c < W && r < H) grid[r * W + c] = v.tile.id;
    }
    return grid;
  }

  dragMove(): Move | null {
    const d = this.drag;
    if (!d || !d.line) return null;
    const size = d.line === 'row' ? W : H;
    const delta = ((Math.round(d.offset / T) % size) + size) % size;
    if (!delta) return null;
    return { line: d.line, index: d.index, delta };
  }

  draw(ctx: Ctx2D, t: number, locked: (line: 'row' | 'col', i: number) => boolean) {
    const sx = this.shake > 0 ? Math.round(Math.sin(t * 90) * this.shake * 3) : 0;
    const ox = BX + sx;
    const oy = BY;
    const a = this.visible;
    // Frame.
    ctx.globalAlpha = a;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(ox - 6, oy - 6, BW + 12, BH + 12);
    ctx.fillStyle = hex('wood1');
    ctx.fillRect(ox - 5, oy - 5, BW + 10, BH + 10);
    ctx.fillStyle = hex('wood2');
    ctx.fillRect(ox - 5, oy - 5, BW + 10, 1);
    ctx.fillRect(ox - 5, oy - 5, 1, BH + 10);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(ox - 2, oy - 2, BW + 4, BH + 4);
    ctx.fillStyle = hex('ink1');
    ctx.fillRect(ox - 1, oy - 1, BW + 2, BH + 2);
    // Grid dots.
    ctx.fillStyle = hex('ink2');
    for (let r = 1; r < H; r++) for (let c = 1; c < W; c++) ctx.fillRect(ox + c * T - 1, oy + r * T - 1, 2, 2);
    // Locks.
    for (let c = 0; c < W; c++)
      if (this.colLock[c] > 0 || locked('col', c)) {
        ctx.fillStyle = 'rgba(90,110,150,0.18)';
        ctx.fillRect(ox + c * T, oy, T, BH);
      }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, BW, BH);
    ctx.clip();
    const d = this.drag;
    for (const v of this.tiles.values()) {
      let x = v.x;
      let y = v.y;
      let extra: [number, number] | null = null;
      if (d?.line && !v.popping && v.dur === 0) {
        const col = Math.round(v.x / T);
        const row = Math.round(v.y / T);
        if (d.line === 'row' && row === d.index) {
          x = (((v.x + d.offset) % BW) + BW) % BW;
          if (x > BW - T) extra = [x - BW, y];
        } else if (d.line === 'col' && col === d.index) {
          y = (((v.y + d.offset) % BH) + BH) % BH;
          if (y > BH - T) extra = [x, y - BH];
        }
      }
      this.drawTile(ctx, v, ox + x, oy + y, t);
      if (extra) this.drawTile(ctx, v, ox + extra[0], oy + extra[1], t);
    }
    // Preview highlight (cells are post-shift positions).
    if (this.highlight.length) {
      const pulse = 0.55 + Math.sin(t * 10) * 0.25;
      for (const g of this.highlight) {
        const c = FAM_COLORS[g.fam].light;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = hex(c);
        for (const i of g.cells) {
          const [x, y] = this.cellXY(i);
          ctx.fillRect(ox + x, oy + y, T, 1);
          ctx.fillRect(ox + x, oy + y + T - 1, T, 1);
          ctx.fillRect(ox + x, oy + y, 1, T);
          ctx.fillRect(ox + x + T - 1, oy + y, 1, T);
        }
        ctx.globalAlpha = 1;
      }
    }
    // Flood.
    if (this.flood > 0) {
      const top = oy + BH - this.flood * T;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = hex('teal2');
      ctx.fillRect(ox, top, BW, this.flood * T);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hex('teal4');
      for (let x = 0; x < BW; x += 2) ctx.fillRect(ox + x, top + Math.round(Math.sin(x * 0.3 + t * 3)), 1, 1);
    }
    ctx.restore();

    // Aim overlay (active / bomb targeting).
    if (this.aimCells.length) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 8) * 0.15;
      ctx.fillStyle = hex('orange3');
      for (const i of this.aimCells) {
        const [x, y] = this.cellXY(i);
        ctx.fillRect(ox + x + 1, oy + y + 1, T - 2, T - 2);
      }
      ctx.globalAlpha = 1;
    }
    // Hover hint: which row and column this tile can drag.
    if (this.hover >= 0 && !this.drag && this.visible >= 1) {
      const r = Math.floor(this.hover / W);
      const c = this.hover % W;
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = hex('cream');
      if (!locked('row', r)) ctx.fillRect(ox, oy + r * T, BW, T);
      if (!locked('col', c)) ctx.fillRect(ox + c * T, oy, T, BH);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = hex('gold4');
      const my = oy + r * T + T / 2;
      const mx = ox + c * T + T / 2;
      if (!locked('row', r))
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(ox - 9 + k, my - k, 1, k * 2 + 1);
          ctx.fillRect(ox + BW + 8 - k, my - k, 1, k * 2 + 1);
        }
      if (!locked('col', c))
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(mx - k, oy - 9 + k, k * 2 + 1, 1);
          ctx.fillRect(mx - k, oy + BH + 8 - k, k * 2 + 1, 1);
        }
      ctx.globalAlpha = 1;
    }
    // Keyboard cursor.
    if (this.cursor >= 0) {
      const [x, y] = this.cellXY(this.cursor);
      ctx.fillStyle = hex('gold4');
      const blink = Math.floor(t * 4) % 2 ? 1 : 0;
      for (const [px, py, w, h] of [
        [x - 1, y - 1, 6, 1],
        [x - 1, y - 1, 1, 6],
        [x + T - 5, y - 1, 6, 1],
        [x + T, y - 1, 1, 6],
        [x - 1, y + T, 6, 1],
        [x - 1, y + T - 5, 1, 6],
        [x + T - 5, y + T, 6, 1],
        [x + T, y + T - 5, 1, 6],
      ])
        ctx.fillRect(ox + px - blink, oy + py - blink, w, h);
    }
    // Queue preview above the columns.
    this.drawQueue(ctx, ox, oy);
    if (this.previewText) text(ctx, this.previewText, BX + BW / 2, oy + BH + 8, 'cream', { align: 'center', outline: 'ink0' });
  }

  preview = 1;

  private drawQueue(ctx: Ctx2D, ox: number, oy: number) {
    for (let c = 0; c < W; c++) {
      const q = this.queue[c] ?? [];
      for (let k = 0; k < Math.min(this.preview, q.length); k++) {
        const tile = q[k];
        const x = ox + c * T + T / 2;
        const y = oy - 12 - k * 11;
        ctx.globalAlpha = k === 0 ? 0.9 : 0.55;
        const f = getFrame(`tile_${tile.kind}`);
        // Half-size ghost: draw every other pixel via scaled drawImage.
        ctx.drawImage(f.canvas as CanvasImageSource, Math.round(x - 5), Math.round(y - 5), 10, 10);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawTile(ctx: Ctx2D, v: VTile, px: number, py: number, t: number) {
    const tile = v.tile;
    const x = Math.round(px);
    const y = Math.round(py);
    const s = v.scale;
    ctx.globalAlpha = v.alpha;
    if (tile.kind === 'junk') {
      const f = getFrame('tile_junk');
      if (s !== 1) ctx.drawImage(f.canvas as CanvasImageSource, Math.round(x + T / 2 - (f.w * s) / 2), Math.round(y + T / 2 - (f.h * s) / 2), Math.round(f.w * s), Math.round(f.h * s));
      else draw(ctx, f, x + T / 2, y + T / 2);
      ctx.globalAlpha = 1;
      return;
    }
    const hidden = !!tile.hidden;
    const card = hidden ? ['ink2', 'ink3', 'ink0'] : CARD[tile.kind] ?? CARD.prism;
    const inset = s === 1 ? 1 : Math.round(1 - (s - 1) * 6);
    const w = T - inset * 2;
    // Card.
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(x + inset, y + inset, w, w);
    ctx.fillStyle = hex(card[0]);
    ctx.fillRect(x + inset + 1, y + inset + 1, w - 2, w - 2);
    ctx.fillStyle = hex(card[1]);
    ctx.fillRect(x + inset + 1, y + inset + 1, w - 2, 1);
    ctx.fillRect(x + inset + 1, y + inset + 1, 1, w - 2);
    ctx.fillStyle = hex(card[2]);
    ctx.fillRect(x + inset + 1, y + inset + w - 2, w - 2, 1);
    ctx.fillRect(x + inset + w - 2, y + inset + 1, 1, w - 2);
    if (tile.kind === 'prism') {
      const hue = ['red3', 'orange3', 'gold3', 'green3', 'teal4', 'cold3', 'vio4'];
      for (let k = 0; k < w - 4; k++) {
        ctx.fillStyle = hex(hue[(k + Math.floor(t * 12)) % hue.length]);
        ctx.fillRect(x + inset + 2 + k, y + inset + w - 3, 1, 1);
      }
    }
    if (hidden) {
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(x + 5, y + 10, T - 10, 6);
      ctx.fillStyle = hex('grey2');
      ctx.fillRect(x + 6, y + 11, T - 12, 1);
    } else {
      const icon = getFrame(`tile_${tile.kind}`);
      if (s !== 1) {
        const iw = Math.round(icon.w * s);
        ctx.drawImage(icon.canvas as CanvasImageSource, Math.round(x + T / 2 - iw / 2), Math.round(y + T / 2 - iw / 2), iw, iw);
      } else draw(ctx, icon, x + T / 2, y + T / 2);
    }
    // Specials.
    if (tile.special === 'rocketH' || tile.special === 'rocketV') {
      const glow = hex(Math.floor(t * 8) % 2 ? 'cream' : 'gold4');
      ctx.fillStyle = glow;
      if (tile.special === 'rocketH') {
        for (let k = 3; k < T - 3; k += 3) {
          ctx.fillRect(x + k, y + 3, 2, 1);
          ctx.fillRect(x + k, y + T - 4, 2, 1);
        }
        ctx.fillRect(x + 2, y + T / 2 - 1, 1, 3);
        ctx.fillRect(x + T - 3, y + T / 2 - 1, 1, 3);
      } else {
        for (let k = 3; k < T - 3; k += 3) {
          ctx.fillRect(x + 3, y + k, 1, 2);
          ctx.fillRect(x + T - 4, y + k, 1, 2);
        }
        ctx.fillRect(x + T / 2 - 1, y + 2, 3, 1);
        ctx.fillRect(x + T / 2 - 1, y + T - 3, 3, 1);
      }
    } else if (tile.special === 'bomb') {
      const pulse = Math.floor(t * 6) % 2;
      ctx.fillStyle = hex(pulse ? 'orange3' : 'red3');
      ctx.fillRect(x + 2, y + 2, 4, 1);
      ctx.fillRect(x + 2, y + 2, 1, 4);
      ctx.fillRect(x + T - 6, y + 2, 4, 1);
      ctx.fillRect(x + T - 3, y + 2, 1, 4);
      ctx.fillRect(x + 2, y + T - 3, 4, 1);
      ctx.fillRect(x + 2, y + T - 6, 1, 4);
      ctx.fillRect(x + T - 6, y + T - 3, 4, 1);
      ctx.fillRect(x + T - 3, y + T - 6, 1, 4);
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(x + T - 9, y + 3, 6, 6);
      ctx.fillStyle = hex('grey1');
      ctx.fillRect(x + T - 8, y + 4, 4, 4);
      ctx.fillStyle = hex(pulse ? 'gold4' : 'orange3');
      ctx.fillRect(x + T - 5, y + 2, 1, 1);
    }
    if (tile.fuse) {
      draw(ctx, getFrame('tile_ember', Math.floor(t * 6) % 2 ? 'idle0' : 'idle1'), x + 6, y + 12);
      text(ctx, String(tile.fuse), x + T - 5, y + T - 10, 'gold4', { outline: 'ink0' });
    }
    if (tile.pin) draw(ctx, getFrame('tile_staple'), x + T / 2, y + 5);
    if (v.flash > 0) {
      ctx.globalAlpha = v.flash * v.alpha;
      ctx.fillStyle = hex('white');
      ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
    }
    if (tile.id === this.glintId && this.glintK < 1 && !hidden) {
      // Diagonal glint sweeping from the top-left corner.
      const d = Math.round(this.glintK * (T * 2));
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = hex('white');
      for (let k = 0; k < T - 2; k++) {
        const gx = d - k;
        if (gx >= 1 && gx < T - 1) ctx.fillRect(x + gx, y + 1 + k, 1, 1);
        if (gx - 1 >= 1 && gx - 1 < T - 1) ctx.fillRect(x + gx - 1, y + 1 + k, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}

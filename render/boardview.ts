import { H, W, type Group, type Move, type Tile } from '../game/types.ts';
import { text } from './font.ts';
import { FAM_COLORS, hex } from './palette.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';
import { clamp, easeDrop, easeOut, easeOutBack } from './tween.ts';

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
  alpha: number;
  flash: number;
  pop: number;
  popping: boolean;
  born: number;
  /** A try that failed: the tile nudges towards (wx, wy) and back. */
  wobble: { dx: number; dy: number; t: number } | null;
  /** A special that just appeared: its frame blinks for a moment. */
  fresh: number;
}

/** One tile held by the pointer. dx/dy follow the pointer along one axis, at most one cell. */
export interface Drag {
  cell: number;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  moved: boolean;
}

const CARD: Record<string, [string, string, string]> = {
  blade: ['red1', 'red2', 'red0'],
  shield: ['cold1', 'cold2', 'ink3'],
  ink: ['vio1', 'vio2', 'vio0'],
  coin: ['gold1', 'gold2', 'wood1'],
  prism: ['grey1', 'grey3', 'ink2'],
};

/** How far (px) a drag must travel before it counts as a swap. */
const COMMIT = Math.round(T * 0.4);

export class BoardView {
  tiles = new Map<number, VTile>();
  queue: Tile[][] = [];
  flood = 0;
  colLock: number[] = Array(W).fill(0);
  rowLock: number[] = Array(H).fill(0);
  /** The ring binder: edge tiles swap with the opposite edge. */
  wrap = false;
  drag: Drag | null = null;
  /** Click-to-swap: the tile picked first, waiting for a neighbour. */
  selected = -1;
  highlight: Group[] = [];
  blastCells: number[] = [];
  previewText = '';
  shake = 0;
  cursor = -1;
  hover = -1;
  glintId = -1;
  glintT = 1;
  glintK = 1;
  aimCells: number[] = [];
  visible = 0;
  /** True while a fight is on screen; the board fades in and out with it. */
  active = false;
  preview = 1;

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

  /** Neighbour of cell i one step along (dc, dr), or -1 at an edge (unless the ring joins it). */
  neighbour(i: number, dc: number, dr: number): number {
    let c = (i % W) + dc;
    let r = Math.floor(i / W) + dr;
    if (this.wrap) {
      c = (c + W) % W;
      r = (r + H) % H;
    }
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
      } else this.tiles.set(tile.id, this.make(tile, x, y, now));
    });
    for (const id of this.tiles.keys()) if (!seen.has(id)) this.tiles.delete(id);
  }

  make(tile: Tile, x: number, y: number, now: number): VTile {
    return { tile: { ...tile }, x, y, fx: x, fy: y, tx: x, ty: y, t: 0, dur: 0, ease: easeOut, alpha: 1, flash: 0, pop: 0, popping: false, born: now, wobble: null, fresh: 0 };
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
      if (v.fresh > 0) v.fresh = Math.max(0, v.fresh - dt);
      if (v.popping) v.pop += dt / 0.16;
      if (v.wobble) {
        v.wobble.t += dt / 0.22;
        if (v.wobble.t >= 1) v.wobble = null;
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

  /** Tile id per cell at rest (ignores in-flight tiles). */
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

  // ── Drag and swap ──────────────────────────────────────────────────

  startDrag(cell: number, x: number, y: number) {
    this.drag = { cell, sx: x, sy: y, dx: 0, dy: 0, moved: false };
  }

  /** Pointer moved: the held tile follows along the dominant axis, at most one cell. */
  dragTo(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const rx = x - d.sx;
    const ry = y - d.sy;
    if (!d.moved && Math.hypot(rx, ry) > 3) d.moved = true;
    if (!d.moved) return;
    const horizontal = Math.abs(rx) >= Math.abs(ry);
    d.dx = horizontal ? Math.max(-T, Math.min(T, rx)) : 0;
    d.dy = horizontal ? 0 : Math.max(-T, Math.min(T, ry));
    const partner = this.dragPartner();
    if (partner < 0) {
      d.dx = Math.max(-4, Math.min(4, d.dx));
      d.dy = Math.max(-4, Math.min(4, d.dy));
    }
  }

  /** The neighbour the held tile is being pushed into (-1 while the drag has no direction). */
  dragPartner(): number {
    const d = this.drag;
    if (!d || (!d.dx && !d.dy)) return -1;
    return this.neighbour(d.cell, Math.sign(d.dx), Math.sign(d.dy));
  }

  /** The swap the current drag would make if released now. */
  dragMove(): Move | null {
    const d = this.drag;
    if (!d || Math.max(Math.abs(d.dx), Math.abs(d.dy)) < COMMIT) return null;
    const to = this.dragPartner();
    return to >= 0 ? { from: d.cell, to } : null;
  }

  /** Visual start for a swap: where the held pair is drawn right now. */
  private heldOffset(cell: number): [number, number] {
    const d = this.drag;
    if (!d) return [0, 0];
    if (cell === d.cell) return [d.dx, d.dy];
    if (cell === this.dragPartner()) return [-d.dx, -d.dy];
    return [0, 0];
  }

  /** Accepted swap: both tiles slide into each other's cells from where they are drawn. */
  animateSwap(m: Move) {
    const grid = this.gridIds();
    const a = grid[m.from];
    const b = grid[m.to];
    const [ax, ay] = this.cellXY(m.from);
    const [bx, by] = this.cellXY(m.to);
    const [oax, oay] = this.heldOffset(m.from);
    const [obx, oby] = this.heldOffset(m.to);
    this.drag = null;
    this.selected = -1;
    if (a !== null) this.moveTo(a, m.to, 0.12, easeOut, [ax + oax, ay + oay]);
    if (b !== null) this.moveTo(b, m.from, 0.12, easeOut, [bx + obx, by + oby]);
  }

  /** Refused swap: the pair springs back (from the drag) or nudges and returns (click/keys). */
  refuse(m: Move) {
    const grid = this.gridIds();
    const a = grid[m.from];
    const b = grid[m.to];
    const [ax, ay] = this.cellXY(m.from);
    const [bx, by] = this.cellXY(m.to);
    const held = this.drag && this.drag.moved;
    const [oax, oay] = this.heldOffset(m.from);
    const [obx, oby] = this.heldOffset(m.to);
    this.drag = null;
    const va = a !== null ? this.tiles.get(a) : undefined;
    const vb = b !== null ? this.tiles.get(b) : undefined;
    if (held && (oax || oay)) {
      if (va) this.moveTo(va.tile.id, m.from, 0.2, easeOutBack, [ax + oax, ay + oay]);
      if (vb) this.moveTo(vb.tile.id, m.to, 0.2, easeOutBack, [bx + obx, by + oby]);
      return;
    }
    const sx = Math.sign(bx - ax) * 7;
    const sy = Math.sign(by - ay) * 7;
    if (va) va.wobble = { dx: sx, dy: sy, t: 0 };
    if (vb) vb.wobble = { dx: -sx, dy: -sy, t: 0 };
  }

  /** Drag released without a swap: the tile settles back. */
  dropBack() {
    const d = this.drag;
    if (!d) return;
    const grid = this.gridIds();
    const [x, y] = this.cellXY(d.cell);
    const id = grid[d.cell];
    const partner = this.dragPartner();
    const pid = partner >= 0 ? grid[partner] : null;
    if (id !== null && (d.dx || d.dy)) this.moveTo(id, d.cell, 0.14, easeOutBack, [x + d.dx, y + d.dy]);
    if (pid !== null && partner >= 0) {
      const [px, py] = this.cellXY(partner);
      this.moveTo(pid, partner, 0.14, easeOutBack, [px - d.dx, py - d.dy]);
    }
    this.drag = null;
  }

  // ── Draw ───────────────────────────────────────────────────────────

  /** `swappable(a, b)`: that pair may physically swap (no staple, anchor or water in the way). */
  draw(ctx: Ctx2D, t: number, swappable: (a: number, b: number) => boolean) {
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
    // Anchored columns: shaded, with the anchor above.
    for (let c = 0; c < W; c++)
      if (this.colLock[c] > 0) {
        ctx.fillStyle = 'rgba(40,120,120,0.22)';
        ctx.fillRect(ox + c * T, oy, T, BH);
      }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, BW, BH);
    ctx.clip();
    const d = this.drag;
    const partner = this.dragPartner();
    const held: VTile[] = [];
    for (const v of this.tiles.values()) {
      let x = v.x;
      let y = v.y;
      if (d && !v.popping && v.dur === 0) {
        const cell = Math.round(v.y / T) * W + Math.round(v.x / T);
        if (cell === d.cell) {
          held.push(v);
          continue;
        }
        if (cell === partner) {
          x -= d.dx;
          y -= d.dy;
        }
      }
      if (v.wobble) {
        const k = Math.sin(v.wobble.t * Math.PI);
        x += Math.round(v.wobble.dx * k);
        y += Math.round(v.wobble.dy * k);
      }
      this.drawTile(ctx, v, ox + x, oy + y, t);
    }
    // The held tile is drawn last, lifted by a pixel with a shadow, so it reads as "in hand".
    for (const v of held) {
      const x = ox + v.x + (d?.dx ?? 0);
      const y = oy + v.y + (d?.dy ?? 0);
      ctx.fillStyle = 'rgba(7,7,15,0.55)';
      ctx.fillRect(Math.round(x) + 2, Math.round(y) + 2, T - 2, T - 2);
      this.drawTile(ctx, v, x, y - 1, t);
      ctx.fillStyle = hex('gold4');
      this.frameRect(ctx, Math.round(x), Math.round(y) - 1, T, T);
    }
    // Preview: cells the swap would clear (post-swap positions) and cells a special would blast.
    if (this.blastCells.length) {
      ctx.globalAlpha = 0.28 + Math.sin(t * 12) * 0.12;
      ctx.fillStyle = hex('orange4');
      for (const i of this.blastCells) {
        const [x, y] = this.cellXY(i);
        ctx.fillRect(ox + x + 1, oy + y + 1, T - 2, T - 2);
      }
      ctx.globalAlpha = 1;
    }
    if (this.highlight.length) {
      const pulse = 0.55 + Math.sin(t * 10) * 0.25;
      for (const g of this.highlight) {
        ctx.globalAlpha = pulse;
        ctx.fillStyle = hex(FAM_COLORS[g.fam].light);
        for (const i of g.cells) {
          const [x, y] = this.cellXY(i);
          this.frameRect(ctx, ox + x, oy + y, T, T);
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

    for (let c = 0; c < W; c++) if (this.colLock[c] > 0 && a >= 1) draw(ctx, getFrame('tile_anchor'), ox + c * T + T / 2, oy - 3);

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
    // Selected tile (click-to-swap) and hover arrows towards the neighbours it may swap with.
    const focus = this.selected >= 0 ? this.selected : !d && this.visible >= 1 ? this.hover : -1;
    if (focus >= 0) {
      const [x, y] = this.cellXY(focus);
      if (this.selected >= 0) {
        ctx.fillStyle = hex(Math.floor(t * 6) % 2 ? 'gold4' : 'cream');
        this.frameRect(ctx, ox + x - 1, oy + y - 1, T + 2, T + 2);
      } else {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = hex('cream');
        ctx.fillRect(ox + x, oy + y, T, T);
        ctx.globalAlpha = 1;
      }
      this.drawArrows(ctx, focus, ox, oy, swappable, t);
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

  private frameRect(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  /** Small gold chevrons on the sides of a tile where a swap is possible. */
  private drawArrows(ctx: Ctx2D, cell: number, ox: number, oy: number, swappable: (a: number, b: number) => boolean, t: number) {
    const [x, y] = this.cellXY(cell);
    const cx = ox + x + T / 2;
    const cy = oy + y + T / 2;
    const bob = Math.floor(t * 3) % 2;
    ctx.fillStyle = hex('gold4');
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dc, dr] of dirs) {
      const n = this.neighbour(cell, dc, dr);
      if (n < 0 || !swappable(cell, n)) continue;
      const ax = cx + dc * (T / 2 + 1 + bob);
      const ay = cy + dr * (T / 2 + 1 + bob);
      for (let k = 0; k < 3; k++) {
        if (dc) ctx.fillRect(ax + dc * (2 - k), ay - k, 1, k * 2 + 1);
        else ctx.fillRect(ax - k, ay + dr * (2 - k), k * 2 + 1, 1);
      }
    }
  }

  private drawQueue(ctx: Ctx2D, ox: number, oy: number) {
    for (let c = 0; c < W; c++) {
      if (this.colLock[c] > 0) continue;
      const q = this.queue[c] ?? [];
      for (let k = 0; k < Math.min(this.preview, q.length); k++) {
        const x = ox + c * T + T / 2;
        const y = oy - 9 - k * 9;
        draw(ctx, getFrame(`tile_mini_${q[k].kind}`), x, y, k === 0 ? 1 : 0.6);
      }
    }
  }

  drawTile(ctx: Ctx2D, v: VTile, px: number, py: number, t: number) {
    const tile = v.tile;
    const x = Math.round(px);
    const y = Math.round(py);
    // Popping tiles shrink by whole pixels (no fractional scaling) behind a white flash.
    const inset = v.popping ? 1 + Math.min(12, Math.floor(v.pop * 13)) : 1;
    const w = T - inset * 2;
    if (w <= 0) return;
    ctx.globalAlpha = v.alpha;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + inset, y + inset, w, w);
    ctx.clip();
    if (tile.kind === 'junk') {
      draw(ctx, getFrame('tile_junk'), x + T / 2, y + T / 2);
    } else {
      const hidden = !!tile.hidden;
      const card = hidden ? ['ink2', 'ink3', 'ink0'] : CARD[tile.kind] ?? CARD.prism;
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
        for (let k = 0; k < T - 6; k++) {
          ctx.fillStyle = hex(hue[(k + Math.floor(t * 12)) % hue.length]);
          ctx.fillRect(x + 3 + k, y + T - 4, 1, 1);
        }
      }
      if (hidden) {
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(x + 5, y + 10, T - 10, 6);
        ctx.fillStyle = hex('grey2');
        ctx.fillRect(x + 6, y + 11, T - 12, 1);
      } else draw(ctx, getFrame(`tile_${tile.kind}`), x + T / 2, y + T / 2);
      this.drawSpecial(ctx, tile, x, y, t);
    }
    ctx.restore();
    if (tile.fuse) {
      draw(ctx, getFrame('tile_ember', Math.floor(t * 6) % 2 ? 'idle0' : 'idle1'), x + 6, y + 12);
      text(ctx, String(tile.fuse), x + T - 5, y + T - 10, 'gold4', { outline: 'ink0' });
    }
    if (tile.pin) draw(ctx, getFrame('tile_staple'), x + T / 2, y + 5);
    if (v.flash > 0) {
      ctx.globalAlpha = v.flash * v.alpha;
      ctx.fillStyle = hex('white');
      ctx.fillRect(x + inset, y + inset, w, w);
    }
    if (v.fresh > 0) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = hex(Math.floor(v.fresh * 16) % 2 ? 'white' : 'gold4');
      this.frameRect(ctx, x, y, T, T);
    }
    if (tile.id === this.glintId && this.glintK < 1 && !tile.hidden && !v.popping) {
      // Diagonal glint sweeping from the top-left corner.
      const g = Math.round(this.glintK * (T * 2));
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = hex('white');
      for (let k = 0; k < T - 2; k++) {
        const gx = g - k;
        if (gx >= 1 && gx < T - 1) ctx.fillRect(x + gx, y + 1 + k, 1, 1);
        if (gx - 1 >= 1 && gx - 1 < T - 1) ctx.fillRect(x + gx - 1, y + 1 + k, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawSpecial(ctx: Ctx2D, tile: Tile, x: number, y: number, t: number) {
    if (tile.special === 'rocketH' || tile.special === 'rocketV') {
      ctx.fillStyle = hex(Math.floor(t * 8) % 2 ? 'cream' : 'gold4');
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
  }
}

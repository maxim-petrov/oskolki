import { H, W, type Fam, type Group, type Move, type Tile } from '../game/types.ts';
import { text } from './font.ts';
import { FAM_COLORS, hex } from './palette.ts';
import { draw, drawScaled, getFrame, hasSprite, type Ctx2D } from './sprite.ts';
import { clamp, easeDrop, easeOut, easeOutBack } from './tween.ts';
import { L } from './view.ts';

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

/** One tile held by the pointer. dx/dy follow the pointer along one axis (one cell, or the whole line with slides; both axes for a diagonal). */
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

export class BoardView {
  /** Geometry from the layout: tile size and the grid's top-left corner. */
  T = 26;
  /** Columns and rows of the fight's board. */
  w = W;
  h = H;
  bx = 0;
  by = 0;
  get bw() {
    return this.w * this.T;
  }
  get bh() {
    return this.h * this.T;
  }
  tiles = new Map<number, VTile>();
  queue: Tile[][] = [];
  flood = 0;
  colLock: number[] = Array(W).fill(0);
  rowLock: number[] = Array(H).fill(0);
  /** The ring binder: edge tiles swap with the opposite edge. */
  wrap = false;
  /** Art of the item held in every colour: each tile of the colour shows it (a plus when upgraded). */
  gearArt: Record<Fam, string> = { blade: 'card_knife', shield: 'tile_shield', ink: 'tile_ink', coin: 'tile_coin' };
  gearUp: Record<Fam, boolean> = { blade: false, shield: false, ink: false, coin: false };
  /** Move rules of the fight: slides along a line, diagonal swaps, only up and down. */
  slide = false;
  diagonal = false;
  vertical = false;
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

  /** Follows the layout; tiles keep their cell (positions are rescaled when the tile size changes). */
  layout() {
    const t = L.tile;
    if (t !== this.T)
      for (const v of this.tiles.values()) {
        const k = t / this.T;
        v.x *= k;
        v.y *= k;
        v.fx *= k;
        v.fy *= k;
        v.tx *= k;
        v.ty *= k;
      }
    this.T = t;
    this.bx = L.board.x;
    this.by = L.board.y;
  }

  /** A board of another size: locks follow, tiles keep their ids (positions are set by the next snapshot). */
  setSize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.colLock = Array(w).fill(0);
    this.rowLock = Array(h).fill(0);
    this.selected = -1;
    this.cursor = -1;
    this.drag = null;
  }

  cellXY(i: number): [number, number] {
    return [(i % this.w) * this.T, Math.floor(i / this.w) * this.T];
  }

  center(i: number): [number, number] {
    const [x, y] = this.cellXY(i);
    return [this.bx + x + this.T / 2, this.by + y + this.T / 2];
  }

  cellAt(px: number, py: number): number {
    const T = this.T;
    const c = Math.floor((px - this.bx) / T);
    const r = Math.floor((py - this.by) / T);
    if (c < 0 || r < 0 || c >= this.w || r >= this.h) return -1;
    return r * this.w + c;
  }

  /** Neighbour of cell i one step along (dc, dr), or -1 at an edge (unless the ring joins it). */
  neighbour(i: number, dc: number, dr: number): number {
    let c = (i % this.w) + dc;
    const r = Math.floor(i / this.w) + dr;
    // The ring joins the left and right edges only.
    if (this.wrap) c = (c + this.w) % this.w;
    if (c < 0 || r < 0 || c >= this.w || r >= this.h) return -1;
    return r * this.w + c;
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
    const { T } = this;
    const grid: (number | null)[] = Array(this.w * this.h).fill(null);
    for (const v of this.tiles.values()) {
      if (v.popping || v.dur > 0) continue;
      const c = Math.round(v.x / T);
      const r = Math.round(v.y / T);
      if (c >= 0 && r >= 0 && c < this.w && r < this.h) grid[r * this.w + c] = v.tile.id;
    }
    return grid;
  }

  // ── Drag and swap ──────────────────────────────────────────────────

  startDrag(cell: number, x: number, y: number) {
    this.drag = { cell, sx: x, sy: y, dx: 0, dy: 0, moved: false };
  }

  /**
   * Pointer moved: the held tile follows along the dominant axis — one cell, or to the edge of
   * its line with slides; with diagonals a pull on both axes aims at the diagonal neighbour.
   */
  dragTo(x: number, y: number) {
    const { T } = this;
    const d = this.drag;
    if (!d) return;
    const rx = x - d.sx;
    const ry = y - d.sy;
    if (!d.moved && Math.hypot(rx, ry) > 3) d.moved = true;
    if (!d.moved) return;
    const c = d.cell % this.w;
    const r = Math.floor(d.cell / this.w);
    if (this.diagonal && !this.vertical && Math.abs(rx) > T * 0.35 && Math.abs(ry) > T * 0.35) {
      d.dx = Math.max(-T, Math.min(T, rx));
      d.dy = Math.max(-T, Math.min(T, ry));
    } else if (!this.vertical && Math.abs(rx) >= Math.abs(ry)) {
      // Towards the edge of the row: one cell (the ring lets it cross), or the whole row with slides.
      const room = rx < 0 ? c : this.w - 1 - c;
      const lim = this.slide ? Math.max(room, this.wrap ? 1 : 0) * T : T;
      d.dx = Math.max(-lim, Math.min(lim, rx));
      d.dy = 0;
    } else {
      const room = ry < 0 ? r : this.h - 1 - r;
      const lim = this.slide ? room * T : T;
      d.dx = 0;
      d.dy = Math.max(-lim, Math.min(lim, ry));
    }
    if (this.dragTarget() < 0) {
      d.dx = Math.max(-4, Math.min(4, d.dx));
      d.dy = Math.max(-4, Math.min(4, d.dy));
    }
  }

  /** The cell the held tile is being pushed into (-1 while the drag has no direction or no room). */
  dragTarget(): number {
    const d = this.drag;
    if (!d || (!d.dx && !d.dy)) return -1;
    const c = d.cell % this.w;
    const r = Math.floor(d.cell / this.w);
    if (d.dx && d.dy) {
      const tc = c + Math.sign(d.dx);
      const tr = r + Math.sign(d.dy);
      return tc < 0 || tr < 0 || tc >= this.w || tr >= this.h ? -1 : tr * this.w + tc;
    }
    const steps = this.slide ? Math.max(1, Math.round(Math.abs(d.dx || d.dy) / this.T)) : 1;
    if (steps === 1) return this.neighbour(d.cell, Math.sign(d.dx), Math.sign(d.dy));
    const tc = c + Math.sign(d.dx) * steps;
    const tr = r + Math.sign(d.dy) * steps;
    return tc < 0 || tr < 0 || tc >= this.w || tr >= this.h ? -1 : tr * this.w + tc;
  }

  /** Old name kept for callers: the cell the drag aims at. */
  dragPartner(): number {
    return this.dragTarget();
  }

  /** The move the current drag would make if released now. */
  dragMove(): Move | null {
    const COMMIT = Math.round(this.T * 0.4);
    const d = this.drag;
    if (!d || Math.max(Math.abs(d.dx), Math.abs(d.dy)) < COMMIT) return null;
    const to = this.dragTarget();
    return to >= 0 ? { from: d.cell, to } : null;
  }

  /** Cells between a move's ends along its line (the ones a slide shifts back), nearest first. */
  private between(from: number, to: number): number[] {
    const [fc, fr] = [from % this.w, Math.floor(from / this.w)];
    const [tc, tr] = [to % this.w, Math.floor(to / this.w)];
    if (fr !== tr && fc !== tc) return [to];
    const n = Math.max(Math.abs(tc - fc), Math.abs(tr - fr));
    // One step across the ring's edge is a plain swap with the far end.
    if (n > 1 && fr === tr && !this.slide) return [to];
    const sc = Math.sign(tc - fc);
    const sr = Math.sign(tr - fr);
    return Array.from({ length: n }, (_, k) => (fr + sr * (k + 1)) * this.w + fc + sc * (k + 1));
  }

  /** Visual offset of a cell while dragging: the held tile follows the pointer, the pushed ones give way. */
  private heldOffset(cell: number): [number, number] {
    const d = this.drag;
    if (!d) return [0, 0];
    if (cell === d.cell) return [d.dx, d.dy];
    const to = this.dragTarget();
    if (to < 0) return [0, 0];
    if (d.dx && d.dy) return cell === to ? [-d.dx, -d.dy] : [0, 0];
    const k = this.between(d.cell, to).indexOf(cell);
    if (k < 0) return [0, 0];
    const pull = Math.abs(d.dx || d.dy);
    const shift = Math.max(0, Math.min(this.T, pull - k * this.T));
    return [-Math.sign(d.dx) * shift, -Math.sign(d.dy) * shift];
  }

  /**
   * Accepted move from where the tiles are drawn: a swap exchanges the pair, a slide carries the
   * held tile to the end and every tile between steps back by one.
   */
  animateSwap(m: Move, slide = false) {
    const grid = this.gridIds();
    const start = (i: number): [number, number] => {
      const [x, y] = this.cellXY(i);
      const [ox, oy] = this.heldOffset(i);
      return [x + ox, y + oy];
    };
    const moves: [number | null, number, [number, number]][] = [];
    if (slide) {
      const span = [m.from, ...this.between(m.from, m.to)];
      moves.push([grid[m.from], m.to, start(m.from)]);
      for (let k = 1; k < span.length; k++) moves.push([grid[span[k]], span[k - 1], start(span[k])]);
    } else {
      moves.push([grid[m.from], m.to, start(m.from)], [grid[m.to], m.from, start(m.to)]);
    }
    this.drag = null;
    this.selected = -1;
    for (const [id, to, from] of moves) if (id !== null) this.moveTo(id, to, slide ? 0.16 : 0.12, easeOut, from);
  }

  /** Refused move: the tiles spring back (from the drag) or the pair nudges and returns (click/keys). */
  refuse(m: Move) {
    const grid = this.gridIds();
    const a = grid[m.from];
    const b = grid[m.to];
    const [ax, ay] = this.cellXY(m.from);
    const [bx, by] = this.cellXY(m.to);
    const held = this.drag && this.drag.moved;
    const [oax, oay] = this.heldOffset(m.from);
    const va = a !== null ? this.tiles.get(a) : undefined;
    const vb = b !== null ? this.tiles.get(b) : undefined;
    if (held && (oax || oay)) {
      for (const i of [m.from, ...this.between(m.from, m.to)]) {
        const id = grid[i];
        const [x, y] = this.cellXY(i);
        const [ox, oy] = this.heldOffset(i);
        if (id !== null && (ox || oy)) this.moveTo(id, i, 0.2, easeOutBack, [x + ox, y + oy]);
      }
      this.drag = null;
      return;
    }
    this.drag = null;
    const sx = Math.sign(bx - ax) * 7;
    const sy = Math.sign(by - ay) * 7;
    if (va) va.wobble = { dx: sx, dy: sy, t: 0 };
    if (vb) vb.wobble = { dx: -sx, dy: -sy, t: 0 };
  }

  /** Drag released without a move: the tiles settle back. */
  dropBack() {
    const d = this.drag;
    if (!d) return;
    const grid = this.gridIds();
    const to = this.dragTarget();
    for (const i of [d.cell, ...(to >= 0 ? this.between(d.cell, to) : [])]) {
      const id = grid[i];
      const [x, y] = this.cellXY(i);
      const [ox, oy] = this.heldOffset(i);
      if (id !== null && (ox || oy)) this.moveTo(id, i, 0.14, easeOutBack, [x + ox, y + oy]);
    }
    this.drag = null;
  }

  // ── Draw ───────────────────────────────────────────────────────────

  /** `swappable(a, b)`: that pair may physically swap (no staple, anchor or water in the way). */
  draw(ctx: Ctx2D, t: number, swappable: (a: number, b: number) => boolean) {
    const { T, bx: BX, by: BY, bw: BW, bh: BH } = this;
    const sx = this.shake > 0 ? Math.round(Math.sin(t * 90) * this.shake * 3) : 0;
    const ox = BX + sx;
    const oy = BY;
    const a = this.visible;
    // Frame: a wooden tray with a bevel, brass corner brackets and rivets.
    ctx.globalAlpha = a;
    this.drawFrame(ctx, ox, oy);
    // Grid dots.
    ctx.fillStyle = hex('ink2');
    for (let r = 1; r < this.h; r++) for (let c = 1; c < this.w; c++) ctx.fillRect(ox + c * T - 1, oy + r * T - 1, 2, 2);
    // Anchored columns: shaded, with the anchor above.
    for (let c = 0; c < this.w; c++)
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
    const held: VTile[] = [];
    for (const v of this.tiles.values()) {
      let x = v.x;
      let y = v.y;
      if (d && !v.popping && v.dur === 0) {
        const cell = Math.round(v.y / T) * this.w + Math.round(v.x / T);
        if (cell === d.cell) {
          held.push(v);
          continue;
        }
        const [ox, oy] = this.heldOffset(cell);
        x += ox;
        y += oy;
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

    for (let c = 0; c < this.w; c++) if (this.colLock[c] > 0 && a >= 1) draw(ctx, getFrame('tile_anchor'), ox + c * T + T / 2, oy - 3);

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

  private drawFrame(ctx: Ctx2D, ox: number, oy: number) {
    const { T, bw: BW, bh: BH } = this;
    const fill = (c: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = hex(c);
      ctx.fillRect(x, y, w, h);
    };
    const L = ox - 7;
    const Tp = oy - 7;
    const W2 = BW + 14;
    const H2 = BH + 14;
    fill('ink0', L, Tp, W2, H2);
    // Wood: lit top-left, cold shadow bottom-right, a grain line through the middle.
    fill('wood2', L + 1, Tp + 1, W2 - 2, H2 - 2);
    fill('wood3', L + 1, Tp + 1, W2 - 2, 1);
    fill('wood3', L + 1, Tp + 1, 1, H2 - 2);
    fill('wood4', L + 2, Tp + 1, W2 - 12, 1);
    fill('wood1', L + 1, Tp + H2 - 2, W2 - 2, 1);
    fill('wood1', L + W2 - 2, Tp + 1, 1, H2 - 2);
    fill('ink3', L + W2 - 2, Tp + 6, 1, H2 - 12);
    for (let x = L + 5; x < L + W2 - 5; x += 9) fill('wood1', x, Tp + 3, 4, 1);
    for (let x = L + 9; x < L + W2 - 5; x += 11) fill('wood1', x, Tp + H2 - 4, 5, 1);
    for (let y = Tp + 6; y < Tp + H2 - 5; y += 10) {
      fill('wood1', L + 3, y, 1, 4);
      fill('wood1', L + W2 - 4, y + 5, 1, 4);
    }
    // Recessed well around the tiles.
    fill('ink0', ox - 2, oy - 2, BW + 4, BH + 4);
    fill('ink1', ox - 1, oy - 1, BW + 2, BH + 2);
    fill('wood0', ox - 2, oy - 3, BW + 4, 1);
    fill('wood0', ox - 3, oy - 2, 1, BH + 4);
    // Brass brackets on the corners.
    const bracket = (x: number, y: number, fx: number, fy: number) => {
      for (let k = 0; k < 8; k++) {
        fill(k < 2 ? 'gold4' : 'gold3', x + fx * k, y, 1, 1);
        fill(k < 2 ? 'gold4' : 'gold2', x, y + fy * k, 1, 1);
        fill('gold1', x + fx * k, y + fy, 1, 1);
        fill('gold1', x + fx, y + fy * k, 1, 1);
      }
      fill('cream', x + fx * 2, y + fy * 2, 1, 1);
      fill('gold1', x + fx * 3, y + fy * 3, 1, 1);
    };
    bracket(L + 1, Tp + 1, 1, 1);
    bracket(L + W2 - 2, Tp + 1, -1, 1);
    bracket(L + 1, Tp + H2 - 2, 1, -1);
    bracket(L + W2 - 2, Tp + H2 - 2, -1, -1);
    // Rivets between the cells along the long edges.
    for (let c = 2; c < this.w; c += 2) {
      const x = ox + c * T;
      fill('gold3', x - 1, Tp + 2, 2, 2);
      fill('gold4', x - 1, Tp + 2, 1, 1);
      fill('gold1', x, Tp + 3, 1, 1);
      fill('gold3', x - 1, Tp + H2 - 4, 2, 2);
      fill('gold4', x - 1, Tp + H2 - 4, 1, 1);
      fill('gold1', x, Tp + H2 - 3, 1, 1);
    }
  }

  private frameRect(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  /** Small gold chevrons on the sides of a tile where a swap is possible. */
  private drawArrows(ctx: Ctx2D, cell: number, ox: number, oy: number, swappable: (a: number, b: number) => boolean, t: number) {
    const { T } = this;
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
    const { T } = this;
    for (let c = 0; c < this.w; c++) {
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
    const { T } = this;
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
      // Paperwork (red tape) and ink blots: dead tiles that only a match next to them clears.
      const id = tile.tape && hasSprite('card_redtape') ? 'card_redtape' : 'tile_junk';
      ctx.fillStyle = hex('ink1');
      ctx.fillRect(x + inset, y + inset, w, w);
      this.icon(ctx, id, x + T / 2, y + T / 2);
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
      } else {
        // Every tile of a colour is the item held for it.
        const art = tile.kind === 'prism' ? undefined : this.gearArt[tile.kind];
        const id = art && hasSprite(art) ? art : `tile_${tile.kind}`;
        this.icon(ctx, id, x + T / 2, y + T / 2);
        this.drawMarks(ctx, tile, x + inset, y + inset, w, t);
      }
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

  /** Card icon: 18 px, doubled on big phone tiles (whole-number scale only). */
  private icon(ctx: Ctx2D, id: string, cx: number, cy: number) {
    const f = getFrame(id);
    const k = this.T >= 42 ? 2 : 1;
    if (k === 1) draw(ctx, f, Math.round(cx - f.w / 2 + f.ox), Math.round(cy - f.h / 2 + f.oy));
    else drawScaled(ctx, f, Math.round(cx - f.w + f.ox * 2), Math.round(cy - f.h + f.oy * 2), 2);
  }

  /** The upgrade plus of the colour's item and the department's stamp on a tile. */
  private drawMarks(ctx: Ctx2D, tile: Tile, x: number, y: number, w: number, t: number) {
    const px = (c: string, dx: number, dy: number, pw = 1, ph = 1) => {
      ctx.fillStyle = hex(c);
      ctx.fillRect(x + dx, y + dy, pw, ph);
    };
    if (tile.kind !== 'prism' && tile.kind !== 'junk' && this.gearUp[tile.kind]) {
      // A gold plus in the top-right corner.
      px('ink0', w - 7, 1, 5, 5);
      px('gold4', w - 6, 3, 3, 1);
      px('gold4', w - 5, 2, 1, 3);
    }
    if (tile.seal) {
      // A red stamp in the bottom-left corner, pulsing: its group is a super.
      px('ink0', 1, w - 7, 6, 6);
      px(Math.floor(t * 3) % 2 ? 'red3' : 'red4', 2, w - 6, 4, 4);
      px('red5', 3, w - 5, 2, 1);
    }
  }

  private drawSpecial(ctx: Ctx2D, tile: Tile, x: number, y: number, t: number) {
    const { T } = this;
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

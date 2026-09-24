import { hex } from './palette.ts';
import type { Light } from './lighting.ts';
import { Particles, rand } from './particles.ts';
import { ctx2d, draw, getFrame, hasSprite, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';

export const VW = 640;
export const VH = 360;
export const FLOOR_Y = 292;

type FxKind = 'office' | 'archive' | 'boiler' | 'directorate';

interface Prop {
  id: string;
  x: number;
  y: number;
  /** Cut the wall behind it so the sky shows through (windows, skylights). */
  window?: boolean;
  /** Animated frames cycling at fps (fire). */
  frames?: string[];
  fps?: number;
  front?: boolean;
  /** Frames follow this light's flicker (on / dim / off) instead of time. */
  light?: number;
}

interface Emitter {
  kind: 'sparks' | 'smoke' | 'steam' | 'drip' | 'dust' | 'mist' | 'embers';
  x: number;
  y: number;
  w: number;
  h: number;
  rate: number;
  acc: number;
}

export interface Look {
  fx: FxKind;
  ambient: string;
  sky: [string, string];
  wall: string;
  wainscot?: string;
  floor: string;
  props: Prop[];
  lights: Omit<Light, 'seed'>[];
  emitters: Omit<Emitter, 'acc'>[];
  rain: { outside: number; inside: number; skylight?: [number, number]; wind: number };
  lightning: number;
  water?: number;
  city?: string;
  /** Bottom line of the city skyline behind the windows. */
  cityY?: number;
}

// ── Floor looks ──────────────────────────────────────────────────────

const OFFICE: Look = {
  fx: 'office',
  ambient: '#2a3160',
  sky: ['#0a0e22', '#1b2750'],
  wall: 'of_wall',
  wainscot: 'of_wainscot',
  floor: 'of_floor',
  city: 'of_city',
  cityY: 116,
  props: [
    { id: 'of_window', x: 104, y: 52, window: true },
    { id: 'of_window', x: 536, y: 52, window: true },
    { id: 'of_tube', x: 120, y: 6, frames: ['idle0', 'dim', 'off'], light: 0 },
    { id: 'of_tube', x: 320, y: 6, frames: ['idle0', 'dim', 'off'], light: 1 },
    { id: 'of_tube', x: 520, y: 6, frames: ['idle0', 'dim', 'off'], light: 2 },
    { id: 'of_clock', x: 320, y: 40 },
    { id: 'of_board', x: 196, y: 134 },
    { id: 'of_cabinet', x: 214, y: FLOOR_Y },
    { id: 'of_cabinet', x: 426, y: FLOOR_Y },
    { id: 'of_desk', x: 72, y: FLOOR_Y },
    { id: 'of_lamp', x: 86, y: FLOOR_Y - 25 },
    { id: 'of_papers', x: 56, y: FLOOR_Y - 25 },
    { id: 'of_chair', x: 122, y: FLOOR_Y },
    { id: 'of_plant', x: 250, y: FLOOR_Y },
    { id: 'of_cooler', x: 396, y: FLOOR_Y },
    { id: 'of_desk', x: 572, y: FLOOR_Y },
    { id: 'of_lamp', x: 558, y: FLOOR_Y - 25 },
    { id: 'of_board', x: 560, y: 150 },
  ],
  lights: [
    { x: 120, y: 18, r: 120, color: '#9fb4ff', intensity: 0.55, flicker: 'fluor', squash: 0.8 },
    { x: 320, y: 18, r: 150, color: '#b8c8ff', intensity: 0.6, flicker: 'fluor', squash: 0.8 },
    { x: 520, y: 18, r: 120, color: '#9fb4ff', intensity: 0.55, flicker: 'fluor', squash: 0.8 },
    { x: 86, y: FLOOR_Y - 36, r: 90, color: '#ffb35c', intensity: 1, flicker: 'lantern' },
    { x: 558, y: FLOOR_Y - 36, r: 90, color: '#ffb35c', intensity: 1, flicker: 'lantern' },
    { x: 104, y: 84, r: 64, color: '#5b8cff', intensity: 0.55, flicker: 'none' },
    { x: 536, y: 84, r: 64, color: '#5b8cff', intensity: 0.55, flicker: 'none' },
    { x: 320, y: 190, r: 140, color: '#ffcf8a', intensity: 0.42, flicker: 'lantern' },
  ],
  emitters: [
    { kind: 'dust', x: 20, y: 200, w: 90, h: 80, rate: 2 },
    { kind: 'dust', x: 560, y: 200, w: 80, h: 80, rate: 2 },
  ],
  rain: { outside: 1, inside: 0, wind: 30 },
  lightning: 0.03,
};

const ARCHIVE: Look = {
  fx: 'archive',
  ambient: '#1a3a48',
  sky: ['#071419', '#123644'],
  wall: 'ar_wall',
  floor: 'ar_floor',
  props: [
    { id: 'ar_skylight', x: 320, y: 0, window: true },
    { id: 'ar_shelf', x: 62, y: FLOOR_Y },
    { id: 'ar_shelf', x: 578, y: FLOOR_Y },
    { id: 'ar_ladder', x: 106, y: FLOOR_Y },
    { id: 'ar_boxes', x: 256, y: FLOOR_Y },
    { id: 'ar_boxes', x: 390, y: FLOOR_Y },
    { id: 'ar_pipe_h', x: 0, y: 46 },
    { id: 'ar_pipe_h', x: 32, y: 46 },
    { id: 'ar_pipe_h', x: 64, y: 46 },
    { id: 'ar_pipe_h', x: 96, y: 46 },
    { id: 'ar_pipe_v', x: 128, y: 46 },
    { id: 'ar_pipe_v', x: 128, y: 78 },
    { id: 'ar_pipe_h', x: 512, y: 46 },
    { id: 'ar_pipe_h', x: 544, y: 46 },
    { id: 'ar_pipe_h', x: 576, y: 46 },
    { id: 'ar_pipe_h', x: 608, y: 46 },
    { id: 'ar_lantern', x: 180, y: 58, frames: ['idle0', 'idle1'], fps: 3 },
    { id: 'ar_lantern', x: 460, y: 58, frames: ['idle1', 'idle0'], fps: 3 },
    { id: 'ar_crate', x: 580, y: FLOOR_Y + 8, front: true },
  ],
  lights: [
    { x: 180, y: 70, r: 110, color: '#ffab55', intensity: 1, flicker: 'lantern' },
    { x: 460, y: 70, r: 110, color: '#ffab55', intensity: 1, flicker: 'lantern' },
    { x: 320, y: 40, r: 150, color: '#6fd6c8', intensity: 0.55, flicker: 'none', squash: 1.4 },
    { x: 320, y: FLOOR_Y + 20, r: 150, color: '#3aa89c', intensity: 0.35, flicker: 'pulse', squash: 0.3 },
  ],
  emitters: [
    { kind: 'mist', x: 0, y: FLOOR_Y - 26, w: 640, h: 30, rate: 1.4 },
    { kind: 'drip', x: 20, y: 55, w: 100, h: 1, rate: 0.9 },
    { kind: 'drip', x: 520, y: 55, w: 110, h: 1, rate: 0.9 },
  ],
  rain: { outside: 0.6, inside: 1, skylight: [262, 378], wind: 18 },
  lightning: 0.05,
  water: FLOOR_Y + 6,
};

const BOILER: Look = {
  fx: 'boiler',
  ambient: '#3a1e1a',
  sky: ['#120606', '#2a0e08'],
  wall: 'bo_wall',
  floor: 'bo_floor',
  props: [
    // Flues rise from the furnaces to the ceiling.
    ...[10, 42, 74, 106, 138, 170, 202].flatMap((y) => [
      { id: 'bo_pipe_v', x: 65, y },
      { id: 'bo_pipe_v', x: 565, y },
    ]),
    { id: 'bo_furnace', x: 70, y: FLOOR_Y },
    { id: 'bo_fire', x: 70, y: FLOOR_Y - 14, frames: ['f0', 'f1', 'f2', 'f3'], fps: 10 },
    { id: 'bo_furnace', x: 570, y: FLOOR_Y },
    { id: 'bo_fire', x: 570, y: FLOOR_Y - 14, frames: ['f1', 'f2', 'f3', 'f0'], fps: 10 },
    ...[128, 160, 192, 416, 448, 480].map((x) => ({ id: 'bo_pipe_h', x, y: 30 })),
    { id: 'bo_valve', x: 176, y: 44 },
    { id: 'bo_tank', x: 216, y: FLOOR_Y },
    { id: 'bo_gauge', x: 216, y: 250 },
    { id: 'bo_coal', x: 448, y: FLOOR_Y },
    { id: 'bo_chain', x: 150, y: 0 },
    { id: 'bo_hook', x: 150, y: 44 },
    { id: 'bo_chain', x: 500, y: 0 },
    { id: 'bo_chain', x: 500, y: 44 },
    { id: 'bo_hook', x: 500, y: 88 },
    { id: 'bo_vent', x: 320, y: 48 },
  ],
  lights: [
    { x: 70, y: FLOOR_Y - 20, r: 150, color: '#ff7a2a', intensity: 1.15, flicker: 'fire' },
    { x: 570, y: FLOOR_Y - 20, r: 150, color: '#ff7a2a', intensity: 1.15, flicker: 'fire' },
    { x: 320, y: 170, r: 150, color: '#ff9a4a', intensity: 0.45, flicker: 'fire' },
    { x: 448, y: FLOOR_Y - 8, r: 50, color: '#ff5a20', intensity: 0.75, flicker: 'candle' },
    { x: 320, y: 40, r: 90, color: '#6a86c8', intensity: 0.4, flicker: 'none' },
  ],
  emitters: [
    { kind: 'sparks', x: 58, y: FLOOR_Y - 28, w: 24, h: 6, rate: 16 },
    { kind: 'sparks', x: 558, y: FLOOR_Y - 28, w: 24, h: 6, rate: 16 },
    { kind: 'embers', x: 0, y: FLOOR_Y - 4, w: 640, h: 4, rate: 3 },
    { kind: 'embers', x: 426, y: FLOOR_Y - 12, w: 44, h: 6, rate: 2 },
    { kind: 'smoke', x: 40, y: FLOOR_Y - 70, w: 60, h: 10, rate: 2.2 },
    { kind: 'smoke', x: 540, y: FLOOR_Y - 70, w: 60, h: 10, rate: 2.2 },
    { kind: 'steam', x: 312, y: 50, w: 16, h: 2, rate: 3 },
    { kind: 'smoke', x: 0, y: 20, w: 640, h: 60, rate: 0.8 },
  ],
  rain: { outside: 0, inside: 0, wind: 0 },
  lightning: 0,
};

const DIRECTORATE: Look = {
  fx: 'directorate',
  ambient: '#2e3154',
  sky: ['#05060f', '#1d2342'],
  wall: 'di_wall',
  floor: 'di_floor',
  city: 'di_city',
  cityY: 150,
  props: [
    { id: 'di_window', x: 110, y: 150, window: true },
    { id: 'di_window', x: 530, y: 150, window: true },
    { id: 'di_chandelier', x: 320, y: 0 },
    { id: 'di_portrait', x: 320, y: 88 },
    { id: 'di_bookcase', x: 214, y: FLOOR_Y },
    { id: 'di_bookcase', x: 426, y: FLOOR_Y },
    { id: 'di_plant', x: 56, y: FLOOR_Y },
    { id: 'di_plant', x: 584, y: FLOOR_Y },
    { id: 'di_desk', x: 110, y: FLOOR_Y + 16, front: true },
    { id: 'di_lamp', x: 80, y: FLOOR_Y - 7, front: true },
  ],
  lights: [
    { x: 320, y: 16, r: 160, color: '#ffc27a', intensity: 0.9, flicker: 'candle' },
    { x: 80, y: FLOOR_Y - 16, r: 80, color: '#b6ff9a', intensity: 0.6, flicker: 'lantern' },
    { x: 110, y: 100, r: 90, color: '#6d8cff', intensity: 0.5, flicker: 'none' },
    { x: 530, y: 100, r: 90, color: '#6d8cff', intensity: 0.5, flicker: 'none' },
    { x: 320, y: 200, r: 150, color: '#ffcf8a', intensity: 0.35, flicker: 'lantern' },
  ],
  emitters: [
    { kind: 'dust', x: 250, y: 60, w: 140, h: 120, rate: 2 },
  ],
  rain: { outside: 1.4, inside: 0, wind: 60 },
  lightning: 0.12,
};

export const LOOKS: Record<FxKind, Look> = {
  office: OFFICE,
  archive: ARCHIVE,
  boiler: BOILER,
  directorate: DIRECTORATE,
};

// ── Fallback drawing when a sprite is not ready ──────────────────────

function tile(ctx: Ctx2D, id: string, x0: number, y0: number, w: number, h: number, fallback: string) {
  if (hasSprite(id)) {
    const f = getFrame(id);
    for (let y = y0; y < y0 + h; y += f.h) for (let x = x0; x < x0 + w; x += f.w) ctx.drawImage(f.canvas as CanvasImageSource, x, y);
  } else {
    ctx.fillStyle = hex(fallback);
    ctx.fillRect(x0, y0, w, h);
  }
}

// ── Room scene ───────────────────────────────────────────────────────

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
  layer: 0 | 1;
}

export class RoomScene {
  look: Look;
  layer: Canvas;
  front: Canvas;
  lights: Light[];
  emitters: Emitter[];
  animated: Prop[];
  windows: { x: number; y: number; w: number; h: number }[] = [];
  drops: Drop[] = [];
  bolt: { t: number; pts: [number, number][] } | null = null;
  time = 0;
  nextLightning = 4;
  lightningFlash = 0;
  variant: number;

  constructor(fx: FxKind, variant: number, kind: string) {
    this.look = LOOKS[fx];
    this.variant = variant;
    this.layer = makeCanvas(VW, VH);
    this.front = makeCanvas(VW, VH);
    this.lights = this.look.lights.map((l, i) => ({ ...l, seed: i * 1.7 + variant }));
    this.emitters = this.look.emitters.map((e) => ({ ...e, acc: Math.random() }));
    this.animated = [];
    this.build(kind);
    const n = Math.round(160 * Math.max(this.look.rain.outside, this.look.rain.inside));
    for (let i = 0; i < n; i++) this.drops.push(this.newDrop(true));
  }

  private build(kind: string) {
    const L = this.look;
    const ctx = ctx2d(this.layer);
    tile(ctx, L.wall, 0, 0, VW, FLOOR_Y, 'ink3');
    if (L.wainscot) tile(ctx, L.wainscot, 0, FLOOR_Y - 24, VW, 24, 'wood2');
    tile(ctx, L.floor, 0, FLOOR_Y, VW, VH - FLOOR_Y, 'ink2');
    // Floor edge shadow.
    ctx.fillStyle = 'rgba(7,7,15,0.55)';
    ctx.fillRect(0, FLOOR_Y, VW, 3);
    const fctx = ctx2d(this.front);
    const skip = new Set<number>();
    // Variant: drop a couple of optional props for variety.
    L.props.forEach((p, i) => {
      if (!p.window && !p.frames && i % 5 === (this.variant % 5) && this.variant > 1) skip.add(i);
    });
    L.props.forEach((p, i) => {
      if (skip.has(i)) return;
      if (p.frames) {
        this.animated.push(p);
        return;
      }
      const target = p.front ? fctx : ctx;
      if (!hasSprite(p.id)) {
        if (p.window) {
          const w = p.id.includes('sky') ? 100 : p.id.startsWith('di_') ? 120 : 72;
          const h = p.id.includes('sky') ? 26 : p.id.startsWith('di_') ? 92 : 60;
          const x = p.x - w / 2;
          const y = p.y - h;
          ctx.clearRect(x, y, w, h);
          this.windows.push({ x, y, w, h });
          ctx.fillStyle = hex('wood1');
          ctx.fillRect(x, y, w, 3);
          ctx.fillRect(x, y + h - 3, w, 3);
          ctx.fillRect(x, y, 3, h);
          ctx.fillRect(x + w - 3, y, 3, h);
          ctx.fillRect(x + w / 2 - 1, y, 2, h);
        }
        return;
      }
      const f = getFrame(p.id);
      const x = Math.round(p.x - f.ox);
      const y = Math.round(p.y - f.oy);
      if (p.window) {
        ctx.clearRect(x, y, f.w, f.h);
        this.windows.push({ x, y, w: f.w, h: f.h });
      }
      target.drawImage(f.canvas as CanvasImageSource, x, y);
    });
    // Special rooms get a warm accent.
    if (kind === 'treasure') this.lights.push({ x: 320, y: 120, r: 120, color: '#ffd27a', intensity: 0.9, flicker: 'pulse', seed: 9 });
    if (kind === 'shop') this.lights.push({ x: 320, y: 230, r: 110, color: '#ffb35c', intensity: 0.9, flicker: 'lantern', seed: 5 });
    if (kind === 'boss') this.lights.push({ x: 520, y: 240, r: 120, color: '#ff3b3b', intensity: 0.45, flicker: 'pulse', seed: 3 });
    if (kind === 'secret') this.lights.push({ x: 320, y: 220, r: 130, color: '#c7a2ff', intensity: 0.8, flicker: 'pulse', seed: 7 });
    if (kind === 'deal') this.lights.push({ x: 320, y: 220, r: 140, color: '#ff2d4a', intensity: 0.8, flicker: 'fire', seed: 11 });
  }

  private newDrop(initial = false): Drop {
    const L = this.look.rain;
    const inside = L.inside > 0 && Math.random() < L.inside / (L.inside + L.outside + 0.001);
    const layer: 0 | 1 = inside ? 1 : 0;
    let x = rand(-40, VW + 40);
    if (inside && L.skylight) x = rand(L.skylight[0], L.skylight[1]);
    return {
      x,
      y: initial ? rand(-20, FLOOR_Y) : rand(-40, -4),
      v: layer ? rand(260, 340) : rand(170, 240),
      len: layer ? rand(5, 8) : rand(3, 6),
      layer,
    };
  }

  update(dt: number, ps: Particles, t: number) {
    this.time = t;
    const L = this.look;
    // Rain.
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += L.rain.wind * dt * (d.layer ? 0.4 : 1);
      const floor = d.layer ? (L.water ?? FLOOR_Y) : FLOOR_Y;
      if (d.y > floor) {
        if (d.layer && Math.random() < 0.5) {
          for (let k = 0; k < 2; k++)
            ps.spawn({
              x: d.x,
              y: floor - 1,
              vx: rand(-25, 25),
              vy: rand(-45, -20),
              ay: 220,
              max: 0.25,
              ramp: ['teal5', 'teal4'],
              layer: 'mid',
            });
          if (Math.random() < 0.15) ps.spawn({ x: d.x, y: floor + 2, len: 1, grow: 8, max: 0.5, kind: 'ring', ramp: ['teal4', 'teal3'], layer: 'mid' });
        }
        Object.assign(d, this.newDrop());
      }
    }
    // Lightning.
    if (L.lightning > 0) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = rand(3, 9) / (L.lightning * 10);
        this.lightningFlash = 1;
        const w = this.windows[Math.floor(Math.random() * this.windows.length)];
        if (w) {
          const pts: [number, number][] = [];
          let x = w.x + rand(8, w.w - 8);
          let y = w.y;
          while (y < w.y + w.h) {
            pts.push([x, y]);
            x += rand(-6, 6);
            y += rand(4, 9);
          }
          this.bolt = { t: 0.18, pts };
        }
      }
    }
    if (this.lightningFlash > 0) this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.2);
    if (this.bolt) {
      this.bolt.t -= dt;
      if (this.bolt.t <= 0) this.bolt = null;
    }
    // Emitters.
    for (const e of this.emitters) {
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.emit(e, ps);
      }
    }
  }

  private emit(e: Emitter, ps: Particles) {
    const x = e.x + Math.random() * e.w;
    const y = e.y + Math.random() * e.h;
    switch (e.kind) {
      case 'sparks':
        ps.spawn({
          x,
          y,
          vx: rand(-20, 20),
          vy: rand(-90, -40),
          ay: -10,
          drag: 0.6,
          wobble: rand(8, 22),
          max: rand(0.8, 1.8),
          ramp: ['cream', 'gold4', 'orange3', 'orange2', 'red2'],
          add: true,
          kind: Math.random() < 0.3 ? 'streak' : 'dot',
          len: 2,
          layer: 'mid',
        });
        break;
      case 'embers':
        ps.spawn({ x, y, vx: rand(-6, 6), vy: rand(-18, -6), wobble: 6, max: rand(1, 2.5), ramp: ['orange3', 'orange2', 'red2', 'red1'], add: true, layer: 'mid' });
        break;
      case 'smoke':
        ps.spawn({
          x,
          y,
          vx: rand(-4, 10),
          vy: rand(-14, -6),
          wobble: 4,
          max: rand(3, 6),
          kind: 'smoke',
          len: rand(6, 12),
          grow: rand(2, 5),
          ramp: ['grey1', 'grey0', 'ink3'],
          alpha: 0.35,
          layer: Math.random() < 0.5 ? 'back' : 'front',
        });
        break;
      case 'steam':
        ps.spawn({ x, y, vx: rand(-4, 4), vy: rand(-26, -14), max: rand(1, 2), kind: 'smoke', len: 3, grow: 6, ramp: ['grey4', 'grey3', 'grey2'], alpha: 0.35, layer: 'back' });
        break;
      case 'mist':
        ps.spawn({ x: rand(-30, VW), y, vx: rand(4, 10), vy: 0, max: rand(5, 9), kind: 'smoke', len: rand(10, 18), grow: 1, ramp: ['teal2', 'teal1', 'teal0'], alpha: 0.28, layer: Math.random() < 0.6 ? 'back' : 'front' });
        break;
      case 'drip':
        ps.spawn({
          x,
          y,
          vy: 20,
          ay: 420,
          max: 3,
          ramp: ['teal5'],
          layer: 'mid',
          floorY: this.look.water ?? FLOOR_Y,
          onFloor: (p) => {
            ps.spawn({ x: p.x, y: p.y + 1, len: 1, grow: 10, max: 0.5, kind: 'ring', ramp: ['teal5', 'teal4', 'teal3'], layer: 'mid' });
          },
        });
        break;
      case 'dust':
        ps.spawn({ x, y, vx: rand(-3, 3), vy: rand(-3, 3), wobble: 2, max: rand(3, 6), ramp: ['cream', 'gold4', 'gold3'], add: true, alpha: 0.6, layer: 'mid' });
        break;
    }
  }

  /** Sky behind the windows: gradient, city, far rain, lightning bolt. */
  drawSky(ctx: Ctx2D) {
    const L = this.look;
    const g = (ctx as CanvasRenderingContext2D).createLinearGradient(0, 0, 0, FLOOR_Y);
    g.addColorStop(0, L.sky[0]);
    g.addColorStop(1, L.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, FLOOR_Y);
    // Stepped bands keep the gradient pixel-art friendly.
    for (let y = 0; y < FLOOR_Y; y += 24) {
      ctx.fillStyle = 'rgba(7,7,15,0.08)';
      ctx.fillRect(0, y, VW, 12);
    }
    if (L.city && hasSprite(L.city)) {
      const f = getFrame(L.city, Math.floor(this.time * 0.8) % 2 ? 'idle1' : 'idle0');
      const y = (L.cityY ?? 120) - f.h;
      for (let x = -((this.time * 2) % f.w); x < VW; x += f.w) ctx.drawImage(f.canvas as CanvasImageSource, Math.round(x), y);
    }
    if (this.bolt) {
      ctx.fillStyle = hex('cold6');
      for (let k = 1; k < this.bolt.pts.length; k++) {
        const [x0, y0] = this.bolt.pts[k - 1];
        const [x1, y1] = this.bolt.pts[k];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let s = 0; s <= n; s++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), 1, 1);
      }
    }
    // Far rain behind glass.
    ctx.fillStyle = hex('cold4');
    ctx.globalAlpha = 0.45;
    for (const d of this.drops)
      if (d.layer === 0) for (let k = 0; k < d.len; k++) ctx.fillRect(Math.round(d.x - k * 0.15), Math.round(d.y - k), 1, 1);
    ctx.globalAlpha = 1;
  }

  drawLayer(ctx: Ctx2D) {
    ctx.drawImage(this.layer as CanvasImageSource, 0, 0);
  }

  /** Streaks on the glass, drawn over the room layer but clipped to windows. */
  drawGlass(ctx: Ctx2D) {
    if (!this.look.rain.outside) return;
    for (const w of this.windows) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
      ctx.clip();
      ctx.fillStyle = hex('cold5');
      ctx.globalAlpha = 0.35;
      for (let k = 0; k < 7; k++) {
        const sx = w.x + ((k * 37 + this.variant * 11) % w.w);
        const sy = w.y + ((this.time * (14 + k * 3) + k * 23) % (w.h + 20)) - 10;
        for (let j = 0; j < 5; j++) ctx.fillRect(Math.round(sx + Math.sin(j + k) * 0.6), Math.round(sy - j), 1, 1);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  drawAnimated(ctx: Ctx2D, t: number) {
    for (const p of this.animated) {
      const frames = p.frames!;
      let name = frames[Math.floor(t * (p.fps ?? 8)) % frames.length];
      if (p.light !== undefined) {
        const k = this.lights[p.light]?.current ?? 1;
        name = k < 0.35 ? frames[2] : k < 0.9 ? frames[1] : frames[0];
      }
      if (hasSprite(p.id)) draw(ctx, getFrame(p.id, name), p.x, p.y);
      else {
        ctx.fillStyle = hex(Math.floor(t * 10) % 2 ? 'orange3' : 'gold4');
        ctx.fillRect(p.x - 8, p.y - 10, 16, 10);
      }
    }
  }

  /** Rain falling inside the room (archive skylight) and water surface. */
  drawInside(ctx: Ctx2D) {
    const L = this.look;
    if (L.water !== undefined) {
      ctx.fillStyle = hex('teal1');
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, L.water, VW, VH - L.water);
      ctx.globalAlpha = 1;
      if (hasSprite('ar_waterline')) {
        const f = getFrame('ar_waterline', `idle${Math.floor(this.time * 4) % 4}`);
        for (let x = 0; x < VW; x += f.w) ctx.drawImage(f.canvas as CanvasImageSource, x, L.water - 2);
      } else {
        ctx.fillStyle = hex('teal4');
        for (let x = 0; x < VW; x += 3) {
          const y = L.water + Math.round(Math.sin(x * 0.12 + this.time * 2.4) * 1.2);
          ctx.fillRect(x, y, 2, 1);
        }
      }
    }
    if (!L.rain.inside) return;
    ctx.fillStyle = hex('teal5');
    ctx.globalAlpha = 0.7;
    for (const d of this.drops)
      if (d.layer === 1) for (let k = 0; k < d.len; k++) ctx.fillRect(Math.round(d.x - k * 0.1), Math.round(d.y - k), 1, 1);
    ctx.globalAlpha = 1;
  }

  drawFront(ctx: Ctx2D) {
    ctx.drawImage(this.front as CanvasImageSource, 0, 0);
  }

  /** Glow halos for emissive props, added after lighting. */
  glows(): { x: number; y: number; r: number; color: string; k: number }[] {
    return this.lights.map((l) => ({ x: l.x, y: l.y, r: 6, color: l.color, k: (l.current ?? l.intensity) * 0.5 }));
  }
}

/** Vignette in two flat dark steps with checker seams (no screen-wide dither). */
let vignette: Canvas | null = null;
export function resetVignette() {
  vignette = null;
}
export function drawVignette(ctx: Ctx2D, strength = 1) {
  if (!vignette) {
    vignette = makeCanvas(VW, VH);
    const v = ctx2d(vignette);
    const img = v.createImageData(VW, VH);
    for (let y = 0; y < VH; y++)
      for (let x = 0; x < VW; x++) {
        const dx = (x - VW / 2) / (VW / 2);
        const dy = (y - VH / 2) / (VH / 2);
        const d = Math.max(0, Math.hypot(dx * 0.9, dy) - 0.74) * 2.6;
        // Steps at 1/3 and 2/3 of the fade; a one-pixel checker only right at each step.
        const v3 = d * 3;
        let level = Math.floor(v3);
        const frac = v3 - level;
        if (frac > 0.85 && ((x + y) & 1) === 0) level += 1;
        if (level <= 0) continue;
        const p = (y * VW + x) * 4;
        img.data[p] = 7;
        img.data[p + 1] = 7;
        img.data[p + 2] = 15;
        img.data[p + 3] = Math.min(3, level) * 55;
      }
    v.putImageData(img, 0, 0);
  }
  ctx.globalAlpha = strength;
  ctx.drawImage(vignette as CanvasImageSource, 0, 0);
  ctx.globalAlpha = 1;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const fadePatterns = new Map<string, Canvas>();

/** Ordered-dither fade: covers `k` (0..1) of the screen in `color`, pixel-art style. */
export function ditherFade(ctx: Ctx2D, k: number, color = 'ink0') {
  const level = Math.max(0, Math.min(16, Math.round(k * 16)));
  if (level === 0) return;
  if (level === 16) {
    ctx.fillStyle = hex(color);
    ctx.fillRect(0, 0, VW, VH);
    return;
  }
  const key = `${level}:${color}`;
  let tile = fadePatterns.get(key);
  if (!tile) {
    tile = makeCanvas(4, 4);
    const t = ctx2d(tile);
    t.fillStyle = hex(color);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAYER4[y][x] < level) t.fillRect(x, y, 1, 1);
    fadePatterns.set(key, tile);
  }
  const pattern = ctx.createPattern(tile as CanvasImageSource, 'repeat');
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, VW, VH);
}

/** Red dithered edge pulse for low health. */
let redVignette: Canvas | null = null;
export function drawDanger(ctx: Ctx2D, k: number) {
  if (k <= 0) return;
  if (!redVignette) {
    redVignette = makeCanvas(VW, VH);
    const v = ctx2d(redVignette);
    const img = v.createImageData(VW, VH);
    for (let y = 0; y < VH; y++)
      for (let x = 0; x < VW; x++) {
        const dx = Math.min(x, VW - 1 - x) / 70;
        const dy = Math.min(y, VH - 1 - y) / 50;
        const d = 1 - Math.min(1, Math.min(dx, dy));
        if (d * d * 16 > BAYER4[y & 3][x & 3] + 0.5) {
          const p = (y * VW + x) * 4;
          img.data[p] = 168;
          img.data[p + 1] = 38;
          img.data[p + 2] = 58;
          img.data[p + 3] = 255;
        }
      }
    v.putImageData(img, 0, 0);
  }
  ctx.globalAlpha = Math.min(0.55, k);
  ctx.drawImage(redVignette as CanvasImageSource, 0, 0);
  ctx.globalAlpha = 1;
}

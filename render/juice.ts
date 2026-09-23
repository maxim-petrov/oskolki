import { text } from './font.ts';
import { hex } from './palette.ts';
import { Particles, rand } from './particles.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';

/** Screen shake, flashes, hit-stop, floating text and projectiles. */
export interface FloatText {
  s: string;
  x: number;
  y: number;
  vy: number;
  t: number;
  max: number;
  color: string;
  outline: string;
  scale: number;
}

export interface Projectile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  arc: number;
  kind: 'streak' | 'orb' | 'sprite';
  color: string;
  trail: string[];
  sprite?: string;
  size: number;
  onArrive?: () => void;
  done?: boolean;
}

export class Juice {
  trauma = 0;
  flashA = 0;
  flashColor = 'white';
  hitstop = 0;
  texts: FloatText[] = [];
  shots: Projectile[] = [];
  shakeScale = 1;

  constructor(public ps: Particles) {}

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  flash(color: string, a: number) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }

  stop(seconds: number) {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  float(s: string, x: number, y: number, color = 'white', opts: Partial<FloatText> = {}) {
    this.texts.push({ s, x, y, vy: -26, t: 0, max: 0.9, color, outline: 'ink0', scale: 1, ...opts });
  }

  shoot(p: Omit<Projectile, 't' | 'trail' | 'size' | 'arc' | 'kind'> & Partial<Projectile>) {
    this.shots.push({ t: 0, trail: [p.color], size: 2, arc: 30, kind: 'orb', ...p });
  }

  offset(): [number, number] {
    const k = this.trauma * this.trauma * this.shakeScale;
    if (k < 0.01) return [0, 0];
    return [Math.round((Math.random() * 2 - 1) * 7 * k), Math.round((Math.random() * 2 - 1) * 5 * k)];
  }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flashA = Math.max(0, this.flashA - dt * 3.5);
    this.hitstop = Math.max(0, this.hitstop - dt);
    for (const f of this.texts) {
      f.t += dt;
      f.y += f.vy * dt;
      f.vy *= 0.92;
    }
    this.texts = this.texts.filter((f) => f.t < f.max);
    for (const s of this.shots) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const [x, y] = this.pos(s, k);
      if (Math.random() < 0.9)
        this.ps.spawn({
          x,
          y,
          vx: rand(-8, 8),
          vy: rand(-8, 8),
          max: 0.25,
          ramp: s.trail,
          add: true,
          layer: 'ui',
          size: 1,
        });
      if (k >= 1 && !s.done) {
        s.done = true;
        s.onArrive?.();
      }
    }
    this.shots = this.shots.filter((s) => !s.done);
  }

  pos(s: Projectile, k: number): [number, number] {
    const e = k * k * (3 - 2 * k);
    const x = s.x0 + (s.x1 - s.x0) * e;
    const y = s.y0 + (s.y1 - s.y0) * e - Math.sin(k * Math.PI) * s.arc;
    return [x, y];
  }

  drawShots(ctx: Ctx2D) {
    for (const s of this.shots) {
      const k = Math.min(1, s.t / s.dur);
      const [x, y] = this.pos(s, k);
      if (s.kind === 'sprite' && s.sprite) draw(ctx, getFrame(s.sprite), x, y);
      else {
        ctx.fillStyle = hex(s.color);
        ctx.fillRect(Math.round(x - s.size / 2), Math.round(y - s.size / 2), s.size, s.size);
        ctx.fillStyle = hex('white');
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  drawTexts(ctx: Ctx2D) {
    for (const f of this.texts) {
      const a = f.t > f.max * 0.6 ? 1 - (f.t - f.max * 0.6) / (f.max * 0.4) : 1;
      text(ctx, f.s, f.x, f.y, f.color, { align: 'center', outline: f.outline, scale: f.scale, alpha: a });
    }
  }

  drawFlash(ctx: Ctx2D, w: number, h: number) {
    if (this.flashA <= 0.01) return;
    ctx.globalAlpha = Math.min(0.8, this.flashA);
    ctx.fillStyle = hex(this.flashColor);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

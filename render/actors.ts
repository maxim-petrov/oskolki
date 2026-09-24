import { currentIntent } from '../game/combat.ts';
import { ENEMIES, INTENT_TEXT } from '../game/content/enemies.ts';
import type { EnemyState, Intent } from '../game/types.ts';
import { text } from './font.ts';
import { hex } from './palette.ts';
import { draw, frameNames, getFrame, hasSprite, silhouette, type Ctx2D, type Frame } from './sprite.ts';
import { FLOOR_Y } from './scene.ts';

export const HERO_X = 176;

/** Enemies drawn hovering above the floor: they bob gently. */
const HOVER = new Set(['moth', 'shard']);

type HeroState = 'idle' | 'windup' | 'attack' | 'hurt' | 'block' | 'hold' | 'walk' | 'dead';

/** Frame with a fallback chain: new art may not have every pose yet. */
function frameOf(id: string, ...names: string[]): Frame {
  const have = frameNames(id);
  for (const n of names) if (have.includes(n)) return getFrame(id, n);
  return getFrame(id, 'idle0');
}

export class HeroView {
  x = HERO_X;
  y = FLOOR_Y;
  offX = 0;
  offY = 0;
  state: HeroState = 'idle';
  stateT = 0;
  flash = 0;
  flashColor = 'red4';
  holdItem: string | null = null;
  char = 'intern';
  alpha = 1;
  walkFrom = 0;

  set(state: HeroView['state'], dur = 0.3) {
    this.state = state;
    this.stateT = dur;
  }

  update(dt: number) {
    if (this.stateT > 0 && this.state !== 'dead') {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.state = 'idle';
        this.holdItem = null;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.offX += (0 - this.offX) * Math.min(1, dt * 10);
    this.offY += (0 - this.offY) * Math.min(1, dt * 10);
  }

  frame(t: number): Frame {
    const id = `hero_${this.char}`;
    switch (this.state) {
      case 'windup':
        return frameOf(id, 'windup', 'attack');
      case 'attack':
        return frameOf(id, 'attack');
      case 'hurt':
      case 'dead':
        return frameOf(id, 'hurt');
      case 'block':
        return frameOf(id, 'block', 'idle0');
      case 'hold':
        if (!frameNames(id).includes('hold') && hasSprite(`hero_${this.char}_hold`)) return getFrame(`hero_${this.char}_hold`);
        return frameOf(id, 'hold');
      case 'walk': {
        const k = Math.floor(t * 9) % 4;
        return frameNames(id).includes('walk0') ? getFrame(id, `walk${k}`) : getFrame(id, k % 2 ? 'idle0' : 'idle1');
      }
      default:
        return getFrame(id, Math.floor(t * 1.6) % 2 ? 'idle1' : 'idle0');
    }
  }

  draw(ctx: Ctx2D, t: number) {
    const f = this.frame(t);
    const x = Math.round(this.x + this.offX);
    const y = Math.round(this.y + this.offY);
    // Contact shadow.
    ctx.fillStyle = 'rgba(7,7,15,0.45)';
    ctx.fillRect(x - 11, y, 22, 2);
    ctx.fillRect(x - 8, y + 2, 16, 1);
    if (this.state === 'dead') {
      ctx.globalAlpha = this.alpha;
      draw(ctx, f, x, y + 2);
      ctx.globalAlpha = 1;
      return;
    }
    draw(ctx, f, x, y, this.alpha);
    if (this.flash > 0) draw(ctx, silhouette(f, this.flashColor), x, y, this.flash);
    if (this.state === 'hold' && this.holdItem) {
      const icon = getFrame(`item_${this.holdItem}`);
      draw(ctx, icon, x, y - f.oy - 2 + Math.round(Math.sin(t * 6)));
    }
  }

  /** Chest height, where enemy shots land. */
  chest(): [number, number] {
    return [Math.round(this.x + this.offX + 4), this.y - 26];
  }
}

export class EnemyView {
  uid: number;
  def: string;
  x: number;
  y = FLOOR_Y;
  tx: number;
  hp: number;
  maxHp: number;
  block = 0;
  offX = 0;
  offY = 0;
  flash = 0;
  flashColor = 'white';
  hurtT = 0;
  attackT = 0;
  /** Anticipation pose before an action. */
  windT = 0;
  /** Glow building up during the wind-up (0..1). */
  charge = 0;
  alpha = 0;
  dying = 0;
  intent: Intent;
  countdown: number;
  phase = 0;
  bleed = 0;
  burn = 0;
  stunned = false;
  submerged = false;
  shining = false;
  seed = Math.random() * 10;
  /** This enemy is acting now: spotlight, raised intent bubble, caption. */
  acting = false;
  /** Another enemy is acting: this one steps back into the dark. */
  dim = 0;
  dimTarget = 0;
  caption = '';
  captionT = 0;
  /** The timer just reached "next move": the bubble blinks. */
  alertT = 0;

  constructor(e: EnemyState, x: number) {
    this.uid = e.uid;
    this.def = e.def;
    this.x = x;
    this.tx = x;
    this.hp = e.hp;
    this.maxHp = e.maxHp;
    this.intent = currentIntent(e);
    this.countdown = e.countdown;
    this.sync(e);
  }

  sync(e: EnemyState) {
    this.hp = Math.max(0, e.hp);
    this.maxHp = e.maxHp;
    this.block = e.block;
    this.intent = currentIntent(e);
    this.countdown = e.countdown;
    this.phase = e.phase;
    this.bleed = e.bleed;
    this.burn = e.burnTurns;
    this.stunned = e.stunned;
    this.submerged = e.submerged;
    this.shining = e.shining;
  }

  get size() {
    return ENEMIES[this.def]?.size ?? 'M';
  }

  update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 5);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.windT = Math.max(0, this.windT - dt);
    this.captionT = Math.max(0, this.captionT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    if (this.windT <= 0) this.charge = Math.max(0, this.charge - dt * 4);
    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 8);
    this.offX += (0 - this.offX) * Math.min(1, dt * 9);
    this.offY += ((this.submerged ? 10 : 0) - this.offY) * Math.min(1, dt * 6);
    this.x += (this.tx - this.x) * Math.min(1, dt * 6);
    if (this.dying > 0) this.dying += dt;
    else this.alpha = Math.min(1, this.alpha + dt * 3);
  }

  frame(t: number): Frame {
    const names = frameNames(this.def);
    if (this.submerged && names.includes('sub')) return getFrame(this.def, 'sub');
    if (this.shining && names.includes('shine')) return getFrame(this.def, 'shine');
    if (this.hurtT > 0) return getFrame(this.def, 'hurt');
    if (this.attackT > 0) return getFrame(this.def, 'attack');
    if (this.windT > 0) return frameOf(this.def, 'windup', 'idle1');
    const beat = Math.floor(t * 1.8 + this.seed) % 2;
    if (this.phase > 0 && names.includes('phase2')) return getFrame(this.def, beat && names.includes('phase2b') ? 'phase2b' : 'phase2');
    return getFrame(this.def, beat ? 'idle1' : 'idle0');
  }

  /** Top of the sprite on screen (for intents / bars). */
  top(t: number) {
    const f = this.frame(t);
    return Math.round(this.y + this.offY - f.oy);
  }

  /** Where this enemy's shots leave from: its upper front (it faces left). */
  muzzle(t: number): [number, number] {
    const f = this.frame(t);
    return [Math.round(this.x + this.offX - f.w * 0.3), Math.round(this.y + this.offY - f.h * 0.6)];
  }

  draw(ctx: Ctx2D, t: number, targeted: boolean) {
    if (this.dying > 0.6) return;
    const f = this.frame(t);
    const bob = this.acting
      ? 0
      : this.size === 'boss'
        ? Math.round(Math.sin(t * 1.3 + this.seed))
        : HOVER.has(this.def)
          ? Math.round(Math.sin(t * 3 + this.seed) * 1.5)
          : 0;
    const x = Math.round(this.x + this.offX);
    const y = Math.round(this.y + this.offY + bob);
    const alpha = this.dying > 0 ? Math.max(0, 1 - this.dying / 0.6) : this.alpha;
    ctx.fillStyle = 'rgba(7,7,15,0.45)';
    const sw = Math.min(64, Math.round(f.w * 0.7));
    ctx.fillRect(x - Math.round(sw / 2), this.y, sw, 2);
    ctx.fillRect(x - Math.round(sw / 2) + 3, this.y + 2, sw - 6, 1);
    const telegraph = this.countdown <= 1 && this.intentDamages() && this.dying === 0 && !this.acting;
    if (telegraph) {
      const k = 0.35 + Math.sin(t * 12) * 0.25;
      draw(ctx, silhouette(f, 'red3'), x - 1, y, k * alpha);
      draw(ctx, silhouette(f, 'red3'), x + 1, y, k * alpha);
    }
    if (targeted && this.dying === 0) {
      const k = 0.5 + Math.sin(t * 6) * 0.2;
      draw(ctx, silhouette(f, 'gold4'), x, y - 1, k * alpha);
    }
    draw(ctx, f, x, y, alpha);
    // Wind-up: the body heats up red before a blow, violet before a spell.
    if (this.charge > 0) draw(ctx, silhouette(f, this.intentDamages() ? 'red4' : 'vio5'), x, y, Math.min(0.7, this.charge) * (0.7 + Math.sin(t * 30) * 0.3) * alpha);
    if (this.flash > 0) draw(ctx, silhouette(f, this.flashColor), x, y, this.flash * alpha);
    if (this.dim > 0.02) draw(ctx, silhouette(f, 'ink1'), x, y, this.dim * 0.45 * alpha);
    if (this.dying > 0) draw(ctx, silhouette(f, 'white'), x, y, Math.max(0, 1 - this.dying * 3) * alpha);
  }

  intentDamages() {
    const k = this.intent.kind;
    return k === 'attack' || k === 'heavy' || k === 'strike';
  }

  drawUI(ctx: Ctx2D, t: number, targeted: boolean, dmg: number) {
    if (this.dying > 0) return;
    const top = this.top(t);
    const x = Math.round(this.x + this.offX);
    // HP bar under feet.
    const bw = this.size === 'boss' ? 72 : 36;
    const bx = x - bw / 2;
    const by = this.y + 6;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = hex('red0');
    ctx.fillRect(bx, by, bw, 4);
    const k = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = hex('red3');
    ctx.fillRect(bx, by, Math.round(bw * k), 4);
    ctx.fillStyle = hex('red5');
    ctx.fillRect(bx, by, Math.round(bw * k), 1);
    text(ctx, `${this.hp}`, x, by + 6, 'red5', { align: 'center', outline: 'ink0' });
    if (this.block > 0) {
      draw(ctx, getFrame('hud_armor'), bx - 12, by + 4);
      text(ctx, `${this.block}`, bx - 3, by, 'cold5', { outline: 'ink0', align: 'right' });
    }
    // Status pips.
    let sx = bx + bw + 3;
    if (this.bleed > 0) {
      text(ctx, `${this.bleed}`, sx, by - 2, 'red4', { outline: 'ink0' });
      sx += 8;
    }
    if (this.burn > 0) {
      draw(ctx, getFrame('tile_ember'), sx + 3, by + 8);
      sx += 8;
    }
    // Intent bubble: raised and framed while this enemy acts.
    const iy = top - 20 - (this.acting ? 3 : 0);
    const kind = this.intent.kind === 'stealCharge' || this.intent.kind === 'stealCoins' ? 'steal' : this.intent.kind;
    const icon = getFrame(`int_${kind}`);
    const label = dmg > 0 ? `${Math.floor(dmg / 2) || ''}${dmg % 2 ? '½' : ''}` : this.intent.kind === 'ink' || this.intent.kind === 'pin' || this.intent.kind === 'censor' || this.intent.kind === 'ember' ? `×${this.intent.value}` : '';
    const w = 14 + (label ? label.length * 5 + 2 : 0);
    const danger = this.countdown <= 1;
    const bxI = x - Math.round(w / 2);
    const blink = this.alertT > 0 && Math.floor(this.alertT * 12) % 2 === 0;
    ctx.fillStyle = hex(this.acting ? 'cream' : blink ? 'white' : 'ink0');
    ctx.fillRect(bxI - 1, iy - 1, w + 2, 15);
    ctx.fillStyle = hex(this.acting ? (this.intentDamages() ? 'red2' : 'vio2') : danger && this.intentDamages() ? 'red1' : 'ink2');
    ctx.fillRect(bxI, iy, w, 13);
    draw(ctx, icon, bxI + 1 + icon.ox, iy + 1 + icon.oy);
    if (label) text(ctx, label, bxI + 14, iy + 3, danger || this.acting ? 'cream' : 'cold6', { outline: 'ink0' });
    // Countdown pips: one per move left; the last one blinks red.
    const n = Math.max(0, Math.min(6, this.countdown));
    for (let p = 0; p < n; p++) {
      ctx.fillStyle = hex(p === 0 && danger ? (Math.floor(t * 8) % 2 ? 'red4' : 'gold4') : 'cold4');
      ctx.fillRect(x - n * 2 + p * 4, iy + 15, 3, 2);
    }
    if (danger && this.intentDamages() && !this.acting) text(ctx, '!', bxI + w + 3, iy + 2, Math.floor(t * 6) % 2 ? 'red4' : 'gold4', { outline: 'ink0' });
    if (this.stunned) text(ctx, 'z z', x, iy - 10, 'gold4', { align: 'center', outline: 'ink0' });
    if (this.captionT > 0 && this.caption) {
      const a = Math.min(1, this.captionT * 4);
      text(ctx, this.caption, x, iy - 12, this.intentDamages() ? 'red5' : 'vio5', { align: 'center', outline: 'ink0', alpha: a });
    } else if (targeted) {
      const b = Math.floor(t * 4) % 2;
      ctx.fillStyle = hex('gold4');
      ctx.fillRect(x - 3, iy - 7 - b, 7, 1);
      ctx.fillRect(x - 2, iy - 6 - b, 5, 1);
      ctx.fillRect(x - 1, iy - 5 - b, 3, 1);
      ctx.fillRect(x, iy - 4 - b, 1, 1);
    }
  }

  tooltip(dmg: number): { title: string; body: string } {
    const def = ENEMIES[this.def];
    const i = this.intent;
    const what = INTENT_TEXT[i.kind] ?? i.kind;
    const whole = Math.floor(dmg / 2);
    const hearts = `${whole || ''}${dmg % 2 ? '½' : ''}`;
    const detail =
      i.kind === 'attack' || i.kind === 'heavy' || i.kind === 'strike'
        ? `${what}: ${hearts} сердца`
        : `${what}${i.value > 1 ? ` ×${i.value}` : ''}`;
    return {
      title: def?.name ?? this.def,
      body: `${def?.blurb ?? ''}\nДальше: ${detail}, через ${this.countdown} ход(а).${def?.armor ? `\nБроня ${def.armor}.` : ''}`,
    };
  }
}

export function enemySlots(n: number, boss: boolean): number[] {
  if (boss && n === 1) return [528];
  if (boss) return [540, 444, 616].slice(0, n);
  if (n === 1) return [520];
  if (n === 2) return [480, 574];
  return [456, 530, 604].slice(0, n);
}

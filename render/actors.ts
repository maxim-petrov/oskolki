import { currentIntent } from '../game/combat.ts';
import { ENEMIES, INTENT_TEXT, MATERIAL_NAME } from '../game/content/enemies.ts';
import type { EnemyState, Intent } from '../game/types.ts';
import { text } from './font.ts';
import { hex } from './palette.ts';
import { draw, flipped as flippedFrame, frameNames, getFrame, hasSprite, silhouette, type Ctx2D, type Frame } from './sprite.ts';
import { STAGE_FEET } from './view.ts';

const FLOOR_Y = STAGE_FEET;

/** Where the hero stands on a stage of width w. */
export function heroX(w: number) {
  return Math.round(Math.max(40, Math.min(150, w * 0.2)));
}

/** Intent icons: new intents borrow the closest existing icon. */
const INTENT_ICON: Record<string, string> = { tape: 'int_ink', hurry: 'int_summon', stealCharge: 'int_steal', stealCoins: 'int_steal' };

/** Enemies drawn hovering above the floor: they bob gently. */
const HOVER = new Set(['moth', 'shard']);

type HeroState = 'idle' | 'windup' | 'attack' | 'hurt' | 'block' | 'hold' | 'walk' | 'dead' | 'pose';

/** Frame with a fallback chain: new art may not have every pose yet. */
function frameOf(id: string, ...names: string[]): Frame {
  const have = frameNames(id);
  for (const n of names) if (have.includes(n)) return getFrame(id, n);
  return getFrame(id, 'idle0');
}

export class HeroView {
  x = 130;
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
  /** Scripted frame for cutscenes (sit, sleep, carry…), used in the 'pose' state. */
  pose = 'idle0';
  /** Faces left (walking back through the office). */
  flip = false;

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
      case 'pose':
        return frameOf(id, this.pose, 'idle0');
      default:
        return getFrame(id, Math.floor(t * 1.6) % 2 ? 'idle1' : 'idle0');
    }
  }

  draw(ctx: Ctx2D, t: number, shadow = true) {
    let f = this.frame(t);
    if (this.flip) f = flippedFrame(f);
    const x = Math.round(this.x + this.offX);
    const y = Math.round(this.y + this.offY);
    // Contact shadow.
    if (shadow) {
      ctx.fillStyle = 'rgba(7,7,15,0.45)';
      ctx.fillRect(x - 16, y, 32, 2);
      ctx.fillRect(x - 12, y + 2, 24, 1);
    }
    if (this.state === 'dead') {
      ctx.globalAlpha = this.alpha;
      draw(ctx, f, x, y + 2);
      ctx.globalAlpha = 1;
      return;
    }
    draw(ctx, f, x, y, this.alpha);
    if (this.flash > 0) draw(ctx, silhouette(f, this.flashColor), x, y, this.flash);
    if (this.state === 'hold' && this.holdItem) {
      const icon = getFrame(this.holdItem.startsWith('item_') || this.holdItem.startsWith('card_') ? this.holdItem : `item_${this.holdItem}`);
      draw(ctx, icon, x, y - 88 + Math.round(Math.sin(t * 6)));
    }
  }

  /** Chest height, where enemy shots land. */
  chest(): [number, number] {
    return [Math.round(this.x + this.offX + 6), this.y - 54];
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
  /** HP before the last hits (the pale chunk of the bar) and how long it lingers. */
  chip = 0;
  chipHold = 0;

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
    // The pale chunk of the HP bar lingers, then drains down to the real value.
    if (this.chip > this.hp) {
      this.chipHold -= dt;
      if (this.chipHold <= 0) this.chip = Math.max(this.hp, this.chip - Math.max(1, this.maxHp * dt * 1.2));
    } else this.chip = this.hp;
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

  /** HP bar under the feet, intent bubble over the head. (ox, oy): stage origin on screen. */
  drawUI(ctx: Ctx2D, t: number, targeted: boolean, dmg: number, ox: number, oy: number, minY = 20) {
    if (this.dying > 0) return;
    const x = Math.round(ox + this.x + this.offX);
    const feet = oy + this.y;
    // HP bar under the feet (numbers, not hearts).
    const size = this.size;
    const bw = size === 'boss' ? 92 : size === 'L' ? 64 : size === 'M' ? 50 : 40;
    const bx = x - Math.round(bw / 2);
    const by = feet + 6;
    // A paper tag under the feet: the meter and the numbers, like the old branch's name plates.
    ctx.fillStyle = hex('grey1');
    ctx.fillRect(bx - 1, by - 1, bw + 4, 20);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(bx - 3, by - 3, bw + 6, 20);
    ctx.fillStyle = hex('paper');
    ctx.fillRect(bx - 2, by - 2, bw + 4, 18);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = hex('rose2');
    ctx.fillRect(bx, by, bw, 5);
    const k = Math.max(0, this.hp / this.maxHp);
    // The chunk just lost stays as a pale bar and drains after the hit.
    const kc = Math.max(k, Math.min(1, this.chip / this.maxHp));
    if (kc > k) {
      ctx.fillStyle = hex(Math.floor(t * 20) % 2 ? 'cream' : 'gold4');
      ctx.fillRect(bx + Math.round(bw * k), by, Math.round(bw * (kc - k)), 5);
    }
    ctx.fillStyle = hex('red2');
    ctx.fillRect(bx, by, Math.round(bw * k), 5);
    text(ctx, `${this.hp}/${this.maxHp}`, x, by + 6, 'ink0', { align: 'center', bold: true });
    if (this.block > 0) {
      draw(ctx, getFrame('ui_armor'), bx - 8, by + 3);
      text(ctx, `${this.block}`, bx - 14, by, 'cold2', { bold: true, align: 'right' });
    }
    // Status pips right of the bar.
    let sx = bx + bw + 3;
    if (this.bleed > 0) {
      text(ctx, `${this.bleed}`, sx + 2, by - 1, 'red2', { bold: true });
      sx += 9;
    }
    if (this.burn > 0) draw(ctx, getFrame('tile_ember'), sx + 3, by + 8);
    // Intent bubble: icon + number, raised while this enemy acts; never above minY.
    const top = oy + this.top(t);
    const iy = Math.max(minY, top - 18 - (this.acting ? 3 : 0));
    const kind = this.intent.kind;
    const icon = getFrame(hasSprite(`int_${kind}`) ? `int_${kind}` : (INTENT_ICON[kind] ?? 'int_attack'));
    const counts = kind === 'ink' || kind === 'pin' || kind === 'censor' || kind === 'ember' || kind === 'tape';
    const label = dmg > 0 ? `${dmg}` : counts ? `×${this.intent.value}` : '';
    const w = 14 + (label ? label.length * 5 + 3 : 0);
    const danger = this.countdown <= 1;
    const bxI = x - Math.round(w / 2);
    const blink = this.alertT > 0 && Math.floor(this.alertT * 12) % 2 === 0;
    ctx.fillStyle = hex('grey1');
    ctx.fillRect(bxI + 1, iy + 1, w + 2, 15);
    ctx.fillStyle = hex(blink ? 'red2' : 'ink0');
    ctx.fillRect(bxI - 1, iy - 1, w + 2, 15);
    ctx.fillStyle = hex(this.acting ? (this.intentDamages() ? 'rose2' : 'vio4') : danger && this.intentDamages() ? 'rose' : 'paper');
    ctx.fillRect(bxI, iy, w, 13);
    draw(ctx, icon, bxI + 1 + icon.ox, iy + 1 + icon.oy);
    if (label) text(ctx, label, bxI + 14, iy + 2, danger || this.acting ? 'red2' : 'ink0', { bold: true });
    // Countdown pips: one per move left; the last one blinks.
    const n = Math.max(0, Math.min(6, this.countdown));
    for (let p = 0; p < n; p++) {
      ctx.fillStyle = hex(p === 0 && danger ? (Math.floor(t * 8) % 2 ? 'red2' : 'ink0') : 'grey1');
      ctx.fillRect(x - n * 2 + p * 4, iy + 15, 3, 2);
    }
    if (danger && this.intentDamages() && !this.acting) text(ctx, '!', bxI + w + 4, iy + 2, Math.floor(t * 6) % 2 ? 'red2' : 'ink0', { bold: true });
    if (this.stunned) text(ctx, 'z z', x, iy - 10, 'ink0', { align: 'center', bold: true });
    if (this.captionT > 0 && this.caption) {
      const a = Math.min(1, this.captionT * 4);
      text(ctx, this.caption, x, Math.max(2, iy - 11), this.intentDamages() ? 'red5' : 'vio5', { align: 'center', outline: 'ink0', alpha: a });
    } else if (targeted) {
      const b = Math.floor(t * 4) % 2;
      ctx.fillStyle = hex('red2');
      const ty = Math.max(2, iy - 8);
      ctx.fillRect(x - 3, ty - b, 7, 1);
      ctx.fillRect(x - 2, ty + 1 - b, 5, 1);
      ctx.fillRect(x - 1, ty + 2 - b, 3, 1);
      ctx.fillRect(x, ty + 3 - b, 1, 1);
    }
  }

  tooltip(dmg: number): { title: string; body: string } {
    const def = ENEMIES[this.def];
    const i = this.intent;
    const what = INTENT_TEXT[i.kind] ?? i.kind;
    const detail = dmg > 0 ? `${what}: ${dmg} урона` : `${what}${i.value > 1 ? ` ×${i.value}` : ''}`;
    const mat = def ? MATERIAL_NAME[def.material] : '';
    return {
      title: def?.name ?? this.def,
      body: `${def?.blurb ?? ''}\nДальше: ${detail}, через ${this.countdown} ход(а).${def?.armor ? `\nБроня ${def.armor}.` : ''}${mat ? `\nМатериал: ${mat}.` : ''}`,
    };
  }
}

/** Enemy x positions (stage coordinates) for n enemies on a stage of width w. */
export function enemySlots(n: number, boss: boolean, w: number, hx: number): number[] {
  const left = Math.max(hx + 110, Math.round(w * 0.5));
  const right = w - (boss ? 70 : 44);
  const span = Math.max(0, right - left);
  if (n <= 1) return [Math.round(boss ? left + span * 0.6 : left + span * 0.5)];
  return Array.from({ length: n }, (_, k) => Math.round(left + (span * k) / (n - 1)));
}

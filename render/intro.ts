import { HeroView } from './actors.ts';
import type { App } from './app.ts';
import { bigText, measure, text, wrap } from './font.ts';
import { ditherFade } from './fx.ts';
import { hex } from './palette.ts';
import { Particles, rand } from './particles.ts';
import { saveProfile } from './profile.ts';
import { draw, frameNames, getFrame, hasSprite, type Ctx2D } from './sprite.ts';

import { HUB_SPOTS, HUB_W, Stage } from './stage.ts';
import { StageRenderer } from './stagedraw.ts';
import type { UI } from './ui.ts';
import { L, STAGE_FEET, STAGE_H } from './view.ts';

/** Coworkers at their cubicles in the opening (the same seats as in the office hub). */
const SEATED = [
  ['npc_girl', -12],
  ['npc_neighbor', 84],
  ['npc_sil_sit_a', 180],
  ['npc_analyst', 276],
] as const;

/**
 * The first shift's opening, played once (skippable): the intern types at his desk, the phone
 * sends him to the archive with a stack of papers, the light in the basement fails at the
 * switch, and when it comes back the papers have become a monster. The fight starts right there.
 */
type Beat = [number, () => void];

export class IntroView {
  office = new Stage('hub', false, HUB_W, 3);
  archive: Stage;
  stage: Stage;
  ps = new Particles();
  hero = new HeroView();
  r: StageRenderer | null = null;
  t = 0;
  fade = 1;
  fadeTo = 0;
  beats: Beat[] = [];
  next = 0;
  caption: { s: string; t: number } | null = null;
  bubble: { s: string; x: number; y: number; t: number } | null = null;
  walk: { to: number; speed: number; carry: boolean } | null = null;
  /** The stack on the archive floor, then the monster assembling from it. */
  stack: { x: number; frame: string } | null = null;
  flicker = false;
  /** He types until the phone rings. */
  typing = true;
  done = false;
  shake = 0;

  constructor(public app: App) {
    this.archive = new Stage('archive', true, Math.max(L.w, 640), 4);
    this.stage = this.office;
    this.hero.char = 'intern';
    this.hero.x = HUB_SPOTS.seat;
    this.hero.state = 'pose';
    this.hero.pose = 'sit0';
    this.office.cam = this.camFor(this.office, this.hero.x);
    app.audio.ambience('hub');
    const b = (at: number, fn: () => void) => this.beats.push([at, fn]);
    const au = app.audio;
    // ── The office ──
    b(0.4, () => this.say('Отдел сверки. 16:39.'));
    b(2.4, () => {
      au.play('phone');
      this.talk('Дзынь!', HUB_SPOTS.desk + 20, STAGE_FEET - 60);
      this.typing = false;
      this.hero.pose = 'sit0';
    });
    b(3.2, () => au.play('phone'));
    b(4.0, () => this.talk('Стажёр. Отнесите стопку в архив. Сейчас.', HUB_SPOTS.desk + 10, STAGE_FEET - 70));
    b(6.6, () => {
      // Up from the chair, the stack from the desk in his arms.
      this.hero.x = HUB_SPOTS.desk + 10;
      this.hero.pose = 'carry1';
    });
    b(7.2, () => (this.walk = { to: HUB_SPOTS.cubicles + 330, speed: 110, carry: true }));
    b(8.4, () => this.talk('Осторожно, не урони.', HUB_SPOTS.cubicles - 12, STAGE_FEET - 90));
    b(10.2, () => this.talk('В архив? Ну-ну.', HUB_SPOTS.cubicles + 276, STAGE_FEET - 90));
    b(11.4, () => (this.fadeTo = 1));
    b(12.0, () => {
      // ── The archive ──
      this.stage = this.archive;
      this.walk = null;
      this.hero.x = this.archive.propX.os_archive_door ?? 70;
      this.archive.cam = this.archiveCam();
      au.ambience('dark');
      au.play('door');
      this.fadeTo = 0;
      this.say('Архив. Минус первый этаж.');
      this.walk = { to: this.dropX(), speed: 80, carry: true };
    });
    b(15.0, () => {
      // He stops with the stack in his arms while the bulb stutters.
      this.flicker = true;
      au.play('flicker');
      this.hero.state = 'pose';
      this.hero.pose = 'carry1';
    });
    b(16.4, () => {
      this.hero.pose = 'kneel';
      this.stack = { x: this.hero.x + 20, frame: 'stack' };
      au.play('paper', 0.6);
    });
    b(17.2, () => {
      // Back to the switch by the door; he reaches it facing the door, the stack behind him.
      this.hero.state = 'idle';
      this.hero.flip = true;
      this.walk = { to: this.switchX() + 19, speed: 100, carry: false };
    });
    b(19.0, () => {
      this.walk = null;
      this.hero.x = this.switchX() + 19;
      this.hero.state = 'pose';
      this.hero.pose = 'reach';
      this.talk('Где тут свет…', this.hero.x, STAGE_FEET - 104);
    });
    b(20.0, () => {
      au.play('switch');
      this.flicker = false;
      this.archive.blackout = 1;
    });
    b(20.4, () => au.play('paper', 1.4));
    b(21.2, () => au.play('paper', 1));
    b(22.0, () => {
      // The light comes back: he looks over his shoulder, and the stack is standing up.
      this.archive.blackout = 0;
      au.play('flicker');
      this.hero.state = 'pose';
      this.hero.pose = 'look';
      if (this.stack) this.stack.frame = 'form0';
    });
    b(22.3, () => this.stack && (this.stack.frame = 'form1'));
    b(22.6, () => this.stack && (this.stack.frame = 'form2'));
    b(22.9, () => {
      if (this.stack) this.stack.frame = 'form3';
      au.play('phase');
      this.shake = 0.6;
    });
    b(23.3, () => this.stack && (this.stack.frame = 'idle0'));
    b(23.6, () => {
      this.hero.flip = false;
      this.hero.pose = 'grab';
      au.play('item');
      this.say('Канцелярский нож. Бумага его боится.');
    });
    b(25.4, () => {
      au.play('door');
      this.shake = 0.3;
      this.say('Дверь за спиной захлопнулась.');
    });
    b(27.2, () => this.finish());
  }

  /** The wall switch by the archive door (world x). */
  switchX() {
    return this.archive.propX.os_switch ?? 128;
  }

  /** Where he puts the stack down: far enough from the switch, close enough to share one screen with it. */
  dropX() {
    return this.switchX() + 19 + Math.round(Math.max(80, Math.min(160, L.w * 0.25)));
  }

  /** The archive camera holds still: the door and the switch at the left edge, the stack in view. */
  archiveCam() {
    return Math.round(Math.max(0, Math.min(this.archive.worldW - L.w, this.switchX() - 60)));
  }

  camFor(stage: Stage, x: number) {
    return Math.round(Math.max(0, Math.min(stage.worldW - L.w, x - L.w * 0.4)));
  }

  say(s: string) {
    this.caption = { s, t: 2.6 };
  }

  talk(s: string, x: number, y: number) {
    this.bubble = { s, x, y, t: 2.4 };
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.app.profile.introDone = true;
    saveProfile(this.app.profile);
    this.app.startShift('intern', undefined, true);
  }

  pointerDown() {}

  key(k: string) {
    if (k === 'Escape' || k === 'Enter') this.finish();
  }

  update(dt: number) {
    this.t += dt;
    while (this.next < this.beats.length && this.beats[this.next][0] <= this.t) this.beats[this.next++][1]();
    this.stage.update(dt, this.ps);
    this.ps.update(dt);
    this.hero.update(dt);
    this.fade += (this.fadeTo - this.fade) * Math.min(1, dt * 4);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    if (this.caption) {
      this.caption.t -= dt;
      if (this.caption.t <= 0) this.caption = null;
    }
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    // Scripted walking (with the stack or without).
    const w = this.walk;
    if (w) {
      const d = w.to - this.hero.x;
      if (Math.abs(d) < 2) {
        // Arrived: with the stack he stays holding it.
        this.walk = null;
        if (w.carry) this.hero.pose = 'carry1';
        else this.hero.state = 'idle';
      } else {
        this.hero.x += Math.sign(d) * Math.min(Math.abs(d), w.speed * dt);
        if (w.carry) {
          this.hero.state = 'pose';
          this.hero.pose = `carry${Math.floor(this.t * 9) % 4}`;
        } else this.hero.state = 'walk';
        if (Math.floor(this.t * 4.5) !== Math.floor((this.t - dt) * 4.5)) this.app.audio.play('step');
      }
    } else if (this.stage === this.office && this.typing && this.hero.state === 'pose' && this.hero.pose.startsWith('sit')) {
      this.hero.pose = Math.floor(this.t * 3) % 4 === 0 ? 'sit1' : 'sit0';
      if (Math.random() < dt * 2) this.app.audio.play('keys');
    }
    if (this.stage === this.office) this.office.cam += (this.camFor(this.office, this.hero.x) - this.office.cam) * Math.min(1, dt * 4);
    // The bulb stutters before it dies.
    if (this.flicker) this.archive.blackout = Math.random() < 0.25 ? 0.85 : Math.random() < 0.3 ? 0.4 : 0;
    // In the dark, the sheets stir.
    if (this.stage === this.archive && this.archive.blackout >= 1 && this.stack && Math.random() < dt * 30)
      this.ps.spawn({ x: this.stack.x + rand(-30, 30), y: STAGE_FEET - rand(0, 80), vx: rand(-40, 40), vy: rand(-30, 10), wobble: 20, max: 0.8, ramp: ['grey2', 'grey1'], kind: 'shard', size: 2, layer: 'mid' });
  }

  draw(ctx: Ctx2D, ui: UI) {
    if (!this.r || this.r.w !== L.w) this.r = new StageRenderer(L.w);
    const t = this.t;
    const cam = Math.round(this.stage.cam);
    const sy = L.mode === 'wide' ? Math.round((L.h - STAGE_H) / 2) - 10 : L.top.h + 40;
    this.r.render(
      this.stage,
      t,
      this.ps,
      (b) => {
        const st = this.stack;
        if (st && this.stage === this.archive) {
          if (st.frame === 'stack') draw(b, getFrame('os_reams'), st.x - cam, STAGE_FEET);
          else if (hasSprite('kipa') && frameNames('kipa').includes(st.frame)) draw(b, getFrame('kipa', st.frame), st.x + 40 - cam, STAGE_FEET);
        }
        if (this.stage === this.office)
          for (const [id, dx] of SEATED) {
            if (!hasSprite(id)) continue;
            const nx = HUB_SPOTS.cubicles + dx;
            const near = Math.abs(nx - this.hero.x) < 70;
            draw(b, getFrame(id, near ? 'look' : Math.floor(t * 2.2 + dx) % 2 ? 'sit1' : 'sit0'), nx - cam, STAGE_FEET);
          }
        const x = this.hero.x;
        this.hero.x = x - cam;
        this.hero.draw(b, t);
        this.hero.x = x;
      },
      [{ x: this.hero.x, y: STAGE_FEET - 50, r: 60, color: '#ffe0b8', intensity: 0.35, flicker: 'none', seed: 1 }],
    );
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, L.h);
    const sh = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake * 8) : 0;
    this.r.blit(ctx, sh, sy);
    // Letterbox bars: this is a scene, not play.
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, Math.max(0, sy - 2));
    ctx.fillRect(0, sy + STAGE_H + 2, L.w, L.h - sy - STAGE_H - 2);
    if (this.bubble) this.drawBubble(ctx, this.bubble.s, this.bubble.x - cam, sy + this.bubble.y);
    if (this.caption) {
      const a = Math.min(1, this.caption.t * 2, (2.6 - this.caption.t) * 3);
      const cy = sy + STAGE_H + 14;
      text(ctx, this.caption.s, L.w / 2, Math.min(L.h - 14, cy), 'cream', { align: 'center', outline: 'ink0', alpha: a });
    }
    if (ui.button(ctx, 'intro-skip', L.w - 88, 4, 84, 16, 'Пропустить ▸', { accent: 'grey3' })) this.finish();
    if (this.t < 2) bigText(ctx, 'ЦЕЛЬНОСТЬ', L.w / 2, Math.max(8, sy - 26), 'paper', { align: 'center', raw: true, alpha: Math.min(1, this.t) * Math.min(1, 2 - this.t) });
    if (this.fade > 0.01) ditherFade(ctx, this.fade, L.w, L.h);
  }

  private drawBubble(ctx: Ctx2D, s: string, x: number, y: number) {
    const maxW = Math.min(160, L.w - 20);
    const lines = wrap(s, maxW - 10);
    const w = Math.min(maxW, Math.max(...lines.map((l) => measure(l))) + 10);
    const h = lines.length * 10 + 6;
    const bx = Math.round(Math.max(4, Math.min(L.w - w - 4, x - w / 2)));
    const by = Math.round(Math.max(4, y - h));
    ctx.fillStyle = hex('grey1');
    ctx.fillRect(bx + 1, by + 1, w + 2, h + 2);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = hex('cream');
    ctx.fillRect(bx, by, w, h);
    lines.forEach((l, k) => text(ctx, l, bx + 5, by + 3 + k * 10, 'ink1'));
  }
}

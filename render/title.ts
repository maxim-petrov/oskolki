import { HeroView } from './actors.ts';
import type { App } from './app.ts';
import { bigText, text } from './font.ts';
import { ditherFade } from './fx.ts';
import { hex } from './palette.ts';
import { Particles } from './particles.ts';
import { draw, frameNames, getFrame, hasSprite, type Ctx2D } from './sprite.ts';
import { HUB_SPOTS, HUB_W, Stage } from './stage.ts';
import { StageRenderer } from './stagedraw.ts';
import type { UI } from './ui.ts';
import { L, STAGE_FEET, STAGE_H } from './view.ts';

/**
 * Title: the bright open space, the intern typing at his desk under the logo. One tap starts:
 * the first time with the intro, later straight in the office.
 */
export class TitleView {
  stage = new Stage('hub', false, HUB_W, 1);
  ps = new Particles();
  hero = new HeroView();
  r: StageRenderer | null = null;
  t = 0;
  fade = 1;
  leaving = 0;
  private next: (() => void) | null = null;

  constructor(public app: App) {
    this.hero.x = HUB_SPOTS.desk - 64;
    this.hero.state = 'pose';
    this.hero.pose = 'sit0';
    this.hero.char = 'intern';
    app.audio.ambience('hub');
  }

  update(dt: number) {
    this.t += dt;
    this.stage.update(dt, this.ps);
    this.ps.update(dt);
    this.hero.pose = Math.floor(this.t * 3) % 4 === 0 ? 'sit1' : 'sit0';
    if (Math.random() < dt * 1.5) this.app.audio.play('keys');
    // The camera drifts along the office and settles on the desk.
    const target = HUB_SPOTS.desk - L.w * 0.45;
    this.stage.cam = Math.round(Math.max(0, Math.min(HUB_W - L.w, target + Math.sin(this.t * 0.15) * 40)));
    this.fade = Math.max(0, this.fade - dt * 1.5);
    if (this.leaving > 0) {
      this.leaving += dt;
      if (this.leaving > 0.6 && this.next) {
        const n = this.next;
        this.next = null;
        n();
      }
    }
  }

  private go(fn: () => void) {
    if (this.leaving) return;
    this.app.audio.unlock();
    this.app.audio.play('select');
    this.leaving = 0.001;
    this.next = fn;
  }

  start() {
    const p = this.app.profile;
    if (!p.introDone) this.go(() => this.app.startIntro());
    else this.go(() => this.app.toHub('enter'));
  }

  key(k: string) {
    if (k === 'Enter' || k === ' ') this.start();
    if ((k === 'c' || k === 'с') && this.app.hasSave()) this.go(() => this.app.continueRun());
  }

  draw(ctx: Ctx2D, ui: UI) {
    if (!this.r || this.r.w !== L.w) this.r = new StageRenderer(L.w);
    const t = this.t;
    const stageY = L.mode === 'wide' ? L.h - STAGE_H - 30 : Math.round(L.h * 0.34);
    this.r.render(this.stage, t, this.ps, (b) => {
      const x = this.hero.x;
      this.hero.x = x - this.stage.cam;
      this.hero.draw(b, t, false);
      this.hero.x = x;
    }, [{ x: HUB_SPOTS.desk - 40, y: STAGE_FEET - 50, r: 80, color: '#ffe0b0', intensity: 0.5, flicker: 'none', seed: 1 }]);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, L.h);
    this.r.blit(ctx, 0, stageY);
    // Logo.
    const ly = L.mode === 'wide' ? 64 : Math.round(stageY * 0.5) + 10;
    if (hasSprite('logo')) {
      const cycle = t % 4.5;
      const sweep = cycle < 0.6 ? Math.floor((cycle / 0.6) * 5) : -1;
      const names = frameNames('logo');
      draw(ctx, getFrame('logo', sweep >= 0 && names.includes(`glint${sweep}`) ? `glint${sweep}` : 'idle0'), Math.round(L.w / 2), ly);
    } else bigText(ctx, 'ОСКОЛКИ', L.w / 2, ly - 20, 'gold4', { align: 'center' });
    text(ctx, 'рогалик из бесконечного офиса', L.w / 2, ly + 6, 'cold5', { align: 'center', outline: 'ink0' });
    // Buttons.
    const bw = Math.min(160, L.w - 40);
    const bx = Math.round((L.w - bw) / 2);
    let by = L.mode === 'wide' ? stageY + STAGE_H + 6 : stageY + STAGE_H + 16;
    if (L.mode === 'wide') by = ly + 20;
    const p = this.app.profile;
    const label = !p.introDone ? 'Начать' : 'В офис';
    if (ui.button(ctx, 'start', bx, by, bw, 20, label, { accent: 'gold3' })) this.start();
    by += 24;
    if (this.app.hasSave()) {
      if (ui.button(ctx, 'continue', bx, by, bw, 18, 'Продолжить смену')) this.go(() => this.app.continueRun());
      by += 22;
    }
    const half = Math.floor((bw - 4) / 2);
    if (ui.button(ctx, 'sound', bx, by, half, 16, this.app.audio.muted ? 'Звук: нет' : 'Звук: да')) {
      this.app.audio.toggleMute();
      p.settings.muted = this.app.audio.muted;
    }
    if (ui.button(ctx, 'fs', bx + half + 4, by, half, 16, 'Экран')) this.app.toggleFullscreen();
    if (p.runs > 0) text(ctx, `Смен: ${p.runs} · осколков: ${p.shards}`, L.w / 2, L.h - 12, 'cold3', { align: 'center', outline: 'ink0' });
    else if (!L.touch) text(ctx, 'Enter — начать · F — полный экран · F2 — свет', L.w / 2, L.h - 12, 'cold2', { align: 'center' });
    if (this.fade > 0) ditherFade(ctx, this.fade, L.w, L.h);
    if (this.leaving > 0) ditherFade(ctx, Math.min(1, this.leaving / 0.5), L.w, L.h);
  }
}

import { HeroView } from './actors.ts';
import type { App } from './app.ts';
import { display, text } from './font.ts';
import { ditherFade } from './fx.ts';
import { hex } from './palette.ts';
import { Particles } from './particles.ts';
import type { Ctx2D } from './sprite.ts';
import { HUB_SPOTS, HUB_W, Stage } from './stage.ts';
import { StageRenderer } from './stagedraw.ts';
import { panel, type UI } from './ui.ts';
import { L, STAGE_H } from './view.ts';

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
    this.hero.x = HUB_SPOTS.seat;
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
    const target = HUB_SPOTS.desk - L.w * (L.mode === 'wide' ? 0.62 : 0.45);
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
    const wide = L.mode === 'wide';
    const stageY = wide ? L.h - STAGE_H - 26 : Math.round(L.h * 0.07);
    this.r.render(this.stage, t, this.ps, (b) => {
      const x = this.hero.x;
      this.hero.x = x - this.stage.cam;
      this.hero.draw(b, t, false);
      this.hero.x = x;
    });
    ctx.fillStyle = hex('page');
    ctx.fillRect(0, 0, L.w, L.h);
    this.r.blit(ctx, 0, stageY);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, stageY - 1, L.w, 1);
    ctx.fillRect(0, stageY + STAGE_H, L.w, 1);
    // The personnel file: a paper card with the title and the buttons (the old branch's start page).
    const p = this.app.profile;
    const save = this.app.hasSave();
    const cw = wide ? 204 : Math.min(L.w - 24, 250);
    const cx = wide ? 26 : Math.round((L.w - cw) / 2);
    const cy = wide ? 22 : stageY + STAGE_H + 14;
    const rows = 3 + (save ? 1 : 0);
    const ch = 118 + rows * 24 + 18;
    panel(ctx, cx, cy, cw, ch, { fill: 'paper', raw: true, shadow: 3 });
    const px = cx + 14;
    text(ctx, `ЛИЧНОЕ ДЕЛО № ${String(Math.max(1, p.runs + 1)).padStart(4, '0')}`, px, cy + 12, 'grey1', { bold: true });
    display(ctx, 'Осколки', px - 1, cy + 26, 30, 'ink0');
    text(ctx, 'рогалик из бесконечного офиса', px, cy + 62, 'ink1');
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(px, cy + 78, 22, 2);
    text(ctx, p.runs > 0 ? 'Рабочий день опять не закончился.' : 'Рабочий день ещё не закончился.', px, cy + 88, 'ink1');
    const label = !p.introDone ? 'Приступить к работе' : 'Вернуться в офис';
    const sound = this.app.audio.muted ? 'Звук: нет' : 'Звук: да';
    const bw = cw - 28;
    let by = cy + 108;
    if (ui.button(ctx, 'start', px, by, bw, 19, `${label}  →`, { accent: 'gold3' })) this.start();
    by += 24;
    if (save) {
      if (ui.button(ctx, 'continue', px, by, bw, 19, 'Продолжить смену')) this.go(() => this.app.continueRun());
      by += 24;
    }
    const half = Math.floor((bw - 5) / 2);
    if (ui.button(ctx, 'sound', px, by, half, 19, sound)) {
      this.app.audio.toggleMute();
      p.settings.muted = this.app.audio.muted;
    }
    if (ui.button(ctx, 'fs', px + half + 5, by, bw - half - 5, 19, 'Экран')) this.app.toggleFullscreen();
    by += 28;
    text(ctx, p.runs > 0 ? `Смен: ${p.runs} · осколков: ${p.shards}` : 'Понедельник · 16:39', px, by, 'grey1');
    if (!L.touch && wide) text(ctx, 'Enter — начать · F — полный экран', L.w - 10, L.h - 12, 'ink1', { align: 'right' });
    if (this.fade > 0) ditherFade(ctx, this.fade, L.w, L.h);
    if (this.leaving > 0) ditherFade(ctx, Math.min(1, this.leaving / 0.5), L.w, L.h);
  }
}

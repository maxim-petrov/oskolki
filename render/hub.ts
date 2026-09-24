import { CHARACTERS } from '../game/content/acts.ts';
import type { CharId } from '../game/types.ts';
import { HeroView } from './actors.ts';
import type { App } from './app.ts';
import { bigText, measure, paragraph, text, wrap } from './font.ts';
import { ditherFade } from './fx.ts';
import { hex } from './palette.ts';
import { Particles } from './particles.ts';
import { REQUESTS, buyRequest, officeState } from './profile.ts';
import { draw, flipped, frameNames, getFrame, hasSprite, type Ctx2D } from './sprite.ts';
import { HUB_SPOTS, HUB_W, Stage } from './stage.ts';
import { StageRenderer } from './stagedraw.ts';
import { panel, type UI } from './ui.ts';
import { L, STAGE_FEET, STAGE_H } from './view.ts';

/**
 * The office between shifts. The intern walks along the open space: coworkers type and
 * grumble, the board of requests takes shards of memory, his desk keeps the files, the heavy
 * archive door at the far end starts the next shift. The office changes as the story goes on.
 */
interface Npc {
  sprite: string;
  x: number;
  /** Nobody in the office has a name; silhouettes have no lines at all. */
  lines: string[];
  kind: 'sit' | 'stand' | 'mop' | 'shadow';
  say: { s: string; t: number } | null;
  cool: number;
  seed: number;
}

/** Faceless people walking the aisle behind the partitions. */
interface Walker {
  x: number;
  from: number;
  to: number;
  dir: 1 | -1;
  speed: number;
  pause: number;
}

interface Spot {
  id: 'elevator' | 'board' | 'desk' | 'cooler' | 'copier' | 'glass' | 'vending' | 'archive';
  x: number;
  label: string;
}

const SPEED = 78;

export class HubView {
  stage = new Stage('hub', false, HUB_W, 2);
  ps = new Particles();
  hero = new HeroView();
  r: StageRenderer | null = null;
  npcs: Npc[] = [];
  walkers: Walker[] = [];
  spots: Spot[];
  t = 0;
  fade = 1;
  wheel = 0;
  /** Where a click asked the hero to go (world x) and what to do there. */
  goal: { x: number; spot?: Spot } | null = null;
  keys = { left: false, right: false };
  overlay: null | 'board' | 'desk' = null;
  /** Wake-up at the desk after a shift: a short script before control returns. */
  script: { t: number; how: 'wake' | 'won' } | null = null;
  bubble: { s: string; t: number; x: number; y: number } | null = null;
  leaving = 0;
  noteRead = false;
  summary: { s: string; t: number } | null = null;

  constructor(
    public app: App,
    how: 'wake' | 'enter' | 'won',
  ) {
    const st = officeState(app.profile);
    this.hero.char = (app.profile.settings.char as CharId) ?? 'intern';
    this.spots = [
      { id: 'elevator', x: HUB_SPOTS.elevator, label: 'Лифт' },
      { id: 'board', x: HUB_SPOTS.board, label: 'Доска заявок' },
      { id: 'desk', x: HUB_SPOTS.desk - 30, label: 'Твой стол' },
      { id: 'cooler', x: HUB_SPOTS.cooler, label: 'Кулер' },
      { id: 'copier', x: HUB_SPOTS.copier, label: 'Копир' },
      { id: 'glass', x: HUB_SPOTS.glass, label: 'Кабинет начальницы' },
      { id: 'vending', x: HUB_SPOTS.vending, label: 'Автомат' },
      { id: 'archive', x: HUB_SPOTS.archive, label: this.app.hasSave() ? 'Архив: продолжить смену' : 'Дверь архива' },
    ];
    const npc = (sprite: string, x: number, lines: string[], kind: Npc['kind'] = 'sit') => {
      if (hasSprite(sprite)) this.npcs.push({ sprite, x, lines, kind, say: null, cool: 0, seed: x * 0.13 });
    };
    const a = HUB_SPOTS.cubicles;
    const b = HUB_SPOTS.cubiclesB;
    npc('npc_girl', a - 12, ['Привет. Ты сегодня {какой-то бледный|какая-то бледная}.', 'Опять {задержался|задержалась}? Я тоже.', 'Ты уже {был|была} в архиве? Мне кажется, {был|была}.', 'Кофе в кулере закончился. Как всегда.']);
    if (!st.neighbourGone) npc('npc_neighbor', a + 84, ['Мы знакомы?', 'Я тебя видел. Во сне, кажется.', 'Не заглядывай ко мне в монитор.', 'Скоро квартальный. Или уже был?']);
    npc('npc_sil_sit_a', a + 180, [], 'shadow');
    npc('npc_analyst', a + 276, ['Не мешай, у меня созвон.', 'Ты в архив? Ну-ну.', 'Графики опять смотрят на меня.', 'Шшш.']);
    npc('npc_sil_stand', HUB_SPOTS.cooler - 30, [], 'shadow');
    npc('npc_sil_copier', HUB_SPOTS.copier + 5, [], 'shadow');
    npc('npc_accountant', b - 12, ['Цифры не сходятся. Опять.', 'Цельность — это ты. Понимаешь? Ты.', 'Сдача после шестнадцати сорока.', 'Скрепки не трогай.']);
    npc('npc_sil_sit_b', b + 84, [], 'shadow');
    if (!st.supervisorGone) npc('npc_supervisor', HUB_SPOTS.glass - 60, ['Отчёт к 16:40.', 'Архив ждёт, {role}.', 'Улыбайтесь. Мы — одна команда.', 'Я запомню.'], 'stand');
    npc('npc_janitor', HUB_SPOTS.vending + 70, ['Осторожно, мокро.', 'Внизу опять бумага шуршит.', 'Я всё вижу. Всё.', 'Не ходи туда после шести.'], 'mop');
    if (hasSprite('npc_sil_walk')) {
      this.walkers.push({ x: 700, from: 520, to: 1330, dir: 1, speed: 22, pause: 0 });
      this.walkers.push({ x: 1500, from: 1150, to: 1760, dir: -1, speed: 17, pause: 1.5 });
    }
    // Start: at the desk.
    this.hero.x = HUB_SPOTS.seat;
    if (how === 'wake' || how === 'won') {
      this.script = { t: 0, how };
      this.hero.state = 'pose';
      this.hero.pose = 'sleep';
      app.audio.play('wake');
    } else {
      this.hero.x = HUB_SPOTS.desk + 20;
      this.hero.state = 'idle';
    }
    this.stage.cam = this.camFor(this.hero.x);
    app.audio.ambience('hub');
  }

  camFor(x: number) {
    return Math.round(Math.max(0, Math.min(HUB_W - L.w, x - L.w * 0.42)));
  }

  stageY() {
    return L.mode === 'wide' ? Math.max(L.top.h + 4, Math.round((L.h - STAGE_H) / 2) - 24) : Math.round(L.h * 0.22);
  }

  // ── Input ─────────────────────────────────────────────────────────

  pointerDown(x: number, y: number) {
    if (this.overlay || this.script || this.leaving) return;
    const sy = this.stageY();
    if (y < sy || y > sy + STAGE_H) return;
    const wx = x + this.stage.cam;
    // A click near an object walks there and uses it.
    const spot = this.spots.find((s) => Math.abs(s.x - wx) < 40);
    this.goal = { x: spot ? spot.x : wx, spot };
  }

  pointerUp() {}

  key(k: string) {
    if (k === 'Escape') {
      if (this.overlay) this.overlay = null;
      else this.app.toTitle();
      return;
    }
    if (this.overlay || this.script) return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф') this.keys.left = true;
    if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в') this.keys.right = true;
    if (k === 'e' || k === 'E' || k === 'у' || k === 'Enter' || k === ' ') {
      const s = this.nearSpot();
      if (s) this.use(s);
    }
  }

  keyUp(k: string) {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф') this.keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в') this.keys.right = false;
  }

  nearSpot(): Spot | undefined {
    return this.spots.find((s) => Math.abs(s.x - this.hero.x) < 34);
  }

  say(s: string, x: number, y = STAGE_FEET - 100, t = 2.4) {
    this.bubble = { s, t, x, y };
  }

  use(s: Spot) {
    const st = officeState(this.app.profile);
    this.goal = null;
    switch (s.id) {
      case 'board':
        this.overlay = 'board';
        this.noteRead = true;
        this.app.audio.play('paper');
        break;
      case 'desk':
        this.overlay = 'desk';
        this.app.audio.play('select');
        break;
      case 'archive':
        this.leaving = 0.001;
        this.app.audio.play('door');
        break;
      case 'elevator':
        this.say(st.elevatorOpen ? 'Двери открыты. Внутри темно и пахнет водой.' : 'Лифт не приходит. Табло показывает «Этаж: ваш».', s.x);
        break;
      case 'cooler':
        this.say('Вода тёплая. Как всегда.', s.x);
        break;
      case 'copier':
        this.say('Копир печатает пустые листы. Много пустых листов.', s.x);
        this.app.audio.play('paper');
        break;
      case 'glass':
        this.say(st.supervisorGone ? 'Кабинет пуст. На столе — твоя служебная записка.' : 'Жалюзи опущены. За ними кто-то пишет.', s.x);
        break;
      case 'vending':
        this.say('Автомат съел монету и ничего не дал.', s.x);
        break;
    }
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;
    this.stage.update(dt, this.ps);
    this.ps.update(dt);
    this.hero.update(dt);
    this.fade = Math.max(0, this.fade - dt * 1.2);
    if (this.summary) {
      this.summary.t -= dt;
      if (this.summary.t <= 0) this.summary = null;
    }
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    // Wake-up script.
    const sc = this.script;
    if (sc) {
      sc.t += dt;
      if (sc.t > 1.6 && this.hero.pose === 'sleep') {
        this.hero.pose = 'wake';
        this.say(this.line(sc.how === 'won' ? 'Отчёт… сдан? Я что, {уснул|уснула}?' : '…Опять {задремал|задремала}?'), this.hero.x + 10, STAGE_FEET - 96, 2.6);
      }
      if (sc.t > 3.6) {
        this.hero.state = 'idle';
        this.hero.x = HUB_SPOTS.desk + 20;
        this.script = null;
        // What is left of the shift: a line in the corner, like a stamp on a report.
        const last = this.app.profile.history[0];
        if (last) {
          const acts = ['Изнанка отдела', 'Затопленный архив', 'Котельная', 'Дирекция'];
          this.summary = {
            t: 6,
            s: last.won ? `Отчёт сдан. Осколков памяти: +${last.shards}` : `Смена оборвалась: ${acts[Math.min(last.act, 3)]}. Осколков памяти: +${last.shards}`,
          };
        }
        if (this.app.profile.deaths === 1 && !this.app.profile.notes.includes('first')) {
          this.app.profile.notes.push('first');
          this.say('На доске что-то новое.', this.hero.x, STAGE_FEET - 100, 2.6);
        }
      }
    } else if (!this.overlay && !this.leaving) this.walk(dt);
    // Coworkers grumble when the intern walks by.
    for (const n of this.npcs) {
      n.cool = Math.max(0, n.cool - dt);
      if (n.say) {
        n.say.t -= dt;
        if (n.say.t <= 0) n.say = null;
      }
      const someoneTalks = this.npcs.some((o) => o.say) || !!this.bubble;
      if (n.lines.length && this.present(n) && !this.script && !someoneTalks && n.cool <= 0 && Math.abs(n.x - this.hero.x) < 40) {
        n.say = { s: this.line(n.lines[Math.floor(Math.random() * n.lines.length)]), t: 2.2 };
        n.cool = 9 + Math.random() * 6;
        this.app.audio.play('enemy', 1.6);
      }
    }
    // Faceless colleagues walk the aisle, stop for a moment at the ends and turn back.
    for (const w of this.walkers) {
      if (w.pause > 0) {
        w.pause -= dt;
        continue;
      }
      w.x += w.dir * w.speed * dt;
      if ((w.dir > 0 && w.x >= w.to) || (w.dir < 0 && w.x <= w.from)) {
        w.dir = w.dir > 0 ? -1 : 1;
        w.pause = 1.5 + Math.random() * 2;
      }
    }
    // Camera follows the hero.
    const target = this.camFor(this.hero.x);
    this.stage.cam += (target - this.stage.cam) * Math.min(1, dt * 5);
    if (this.leaving > 0) {
      this.leaving += dt;
      if (this.leaving > 0.9) {
        this.leaving = -1;
        this.app.profile.settings.char = this.hero.char;
        if (!this.app.continueRun()) this.app.startShift(this.hero.char as CharId);
      }
    }
  }

  private walk(dt: number) {
    let dir = 0;
    if (this.keys.left) dir -= 1;
    if (this.keys.right) dir += 1;
    if (dir) this.goal = null;
    else if (this.goal) {
      const d = this.goal.x - this.hero.x;
      if (Math.abs(d) < 3) {
        const spot = this.goal.spot;
        this.goal = null;
        if (spot) this.use(spot);
      } else dir = Math.sign(d);
    }
    if (dir) {
      this.hero.x = Math.max(24, Math.min(HUB_W - 24, this.hero.x + dir * SPEED * dt));
      this.hero.state = 'walk';
      this.hero.flip = dir < 0;
      if (Math.floor(this.t * 4.5) !== Math.floor((this.t - dt) * 4.5)) this.app.audio.play('step');
    } else if (this.hero.state === 'walk') this.hero.state = 'idle';
  }

  // ── Draw ──────────────────────────────────────────────────────────

  draw(ctx: Ctx2D, ui: UI) {
    if (!this.r || this.r.w !== L.w) this.r = new StageRenderer(L.w);
    const t = this.t;
    const cam = Math.round(this.stage.cam);
    const sy = this.stageY();
    const behind = (b: Ctx2D) => {
      for (const w of this.walkers) {
        const x = Math.round(w.x - cam);
        if (x < -40 || x > L.w + 40) continue;
        // A step covers about 20 px: the cycle runs at speed/10 frames per second so feet don't slide.
        let f = getFrame('npc_sil_walk', w.pause > 0 ? 'walk0' : `walk${Math.floor(t * (w.speed / 10) + w.from) % 4}`);
        if (w.dir < 0) f = flipped(f);
        draw(b, f, x, STAGE_FEET - 2);
      }
    };
    this.r.render(this.stage, t, this.ps, (b) => {
      for (const n of this.npcs) this.drawNpc(b, n, n.x - cam);
      // At the desk the chair hides the sleeping hero's legs: he is drawn over the chair.
      const x = this.hero.x;
      this.hero.x = x - cam;
      this.hero.draw(b, t, this.hero.state !== 'pose');
      this.hero.x = x;
    }, [{ x: this.hero.x, y: STAGE_FEET - 50, r: 70, color: '#ffe0b8', intensity: 0.35, flicker: 'none', seed: 1 }], 0.8, behind);
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, L.h);
    this.r.blit(ctx, 0, sy);
    // Floor shadow under the stage.
    ctx.fillStyle = hex('ink1');
    ctx.fillRect(0, sy + STAGE_H, L.w, 2);
    // Speech bubbles.
    for (const n of this.npcs) if (n.say && n.x - cam > -10 && n.x - cam < L.w + 10) this.drawBubble(ctx, n.say.s, n.x - cam, sy + STAGE_FEET - 92);
    if (this.bubble && this.bubble.x - cam > -10 && this.bubble.x - cam < L.w + 10) this.drawBubble(ctx, this.bubble.s, this.bubble.x - cam, sy + this.bubble.y);
    // Prompt over the nearest thing.
    const near = !this.script && !this.overlay ? this.nearSpot() : undefined;
    if (near) {
      const px = Math.round(near.x - cam);
      const py = sy + 30;
      const label = `${L.touch ? '' : 'E — '}${near.label}`;
      const w = measure(label) + 10;
      panel(ctx, px - w / 2, py, w, 14, { border: 'gold3', fill: 'ink0' });
      text(ctx, label, px, py + 3, 'gold4', { align: 'center' });
      if (ui.area('hub-use', px - w / 2, py, w, 14)) this.use(near);
    }
    this.drawTop(ctx, ui);
    if (this.summary) {
      const a = Math.min(1, this.summary.t, (6 - this.summary.t) * 3);
      const w = Math.min(L.w - 16, measure(this.summary.s) + 16);
      const x = Math.round((L.w - w) / 2);
      const y = sy - 20 > L.top.h + 2 ? sy - 20 : sy + 4;
      ctx.globalAlpha = a;
      panel(ctx, x, y, w, 15, { border: 'vio3', fill: 'ink0', glow: 'vio4' });
      text(ctx, this.summary.s, L.w / 2, y + 3, 'vio5', { align: 'center', alpha: a });
      ctx.globalAlpha = 1;
    }
    this.drawControls(ctx, ui, sy);
    if (this.overlay === 'board') this.drawBoard(ctx, ui);
    if (this.overlay === 'desk') this.drawDesk(ctx, ui);
    if (this.fade > 0) ditherFade(ctx, this.fade, L.w, L.h);
    if (this.leaving > 0) ditherFade(ctx, Math.min(1, this.leaving / 0.8), L.w, L.h);
  }

  /** The coworker who is the current hero stays out of the office (the seat is empty). */
  private present(n: Npc) {
    return n.sprite !== `npc_${this.hero.char}`;
  }

  /** A line addressed to the hero: «{он|она}» picks the form, «{role}» is the hero's job. */
  private line(s: string) {
    const she = this.hero.char === 'janitor';
    const role = this.hero.char === 'janitor' ? 'уборщица' : this.hero.char === 'accountant' ? 'бухгалтер' : 'стажёр';
    return s.replace(/\{([^|}]*)\|([^}]*)\}/g, (_, m: string, f: string) => (she ? f : m)).replace('{role}', role);
  }

  private drawNpc(ctx: Ctx2D, n: Npc, x: number) {
    if (x < -80 || x > L.w + 80 || !this.present(n)) return;
    const names = frameNames(n.sprite);
    let frame = names[0];
    const beat = Math.floor(this.t * 2.2 + n.seed) % 2;
    const near = Math.abs(n.x - this.hero.x) < 70;
    if (n.kind === 'shadow') {
      if (names.includes('sit0')) frame = near && names.includes('look') ? 'look' : beat ? 'sit1' : 'sit0';
      else if (n.sprite === 'npc_sil_copier') frame = Math.floor(this.t * 1.6 + n.seed) % 3 === 0 ? 'idle1' : 'idle0';
      // The one with the mug takes a sip now and then.
      else frame = Math.floor(this.t * 0.5 + n.seed) % 5 === 0 ? 'idle1' : 'idle0';
    }
    else if (n.kind === 'sit') frame = n.say ? (names.includes('grumble') ? 'grumble' : names.includes('talk') ? 'talk' : 'look') : near ? 'look' : beat ? 'sit1' : 'sit0';
    else if (n.kind === 'mop') frame = n.say ? (names.includes('talk') ? 'talk' : 'look') : beat ? 'mop1' : 'mop0';
    else frame = n.say ? (names.includes('talk') ? 'talk' : 'look') : beat ? 'idle1' : 'idle0';
    let f = getFrame(n.sprite, frame);
    // Standing coworkers turn to face the intern (silhouettes keep to their business).
    if ((n.kind === 'stand' || n.kind === 'mop') && this.hero.x < n.x) f = flipped(f);
    draw(ctx, f, Math.round(x), STAGE_FEET);
  }

  private drawBubble(ctx: Ctx2D, s: string, x: number, y: number) {
    const maxW = Math.min(150, L.w - 20);
    const lines = wrap(s, maxW - 10);
    const w = Math.min(maxW, Math.max(...lines.map((l) => measure(l))) + 10);
    const h = lines.length * 10 + 6;
    const bx = Math.round(Math.max(4, Math.min(L.w - w - 4, x - w / 2)));
    const by = Math.round(Math.max(L.top.h + 2, y - h));
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = hex('cream');
    ctx.fillRect(bx, by, w, h);
    // Tail towards the speaker.
    const tx = Math.max(bx + 4, Math.min(bx + w - 6, Math.round(x)));
    ctx.fillStyle = hex('cream');
    ctx.fillRect(tx, by + h, 3, 2);
    ctx.fillRect(tx + 1, by + h + 2, 1, 2);
    lines.forEach((l, k) => text(ctx, l, bx + 5, by + 3 + k * 10, 'ink1'));
  }

  private drawTop(ctx: Ctx2D, ui: UI) {
    const p = this.app.profile;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, L.top.h);
    ctx.globalAlpha = 1;
    draw(ctx, getFrame('ui_shard'), 8, 8);
    text(ctx, `${p.shards}`, 16, 4, 'vio5', { outline: 'ink0' });
    text(ctx, `Смена ${p.runs + 1}`, 40, 4, 'cold4', { outline: 'ink0' });
    const label = 'Отдел сверки · 16:39';
    if (L.w > 280) text(ctx, label, L.w - 24, 4, 'cold3', { align: 'right', outline: 'ink0' });
    if (ui.area('hub-menu', L.w - 18, 0, 18, L.top.h)) this.app.toTitle();
    draw(ctx, getFrame('ui_pause'), L.w - 10, 8);
    if (officeState(p).note && !this.noteRead && Math.floor(this.t * 3) % 2 === 0) {
      // The board has something new: an exclamation over it (when in view).
      const bx = HUB_SPOTS.board - Math.round(this.stage.cam);
      if (bx > 0 && bx < L.w) text(ctx, '!', bx, this.stageY() + 50, 'red4', { outline: 'ink0', scale: 2 });
    }
  }

  /** Touch controls for phones: walk left/right and act, at the bottom where the thumbs are. */
  private drawControls(ctx: Ctx2D, ui: UI, sy: number) {
    if (L.mode === 'wide' && !L.touch) {
      text(ctx, 'A/D или ←/→ — идти · E — действие · клик — идти туда', L.w / 2, Math.min(L.h - 12, sy + STAGE_H + 14), 'cold3', { align: 'center' });
      return;
    }
    if (this.overlay || this.script) return;
    const bh = Math.min(52, Math.max(28, Math.round(L.h * 0.08)));
    const y = L.h - bh - 10;
    const bw = Math.round(L.w * 0.26);
    const hold = (x: number, dir: 'left' | 'right') => {
      const over = ui.over(x, y, bw, bh) && ui.p.down;
      this.keys[dir] = over;
      panel(ctx, x, y, bw, bh, { border: over ? 'gold3' : 'cold2', fill: over ? 'ink2' : 'ink1' });
      // A chunky pixel arrow.
      const cx = Math.round(x + bw / 2);
      const cy = Math.round(y + bh / 2);
      const s = dir === 'left' ? -1 : 1;
      ctx.fillStyle = hex(over ? 'gold4' : 'cream');
      for (let k = 0; k < 7; k++) ctx.fillRect(cx - s * 3 + s * k - (s < 0 ? 1 : 0), cy - (6 - k), 2, (6 - k) * 2 + 1);
    };
    hold(8, 'left');
    hold(L.w - 8 - bw, 'right');
    const near = this.nearSpot();
    const mx = 12 + bw;
    const mw = L.w - 2 * (12 + bw);
    if (ui.button(ctx, 'hub-act', mx, y, mw, bh, near ? near.label : '…', { accent: 'gold3', disabled: !near }) && near) this.use(near);
  }

  // ── Overlays ──────────────────────────────────────────────────────

  private frame(title: string) {
    const w = Math.min(L.w - 12, 420);
    const h = Math.min(L.h - L.top.h - 12, 320);
    const x = Math.round((L.w - w) / 2);
    const y = L.top.h + 6;
    return { x, y, w, h, title };
  }

  private drawBoard(ctx: Ctx2D, ui: UI) {
    const p = this.app.profile;
    const f = this.frame('ДОСКА ЗАЯВОК');
    // Cork board.
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(f.x - 1, f.y - 1, f.w + 2, f.h + 2);
    ctx.fillStyle = hex('wood2');
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = hex('wood3');
    for (let k = 0; k < 60; k++) ctx.fillRect(f.x + ((k * 37) % f.w), f.y + ((k * 53) % f.h), 1, 1);
    bigText(ctx, f.title, f.x + f.w / 2, f.y + 6, 'cream', { align: 'center' });
    draw(ctx, getFrame('ui_shard'), f.x + f.w - 40, f.y + 10);
    text(ctx, `${p.shards}`, f.x + f.w - 32, f.y + 6, 'vio5', { outline: 'ink0' });
    // Notes: story first, then requests as sticky notes.
    let y = f.y + 24;
    if (officeState(p).note) {
      const note = 'Записка твоим почерком: «Не ходи в архив после 16:40. Не бери нож. Бери нож».';
      const h = wrap(note, f.w - 20).length * 10 + 6;
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(f.x + 5, y - 1, f.w - 10, h + 2);
      ctx.fillStyle = hex('paper');
      ctx.fillRect(f.x + 6, y, f.w - 12, h);
      ctx.fillStyle = hex('red3');
      ctx.fillRect(f.x + f.w / 2 - 2, y - 3, 4, 4);
      paragraph(ctx, note, f.x + 10, y + 3, f.w - 20, 'red1');
      y += h + 6;
    }
    const visible = REQUESTS.filter((r) => !r.visible || r.visible(p));
    const cols = L.w >= 380 ? 2 : 1;
    const cw = Math.floor((f.w - 16 - (cols - 1) * 6) / cols);
    const ch = 38;
    visible.forEach((r, k) => {
      const cx = f.x + 8 + (k % cols) * (cw + 6);
      const cy = y + Math.floor(k / cols) * (ch + 4);
      if (cy + ch > f.y + f.h - 24) return;
      const owned = p.unlocks.includes(r.id);
      const can = !owned && p.shards >= r.cost;
      const id = `req-${r.id}`;
      const clicked = can && ui.area(id, cx, cy, cw, ch);
      const hot = ui.hovered === id;
      ctx.fillStyle = hex(owned ? 'green1' : hot ? 'gold3' : 'gold4');
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(cx, cy + ch - 1, cw, 1);
      text(ctx, r.title, cx + 4, cy + 3, owned ? 'green4' : 'ink0');
      paragraph(ctx, r.text, cx + 4, cy + 13, cw - 8, owned ? 'green3' : 'ink1');
      const tag = owned ? 'выдано' : `${r.cost}`;
      text(ctx, tag, cx + cw - 4, cy + 3, owned ? 'green4' : can ? 'vio2' : 'red2', { align: 'right' });
      if (clicked && buyRequest(p, r.id)) {
        this.app.audio.play('buy');
        this.say(`Заявка «${r.title}» одобрена.`, this.hero.x);
      }
    });
    text(ctx, 'Осколки памяти приносишь из смен: начальство, боссы, пройденные этажи.', f.x + 8, f.y + f.h - 20, 'cream', { outline: 'ink0' });
    if (ui.button(ctx, 'board-close', f.x + f.w - 80, f.y + f.h - 22, 72, 16, 'Закрыть', { accent: 'grey3' })) this.overlay = null;
  }

  private drawDesk(ctx: Ctx2D, ui: UI) {
    const p = this.app.profile;
    const f = this.frame('ТВОЙ СТОЛ');
    panel(ctx, f.x, f.y, f.w, f.h, { border: 'cold3', fill: 'ink1', alpha: 0.97 });
    bigText(ctx, f.title, f.x + f.w / 2, f.y + 6, 'cream', { align: 'center' });
    // Who goes to the next shift.
    text(ctx, 'Кто идёт в смену:', f.x + 10, f.y + 26, 'cold4');
    const ids: CharId[] = ['intern', 'accountant', 'janitor'];
    const cw = Math.floor((f.w - 20) / 3);
    ids.forEach((id, k) => {
      const ch = CHARACTERS[id];
      const open = !ch.unlock || p.unlocks.includes(ch.unlock);
      const cx = f.x + 10 + k * cw;
      const cy = f.y + 38;
      const aid = `char-${id}`;
      const clicked = open && ui.area(aid, cx, cy, cw - 4, 96);
      const sel = this.hero.char === id;
      ctx.fillStyle = hex(sel ? 'ink3' : ui.hovered === aid && open ? 'ink2' : 'ink0');
      ctx.fillRect(cx, cy, cw - 4, 96);
      const fr = getFrame(`hero_${id}`, 'idle0');
      if (open) draw(ctx, fr, cx + (cw - 4) / 2, cy + 90);
      else {
        ctx.globalAlpha = 0.25;
        draw(ctx, fr, cx + (cw - 4) / 2, cy + 90);
        ctx.globalAlpha = 1;
        text(ctx, 'нужен перевод', cx + (cw - 4) / 2, cy + 40, 'grey3', { align: 'center' });
      }
      text(ctx, ch.name, cx + (cw - 4) / 2, cy + 2, sel ? 'gold4' : open ? 'cream' : 'grey2', { align: 'center' });
      if (clicked) {
        this.hero.char = id;
        p.settings.char = id;
        this.app.audio.play('select');
      }
    });
    const ch = CHARACTERS[this.hero.char as CharId];
    let y = f.y + 140;
    y += paragraph(ctx, `${ch.desc} Здоровье ${ch.maxHp}, монет ${ch.coins}.`, f.x + 10, y, f.w - 20, 'cold5') + 6;
    text(ctx, `Смен: ${p.runs} · сдано отчётов: ${p.wins} · осколков собрано: ${p.shardsTotal}`, f.x + 10, y, 'cold4');
    y += 12;
    for (const h of p.history.slice(0, 4)) {
      if (y > f.y + f.h - 30) break;
      text(ctx, `${h.won ? 'Отчёт сдан' : `Отдел ${h.act + 1}: ${h.cause || '—'}`} · +${h.shards} осколков`, f.x + 10, y, h.won ? 'gold4' : 'grey3');
      y += 10;
    }
    if (ui.button(ctx, 'desk-close', f.x + f.w - 80, f.y + f.h - 22, 72, 16, 'Закрыть', { accent: 'grey3' })) this.overlay = null;
  }
}

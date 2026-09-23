import { CHARACTERS, FLOORS } from '../game/content/floors.ts';
import { ENEMIES } from '../game/content/enemies.ts';
import { ITEMS } from '../game/content/items.ts';
import type { RunState } from '../game/types.ts';
import { HeroView } from './actors.ts';
import type { App } from './app.ts';
import { LINE, paragraph, text } from './font.ts';
import { Lighting } from './lighting.ts';
import { hex } from './palette.ts';
import { Particles } from './particles.ts';
import { ACHIEVEMENTS, type Achievement } from './profile.ts';
import { FLOOR_Y, RoomScene, VH, VW, drawVignette } from './scene.ts';
import { draw, drawScaled, getFrame, silhouette, type Ctx2D } from './sprite.ts';
import { panel, type UI } from './ui.ts';

const CHAR_IDS = ['intern', 'accountant', 'janitor'] as const;

export class TitleScreen {
  scene = new RoomScene('office', 3, 'start');
  ps = new Particles();
  lighting = new Lighting(VW, VH);
  hero = new HeroView();
  t = 0;
  charIndex = 0;

  constructor(public app: App) {
    this.lighting.ambient = this.scene.look.ambient;
    this.lighting.lights = this.scene.lights;
    this.hero.x = 320;
    const saved = CHAR_IDS.indexOf(app.profile.settings.char as (typeof CHAR_IDS)[number]);
    this.charIndex = saved >= 0 && this.available(CHAR_IDS[saved]) ? saved : 0;
    this.hero.char = CHAR_IDS[this.charIndex];
  }

  available(id: (typeof CHAR_IDS)[number]) {
    const unlock = CHARACTERS[id].unlock;
    return !unlock || this.app.profile.achievements.includes(unlock);
  }

  update(dt: number) {
    this.t += dt;
    this.scene.update(dt, this.ps, this.t);
    this.ps.update(dt);
    this.hero.update(dt);
    this.lighting.flash = this.scene.lightningFlash * 0.9;
  }

  cycle(dir: number) {
    for (let k = 1; k <= CHAR_IDS.length; k++) {
      const i = (this.charIndex + dir * k + CHAR_IDS.length * 3) % CHAR_IDS.length;
      if (this.available(CHAR_IDS[i])) {
        this.charIndex = i;
        break;
      }
    }
    this.hero.char = CHAR_IDS[this.charIndex];
    this.app.profile.settings.char = this.hero.char;
    this.app.audio.play('select');
  }

  key(k: string) {
    if (k === 'Enter' || k === ' ') this.app.startNew(CHAR_IDS[this.charIndex]);
    if (k === 'ArrowLeft' || k === 'a') this.cycle(-1);
    if (k === 'ArrowRight' || k === 'd') this.cycle(1);
    if ((k === 'c' || k === 'с') && this.app.hasSave()) this.app.continueRun();
  }

  draw(ctx: Ctx2D, ui: UI) {
    const t = this.t;
    const s = this.scene;
    s.drawSky(ctx);
    s.drawLayer(ctx);
    s.drawGlass(ctx);
    this.ps.draw(ctx, 'back', false);
    const hf = this.hero.frame(t);
    drawScaled(ctx, hf, 320, FLOOR_Y, 2);
    this.ps.draw(ctx, 'mid', false);
    s.drawFront(ctx);
    this.lighting.compose(t, [{ x: 320, y: FLOOR_Y - 30, r: 110, color: '#ffc27a', intensity: 0.9, flicker: 'lantern', seed: 2 }]);
    this.lighting.apply(ctx, 0.2);
    this.ps.draw(ctx, 'mid', true);
    drawVignette(ctx, 1);
    // Logo.
    const glow = 0.5 + Math.sin(t * 2) * 0.2;
    text(ctx, 'ОСКОЛКИ', 322, 42, 'red1', { align: 'center', scale: 5 });
    text(ctx, 'ОСКОЛКИ', 320, 40, 'gold4', { align: 'center', scale: 5, outline: 'ink0' });
    ctx.globalAlpha = glow * 0.35;
    text(ctx, 'ОСКОЛКИ', 320, 40, 'cream', { align: 'center', scale: 5 });
    ctx.globalAlpha = 1;
    text(ctx, 'рогалик из бесконечного офиса', 320, 92, 'cold5', { align: 'center', outline: 'ink0' });

    // Character: name and description beside the hero, arrows around him.
    const id = CHAR_IDS[this.charIndex];
    const ch = CHARACTERS[id];
    text(ctx, ch.name.toUpperCase(), 372, 236, 'cream', { scale: 2, outline: 'ink0' });
    paragraph(ctx, ch.desc, 372, 258, 150, 'cold5', { outline: 'ink0' });
    if (ui.button(ctx, 'char-prev', 280, 262, 16, 16, '<')) this.cycle(-1);
    if (ui.button(ctx, 'char-next', 344, 262, 16, 16, '>')) this.cycle(1);
    const locked = CHAR_IDS.filter((c) => !this.available(c));
    if (locked.length) text(ctx, `Ещё персонажей: ${locked.length} — откроются достижениями`, 320, 328, 'grey3', { align: 'center', outline: 'ink0' });

    // Menu.
    const x = 250;
    let y = 104;
    if (ui.button(ctx, 'new', x, y, 140, 20, 'Новый забег', { accent: 'gold3' })) this.app.startNew(id);
    y += 24;
    if (this.app.hasSave()) {
      if (ui.button(ctx, 'continue', x, y, 140, 20, 'Продолжить')) this.app.continueRun();
      y += 24;
    }
    if (ui.button(ctx, 'collection', x, y, 68, 18, 'Коллекция')) this.app.mode = 'collection';
    if (ui.button(ctx, 'sound', x + 72, y, 68, 18, this.app.audio.muted ? 'Звук: нет' : 'Звук: да')) {
      this.app.audio.toggleMute();
      this.app.profile.settings.muted = this.app.audio.muted;
    }
    y += 22;
    if (ui.button(ctx, 'fs', x, y, 140, 18, 'Полный экран (F)')) this.app.toggleFullscreen();

    const p = this.app.profile;
    text(ctx, `Забегов ${p.runs} · побед ${p.wins} · серия ${p.streak} · предметов найдено ${p.seenItems.length}`, 320, 339, 'cold3', { align: 'center', outline: 'ink0' });
    text(ctx, 'Enter — начать · ←/→ — персонаж · F — полный экран · M — звук', 320, 350, 'cold2', { align: 'center' });
  }
}

export function drawPause(ctx: Ctx2D, ui: UI, app: App, run: RunState) {
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(0, 0, VW, VH);
  ctx.globalAlpha = 1;
  panel(ctx, 120, 40, 400, 280, { border: 'gold2', fill: 'ink1' });
  text(ctx, 'ПАУЗА', 320, 50, 'gold4', { align: 'center', scale: 2, outline: 'ink0' });
  text(ctx, `${FLOORS[run.floor].name} · seed ${run.seed}`, 320, 72, 'cold4', { align: 'center' });
  const bx = 140;
  let y = 90;
  const game = app.game!;
  if (ui.button(ctx, 'resume', bx, y, 110, 18, 'Продолжить')) game.paused = false;
  y += 22;
  const speed = app.profile.settings.speed;
  if (ui.button(ctx, 'speed', bx, y, 110, 18, `Анимации ×${speed}`)) {
    app.profile.settings.speed = speed >= 2 ? 1 : speed + 0.5;
  }
  y += 22;
  const shake = app.profile.settings.shake;
  if (ui.button(ctx, 'shake', bx, y, 110, 18, `Тряска ${Math.round(shake * 100)}%`)) {
    app.profile.settings.shake = shake >= 1 ? 0 : shake + 0.5;
    game.juice.shakeScale = app.profile.settings.shake;
  }
  y += 22;
  if (ui.button(ctx, 'mute', bx, y, 110, 18, app.audio.muted ? 'Звук: нет' : 'Звук: да')) app.audio.toggleMute();
  y += 22;
  if (ui.button(ctx, 'fs2', bx, y, 110, 18, 'Полный экран')) app.toggleFullscreen();
  y += 22;
  if (ui.button(ctx, 'menu', bx, y, 110, 18, 'В меню')) app.toMenu();
  y += 22;
  if (ui.button(ctx, 'abandon', bx, y, 110, 18, 'Сдаться', { accent: 'red3' })) app.abandon();

  // Items with descriptions.
  text(ctx, 'ПРЕДМЕТЫ', 270, 92, 'gold4', { outline: 'ink0' });
  const items = [...(run.hero.active ? [run.hero.active] : []), ...run.hero.items];
  items.forEach((id, k) => {
    const x = 270 + (k % 12) * 20;
    const yy = 104 + Math.floor(k / 12) * 20;
    draw(ctx, getFrame(`item_${id}`), x + 8, yy + 16);
    if (ui.area(`pitem-${k}`, x, yy, 18, 18)) void 0;
    if (ui.hovered === `pitem-${k}`) {
      const def = ITEMS[id];
      ui.tooltip(def.name, `${def.tagline}. ${def.desc}`, ui.p.x, ui.p.y, 'gold4');
    }
  });
  if (!items.length) text(ctx, 'Пока пусто', 270, 106, 'grey3');
  const st = run.stats;
  paragraph(
    ctx,
    `Комнат пройдено: ${st.roomsCleared}\nВрагов: ${st.kills}\nУрон: ${st.damageDealt}\nМонет заработано: ${st.coinsEarned}\nЛучший каскад: ${st.maxCombo}`,
    270,
    220,
    230,
    'cold5',
  );
  text(ctx, 'Esc — продолжить', 320, 306, 'cold3', { align: 'center' });
}

export function drawEnding(ctx: Ctx2D, ui: UI, app: App, run: RunState, earned: Achievement[], t: number) {
  const a = Math.min(1, t * 2);
  ctx.globalAlpha = 0.75 * a;
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(0, 0, VW, VH);
  ctx.globalAlpha = 1;
  if (t < 0.3) return;
  const won = run.phase === 'won';
  panel(ctx, 110, 30, 420, 300, { border: won ? 'gold3' : 'red2', fill: 'ink1' });
  text(ctx, won ? 'ОТЧЁТ СДАН' : 'СМЕНА ОКОНЧЕНА', 320, 42, won ? 'gold4' : 'red4', { align: 'center', scale: 2, outline: 'ink0' });
  const cause = run.stats.deathCause;
  // A win on a profile without the last floor unlocked is a win, but not the end of the office.
  const next = FLOORS[run.lastFloor + 1];
  const winLine = next ? `Смена закрыта. Ниже есть ещё этаж — ${next.name}.` : 'Ты прошёл все этажи. Главный офис молчит — до следующей смены.';
  text(ctx, won ? winLine : `Тебя уволил: ${cause || 'офис'}`, 320, 66, 'cream', { align: 'center' });
  const st = run.stats;
  const lines = [
    `Этаж: ${FLOORS[run.floor].name} (${run.floor + 1})`,
    `Комнат пройдено: ${st.roomsCleared}`,
    `Врагов побеждено: ${st.kills}`,
    `Урон нанесён: ${st.damageDealt}`,
    `Монет заработано: ${st.coinsEarned}`,
    `Ходов: ${st.moves} · лучший каскад ×${st.maxCombo}`,
  ];
  lines.forEach((l, k) => text(ctx, l, 130, 86 + k * (LINE + 2), 'cold5'));
  text(ctx, 'ПРЕДМЕТЫ ЗАБЕГА', 300, 86, 'gold4');
  run.hero.items.forEach((id, k) => {
    const x = 300 + (k % 10) * 20;
    const y = 98 + Math.floor(k / 10) * 20;
    draw(ctx, getFrame(`item_${id}`), x + 8, y + 16);
    if (ui.area(`eitem-${k}`, x, y, 18, 18)) void 0;
    if (ui.hovered === `eitem-${k}`) ui.tooltip(ITEMS[id].name, ITEMS[id].tagline, ui.p.x, ui.p.y, 'gold4');
  });
  if (!run.hero.items.length) text(ctx, '—', 300, 98, 'grey3');
  let y = 170;
  if (earned.length) {
    text(ctx, 'ОТКРЫТО:', 130, y, 'vio5', { outline: 'ink0' });
    y += 12;
    for (const e of earned) {
      text(ctx, `+ ${e.name} — ${e.unlocks}`, 130, y, 'gold4');
      y += LINE + 2;
    }
  }
  text(ctx, `seed ${run.seed}${run.customSeed ? ' (свой: без достижений)' : ''}`, 320, 270, 'grey3', { align: 'center' });
  if (ui.button(ctx, 'again', 200, 290, 110, 22, 'Ещё смена', { accent: 'gold3' })) app.startNew(run.hero.char);
  if (ui.button(ctx, 'tomenu', 330, 290, 110, 22, 'В меню')) app.toMenu();
  text(ctx, 'Пробел — ещё смена', 320, 318, 'cold3', { align: 'center' });
}

export function drawCollection(ctx: Ctx2D, ui: UI, app: App, t: number) {
  ctx.fillStyle = hex('ink1');
  ctx.fillRect(0, 0, VW, VH);
  for (let y = 0; y < VH; y += 4) {
    ctx.fillStyle = 'rgba(34,41,73,0.25)';
    ctx.fillRect(0, y, VW, 1);
  }
  const p = app.profile;
  const items = Object.values(ITEMS).filter((i) => i.pools.length);
  text(ctx, 'КОЛЛЕКЦИЯ', 320, 10, 'gold4', { align: 'center', scale: 2, outline: 'ink0' });
  text(ctx, `Предметы: ${items.filter((i) => p.seenItems.includes(i.id)).length} / ${items.length}`, 20, 36, 'cold5');
  items.forEach((it, k) => {
    const x = 20 + (k % 16) * 22;
    const y = 50 + Math.floor(k / 16) * 22;
    const seen = p.seenItems.includes(it.id);
    const f = getFrame(`item_${it.id}`);
    ctx.fillStyle = hex('ink2');
    ctx.fillRect(x, y, 20, 20);
    draw(ctx, seen ? f : silhouette(f, 'ink3'), x + 10, y + 18);
    if (ui.area(`col-${it.id}`, x, y, 20, 20)) void 0;
    if (ui.hovered === `col-${it.id}`) {
      const locked = it.unlock && !p.achievements.includes(it.unlock);
      ui.tooltip(
        seen ? it.name : '???',
        seen ? `${it.tagline}. ${it.desc}` : locked ? `Закрыто: ${ACHIEVEMENTS.find((a) => a.id === it.unlock)?.desc ?? 'достижение'}` : 'Ещё не найдено',
        ui.p.x,
        ui.p.y,
        'gold4',
      );
    }
  });
  const enemies = Object.values(ENEMIES);
  text(ctx, `Враги: ${enemies.filter((e) => p.seenEnemies.includes(e.id)).length} / ${enemies.length}`, 390, 36, 'cold5');
  enemies.forEach((e, k) => {
    const x = 390 + (k % 6) * 40;
    const y = 50 + Math.floor(k / 6) * 44;
    const seen = p.seenEnemies.includes(e.id);
    const f = getFrame(e.id);
    ctx.fillStyle = hex('ink2');
    ctx.fillRect(x, y, 38, 42);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 38, 42);
    ctx.clip();
    const scale = f.h > 40 ? 0.5 : 1;
    if (scale === 1) draw(ctx, seen ? f : silhouette(f, 'ink3'), x + 19, y + 40);
    else ctx.drawImage((seen ? f : silhouette(f, 'ink3')).canvas as CanvasImageSource, x + 19 - (f.w * scale) / 2, y + 40 - f.h * scale, f.w * scale, f.h * scale);
    ctx.restore();
    if (ui.area(`en-${e.id}`, x, y, 38, 42)) void 0;
    if (ui.hovered === `en-${e.id}`) ui.tooltip(seen ? e.name : '???', seen ? e.blurb : 'Ещё не встречен', ui.p.x, ui.p.y, 'red4');
  });
  text(ctx, 'ДОСТИЖЕНИЯ', 20, 250, 'gold4');
  ACHIEVEMENTS.forEach((a, k) => {
    const got = p.achievements.includes(a.id);
    const x = 20 + (k % 2) * 300;
    const y = 262 + Math.floor(k / 2) * 12;
    text(ctx, `${got ? '+' : '·'} ${a.name}: ${a.desc} → ${a.unlocks}`, x, y, got ? 'gold4' : 'grey2');
  });
  if (ui.button(ctx, 'back', 270, 330, 100, 20, 'Назад')) app.mode = 'title';
  void t;
}

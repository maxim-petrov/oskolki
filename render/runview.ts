import { activeCost } from '../game/combat.ts';
import { ACTS } from '../game/content/acts.ts';
import { CARDS, FINISH_TEXT } from '../game/content/cards.ts';
import { ITEMS, POCKETS, type Mods } from '../game/content/items.ts';
import { dispatch, modsOf, saveRun } from '../game/run.ts';
import type { Action, GameEvent, RunState } from '../game/types.ts';
import type { App } from './app.ts';
import { CombatView, type CombatHost } from './combatview.ts';
import { bigText, text } from './font.ts';
import { ditherFade, drawDanger, drawVignette } from './fx.ts';
import { drawTopBar, type Disp } from './hud.ts';
import { Juice } from './juice.ts';
import { LIGHT_STYLE, Lighting } from './lighting.ts';
import { MapView } from './mapview.ts';
import { hex } from './palette.ts';
import { Particles, burst, rand } from './particles.ts';
import { DeckGrid, RewardScreen, ShopScreen, drawBossReward, drawDeckViewer, drawEvent, drawPick, drawRest, drawTreasure } from './runscreens.ts';
import { draw, getFrame, type Canvas, type Ctx2D } from './sprite.ts';
import { Stage, roomFor, stageBuffer } from './stage.ts';
import { Steps } from './steps.ts';
import { panel, type UI } from './ui.ts';
import { L, STAGE_FEET, STAGE_H } from './view.ts';

interface Banner {
  title: string;
  sub: string;
  icon?: string;
  t: number;
  max: number;
  color: string;
  big?: boolean;
}

/**
 * One shift (run): owns the engine state, replays its events as animation, draws the stage,
 * the fight and the screens between fights. Death and victory are handed back to the app.
 */
export class RunView implements CombatHost {
  run: RunState;
  mods: Mods;
  disp: Disp;
  steps = new Steps();
  ps = new Particles();
  sps = new Particles();
  juice = new Juice(this.ps);
  combat: CombatView;
  map = new MapView();
  reward = new RewardScreen();
  shop = new ShopScreen();
  grid = new DeckGrid();
  stage!: Stage;
  stageKey = '';
  buf!: { canvas: Canvas; ctx: Ctx2D };
  bufW = 0;
  lighting!: Lighting;
  t = 0;
  speed = 1;
  banners: Banner[] = [];
  toastMsg: { s: string; t: number } | null = null;
  fade = 1;
  paused = false;
  deckOpen = false;
  mapOpen = false;
  /** The run has ended: the app takes over after the ash. */
  ending: null | { kind: 'dead' | 'won'; t: number } = null;
  wheel = 0;

  constructor(
    public app: App,
    run: RunState,
    initial: GameEvent[],
  ) {
    this.run = run;
    this.mods = modsOf(run);
    this.disp = this.heroDisp();
    this.combat = new CombatView(this);
    this.combat.hero.char = run.hero.char;
    this.buildStage(true);
    if (initial.length) for (const e of initial) this.enqueue(e);
    else if (run.combat) this.combat.show(false);
    this.steps.at(() => this.settle());
    this.steps.push({ dur: 0.3, tick: (k) => (this.fade = Math.min(this.fade, 1 - k)) });
  }

  get audio() {
    return this.app.audio;
  }

  heroDisp(): Disp {
    const h = this.run.hero;
    return { hp: h.hp, maxHp: h.maxHp, armor: h.armor, charge: h.charge, cost: activeCost(this.run), coins: h.coins };
  }

  busy() {
    return this.steps.busy();
  }

  // ── Stage ─────────────────────────────────────────────────────────

  buildStage(force = false) {
    const node = this.run.node >= 0 ? this.run.map.nodes[this.run.node] : null;
    const intro = this.run.combat?.kind === 'intro';
    const { id, dark } = intro ? { id: 'archive' as const, dark: true } : roomFor(this.run.act, node?.look ?? 0, node?.kind ?? 'fight');
    const key = `${id}:${dark}:${node?.id ?? -1}:${L.w}`;
    if (!force && key === this.stageKey) return;
    this.stageKey = key;
    const worldW = Math.max(L.w, 640);
    this.stage = new Stage(id, dark, worldW, this.run.seed + (node?.id ?? 0));
    this.stage.cam = Math.round((worldW - L.w) / 2);
    this.sps.clear();
    this.audio.ambience(dark ? 'dark' : 'hub');
  }

  private ensureBuffers() {
    if (this.bufW !== L.w) {
      this.bufW = L.w;
      this.buf = stageBuffer(L.w);
      this.lighting = new Lighting(L.w, STAGE_H);
      this.stage.cam = Math.round((this.stage.worldW - L.w) / 2);
      this.combat.layoutActors();
    }
  }

  // ── Actions ───────────────────────────────────────────────────────

  act(a: Action): boolean {
    if (this.busy() || this.ending || this.paused) return false;
    const { run, events } = dispatch(this.run, a);
    const invalid = events.find((e) => e.t === 'invalid');
    if (invalid && events.length === 1) {
      this.fail(invalid.t === 'invalid' ? invalid.reason : '');
      return false;
    }
    this.run = run;
    this.mods = modsOf(run);
    for (const e of events) this.enqueue(e);
    this.steps.at(() => this.settle());
    this.persist();
    return true;
  }

  fail(reason: string) {
    this.audio.play('invalid');
    if (reason) this.toast(reason, 1.4);
  }

  toast(s: string, t = 1.6) {
    this.toastMsg = { s, t };
  }

  banner(title: string, sub: string, color: string, big = false, icon?: string) {
    this.banners.push({ title, sub, color, big, icon, t: 0, max: big ? 2.4 : 2 });
  }

  persist() {
    if (this.run.phase === 'dead' || this.run.phase === 'won') this.app.endRun(this.run);
    else this.app.saveRun(saveRun(this.run));
  }

  settle() {
    this.combat.settle();
    this.disp = this.heroDisp();
    this.combat.hero.char = this.run.hero.char;
    if (this.run.phase !== 'combat' && this.combat.active) this.combat.hide();
  }

  // ── Event playback ────────────────────────────────────────────────

  enqueue(e: GameEvent) {
    if (this.combat.enqueue(e)) return;
    const S = this.steps;
    switch (e.t) {
      case 'act':
        S.push({
          dur: 1.8,
          begin: () => {
            const a = ACTS[Math.min(e.act, ACTS.length - 1)];
            this.banner(a.name.toUpperCase(), a.subtitle, 'cream', true);
            this.audio.play('phase');
          },
        });
        break;
      case 'enterNode':
        // Fade out, build the room of the node, the hero walks in from the left.
        S.push({ dur: 0.22, tick: (k) => (this.fade = k) });
        S.push({
          dur: 0.02,
          end: () => {
            this.buildStage();
            this.combat.hero.x = -30;
            this.combat.hero.state = 'walk';
            this.audio.play('door');
          },
        });
        S.push({
          dur: 0.45,
          tick: (k) => {
            this.fade = 1 - k;
            const target = this.combat.hero.x;
            void target;
            this.combat.hero.x = -30 + (Math.max(40, Math.min(150, L.w * 0.2)) + 30) * k;
          },
          end: () => {
            this.combat.hero.state = 'idle';
            this.combat.layoutActors();
            this.fade = 0;
          },
        });
        break;
      case 'relic': {
        const def = ITEMS[e.relic];
        S.push({
          dur: 1.1,
          begin: () => {
            this.banner(def.name, def.desc, e.source === 'boss' ? 'red4' : 'gold4', false, def.icon);
            this.combat.hero.set('hold', 1);
            this.combat.hero.holdItem = def.icon;
            this.audio.play('item');
            this.mods = modsOf(this.run);
            this.disp.maxHp = this.run.hero.maxHp;
            if (!this.app.profile.seenRelics.includes(e.relic)) this.app.profile.seenRelics.push(e.relic);
          },
        });
        break;
      }
      case 'card':
        S.push({
          dur: e.source === 'reward' || e.source === 'shop' ? 0.35 : 0.2,
          begin: () => {
            const def = CARDS[e.card];
            if (!def) return;
            this.toast(e.source === 'curse' ? `В колоду подброшена «${def.name}»` : `В колоде: ${def.name}`, 1.4);
            this.audio.play('card');
            if (!this.app.profile.seenCards.includes(e.card)) this.app.profile.seenCards.push(e.card);
          },
        });
        break;
      case 'cardRemoved':
        S.push({ dur: 0.25, begin: () => (this.toast(`Уничтожено: ${CARDS[e.card]?.name ?? e.card}`), this.audio.play('paper')) });
        break;
      case 'cardUpgraded':
        S.push({ dur: 0.25, begin: () => (this.toast(`Повышено: ${CARDS[e.card]?.name ?? e.card}+`), this.audio.play('item')) });
        break;
      case 'cardFinished':
        S.push({ dur: 0.25, begin: () => (this.toast(`${FINISH_TEXT[e.finish].name}: ${CARDS[e.card]?.name ?? e.card}`), this.audio.play('item')) });
        break;
      case 'pocket':
        S.push({ dur: 0.2, begin: () => (this.toast(`В кармане: ${POCKETS[e.pocket]?.name ?? e.pocket}`), this.audio.play('pickup')) });
        break;
      case 'coins':
        S.push({
          dur: 0.1,
          begin: () => {
            this.disp.coins = Math.max(0, this.disp.coins + e.amount);
            if (e.amount > 0) this.audio.play('coin');
          },
        });
        break;
      case 'heal':
        S.push({
          dur: 0.1,
          begin: () => {
            this.disp.hp = Math.min(this.disp.maxHp, this.disp.hp + e.amount);
            const [hx, hy] = this.combat.heroChest();
            this.juice.float(`+${e.amount}`, hx, hy - 44, 'green4', { outline: 'ink0' });
          },
        });
        break;
      case 'hurt':
        S.push({
          dur: 0.3,
          begin: () => {
            this.disp.hp = Math.max(1, this.disp.hp - e.amount);
            const [hx, hy] = this.combat.heroChest();
            this.juice.float(`−${e.amount}`, hx, hy - 50, 'red4', { outline: 'ink0', scale: 2 });
            this.juice.flash('red2', 0.2);
            this.combat.hero.set('hurt', 0.3);
            this.audio.play('hurt');
          },
        });
        break;
      case 'maxHp':
        S.push({ dur: 0.1, begin: () => (this.disp.maxHp = this.run.hero.maxHp) });
        break;
      case 'shards':
        S.push({
          dur: 0.5,
          begin: () => {
            const [hx, hy] = this.combat.heroChest();
            this.juice.float(`+${e.amount} осколок памяти`, hx + 20, hy - 60, 'vio5', { outline: 'ink0', max: 1.6 });
            burst(this.ps, hx, hy - 30, 20, { ramp: ['white', 'vio5', 'vio4', 'vio2'], add: true, layer: 'ui', speed: [20, 80], max: 0.9 });
            this.audio.play('prism', 1.3);
          },
        });
        break;
      case 'dead':
        S.push({
          dur: 1.2,
          begin: () => {
            this.combat.hero.state = 'dead';
            this.juice.flash('red2', 0.6);
            this.juice.shake(0.8);
            this.audio.play('death');
          },
          tick: (k) => (this.combat.hero.alpha = 1 - k * 0.4),
          end: () => (this.ending = { kind: 'dead', t: 0 }),
        });
        break;
      case 'won':
        S.push({
          dur: 1.4,
          begin: () => {
            this.juice.flash('gold4', 0.6);
            this.audio.play('item');
            this.banner('ОТЧЁТ СДАН', 'Смена окончена. Можно домой.', 'gold4', true);
          },
          end: () => (this.ending = { kind: 'won', t: 0 }),
        });
        break;
      case 'message':
        S.push({ dur: 0.02, begin: () => this.toast(e.text, 1.8) });
        break;
      case 'invalid':
        S.push({ dur: 0.02, begin: () => this.fail(e.reason) });
        break;
    }
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;
    const speed = this.app.profile.settings.speed * (this.app.fastForward ? 3 : 1);
    this.speed = speed;
    this.juice.update(dt * Math.min(2, speed));
    const frozen = this.juice.hitstop > 0;
    if (!this.paused && !frozen) this.steps.run(dt * speed);
    this.combat.update(dt, frozen, speed);
    this.stage.update(dt, this.sps);
    this.ps.update(dt);
    this.sps.update(dt);
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.max);
    if (this.toastMsg) {
      this.toastMsg.t -= dt;
      if (this.toastMsg.t <= 0) this.toastMsg = null;
    }
    if (this.ending) this.ending.t += dt;
  }

  // ── Input ─────────────────────────────────────────────────────────

  pointerDown(x: number, y: number) {
    if (this.overlay()) return;
    if (!this.combat.pointerDown(x, y) && this.busy()) this.app.fastForward = true;
  }

  pointerMove(x: number, y: number) {
    this.combat.pointerMove(x, y);
  }

  pointerUp() {
    this.app.fastForward = false;
    this.combat.pointerUp();
  }

  /** A screen that takes the input instead of the board. */
  overlay() {
    return this.paused || this.deckOpen || this.mapOpen || (this.run.phase !== 'combat' && this.run.phase !== 'dead');
  }

  key(k: string, shift: boolean) {
    if (this.ending) return;
    if (k === 'Escape') {
      if (this.combat.cancelTarget()) return;
      if (this.deckOpen || this.mapOpen) {
        this.deckOpen = false;
        this.mapOpen = false;
        return;
      }
      this.paused = !this.paused;
      return;
    }
    if (this.paused) return;
    if (k === 'd' && !this.run.combat) this.deckOpen = !this.deckOpen;
    if ((k === 'm' || k === 'ь') && this.run.phase !== 'map') this.mapOpen = !this.mapOpen;
    if (this.busy()) {
      this.app.fastForward = true;
      window.setTimeout(() => (this.app.fastForward = false), 250);
      return;
    }
    if (this.run.phase === 'combat' && !this.overlay()) this.combat.key(k, shift);
    else if (/^[1-9]$/.test(k) && this.run.phase === 'event') this.act({ type: 'event', option: Number(k) - 1 });
  }

  // ── Draw ──────────────────────────────────────────────────────────

  draw(ctx: Ctx2D, ui: UI) {
    this.ensureBuffers();
    const t = this.t;
    const [sx, sy] = this.juice.offset();
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, L.h);
    // Stage into its buffer, lit.
    const b = this.buf.ctx;
    const st = this.stage;
    st.drawBack(b, L.w);
    this.sps.draw(b, 'back', false);
    this.combat.drawActors(b);
    this.sps.draw(b, 'mid', false);
    st.drawFront(b, L.w);
    this.sps.draw(b, 'front', false);
    this.lighting.ambient = st.ambient;
    const lights = st.viewLights();
    this.lighting.lights = lights;
    const extra = this.combat.actorLights();
    for (const sh of this.juice.shots)
      if (sh.light) {
        const [x, y] = this.juice.pos(sh, Math.min(1, sh.t / sh.dur));
        extra.push({ x: x - L.stage.x, y: y - (L.stage.y - L.stageCrop), r: 36 + sh.size * 3, color: sh.light, intensity: 0.85, flicker: 'none', seed: 3 });
      }
    this.lighting.compose(t, extra);
    st.syncLights(lights);
    this.lighting.apply(b, LIGHT_STYLE.bloom);
    this.sps.draw(b, 'back', true);
    this.sps.draw(b, 'mid', true);
    for (const g of st.glows()) {
      if (g.k < 0.05) continue;
      b.globalCompositeOperation = 'lighter';
      b.globalAlpha = Math.min(1, g.k);
      b.fillStyle = g.color;
      b.fillRect(g.x - 1, g.y - 1, 3, 3);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
    }
    drawVignette(b, 0, 0, L.w, STAGE_H, 0.8 * LIGHT_STYLE.vignette);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.drawImage(this.buf.canvas as CanvasImageSource, 0, L.stageCrop, L.w, L.stage.h, L.stage.x, L.stage.y, L.w, L.stage.h);
    // Floor edge under the stage: a dark desk line before the board area.
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, L.stage.y + L.stage.h, L.w, 1);
    // Fight UI (unlit).
    this.combat.drawUI(ctx, this.overlay() ? blindUI(ui) : ui);
    this.juice.drawShots(ctx);
    this.ps.draw(ctx, 'ui', true);
    this.ps.draw(ctx, 'ui', false);
    ctx.restore();
    // Danger edge.
    if (this.disp.hp <= this.disp.maxHp * 0.3 && this.run.phase === 'combat') drawDanger(ctx, 0.35 + Math.sin(t * 5) * 0.15, L.w, L.h);
    this.juice.drawTexts(ctx);
    // Screens between fights.
    this.drawPhase(ctx, ui);
    // Top bar.
    const click = drawTopBar(ctx, ui, this.run, this.disp, t, this.combat.heartPulse, this.combat.incoming());
    if (click === 'pause') this.paused = !this.paused;
    if (click === 'deck') this.deckOpen = !this.deckOpen;
    if (click === 'map') this.mapOpen = !this.mapOpen;
    if (this.deckOpen && drawDeckViewer(ctx, ui, this.run, this.grid, t, this.takeWheel())) this.deckOpen = false;
    if (this.mapOpen) {
      this.map.viewOnly = true;
      this.map.draw(ctx, ui, this.run, t);
      if (ui.button(ctx, 'map-close', L.w - 86, L.h - 24, 78, 16, 'Закрыть', { accent: 'grey3' })) this.mapOpen = false;
    }
    this.drawBanners(ctx);
    if (this.toastMsg) {
      const y = this.run.phase === 'combat' ? L.board.y + L.board.h + 9 : L.h - 14;
      text(ctx, this.toastMsg.s, L.w / 2, Math.min(L.h - 10, y), 'cream', { align: 'center', outline: 'ink0', alpha: Math.min(1, this.toastMsg.t * 2) });
    }
    if (this.paused) this.drawPause(ctx, ui);
    this.juice.drawFlash(ctx, L.w, L.h);
    if (this.fade > 0) ditherFade(ctx, this.fade, L.w, L.h);
    if (this.ending) this.drawAsh(ctx);
  }

  private takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  private drawPhase(ctx: Ctx2D, ui: UI) {
    if (this.busy() || this.paused || this.deckOpen || this.mapOpen) return;
    const run = this.run;
    const dimStage = run.phase !== 'combat' && run.phase !== 'dead' && run.phase !== 'won';
    if (dimStage && run.phase !== 'map') {
      // Board area turns into a desk surface for the screens.
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(0, L.stage.y + L.stage.h, L.w, L.h - L.stage.y - L.stage.h);
      ctx.globalAlpha = 1;
    }
    switch (run.phase) {
      case 'map': {
        this.map.viewOnly = false;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(0, 0, L.w, L.h);
        ctx.globalAlpha = 1;
        const node = this.map.draw(ctx, ui, run, this.t);
        if (node >= 0) this.act({ type: 'travel', node });
        break;
      }
      case 'reward':
        this.reward.draw(ctx, ui, this);
        break;
      case 'shop':
        this.shop.draw(ctx, ui, this);
        break;
      case 'rest':
        drawRest(ctx, ui, this);
        break;
      case 'event':
        drawEvent(ctx, ui, this);
        break;
      case 'treasure':
        drawTreasure(ctx, ui, this);
        break;
      case 'pick':
        drawPick(ctx, ui, this, this.grid, this.takeWheel());
        break;
      case 'bossReward':
        drawBossReward(ctx, ui, this);
        break;
    }
  }

  private drawBanners(ctx: Ctx2D) {
    let y = L.top.h + 18;
    for (const b of this.banners) {
      const a = Math.min(1, b.t * 5, (b.max - b.t) * 3);
      if (b.big) {
        const by = L.stage.y + Math.round(L.stage.h * 0.3);
        ctx.globalAlpha = a * 0.75;
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(0, by, L.w, 40);
        ctx.globalAlpha = 1;
        bigText(ctx, b.title, L.w / 2, by + 7, b.color, { align: 'center', alpha: a });
        text(ctx, b.sub.length > 60 && L.mode === 'tall' ? b.sub.slice(0, 58) + '…' : b.sub, L.w / 2, by + 24, 'cold5', { align: 'center', outline: 'ink0', alpha: a });
        continue;
      }
      const w = Math.min(L.w - 16, 240);
      ctx.globalAlpha = a;
      panel(ctx, L.w / 2 - w / 2, y, w, 34, { border: b.color, fill: 'ink0', glow: b.color });
      if (b.icon) draw(ctx, getFrame(b.icon), Math.round(L.w / 2 - w / 2 + 16), y + 26);
      text(ctx, b.title, L.w / 2 + (b.icon ? 10 : 0), y + 6, b.color, { align: 'center', outline: 'ink0', alpha: a });
      const sub = b.sub.length > 46 ? b.sub.slice(0, 44) + '…' : b.sub;
      text(ctx, sub, L.w / 2 + (b.icon ? 10 : 0), y + 19, 'cold5', { align: 'center', outline: 'ink0', alpha: a });
      ctx.globalAlpha = 1;
      y += 38;
    }
  }

  private drawPause(ctx: Ctx2D, ui: UI) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.globalAlpha = 1;
    const w = 180;
    const x = Math.round((L.w - w) / 2);
    const y = Math.round(L.h / 2 - 70);
    panel(ctx, x, y, w, 140, { border: 'cold3', fill: 'ink1' });
    bigText(ctx, 'ПАУЗА', L.w / 2, y + 8, 'cream', { align: 'center' });
    if (ui.button(ctx, 'p-resume', x + 16, y + 30, w - 32, 18, 'Продолжить', { accent: 'gold3' })) this.paused = false;
    if (ui.button(ctx, 'p-sound', x + 16, y + 52, w - 32, 18, this.audio.muted ? 'Звук: выкл' : 'Звук: вкл')) {
      this.audio.toggleMute();
      this.app.profile.settings.muted = this.audio.muted;
    }
    if (ui.button(ctx, 'p-speed', x + 16, y + 74, w - 32, 18, `Скорость: ×${this.app.profile.settings.speed}`)) {
      const s = this.app.profile.settings;
      s.speed = s.speed >= 2 ? 1 : s.speed + 0.5;
    }
    if (ui.button(ctx, 'p-quit', x + 16, y + 100, w - 32, 18, 'Уйти в офис (сдаться)', { accent: 'red3' })) {
      this.paused = false;
      this.app.abandon();
    }
    text(ctx, `сид ${this.run.seed}`, L.w / 2, y + 124, 'grey2', { align: 'center' });
  }

  /** The run falls apart into ash; then the app shows the office. */
  private drawAsh(ctx: Ctx2D) {
    const e = this.ending!;
    const k = Math.min(1, e.t / 1.6);
    // Ash specks rise from everything while the picture darkens.
    for (let n = 0; n < 40; n++)
      this.ps.spawn({ x: rand(0, L.w), y: rand(0, L.h), vx: rand(-6, 6), vy: rand(-30, -10), max: rand(0.8, 1.6), ramp: e.kind === 'won' ? ['cream', 'gold4', 'gold2'] : ['grey4', 'grey2', 'grey1', 'ink2'], layer: 'ui', size: Math.random() < 0.3 ? 2 : 1 });
    ditherFade(ctx, k, L.w, L.h, e.kind === 'won' ? 'cream' : 'ink0');
    if (e.t > 1.8 && !this.handedOff) {
      this.handedOff = true;
      this.app.afterRun(this.run);
    }
  }
  private handedOff = false;
}

/** A UI facade that sees no pointer (screens above the fight take the input). */
function blindUI(ui: UI): UI {
  const b = Object.create(ui) as UI;
  b.area = () => false;
  b.tooltip = () => {};
  return b;
}

export { STAGE_FEET };

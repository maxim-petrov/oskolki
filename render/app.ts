import { newRun, loadRun } from '../game/run.ts';
import { decide } from '../game/bot.ts';
import { generateFloor } from '../game/mapgen.ts';
import { rng } from '../game/rng.ts';
import type { CharId, RunState } from '../game/types.ts';
import { registerArt } from './assets.ts';
import { Audio } from './audio.ts';
import { loadFont, text } from './font.ts';
import { GameView } from './game.ts';
import { hex } from './palette.ts';
import {
  loadProfile,
  loadRunRaw,
  newlyEarned,
  saveProfile,
  saveRunRaw,
  type Achievement,
  type Profile,
} from './profile.ts';
import { VH, VW } from './scene.ts';
import { TitleScreen, drawCollection, drawEnding, drawPause } from './screens.ts';
import { ctx2d, makeCanvas } from './sprite.ts';
import { UI, type Pointer } from './ui.ts';

/**
 * Owns the canvas (640×360 backing store, integer CSS scale for crisp pixels),
 * the frame loop, input and screen routing.
 */
export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ui = new UI();
  audio = new Audio();
  profile: Profile;
  mode: 'title' | 'game' | 'collection' = 'title';
  title!: TitleScreen;
  game: GameView | null = null;
  earned: Achievement[] = [];
  fastForward = false;
  scale = 1;
  auto = false;
  autoRng = rng(12345);
  errors: string[] = [];
  private pointer: Pointer = { x: -1, y: -1, down: false, pressed: false, released: false, right: false, inside: false };
  private raf = 0;
  private last = 0;
  private manual = false;
  private disposers: (() => void)[] = [];
  private ready = false;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VW;
    this.canvas.height = VH;
    this.canvas.className = 'game-canvas';
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = false;
    this.profile = loadProfile();
    this.audio.muted = this.profile.settings.muted;
    this.audio.volume = this.profile.settings.volume;
    this.ui.clickSound = () => this.audio.play('select');
    this.resize();
    this.bindInput();
  }

  async start() {
    await loadFont();
    registerArt();
    this.title = new TitleScreen(this);
    this.ready = true;
    const params = new URLSearchParams(location.search);
    const seed = params.get('seed');
    if (params.has('play') || seed) this.startNew((params.get('char') as CharId) ?? 'intern', seed ? Number(seed) : undefined);
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.manual) this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    (window as unknown as { __osk: unknown }).__osk = {
      app: this,
      /** Advance time deterministically (headless screenshots / tests). */
      step: (ms: number, frames = 1) => {
        this.manual = true;
        for (let f = 0; f < frames; f++) this.frame(ms / 1000 / frames);
      },
      resume: () => (this.manual = false),
      state: () => this.game?.run,
      act: (a: unknown) => this.game?.act(a as Parameters<GameView['act']>[0]),
      newRun: (seed: number, char: CharId = 'intern') => this.startNew(char, seed),
      auto: (on = true) => (this.auto = on),
      /** Debug: jump to a floor (marks the run as custom so it never counts). */
      warp: (floor: number) => {
        const g = this.game;
        if (!g) return;
        const run = structuredClone(g.run);
        run.floor = floor;
        run.map = generateFloor(run.rng.map, floor);
        run.room = run.map.start;
        run.combat = null;
        run.phase = 'explore';
        run.customSeed = true;
        this.game = new GameView(this, run, [
          { t: 'floor', floor },
          { t: 'enterRoom', room: run.room, dir: null },
        ]);
      },
      perf: () => Math.round(this.frameMs * 100) / 100,
      errors: this.errors,
    };
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    this.canvas.remove();
  }

  // ── Runs ──────────────────────────────────────────────────────────

  hasSave() {
    return !!loadRunRaw();
  }

  lastFloor() {
    return this.profile.achievements.includes('killMirror') ? 3 : 2;
  }

  startNew(char: CharId, seed?: number) {
    this.audio.unlock();
    const s = seed ?? (Math.floor(Math.random() * 2 ** 31) >>> 0);
    const { run, events } = newRun({
      seed: s,
      char,
      unlocked: this.profile.achievements,
      lastFloor: this.lastFloor(),
      customSeed: seed !== undefined,
    });
    this.earned = [];
    this.game = new GameView(this, run, events);
    this.mode = 'game';
    this.saveRun(null);
    this.profile.settings.char = char;
    saveProfile(this.profile);
  }

  continueRun() {
    const raw = loadRunRaw();
    const run = raw ? loadRun(raw) : null;
    if (!run) {
      this.saveRun(null);
      return;
    }
    this.audio.unlock();
    this.earned = [];
    this.game = new GameView(this, run, []);
    this.mode = 'game';
  }

  saveRun(raw: string | null) {
    saveRunRaw(raw);
    saveProfile(this.profile);
  }

  /** Called once when a run ends (death or victory). */
  endRun(run: RunState) {
    saveRunRaw(null);
    const p = this.profile;
    if (!run.customSeed) {
      p.runs++;
      if (run.phase === 'won') {
        p.wins++;
        p.streak++;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
      } else p.streak = 0;
      p.totalBombs += run.stats.bombsUsed;
    }
    this.earned = newlyEarned(run, p);
    for (const a of this.earned) p.achievements.push(a.id);
    p.history.unshift({
      seed: run.seed,
      char: run.hero.char,
      won: run.phase === 'won',
      floor: run.floor,
      cause: run.stats.deathCause,
      items: run.hero.items.slice(),
      date: new Date().toISOString(),
    });
    p.history = p.history.slice(0, 30);
    saveProfile(p);
  }

  abandon() {
    if (!this.game) return;
    const run = this.game.run;
    run.phase = 'dead';
    run.stats.deathCause = 'Уволился сам';
    this.endRun(run);
    this.game.paused = false;
    this.game.ending = { kind: 'dead', t: 0 };
  }

  toMenu() {
    if (this.game && this.game.run.phase !== 'dead' && this.game.run.phase !== 'won') saveProfile(this.profile);
    this.game = null;
    this.mode = 'title';
    this.title = new TitleScreen(this);
    this.audio.ambience('title');
  }

  // ── Screen ────────────────────────────────────────────────────────

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth * dpr;
    const h = window.innerHeight * dpr;
    this.scale = Math.max(1, Math.floor(Math.min(w / VW, h / VH)));
    this.canvas.style.width = `${(VW * this.scale) / dpr}px`;
    this.canvas.style.height = `${(VH * this.scale) / dpr}px`;
  }

  toggleFullscreen() {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    if (doc.fullscreenElement || doc.webkitFullscreenElement) void document.exitFullscreen?.();
    else void (this.host.requestFullscreen?.() ?? this.canvas.requestFullscreen?.());
  }

  private toGame(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * VW,
      y: ((clientY - r.top) / r.height) * VH,
      inside: clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom,
    };
  }

  private bindInput() {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: EventTarget = window) => {
      target.addEventListener(type, fn as EventListener, { passive: false });
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on('resize', () => this.resize());
    on('pointerdown', (e: PointerEvent) => {
      this.audio.unlock();
      const p = this.toGame(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { down: true, pressed: true, right: e.button === 2 });
      if (this.mode === 'game' && this.game && p.inside && !this.game.paused && !this.game.ending) this.game.pointerDown(p.x, p.y);
      if (p.inside) e.preventDefault();
    });
    on('pointermove', (e: PointerEvent) => {
      const p = this.toGame(e.clientX, e.clientY);
      Object.assign(this.pointer, p);
      if (this.mode === 'game' && this.game) this.game.pointerMove(p.x, p.y);
    });
    on('pointerup', (e: PointerEvent) => {
      const p = this.toGame(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { down: false, released: true });
      if (this.mode === 'game' && this.game) this.game.pointerUp();
    });
    on('contextmenu', (e: Event) => e.preventDefault());
    on('keydown', (e: KeyboardEvent) => {
      this.audio.unlock();
      if (!this.ready) return;
      const k = e.key;
      if (k === 'Tab' || k === ' ' || k.startsWith('Arrow')) e.preventDefault();
      if (k === 'f' || k === 'F' || k === 'а' || k === 'А') {
        this.toggleFullscreen();
        return;
      }
      if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') {
        this.audio.toggleMute();
        this.profile.settings.muted = this.audio.muted;
        return;
      }
      if (this.mode === 'title') this.title.key(k);
      else if (this.mode === 'collection') {
        if (k === 'Escape') this.mode = 'title';
      } else if (this.game) {
        if (this.game.ending && this.game.ending.t > 0.8 && (k === ' ' || k === 'Enter')) this.startNew(this.game.run.hero.char);
        else this.game.key(k, e.shiftKey);
      }
    });
    on('keyup', () => (this.fastForward = false));
  }

  // ── Frame ─────────────────────────────────────────────────────────

  /** Rolling average CPU time of a frame, ms (debug overlay / perf checks). */
  frameMs = 0;

  frame(dt: number) {
    if (!this.ready) return;
    const start = performance.now();
    this.draw(dt);
    this.frameMs = this.frameMs * 0.95 + (performance.now() - start) * 0.05;
  }

  private draw(dt: number) {
    const ctx = this.ctx;
    this.ui.begin({ ...this.pointer });
    this.pointer.pressed = false;
    this.pointer.released = false;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(0, 0, VW, VH);
    if (this.mode === 'title') {
      this.title.update(dt);
      this.title.draw(ctx, this.ui);
    } else if (this.mode === 'collection') {
      drawCollection(ctx, this.ui, this, dt);
    } else if (this.game) {
      const g = this.game;
      if (this.auto && !g.busy() && !g.ending && !g.paused) {
        try {
          const a = decide(g.run, { policy: 'greedy', items: true, seed: 1 }, this.autoRng);
          if (a) g.act(a);
        } catch (err) {
          this.errors.push(String(err));
        }
      }
      g.update(dt);
      g.draw(ctx, this.ui);
      if (g.paused) drawPause(ctx, this.ui, this, g.run);
      if (g.ending) drawEnding(ctx, this.ui, this, g.run, this.earned, g.ending.t);
    }
    this.ui.end(ctx, VW, VH);
    this.drawCursor(ctx);
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    const p = this.pointer;
    if (!p.inside) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const hot = !!this.ui.hovered || (this.game?.board.drag ?? null) !== null;
    const shape = hot
      ? ['k.......', 'kwk.....', 'kwwk....', 'kwwwk...', 'kwwwwk..', 'kwwwwwk.', 'kwwkkkkk', 'kwk.....', 'kk......']
      : ['k.......', 'kck.....', 'kcck....', 'kccck...', 'kcccck..', 'kccccck.', 'kcckkkkk', 'kck.....', 'kk......'];
    const colors: Record<string, string> = { k: hex('ink0'), w: hex('gold4'), c: hex('cream') };
    shape.forEach((row, dy) =>
      row.split('').forEach((ch, dx) => {
        if (ch === '.') return;
        ctx.fillStyle = colors[ch];
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }),
    );
  }
}

/** Offscreen helper so tests can render a frame without a DOM canvas. */
export function offscreen() {
  const c = makeCanvas(VW, VH);
  return ctx2d(c);
}

export { text };

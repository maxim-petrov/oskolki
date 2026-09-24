import { decide } from '../game/bot.ts';
import { generateActMap } from '../game/actmap.ts';
import { ACTS } from '../game/content/acts.ts';
import { rng } from '../game/rng.ts';
import { loadRun, newRun } from '../game/run.ts';
import type { CharId, RunState } from '../game/types.ts';
import { registerArt } from './assets.ts';
import { Audio } from './audio.ts';
import { loadFont } from './font.ts';
import { HubView } from './hub.ts';
import { IntroView } from './intro.ts';
import { LIGHT_STYLE } from './lighting.ts';
import { isLabEvent, loadLightStyle, setLightStyle, toggleLightLab } from './lightlab.ts';
import { hex } from './palette.ts';
import { loadProfile, loadRunRaw, recordRun, saveProfile, saveRunRaw, type Profile } from './profile.ts';
import { RunView } from './runview.ts';
import { TitleView } from './title.ts';
import { UI, type Pointer } from './ui.ts';
import { L, applyLayout, pickResolution } from './view.ts';

type Mode = 'title' | 'hub' | 'intro' | 'run';

/**
 * Owns the canvas (internal resolution picked per screen, integer CSS scale), the frame
 * loop, input and routing between the title, the office, the intro and a shift.
 */
export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ui = new UI();
  audio = new Audio();
  profile: Profile;
  mode: Mode = 'title';
  title!: TitleView;
  hub: HubView | null = null;
  intro: IntroView | null = null;
  game: RunView | null = null;
  fastForward = false;
  auto = false;
  autoRng = rng(12345);
  errors: string[] = [];
  private pointer: Pointer = { x: -1, y: -1, down: false, pressed: false, released: false, right: false, inside: false };
  private raf = 0;
  private last = 0;
  private manual = false;
  private disposers: (() => void)[] = [];
  private ready = false;
  private sizeKey = '';

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
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
    loadLightStyle();
    this.title = new TitleView(this);
    this.ready = true;
    const params = new URLSearchParams(location.search);
    const seed = params.get('seed');
    if (params.has('play') || seed) this.startShift((params.get('char') as CharId) ?? 'intern', seed ? Number(seed) : undefined, false);
    else if (params.has('hub')) this.toHub('wake');
    else if (params.has('intro')) this.startIntro();
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
      step: (ms: number, frames = 1) => {
        this.manual = true;
        for (let f = 0; f < frames; f++) this.frame(ms / 1000 / frames);
      },
      resume: () => (this.manual = false),
      state: () => this.game?.run,
      act: (a: unknown) => this.game?.act(a as Parameters<RunView['act']>[0]),
      newRun: (seed: number, char: CharId = 'intern', intro = false) => this.startShift(char, seed, intro),
      hub: (how: 'wake' | 'enter' = 'enter') => this.toHub(how),
      intro: () => this.startIntro(),
      auto: (on = true) => (this.auto = on),
      /** Debug: jump to an act (marks the run as custom so it never counts). */
      warp: (act: number) => {
        const g = this.game;
        if (!g) return;
        const run = structuredClone(g.run);
        run.act = Math.min(act, ACTS.length - 1);
        run.map = generateActMap(run.rng.map, ACTS[run.act].looks);
        run.node = -1;
        run.combat = null;
        run.phase = 'map';
        run.customSeed = true;
        this.game = new RunView(this, run, [{ t: 'act', act: run.act }]);
      },
      perf: () => Math.round(this.frameMs * 100) / 100,
      light: { style: LIGHT_STYLE, set: setLightStyle },
      layout: () => ({ ...L }),
      errors: this.errors,
    };
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    this.canvas.remove();
  }

  // ── Flow ──────────────────────────────────────────────────────────

  hasSave() {
    return !!loadRunRaw();
  }

  lastAct() {
    return this.profile.unlocks.includes('act4') ? 3 : 2;
  }

  /** First launch: the intro cutscene, then the first shift starts with the paper stack. */
  startIntro() {
    this.audio.unlock();
    this.intro = new IntroView(this);
    this.mode = 'intro';
  }

  /** A new shift from the archive door. */
  startShift(char: CharId, seed?: number, intro = false) {
    this.audio.unlock();
    const s = seed ?? (Math.floor(Math.random() * 2 ** 31) >>> 0);
    const u = this.profile.unlocks;
    const { run, events } = newRun({
      seed: s,
      char,
      unlocked: u,
      lastAct: this.lastAct(),
      customSeed: seed !== undefined && !intro,
      intro,
      pockets: u.includes('start_coffee') ? ['coffee'] : [],
      coins: u.includes('start_coins') ? 25 : 0,
    });
    this.game = new RunView(this, run, events);
    this.mode = 'run';
    this.intro = null;
    this.hub = null;
    this.saveRun(null);
    this.profile.settings.char = char;
    saveProfile(this.profile);
  }

  continueRun() {
    const raw = loadRunRaw();
    const run = raw ? loadRun(raw) : null;
    if (!run) {
      this.saveRun(null);
      return false;
    }
    this.audio.unlock();
    this.game = new RunView(this, run, []);
    this.mode = 'run';
    this.hub = null;
    return true;
  }

  saveRun(raw: string | null) {
    saveRunRaw(raw);
    saveProfile(this.profile);
  }

  /** Called once when a run ends (death or victory): shards are banked. */
  endRun(run: RunState) {
    saveRunRaw(null);
    recordRun(this.profile, run);
  }

  /** After the ash: the office, where the intern wakes up at his desk. */
  afterRun(run: RunState) {
    this.game = null;
    this.toHub(run.phase === 'won' ? 'won' : 'wake');
  }

  toHub(how: 'wake' | 'enter' | 'won') {
    this.audio.unlock();
    this.hub = new HubView(this, how);
    this.mode = 'hub';
    this.game = null;
    this.intro = null;
  }

  abandon() {
    const g = this.game;
    if (!g) return;
    const run = g.run;
    run.phase = 'dead';
    run.stats.deathCause = 'Ушёл с работы пораньше';
    this.endRun(run);
    g.ending = { kind: 'dead', t: 0 };
  }

  toTitle() {
    this.game = null;
    this.hub = null;
    this.mode = 'title';
    this.title = new TitleView(this);
  }

  // ── Screen ────────────────────────────────────────────────────────

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const devW = Math.round(window.innerWidth * dpr);
    const devH = Math.round(window.innerHeight * dpr);
    const r = pickResolution(devW, devH);
    // The CSS size must come out in whole CSS pixels, or the browser resamples the canvas and
    // the pixels smear (e.g. 292×4/3 = 389.33 on an iPhone). Trim a few internal pixels if needed.
    const whole = (n: number) => Math.abs((n * r.scale) / dpr - Math.round((n * r.scale) / dpr)) < 0.001;
    for (let k = 0; k < 12 && !whole(r.w); k++) r.w--;
    for (let k = 0; k < 12 && !whole(r.h); k++) r.h--;
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const key = `${r.w}x${r.h}@${r.scale}:${touch}`;
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      applyLayout(r.w, r.h, r.scale, r.mode, touch);
      this.canvas.width = r.w;
      this.canvas.height = r.h;
      this.ctx.imageSmoothingEnabled = false;
    }
    this.canvas.style.width = `${Math.round((r.w * r.scale) / dpr * 1000) / 1000}px`;
    this.canvas.style.height = `${Math.round((r.h * r.scale) / dpr * 1000) / 1000}px`;
  }

  toggleFullscreen() {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    if (doc.fullscreenElement || doc.webkitFullscreenElement) void document.exitFullscreen?.();
    else void (this.host.requestFullscreen?.() ?? this.canvas.requestFullscreen?.());
  }

  private toGame(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * L.w,
      y: ((clientY - r.top) / r.height) * L.h,
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
      if (isLabEvent(e)) return;
      this.audio.unlock();
      const p = this.toGame(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { down: true, pressed: true, right: e.button === 2 });
      if (p.inside) {
        if (this.mode === 'run' && this.game && !this.game.paused && !this.game.ending) this.game.pointerDown(p.x, p.y);
        if (this.mode === 'hub') this.hub?.pointerDown(p.x, p.y);
        if (this.mode === 'intro') this.intro?.pointerDown();
        e.preventDefault();
      }
    });
    on('pointermove', (e: PointerEvent) => {
      const p = this.toGame(e.clientX, e.clientY);
      Object.assign(this.pointer, p);
      if (this.mode === 'run' && this.game) this.game.pointerMove(p.x, p.y);
    });
    on('pointerup', (e: PointerEvent) => {
      const p = this.toGame(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { down: false, released: true });
      if (this.mode === 'run' && this.game) this.game.pointerUp();
      if (this.mode === 'hub') this.hub?.pointerUp();
      // Touch has no hover: forget the pointer once the finger lifts.
      if (e.pointerType === 'touch') window.setTimeout(() => (this.pointer.inside = false), 0);
    });
    on('wheel', (e: WheelEvent) => {
      if (this.game) this.game.wheel += e.deltaY * 0.5;
      if (this.hub) this.hub.wheel += e.deltaY * 0.5;
    });
    on('contextmenu', (e: Event) => e.preventDefault());
    on('keydown', (e: KeyboardEvent) => {
      if (isLabEvent(e)) return;
      this.audio.unlock();
      if (!this.ready) return;
      const k = e.key;
      if (k === 'F2') {
        e.preventDefault();
        toggleLightLab(this.host);
        return;
      }
      if (k === 'Tab' || k === ' ' || k.startsWith('Arrow')) e.preventDefault();
      if (k === 'f' || k === 'F' || k === 'а' || k === 'А') {
        this.toggleFullscreen();
        return;
      }
      if (this.mode === 'title') this.title.key(k);
      else if (this.mode === 'hub') this.hub?.key(k);
      else if (this.mode === 'intro') this.intro?.key(k);
      else if (this.game) this.game.key(k, e.shiftKey);
    });
    on('keyup', (e: KeyboardEvent) => {
      this.fastForward = false;
      if (this.mode === 'hub') this.hub?.keyUp(e.key);
    });
  }

  // ── Frame ─────────────────────────────────────────────────────────

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
    ctx.fillRect(0, 0, L.w, L.h);
    try {
      if (this.mode === 'title') {
        this.title.update(dt);
        this.title.draw(ctx, this.ui);
      } else if (this.mode === 'hub' && this.hub) {
        this.hub.update(dt);
        this.hub.draw(ctx, this.ui);
      } else if (this.mode === 'intro' && this.intro) {
        this.intro.update(dt);
        this.intro.draw(ctx, this.ui);
      } else if (this.game) {
        const g = this.game;
        if (this.auto && !g.busy() && !g.ending && !g.paused) {
          const a = decide(g.run, { policy: 'greedy', seed: 1 }, this.autoRng);
          if (a) g.act(a);
        }
        g.update(dt);
        g.draw(ctx, this.ui);
      }
    } catch (err) {
      this.errors.push(String((err as Error)?.stack ?? err));
      throw err;
    }
    this.ui.end(ctx, L.w, L.h);
    if (!L.touch) this.drawCursor(ctx);
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    const p = this.pointer;
    if (!p.inside) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const hot = !!this.ui.hovered || !!this.game?.combat.board.drag;
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

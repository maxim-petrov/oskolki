import { adjacent, isValidMove, swapBlock } from '../game/board.ts';
import { alive, intentDamage, previewMove } from '../game/combat.ts';
import { CARDS } from '../game/content/cards.ts';
import { ENEMIES, INTENT_TEXT } from '../game/content/enemies.ts';
import { ITEMS, POCKETS, type Mods } from '../game/content/items.ts';
import type { Blast, Effect, GameEvent, Move, RunState, TileScore } from '../game/types.ts';
import { EnemyView, HeroView, enemySlots, heroX } from './actors.ts';
import { cardName, cardRules } from './cardview.ts';
import { BoardView } from './boardview.ts';
import { paragraph, text } from './font.ts';
import { drawBossBar, drawPockets, drawRelics, drawSkill, type Disp } from './hud.ts';
import type { Juice } from './juice.ts';
import { FAM_COLORS, hex } from './palette.ts';
import { Particles, burst, rand } from './particles.ts';
import type { Steps } from './steps.ts';
import { TallyView } from './tally.ts';
import { easeOut } from './tween.ts';
import type { UI } from './ui.ts';
import { L, STAGE_FEET } from './view.ts';
import type { Audio } from './audio.ts';

const FAM_TRAIL: Record<string, string[]> = {
  blade: ['cream', 'red4', 'red3', 'red2'],
  shield: ['cold6', 'cold5', 'cold4', 'cold3'],
  ink: ['vio5', 'vio4', 'vio3', 'vio2'],
  coin: ['cream', 'gold4', 'gold3', 'gold2'],
  prism: ['white', 'cold6', 'vio5', 'gold4'],
};
const FIRE = ['cream', 'gold4', 'orange3', 'red2'];

/** How each enemy's blow crosses the room: colour, trail, size and arc. */
const SHOTS: Record<string, { color: string; trail: string[]; size?: number; arc?: number }> = {
  kipa: { color: 'paper', trail: ['cream', 'paper', 'paper2'], size: 5 },
  rat: { color: 'paper', trail: ['cream', 'paper', 'paper2'] },
  stapler: { color: 'grey4', trail: ['white', 'grey4', 'grey2'], arc: 10 },
  blot: { color: 'vio3', trail: FAM_TRAIL.ink },
  drop: { color: 'teal4', trail: ['teal5', 'teal4', 'teal2'] },
  moth: { color: 'paper2', trail: ['cream', 'paper2', 'grey2'], arc: 40 },
  eraser: { color: 'red4', trail: ['red5', 'red4', 'red2'], size: 5 },
  copier: { color: 'paper', trail: ['white', 'paper', 'crt1'], size: 5, arc: 30 },
  phone: { color: 'red3', trail: ['red5', 'red3', 'grey2'], arc: 50 },
  neighbor: { color: 'grey3', trail: ['grey4', 'grey3', 'grey1'], size: 5 },
  cabinet: { color: 'wood4', trail: ['paper', 'wood4', 'wood2'], size: 6 },
  supervisor: { color: 'red3', trail: ['cream', 'red4', 'red2'], size: 6, arc: 12 },
  scribe: { color: 'vio4', trail: FAM_TRAIL.ink },
  crab: { color: 'teal3', trail: ['teal5', 'teal3', 'teal1'], size: 4 },
  eel: { color: 'vio3', trail: ['vio5', 'vio3', 'teal2'] },
  angler: { color: 'gold4', trail: ['cream', 'gold4', 'teal3'] },
  anchor: { color: 'grey3', trail: ['grey4', 'grey3', 'teal2'], size: 5, arc: 50 },
  tide: { color: 'teal5', trail: ['white', 'teal5', 'teal3'], size: 6 },
  candle: { color: 'orange3', trail: FIRE },
  stoker: { color: 'orange4', trail: FIRE, size: 4, arc: 40 },
  bell: { color: 'gold4', trail: ['cream', 'gold4', 'gold2'], arc: 0 },
  safe: { color: 'grey4', trail: ['white', 'grey4', 'gold3'], size: 5 },
  archivist: { color: 'paper', trail: ['cream', 'paper', 'teal3'] },
  mirror: { color: 'cold6', trail: ['white', 'cold6', 'teal5'], size: 5, arc: 10 },
  shard: { color: 'cold5', trail: ['white', 'cold5', 'cold3'], arc: 8 },
  stamp: { color: 'red3', trail: ['red5', 'red3', 'red1'], size: 4 },
  secretary: { color: 'paper', trail: ['cream', 'paper', 'grey3'], arc: 40 },
  censor: { color: 'red3', trail: ['red4', 'red2', 'ink0'], size: 6 },
};

/** What the combat view needs from its owner. */
export interface CombatHost {
  run: RunState;
  mods: Mods;
  disp: Disp;
  steps: Steps;
  juice: Juice;
  /** Screen particles (UI layer, unlit). */
  ps: Particles;
  /** Stage particles (lit with the room). */
  sps: Particles;
  audio: Audio;
  act(a: import('../game/types.ts').Action): boolean;
  fail(reason: string): void;
  toast(s: string, t?: number): void;
  banner(title: string, sub: string, color: string, big?: boolean): void;
  busy(): boolean;
  t: number;
  /** Current playback speed (settings × fast-forward). */
  speed: number;
}

export class CombatView {
  board = new BoardView();
  hero = new HeroView();
  enemies = new Map<number, EnemyView>();
  tally = new TallyView();
  targeting: null | { kind: 'active' | 'pocket'; aim?: 'cell' | 'col' | 'enemy'; slot?: number } = null;
  boardDim = 0;
  boardDimTarget = 0;
  heartPulse = 0;
  /** Tiles scored in the current move (pitch of the counting blip climbs). */
  chips = 0;
  active = false;

  constructor(private h: CombatHost) {}

  get run() {
    return this.h.run;
  }

  /** Stage origin on screen. */
  so(): [number, number] {
    return [L.stage.x, L.stage.y - L.stageCrop];
  }

  enemyPos(uid: number): [number, number] {
    const [ox, oy] = this.so();
    const v = this.enemies.get(uid);
    if (!v) return [ox + L.w * 0.75, oy + STAGE_FEET - 40];
    return [ox + v.x + v.offX, oy + v.top(this.h.t) + 24];
  }

  heroChest(): [number, number] {
    const [ox, oy] = this.so();
    const [x, y] = this.hero.chest();
    return [ox + x, oy + y];
  }

  // ── Setup and sync ────────────────────────────────────────────────

  layoutActors() {
    const hx = heroX(L.w);
    if (this.hero.state !== 'walk') this.hero.x = hx;
    const c = this.run.combat;
    const list = [...this.enemies.values()].filter((v) => v.dying === 0).sort((a, b) => a.uid - b.uid);
    const slots = enemySlots(list.length, c?.kind === 'boss', L.w, hx);
    list.forEach((v, k) => (v.tx = slots[k] ?? L.w - 60));
  }

  show(animate: boolean) {
    const c = this.run.combat;
    if (!c) return;
    this.active = true;
    this.board.layout();
    this.board.active = true;
    this.enemies.clear();
    for (const e of c.enemies) if (e.hp > 0) this.enemies.set(e.uid, new EnemyView(e, L.w + 80));
    this.layoutActors();
    for (const v of this.enemies.values()) if (!animate) v.x = v.tx;
    this.board.set(c.board.cells, this.h.t);
    this.board.queue = c.board.queue;
    this.board.flood = c.board.flood;
    this.board.colLock = c.board.colLock.slice();
    this.board.preview = this.h.mods.preview;
    this.board.wrap = this.h.mods.wrap;
    this.board.selected = -1;
    this.tally.reset();
    this.tally.end();
    this.tally.idleT = 99;
    if (animate) {
      this.board.visible = 0;
      const T = this.board.T;
      for (const v of this.board.tiles.values()) {
        const row = Math.round(v.y / T);
        this.board.moveTo(v.tile.id, row * 6 + Math.round(v.x / T), 0.35 + (5 - row) * 0.04, easeOut, [v.x, v.y - this.board.bh - 30]);
      }
    } else this.board.visible = 1;
  }

  hide() {
    this.active = false;
    this.board.active = false;
    this.targeting = null;
  }

  settle() {
    this.endEnemyTurn();
    const c = this.run.combat;
    if (!c || !this.active) return;
    this.board.set(c.board.cells, this.h.t);
    this.board.queue = c.board.queue;
    this.board.flood = c.board.flood;
    this.board.colLock = c.board.colLock.slice();
    this.board.rowLock = c.board.rowLock.slice();
    this.board.preview = this.h.mods.preview;
    this.board.wrap = this.h.mods.wrap;
    const live = alive(c);
    for (const e of live) {
      let v = this.enemies.get(e.uid);
      if (!v) {
        v = new EnemyView(e, L.w + 60);
        this.enemies.set(e.uid, v);
      }
      v.sync(e);
    }
    for (const [uid, v] of this.enemies) if (!live.some((e) => e.uid === uid) && v.dying === 0) this.enemies.delete(uid);
    this.layoutActors();
  }

  endEnemyTurn() {
    this.boardDimTarget = 0;
    for (const v of this.enemies.values()) {
      v.acting = false;
      v.dimTarget = 0;
    }
  }

  // ── Event playback ────────────────────────────────────────────────

  enqueue(e: GameEvent): boolean {
    const S = this.h.steps;
    const au = this.h.audio;
    const juice = this.h.juice;
    switch (e.t) {
      case 'combatStart':
        S.push({
          dur: e.kind === 'boss' ? 1.2 : 0.55,
          begin: () => {
            this.show(true);
            const c = this.run.combat;
            if (e.kind === 'boss' || e.kind === 'elite') {
              const def = ENEMIES[c?.enemies[0]?.def ?? ''];
              if (def) this.h.banner(def.name.toUpperCase(), def.blurb, e.kind === 'boss' ? 'red4' : 'orange4', true);
              au.play('phase');
              juice.shake(0.4);
            }
          },
        });
        return true;
      case 'swap':
        S.push({
          dur: 0.12,
          begin: () => {
            this.board.highlight = [];
            this.board.blastCells = [];
            this.board.previewText = '';
            this.board.animateSwap(e.move);
            this.tally.reset();
            this.chips = 0;
            au.play('swap');
          },
          end: () => this.board.set(e.board, this.h.t),
        });
        return true;
      case 'wave':
        this.enqueueWave(e);
        return true;
      case 'strike':
        this.enqueueStrike(e);
        return true;
      case 'effects':
        S.push({
          dur: e.effects.some((f) => f.kind === 'damage' || f.kind === 'coins') ? 0.3 : 0.06,
          begin: () => this.fireEffects(e.effects),
        });
        return true;
      case 'tick':
        S.push({
          dur: 0.05,
          begin: () => {
            let alarm = false;
            for (const tm of e.timers) {
              const v = this.enemies.get(tm.uid);
              if (!v) continue;
              v.countdown = tm.countdown;
              if (tm.countdown === 1 && v.intentDamages()) {
                v.alertT = 0.6;
                alarm = true;
              }
            }
            if (alarm) au.play('alarm');
          },
        });
        return true;
      case 'enemyAct':
        this.enqueueEnemyAct(e);
        return true;
      case 'phase':
        S.push({
          dur: 0.8,
          begin: () => {
            const v = this.enemies.get(e.uid);
            if (v) {
              v.phase = e.phase;
              v.flash = 1;
              v.flashColor = 'red4';
              const [x, y] = this.enemyPos(e.uid);
              burst(this.h.ps, x, y, 30, { ramp: ['cream', 'red4', 'red3', 'red1'], add: true, layer: 'ui', speed: [40, 120], max: 0.6 });
            }
            juice.shake(0.7);
            juice.flash('red3', 0.35);
            this.h.banner('ЯРОСТЬ', 'Вторая фаза', 'red4');
            au.play('phase');
          },
        });
        return true;
      case 'ember':
        S.push({
          dur: 0.35,
          begin: () => {
            for (const i of e.cells) {
              const [x, y] = this.board.center(i);
              burst(this.h.ps, x, y, 16, { ramp: FIRE, add: true, layer: 'ui', speed: [30, 90], max: 0.5 });
            }
            au.play('ember');
            this.hurtHero(e.hurt, false);
          },
        });
        return true;
      case 'board':
        S.push({
          dur: e.reason === 'reshuffle' ? 0.35 : 0.1,
          begin: () => {
            if (e.reason === 'reshuffle') {
              this.h.toast('Ходов нет — перетасовка');
              const old = new Map([...this.board.tiles].map(([id, v]) => [id, [v.x, v.y] as [number, number]]));
              this.board.set(e.board, this.h.t);
              e.board.forEach((tile, i) => {
                const from = old.get(tile.id);
                if (from) this.board.moveTo(tile.id, i, 0.3, easeOut, from);
              });
            } else {
              // Board changed by a card or an item: new tiles flash.
              const known = new Set(this.board.tiles.keys());
              this.board.set(e.board, this.h.t);
              for (const tile of e.board) if (!known.has(tile.id)) {
                const v = this.board.tiles.get(tile.id);
                if (v) v.flash = 1;
              }
            }
            if (e.queue) this.board.queue = e.queue;
          },
        });
        return true;
      case 'enemyDie':
        S.push({
          dur: 0.05,
          begin: () => {
            const v = this.enemies.get(e.uid);
            if (v) {
              v.dying = 0.001;
              const [x, y] = this.enemyPos(e.uid);
              burst(this.h.ps, x, y + 10, v.size === 'boss' ? 90 : 34, {
                ramp: ['white', 'paper', 'paper2', 'grey2'],
                layer: 'ui',
                speed: [20, 110],
                ay: 160,
                max: 0.9,
                size: 2,
                kind: 'shard',
              });
              au.play('kill');
              au.play('paper', 1.2);
              if (v.size === 'boss' || v.size === 'L') {
                juice.shake(1);
                juice.flash('white', 0.6);
                juice.stop(0.2);
              }
            }
            for (const s of e.split ?? []) {
              const nv = new EnemyView(s, this.enemies.get(e.uid)?.x ?? L.w * 0.8);
              this.enemies.set(s.uid, nv);
            }
            this.layoutActors();
          },
        });
        return true;
      case 'activeUsed':
        S.push({
          dur: 0.2,
          begin: () => {
            const def = ITEMS[e.item];
            const r = this.skillRect();
            juice.float(def.name, r.x + r.w / 2, r.y - 4, 'vio5');
            burst(this.h.ps, r.x + 12, r.y + r.h / 2, 18, { ramp: ['vio5', 'vio4', 'vio3'], add: true, layer: 'ui', speed: [20, 70], max: 0.5 });
            au.play('ink', 0.8);
            this.h.disp.charge = Math.max(0, this.h.disp.charge - (def.charge ?? 0));
          },
        });
        return true;
      case 'pocketUsed':
        S.push({
          dur: 0.15,
          begin: () => {
            const def = POCKETS[e.pocket];
            if (def) juice.float(def.name, L.w / 2, L.board.y - 16, 'gold4');
            au.play('pickup');
          },
        });
        return true;
      case 'combatWon':
        S.push({
          dur: 0.9,
          begin: () => {
            this.tally.end();
            this.hero.set('hold', 0.8);
            au.play('item');
            juice.float('ПОБЕДА', L.w / 2, L.stage.y + 60, 'gold4', { scale: 2, max: 1.2 });
          },
          end: () => this.hide(),
        });
        return true;
      default:
        return false;
    }
  }

  private skillRect() {
    if (L.mode === 'wide') return { x: L.side.x, y: L.side.y, w: L.side.w, h: 34 };
    const b = L.bottom;
    const pw = this.pocketSize() * 3 + 12;
    return { x: b.x + 4, y: b.y + 4, w: b.w - pw - 12, h: Math.min(44, b.h - 8) };
  }

  private pocketSize() {
    return L.mode === 'wide' ? 22 : Math.min(40, L.bottom.h - 8);
  }

  private pocketXY(): [number, number] {
    if (L.mode === 'wide') return [L.side.x, L.side.y + 40];
    const s = this.pocketSize();
    const n = Math.max(3, this.run.hero.pockets.length);
    return [L.bottom.x + L.bottom.w - 4 - n * (s + 3) + 3, L.bottom.y + 4];
  }

  /** One tile's contribution flies from the board into the counter. */
  private scoreFx(s: TileScore, k: number) {
    const tr = L.tally;
    const [x, y] = s.i >= 0 ? this.board.center(s.i) : [L.board.x + L.board.w / 2, L.board.y - 6];
    const fam = s.fam === 'prism' ? 'prism' : s.fam;
    const label = s.dmg ? `+${s.dmg}` : s.armor ? `+${s.armor}` : s.charge ? `+${s.charge}` : s.coins ? `+${s.coins}` : s.mult ? `+${s.mult} множ` : s.xmult ? `×${s.xmult}` : '';
    const color = s.dmg ? 'red5' : s.armor ? 'cold6' : s.charge ? 'vio5' : s.coins ? 'gold4' : 'vio5';
    if (label) this.h.juice.float(label, x, y - 6, color, { max: 0.55, outline: 'ink0' });
    const toMult = !!(s.mult || s.xmult);
    const tx = L.mode === 'wide' ? (toMult ? tr.x + tr.w * 0.75 : tr.x + tr.w * 0.25) : toMult ? tr.x + tr.w / 2 + 40 : tr.x + tr.w / 2 - 40;
    const ty = tr.y + (L.mode === 'wide' ? 26 : tr.h / 2);
    this.h.juice.shoot({
      x0: x,
      y0: y,
      x1: tx,
      y1: ty,
      dur: 0.22 + k * 0.01,
      arc: 18,
      color: FAM_COLORS[fam as keyof typeof FAM_COLORS]?.mid ?? 'cream',
      trail: FAM_TRAIL[fam] ?? FAM_TRAIL.prism,
      size: 2,
      onArrive: () => {
        if (s.dmg) this.tally.add('dmg', s.dmg);
        if (s.armor) this.tally.add('armor', s.armor);
        if (s.charge) this.tally.add('charge', s.charge);
        if (s.coins) this.tally.add('coins', s.coins);
        if (s.mult) this.tally.add('mult', s.mult);
        if (s.xmult) this.tally.mult = Math.round(this.tally.mult * s.xmult * 10) / 10;
        this.chips++;
        if (s.mult || s.xmult) this.h.audio.play('mult', 1 + Math.min(1, this.chips * 0.02));
        else this.h.audio.play('chip', 1 + Math.min(1.5, this.chips * 0.06));
      },
    });
  }

  private enqueueWave(e: Extract<GameEvent, { t: 'wave' }>) {
    const b = this.board;
    const S = this.h.steps;
    const juice = this.h.juice;
    // Long cascades speed up: every next wave plays faster, so a chain of nine stays a thrill, not a wait.
    const pace = Math.max(0.3, 1 / (1 + 0.45 * Math.max(0, e.n - 1)));
    // 1. Matched groups flash.
    if (e.groups.length)
      S.push({
        dur: 0.09 * pace,
        begin: () => {
          for (const g of e.groups)
            for (const i of g.cells) {
              const id = e.cleared.find((c) => c.i === i)?.id;
              const v = id !== undefined ? b.tiles.get(id) : undefined;
              if (v) v.flash = 1;
            }
          this.h.audio.play('match', 1 + (e.n - 1) * 0.12);
          if (e.n >= 2) juice.float(`КАСКАД ×${e.n}`, b.bx + b.bw / 2, b.by - 20, e.n >= 4 ? 'gold4' : 'cream', { scale: e.n >= 3 ? 2 : 1 });
        },
      });
    // 2. Special activations.
    if (e.blasts.length)
      S.push({
        dur: 0.16 * Math.max(0.5, pace),
        begin: () => {
          for (const bl of e.blasts) this.blastFx(bl);
        },
      });
    // 3. Tiles score one by one (fast), flying into the counter.
    const scored = e.scores;
    const per = scored.length ? Math.min(0.045, 0.5 / scored.length) * pace : 0;
    if (scored.length) {
      // Tiles fire in order on the step clock (pauses, hit-stop and fast-forward stay in sync).
      let fired = 0;
      const span = per * scored.length;
      const dur = span + 0.1 * pace;
      const fire = (upTo: number) => {
        while (fired < Math.min(upTo, scored.length)) {
          this.scoreFx(scored[fired], fired);
          fired++;
        }
      };
      S.push({
        dur,
        tick: (k) => fire(span > 0 ? Math.floor(((k * dur) / span) * scored.length) + 1 : scored.length),
        end: () => fire(scored.length),
      });
    }
    // 4. Clear.
    S.push({
      dur: 0.12 * pace,
      begin: () => {
        for (const c of e.cleared) {
          const v = b.tiles.get(c.id);
          if (!v) continue;
          v.popping = true;
          v.pop = 0;
          const [x, y] = b.center(c.i);
          const fam = c.kind === 'junk' ? 'junk' : c.kind;
          const col = FAM_COLORS[fam as keyof typeof FAM_COLORS] ?? FAM_COLORS.prism;
          burst(this.h.ps, x, y, c.cause === 'splash' ? 5 : 7, {
            ramp: [col.light, col.mid, col.dark],
            layer: 'ui',
            speed: [30, 90],
            ay: 160,
            max: 0.45,
            size: Math.random() < 0.3 ? 2 : 1,
          });
        }
      },
      end: () => this.tally.sync(e.tally),
    });
    // 5. Created specials, falls and spawns.
    S.push({
      dur: 0.22 * Math.max(0.6, pace),
      begin: () => {
        const T = b.T;
        for (const cr of e.created) {
          const [x, y] = b.cellXY(cr.at);
          const v = b.make(cr.tile, x, y, this.h.t);
          v.flash = 1;
          v.fresh = 0.45;
          b.tiles.set(cr.tile.id, v);
          const [cx, cy] = b.center(cr.at);
          burst(this.h.ps, cx, cy, 14, { ramp: ['white', 'gold4', 'orange3'], add: true, layer: 'ui', speed: [30, 80], max: 0.4 });
        }
        for (const f of e.falls) b.moveTo(f.id, f.to, 0.2 * Math.max(0.6, pace));
        const byCol = new Map<number, number>();
        for (const s of e.spawns) byCol.set(s.to % 6, Math.max(byCol.get(s.to % 6) ?? 0, s.rank + 1));
        for (const s of e.spawns) {
          const tile = e.board[s.to];
          const [x] = b.cellXY(s.to);
          const n = byCol.get(s.to % 6) ?? 1;
          const v = b.make(tile, x, -T * (n - s.rank), this.h.t);
          b.tiles.set(tile.id, v);
          b.moveTo(tile.id, s.to, (0.2 + 0.02 * n) * Math.max(0.6, pace));
        }
        b.queue = e.queue;
        b.flood = e.flood;
      },
      end: () => b.set(e.board, this.h.t),
    });
  }

  /** The move's single blow: the counter slams, the hero lunges, the shot flies. */
  private enqueueStrike(e: Extract<GameEvent, { t: 'strike' }>) {
    const S = this.h.steps;
    const juice = this.h.juice;
    const au = this.h.audio;
    const big = e.damage >= 40 || e.tally.mult >= 5;
    S.push({
      dur: big ? 0.5 : 0.28,
      begin: () => {
        this.tally.sync(e.tally);
        this.tally.strike(e.damage, e.armor, e.notes);
        if (e.damage > 0) {
          this.hero.set('windup', big ? 0.5 : 0.28);
          au.play('strike', big ? 0.8 : 1.1);
          if (big) {
            juice.shake(0.35);
            juice.stop(0.08);
          }
        }
        for (const n of e.notes) juice.float(n, L.tally.x + L.tally.w / 2, L.tally.y - 6, 'gold4', { max: 1.2 });
        const d = this.h.disp;
        d.armor += e.armor;
        d.coins = Math.max(0, d.coins + Math.round(e.tally.coins));
        d.charge = Math.min(d.cost, d.charge + Math.round(e.tally.charge));
        if (e.armor > 0) {
          const [hx, hy] = this.heroChest();
          burst(this.h.ps, hx + 10, hy, 14, { ramp: ['white', 'cold6', 'cold4'], add: true, layer: 'ui', speed: [20, 70], max: 0.45 });
          juice.float(`+${e.armor} брони`, hx, hy - 40, 'cold6', { outline: 'ink0' });
          au.play('armor');
        }
      },
      end: () => {
        if (e.damage > 0 || e.aoe > 0) {
          this.hero.set('attack', 0.3);
          this.hero.offX = 10;
        }
      },
    });
  }

  private blastFx(bl: Blast) {
    const b = this.board;
    const juice = this.h.juice;
    const au = this.h.audio;
    const [ax, ay] = b.center(bl.at);
    const T = b.T;
    const sparks = (list: number[]) => {
      for (const i of list) {
        const [x, y] = b.center(i);
        burst(this.h.ps, x, y, 4, { ramp: ['cream', 'gold4', 'orange3', 'grey2'], add: true, layer: 'ui', speed: [10, 50], max: 0.35 });
      }
    };
    const line = (x: number, y: number, horizontal: boolean) => {
      for (const dir of [-1, 1])
        juice.shoot({
          x0: x,
          y0: y,
          x1: horizontal ? (dir < 0 ? b.bx - 10 : b.bx + b.bw + 10) : x,
          y1: horizontal ? y : dir < 0 ? b.by - 10 : b.by + b.bh + 10,
          dur: 0.18,
          arc: 0,
          kind: 'orb',
          color: 'cream',
          trail: FIRE,
          size: 3,
        });
    };
    const boom = (big: boolean) => {
      au.play('boom', big ? 0.8 : 1);
      this.h.ps.spawn({ x: ax, y: ay, len: 2, grow: big ? 190 : 110, max: big ? 0.4 : 0.3, kind: 'ring', ramp: FIRE, add: true, layer: 'ui' });
      burst(this.h.ps, ax, ay, big ? 80 : 40, { ramp: [...FIRE, 'grey1'], add: true, layer: 'ui', speed: big ? [60, 220] : [40, 160], max: 0.5 });
      juice.shake(big ? 0.9 : 0.5);
      juice.stop(big ? 0.1 : 0.05);
    };
    switch (bl.kind) {
      case 'rocketH':
      case 'rocketV':
        au.play('rocket');
        sparks(bl.cells);
        line(ax, ay, bl.kind === 'rocketH');
        if (bl.cells.length > 6) line(ax, ay, bl.kind !== 'rocketH');
        juice.shake(0.25);
        break;
      case 'cross':
        au.play('rocket', 0.8);
        sparks(bl.cells);
        line(ax, ay, true);
        line(ax, ay, false);
        juice.flash('gold4', 0.2);
        juice.shake(0.45);
        break;
      case 'bigCross':
        au.play('rocket', 0.7);
        au.play('boom', 1.2);
        sparks(bl.cells);
        for (const d of [-1, 0, 1]) {
          line(ax, ay + d * T, true);
          line(ax + d * T, ay, false);
        }
        juice.flash('orange4', 0.3);
        juice.shake(0.7);
        juice.stop(0.08);
        break;
      case 'active':
        au.play('ink', 0.7);
        for (const i of bl.cells) {
          const [x, y] = b.center(i);
          burst(this.h.ps, x, y, 10, { ramp: ['vio5', 'vio4', 'grey3'], add: true, layer: 'ui', speed: [15, 60], max: 0.4 });
        }
        break;
      case 'prism':
      case 'nova':
        au.play('prism', bl.kind === 'nova' ? 0.7 : 1);
        for (const i of bl.cells) {
          const [x, y] = b.center(i);
          juice.shoot({ x0: ax, y0: ay, x1: x, y1: y, dur: 0.14, arc: 0, color: 'white', trail: FAM_TRAIL.prism, size: 1 });
        }
        juice.flash(bl.kind === 'nova' ? 'white' : 'cold6', bl.kind === 'nova' ? 0.55 : 0.2);
        if (bl.kind === 'nova') {
          juice.shake(1);
          juice.stop(0.12);
        }
        break;
      case 'bigBomb':
        boom(true);
        break;
      default:
        boom(false);
    }
  }

  private fireEffects(list: Effect[]) {
    const juice = this.h.juice;
    const au = this.h.audio;
    const [hx, hy] = this.heroChest();
    for (const f of list) {
      switch (f.kind) {
        case 'damage': {
          if (f.uid === undefined) break;
          const [tx, ty] = this.enemyPos(f.uid);
          const src = f.source ?? '';
          const onSpot = src === 'bleed' || src === 'burn' || src === 'cactus' || src === 'reflect';
          const strike = src === 'strike';
          const big = f.amount >= 40;
          juice.shoot({
            x0: onSpot ? tx : src === 'spider' ? hx + 10 : hx + 16,
            y0: onSpot ? ty - 24 : hy,
            x1: tx,
            y1: ty,
            dur: onSpot ? 0.08 : strike ? 0.2 : 0.26,
            arc: src === 'aoe' ? 40 : 14,
            color: strike ? 'cream' : src === 'aoe' ? 'vio4' : 'red3',
            trail: strike ? ['white', 'cream', 'red4', 'red2'] : src === 'aoe' ? FAM_TRAIL.ink : FAM_TRAIL.blade,
            size: strike ? (big ? 7 : 5) : 3,
            onArrive: () => this.hitEnemyFx(f),
          });
          break;
        }
        case 'armor':
          if (f.source === 'expire' && f.amount < 0) {
            this.h.disp.armor = 0;
            burst(this.h.ps, hx + 10, hy, 10, { ramp: ['cold5', 'cold3', 'ink3'], layer: 'ui', speed: [10, 50], ay: 120, max: 0.5 });
          }
          break;
        case 'charge':
          if (f.amount > 0) this.h.disp.charge = Math.min(this.h.disp.cost, this.h.disp.charge + f.amount);
          break;
        case 'coins':
          if (f.amount <= 0) break;
          for (let k = 0; k < Math.min(5, f.amount); k++) {
            const [sx, sy] = f.uid !== undefined ? this.enemyPos(f.uid) : [hx, hy];
            juice.shoot({
              x0: sx + rand(-6, 6),
              y0: sy + rand(-6, 6),
              x1: 60,
              y1: 8,
              dur: 0.4 + k * 0.05,
              arc: 40,
              kind: 'sprite',
              sprite: 'ui_coin',
              color: 'gold3',
              trail: FAM_TRAIL.coin,
              onArrive: () => {
                if (k === 0) this.h.disp.coins = Math.min(999, this.h.disp.coins + f.amount);
                au.play('coin', 1 + k * 0.08);
              },
            });
          }
          break;
        case 'heal':
          this.h.disp.hp = Math.min(this.h.disp.maxHp, this.h.disp.hp + f.amount);
          juice.float(`+${f.amount}`, hx, hy - 44, 'green4', { outline: 'ink0' });
          burst(this.h.ps, hx, hy, 12, { ramp: ['green4', 'green3', 'green2'], add: true, layer: 'ui', speed: [10, 40], ay: -40, max: 0.7 });
          break;
        case 'status': {
          if (f.uid === undefined) break;
          const [x, y] = this.enemyPos(f.uid);
          const label = f.status === 'bleed' ? 'кровь' : f.status === 'burn' ? 'огонь!' : f.status === 'stun' ? 'оглушён' : 'таймер +' + f.amount;
          const color = f.status === 'bleed' ? 'red4' : f.status === 'burn' ? 'orange3' : f.status === 'stun' ? 'gold4' : 'cold5';
          juice.float(label, x, y - 30, color);
          const v = this.enemies.get(f.uid);
          if (v && f.status === 'freeze') v.countdown += f.amount;
          if (v && f.status === 'stun') v.stunned = true;
          break;
        }
        case 'proc':
          if (f.text) {
            const [x, y] = f.uid !== undefined ? this.enemyPos(f.uid) : [hx, hy - 50];
            juice.float(f.text, x, y - 16, 'gold4', { max: 1.2 });
          }
          break;
        case 'kill':
          break;
      }
    }
  }

  private hitEnemyFx(f: Effect) {
    const v = f.uid !== undefined ? this.enemies.get(f.uid) : undefined;
    if (!v) return;
    const juice = this.h.juice;
    const [x, y] = this.enemyPos(v.uid);
    if (f.amount > 0) {
      if (v.chip <= v.hp) v.chip = v.hp;
      v.chipHold = 0.35;
      v.hp = Math.max(0, v.hp - f.amount);
      v.flash = 1;
      v.flashColor = 'white';
      v.hurtT = 0.2;
      v.offX += Math.min(12, 3 + f.amount / 6);
      const big = f.amount >= 30;
      juice.float(`${f.amount}`, x + rand(-6, 6), y - 10, big ? 'gold4' : 'cream', { scale: big || f.source === 'strike' ? 2 : 1, outline: 'red1', max: 1 });
      burst(this.h.ps, x, y, big ? 22 : 10, { ramp: ['white', 'paper', 'red4', 'red3'], add: true, layer: 'ui', speed: [30, 130], max: 0.4 });
      if (f.source === 'strike') burst(this.h.ps, x, y, 12, { ramp: ['white', 'paper', 'paper2'], layer: 'ui', speed: [40, 140], ay: 200, max: 0.7, kind: 'shard', size: 2 });
      this.h.audio.play('hit', 0.8 + Math.random() * 0.4);
      if (big) {
        juice.shake(0.45);
        juice.stop(0.07);
      }
    } else if (f.text) juice.float(f.text, x, y - 10, 'teal5');
    if (f.blocked) juice.float(`-${f.blocked} щит`, x + 14, y + 4, 'cold5');
  }

  hurtHero(h: { amount: number; armor: number; red: number } | undefined, burnArmor: boolean) {
    if (!h) return;
    const juice = this.h.juice;
    const au = this.h.audio;
    const d = this.h.disp;
    if (burnArmor) d.armor = 0;
    else d.armor = Math.max(0, d.armor - h.armor);
    d.hp = Math.max(0, d.hp - h.red);
    const [hx, hy] = this.heroChest();
    if (h.armor > 0) {
      this.hero.set('block', h.red > 0 ? 0.12 : 0.4);
      this.hero.flash = 0.8;
      this.hero.flashColor = 'cold6';
      for (let k = 0; k < 9; k++)
        this.h.ps.spawn({ x: hx + 18, y: hy - 20 + k * 5, vx: rand(20, 60), vy: rand(-30, 30), max: 0.4, ramp: ['white', 'cold6', 'cold4'], add: true, layer: 'ui', size: 2 });
      burst(this.h.ps, hx + 16, hy, 16, { ramp: ['white', 'cold6', 'cold5', 'cold3'], add: true, layer: 'ui', speed: [30, 100], max: 0.45 });
      if (h.red > 0) juice.float(`броня −${h.armor}`, hx, hy - 50, 'cold5', { outline: 'ink0' });
      else juice.float('БЛОК', hx, hy - 54, 'cold5', { outline: 'ink0', scale: 2 });
      au.play('armor', 0.7);
      juice.shake(0.15);
    }
    if (h.red > 0) {
      this.hero.set('hurt', 0.4);
      this.hero.flash = 1;
      this.hero.flashColor = 'red4';
      this.hero.offX = -10;
      juice.shake(0.3 + Math.min(0.6, h.red / 20));
      juice.flash('red2', 0.15 + Math.min(0.3, h.red / 40));
      juice.stop(0.07);
      juice.float(`−${h.red}`, hx, hy - 56, 'red4', { outline: 'ink0', scale: 2 });
      burst(this.h.ps, hx, hy, 16, { ramp: ['red4', 'red3', 'red1'], layer: 'ui', speed: [30, 100], ay: 180, max: 0.5 });
      this.heartPulse = 0.4;
      au.play('hurt');
    }
  }

  /** Spotlight one enemy: its bubble rises with a caption, the others and the board go dark. */
  private focusEnemy(uid: number, caption: string) {
    this.boardDimTarget = 1;
    for (const [id, v] of this.enemies) {
      v.acting = id === uid;
      v.dimTarget = id === uid ? 0 : 1;
      if (id === uid) {
        v.caption = caption;
        v.captionT = 1.6;
        v.offX = -4;
      }
    }
  }

  private enqueueEnemyAct(e: Extract<GameEvent, { t: 'enemyAct' }>) {
    const S = this.h.steps;
    const juice = this.h.juice;
    const au = this.h.audio;
    const kind = e.intent.kind;
    const view = () => this.enemies.get(e.uid);
    const def = view()?.def ?? '';
    const big = ENEMIES[def]?.size === 'boss' || ENEMIES[def]?.size === 'L';
    const blow = kind === 'attack' || kind === 'heavy' || kind === 'strike' || (kind === 'erase' && !e.cells) || (kind === 'pinch' && !e.cells);
    const heavy = blow && (kind === 'heavy' || big);
    const name = INTENT_TEXT[kind] ?? kind;
    const caption = e.skipped ? 'Пропускает ход' : blow ? `${name} ${e.hurt?.amount ?? 0}` : `${name}${e.intent.value > 1 && kind !== 'heal' && kind !== 'block' ? ` ×${e.intent.value}` : ''}`;
    S.push({
      dur: 0.16,
      begin: () => {
        this.focusEnemy(e.uid, caption);
        au.play('enemy', 0.8 + Math.random() * 0.3);
      },
    });
    if (e.skipped) {
      S.push({
        dur: 0.45,
        begin: () => {
          const [x, y] = this.enemyPos(e.uid);
          juice.float(kind === 'censor' ? 'Цензура не действует' : 'z z z', x, y - 30, 'gold4');
        },
      });
      return;
    }
    const windDur = heavy ? 0.46 : blow ? 0.3 : 0.24;
    S.push({
      dur: windDur,
      begin: () => {
        const v = view();
        if (!v) return;
        v.windT = windDur + 0.04;
        v.offX = 6;
      },
      tick: (k) => {
        const v = view();
        if (v) v.charge = k;
        if (heavy && k > 0.5) juice.shake(0.015);
      },
    });
    if (blow) {
      const shot = SHOTS[def] ?? { color: 'cream', trail: ['cream', 'grey3', 'grey2'] };
      const travel = heavy ? 0.26 : 0.22;
      S.push({
        dur: travel,
        begin: () => {
          const v = view();
          if (!v) return;
          v.windT = 0;
          v.charge = 0;
          v.attackT = travel + 0.2;
          v.offX = heavy ? -30 : -18;
          const [ox, oy] = this.so();
          const [mx, my] = v.muzzle(this.h.t);
          const [hx, hy] = this.heroChest();
          juice.shoot({ x0: ox + mx, y0: oy + my, x1: hx, y1: hy, dur: travel, arc: shot.arc ?? 22, color: shot.color, trail: shot.trail, size: (shot.size ?? 4) + (heavy ? 2 : 0), light: hex(shot.trail[1] ?? shot.color) });
          au.play(heavy ? 'rocket' : 'swap', heavy ? 0.7 : 0.8);
        },
        end: () => {
          const [hx, hy] = this.heroChest();
          burst(this.h.ps, hx, hy, heavy ? 22 : 12, { ramp: ['white', ...shot.trail], add: true, layer: 'ui', speed: [30, heavy ? 150 : 100], max: 0.4 });
          this.hurtHero(e.hurt, true);
          if (heavy) juice.shake(0.5);
          if (e.board) {
            this.board.set(e.board, this.h.t);
            for (const i of e.cells ?? []) {
              const vt = this.board.tiles.get(e.board[i]?.id ?? -1);
              if (vt) vt.flash = 1;
            }
          }
        },
      });
      S.push({ dur: heavy ? 0.36 : 0.28 });
    } else if (e.cells?.length && e.board) {
      const color = kind === 'ink' ? 'vio3' : kind === 'ember' ? 'orange3' : kind === 'censor' ? 'ink0' : kind === 'pin' ? 'grey4' : kind === 'tape' ? 'red3' : kind === 'anchor' ? 'teal3' : 'cold4';
      const trail = kind === 'ember' ? FIRE : kind === 'ink' ? FAM_TRAIL.ink : kind === 'tape' ? ['paper', 'red4', 'red2'] : ['grey4', 'grey3', 'grey2'];
      S.push({
        dur: kind === 'pinch' ? 0.3 : 0.36,
        begin: () => {
          const v = view();
          if (v) {
            v.windT = 0;
            v.charge = 0;
            v.attackT = 0.4;
            v.offX = -10;
          }
          const [ox, oy] = this.so();
          const [x, y] = v ? v.muzzle(this.h.t) : [0, 0];
          if (kind === 'pinch') return;
          for (const i of e.cells!) {
            const [tx, ty] = this.board.center(i);
            juice.shoot({ x0: ox + x, y0: oy + y, x1: tx, y1: ty, dur: 0.32, arc: 40, color, trail, size: 3 });
          }
          if (kind === 'tape') au.play('paper');
        },
        end: () => {
          if (e.board) this.board.set(e.board, this.h.t);
          if (kind === 'anchor' && this.run.combat) this.board.colLock = this.run.combat.board.colLock.slice();
          for (const i of e.cells!) {
            const [tx, ty] = this.board.center(i);
            burst(this.h.ps, tx, ty, 10, { ramp: trail, layer: 'ui', speed: [20, 70], max: 0.4 });
            const vt = this.board.tiles.get(e.board![i]?.id ?? -1);
            if (vt) vt.flash = 0.8;
          }
          if (kind === 'tape' && e.added) juice.float('+Волокита в мешок', this.board.bx + this.board.bw / 2, this.board.by - 12, 'red4', { max: 1.3 });
          if (kind === 'ink') au.play('match', 0.5);
          if (kind === 'pin' || kind === 'anchor') au.play('armor', 1.4);
          if (kind === 'ember') au.play('ember');
        },
      });
      S.push({ dur: 0.22 });
    } else {
      S.push({
        dur: 0.4,
        begin: () => {
          const v = view();
          if (v) {
            v.windT = 0;
            v.charge = 0;
            v.attackT = 0.3;
          }
          const [x, y] = this.enemyPos(e.uid);
          switch (kind) {
            case 'block':
              juice.float(`+${e.intent.value} щит`, x, y - 20, 'cold5');
              if (v) {
                v.block = e.intent.value;
                v.flash = 0.8;
                v.flashColor = 'cold5';
              }
              au.play('armor', 0.8);
              break;
            case 'heal':
              if (e.healed) {
                const [hx, hy] = this.enemyPos(e.healed.uid);
                burst(this.h.ps, hx, hy, 14, { ramp: ['green4', 'green3', 'green2'], add: true, layer: 'ui', speed: [10, 40], ay: -40, max: 0.7 });
                juice.float(`+${e.healed.amount}`, hx, hy - 16, 'green4');
                const hv = this.enemies.get(e.healed.uid);
                if (hv) hv.hp = Math.min(hv.maxHp, hv.hp + e.healed.amount);
              }
              break;
            case 'summon':
              for (const s of e.summoned ?? []) {
                const nv = new EnemyView(s, L.w + 40);
                nv.dimTarget = 1;
                this.enemies.set(s.uid, nv);
              }
              this.layoutActors();
              au.play('paper');
              break;
            case 'hurry':
              au.play('phone');
              juice.float('Все торопятся!', x, y - 20, 'orange4');
              for (const o of this.enemies.values()) if (o.uid !== e.uid) o.countdown = Math.max(1, o.countdown - 1);
              break;
            case 'stealCharge':
            case 'stealCoins': {
              const coins = kind === 'stealCoins';
              const n = e.stolen ?? 0;
              if (coins) this.h.disp.coins = Math.max(0, this.h.disp.coins - n);
              else this.h.disp.charge = Math.max(0, this.h.disp.charge - n);
              juice.float(n ? `-${n} ${coins ? 'монет' : 'чернил'}` : 'Нечего красть', x, y - 20, coins ? 'gold4' : 'vio5');
              break;
            }
            case 'submerge':
              if (v) v.submerged = true;
              juice.float('Нырнул', x, y - 20, 'teal5');
              break;
            case 'shine':
              if (v) v.shining = true;
              juice.flash('cold6', 0.25);
              juice.float('Блеск: удар отражается', x, y - 26, 'cold6');
              break;
            case 'tide':
              juice.float('Прилив!', x, y - 20, 'teal5');
              au.play('rocket');
              if (e.board) this.board.set(e.board, this.h.t);
              this.board.flood = this.run.combat?.board.flood ?? this.board.flood + 1;
              break;
          }
        },
      });
      S.push({ dur: 0.12 });
    }
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt: number, frozen: boolean, speed: number) {
    this.board.layout();
    this.board.update(frozen ? 0 : dt * speed);
    this.hero.update(dt);
    for (const v of this.enemies.values()) v.update(dt);
    for (const [uid, v] of this.enemies) if (v.dying > 0.8) this.enemies.delete(uid);
    this.tally.update(dt);
    if (!frozen) this.tally.burn(this.h.ps);
    this.heartPulse = Math.max(0, this.heartPulse - dt);
    this.boardDim += (this.boardDimTarget - this.boardDim) * Math.min(1, dt * 8);
    this.updatePreview();
  }

  private candidate(): Move | null {
    const b = this.board;
    const m = b.dragMove();
    if (m) return m;
    if (!b.drag && b.selected >= 0 && b.hover >= 0 && adjacent(b.selected, b.hover, this.h.mods.wrap)) return { from: b.selected, to: b.hover };
    return null;
  }

  private updatePreview() {
    const b = this.board;
    const m = this.canPlay() ? this.candidate() : null;
    if (!m || !this.run.combat) {
      b.highlight = [];
      b.blastCells = [];
      b.previewText = '';
      return;
    }
    const block = swapBlock(this.run.combat.board, m, this.h.mods.wrap);
    const p = previewMove(this.run, this.h.mods, m);
    b.highlight = p.valid ? p.groups : [];
    b.blastCells = p.blast ? p.blast.cells : [];
    const parts: string[] = [];
    if (p.damage) parts.push(`урон ~${p.damage}`);
    if (p.armor) parts.push(`броня +${p.armor}`);
    if (p.charge) parts.push(`чернила +${p.charge}`);
    if (p.coins) parts.push(`монеты +${p.coins}`);
    if (p.specials) parts.push('особая!');
    b.previewText = block ?? (p.valid ? parts.join(' · ') || (p.blast ? 'взрыв' : 'совпадение') : 'нет совпадения');
  }

  /** Damage the next tick will deal after armor (the health bar blinks that much). */
  incoming(): number {
    const c = this.run.combat;
    if (!c || !this.active || this.h.busy()) return 0;
    let armor = this.h.disp.armor;
    let total = 0;
    for (const e of alive(c)) {
      if (e.countdown > 1 || e.stunned) continue;
      const d = intentDamage(c, e);
      if (d <= 0) continue;
      total += Math.max(0, d - armor);
      armor = 0;
    }
    return total;
  }

  // ── Input ─────────────────────────────────────────────────────────

  canPlay() {
    return this.active && !this.h.busy() && this.run.phase === 'combat';
  }

  pointerDown(x: number, y: number) {
    if (!this.canPlay()) return false;
    const cell = this.board.cellAt(x, y);
    if (this.targeting) {
      this.aimAt(x, y, cell);
      return true;
    }
    if (cell < 0) {
      this.board.selected = -1;
      return false;
    }
    this.board.startDrag(cell, x, y);
    return true;
  }

  pointerMove(x: number, y: number) {
    this.board.hover = this.canPlay() && !this.targeting ? this.board.cellAt(x, y) : -1;
    if (this.targeting && this.run.combat) {
      const cell = this.board.cellAt(x, y);
      const aim = this.targeting.aim;
      const r = this.h.mods.bombRadius;
      const bomb = this.targeting.kind === 'pocket' && this.run.hero.pockets[this.targeting.slot ?? -1] === 'bomb';
      this.board.aimCells =
        cell < 0
          ? []
          : bomb
            ? Array.from({ length: 36 }, (_, i) => i).filter((i) => Math.abs((i % 6) - (cell % 6)) <= r && Math.abs(Math.floor(i / 6) - Math.floor(cell / 6)) <= r)
            : aim === 'col'
              ? Array.from({ length: 6 }, (_, k) => k * 6 + (cell % 6))
              : aim === 'cell'
                ? [cell]
                : [];
    }
    if (this.board.drag) this.board.dragTo(x, y);
  }

  pointerUp() {
    const b = this.board;
    if (L.touch) b.hover = -1;
    const d = b.drag;
    if (!d) return;
    if (!d.moved) {
      b.drag = null;
      if (b.selected < 0 || b.selected === d.cell) b.selected = b.selected === d.cell ? -1 : d.cell;
      else if (adjacent(b.selected, d.cell, this.h.mods.wrap)) this.trySwap({ from: b.selected, to: d.cell });
      else b.selected = d.cell;
      return;
    }
    const m = b.dragMove();
    if (m) this.trySwap(m);
    else b.dropBack();
  }

  trySwap(m: Move) {
    const c = this.run.combat;
    if (!c) return;
    const b = this.board;
    if (isValidMove(c.board, m, this.h.mods.wrap)) {
      b.selected = -1;
      this.h.act({ type: 'move', move: m });
      return;
    }
    b.refuse(m);
    b.selected = -1;
    b.shake = 0.6;
    this.h.fail(swapBlock(c.board, m, this.h.mods.wrap) ?? 'Нет совпадения');
  }

  private aimAt(x: number, y: number, cell: number) {
    const tg = this.targeting!;
    const done = () => {
      this.targeting = null;
      this.board.aimCells = [];
    };
    if (tg.kind === 'pocket') {
      if (cell >= 0) this.h.act({ type: 'pocket', slot: tg.slot!, cell });
      done();
      return;
    }
    if (tg.aim === 'cell' && cell >= 0) this.h.act({ type: 'active', cell });
    else if (tg.aim === 'col' && cell >= 0) this.h.act({ type: 'active', col: cell % 6 });
    else if (tg.aim === 'enemy') {
      const v = this.enemyAt(x, y);
      if (v) this.h.act({ type: 'active', uid: v.uid });
    }
    done();
  }

  enemyAt(x: number, y: number): EnemyView | undefined {
    const [ox, oy] = this.so();
    for (const v of this.enemies.values()) {
      if (v.dying > 0) continue;
      const f = v.frame(this.h.t);
      const left = ox + v.x - f.ox;
      const top = oy + v.y - f.oy;
      if (x >= left - 4 && x <= left + f.w + 4 && y >= top - 24 && y <= oy + v.y + 20) return v;
    }
    return undefined;
  }

  useActive() {
    const id = this.run.hero.active;
    if (!id || !this.canPlay()) return;
    const def = ITEMS[id];
    if (this.run.hero.charge < (def.charge ?? 0)) {
      this.h.fail('Мало чернил');
      return;
    }
    if (def.aim) {
      this.targeting = { kind: 'active', aim: def.aim };
      this.h.toast(def.aim === 'cell' ? 'Выбери фишку' : def.aim === 'col' ? 'Выбери столбец' : 'Выбери врага', 2);
    } else this.h.act({ type: 'active' });
  }

  usePocket(slot: number) {
    const id = this.run.hero.pockets[slot];
    if (!id || !this.canPlay()) return;
    const def = POCKETS[id];
    if (def.aim === 'cell') {
      this.targeting = { kind: 'pocket', aim: 'cell', slot };
      this.h.toast(`${def.name}: выбери клетку`, 2);
    } else this.h.act({ type: 'pocket', slot });
  }

  cancelTarget() {
    if (!this.targeting) return false;
    this.targeting = null;
    this.board.aimCells = [];
    return true;
  }

  key(k: string, shift: boolean): boolean {
    if (!this.active) return false;
    const b = this.board;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    const d = dirs[k] ?? dirs[k.toLowerCase()];
    if (d && this.canPlay()) {
      if (b.cursor < 0) b.cursor = 14;
      const [dx, dy] = d;
      if (shift || b.selected === b.cursor) {
        const to = b.neighbour(b.cursor, dx, dy);
        if (to >= 0) {
          const from = b.cursor;
          b.cursor = to;
          this.trySwap({ from, to });
          if (!this.h.busy()) b.cursor = from;
        }
      } else {
        const c = (b.cursor % 6) + dx;
        const r = Math.floor(b.cursor / 6) + dy;
        if (c >= 0 && c < 6 && r >= 0 && r < 6) b.cursor = r * 6 + c;
      }
      return true;
    }
    if ((k === ' ' || k === 'Enter') && this.canPlay()) {
      if (b.cursor < 0) b.cursor = 14;
      b.selected = b.selected === b.cursor ? -1 : b.cursor;
      return true;
    }
    if (k === 'q' || k === 'Q' || k === 'й' || k === 'Й') {
      this.useActive();
      return true;
    }
    if (['1', '2', '3', '4', '5'].includes(k)) {
      this.usePocket(Number(k) - 1);
      return true;
    }
    if (k === 'Tab' && this.run.combat) {
      const list = alive(this.run.combat);
      const i = list.findIndex((e) => e.uid === this.run.combat!.target);
      const next = list[(i + 1) % list.length];
      if (next) this.h.act({ type: 'target', uid: next.uid });
      return true;
    }
    return false;
  }

  /** Card rules of the tile under the pointer: after a short hover, or a long press on touch. */
  private tipCell = -1;
  private tipFrom = 0;
  private tileTip(ctx: import('./sprite.ts').Ctx2D, ui: UI) {
    const b = this.board;
    const p = ui.p;
    const cell = p.inside && this.active ? b.cellAt(p.x, p.y) : -1;
    const still = !b.drag || !b.drag.moved;
    if (cell !== this.tipCell || !still) {
      this.tipCell = cell;
      this.tipFrom = this.h.t;
      return;
    }
    const wait = L.touch ? 0.45 : 0.6;
    if (cell < 0 || this.h.t - this.tipFrom < wait || (L.touch && !p.down)) return;
    const tile = this.run.combat?.board.cells[cell];
    if (!tile || tile.hidden) return;
    if (L.touch && b.drag) {
      // A long press is a look, not a move.
      b.drag = null;
      b.selected = -1;
    }
    const [cx, cy] = b.center(cell);
    let title = '';
    let body = '';
    if (tile.kind === 'junk') {
      title = tile.card === 'redtape' ? 'Волокита' : 'Клякса';
      body = 'Не собирается. Исчезает, если рядом собрать группу или взорвать.';
    } else if (tile.kind === 'prism') {
      title = 'Призма';
      body = 'Подходит к любому семейству. Обменяй с фишкой — сотрёт всё её семейство.';
    } else if (tile.card) {
      title = cardName({ id: tile.card, up: !!tile.up, finish: tile.finish });
      body = cardRules({ id: tile.card, up: !!tile.up, finish: tile.finish });
    }
    if (tile.special) body += tile.special === 'bomb' ? '\nБомба: взрыв 3×3.' : '\nРакета: чистит линию.';
    if (tile.pin) body += '\nПрибита скобой: не двигается.';
    if (tile.fuse) body += `\nУголёк: сгорит через ${tile.fuse}.`;
    if (title) ui.tooltip(title, body, cx + b.T / 2, cy - 30, FAM_COLORS[tile.kind as keyof typeof FAM_COLORS]?.light ?? 'gold4');
  }

  // ── Draw ──────────────────────────────────────────────────────────

  /** Actors inside the stage buffer (before lighting). */
  drawActors(ctx: import('./sprite.ts').Ctx2D) {
    const t = this.h.t;
    this.hero.draw(ctx, t);
    const target = this.run.combat?.target;
    const list = [...this.enemies.values()].sort((a, b) => b.x - a.x);
    for (const v of list) v.draw(ctx, t, v.uid === target && this.active);
  }

  /** Key lights on the actors so they read in dark rooms. */
  actorLights(): import('./lighting.ts').Light[] {
    const out: import('./lighting.ts').Light[] = [];
    out.push({ x: this.hero.x + 6, y: STAGE_FEET - 50, r: 70, color: '#ffd2a0', intensity: 0.6, flicker: 'none', seed: 0 });
    for (const v of this.enemies.values())
      if (v.dying === 0) {
        const r = v.size === 'boss' ? 110 : v.size === 'L' ? 90 : 70;
        out.push({ x: v.x - 6, y: STAGE_FEET - 50, r: v.acting ? r + 16 : r, color: v.acting ? '#ffd6b0' : '#e2dcff', intensity: v.acting ? 0.95 : 0.62 * (1 - v.dim * 0.6), flicker: 'none', seed: v.uid });
      }
    return out;
  }

  /** Board, counter, enemy UI and the side panels (screen space, unlit). */
  drawUI(ctx: import('./sprite.ts').Ctx2D, ui: UI) {
    const t = this.h.t;
    const c = this.run.combat;
    const b = this.board;
    if (b.visible > 0) {
      b.draw(ctx, t, (a, bb) => (c ? !swapBlock(c.board, { from: a, to: bb }, this.h.mods.wrap) : false));
      if (this.boardDim > 0.02) {
        ctx.globalAlpha = this.boardDim * 0.5 * b.visible;
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(b.bx - 7, b.by - 7, b.bw + 14, b.bh + 14);
        ctx.globalAlpha = 1;
      }
    }
    if (!this.active && b.visible <= 0) return;
    this.tally.draw(ctx, t);
    const [ox, oy] = this.so();
    const target = c?.target;
    for (const v of this.enemies.values()) {
      const e = c?.enemies.find((x) => x.uid === v.uid);
      const dmg = e && c && v.intentDamages() ? intentDamage(c, e) : 0;
      v.drawUI(ctx, t, v.uid === target, dmg, ox, oy, L.top.h + 2);
      if (this.canPlay()) {
        const f = v.frame(t);
        const hit = ui.area(`enemy-${v.uid}`, ox + v.x - f.ox, oy + v.y - f.oy - 20, f.w, f.h + 36);
        if (hit) {
          if (this.targeting?.aim === 'enemy') {
            this.h.act({ type: 'active', uid: v.uid });
            this.targeting = null;
          } else this.h.act({ type: 'target', uid: v.uid });
        }
        if (ui.hovered === `enemy-${v.uid}`) {
          const tip = v.tooltip(dmg);
          ui.tooltip(tip.title, tip.body, ui.p.x, ui.p.y, 'red4');
        }
      }
    }
    // Boss bar.
    if (c?.kind === 'boss') {
      const boss = c.enemies[0];
      const v = this.enemies.get(boss.uid);
      if (v && v.dying === 0 && L.mode === 'wide') drawBossBar(ctx, ENEMIES[boss.def].name, v.hp, v.maxHp, L.top.h + 4, t);
    }
    // Skill, pockets, relics, bag.
    const r = this.skillRect();
    if (drawSkill(ctx, ui, r, this.run, this.h.disp, t)) this.useActive();
    const [px, py] = this.pocketXY();
    const slot = drawPockets(ctx, ui, px, py, this.pocketSize(), this.run, this.targeting?.kind === 'pocket' ? (this.targeting.slot ?? -1) : -1);
    if (slot >= 0) this.usePocket(slot);
    if (L.mode === 'wide') {
      drawRelics(ctx, ui, L.side2, this.run);
      const bag = c?.board.bag.length ?? 0;
      const total = c?.board.source.length ?? 0;
      if (c) text(ctx, bag > 0 ? `Мешок: ${bag} из ${total}` : `Мешок: ${total} фишек`, L.side.x, py + this.pocketSize() + 6, 'cold3');
      if (ui.area('bag', L.side.x, py + this.pocketSize() + 4, 70, 10)) void 0;
      if (ui.hovered === 'bag') ui.tooltip('Мешок фишек', 'Поле пополняется из мешка: каждая карта колоды — 3 фишки. Кончится — соберётся заново.', ui.p.x, ui.p.y - 40);
      if (c) text(ctx, `ход ${c.moves + 1}${c.moves >= 20 ? ' · сверхурочные!' : ''}`, L.side.x, py + this.pocketSize() + 16, c.moves >= 20 ? 'red4' : 'cold3');
    } else {
      drawRelics(ctx, ui, { x: 4, y: L.top.h + 2, w: Math.min(L.w - 8, 17 * 8), h: 17 }, this.run);
    }
    // First-move hint, in the counter's place while it is still empty.
    if (c && this.run.stats.moves === 0 && this.canPlay()) {
      const a = 0.7 + Math.sin(t * 4) * 0.25;
      const r = L.tally;
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(r.x, r.y, r.w, L.mode === 'wide' ? 60 : r.h);
      if (L.mode === 'wide') {
        paragraph(ctx, 'Потяни фишку на соседнюю клетку: три одинаковых в ряд — это ход.', r.x + 6, r.y + 6, r.w - 12, 'gold4', { alpha: a });
        paragraph(ctx, 'Все фишки хода складываются в УРОН × МНОЖ. Враги ходят по таймерам.', r.x + 6, r.y + 32, r.w - 12, 'cold5', { alpha: a });
      } else text(ctx, 'Потяни фишку к соседней: 3 в ряд — ход', r.x + r.w / 2, r.y + r.h / 2 - 4, 'gold4', { align: 'center', alpha: a });
    }
    if (this.targeting) text(ctx, L.touch ? 'Коснись цели · вне поля — отмена' : 'Выбери цель · Esc — отмена', L.w / 2, b.by - 20, 'orange4', { align: 'center', outline: 'ink0' });
    this.tileTip(ctx, ui);
    void CARDS;
  }
}

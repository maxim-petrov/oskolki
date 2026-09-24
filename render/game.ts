import { alive, intentDamage, activeCost, previewMove } from '../game/combat.ts';
import { ENEMIES, INTENT_TEXT } from '../game/content/enemies.ts';
import { FLOORS } from '../game/content/floors.ts';
import { ITEMS, TRANSFORMATIONS, type Mods, type Tag } from '../game/content/items.ts';
import { adjacent, isValidMove, swapBlock } from '../game/board.ts';
import { currentRoom, dispatch, modsOf, saveRun } from '../game/run.ts';
import { STEP } from '../game/mapgen.ts';
import type { Action, Dir, Effect, GameEvent, Move, RunState } from '../game/types.ts';
import { EnemyView, HERO_X, HeroView, enemySlots } from './actors.ts';
import { BH, BW, BX, BY, BoardView, T } from './boardview.ts';
import { text } from './font.ts';
import { drawActive, drawBossBar, drawHearts, drawItemsBar, drawMinimap, drawResources, type Disp, HUD } from './hud.ts';
import { Juice } from './juice.ts';
import { Lighting, type Light } from './lighting.ts';
import { FAM_COLORS, hex } from './palette.ts';
import { Particles, burst, rand } from './particles.ts';
import { FLOOR_Y, RoomScene, VH, VW, ditherFade, drawDanger, drawVignette } from './scene.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';
import { easeOut } from './tween.ts';
import { panel, type UI } from './ui.ts';
import { CHEST_SPRITES, drawRoomUI, drawRoomWorld, trapdoorX } from './room.ts';
import type { App } from './app.ts';

interface Step {
  dur: number;
  t?: number;
  begin?: () => void;
  tick?: (k: number) => void;
  end?: () => void;
}

interface Banner {
  title: string;
  sub: string;
  icon?: string;
  t: number;
  max: number;
  color: string;
  big?: boolean;
}

const FAM_TRAIL: Record<string, string[]> = {
  blade: ['cream', 'red4', 'red3', 'red2'],
  shield: ['cold6', 'cold5', 'cold4', 'cold3'],
  ink: ['vio5', 'vio4', 'vio3', 'vio2'],
  coin: ['cream', 'gold4', 'gold3', 'gold2'],
  prism: ['white', 'cold6', 'vio5', 'gold4'],
};

const FIRE = ['cream', 'gold4', 'orange3', 'red2'];

/** How each enemy's blow crosses the room to the hero: colour, trail, size and arc of the shot. */
const SHOTS: Record<string, { color: string; trail: string[]; size?: number; arc?: number }> = {
  rat: { color: 'paper', trail: ['cream', 'paper', 'paper2'] },
  stapler: { color: 'grey4', trail: ['white', 'grey4', 'grey2'], arc: 10 },
  blot: { color: 'vio3', trail: FAM_TRAIL.ink },
  drop: { color: 'teal4', trail: ['teal5', 'teal4', 'teal2'] },
  moth: { color: 'paper2', trail: ['cream', 'paper2', 'grey2'], arc: 40 },
  eraser: { color: 'red4', trail: ['red5', 'red4', 'red2'], size: 4 },
  cabinet: { color: 'wood4', trail: ['paper', 'wood4', 'wood2'], size: 5 },
  scribe: { color: 'vio4', trail: FAM_TRAIL.ink },
  crab: { color: 'teal3', trail: ['teal5', 'teal3', 'teal1'], size: 4 },
  eel: { color: 'vio3', trail: ['vio5', 'vio3', 'teal2'] },
  angler: { color: 'gold4', trail: ['cream', 'gold4', 'teal3'] },
  anchor: { color: 'grey3', trail: ['grey4', 'grey3', 'teal2'], size: 5, arc: 50 },
  tide: { color: 'teal5', trail: ['white', 'teal5', 'teal3'], size: 5 },
  candle: { color: 'orange3', trail: FIRE },
  stoker: { color: 'orange4', trail: FIRE, size: 4, arc: 40 },
  bell: { color: 'gold4', trail: ['cream', 'gold4', 'gold2'], arc: 0 },
  safe: { color: 'grey4', trail: ['white', 'grey4', 'gold3'], size: 5 },
  archivist: { color: 'paper', trail: ['cream', 'paper', 'teal3'] },
  mirror: { color: 'cold6', trail: ['white', 'cold6', 'teal5'], size: 4, arc: 10 },
  shard: { color: 'cold5', trail: ['white', 'cold5', 'cold3'], arc: 8 },
  stamp: { color: 'red3', trail: ['red5', 'red3', 'red1'], size: 4 },
  secretary: { color: 'paper', trail: ['cream', 'paper', 'grey3'], arc: 40 },
  censor: { color: 'red3', trail: ['red4', 'red2', 'ink0'], size: 6 },
};

const halves = (n: number) => `${Math.floor(n / 2) || ''}${n % 2 ? '½' : ''}` || '0';

export class GameView {
  run: RunState;
  mods: Mods;
  scene!: RoomScene;
  sceneRoom = -1;
  board = new BoardView();
  hero = new HeroView();
  enemies = new Map<number, EnemyView>();
  ps = new Particles();
  juice = new Juice(this.ps);
  lighting = new Lighting(VW, VH);
  disp: Disp;
  steps: Step[] = [];
  cur: Step | null = null;
  t = 0;
  banners: Banner[] = [];
  toast: { s: string; t: number } | null = null;
  targeting: null | { kind: 'active' | 'bomb' | 'wall'; aim?: 'cell' | 'col' | 'enemy' } = null;
  inCombat = false;
  fade = 1;
  fadeTo = 0;
  paused = false;
  ending: null | { kind: 'dead' | 'won'; t: number } = null;
  coinFlash = 0;
  heartPulse = 0;
  /** Where each floor pickup was last drawn, so a collected one flies from its own spot. */
  pickupPos = new Map<number, [number, number]>();
  /** Opened chests stay on the floor for a moment after their loot flies out. */
  openChests: { x: number; y: number; sprite: string; t: number }[] = [];
  private lootFrom: { x: number; y: number; t: number } | null = null;
  rocketsSeen = 0;
  /** Enemy turn on screen: the board steps back into the dark so the actors read. */
  boardDim = 0;
  boardDimTarget = 0;

  constructor(
    public app: App,
    run: RunState,
    initialEvents: GameEvent[],
  ) {
    this.run = run;
    this.mods = modsOf(run);
    this.disp = this.heroDisp();
    this.hero.char = run.hero.char;
    this.juice.shakeScale = app.profile.settings.shake;
    this.buildScene();
    if (initialEvents.length) for (const e of initialEvents) this.enqueue(e);
    else if (run.combat) this.showCombat(false);
    this.push({ dur: 0, end: () => this.settle() });
  }

  // ── State helpers ─────────────────────────────────────────────────

  heroDisp(): Disp {
    const h = this.run.hero;
    return {
      hearts: h.hearts,
      hp: h.hp,
      soul: h.soul,
      armor: h.armor,
      armorCap: this.mods.armorCap,
      charge: h.charge,
      cost: activeCost(this.run),
      coins: h.coins,
      bombs: h.bombs,
      keys: h.keys,
    };
  }

  busy() {
    return this.cur !== null || this.steps.length > 0;
  }

  push(s: Step) {
    this.steps.push(s);
  }

  wait(ms: number) {
    this.push({ dur: ms / 1000 });
  }

  floorFx() {
    return FLOORS[this.run.floor].fx;
  }

  buildScene() {
    const room = currentRoom(this.run);
    this.scene = new RoomScene(this.floorFx(), room.variant + room.id, room.kind);
    this.lighting.ambient = this.scene.look.ambient;
    this.lighting.lights = this.scene.lights;
    this.sceneRoom = room.id;
    this.ps.clear();
    this.pickupPos.clear();
    this.openChests = [];
    this.app.audio.ambience(this.floorFx());
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
    this.push({ dur: 0, end: () => this.settle() });
    this.persist();
    return true;
  }

  fail(reason: string, shake = true) {
    if (shake) this.board.shake = 1;
    this.app.audio.play('invalid');
    if (reason) this.toast = { s: reason, t: 1.4 };
  }

  persist() {
    if (this.run.phase === 'dead' || this.run.phase === 'won') this.app.endRun(this.run);
    else this.app.saveRun(saveRun(this.run));
  }

  /** The enemy turn is over: everyone back in the light. */
  endEnemyTurn() {
    this.boardDimTarget = 0;
    for (const v of this.enemies.values()) {
      v.acting = false;
      v.dimTarget = 0;
    }
  }

  /** Exact sync with the engine once animations are done. */
  settle() {
    this.endEnemyTurn();
    const c = this.run.combat;
    if (c && this.inCombat) {
      this.board.set(c.board.cells, this.t);
      this.board.queue = c.board.queue;
      this.board.flood = c.board.flood;
      this.board.colLock = c.board.colLock.slice();
      this.board.rowLock = c.board.rowLock.slice();
      this.board.preview = this.mods.preview;
      this.board.wrap = this.mods.wrap;
      const live = alive(c);
      for (const e of live) {
        let v = this.enemies.get(e.uid);
        if (!v) {
          v = new EnemyView(e, 700);
          this.enemies.set(e.uid, v);
        }
        v.sync(e);
      }
      for (const [uid, v] of this.enemies) if (!live.some((e) => e.uid === uid) && v.dying === 0) this.enemies.delete(uid);
      this.layoutEnemies();
    }
    this.disp = this.heroDisp();
    this.hero.char = this.run.hero.char;
  }

  layoutEnemies() {
    const c = this.run.combat;
    const list = [...this.enemies.values()].filter((v) => v.dying === 0);
    const slots = enemySlots(list.length, !!c?.boss);
    list
      .sort((a, b) => a.uid - b.uid)
      .forEach((v, k) => {
        v.tx = slots[k] ?? 600;
      });
  }

  // ── Event playback ────────────────────────────────────────────────

  enemyPos(uid: number): [number, number] {
    const v = this.enemies.get(uid);
    if (!v) return [540, FLOOR_Y - 20];
    return [v.x + v.offX, v.top(this.t) + 10];
  }

  showCombat(animate: boolean) {
    const c = this.run.combat;
    if (!c) return;
    this.inCombat = true;
    this.board.active = true;
    this.enemies.clear();
    for (const e of c.enemies) if (e.hp > 0) this.enemies.set(e.uid, new EnemyView(e, 700));
    this.layoutEnemies();
    for (const v of this.enemies.values()) v.x = v.tx + (animate ? 60 : 0);
    this.board.set(c.board.cells, this.t);
    this.board.queue = c.board.queue;
    this.board.flood = c.board.flood;
    this.board.colLock = c.board.colLock.slice();
    this.board.preview = this.mods.preview;
    this.board.wrap = this.mods.wrap;
    this.board.selected = -1;
    if (animate) {
      this.board.visible = 0;
      for (const v of this.board.tiles.values()) {
        const row = Math.round(v.y / T);
        this.board.moveTo(v.tile.id, row * 6 + Math.round(v.x / T), 0.35 + (5 - row) * 0.04, easeOut, [v.x, v.y - BH - 20]);
      }
    } else this.board.visible = 1;
  }

  enqueue(e: GameEvent) {
    switch (e.t) {
      case 'floor':
        this.push({
          dur: 1.6,
          begin: () => {
            const f = FLOORS[e.floor];
            this.banners.push({ title: f.name.toUpperCase(), sub: f.subtitle, t: 0, max: 2.2, color: 'cream', big: true });
            this.app.audio.play('phase');
          },
        });
        break;
      case 'enterRoom':
        this.push({
          dur: 0.18,
          tick: (k) => (this.fade = k),
          end: () => {
            this.inCombat = false;
            this.board.active = false;
            this.board.visible = 0;
            this.enemies.clear();
            this.buildScene();
            const from = e.dir === 'e' ? -20 : e.dir === 'w' ? 660 : HERO_X;
            this.hero.x = e.dir === null ? HERO_X : from;
            this.hero.state = 'walk';
            this.app.audio.play('door');
          },
        });
        this.push({
          dur: 0.28,
          tick: (k) => {
            this.fade = 1 - k;
            if (this.hero.state === 'walk') this.hero.x += (HERO_X - this.hero.x) * Math.min(1, k * 1.2);
          },
          end: () => {
            this.hero.x = HERO_X;
            this.hero.state = 'idle';
            this.fade = 0;
          },
        });
        break;
      case 'combatStart':
        this.push({
          dur: 0.5,
          begin: () => {
            this.showCombat(true);
            const c = this.run.combat;
            const seen = this.app.profile.seenEnemies;
            for (const en of c?.enemies ?? []) if (!seen.includes(en.def)) seen.push(en.def);
            if (e.boss) {
              const boss = c?.enemies[0];
              this.banners.push({ title: ENEMIES[boss?.def ?? '']?.name.toUpperCase() ?? 'БОСС', sub: ENEMIES[boss?.def ?? '']?.blurb ?? '', t: 0, max: 2.4, color: 'red4', big: true });
              this.app.audio.play('phase');
              this.juice.shake(0.4);
            }
          },
        });
        break;
      case 'swap':
        this.push({
          dur: 0.12,
          begin: () => {
            this.board.highlight = [];
            this.board.blastCells = [];
            this.board.previewText = '';
            this.board.animateSwap(e.move);
            this.app.audio.play('swap');
          },
          end: () => this.board.set(e.board, this.t),
        });
        break;
      case 'wave':
        this.enqueueWave(e);
        break;
      case 'effects':
        this.push({
          dur: e.effects.some((f) => f.kind !== 'proc') ? 0.2 : 0.05,
          begin: () => this.fireEffects(e.effects, BX + BW / 2, BY + BH / 2),
        });
        break;
      case 'tick':
        this.push({
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
            if (alarm) this.app.audio.play('alarm');
          },
        });
        break;
      case 'enemyAct':
        this.enqueueEnemyAct(e);
        break;
      case 'phase':
        this.push({
          dur: 0.7,
          begin: () => {
            const v = this.enemies.get(e.uid);
            if (v) {
              v.phase = e.phase;
              v.flash = 1;
              v.flashColor = 'red4';
              const [x, y] = this.enemyPos(e.uid);
              burst(this.ps, x, y, 30, { ramp: ['cream', 'red4', 'red3', 'red1'], add: true, layer: 'ui', speed: [40, 120], max: 0.6 });
            }
            this.juice.shake(0.7);
            this.juice.flash('red3', 0.35);
            this.banners.push({ title: 'ЯРОСТЬ', sub: 'Вторая фаза', t: 0, max: 1.2, color: 'red4' });
            this.app.audio.play('phase');
          },
        });
        break;
      case 'ember':
        this.push({
          dur: 0.35,
          begin: () => {
            for (const i of e.cells) {
              const [x, y] = this.board.center(i);
              burst(this.ps, x, y, 16, { ramp: ['cream', 'gold4', 'orange3', 'red2'], add: true, layer: 'ui', speed: [30, 90], max: 0.5 });
            }
            this.app.audio.play('ember');
            this.hurtHero(e.hurt, false);
          },
        });
        break;
      case 'board':
        this.push({
          dur: e.reason === 'reshuffle' ? 0.35 : 0.08,
          begin: () => {
            if (e.reason === 'reshuffle') {
              this.toast = { s: 'Ходов нет — перетасовка', t: 1.4 };
              const old = new Map([...this.board.tiles].map(([id, v]) => [id, [v.x, v.y] as [number, number]]));
              this.board.set(e.board, this.t);
              e.board.forEach((tile, i) => {
                const from = old.get(tile.id);
                if (from) this.board.moveTo(tile.id, i, 0.3, easeOut, from);
              });
            } else this.board.set(e.board, this.t);
            if (e.queue) this.board.queue = e.queue;
          },
        });
        break;
      case 'enemyDie':
        this.push({
          dur: 0.02,
          begin: () => {
            const v = this.enemies.get(e.uid);
            if (v) {
              v.dying = 0.001;
              const [x, y] = this.enemyPos(e.uid);
              const dark = this.floorFx() === 'boiler';
              burst(this.ps, x, y + 6, v.size === 'boss' ? 80 : 26, {
                ramp: dark ? ['gold4', 'orange3', 'grey2', 'grey1'] : ['white', 'cold5', 'grey3', 'grey1'],
                layer: 'mid',
                speed: [20, 90],
                ay: 140,
                max: 0.8,
                size: 1,
              });
              this.app.audio.play('kill');
              if (v.size === 'boss') {
                this.juice.shake(1);
                this.juice.flash('white', 0.6);
                this.juice.stop(0.2);
              }
            }
            for (const s of e.split ?? []) {
              const nv = new EnemyView(s, this.enemies.get(e.uid)?.x ?? 520);
              this.enemies.set(s.uid, nv);
            }
            this.layoutEnemies();
          },
        });
        break;
      case 'roomClear':
        this.push({
          dur: 0.5,
          begin: () => {
            this.app.audio.play('door');
            this.toast = { s: 'Комната зачищена', t: 1.2 };
          },
          end: () => {
            this.inCombat = false;
            this.board.active = false;
            this.enemies.clear();
          },
        });
        break;
      case 'pickup': {
        const chest = CHEST_SPRITES[e.pickup.kind];
        this.push({
          dur: chest ? 0.35 : 0.06,
          begin: () => {
            const at = this.pickupPos.get(e.pickup.id);
            if (chest) {
              // The chest opens where it stood; its contents fly out of it.
              const [x, y] = at ?? [300, FLOOR_Y + 16];
              this.openChests.push({ x, y, sprite: chest, t: 1.8 });
              this.lootFrom = { x, y: y - 10, t: this.t };
              burst(this.ps, x, y - 8, 22, { ramp: ['cream', 'gold4', 'gold3', 'orange3'], add: true, layer: 'ui', speed: [25, 80], max: 0.6, dir: -Math.PI / 2, spread: Math.PI * 0.8 });
              this.app.audio.play('chest');
              return;
            }
            const from = this.lootFrom && this.t - this.lootFrom.t < 1 ? this.lootFrom : null;
            const [x0, y0] = at ? [at[0], at[1] - 6] : from ? [from.x + rand(-6, 6), from.y] : [320 + rand(-40, 40), FLOOR_Y - 4];
            const target = this.pickupTarget(e.pickup.kind);
            this.juice.shoot({
              x0,
              y0,
              x1: target[0],
              y1: target[1],
              dur: 0.45,
              arc: 50,
              kind: 'sprite',
              sprite: `pk_${e.pickup.kind}`,
              color: 'gold4',
              trail: ['cream', 'gold4'],
              onArrive: () => {
                this.app.audio.play(e.pickup.kind === 'coin' || e.pickup.kind === 'nickel' ? 'coin' : 'pickup');
                this.disp = this.heroDisp();
              },
            });
          },
        });
        break;
      }
      case 'item':
        this.push({
          dur: e.transformation ? 1.6 : 1.3,
          begin: () => {
            if (e.transformation) {
              const tr = TRANSFORMATIONS[e.transformation as Tag];
              this.banners.push({ title: `ТРАНСФОРМАЦИЯ: ${tr.name.toUpperCase()}`, sub: tr.desc, t: 0, max: 2.6, color: 'vio5', big: true });
              this.juice.flash('vio4', 0.4);
            } else {
              const def = ITEMS[e.item];
              this.banners.push({ title: def.name, sub: def.tagline, icon: `item_${e.item}`, t: 0, max: 2.4, color: e.source === 'deal' ? 'red4' : 'gold4' });
              this.hero.set('hold', 1.2);
              this.hero.holdItem = e.item;
              this.app.audio.play('item');
              burst(this.ps, HERO_X, FLOOR_Y - 40, 24, { ramp: ['cream', 'gold4', 'gold3'], add: true, layer: 'ui', speed: [20, 70], max: 0.8 });
              if (!this.app.profile.seenItems.includes(e.item)) this.app.profile.seenItems.push(e.item);
            }
            this.mods = modsOf(this.run);
          },
        });
        break;
      case 'activeUsed':
        this.push({
          dur: 0.18,
          begin: () => {
            const def = ITEMS[e.item];
            this.juice.float(def.name, HUD.active[0] + 12, HUD.active[1] + 30, 'vio5');
            burst(this.ps, HUD.active[0] + 12, HUD.active[1] + 12, 18, { ramp: ['vio5', 'vio4', 'vio3'], add: true, layer: 'ui', speed: [20, 70], max: 0.5 });
            this.app.audio.play('ink', 0.8);
            this.disp.charge = Math.max(0, this.disp.charge - (def.charge ?? 0));
          },
        });
        break;
      case 'secret':
        this.push({
          dur: 0.6,
          begin: () => {
            this.juice.shake(0.6);
            this.app.audio.play('boom');
            this.banners.push({ title: 'СЕКРЕТНАЯ КОМНАТА', sub: 'Стена поддалась', t: 0, max: 1.8, color: 'vio5' });
          },
        });
        break;
      case 'dead':
        this.push({
          dur: 1.4,
          begin: () => {
            this.hero.state = 'dead';
            this.juice.flash('red2', 0.7);
            this.juice.shake(0.8);
            this.app.audio.play('death');
          },
          tick: (k) => (this.hero.alpha = 1 - k * 0.6),
          end: () => (this.ending = { kind: 'dead', t: 0 }),
        });
        break;
      case 'won':
        this.push({
          dur: 1.2,
          begin: () => {
            this.juice.flash('gold4', 0.6);
            this.app.audio.play('item');
            this.banners.push({ title: 'ОТЧЁТ СДАН', sub: 'Смена окончена. Можно домой.', t: 0, max: 3, color: 'gold4', big: true });
          },
          end: () => (this.ending = { kind: 'won', t: 0 }),
        });
        break;
      case 'message':
        this.push({ dur: 0.02, begin: () => (this.toast = { s: e.text, t: 1.8 }) });
        break;
      case 'invalid':
        this.push({ dur: 0.02, begin: () => this.fail(e.reason) });
        break;
    }
  }

  pickupTarget(kind: string): [number, number] {
    if (kind === 'coin' || kind === 'nickel') return [HUD.coins[0] + 4, HUD.coins[1] + 4];
    if (kind === 'bomb') return [HUD.bombs[0] + 4, HUD.bombs[1] + 4];
    if (kind === 'key') return [HUD.keys[0] + 4, HUD.keys[1] + 4];
    return [HUD.hearts[0] + this.disp.hp * 5, HUD.hearts[1] + 4];
  }

  private enqueueWave(e: Extract<GameEvent, { t: 'wave' }>) {
    const b = this.board;
    // 1. Flash matched groups.
    if (e.groups.length)
      this.push({
        dur: 0.09,
        begin: () => {
          for (const g of e.groups)
            for (const i of g.cells) {
              const id = e.cleared.find((c) => c.i === i)?.id;
              const v = id !== undefined ? b.tiles.get(id) : undefined;
              if (v) v.flash = 1;
            }
          this.app.audio.play('match', 1 + (e.n - 1) * 0.12);
          if (e.n >= 2) this.juice.float(`КАСКАД ×${e.n}`, BX + BW / 2, BY - 18, e.n >= 4 ? 'gold4' : 'cream', { scale: e.n >= 4 ? 2 : 1 });
        },
      });
    // 2. Special activations.
    if (e.blasts.length)
      this.push({
        dur: 0.16,
        begin: () => {
          for (const bl of e.blasts) this.blastFx(bl.kind, bl.at, bl.cells);
        },
      });
    // 3. Clear.
    this.push({
      dur: 0.12,
      begin: () => {
        for (const c of e.cleared) {
          const v = b.tiles.get(c.id);
          if (!v) continue;
          v.popping = true;
          v.pop = 0;
          const [x, y] = b.center(c.i);
          const fam = c.kind === 'junk' ? 'junk' : c.kind;
          const col = FAM_COLORS[fam as keyof typeof FAM_COLORS] ?? FAM_COLORS.prism;
          burst(this.ps, x, y, c.cause === 'splash' ? 5 : 7, {
            ramp: [col.light, col.mid, col.dark],
            layer: 'ui',
            speed: [30, 90],
            ay: 160,
            max: 0.45,
            size: Math.random() < 0.3 ? 2 : 1,
          });
        }
      },
    });
    // 4. Effects fly out.
    this.push({
      dur: e.effects.length ? 0.16 : 0.02,
      begin: () => this.fireEffects(e.effects, BX + BW / 2, BY + BH / 2),
    });
    // 5. Created specials + fall.
    this.push({
      dur: 0.22,
      begin: () => {
        for (const cr of e.created) {
          const [x, y] = b.cellXY(cr.at);
          const v = b.make(cr.tile, x, y, this.t);
          v.flash = 1;
          v.fresh = 0.45;
          b.tiles.set(cr.tile.id, v);
          const [cx, cy] = b.center(cr.at);
          burst(this.ps, cx, cy, 14, { ramp: ['white', 'gold4', 'orange3'], add: true, layer: 'ui', speed: [30, 80], max: 0.4 });
        }
        for (const f of e.falls) b.moveTo(f.id, f.to, 0.2);
        const byCol = new Map<number, number>();
        for (const s of e.spawns) {
          const col = s.to % 6;
          byCol.set(col, Math.max(byCol.get(col) ?? 0, s.rank + 1));
        }
        for (const s of e.spawns) {
          const tile = e.board[s.to];
          const [x] = b.cellXY(s.to);
          const n = byCol.get(s.to % 6) ?? 1;
          const v = b.make(tile, x, -T * (n - s.rank), this.t);
          b.tiles.set(tile.id, v);
          b.moveTo(tile.id, s.to, 0.2 + 0.02 * n);
        }
        b.queue = e.queue;
        b.flood = e.flood;
      },
      end: () => b.set(e.board, this.t),
    });
  }

  /** Two orbs racing out of (x, y) along a row or a column to the board edges. */
  private rocketLine(x: number, y: number, horizontal: boolean) {
    for (const dir of [-1, 1])
      this.juice.shoot({
        x0: x,
        y0: y,
        x1: horizontal ? (dir < 0 ? BX - 10 : BX + BW + 10) : x,
        y1: horizontal ? y : dir < 0 ? BY - 10 : BY + BH + 10,
        dur: 0.18,
        arc: 0,
        kind: 'orb',
        color: 'cream',
        trail: ['cream', 'gold4', 'orange3', 'red2'],
        size: 3,
      });
  }

  private boomFx(ax: number, ay: number, big: boolean) {
    this.app.audio.play('boom', big ? 0.8 : 1);
    this.ps.spawn({ x: ax, y: ay, len: 2, grow: big ? 190 : 110, max: big ? 0.4 : 0.3, kind: 'ring', ramp: ['cream', 'gold4', 'orange3', 'red2'], add: true, layer: 'ui' });
    burst(this.ps, ax, ay, big ? 80 : 40, { ramp: ['cream', 'gold4', 'orange3', 'red2', 'grey1'], add: true, layer: 'ui', speed: big ? [60, 220] : [40, 160], max: 0.5 });
    for (let k = 0; k < (big ? 12 : 6); k++)
      this.ps.spawn({ x: ax + rand(-10, 10), y: ay + rand(-10, 10), vx: rand(-10, 10), vy: rand(-20, -5), max: 1.6, kind: 'smoke', len: rand(4, 8), grow: 6, ramp: ['grey2', 'grey1', 'ink3'], alpha: 0.6, layer: 'ui' });
    this.juice.shake(big ? 0.9 : 0.5);
    this.juice.stop(big ? 0.1 : 0.05);
  }

  private blastFx(kind: string, at: number, cells: number[]) {
    const [ax, ay] = this.board.center(at);
    const sparks = (list: number[]) => {
      for (const i of list) {
        const [x, y] = this.board.center(i);
        burst(this.ps, x, y, 4, { ramp: ['cream', 'gold4', 'orange3', 'grey2'], add: true, layer: 'ui', speed: [10, 50], max: 0.35 });
      }
    };
    switch (kind) {
      case 'rocketH':
      case 'rocketV': {
        this.app.audio.play('rocket');
        this.rocketsSeen++;
        sparks(cells);
        const pts = cells.map((i) => this.board.center(i));
        this.rocketLine(ax, ay, kind === 'rocketH' || Math.abs(pts[pts.length - 1][1] - ay) < 2);
        if (cells.length > 6) this.rocketLine(ax, ay, kind !== 'rocketH');
        this.juice.shake(0.25);
        break;
      }
      case 'cross':
        this.app.audio.play('rocket', 0.8);
        sparks(cells);
        this.rocketLine(ax, ay, true);
        this.rocketLine(ax, ay, false);
        this.juice.flash('gold4', 0.2);
        this.juice.shake(0.45);
        break;
      case 'bigCross':
        this.app.audio.play('rocket', 0.7);
        this.app.audio.play('boom', 1.2);
        sparks(cells);
        for (const d of [-1, 0, 1]) {
          this.rocketLine(ax, ay + d * T, true);
          this.rocketLine(ax + d * T, ay, false);
        }
        this.juice.flash('orange4', 0.3);
        this.juice.shake(0.7);
        this.juice.stop(0.08);
        break;
      case 'active':
        this.app.audio.play('ink', 0.7);
        for (const i of cells) {
          const [x, y] = this.board.center(i);
          burst(this.ps, x, y, 10, { ramp: ['vio5', 'vio4', 'grey3'], add: true, layer: 'ui', speed: [15, 60], max: 0.4 });
        }
        break;
      case 'prism':
      case 'nova':
        this.app.audio.play('prism', kind === 'nova' ? 0.7 : 1);
        for (const i of cells) {
          const [x, y] = this.board.center(i);
          this.juice.shoot({ x0: ax, y0: ay, x1: x, y1: y, dur: 0.14, arc: 0, color: 'white', trail: ['white', 'cold6', 'vio5', 'gold4'], size: 1 });
        }
        this.juice.flash(kind === 'nova' ? 'white' : 'cold6', kind === 'nova' ? 0.55 : 0.2);
        if (kind === 'nova') {
          this.juice.shake(1);
          this.juice.stop(0.12);
        }
        break;
      case 'bigBomb':
        this.boomFx(ax, ay, true);
        break;
      default:
        this.boomFx(ax, ay, false);
    }
  }

  private fireEffects(list: Effect[], ox: number, oy: number) {
    for (const f of list) {
      const from = f.from?.length ? this.board.center(f.from[Math.floor(f.from.length / 2)]) : ([ox, oy] as [number, number]);
      switch (f.kind) {
        case 'damage': {
          if (f.uid === undefined) break;
          const [tx, ty] = this.enemyPos(f.uid);
          const fam = f.fam ?? 'blade';
          const src = f.source ?? '';
          const noTravel = src === 'bleed' || src === 'burn';
          this.juice.shoot({
            x0: noTravel ? tx : src === 'spider' ? HERO_X + 14 : from[0],
            y0: noTravel ? ty - 20 : src === 'spider' ? FLOOR_Y - 8 : from[1],
            x1: tx,
            y1: ty,
            dur: noTravel ? 0.08 : 0.24,
            arc: src === 'plane' ? 60 : 24,
            color: FAM_COLORS[fam as keyof typeof FAM_COLORS]?.mid ?? 'red3',
            trail: FAM_TRAIL[fam] ?? FAM_TRAIL.blade,
            size: f.amount >= 8 ? 4 : 3,
            onArrive: () => this.hitEnemyFx(f),
          });
          if (fam === 'blade' && src === 'blade') this.hero.set('attack', 0.22);
          break;
        }
        case 'armor':
          if (f.amount <= 0) break;
          this.juice.shoot({
            x0: from[0],
            y0: from[1],
            x1: HUD.armor[0] + this.disp.armor * 10 + 4,
            y1: HUD.armor[1] + 4,
            dur: 0.3,
            arc: 30,
            color: 'cold4',
            trail: FAM_TRAIL.shield,
            onArrive: () => {
              this.disp.armor = Math.min(this.disp.armorCap, this.disp.armor + f.amount);
              this.app.audio.play('armor');
            },
          });
          break;
        case 'charge':
          if (f.amount <= 0) break;
          this.juice.shoot({
            x0: from[0],
            y0: from[1],
            x1: HUD.active[0] + 29,
            y1: HUD.active[1] + 12,
            dur: 0.3,
            arc: 30,
            color: 'vio4',
            trail: FAM_TRAIL.ink,
            onArrive: () => {
              this.disp.charge = Math.min(this.disp.cost, this.disp.charge + f.amount);
              this.app.audio.play('ink');
            },
          });
          break;
        case 'coins':
          if (f.amount <= 0) break;
          for (let k = 0; k < Math.min(5, f.amount); k++)
            this.juice.shoot({
              x0: f.uid !== undefined ? this.enemyPos(f.uid)[0] : from[0] + rand(-6, 6),
              y0: f.uid !== undefined ? this.enemyPos(f.uid)[1] : from[1] + rand(-6, 6),
              x1: HUD.coins[0] + 4,
              y1: HUD.coins[1] + 4,
              dur: 0.35 + k * 0.05,
              arc: 40,
              kind: 'sprite',
              sprite: 'hud_coin',
              color: 'gold3',
              trail: FAM_TRAIL.coin,
              onArrive: () => {
                if (k === 0) this.disp.coins = Math.min(99, this.disp.coins + f.amount);
                this.coinFlash = 0.3;
                this.app.audio.play('coin', 1 + k * 0.08);
              },
            });
          break;
        case 'heal':
          this.disp.hp = Math.min(this.disp.hearts * 2, this.disp.hp + f.amount);
          break;
        case 'status': {
          if (f.uid === undefined) break;
          const [x, y] = this.enemyPos(f.uid);
          const label = f.status === 'bleed' ? 'кровь' : f.status === 'burn' ? 'огонь!' : f.status === 'stun' ? 'оглушён' : 'заморожен';
          const color = f.status === 'bleed' ? 'red4' : f.status === 'burn' ? 'orange3' : f.status === 'stun' ? 'gold4' : 'cold5';
          this.juice.float(label, x, y - 18, color);
          if (f.status === 'freeze') {
            const v = this.enemies.get(f.uid);
            if (v) v.countdown += f.amount;
          }
          if (f.status === 'stun') {
            const v = this.enemies.get(f.uid);
            if (v) v.stunned = true;
          }
          break;
        }
        case 'proc':
          if (f.text) this.juice.float(f.text, f.uid !== undefined ? this.enemyPos(f.uid)[0] : HERO_X, (f.uid !== undefined ? this.enemyPos(f.uid)[1] : FLOOR_Y - 44) - 12, 'gold4');
          break;
        case 'kill':
          break;
      }
    }
  }

  private hitEnemyFx(f: Effect) {
    const v = f.uid !== undefined ? this.enemies.get(f.uid) : undefined;
    if (!v) return;
    const [x, y] = this.enemyPos(v.uid);
    if (f.amount > 0) {
      v.hp = Math.max(0, v.hp - f.amount);
      v.flash = 1;
      v.flashColor = 'white';
      v.hurtT = 0.18;
      v.offX += Math.min(8, 2 + f.amount / 2);
      const big = f.amount >= 10;
      this.juice.float(`${f.amount}`, x + rand(-6, 6), y - 6, big ? 'gold4' : 'cream', { scale: big ? 2 : 1, outline: 'red1' });
      burst(this.ps, x, y, big ? 16 : 8, { ramp: ['white', 'red4', 'red3'], add: true, layer: 'ui', speed: [30, 110], max: 0.35 });
      this.app.audio.play('hit', 0.8 + Math.random() * 0.4);
      if (big) {
        this.juice.shake(0.35);
        this.juice.stop(0.06);
      }
    } else if (f.text) this.juice.float(f.text, x, y - 6, 'teal5');
    if (f.blocked) this.juice.float(`-${f.blocked} щит`, x + 12, y + 4, 'cold5');
  }

  private hurtHero(h: { amount: number; armor: number; soul: number; red: number } | undefined, burnArmor: boolean) {
    if (!h) return;
    const lost = h.soul + h.red;
    const armorBefore = this.disp.armor;
    if (burnArmor) this.disp.armor = 0;
    else this.disp.armor = Math.max(0, this.disp.armor - h.armor);
    this.disp.soul = Math.max(0, this.disp.soul - h.soul);
    const hpBefore = this.disp.hp;
    this.disp.hp = Math.max(0, this.disp.hp - h.red);
    const [hx, hy] = this.hero.chest();
    if (h.armor > 0) {
      // Armor takes the blow first: a cold barrier flares in front of the hero and shatters.
      this.hero.set('block', lost > 0 ? 0.12 : 0.4);
      this.hero.flash = 0.8;
      this.hero.flashColor = 'cold6';
      for (let k = 0; k < 7; k++) this.ps.spawn({ x: hx + 14, y: hy - 12 + k * 4, vx: rand(20, 60), vy: rand(-30, 30), max: 0.4, ramp: ['white', 'cold6', 'cold4'], add: true, layer: 'ui', size: 2 });
      burst(this.ps, hx + 12, hy, 16, { ramp: ['white', 'cold6', 'cold5', 'cold3'], add: true, layer: 'ui', speed: [30, 100], max: 0.45 });
      this.juice.float(lost > 0 ? `броня −${h.armor}` : 'БЛОК', hx, hy - 30, 'cold5', { outline: 'ink0' });
      // The spent armor pips burst in the HUD.
      for (let a = armorBefore - 1; a >= Math.max(0, armorBefore - Math.max(h.armor, burnArmor ? armorBefore : 0)); a--)
        burst(this.ps, HUD.armor[0] + a * 10 + 4, HUD.armor[1] + 4, 6, { ramp: ['cold6', 'cold4', 'cold2'], add: true, layer: 'ui', speed: [20, 60], max: 0.4 });
      this.app.audio.play('armor', 0.7);
      this.juice.shake(0.15);
    }
    if (lost > 0) {
      this.hero.set('hurt', 0.4);
      this.hero.flash = 1;
      this.hero.flashColor = 'red4';
      this.hero.offX = -9;
      this.juice.shake(0.35 + lost * 0.12);
      this.juice.flash('red2', 0.2 + lost * 0.05);
      this.juice.stop(0.07);
      this.juice.float(`−${halves(lost)}`, hx, hy - 36, 'red4', { outline: 'ink0' });
      burst(this.ps, hx, hy, 16, { ramp: ['red4', 'red3', 'red1'], layer: 'ui', speed: [30, 100], ay: 180, max: 0.5 });
      // The lost heart halves break in the HUD.
      for (let p = hpBefore - 1; p >= this.disp.hp; p--) {
        const x = HUD.hearts[0] + Math.floor(p / 2) * 10 + 4;
        burst(this.ps, x, HUD.hearts[1] + 4, 8, { ramp: ['red5', 'red3', 'red1'], layer: 'ui', speed: [20, 70], ay: 160, max: 0.5 });
      }
      this.heartPulse = 0.4;
      this.app.audio.play('hurt');
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
    const kind = e.intent.kind;
    const view = () => this.enemies.get(e.uid);
    const def = view()?.def ?? '';
    const boss = ENEMIES[def]?.size === 'boss';
    const blow = kind === 'attack' || kind === 'heavy' || kind === 'strike' || (kind === 'erase' && !e.cells) || (kind === 'pinch' && !e.cells);
    const heavy = blow && (kind === 'heavy' || boss);
    const name = INTENT_TEXT[kind] ?? kind;
    const caption = e.skipped ? 'Пропускает ход' : blow ? `${name} ${halves(e.hurt?.amount ?? 0)}` : `${name}${e.intent.value > 1 && kind !== 'heal' && kind !== 'block' ? ` ×${e.intent.value}` : ''}`;
    // 1. Spotlight: this enemy is up.
    this.push({
      dur: 0.16,
      begin: () => {
        this.focusEnemy(e.uid, caption);
        this.app.audio.play('enemy', 0.8 + Math.random() * 0.3);
      },
    });
    if (e.skipped) {
      this.push({
        dur: 0.45,
        begin: () => {
          const [x, y] = this.enemyPos(e.uid);
          this.juice.float(kind === 'censor' ? 'Цензура не действует' : 'z z z', x, y - 24, 'gold4');
        },
      });
      return;
    }
    // 2. Wind-up: the anticipation pose, the body heats up; heavy blows take longer and shake.
    const windDur = heavy ? 0.46 : blow ? 0.3 : 0.24;
    this.push({
      dur: windDur,
      begin: () => {
        const v = view();
        if (!v) return;
        v.windT = windDur + 0.04;
        v.offX = 5;
      },
      tick: (k) => {
        const v = view();
        if (v) v.charge = k;
        if (heavy && k > 0.5) this.juice.shake(0.015);
      },
    });
    if (blow) {
      // 3. The blow: attack pose, a lunge and a shot across the room; it lands on the hero's chest.
      const shot = SHOTS[def] ?? { color: 'cream', trail: ['cream', 'grey3', 'grey2'] };
      const travel = heavy ? 0.26 : 0.22;
      this.push({
        dur: travel,
        begin: () => {
          const v = view();
          if (!v) return;
          v.windT = 0;
          v.charge = 0;
          v.attackT = travel + 0.2;
          v.offX = heavy ? -26 : -16;
          const [mx, my] = v.muzzle(this.t);
          const [hx, hy] = this.hero.chest();
          this.juice.shoot({ x0: mx, y0: my, x1: hx, y1: hy, dur: travel, arc: shot.arc ?? 22, color: shot.color, trail: shot.trail, size: (shot.size ?? 4) + (heavy ? 2 : 0), light: hex(shot.trail[1] ?? shot.color) });
          this.app.audio.play(heavy ? 'rocket' : 'swap', heavy ? 0.7 : 0.8);
        },
        end: () => {
          const [hx, hy] = this.hero.chest();
          burst(this.ps, hx, hy, heavy ? 22 : 12, { ramp: ['white', ...shot.trail], add: true, layer: 'ui', speed: [30, heavy ? 150 : 100], max: 0.4 });
          this.hurtHero(e.hurt, true);
          if (heavy) this.juice.shake(0.5);
          if (e.board) {
            // The red stamp also staples a tile.
            this.board.set(e.board, this.t);
            for (const i of e.cells ?? []) {
              const vt = this.board.tiles.get(e.board[i]?.id ?? -1);
              if (vt) vt.flash = 1;
            }
          }
        },
      });
      this.push({ dur: heavy ? 0.36 : 0.28 });
    } else if (e.cells?.length && e.board) {
      // Board curses fly from the enemy to the cells they spoil.
      const color =
        kind === 'ink' ? 'vio3' : kind === 'ember' ? 'orange3' : kind === 'censor' ? 'ink0' : kind === 'pin' ? 'grey4' : kind === 'anchor' ? 'teal3' : 'cold4';
      const trail = kind === 'ember' ? FIRE : kind === 'ink' ? FAM_TRAIL.ink : ['grey4', 'grey3', 'grey2'];
      this.push({
        dur: kind === 'pinch' ? 0.3 : 0.34,
        begin: () => {
          const v = view();
          if (v) {
            v.windT = 0;
            v.charge = 0;
            v.attackT = 0.4;
            v.offX = -10;
          }
          const [x, y] = v ? v.muzzle(this.t) : this.enemyPos(e.uid);
          if (kind === 'pinch') return;
          for (const i of e.cells!) {
            const [tx, ty] = this.board.center(i);
            this.juice.shoot({ x0: x, y0: y, x1: tx, y1: ty, dur: 0.3, arc: 40, color, trail, size: 3 });
          }
        },
        end: () => {
          if (e.board) this.board.set(e.board, this.t);
          if (kind === 'anchor' && this.run.combat) this.board.colLock = this.run.combat.board.colLock.slice();
          for (const i of e.cells!) {
            const [tx, ty] = this.board.center(i);
            burst(this.ps, tx, ty, 10, { ramp: trail, layer: 'ui', speed: [20, 70], max: 0.4 });
            const vt = this.board.tiles.get(e.board![i]?.id ?? -1);
            if (vt) vt.flash = 0.8;
          }
          if (kind === 'ink') this.app.audio.play('match', 0.5);
          if (kind === 'pin' || kind === 'anchor') this.app.audio.play('armor', 1.4);
          if (kind === 'ember') this.app.audio.play('ember');
          if (kind === 'pinch') this.app.audio.play('swap', 0.6);
        },
      });
      this.push({ dur: 0.22 });
    } else {
      this.push({
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
              this.juice.float(`+${e.intent.value} щит`, x, y - 14, 'cold5');
              if (v) {
                v.block = e.intent.value;
                v.flash = 0.8;
                v.flashColor = 'cold5';
              }
              this.app.audio.play('armor', 0.8);
              break;
            case 'heal':
              if (e.healed) {
                const [hx, hy] = this.enemyPos(e.healed.uid);
                burst(this.ps, hx, hy, 14, { ramp: ['green4', 'green3', 'green2'], add: true, layer: 'ui', speed: [10, 40], ay: -40, max: 0.7 });
                this.juice.float(`+${e.healed.amount}`, hx, hy - 12, 'green4');
                const hv = this.enemies.get(e.healed.uid);
                if (hv) hv.hp = Math.min(hv.maxHp, hv.hp + e.healed.amount);
              }
              break;
            case 'summon':
              for (const s of e.summoned ?? []) {
                const nv = new EnemyView(s, 660);
                nv.dimTarget = 1;
                this.enemies.set(s.uid, nv);
                burst(this.ps, 600, FLOOR_Y - 10, 18, { ramp: ['grey3', 'grey2', 'grey1'], layer: 'mid', speed: [10, 50], max: 0.8, kind: 'smoke', len: 4, grow: 5 });
              }
              this.layoutEnemies();
              break;
            case 'stealCharge':
            case 'stealCoins': {
              const coins = kind === 'stealCoins';
              const n = e.stolen ?? 0;
              if (coins) this.disp.coins = Math.max(0, this.disp.coins - n);
              else this.disp.charge = Math.max(0, this.disp.charge - n);
              const [sx, sy] = coins ? [HUD.coins[0] + 4, HUD.coins[1] + 4] : [HUD.active[0] + 12, HUD.active[1] + 12];
              for (let k = 0; k < Math.min(4, n); k++)
                this.juice.shoot({ x0: sx, y0: sy, x1: x, y1: y, dur: 0.3 + k * 0.05, arc: 30, color: coins ? 'gold3' : 'vio4', trail: coins ? FAM_TRAIL.coin : FAM_TRAIL.ink });
              this.juice.float(n ? `-${n} ${coins ? 'монет' : 'чернил'}` : 'Нечего красть', x, y - 14, coins ? 'gold4' : 'vio5');
              break;
            }
            case 'submerge':
              if (v) v.submerged = true;
              this.juice.float('Нырнул', x, y - 14, 'teal5');
              this.app.audio.play('match', 0.4);
              break;
            case 'shine':
              if (v) v.shining = true;
              this.juice.flash('cold6', 0.25);
              burst(this.ps, x, y, 20, { ramp: ['white', 'cold6', 'teal5'], add: true, layer: 'ui', speed: [20, 80], max: 0.6 });
              this.juice.float('Блеск: клинки отражаются', x, y - 20, 'cold6');
              break;
            case 'tide':
              this.juice.float('Прилив!', x, y - 14, 'teal5');
              this.app.audio.play('rocket');
              if (e.board) this.board.set(e.board, this.t);
              this.board.flood = this.run.combat?.board.flood ?? this.board.flood + 1;
              break;
            default:
              break;
          }
        },
      });
      this.push({ dur: 0.12 });
    }
  }

  /** A dashed red line on the floor from each enemy that strikes on the next move to the hero. */
  private drawThreatLines(ctx: Ctx2D) {
    const c = this.run.combat;
    if (!c || !this.inCombat || this.busy()) return;
    const y = FLOOR_Y + 14;
    const hx = Math.round(this.hero.x + 14);
    for (const v of this.enemies.values()) {
      if (v.dying > 0 || v.countdown > 1 || !v.intentDamages() || v.stunned) continue;
      const x0 = Math.round(v.x - 16);
      const shift = Math.floor(this.t * 24) % 7;
      for (let x = x0 - shift; x > hx; x -= 7) {
        const w = Math.min(4, x - hx);
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(x - w, y + 1, w, 1);
        ctx.fillStyle = hex('red3');
        ctx.fillRect(x - w, y, w, 1);
      }
      ctx.fillStyle = hex('red4');
      for (let k = 0; k < 3; k++) ctx.fillRect(hx - 2 + k, y - 2 + k, 1, 5 - k * 2);
    }
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;
    const speed = this.app.profile.settings.speed * (this.app.fastForward ? 3 : 1);
    this.juice.update(dt);
    const frozen = this.juice.hitstop > 0;
    if (!this.paused && !frozen) this.runSteps(dt * speed);
    this.board.update(frozen ? 0 : dt * speed);
    this.hero.update(dt);
    for (const v of this.enemies.values()) v.update(dt);
    for (const [uid, v] of this.enemies) if (v.dying > 0.8) this.enemies.delete(uid);
    this.scene.update(dt, this.ps, this.t);
    this.ps.update(dt);
    this.lighting.flash = this.scene.lightningFlash * 0.9;
    if (this.scene.lightningFlash > 0.95) {
      this.juice.shake(0.12);
      window.setTimeout(() => this.app.audio.play('thunder'), 300 + Math.random() * 500);
    }
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.max);
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    this.coinFlash = Math.max(0, this.coinFlash - dt);
    this.heartPulse = Math.max(0, this.heartPulse - dt);
    this.boardDim += (this.boardDimTarget - this.boardDim) * Math.min(1, dt * 8);
    for (const c of this.openChests) c.t -= dt;
    this.openChests = this.openChests.filter((c) => c.t > 0);
    if (this.ending) this.ending.t += dt;
    this.updatePreview();
  }

  private runSteps(dt: number) {
    let budget = dt;
    let guard = 0;
    while (budget > 0 && guard++ < 200) {
      if (!this.cur) {
        const next = this.steps.shift();
        if (!next) break;
        this.cur = next;
        next.t = 0;
        next.begin?.();
      }
      const s = this.cur!;
      const need = s.dur - (s.t ?? 0);
      if (need <= budget) {
        s.t = s.dur;
        s.tick?.(1);
        s.end?.();
        budget -= Math.max(need, 0);
        this.cur = null;
      } else {
        s.t = (s.t ?? 0) + budget;
        s.tick?.(s.dur > 0 ? s.t / s.dur : 1);
        budget = 0;
      }
    }
  }

  /** The swap the player is about to make: a drag past the threshold, or a picked tile plus a hovered neighbour. */
  private candidate(): Move | null {
    const b = this.board;
    const m = b.dragMove();
    if (m) return m;
    if (!b.drag && b.selected >= 0 && b.hover >= 0 && adjacent(b.selected, b.hover, this.mods.wrap)) return { from: b.selected, to: b.hover };
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
    const block = swapBlock(this.run.combat.board, m, this.mods.wrap);
    const p = previewMove(this.run, this.mods, m);
    b.highlight = p.valid ? p.groups : [];
    b.blastCells = p.blast ? p.blast.cells : [];
    const parts: string[] = [];
    if (p.damage) parts.push(`урон ${p.damage}`);
    if (p.armor) parts.push(`броня +${p.armor}`);
    if (p.charge) parts.push(`чернила +${p.charge}`);
    if (p.coins) parts.push(`монеты +${p.coins}`);
    if (p.specials) parts.push('особая фишка!');
    b.previewText = block ?? (p.valid ? parts.join(' · ') || (p.blast ? 'взрыв' : 'совпадение') : 'нет совпадения');
  }

  // ── Input ─────────────────────────────────────────────────────────

  canPlay() {
    return !this.busy() && !this.paused && !this.ending && this.run.phase === 'combat' && this.inCombat;
  }

  pointerDown(x: number, y: number) {
    if (!this.canPlay()) {
      if (this.busy()) this.app.fastForward = true;
      return;
    }
    const cell = this.board.cellAt(x, y);
    if (this.targeting) {
      this.aimAt(x, y, cell);
      return;
    }
    if (cell < 0) {
      this.board.selected = -1;
      return;
    }
    this.board.startDrag(cell, x, y);
  }

  pointerMove(x: number, y: number) {
    this.board.hover = this.canPlay() && !this.targeting ? this.board.cellAt(x, y) : -1;
    if (this.targeting && this.run.combat) {
      const cell = this.board.cellAt(x, y);
      const aim = this.targeting.aim;
      const r = this.mods.bombRadius;
      this.board.aimCells =
        cell < 0
          ? []
          : this.targeting.kind === 'bomb'
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
    this.app.fastForward = false;
    const b = this.board;
    const d = b.drag;
    if (!d) return;
    if (!d.moved) {
      // A click: pick a tile, then click a neighbour to swap with it.
      b.drag = null;
      if (b.selected < 0 || b.selected === d.cell) b.selected = b.selected === d.cell ? -1 : d.cell;
      else if (adjacent(b.selected, d.cell, this.mods.wrap)) this.trySwap({ from: b.selected, to: d.cell });
      else b.selected = d.cell;
      return;
    }
    const m = b.dragMove();
    if (m) this.trySwap(m);
    else b.dropBack();
  }

  /** Ask the engine for a swap; a refused one springs back with the reason. */
  trySwap(m: Move) {
    const c = this.run.combat;
    if (!c) return;
    const b = this.board;
    if (isValidMove(c.board, m, this.mods.wrap)) {
      b.selected = -1;
      this.act({ type: 'move', move: m });
      return;
    }
    b.refuse(m);
    b.selected = -1;
    this.fail(swapBlock(c.board, m, this.mods.wrap) ?? 'Нет совпадения', false);
  }

  aimAt(x: number, y: number, cell: number) {
    const tg = this.targeting!;
    if (tg.kind === 'bomb') {
      if (cell >= 0) this.act({ type: 'bomb', cell });
      this.targeting = null;
      this.board.aimCells = [];
      return;
    }
    if (tg.kind === 'active') {
      if (tg.aim === 'cell' && cell >= 0) this.act({ type: 'active', cell });
      else if (tg.aim === 'col' && cell >= 0) this.act({ type: 'active', col: cell % 6 });
      else if (tg.aim === 'enemy') {
        const v = this.enemyAt(x, y);
        if (v) this.act({ type: 'active', uid: v.uid });
      }
      this.targeting = null;
      this.board.aimCells = [];
    }
  }

  enemyAt(x: number, y: number): EnemyView | undefined {
    for (const v of this.enemies.values()) {
      if (v.dying > 0) continue;
      const f = v.frame(this.t);
      const left = v.x - f.ox;
      const top = v.y - f.oy;
      if (x >= left - 4 && x <= left + f.w + 4 && y >= top - 24 && y <= v.y + 14) return v;
    }
    return undefined;
  }

  useActive() {
    const id = this.run.hero.active;
    if (!id) return;
    const def = ITEMS[id];
    if (this.run.hero.charge < (def.charge ?? 0)) {
      this.fail('Мало чернил');
      return;
    }
    if (this.run.phase === 'combat') {
      if (def.aim) {
        this.targeting = { kind: 'active', aim: def.aim };
        this.toast = { s: def.aim === 'cell' ? 'Выбери фишку' : def.aim === 'col' ? 'Выбери столбец' : 'Выбери врага', t: 2 };
      } else this.act({ type: 'active' });
    } else this.act({ type: 'active' });
  }

  useBomb() {
    if (this.run.hero.bombs <= 0) {
      this.fail('Нет бомб');
      return;
    }
    if (this.run.phase === 'combat') {
      this.targeting = { kind: 'bomb', aim: 'cell' };
      this.toast = { s: 'Бомба: выбери клетку', t: 2 };
    } else {
      this.targeting = { kind: 'wall' };
      this.toast = { s: 'Бомба: выбери стену', t: 2.5 };
    }
  }

  key(k: string, shift: boolean) {
    if (this.ending) return;
    if (k === 'Escape') {
      if (this.targeting) {
        this.targeting = null;
        this.board.aimCells = [];
        return;
      }
      this.paused = !this.paused;
      return;
    }
    if (this.paused) return;
    if (this.busy()) {
      this.app.fastForward = true;
      window.setTimeout(() => (this.app.fastForward = false), 250);
      return;
    }
    const dirKey: Record<string, Dir> = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e', w: 'n', s: 's', a: 'w', d: 'e', W: 'n', S: 's', A: 'w', D: 'e' };
    if (this.run.phase === 'combat') {
      const b = this.board;
      if (b.cursor < 0) b.cursor = 14;
      const d = dirKey[k];
      if (d) {
        const [dx, dy] = STEP[d];
        if (shift || b.selected === b.cursor) {
          // Swap the tile under the cursor with its neighbour; the cursor follows the tile.
          const to = b.neighbour(b.cursor, dx, dy);
          if (to >= 0) {
            const from = b.cursor;
            b.cursor = to;
            this.trySwap({ from, to });
            if (this.busy() === false) b.cursor = from;
          }
        } else {
          const c = (b.cursor % 6) + dx;
          const r = Math.floor(b.cursor / 6) + dy;
          if (c >= 0 && c < 6 && r >= 0 && r < 6) b.cursor = r * 6 + c;
        }
        return;
      }
      if (k === ' ' || k === 'Enter') {
        b.selected = b.selected === b.cursor ? -1 : b.cursor;
        return;
      }
      if (k === 'q' || k === 'Q' || k === 'й' || k === 'Й') {
        const def = this.run.hero.active ? ITEMS[this.run.hero.active] : null;
        if (def?.aim === 'cell') this.act({ type: 'active', cell: b.cursor });
        else if (def?.aim === 'col') this.act({ type: 'active', col: b.cursor % 6 });
        else if (def?.aim === 'enemy') this.act({ type: 'active', uid: this.run.combat!.target });
        else this.useActive();
      }
      if (k === 'e' || k === 'E' || k === 'у' || k === 'У') {
        if (this.run.hero.bombs > 0) this.act({ type: 'bomb', cell: b.cursor });
        else this.fail('Нет бомб');
      }
      if (k === 'Tab') {
        const list = alive(this.run.combat!);
        const i = list.findIndex((e) => e.uid === this.run.combat!.target);
        const next = list[(i + 1) % list.length];
        if (next) this.act({ type: 'target', uid: next.uid });
      }
      return;
    }
    if (this.run.phase === 'explore') {
      const d = dirKey[k];
      if (this.targeting?.kind === 'wall' && d) {
        this.targeting = null;
        this.act({ type: 'bombWall', dir: d });
        return;
      }
      if (d) this.act({ type: 'go', dir: d });
      if (k === ' ' || k === 'Enter') {
        const room = currentRoom(this.run);
        const ped = room.pedestals.find((p) => !p.taken);
        if (ped) this.act({ type: 'pedestal', id: ped.id });
        else if (room.trapdoor) this.act({ type: 'descend' });
      }
      if (k === 'e' || k === 'E' || k === 'у' || k === 'У') this.useBomb();
      if (k === 'q' || k === 'Q' || k === 'й' || k === 'Й') this.useActive();
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────

  draw(ctx: Ctx2D, ui: UI) {
    const t = this.t;
    const [sx, sy] = this.juice.offset();
    ctx.save();
    ctx.translate(sx, sy);
    const s = this.scene;
    s.drawSky(ctx);
    s.drawLayer(ctx);
    s.drawGlass(ctx);
    s.drawAnimated(ctx, t);
    this.ps.draw(ctx, 'back', false);
    const room = currentRoom(this.run);
    const explore = !this.inCombat && this.run.phase !== 'combat';
    const showRoom = explore || this.run.phase === 'dead' || this.run.phase === 'won';
    if (showRoom) drawRoomWorld(this, ctx, room);
    this.hero.draw(ctx, t);
    const target = this.run.combat?.target;
    for (const v of this.enemies.values()) v.draw(ctx, t, v.uid === target && this.inCombat);
    s.drawInside(ctx);
    this.ps.draw(ctx, 'mid', false);
    s.drawFront(ctx);
    this.ps.draw(ctx, 'front', false);
    // Lighting.
    const extra: Light[] = [];
    // Key lights keep the actors readable against the dark room.
    extra.push({ x: this.hero.x + 6, y: FLOOR_Y - 22, r: 46, color: '#ffc88a', intensity: 0.55, flicker: 'none', seed: 0 });
    for (const v of this.enemies.values())
      if (v.dying === 0) {
        const r = v.size === 'boss' ? 80 : 50;
        extra.push({ x: v.x - 6, y: FLOOR_Y - 28, r: v.acting ? r + 14 : r, color: v.acting ? '#ffd6b0' : '#c9d4ff', intensity: v.acting ? 0.95 : 0.4 * (1 - v.dim * 0.6), flicker: 'none', seed: v.uid });
      }
    if (this.mods.lamp) extra.push({ x: this.hero.x, y: FLOOR_Y - 30, r: 70, color: '#ffd08a', intensity: 0.8, flicker: 'lantern', seed: 1 });
    // Enemy blows light up the room as they fly.
    for (const sh of this.juice.shots)
      if (sh.light) {
        const [x, y] = this.juice.pos(sh, Math.min(1, sh.t / sh.dur));
        extra.push({ x, y, r: 30 + sh.size * 3, color: sh.light, intensity: 0.85, flicker: 'none', seed: 3 });
      }
    if (showRoom) {
      // Loot on the floor and the trapdoor get a soft pool of light so they read in dark rooms.
      for (const p of room.pickups) {
        const at = this.pickupPos.get(p.id);
        if (at) extra.push({ x: at[0], y: at[1] - 4, r: 20, color: '#ffe2a8', intensity: 0.5, flicker: 'none', seed: p.id });
      }
      if (room.trapdoor) extra.push({ x: trapdoorX(room), y: FLOOR_Y + 24, r: 34, color: '#ffcf8a', intensity: 0.8, flicker: 'candle', seed: 7 });
    }
    for (const v of this.enemies.values())
      if (ENEMIES[v.def]?.traits?.includes('light') && v.dying === 0)
        extra.push({ x: v.x, y: v.top(t) + 8, r: 60, color: '#ffae4a', intensity: 0.9, flicker: 'candle', seed: v.uid });
    this.lighting.compose(t, extra);
    this.lighting.apply(ctx, 0.16);
    this.ps.draw(ctx, 'back', true);
    this.ps.draw(ctx, 'mid', true);
    this.ps.draw(ctx, 'front', true);
    for (const g of s.glows()) {
      if (g.k < 0.05) continue;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, g.k);
      ctx.fillStyle = g.color;
      ctx.fillRect(g.x - 1, g.y - 1, 3, 3);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Board and combat UI (unlit, for readability).
    if (this.board.visible > 0) {
      const c = this.run.combat;
      this.board.draw(ctx, t, (a, b) => (c ? !swapBlock(c.board, { from: a, to: b }, this.mods.wrap) : false));
      if (this.boardDim > 0.02) {
        ctx.globalAlpha = this.boardDim * 0.5 * this.board.visible;
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(BX - 6, BY - 6, BW + 12, BH + 12);
        ctx.globalAlpha = 1;
      }
      this.drawThreatLines(ctx);
      for (const v of this.enemies.values()) {
        const e = c?.enemies.find((x) => x.uid === v.uid);
        const dmg = e && c ? intentDamage(c, e) : 0;
        v.drawUI(ctx, t, v.uid === target, dmg);
        if (this.inCombat && this.canPlay() && ui.area(`enemy-${v.uid}`, v.x - 20, v.top(t) - 24, 40, v.y - v.top(t) + 36)) {
          if (this.targeting?.kind === 'active' && this.targeting.aim === 'enemy') {
            this.act({ type: 'active', uid: v.uid });
            this.targeting = null;
          } else this.act({ type: 'target', uid: v.uid });
        }
        if (ui.hovered === `enemy-${v.uid}`) {
          const tip = v.tooltip(dmg);
          ui.tooltip(tip.title, tip.body, ui.p.x, ui.p.y, 'red4');
        }
      }
    }
    if (showRoom) drawRoomUI(this, ctx, ui, room);
    this.juice.drawShots(ctx);
    this.ps.draw(ctx, 'ui', true);
    this.ps.draw(ctx, 'ui', false);
    ctx.restore();
    drawVignette(ctx, 0.9);
    const hp = this.disp.hp + this.disp.soul;
    if (hp <= 2 && this.run.phase !== 'dead') drawDanger(ctx, (hp <= 1 ? 0.5 : 0.3) + Math.sin(this.t * 5) * 0.15);
    this.juice.drawTexts(ctx);
    this.drawHUD(ctx, ui);
    this.drawBanners(ctx);
    this.juice.drawFlash(ctx, VW, VH);
    if (this.lighting.flash > 0.05) {
      ctx.globalAlpha = this.lighting.flash * 0.25;
      ctx.fillStyle = hex('cold6');
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    if (this.fade > 0) ditherFade(ctx, this.fade);
  }

  private drawHUD(ctx: Ctx2D, ui: UI) {
    const t = this.t;
    let incoming = 0;
    const cc = this.run.combat;
    if (cc && this.inCombat && !this.busy()) {
      // Mirrors the engine: armor soaks the first blow of the tick, then burns out.
      let armor = this.disp.armor;
      for (const e of alive(cc)) {
        if (e.countdown > 1 || e.stunned) continue;
        const d = intentDamage(cc, e);
        if (d <= 0) continue;
        incoming += d - Math.min(armor, d);
        armor = 0;
      }
    }
    drawHearts(ctx, this.disp, t, this.heartPulse, incoming);
    drawResources(ctx, this.disp, this.coinFlash);
    const hotActive = ui.area('active', HUD.active[0], HUD.active[1], 34, 26);
    if (hotActive) this.useActive();
    drawActive(ctx, this.run.hero.active, this.disp, t, ui.hovered === 'active');
    if (ui.hovered === 'active' && this.run.hero.active) {
      const def = ITEMS[this.run.hero.active];
      ui.tooltip(def.name, `${def.desc}\nЗаряд: ${def.charge} чернил. Клавиша Q.`, ui.p.x, ui.p.y, 'vio5');
    }
    if (ui.area('bombs', HUD.bombs[0], HUD.bombs[1], 30, 10)) this.useBomb();
    if (ui.hovered === 'bombs') ui.tooltip('Бомбы', 'В бою: взрыв 3×3 в выбранном месте, время не тратит. Вне боя: взорвать стену — вдруг там секрет. Клавиша E.', ui.p.x, ui.p.y);
    if (ui.hovered === 'coins' || ui.area('coins', HUD.coins[0], HUD.coins[1], 30, 10)) void 0;
    drawMinimap(ctx, this.run, t);
    text(ctx, `${FLOORS[this.run.floor].name}`, 634, 62, 'cold4', { align: 'right', outline: 'ink0' });
    // Items bar with tooltips.
    const items = this.run.hero.items;
    drawItemsBar(ctx, items);
    items.slice(-26).forEach((id, k) => {
      if (ui.area(`item-${k}`, 8 + k * 17, 336, 16, 17)) void 0;
      if (ui.hovered === `item-${k}`) {
        const def = ITEMS[id];
        ui.tooltip(def.name, `${def.tagline}. ${def.desc}`, ui.p.x, ui.p.y - 60, 'gold4');
      }
    });
    if (this.run.hero.transformations.length)
      text(ctx, this.run.hero.transformations.map((x) => TRANSFORMATIONS[x as Tag].name).join(' · '), 634, 342, 'vio5', { align: 'right', outline: 'ink0' });
    // Boss bar.
    const c = this.run.combat;
    if (c?.boss && this.inCombat) {
      const bossE = c.enemies[0];
      const v = this.enemies.get(bossE.uid);
      if (v && v.dying === 0) drawBossBar(ctx, ENEMIES[bossE.def].name, v.hp, v.maxHp, t);
    }
    // The boss bar owns the bottom line, so the hint only shows in ordinary fights.
    if (this.inCombat && c && !c.boss && this.run.stats.moves === 0 && !this.busy()) {
      const a = 0.65 + Math.sin(t * 4) * 0.3;
      text(ctx, 'Потяни фишку на соседнюю клетку: обмен, который собирает 3 в ряд, — это ход', 320, 322, 'gold4', { align: 'center', outline: 'ink0', alpha: a });
      text(ctx, 'Враги ходят после тебя — следи за их таймерами', 320, 334, 'cold5', { align: 'center', outline: 'ink0', alpha: a });
    }
    if (this.inCombat && c) {
      const turns = c.moves;
      text(ctx, `ход ${turns + 1}`, BX + BW + 8, BY + BH - 8, turns >= 20 ? 'red4' : 'cold3', { outline: 'ink0' });
      if (turns >= 20) text(ctx, 'сверхурочные!', BX + BW + 8, BY + BH + 2, 'red4', { outline: 'ink0' });
    }
    if (this.targeting) text(ctx, this.targeting.kind === 'wall' ? 'Стрелка или клик по стене · Esc — отмена' : 'Esc — отмена', 320, 18, 'orange4', { align: 'center', outline: 'ink0' });
    if (this.toast) text(ctx, this.toast.s, 320, BY + BH + 20, 'cream', { align: 'center', outline: 'ink0', alpha: Math.min(1, this.toast.t * 2) });
  }

  private drawBanners(ctx: Ctx2D) {
    // Above the board's queue preview (y≈88), between the hearts and the minimap.
    let y = 34;
    for (const b of this.banners) {
      const a = Math.min(1, b.t * 5, (b.max - b.t) * 3);
      if (b.big) {
        ctx.globalAlpha = a * 0.75;
        ctx.fillStyle = hex('ink0');
        ctx.fillRect(0, 150, VW, 50);
        ctx.globalAlpha = 1;
        text(ctx, b.title, 320, 156, b.color, { align: 'center', scale: 2, outline: 'ink0', alpha: a });
        text(ctx, b.sub, 320, 182, 'cold5', { align: 'center', outline: 'ink0', alpha: a });
        continue;
      }
      const w = 220;
      ctx.globalAlpha = a;
      panel(ctx, 320 - w / 2, y, w, 38, { border: b.color, fill: 'ink0', glow: b.color });
      if (b.icon) draw(ctx, getFrame(b.icon), 320 - w / 2 + 20, y + 30);
      text(ctx, b.title, 320 + (b.icon ? 10 : 0), y + 7, b.color, { align: 'center', outline: 'ink0', alpha: a });
      text(ctx, b.sub, 320 + (b.icon ? 10 : 0), y + 21, 'cold5', { align: 'center', outline: 'ink0', alpha: a });
      ctx.globalAlpha = 1;
      y += 44;
    }
  }

}

export { PICKUP_NAMES } from './room.ts';

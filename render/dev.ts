import { ACTS, CHARACTERS } from '../game/content/acts.ts';
import { ENEMIES, INTENT_TEXT, MATERIAL_NAME } from '../game/content/enemies.ts';
import { EVENTS } from '../game/content/events.ts';
import { BASE_GEAR, FAM_ROLE, GEAR } from '../game/content/gear.ts';
import { ITEMS, POCKETS } from '../game/content/items.ts';
import { activeCost } from '../game/combat.ts';
import { dispatch, newRun } from '../game/run.ts';
import { FAMS, type CharId, type DevOp, type DevState, type GameEvent, type RunState } from '../game/types.ts';
import type { App } from './app.ts';
import { REQUESTS, blankProfile, saveProfile } from './profile.ts';
import { RunView } from './runview.ts';
import { roomFor, type RoomId } from './stage.ts';

export { cheatList } from './dev-cheats.ts';

/**
 * Dev mode: start a test run with any hero, build, act, place, enemies and room; edit the live
 * run; cheats and number knobs; the profile and the office; presets and links. Test runs are
 * custom runs — they never count for the profile. The React panel (components/dev-panel.tsx)
 * is a thin face over this API; `window.__osk.dev` exposes the same calls for scripts.
 */

export type DevPlace = 'map' | 'fight' | 'elite' | 'boss' | 'event' | 'shop' | 'rest' | 'treasure' | 'bossReward';

export interface DevBuild {
  /** Gear carried, any colour (a colour left out: the hero's plain item); up to 3 a colour. */
  gear: string[];
  /** Items held (the first carried of a colour otherwise). */
  equip?: string[];
  /** Upgraded gear. */
  ups?: string[];
  /** Red tape curses. */
  tape?: number;
  relics: string[];
  active: string | null;
  pockets: (string | null)[];
}

export interface DevStart {
  char: CharId;
  /** Absent: a random seed. */
  seed?: number;
  /** 0-based act (biome). */
  act: number;
  place: DevPlace;
  enemies?: string[];
  event?: string;
  /** A RoomId, or absent for the act's usual room. */
  room?: string;
  dark?: boolean;
  /** Absent: the hero's starting build. */
  build?: DevBuild;
  hero?: { hp?: number; maxHp?: number; coins?: number; charge?: number };
  cheats?: DevState;
}

/** Rooms by biome, for the room picker. */
export const DEV_ROOMS: { biome: string; rooms: RoomId[] }[] = [
  { biome: 'Отдел 1 — изнанка', rooms: ['openspace', 'copyroom', 'storage', 'breakroom', 'corridor', 'glass', 'archive'] },
  { biome: 'Отдел 2 — архив', rooms: ['ar_hall', 'ar_reading', 'ar_pump', 'ar_vault', 'flooded'] },
  { biome: 'Отдел 3 — котельная', rooms: ['bo_furnace', 'bo_lockers', 'bo_valves', 'bo_mirrors', 'boiler'] },
  { biome: 'Отдел 4 — дирекция', rooms: ['di_reception', 'di_meeting', 'di_library', 'di_boss', 'directorate'] },
  { biome: 'Офис', rooms: ['hub'] },
];

/** Places a test can start in, with the map's own icons. */
export const DEV_PLACES: { id: DevPlace; name: string; icon: string }[] = [
  { id: 'fight', name: 'Бой', icon: 'map_fight' },
  { id: 'elite', name: 'Начальство', icon: 'map_elite' },
  { id: 'boss', name: 'Босс', icon: 'map_boss' },
  { id: 'event', name: 'Событие', icon: 'map_event' },
  { id: 'shop', name: 'Касса', icon: 'map_shop' },
  { id: 'rest', name: 'Кулер', icon: 'map_rest' },
  { id: 'treasure', name: 'Сейф', icon: 'map_treasure' },
  { id: 'bossReward', name: 'Награда босса', icon: 'ui_mult' },
  { id: 'map', name: 'Карта отдела', icon: 'ui_map' },
];

/** Readable room names for the pickers. */
export const ROOM_NAME: Record<string, string> = {
  openspace: 'Кабинки',
  copyroom: 'Копировальная',
  storage: 'Склад',
  breakroom: 'Комната отдыха',
  corridor: 'Коридор',
  glass: 'Стеклянный кабинет',
  archive: 'Архив (вступление)',
  hub: 'Офис',
  flooded: 'Затопленный (старый)',
  boiler: 'Котельная (старая)',
  directorate: 'Дирекция (старая)',
  ar_hall: 'Стеллажи',
  ar_reading: 'Читальный зал',
  ar_pump: 'Насосная',
  ar_vault: 'Хранилище',
  di_reception: 'Приёмная',
  di_meeting: 'Переговорная',
  di_library: 'Библиотека',
  di_boss: 'Кабинет цензора',
  bo_furnace: 'Топочная',
  bo_lockers: 'Раздевалка',
  bo_valves: 'Щитовая',
  bo_mirrors: 'Комната зеркал',
};

/**
 * A build from storage or a link, made whole: saves from before gear (a deck of cards, weapons among
 * the items) keep their items, skill and pockets; gear found among the items goes into the hands.
 */
export function fixBuild(b: Partial<DevBuild> | undefined): DevBuild | undefined {
  if (!b) return undefined;
  const relics = Array.isArray(b.relics) ? b.relics : [];
  return {
    gear: [...(Array.isArray(b.gear) ? b.gear : []), ...relics.filter((id) => GEAR[id])].filter((id, k, all) => GEAR[id] && all.indexOf(id) === k),
    equip: (Array.isArray(b.equip) ? b.equip : []).filter((id) => GEAR[id]),
    ups: (Array.isArray(b.ups) ? b.ups : []).filter((id) => GEAR[id]),
    tape: Math.max(0, Math.min(9, Math.round(Number(b.tape) || 0))),
    relics: relics.filter((id) => ITEMS[id]?.kind === 'passive'),
    active: b.active && ITEMS[b.active]?.kind === 'active' ? b.active : null,
    pockets: Array.isArray(b.pockets) ? b.pockets.map((p) => (p && POCKETS[p] ? p : null)) : [],
  };
}

function fixStart(cfg: DevStart | null): DevStart | null {
  if (!cfg) return null;
  const build = fixBuild(cfg.build);
  return build ? { ...cfg, build } : { ...cfg, build: undefined };
}

const PRESETS_KEY = 'oskolki.dev.presets';
const LAST_KEY = 'oskolki.dev.last';

/** True for pointer and key events that belong to the dev panel (the game ignores them). */
export function isDevEvent(e: Event): boolean {
  return e.target instanceof Element && !!e.target.closest('.dev-panel');
}

/** Ask the React panel to open, close or toggle. */
export function toggleDevPanel(open?: boolean) {
  window.dispatchEvent(new CustomEvent('osk:dev', { detail: { open } }));
}

function toB64(s: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(b: string): string {
  const bin = atob(b.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class DevApi {
  /** A frame-time readout in the corner. */
  showPerf = false;
  constructor(private app: App) {}

  // ── What exists ─────────────────────────────────────────────────

  catalog() {
    const actsOf = (id: string) =>
      ACTS.map((a, k) => ([...a.weak, ...a.strong, ...a.elites].some((g) => g.includes(id)) || a.boss === id ? k : -1)).filter((k) => k >= 0);
    const itemName = (id: string | null) => (id ? (ITEMS[id]?.name ?? id) : 'нет');
    return {
      chars: Object.values(CHARACTERS).map((c) => ({
        id: c.id,
        name: c.name,
        desc: c.desc,
        maxHp: c.maxHp,
        coins: c.coins,
        relic: itemName(c.relic),
        active: itemName(c.active),
        pockets: c.pockets.map((p) => POCKETS[p]?.name ?? p),
      })),
      acts: ACTS.map((a, k) => ({ index: k, name: a.name, boss: a.boss, weak: a.weak, strong: a.strong, elites: a.elites, room: roomFor(k, 0, 'fight').id })),
      gear: Object.values(GEAR).map((g) => ({
        id: g.id,
        name: g.name,
        fam: g.gear.fam,
        role: FAM_ROLE[g.gear.fam],
        pool: g.pool,
        icon: g.icon,
        strike: g.gear.strikeText,
        super: g.gear.superText,
        up: g.gear.upText,
      })),
      relics: Object.values(ITEMS)
        .filter((i) => i.kind === 'passive')
        .map((i) => ({ id: i.id, name: i.name, pool: i.pool, desc: i.desc, icon: i.icon })),
      actives: Object.values(ITEMS)
        .filter((i) => i.kind === 'active')
        .map((i) => ({ id: i.id, name: i.name, desc: i.desc, charge: i.charge ?? 0, icon: i.icon })),
      pockets: Object.values(POCKETS).map((p) => ({ id: p.id, name: p.name, desc: p.desc, icon: p.icon })),
      enemies: Object.values(ENEMIES).map((e) => ({
        id: e.id,
        name: e.name,
        size: e.size,
        hp: e.hp,
        acts: actsOf(e.id),
        /** Health as it spawns in each act it lives in. */
        hpIn: actsOf(e.id).map((k) => ({ act: k, hp: Math.max(1, Math.round(e.hp * ACTS[k].hpMul)), armor: Math.round((e.armor ?? 0) * ACTS[k].hpMul) })),
        armor: e.armor ?? 0,
        material: MATERIAL_NAME[e.material] ?? e.material,
        traits: (e.traits ?? []).map(
          (t) => ({ splits: 'распадается при смерти', light: 'светится', diver: 'ныряет', turnstile: 'пока жив — только вверх-вниз', cramped: 'пока в бою — поле на столбец уже' })[t] ?? t,
        ),
        intents: e.intents.map((i) => `${INTENT_TEXT[i.kind] ?? i.kind}${i.value ? ` ${i.value}` : ''} · раз в ${i.timer} хода`),
        blurb: e.blurb,
      })),
      events: EVENTS.map((e) => ({ id: e.id, title: e.title, art: e.art, text: e.text, options: e.options.map((o) => `${o.label} — ${o.hint}`) })),
      rooms: DEV_ROOMS,
      places: DEV_PLACES,
      roomNames: ROOM_NAME,
      requests: REQUESTS.map((r) => ({ id: r.id, title: r.title })),
    };
  }

  /** The hero's starting build. */
  starter(char: CharId): DevBuild {
    const ch = CHARACTERS[char];
    const gear = FAMS.map((f) => ch.gear?.[f] ?? BASE_GEAR[f]);
    return {
      gear,
      equip: gear,
      ups: [],
      tape: 0,
      relics: [ch.relic],
      active: ch.active,
      pockets: [...ch.pockets, null, null, null].slice(0, 3),
    };
  }

  // ── Start a test run ────────────────────────────────────────────

  start(cfg: DevStart) {
    const app = this.app;
    app.audio.unlock();
    const seed = (cfg.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    let { run } = newRun({ seed, char: cfg.char, unlocked: this.allUnlocks(), lastAct: ACTS.length - 1, customSeed: true });
    let events: GameEvent[] = [];
    const step = (op: DevOp) => {
      const r = dispatch(run, { type: 'dev', op });
      run = r.run;
      events = r.events;
    };
    step({ op: 'set', dev: { ...cfg.cheats, room: cfg.room || undefined, dark: cfg.room ? (cfg.dark ?? true) : undefined } });
    if (cfg.act > 0) step({ op: 'act', act: cfg.act });
    const build = fixBuild(cfg.build);
    if (build) step({ op: 'build', ...build });
    if (cfg.hero) step({ op: 'hero', ...cfg.hero });
    if (cfg.place !== 'map') step({ op: 'enter', kind: cfg.place, enemies: cfg.enemies, event: cfg.event });
    else events = [{ t: 'act', act: run.act }];
    this.show(run, events);
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(cfg));
    } catch {
      /* storage unavailable */
    }
    return run.seed;
  }

  /** The last started configuration (to repeat it with one key). */
  last(): DevStart | null {
    try {
      const raw = localStorage.getItem(LAST_KEY);
      return raw ? fixStart(JSON.parse(raw) as DevStart) : null;
    } catch {
      return null;
    }
  }

  restart() {
    const cfg = this.last();
    if (cfg) this.start(cfg);
  }

  // ── The live run ────────────────────────────────────────────────

  run(): RunState | null {
    return this.app.game?.run ?? null;
  }

  /** Apply a command to the live run; a normal run becomes a test run (it will not count). */
  apply(op: DevOp): string | null {
    const g = this.app.game;
    if (!g) return 'Нет забега';
    let run = g.run;
    if (!run.customSeed) {
      run = structuredClone(run);
      run.customSeed = true;
    }
    const { run: next, events } = dispatch(run, { type: 'dev', op });
    const bad = events.find((e) => e.t === 'invalid');
    if (bad && bad.t === 'invalid') return bad.reason;
    this.show(next, events);
    return null;
  }

  private show(run: RunState, events: GameEvent[]) {
    const app = this.app;
    app.game = new RunView(app, run, events);
    app.mode = 'run';
    app.hub = null;
    app.intro = null;
  }

  /** A summary of the live run for the panel. */
  snapshot() {
    const app = this.app;
    const run = app.game?.run;
    return {
      mode: app.mode,
      auto: app.auto,
      speed: app.profile.settings.speed,
      muted: app.audio.muted,
      perf: Math.round(app.frameMs * 100) / 100,
      profile: {
        shards: app.profile.shards,
        runs: app.profile.runs,
        deaths: app.profile.deaths,
        introDone: app.profile.introDone,
        unlocks: [...app.profile.unlocks],
        bosses: [...app.profile.bosses],
      },
      run: run
        ? {
            char: run.hero.char,
            seed: run.seed,
            custom: run.customSeed,
            act: run.act,
            phase: run.phase,
            node: run.node,
            hp: run.hero.hp,
            maxHp: run.hero.maxHp,
            coins: run.hero.coins,
            charge: run.hero.charge,
            cost: activeCost(run),
            armor: run.hero.armor,
            gear: FAMS.flatMap((f) => run.hero.gear[f]),
            equip: FAMS.map((f) => run.hero.equip[f]),
            ups: [...run.hero.ups],
            tape: run.hero.tape,
            keys: run.hero.keys,
            finds: run.hero.finds,
            relics: [...run.hero.relics],
            active: run.hero.active,
            pockets: [...run.hero.pockets],
            dev: { ...run.dev },
            map: run.map.nodes.map((n) => ({ id: n.id, row: n.row, col: n.col, kind: n.kind, visited: n.visited })),
            enemies: run.combat ? run.combat.enemies.map((e) => ({ def: e.def, hp: e.hp, maxHp: e.maxHp })) : [],
          }
        : null,
    };
  }

  build(): DevBuild | null {
    const run = this.run();
    if (!run) return null;
    return {
      gear: FAMS.flatMap((f) => run.hero.gear[f]),
      equip: FAMS.map((f) => run.hero.equip[f]),
      ups: [...run.hero.ups],
      tape: run.hero.tape,
      relics: [...run.hero.relics],
      active: run.hero.active,
      pockets: [...run.hero.pockets],
    };
  }

  // ── Presets and links ───────────────────────────────────────────

  presets(): Record<string, DevStart> {
    try {
      const all = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}') as Record<string, DevStart>;
      return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, fixStart(v)!]));
    } catch {
      return {};
    }
  }

  savePreset(name: string, cfg: DevStart) {
    const all = this.presets();
    all[name] = cfg;
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable */
    }
  }

  deletePreset(name: string) {
    const all = this.presets();
    delete all[name];
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable */
    }
  }

  /** A link that opens the game straight into this test setup. */
  link(cfg: DevStart): string {
    return `${location.origin}${location.pathname}?dev#test=${toB64(JSON.stringify(cfg))}`;
  }

  /** Reads `#test=…` from the address (the link above). */
  fromLink(): DevStart | null {
    const m = /#test=([^&]+)/.exec(location.hash);
    if (!m) return null;
    try {
      return fixStart(JSON.parse(fromB64(m[1])) as DevStart);
    } catch {
      return null;
    }
  }

  // ── Profile, office, settings ───────────────────────────────────

  allUnlocks(): string[] {
    return REQUESTS.map((r) => r.id);
  }

  profile(op: { shards?: number; unlockAll?: boolean; lockAll?: boolean; introDone?: boolean; boss?: { id: string; on: boolean }; deaths?: number; reset?: boolean }) {
    const app = this.app;
    if (op.reset) {
      app.profile = blankProfile();
      app.profile.settings.muted = app.audio.muted;
    }
    const p = app.profile;
    if (op.shards !== undefined) p.shards = Math.max(0, Math.round(op.shards));
    if (op.unlockAll) p.unlocks = this.allUnlocks();
    if (op.lockAll) p.unlocks = [];
    if (op.introDone !== undefined) p.introDone = op.introDone;
    if (op.deaths !== undefined) p.deaths = Math.max(0, Math.round(op.deaths));
    if (op.boss) {
      p.bosses = p.bosses.filter((b) => b !== op.boss!.id);
      if (op.boss.on) p.bosses.push(op.boss.id);
    }
    saveProfile(p);
  }

  go(where: 'title' | 'hub' | 'wake' | 'intro' | 'continue') {
    const app = this.app;
    if (where === 'title') app.toTitle();
    else if (where === 'hub') app.toHub('enter');
    else if (where === 'wake') app.toHub('wake');
    else if (where === 'intro') app.startIntro();
    else app.continueRun();
  }

  /** The office's oddities on demand. */
  office(what: 'hush' | 'phone') {
    const hub = this.app.hub;
    if (!hub) return;
    if (what === 'hush') hub.hush.next = 0;
    else hub.phone.next = 0;
  }

  lightLab() {
    this.app.lightLab();
  }

  settings(op: { speed?: number; auto?: boolean; muted?: boolean; perf?: boolean }) {
    const app = this.app;
    if (op.speed !== undefined) app.profile.settings.speed = op.speed;
    if (op.auto !== undefined) app.auto = op.auto;
    if (op.muted !== undefined && op.muted !== app.audio.muted) app.audio.toggleMute();
    if (op.perf !== undefined) this.showPerf = op.perf;
    saveProfile(app.profile);
  }
}

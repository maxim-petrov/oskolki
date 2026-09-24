import type { RunState } from '../game/types.ts';

/**
 * Persistent profile (localStorage only): shards of memory and what they bought on the board
 * of requests, how the office has changed, the collection, stats and settings.
 */
export interface RunRecord {
  seed: number;
  char: string;
  won: boolean;
  act: number;
  cause: string;
  shards: number;
  date: string;
}

export interface Profile {
  v: 3;
  /** Shards of memory not spent yet. */
  shards: number;
  shardsTotal: number;
  /** Requests bought on the board (meta unlocks). */
  unlocks: string[];
  /** The intro has been played (the first shift). */
  introDone: boolean;
  /** Bosses ever beaten. */
  bosses: string[];
  deaths: number;
  runs: number;
  wins: number;
  seenCards: string[];
  seenRelics: string[];
  seenEnemies: string[];
  /** Notes pinned to the office board (story beats already shown). */
  notes: string[];
  history: RunRecord[];
  settings: { volume: number; muted: boolean; speed: number; shake: number; char: string };
}

const KEY = 'oskolki.office.profile';
const RUN_KEY = 'oskolki.office.run';

export function blankProfile(): Profile {
  return {
    v: 3,
    shards: 0,
    shardsTotal: 0,
    unlocks: [],
    introDone: false,
    bosses: [],
    deaths: 0,
    runs: 0,
    wins: 0,
    seenCards: [],
    seenRelics: [],
    seenEnemies: [],
    notes: [],
    history: [],
    settings: { volume: 0.6, muted: false, speed: 1, shake: 1, char: 'intern' },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankProfile();
    const p = JSON.parse(raw);
    if (p?.v !== 3) return blankProfile();
    return { ...blankProfile(), ...p, settings: { ...blankProfile().settings, ...p.settings } };
  } catch {
    return blankProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: keep playing */
  }
}

export function saveRunRaw(raw: string | null) {
  try {
    if (raw) localStorage.setItem(RUN_KEY, raw);
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadRunRaw(): string | null {
  try {
    return localStorage.getItem(RUN_KEY);
  } catch {
    return null;
  }
}

// ── Board of requests (meta unlocks bought with shards) ──────────────

export interface Request {
  id: string;
  title: string;
  text: string;
  cost: number;
  /** Shown only once this holds. */
  visible?: (p: Profile) => boolean;
}

export const REQUESTS: Request[] = [
  { id: 'start_coffee', title: 'Аптечка', text: 'Каждая смена начинается с кофе в кармане.', cost: 3 },
  { id: 'bundle_paper', title: 'Канцелярия+', text: 'В наградах и кассе: Резак, Шило, Тревожная кнопка.', cost: 4 },
  { id: 'start_coins', title: 'Аванс', text: '+25 монет в начале смены.', cost: 4 },
  { id: 'bundle_accounting', title: 'Бухгалтерия+', text: 'Квартальный отчёт, Золотая скрепка, Кредитка.', cost: 5 },
  { id: 'char_accountant', title: 'Перевод: Бухгалтер', text: 'Коллега из бухгалтерии выйдет в смену вместо тебя.', cost: 6 },
  { id: 'bundle_ink', title: 'Чернильные дела', text: 'Штамп «Копия», Копирка, Пресс-папье.', cost: 5 },
  { id: 'bundle_relics', title: 'Склад находок', text: 'Кольцевая скоба, Бесконечная ручка, Пачка копирки.', cost: 6 },
  { id: 'char_janitor', title: 'Перевод: Уборщица', text: 'Она видела всё. И моет пол шваброй, которая делает броню.', cost: 10 },
  {
    id: 'act4',
    title: 'Пропуск в дирекцию',
    text: 'После котельной смена продолжится на этаже дирекции.',
    cost: 8,
    visible: (p) => p.bosses.includes('mirror'),
  },
];

export function buyRequest(p: Profile, id: string): boolean {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r || p.unlocks.includes(id) || p.shards < r.cost) return false;
  p.shards -= r.cost;
  p.unlocks.push(id);
  saveProfile(p);
  return true;
}

/** Bank the shards of a finished run and record it. */
export function recordRun(p: Profile, run: RunState) {
  if (run.customSeed) return;
  p.runs++;
  if (run.phase === 'won') p.wins++;
  else p.deaths++;
  p.shards += run.stats.shards;
  p.shardsTotal += run.stats.shards;
  for (const b of run.stats.bossesKilled) if (!p.bosses.includes(b)) p.bosses.push(b);
  for (const c of run.hero.deck) if (!p.seenCards.includes(c.id)) p.seenCards.push(c.id);
  for (const r of run.hero.relics) if (!p.seenRelics.includes(r)) p.seenRelics.push(r);
  p.history.unshift({
    seed: run.seed,
    char: run.hero.char,
    won: run.phase === 'won',
    act: run.act,
    cause: run.stats.deathCause,
    shards: run.stats.shards,
    date: new Date().toISOString(),
  });
  p.history = p.history.slice(0, 30);
  saveProfile(p);
}

/** How the office looks after what has happened so far (the hub reads this). */
export function officeState(p: Profile) {
  return {
    /** After the first death: a note on the board that was not there yesterday. */
    note: p.deaths >= 1,
    /** After the supervisor falls, the neighbour's desk stands empty (he is in the shift now). */
    neighbourGone: p.bosses.includes('supervisor'),
    /** The supervisor's glass office goes dark after she is beaten. */
    supervisorGone: p.bosses.includes('supervisor'),
    /** After the archive keeper, the elevator doors stay open. */
    elevatorOpen: p.bosses.includes('tide'),
    /** After the boiler room: the directorate pass hangs by the door. */
    directorate: p.bosses.includes('mirror'),
    shifts: p.runs,
  };
}

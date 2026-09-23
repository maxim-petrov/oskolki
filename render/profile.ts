import { ITEMS } from '../game/content/items.ts';
import type { RunState } from '../game/types.ts';

/** Persistent profile: unlocks, collection, stats, settings. localStorage only. */
export interface Profile {
  v: 1;
  achievements: string[];
  seenItems: string[];
  seenEnemies: string[];
  runs: number;
  wins: number;
  streak: number;
  bestStreak: number;
  totalBombs: number;
  history: { seed: number; char: string; won: boolean; floor: number; cause: string; items: string[]; date: string }[];
  settings: { volume: number; muted: boolean; speed: number; shake: number; char: string };
}

const KEY = 'oskolki.rebirth.profile';
const RUN_KEY = 'oskolki.rebirth.run';

export function blankProfile(): Profile {
  return {
    v: 1,
    achievements: [],
    seenItems: [],
    seenEnemies: [],
    runs: 0,
    wins: 0,
    streak: 0,
    bestStreak: 0,
    totalBombs: 0,
    history: [],
    settings: { volume: 0.6, muted: false, speed: 1, shake: 1, char: 'intern' },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankProfile();
    const p = JSON.parse(raw);
    if (p?.v !== 1) return blankProfile();
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

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  unlocks: string;
  check: (run: RunState, p: Profile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'killCabinet', name: 'Архив разобран', desc: 'Победи Картотеку', unlocks: 'Лупа', check: (r) => r.stats.bossesKilled.includes('cabinet') },
  { id: 'rockets3', name: 'Салют', desc: '3 ракеты за один ход', unlocks: 'Бесконечная ручка', check: (r) => r.stats.maxRocketsInMove >= 3 },
  { id: 'bossNoHit', name: 'Без единой царапины', desc: 'Победи босса без урона', unlocks: 'Мятная жвачка', check: (r) => r.stats.bossesNoHit > 0 },
  { id: 'bombs10', name: 'Сапёр', desc: 'Используй 10 бомб за всё время', unlocks: 'Праздничный динамит', check: (_r, p) => p.totalBombs >= 10 },
  { id: 'coins50', name: 'Годовой бюджет', desc: 'Заработай 50 монет за забег', unlocks: 'Персонаж: Бухгалтер', check: (r) => r.stats.coinsEarned >= 50 },
  { id: 'killTide', name: 'Отлив', desc: 'Победи Хранителя прилива', unlocks: 'Персонаж: Уборщица', check: (r) => r.stats.bossesKilled.includes('tide') },
  { id: 'killMirror', name: 'Отражение разбито', desc: 'Победи Кривое зеркало', unlocks: 'Этаж: Дирекция', check: (r) => r.stats.bossesKilled.includes('mirror') },
  { id: 'killCensor', name: 'Одобрено', desc: 'Победи Главного цензора', unlocks: 'Титул «Сотрудник года»', check: (r) => r.stats.bossesKilled.includes('censor') },
  { id: 'combo6', name: 'Цепная реакция', desc: 'Каскад из 6 волн', unlocks: '—', check: (r) => r.stats.maxCombo >= 6 },
  { id: 'items12', name: 'Коллекционер', desc: '12 предметов за забег', unlocks: '—', check: (r) => r.stats.itemsTaken >= 12 },
];

export function unlockedItemKeys(p: Profile): string[] {
  return p.achievements;
}

export function newlyEarned(run: RunState, p: Profile): Achievement[] {
  if (run.customSeed) return [];
  return ACHIEVEMENTS.filter((a) => !p.achievements.includes(a.id) && a.check(run, p));
}

export function itemCount() {
  return Object.values(ITEMS).filter((i) => i.pools.length).length;
}

import type { CharId, Fam } from '../types.ts';

/**
 * Acts (biomes) of a run. Encounters are fixed enemy groups: the first fights of an act
 * draw from `weak`, later ones from `strong`. Enemy hp and damage are multiplied by the
 * act's `hpMul` / `dmgMul` when they spawn.
 */
export interface ActDef {
  id: string;
  name: string;
  subtitle: string;
  /** Visual preset for the renderer (room kit and light). */
  fx: 'openspace' | 'archive' | 'boiler' | 'directorate';
  hpMul: number;
  dmgMul: number;
  /** Elites of the act have this much more health and hit this much harder (the first act has elites of their own). */
  eliteHp?: number;
  eliteDmg?: number;
  weak: string[][];
  strong: string[][];
  elites: string[][];
  boss: string;
  /** Number of room looks (locations) the renderer can build for this act. */
  looks: number;
}

export const ACTS: ActDef[] = [
  {
    id: 'openspace',
    name: 'Изнанка отдела',
    subtitle: 'Отдел 1',
    fx: 'openspace',
    hpMul: 1,
    dmgMul: 1,
    eliteHp: 0.6,
    eliteDmg: 1.4,
    weak: [['rat'], ['drop', 'drop'], ['blot'], ['moth'], ['phone']],
    strong: [['rat', 'rat'], ['stapler', 'drop'], ['eraser'], ['copier'], ['moth', 'blot'], ['phone', 'rat'], ['stapler', 'moth'], ['copier', 'drop'], ['turnstile'], ['turnstile', 'drop']],
    elites: [['neighbor'], ['cabinet']],
    boss: 'supervisor',
    looks: 5,
  },
  {
    id: 'archive',
    name: 'Затопленный архив',
    subtitle: 'Отдел 2',
    fx: 'archive',
    hpMul: 4.2,
    dmgMul: 2.1,
    eliteHp: 1.3,
    eliteDmg: 1.25,
    weak: [['scribe'], ['eel'], ['angler']],
    strong: [['crab', 'eel'], ['scribe', 'blot'], ['angler', 'drop', 'drop'], ['anchor'], ['eel', 'eel'], ['crab', 'scribe']],
    elites: [['anchor', 'scribe'], ['crab', 'crab'], ['storekeeper', 'scribe']],
    boss: 'tide',
    looks: 3,
  },
  {
    id: 'boiler',
    name: 'Котельная',
    subtitle: 'Отдел 3',
    fx: 'boiler',
    hpMul: 13.5,
    dmgMul: 2.9,
    eliteHp: 1.25,
    eliteDmg: 1.25,
    weak: [['candle'], ['stoker'], ['bell']],
    strong: [['safe'], ['candle', 'stoker'], ['bell', 'candle'], ['archivist', 'candle'], ['stoker', 'stoker'], ['safe', 'candle']],
    elites: [['safe', 'candle'], ['archivist', 'bell']],
    boss: 'mirror',
    looks: 3,
  },
  {
    id: 'directorate',
    name: 'Дирекция',
    subtitle: 'Отдел 4',
    fx: 'directorate',
    hpMul: 21,
    dmgMul: 4.25,
    eliteHp: 1.4,
    eliteDmg: 1.25,
    weak: [['stamp'], ['secretary']],
    strong: [['stamp', 'secretary'], ['safe', 'secretary'], ['bell', 'archivist'], ['stoker', 'stamp'], ['stamp', 'archivist'], ['turnstile', 'secretary']],
    elites: [['stamp', 'stamp'], ['secretary', 'secretary', 'archivist']],
    boss: 'censor',
    looks: 3,
  },
];

export interface CharDef {
  id: CharId;
  name: string;
  desc: string;
  maxHp: number;
  coins: number;
  relic: string;
  active: string | null;
  pockets: string[];
  /** Items held at the start where they differ from the plain ones (BASE_GEAR). */
  gear?: Partial<Record<Fam, string>>;
  /** Colour weights of the bag where they differ from the usual 4/4/3/2. */
  weights?: Partial<Record<Fam, number>>;
  /** Meta unlock id; null = available from the start. */
  unlock: string | null;
}

export const CHARACTERS: Record<CharId, CharDef> = {
  intern: {
    id: 'intern',
    name: 'Стажёр',
    desc: 'Первая неделя. Канцелярский нож, щит, батарейка и монетка — ничего лишнего; пропуск и ластик.',
    maxHp: 8,
    coins: 20,
    relic: 'badge',
    active: 'eraser',
    pockets: [],
    unlock: null,
  },
  accountant: {
    id: 'accountant',
    name: 'Бухгалтер',
    desc: 'Считает каждую монету. Жёлтых фишек у него больше, премия и калькулятор превращают их в урон.',
    maxHp: 8,
    coins: 40,
    relic: 'calculator',
    active: null,
    pockets: ['choco'],
    gear: { coin: 'bonus' },
    weights: { blade: 3, shield: 3, ink: 2, coin: 4 },
    unlock: 'char_accountant',
  },
  janitor: {
    id: 'janitor',
    name: 'Уборщик',
    desc: 'Видел всё. Молчит. Файлик вместо щита, а швабра превращает грязь на поле в броню.',
    maxHp: 8,
    coins: 10,
    relic: 'mop',
    active: 'corrector',
    pockets: [],
    gear: { shield: 'sleeve' },
    unlock: 'char_janitor',
  },
};

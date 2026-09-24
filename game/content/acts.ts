import type { CharId } from '../types.ts';

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
    weak: [['rat'], ['drop', 'drop'], ['blot'], ['moth'], ['phone']],
    strong: [['rat', 'rat'], ['stapler', 'drop'], ['eraser'], ['copier'], ['moth', 'blot'], ['phone', 'rat'], ['stapler', 'moth'], ['copier', 'drop']],
    elites: [['neighbor'], ['cabinet']],
    boss: 'supervisor',
    looks: 5,
  },
  {
    id: 'archive',
    name: 'Затопленный архив',
    subtitle: 'Отдел 2',
    fx: 'archive',
    hpMul: 13,
    dmgMul: 2,
    weak: [['scribe'], ['eel'], ['angler']],
    strong: [['crab', 'eel'], ['scribe', 'blot'], ['angler', 'drop', 'drop'], ['anchor'], ['eel', 'eel'], ['crab', 'scribe']],
    elites: [['anchor', 'scribe'], ['crab', 'crab']],
    boss: 'tide',
    looks: 3,
  },
  {
    id: 'boiler',
    name: 'Котельная',
    subtitle: 'Отдел 3',
    fx: 'boiler',
    hpMul: 40,
    dmgMul: 3,
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
    hpMul: 60,
    dmgMul: 3.6,
    weak: [['stamp'], ['secretary']],
    strong: [['stamp', 'secretary'], ['safe', 'secretary'], ['bell', 'archivist'], ['stoker', 'stamp'], ['stamp', 'archivist']],
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
  /** Meta unlock id; null = available from the start. */
  unlock: string | null;
}

export const CHARACTERS: Record<CharId, CharDef> = {
  intern: {
    id: 'intern',
    name: 'Стажёр',
    desc: 'Первая неделя. Канцелярский нож и ластик в кармане.',
    maxHp: 60,
    coins: 20,
    relic: 'knife',
    active: 'eraser',
    pockets: [],
    unlock: null,
  },
  accountant: {
    id: 'accountant',
    name: 'Бухгалтер',
    desc: 'Считает каждую монету. Золото даёт ему множитель.',
    maxHp: 52,
    coins: 40,
    relic: 'calculator',
    active: null,
    pockets: ['energy'],
    unlock: 'char_accountant',
  },
  janitor: {
    id: 'janitor',
    name: 'Уборщица',
    desc: 'Видела всё. Швабра превращает грязь на поле в броню.',
    maxHp: 72,
    coins: 10,
    relic: 'mop',
    active: 'corrector',
    pockets: ['bomb'],
    unlock: 'char_janitor',
  },
};

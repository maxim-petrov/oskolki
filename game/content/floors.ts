export interface FloorDef {
  id: string;
  name: string;
  subtitle: string;
  boss: string;
  /** Enemy pool with weights. */
  pool: [string, number][];
  /** Rooms besides start/boss/specials. */
  rooms: [number, number];
  /** Budget of a combat room = base + perDist × distance (capped). */
  budget: { base: number; perDist: number; max: number };
  hpMul: number;
  dmgAdd: number;
  /** Visual preset for the renderer. */
  fx: 'office' | 'archive' | 'boiler' | 'directorate';
}

export const FLOORS: FloorDef[] = [
  {
    id: 'office',
    name: 'Канцелярия',
    subtitle: 'Этаж 1',
    boss: 'cabinet',
    pool: [
      ['rat', 5],
      ['stapler', 3],
      ['blot', 3],
      ['moth', 3],
      ['eraser', 2],
    ],
    rooms: [6, 8],
    budget: { base: 0.6, perDist: 0.6, max: 3.2 },
    hpMul: 1.6,
    dmgAdd: 0,
    fx: 'office',
  },
  {
    id: 'archive',
    name: 'Затопленный архив',
    subtitle: 'Этаж 2',
    boss: 'tide',
    pool: [
      ['scribe', 3],
      ['crab', 3],
      ['eel', 3],
      ['angler', 3],
      ['anchor', 2],
      ['rat', 2],
      ['blot', 2],
    ],
    rooms: [7, 9],
    budget: { base: 2.0, perDist: 0.6, max: 5.2 },
    hpMul: 2.3,
    dmgAdd: 0,
    fx: 'archive',
  },
  {
    id: 'boiler',
    name: 'Котельная',
    subtitle: 'Этаж 3',
    boss: 'mirror',
    pool: [
      ['candle', 3],
      ['stoker', 3],
      ['bell', 3],
      ['safe', 2],
      ['archivist', 3],
      ['crab', 1],
      ['scribe', 1],
    ],
    rooms: [8, 10],
    budget: { base: 3.0, perDist: 0.6, max: 6.6 },
    hpMul: 3.1,
    dmgAdd: 1,
    fx: 'boiler',
  },
  {
    id: 'directorate',
    name: 'Дирекция',
    subtitle: 'Этаж 4',
    boss: 'censor',
    pool: [
      ['stamp', 3],
      ['secretary', 3],
      ['safe', 2],
      ['bell', 2],
      ['anchor', 2],
      ['archivist', 2],
      ['stoker', 2],
    ],
    rooms: [8, 10],
    budget: { base: 3.2, perDist: 0.7, max: 7.5 },
    hpMul: 3.6,
    dmgAdd: 1,
    fx: 'directorate',
  },
];

export const CHARACTERS = {
  intern: {
    id: 'intern' as const,
    name: 'Стажёр',
    desc: 'Первый день. Три сердца, ластик в кармане.',
    hearts: 3,
    soul: 0,
    damage: 1,
    active: 'eraser',
    items: [] as string[],
    coins: 0,
    bombs: 1,
    keys: 0,
    unlock: null as string | null,
  },
  accountant: {
    id: 'accountant' as const,
    name: 'Бухгалтер',
    desc: 'Считает каждую монету. Монеты бьют врагов.',
    hearts: 2,
    soul: 2,
    damage: 0.8,
    active: null as string | null,
    items: ['register'],
    coins: 10,
    bombs: 1,
    keys: 1,
    unlock: 'coins50' as string | null,
  },
  janitor: {
    id: 'janitor' as const,
    name: 'Уборщица',
    desc: 'Четыре сердца, швабра и три бомбы.',
    hearts: 4,
    soul: 0,
    damage: 0.8,
    active: 'mop',
    items: [] as string[],
    coins: 0,
    bombs: 3,
    keys: 0,
    unlock: 'killTide' as string | null,
  },
};

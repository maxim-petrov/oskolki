import type { FindKind } from '../types.ts';

/**
 * Finds: yellow tiles fill the finds meter, and a full meter puts a find on a plain tile of the
 * board. The tile keeps its colour: a group or a blast through it picks the find up.
 */
export interface FindDef {
  kind: FindKind;
  name: string;
  desc: string;
  /** Share of the finds, out of 100. */
  weight: number;
}

export const FINDS: Record<FindKind, FindDef> = {
  coins: { kind: 'coins', name: 'Горсть монет', desc: '+5 монет.', weight: 25 },
  key: { kind: 'key', name: 'Ключ от сейфа', desc: 'Сейф на 6-м этаже откроется на выбор из трёх предметов.', weight: 25 },
  heart: { kind: 'heart', name: 'Сердце', desc: 'Лечит сердце.', weight: 20 },
  battery: { kind: 'battery', name: 'Батарейка', desc: '+5 энергии.', weight: 15 },
  bomb: { kind: 'bomb', name: 'Бомба', desc: 'Бомба в карман (полны карманы — 3 монеты).', weight: 15 },
};

export const FIND_KINDS = Object.keys(FINDS) as FindKind[];

/** Yellow tiles fill the meter (one point each, some items more); a full meter puts a find on the board. */
export const FIND_METER = 90;
/** A handful of coins; the battery's energy; coins for a bomb with every pocket full. */
export const FIND_COINS = 5;
export const FIND_ENERGY = 5;
export const FIND_BOMB_COINS = 3;

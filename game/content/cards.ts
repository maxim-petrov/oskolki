import type { Fam, Finish } from '../types.ts';
import { heartsText, plural } from '../text.ts';

/**
 * Tile cards: the deck. Every tile on the board is a copy of one card. The card's family
 * decides what it matches with; `v` is what it adds to its family's resource when it is
 * scored (red → the weapon in hand strikes, blue → armor, violet → energy, gold → coins). Extra rules live in
 * `game/combat.ts` (scoreTile / groupArmor), keyed by card id; `text` describes them.
 * `{v}` in the text is replaced with the value (upgraded or not), `{h}` with it in hearts (blue cards:
 * a group blocks once, by its best card, in half-hearts).
 */
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'status';

export interface CardDef {
  id: string;
  name: string;
  fam: Fam | 'status';
  rarity: Rarity;
  v: number;
  vUp: number;
  text: string;
  /** Meta unlock that adds the card to the pools; absent = always available. */
  unlock?: string;
}

const c = (def: CardDef) => def;

export const CARDS: Record<string, CardDef> = {
  // ── Удар (red): the weapon in hand strikes (game/content/items.ts, weapons); the card adds its value ──
  fist: c({ id: 'fist', name: 'Удар', fam: 'blade', rarity: 'starter', v: 0, vUp: 1, text: 'Бьёт оружием в руке{v}.' }),
  pins: c({ id: 'pins', name: 'Кнопки', fam: 'blade', rarity: 'common', v: 1, vUp: 2, text: 'Бьёт оружием в руке{v}.' }),
  redpen: c({ id: 'redpen', name: 'Красная ручка', fam: 'blade', rarity: 'uncommon', v: 0, vUp: 1, text: 'Бьёт оружием в руке{v}. Группа с ручкой — супер-удар уже из 3 фишек.' }),
  alarm: c({ id: 'alarm', name: 'Тревожная кнопка', fam: 'blade', rarity: 'rare', v: 0, vUp: 1, text: 'Бьёт оружием в руке{v}. +3 урона удару за каждую красную группу хода.' }),

  // ── Защита (blue): armor in half-hearts, once per group (its best card; +½ heart for a group of 4+) ──
  folder: c({ id: 'folder', name: 'Папка', fam: 'shield', rarity: 'starter', v: 1, vUp: 2, text: 'Группа даёт броню: {h}.' }),
  binder: c({ id: 'binder', name: 'Скоросшиватель', fam: 'shield', rarity: 'common', v: 2, vUp: 3, text: 'Группа даёт броню: {h}.' }),
  sleeve: c({ id: 'sleeve', name: 'Файлик', fam: 'shield', rarity: 'common', v: 1, vUp: 2, text: 'Броня {h}. Убирает кляксы и волокиту рядом.' }),
  umbrella: c({ id: 'umbrella', name: 'Зонтик', fam: 'shield', rarity: 'common', v: 1, vUp: 2, text: 'Броня {h}. Следующий удар врага слабее на ½ сердца (зонтики не складываются).' }),
  drawer: c({ id: 'drawer', name: 'Картотечный ящик', fam: 'shield', rarity: 'uncommon', v: 2, vUp: 3, text: 'Броня {h}. +3 урона удару, если в ходу собраны и красные, и синие.' }),
  laminator: c({ id: 'laminator', name: 'Ламинатор', fam: 'shield', rarity: 'uncommon', v: 1, vUp: 2, text: 'Броня {h}, в группе из 4+ — вдвое больше.' }),
  archivebox: c({ id: 'archivebox', name: 'Архивная коробка', fam: 'shield', rarity: 'uncommon', v: 2, vUp: 3, text: 'Броня {h}. Группа из 4+ лечит ½ сердца.' }),
  vest: c({ id: 'vest', name: 'Бронежилет из папок', fam: 'shield', rarity: 'rare', v: 2, vUp: 3, text: 'Броня {h}. Вся броня хода удваивается.' }),
  clipboard: c({ id: 'clipboard', name: 'Планшет', fam: 'shield', rarity: 'rare', v: 1, vUp: 2, text: 'Броня {h}. Следующий удар врага бьёт и его: 4 урона за каждую половинку сердца.' }),

  // ── Чернила (violet): charge and control ─────────────────────────
  ink: c({ id: 'ink', name: 'Чернила', fam: 'ink', rarity: 'starter', v: 1, vUp: 2, text: '{v} энергии: навык и смена оружия.' }),
  corrector: c({ id: 'corrector', name: 'Корректор', fam: 'ink', rarity: 'common', v: 1, vUp: 2, text: '{v} энергии. Снимает скобы и кляксы с соседних фишек.' }),
  urgent: c({ id: 'urgent', name: 'Печать «Срочно»', fam: 'ink', rarity: 'common', v: 1, vUp: 2, text: '{v} энергии. Таймер цели +1 (раз за ход).' }),
  blotcurse: c({ id: 'blotcurse', name: 'Клякса', fam: 'ink', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} урона каждому врагу.' }),
  quill: c({ id: 'quill', name: 'Перо', fam: 'ink', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} энергии. Группа с пером даёт +3 урона удару, если навык заряжен.' }),
  copystamp: c({ id: 'copystamp', name: 'Штамп «Копия»', fam: 'ink', rarity: 'rare', v: 1, vUp: 2, text: '{v} энергии. 2 случайные фишки поля становятся копией лучшей карты колоды.', unlock: 'bundle_ink' }),
  carbon: c({ id: 'carbon', name: 'Копирка', fam: 'ink', rarity: 'rare', v: 1, vUp: 2, text: '{v} энергии. Следующая группа этого хода срабатывает дважды.', unlock: 'bundle_ink' }),
  weight: c({ id: 'weight', name: 'Пресс-папье', fam: 'ink', rarity: 'uncommon', v: 1, vUp: 2, text: '{v} энергии. Группа из 4+ оглушает цель.', unlock: 'bundle_ink' }),

  // ── Бухгалтерия (gold): coins, rare (money is short) ─────────────
  clip: c({ id: 'clip', name: 'Скрепка', fam: 'coin', rarity: 'starter', v: 1, vUp: 2, text: '{v} монета.' }),
  coin: c({ id: 'coin', name: 'Монетка', fam: 'coin', rarity: 'rare', v: 2, vUp: 3, text: '{v} монеты.' }),
  receipt: c({ id: 'receipt', name: 'Чек', fam: 'coin', rarity: 'common', v: 1, vUp: 2, text: '{v} монета за каждую фишку своей группы.' }),
  bonus: c({ id: 'bonus', name: 'Премия', fam: 'coin', rarity: 'uncommon', v: 3, vUp: 5, text: '1 монета и +{v} урона удару хода.' }),
  card: c({ id: 'card', name: 'Кредитка', fam: 'coin', rarity: 'uncommon', v: 6, vUp: 9, text: '+{v} урона удару, но стоит 2 монеты (без денег не работает).', unlock: 'bundle_accounting' }),
  piggy: c({ id: 'piggy', name: 'Копилка', fam: 'coin', rarity: 'uncommon', v: 1, vUp: 2, text: '{v} монета. После боя +3 монеты.' }),
  report: c({ id: 'report', name: 'Квартальный отчёт', fam: 'coin', rarity: 'rare', v: 2, vUp: 3, text: '1 монета. Раз за ход: +{v} урона удару за каждое семейство, собранное до отчёта.', unlock: 'bundle_accounting' }),
  goldclip: c({ id: 'goldclip', name: 'Золотая скрепка', fam: 'coin', rarity: 'rare', v: 3, vUp: 4, text: 'Раз за ход: урон хода +30% (улучшенная — +50%). {v} монеты.', unlock: 'bundle_accounting' }),

  // ── Status: enemies slip these in ────────────────────────────────
  redtape: c({ id: 'redtape', name: 'Волокита', fam: 'status', rarity: 'status', v: 0, vUp: 0, text: 'Не собирается. Исчезает, если рядом собрать группу или взорвать.' }),
};

/** Money is short: one paper clip in a deck (the accountant is the one who makes money). */
export const STARTER_DECKS: Record<string, string[]> = {
  intern: ['fist', 'fist', 'fist', 'fist', 'folder', 'folder', 'folder', 'folder', 'ink', 'ink', 'ink', 'clip'],
  accountant: ['fist', 'fist', 'fist', 'folder', 'folder', 'folder', 'ink', 'ink', 'clip', 'clip', 'coin', 'bonus'],
  janitor: ['fist', 'fist', 'fist', 'fist', 'folder', 'folder', 'folder', 'ink', 'ink', 'ink', 'clip', 'sleeve'],
};

export const FINISH_TEXT: Record<Finish, { name: string; text: string }> = {
  sharp: { name: 'Заточка', text: '+1 к значению' },
  gild: { name: 'Позолота', text: '+1 монета при сборе' },
  seal: { name: 'Печать', text: '+2 урона при сборе' },
  copy: { name: 'Копия', text: 'срабатывает дважды' },
  laminate: { name: 'Ламинат', text: 'враги не портят' },
};

export const RARITY_PRICE: Record<Rarity, number> = { starter: 30, common: 40, uncommon: 60, rare: 100, status: 0 };

export function cardValue(id: string, up: boolean): number {
  const def = CARDS[id];
  return def ? (up ? def.vUp : def.v) : 0;
}

const NOUNS: [RegExp, string, string, string][] = [
  [/(\d+) заряда/g, 'заряд', 'заряда', 'зарядов'],
  [/(\d+) монет[аы]?/g, 'монета', 'монеты', 'монет'],
];

export function cardText(id: string, up: boolean): string {
  const def = CARDS[id];
  if (!def) return '';
  // Red cards add their value to the weapon: « (+1 к урону)», nothing at zero.
  const v = cardValue(id, up);
  let t = def.text.replace('{v}', def.fam === 'blade' ? (v ? ` (+${v} к урону)` : '') : String(v)).replace('{h}', heartsText(v));
  for (const [re, one, few, many] of NOUNS) t = t.replace(re, (_m, n) => `${n} ${plural(Number(n), one, few, many)}`);
  if (id === 'goldclip' && up) t = t.replace('+30% (улучшенная — +50%)', '+50%');
  else if (id === 'goldclip') t = t.replace(' (улучшенная — +50%)', '');
  return t;
}

/** Cards that can show up as rewards and in shops. */
export function rewardPool(unlocked: readonly string[]): string[] {
  return Object.values(CARDS)
    .filter((d) => d.rarity !== 'starter' && d.rarity !== 'status' && (!d.unlock || unlocked.includes(d.unlock)))
    .map((d) => d.id);
}

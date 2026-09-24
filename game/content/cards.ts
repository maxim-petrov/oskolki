import type { Fam, Finish } from '../types.ts';

/**
 * Tile cards: the deck. Every tile on the board is a copy of one card. The card's family
 * decides what it matches with; `v` is what it adds to its family's resource when it is
 * scored (red → damage, blue → armor, violet → charge, gold → coins). Extra rules live in
 * `game/combat.ts` (scoreTile / afterGroup), keyed by card id; `text` describes them.
 * `{v}` in the text is replaced with the value (upgraded or not).
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
  // ── Удар (red): damage ────────────────────────────────────────────
  fist: c({ id: 'fist', name: 'Кулак', fam: 'blade', rarity: 'starter', v: 2, vUp: 3, text: '{v} урона.' }),
  punch: c({ id: 'punch', name: 'Дырокол', fam: 'blade', rarity: 'common', v: 2, vUp: 3, text: '{v} урона. Удар хода пробивает броню и щит врага.' }),
  redpen: c({ id: 'redpen', name: 'Красная ручка', fam: 'blade', rarity: 'common', v: 1, vUp: 2, text: '{v} урона. Цель получает 2 кровотечения.' }),
  sharpener: c({ id: 'sharpener', name: 'Точилка', fam: 'blade', rarity: 'common', v: 1, vUp: 2, text: '{v} урона, в каскаде — впятеро больше.' }),
  pins: c({ id: 'pins', name: 'Кнопки', fam: 'blade', rarity: 'common', v: 1, vUp: 2, text: '{v} урона цели и столько же каждому врагу.' }),
  scissors: c({ id: 'scissors', name: 'Ножницы', fam: 'blade', rarity: 'uncommon', v: 3, vUp: 4, text: '{v} урона. Группа из 4+ фишек — ещё +1 множ.' }),
  ruler: c({ id: 'ruler', name: 'Линейка', fam: 'blade', rarity: 'uncommon', v: 1, vUp: 2, text: '{v} урона за каждую фишку своей группы.' }),
  stapler: c({ id: 'stapler', name: 'Степлер', fam: 'blade', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} урона и +1 за каждую красную фишку, собранную раньше в этом ходу.' }),
  awl: c({ id: 'awl', name: 'Шило', fam: 'blade', rarity: 'rare', v: 8, vUp: 11, text: '{v} урона. Ты теряешь 2 здоровья.', unlock: 'bundle_paper' }),
  cutter: c({ id: 'cutter', name: 'Резак', fam: 'blade', rarity: 'rare', v: 4, vUp: 6, text: '{v} урона, по бумажным врагам — втрое больше.', unlock: 'bundle_paper' }),
  alarm: c({ id: 'alarm', name: 'Тревожная кнопка', fam: 'blade', rarity: 'rare', v: 1, vUp: 2, text: '{v} урона. Группа даёт +1 множ за каждую красную группу этого хода.', unlock: 'bundle_paper' }),

  // ── Защита (blue): armor ──────────────────────────────────────────
  folder: c({ id: 'folder', name: 'Папка', fam: 'shield', rarity: 'starter', v: 1, vUp: 2, text: '{v} брони.' }),
  binder: c({ id: 'binder', name: 'Скоросшиватель', fam: 'shield', rarity: 'common', v: 2, vUp: 3, text: '{v} брони.' }),
  sleeve: c({ id: 'sleeve', name: 'Файлик', fam: 'shield', rarity: 'common', v: 1, vUp: 2, text: '{v} брони. Убирает кляксы и волокиту рядом.' }),
  umbrella: c({ id: 'umbrella', name: 'Зонтик', fam: 'shield', rarity: 'common', v: 1, vUp: 2, text: '{v} брони. Следующий удар врага слабее на 4.' }),
  drawer: c({ id: 'drawer', name: 'Картотечный ящик', fam: 'shield', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} брони. +1 множ, если в ходу собраны и красные, и синие.' }),
  laminator: c({ id: 'laminator', name: 'Ламинатор', fam: 'shield', rarity: 'uncommon', v: 1, vUp: 2, text: '{v} брони, в группе из 4+ — вдвое больше.' }),
  archivebox: c({ id: 'archivebox', name: 'Архивная коробка', fam: 'shield', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} брони. Группа из 4+ лечит 4.' }),
  vest: c({ id: 'vest', name: 'Бронежилет из папок', fam: 'shield', rarity: 'rare', v: 2, vUp: 3, text: '{v} брони. Вся броня хода удваивается.' }),
  clipboard: c({ id: 'clipboard', name: 'Планшет', fam: 'shield', rarity: 'rare', v: 1, vUp: 2, text: '{v} брони. Половина следующего удара врага летит обратно в него.' }),

  // ── Чернила (violet): charge and control ─────────────────────────
  ink: c({ id: 'ink', name: 'Чернила', fam: 'ink', rarity: 'starter', v: 1, vUp: 2, text: '{v} заряда навыка.' }),
  corrector: c({ id: 'corrector', name: 'Корректор', fam: 'ink', rarity: 'common', v: 1, vUp: 2, text: '{v} заряда. Снимает скобы и кляксы с соседних фишек.' }),
  urgent: c({ id: 'urgent', name: 'Печать «Срочно»', fam: 'ink', rarity: 'common', v: 1, vUp: 2, text: '{v} заряда. Таймер цели +1.' }),
  blotcurse: c({ id: 'blotcurse', name: 'Клякса', fam: 'ink', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} урона каждому врагу (умножается).' }),
  quill: c({ id: 'quill', name: 'Перо', fam: 'ink', rarity: 'uncommon', v: 2, vUp: 3, text: '{v} заряда. Группа с пером даёт +1 множ, если навык заряжен.' }),
  copystamp: c({ id: 'copystamp', name: 'Штамп «Копия»', fam: 'ink', rarity: 'rare', v: 1, vUp: 2, text: '{v} заряда. 2 случайные фишки поля становятся копией лучшей карты колоды.', unlock: 'bundle_ink' }),
  carbon: c({ id: 'carbon', name: 'Копирка', fam: 'ink', rarity: 'rare', v: 1, vUp: 2, text: '{v} заряда. Следующая группа этого хода срабатывает дважды.', unlock: 'bundle_ink' }),
  weight: c({ id: 'weight', name: 'Пресс-папье', fam: 'ink', rarity: 'uncommon', v: 1, vUp: 2, text: '{v} заряда. Группа из 4+ оглушает цель.', unlock: 'bundle_ink' }),

  // ── Бухгалтерия (gold): coins and multiplier ─────────────────────
  clip: c({ id: 'clip', name: 'Скрепка', fam: 'coin', rarity: 'starter', v: 1, vUp: 2, text: '{v} монета.' }),
  coin: c({ id: 'coin', name: 'Монетка', fam: 'coin', rarity: 'common', v: 2, vUp: 3, text: '{v} монеты.' }),
  receipt: c({ id: 'receipt', name: 'Чек', fam: 'coin', rarity: 'common', v: 1, vUp: 2, text: '{v} монета за каждую фишку своей группы.' }),
  bonus: c({ id: 'bonus', name: 'Премия', fam: 'coin', rarity: 'uncommon', v: 1, vUp: 2, text: '+{v} множ.' }),
  card: c({ id: 'card', name: 'Кредитка', fam: 'coin', rarity: 'uncommon', v: 2, vUp: 3, text: '+{v} множ, но стоит 2 монеты (без денег не работает).', unlock: 'bundle_accounting' }),
  piggy: c({ id: 'piggy', name: 'Копилка', fam: 'coin', rarity: 'uncommon', v: 1, vUp: 2, text: '{v} монета. После боя +3 монеты.' }),
  report: c({ id: 'report', name: 'Квартальный отчёт', fam: 'coin', rarity: 'rare', v: 1, vUp: 2, text: '1 монета. Раз за ход: +{v} множ за каждое семейство, собранное до отчёта.', unlock: 'bundle_accounting' }),
  goldclip: c({ id: 'goldclip', name: 'Золотая скрепка', fam: 'coin', rarity: 'rare', v: 3, vUp: 4, text: 'Раз за ход: множ ×1,5 (улучшенная — ×2). {v} монеты.', unlock: 'bundle_accounting' }),

  // ── Status: enemies slip these in ────────────────────────────────
  redtape: c({ id: 'redtape', name: 'Волокита', fam: 'status', rarity: 'status', v: 0, vUp: 0, text: 'Не собирается. Исчезает, если рядом собрать группу или взорвать.' }),
};

export const STARTER_DECKS: Record<string, string[]> = {
  intern: ['fist', 'fist', 'fist', 'folder', 'folder', 'folder', 'ink', 'ink', 'ink', 'clip', 'clip', 'clip'],
  accountant: ['fist', 'fist', 'fist', 'folder', 'folder', 'ink', 'ink', 'clip', 'clip', 'clip', 'coin', 'bonus'],
  janitor: ['fist', 'fist', 'folder', 'folder', 'folder', 'folder', 'ink', 'ink', 'ink', 'clip', 'clip', 'sleeve'],
};

export const FINISH_TEXT: Record<Finish, { name: string; text: string }> = {
  sharp: { name: 'Заточка', text: '+1 к значению' },
  gild: { name: 'Позолота', text: '+1 монета при сборе' },
  seal: { name: 'Печать', text: '+1 множ при сборе' },
  copy: { name: 'Копия', text: 'срабатывает дважды' },
  laminate: { name: 'Ламинат', text: 'враги не портят' },
};

export const RARITY_PRICE: Record<Rarity, number> = { starter: 30, common: 45, uncommon: 70, rare: 120, status: 0 };

export function cardValue(id: string, up: boolean): number {
  const def = CARDS[id];
  return def ? (up ? def.vUp : def.v) : 0;
}

export function cardText(id: string, up: boolean): string {
  const def = CARDS[id];
  if (!def) return '';
  let t = def.text.replace('{v}', String(cardValue(id, up)));
  if (id === 'goldclip' && up) t = t.replace('×1,5 (улучшенная — ×2)', '×2');
  else if (id === 'goldclip') t = t.replace(' (улучшенная — ×2)', '');
  return t;
}

/** Cards that can show up as rewards and in shops. */
export function rewardPool(unlocked: readonly string[]): string[] {
  return Object.values(CARDS)
    .filter((d) => d.rarity !== 'starter' && d.rarity !== 'status' && (!d.unlock || unlocked.includes(d.unlock)))
    .map((d) => d.id);
}

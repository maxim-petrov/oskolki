import {
  COLORS,
  ITEMS,
  SPELLS,
  type Color,
  type ItemId,
  type Mana,
  type SpellId,
} from './catalog.ts';
import type { Fighter } from './engine.ts';
export type ItemState = {
  barrier: number;
  healed: number;
  ember: boolean;
  metronome: boolean;
  ledgerCoins: number;
  ledgerReady: boolean;
  answer: boolean;
  insuranceUsed: boolean;
  purseGold: number;
  scholarXp: number;
  seals: Color[];
  capacitorSpent: number;
  capacitorReadyAt: number | null;
  topCasts: number;
  topReady: boolean;
  initiative: Partial<Record<ItemId, boolean>>;
};
export const freshItems = (insuranceUsed = false): ItemState => ({
  barrier: 0,
  healed: 0,
  ember: false,
  metronome: false,
  ledgerCoins: 0,
  ledgerReady: false,
  answer: false,
  insuranceUsed,
  purseGold: 0,
  scholarXp: 0,
  seals: [],
  capacitorSpent: 0,
  capacitorReadyAt: null,
  topCasts: 0,
  topReady: false,
  initiative: {},
});
export const owns = (f: Fighter, id: ItemId) =>
  Object.values(f.gear).includes(id);
export const itemState = (f: Fighter) => (f.items ??= freshItems());
export function spellPayment(
  f: Fighter,
  id: SpellId,
  modern = true,
): { cost: Partial<Mana>; health: number; expensive: Color } {
  const cost = { ...SPELLS[id].cost };
  const expensive = [...COLORS].sort(
    (a, b) => (cost[b] ?? 0) - (cost[a] ?? 0),
  )[0];
  const discount =
    modern &&
    owns(f, 'bloodInkwell') &&
    !f.items?.initiative.bloodInkwell &&
    f.hp > 2
      ? Math.min(2, Math.max(0, (cost[expensive] ?? 0) - 1))
      : 0;
  if (discount) cost[expensive] = cost[expensive]! - discount;
  return { cost, health: discount ? 2 : 0, expensive };
}
export function itemWarnings(
  gear: Fighter['gear'],
  replacement?: ItemId,
): string[] {
  const ids = Object.values(
    replacement ? { ...gear, [ITEMS[replacement].slot]: replacement } : gear,
  );
  const warnings = [];
  if (ids.includes('reservoir') && ids.includes('fullBlade'))
    warnings.push(
      'Резервуар увеличивает запас: Полный клинок дольше набирает бонус.',
    );
  if (ids.includes('reservoir') && ids.includes('overflowRobe'))
    warnings.push('С Резервуаром переполнение случается реже.');
  if (ids.includes('contractBlade'))
    warnings.push(
      'Лечение выше половины здоровья отключит бонус Договорного клинка.',
    );
  if (ids.includes('infiniteDiploma'))
    warnings.push('Звёзды больше не дают опыт: рост уровня замедлится.');
  if (ids.includes('glassNib'))
    warnings.push(
      'Стеклянное перо: первое попадание врага за действие получает +1 урона.',
    );
  if (ids.includes('saltCoat'))
    warnings.push('Соляной плащ уменьшает Передышку с 11 до 7 HP.');
  if (ids.includes('waterwheel'))
    warnings.push(
      'Водяное колесо расходует огонь: может отложить атакующее заклинание.',
    );
  if (ids.includes('mortgage') || ids.includes('eclipseRing'))
    warnings.push(
      'Бонус оплачивается здоровьем; самооплата не запускает ответ и не поглощается защитой.',
    );
  return warnings;
}

export function spellDescription(f: Fighter, id: SpellId): string {
  if (id === 'mend' && owns(f, 'saltCoat'))
    return 'Восстановить 7 здоровья (Соляной плащ). Ход переходит врагу.';
  return SPELLS[id].description;
}

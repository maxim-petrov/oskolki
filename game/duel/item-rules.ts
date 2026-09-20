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
  shiftColor: Color | null;
  waitingSpent: boolean;
  yieldUses: number;
  lastPassUsed: boolean;
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
  shiftColor: null,
  waitingSpent: false,
  yieldUses: 0,
  lastPassUsed: false,
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
    warnings.push(
      'Если доступна Передышка, Соляной плащ уменьшает её лечение с 11 до 7 HP.',
    );
  if (ids.includes('waterwheel'))
    warnings.push(
      'Водяное колесо расходует огонь: может отложить атакующее заклинание.',
    );
  if (
    ids.includes('mortgage') ||
    ids.includes('eclipseRing') ||
    ids.includes('bloodInkwell')
  )
    warnings.push(
      'Бонус оплачивается здоровьем; самооплата не запускает ответ и не поглощается защитой.',
    );
  if (ids.includes('quarterCutter'))
    warnings.push(
      'Четвертной резак обнуляет базовый урон естественных троек черепов.',
    );
  if (ids.includes('dullPunch'))
    warnings.push(
      'Дырокол превращает до 2 базового урона в барьер. Мирный ответ врага может потратить эту защиту впустую.',
    );
  if (ids.includes('auditPencil'))
    warnings.push(
      'Карандаш уменьшает вашу добычу на 1 ману; уничтоженная чужая мана к вам не переходит.',
    );
  if (ids.includes('edgeSleeves'))
    warnings.push(
      'Нарукавники тратят 1 ману добычи на защиту у края; будущую магию придётся оплатить оставшимся запасом.',
    );
  if (ids.includes('reserveLining'))
    warnings.push(
      'Подкладка автоматически тратит 3 маны на тяжёлый удар; полный цвет и цена заклинания могут потеряться.',
    );
  if (ids.includes('waitingVest'))
    warnings.push(
      'Жилет ожидания тратит 2 земли только после чужого продолжения и не защищает от первого удара.',
    );
  if (ids.includes('exchangeCoupon') && ids.includes('fullBlade'))
    warnings.push(
      'Перенос Талона может как заполнить цвет для Клинка, так и разрушить уже полный запас.',
    );
  if (ids.includes('safetyMagnet'))
    warnings.push(
      'Магнит обезвреживает общий череп: можно потерять взрыв, который вы собирались забрать сами.',
    );
  if (ids.includes('agreementSheet'))
    warnings.push(
      'Лист уменьшает водяную добычу на 1 и оставляет общую землю: её может получить противник.',
    );
  if (ids.includes('openRing')) {
    warnings.push(
      'Разомкнутое кольцо уменьшает вместимость всех цветов на 6. Потерянная при надевании мана не возвращается и не даёт барьер.',
    );
    if (
      !ids.some((id) =>
        ['fullBlade', 'overflowRobe', 'reserveLining'].includes(id!),
      )
    )
      warnings.push(
        'В этом комплекте пока нет преобразователя малых запасов: кольцо только уменьшает резерв. Будущий партнёр не гарантирован.',
      );
    if (ids.includes('reservoir'))
      warnings.push(
        'Резервуар частично компенсирует меньшую вместимость, но отдаляет заполнение и переполнение.',
      );
  }
  if (ids.includes('yieldRing'))
    warnings.push(
      'Уступка меняет настоящее дополнительное действие на барьер; противник получает доступ ко всему полю.',
    );
  if (ids.includes('lastPass') && ids.includes('fullBlade'))
    warnings.push(
      'Пропуск требует малого запаса в первой волне, Клинок — полного цвета перед ударом; поздний каскад может совместить оба условия.',
    );
  return warnings;
}

// Evaluate the resulting four-slot loadout, never the replaced item as well.
// These are precise existing interactions, not loot weights or set bonuses.
export function itemConnections(
  gear: Fighter['gear'],
  replacement?: ItemId,
): string[] {
  const ids = Object.values(
    replacement ? { ...gear, [ITEMS[replacement].slot]: replacement } : gear,
  );
  const has = (...pair: ItemId[]) => pair.every((id) => ids.includes(id));
  const connections: string[] = [];
  if (has('openRing', 'fullBlade'))
    connections.push(
      'Меньшие запасы раньше достигают порога Полного клинка; удар всё равно тратит по 2 маны полного цвета.',
    );
  if (has('openRing', 'overflowRobe'))
    connections.push(
      'Меньшая вместимость раньше создаёт настоящий перелив для Мантии. Надевание кольца переливом не считается.',
    );
  if (has('openRing', 'reserveLining'))
    connections.push(
      'Меньшая вместимость снижает порог половины для Подкладки, но сама оплата по-прежнему равна 3 маны.',
    );
  if (has('dullPunch', 'mirrorVest'))
    connections.push(
      'Барьер Дырокола может отражать урон через Жилетку. Без попадания отражения нет.',
    );
  if (has('dullPunch', 'ledger'))
    connections.push(
      'Дырокол уменьшает только базу тройки; готовая Книга сохраняет свою прибавку к удару.',
    );
  if (has('dullPunch', 'fireSeal'))
    connections.push(
      'Дырокол ослабляет урон, но три физических черепа всё ещё дают огонь Печати.',
    );
  if (
    has('auditPencil', 'agreementSheet') ||
    has('edgeSleeves', 'agreementSheet')
  )
    connections.push(
      'Одна водяная тройка может оплачивать несколько эффектов по порядку слотов. Каждая вещь забирает свою единицу маны.',
    );
  if (
    has('agreementSheet', 'tideNeedle') ||
    has('agreementSheet', 'cottonCuffs') ||
    has('agreementSheet', 'waterwheel')
  )
    connections.push(
      'Лист оставляет землю, но все три исходные воды по-прежнему считаются физически собранными.',
    );
  if (has('waitingVest', 'bluePass'))
    connections.push(
      'Синий пропуск даёт стартовые 2 земли для возможной реакции Жилета на чужое продолжение.',
    );
  if (has('yieldRing', 'mirrorVest'))
    connections.push(
      'Барьер Уступки может отражать следующее попадание через Жилетку; чужое действие без атаки сжигает барьер.',
    );
  if (has('yieldRing', 'spinningTop'))
    connections.push(
      'Уступка не расходует готовую Юлу и не позволяет тут же вернуть отданную инициативу.',
    );
  if (has('lastPass', 'spinningTop'))
    connections.push(
      'Юла имеет приоритет: Пропуск сохраняет свою активацию, если Юла уже дала продолжение.',
    );
  return connections;
}

export function spellDescription(f: Fighter, id: SpellId): string {
  if (id === 'mend' && owns(f, 'saltCoat'))
    return 'Восстановить 7 здоровья (Соляной плащ). Ход переходит врагу.';
  return SPELLS[id].description;
}

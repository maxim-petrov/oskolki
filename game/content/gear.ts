import type { Fam } from '../types.ts';
import type { Pool } from './items.ts';

/**
 * Gear: every colour of the board is the item the hero holds for it. Red tiles strike with the
 * weapon, blue ones block with the shield, violet ones charge energy with the battery, yellow ones
 * pay coins and fill the finds meter with the coin. A hero carries up to MAX_GEAR items of a colour
 * and holds one; in a fight a swap costs energy. A group of 4+ works as the item's super.
 * Rules live in `scoreTile` / `groupArmor` / `strike` (game/combat.ts), keyed by these effects.
 */

/** What a group of a colour does besides its value. */
export interface GearEffect {
  // ── red ──
  /** Extra damage per red tile of the group (on the target). */
  perTile?: number;
  /** Damage per red tile to every enemy. */
  allPerTile?: number;
  /** Bleed on the target (grows with enemy health, like every effect outside the strike). */
  bleed?: number;
  pierce?: boolean;
  stun?: boolean;
  /** Ticks the target's timer is pushed back (once a move, within the hold cap). */
  delay?: number;
  /** Damage bonus against paper enemies (+1 = +100%). */
  paper?: number;
  /** Half-hearts the hero loses. */
  selfDmg?: number;
  /** Damage of every red tile in cascade waves (2+), instead of the item's own. */
  cascadeTile?: number;
  /** Share of the target's maximum health it loses at once (through armour: it grows with the act). */
  hpPct?: number;
  // ── blue ──
  /** Extra armour of the group, half-hearts. */
  block?: number;
  /** The next enemy blow is weaker by this much (half-hearts; wards of several moves do not stack). */
  ward?: number;
  /** The next blow is sent back at the attacker (REFLECT_PER_HALF per half-heart). */
  reflect?: boolean;
  /** All armour of the move ×n. */
  armorX?: number;
  /** This group's armour ×n. */
  groupX?: number;
  /** Heals the hero, half-hearts (once per group). */
  heal?: number;
  /** Cleans junk next to the group's tiles; 'all' also pulls staples and embers. */
  cleanse?: 'junk' | 'all';
  /** Damage to the strike when red and blue both scored this move. */
  redBonus?: number;
  // ── violet ──
  /** Extra energy per tile. */
  energy?: number;
  /** Damage to every enemy per tile. */
  aoe?: number;
  /** Damage to the strike when the move fills the energy meter (once per group). */
  quill?: number;
  /** The next group of the move scores twice. */
  copyNext?: number;
  /** Random tiles of the board turn red. */
  stamp?: number;
  // ── yellow ──
  /** Extra coins per group. */
  coins?: number;
  /** Coins per tile of the group. */
  coinsPerTile?: number;
  /** Extra finds-meter points per tile. */
  finds?: number;
  /** Damage to the strike per tile. */
  dmgPerTile?: number;
  /** Coins the group pays for its damage (without them it does not work). */
  costPerGroup?: number;
  /** Damage bonus of the move, once per move (+0.3 = +30%). */
  bonusPct?: number;
  /** Damage to the strike per colour scored this move before it, once per move. */
  famDmg?: number;
  /** Coins after the fight, per group. */
  afterFight?: number;
}

export interface GearDef {
  fam: Fam;
  /** Red: damage per tile · blue: armour per group (half-hearts) · violet: energy per tile · yellow: coins per group. */
  value: number;
  /** Added to the value in every act after the first (a weapon that grows with the shift). */
  valueAct?: number;
  /** Every group of the colour. */
  strike: GearEffect;
  /** A group of 4+ (and a charged move, a stamped tile). */
  super: GearEffect;
  /** What the upgrade adds («Щит+»): the value is added, effects replace. */
  up: { value?: number; strike?: GearEffect; super?: GearEffect };
  strikeText: string;
  superText: string;
  upText: string;
}

export interface GearItem {
  id: string;
  name: string;
  desc: string;
  kind: 'gear';
  gear: GearDef;
  icon: string;
  pool: Pool;
  unlock?: string;
}

/** Items a hero can carry per colour (one held); swapping in a fight costs energy. */
export const MAX_GEAR = 3;
export const GEAR_SWAP_COST = 2;

/** What a colour's item does, in the player's words. */
export const FAM_ROLE: Record<Fam, string> = { blade: 'оружие', shield: 'щит', ink: 'энергия', coin: 'находки' };

const g = (id: string, name: string, pool: Pool, icon: string, gear: GearDef, unlock?: string): GearItem => ({
  id,
  name,
  desc: `${gear.strikeText} Группа из 4+: ${gear.superText[0].toLowerCase()}${gear.superText.slice(1)}`,
  kind: 'gear',
  icon,
  pool,
  gear,
  ...(unlock ? { unlock } : {}),
});

const PLUS1: GearDef['up'] = { value: 1 };

export const GEAR: Record<string, GearItem> = {
  // ── Red: weapons ────────────────────────────────────────────────────
  knife: g('knife', 'Канцелярский нож', 'starter', 'card_knife', {
    fam: 'blade',
    value: 2,
    strike: { paper: 1 },
    super: { allPerTile: 2 },
    up: PLUS1,
    strikeText: '2 урона за фишку. По бумажным врагам +100%.',
    superText: 'Длинный разрез: ещё 2 урона за фишку каждому врагу.',
    upText: '+1 урона за фишку.',
  }),
  staplegun: g('staplegun', 'Строительный степлер', 'common', 'card_stapler', {
    fam: 'blade',
    value: 2,
    strike: { delay: 1 },
    super: { stun: true },
    up: PLUS1,
    strikeText: '2 урона за фишку. Скобы: таймер цели +1 (раз за ход).',
    superText: 'Скрепить намертво: цель пропускает действие.',
    upText: '+1 урона за фишку.',
  }),
  scissors: g('scissors', 'Ножницы', 'uncommon', 'card_scissors', {
    fam: 'blade',
    value: 2,
    strike: { bleed: 1 },
    super: { bleed: 3 },
    up: PLUS1,
    strikeText: '2 урона за фишку. Цель кровоточит: 1 (растёт с отделом).',
    superText: 'Двойное лезвие: ещё 3 кровотечения.',
    upText: '+1 урона за фишку.',
  }),
  punch: g('punch', 'Дырокол', 'uncommon', 'card_punch', {
    fam: 'blade',
    value: 2,
    strike: { pierce: true },
    super: { stun: true },
    up: PLUS1,
    strikeText: '2 урона за фишку. Удар пробивает броню и щит.',
    superText: 'Сквозная дыра: цель пропускает действие.',
    upText: '+1 урона за фишку.',
  }),
  ruler: g('ruler', 'Линейка', 'uncommon', 'card_ruler', {
    fam: 'blade',
    value: 2,
    strike: { allPerTile: 3 },
    super: { allPerTile: 3 },
    up: PLUS1,
    strikeText: 'Бьёт всех: 2 урона за фишку цели и ещё 3 — каждому врагу.',
    superText: 'Плашмя по всем: ещё 3 за фишку каждому врагу.',
    upText: '+1 урона за фишку.',
  }),
  sharpener: g('sharpener', 'Точилка', 'uncommon', 'card_sharpener', {
    fam: 'blade',
    value: 2,
    strike: { cascadeTile: 6 },
    super: { perTile: 3 },
    up: PLUS1,
    strikeText: '2 урона за фишку, а в каскаде — 6.',
    superText: 'Стружка: ещё 3 за фишку.',
    upText: '+1 урона за фишку.',
  }),
  awl: g(
    'awl',
    'Шило',
    'rare',
    'card_awl',
    {
      fam: 'blade',
      value: 4,
      valueAct: 2,
      strike: { pierce: true },
      super: { perTile: 4 },
      up: PLUS1,
      strikeText: '4 урона за фишку (+2 с каждым отделом), насквозь через броню и щит.',
      superText: 'Прокол: ещё 4 за фишку.',
      upText: '+1 урона за фишку.',
    },
    'bundle_paper',
  ),
  cutter: g(
    'cutter',
    'Резак',
    'rare',
    'card_cutter',
    {
      fam: 'blade',
      value: 2,
      strike: { paper: 2 },
      super: { hpPct: 0.1 },
      up: PLUS1,
      strikeText: '2 урона за фишку. По бумажным врагам +200%.',
      superText: 'Гильотина: цель теряет 10% максимума здоровья.',
      upText: '+1 урона за фишку.',
    },
    'bundle_paper',
  ),

  // ── Blue: shields (armour per group, half-hearts) ───────────────────
  shield: g('shield', 'Щит', 'starter', 'tile_shield', {
    fam: 'shield',
    value: 1,
    strike: {},
    super: { block: 1 },
    up: PLUS1,
    strikeText: 'Группа даёт броню: ½ сердца.',
    superText: 'Щит поднят: ещё ½ сердца брони.',
    upText: '+½ сердца брони за группу.',
  }),
  binder: g('binder', 'Скоросшиватель', 'common', 'card_binder', {
    fam: 'shield',
    value: 2,
    strike: {},
    super: { block: 1 },
    up: PLUS1,
    strikeText: 'Группа даёт броню: 1 сердце.',
    superText: 'Толстая подшивка: ещё ½ сердца брони.',
    upText: '+½ сердца брони за группу.',
  }),
  sleeve: g('sleeve', 'Файлик', 'common', 'card_sleeve', {
    fam: 'shield',
    value: 1,
    strike: { cleanse: 'junk' },
    super: { block: 1 },
    up: PLUS1,
    strikeText: 'Броня ½ сердца. Убирает кляксы и волокиту рядом с группой.',
    superText: 'Ещё ½ сердца брони.',
    upText: '+½ сердца брони за группу.',
  }),
  umbrella: g('umbrella', 'Зонтик', 'common', 'card_umbrella', {
    fam: 'shield',
    value: 1,
    strike: { ward: 1 },
    super: { ward: 2 },
    up: PLUS1,
    strikeText: 'Броня ½ сердца. Следующий удар врага слабее на ½ сердца (зонтики не складываются).',
    superText: 'Раскрыт целиком: следующий удар слабее на сердце.',
    upText: '+½ сердца брони за группу.',
  }),
  drawer: g('drawer', 'Картотечный ящик', 'uncommon', 'card_drawer', {
    fam: 'shield',
    value: 2,
    strike: { redBonus: 3 },
    super: { block: 1 },
    up: PLUS1,
    strikeText: 'Броня 1 сердце. +3 урона удару, если в ходу собраны и красные, и синие.',
    superText: 'Ещё ½ сердца брони.',
    upText: '+½ сердца брони за группу.',
  }),
  laminator: g('laminator', 'Ламинатор', 'uncommon', 'card_laminator', {
    fam: 'shield',
    value: 1,
    strike: {},
    super: { block: 1, groupX: 2 },
    up: PLUS1,
    strikeText: 'Броня ½ сердца.',
    superText: 'Броня группы вдвое больше (и ещё ½ сердца до удвоения).',
    upText: '+½ сердца брони за группу.',
  }),
  archivebox: g('archivebox', 'Архивная коробка', 'uncommon', 'card_archivebox', {
    fam: 'shield',
    value: 2,
    strike: {},
    super: { block: 1, heal: 1 },
    up: PLUS1,
    strikeText: 'Броня 1 сердце.',
    superText: 'Ещё ½ сердца брони и лечит ½ сердца.',
    upText: '+½ сердца брони за группу.',
  }),
  foldervest: g('foldervest', 'Бронежилет из папок', 'rare', 'card_vest', {
    fam: 'shield',
    value: 2,
    strike: { armorX: 2 },
    super: { block: 1 },
    up: PLUS1,
    strikeText: 'Броня 1 сердце. Вся броня хода удваивается.',
    superText: 'Ещё ½ сердца брони.',
    upText: '+½ сердца брони за группу.',
  }),
  clipboard: g('clipboard', 'Планшет', 'rare', 'card_clipboard', {
    fam: 'shield',
    value: 1,
    strike: { reflect: true },
    super: { block: 1 },
    up: PLUS1,
    strikeText: 'Броня ½ сердца. Следующий удар врага бьёт и его: 4 урона за каждую половинку сердца.',
    superText: 'Ещё ½ сердца брони.',
    upText: '+½ сердца брони за группу.',
  }),

  // ── Violet: energy (per tile) ───────────────────────────────────────
  battery: g('battery', 'Батарейка', 'starter', 'tile_battery', {
    fam: 'ink',
    value: 1,
    strike: {},
    super: { energy: 1 },
    up: PLUS1,
    strikeText: '1 энергия за фишку.',
    superText: 'Полный заряд: ещё 1 энергия за фишку.',
    upText: '+1 энергия за фишку.',
  }),
  whiteout: g('whiteout', 'Корректор', 'common', 'card_corrector', {
    fam: 'ink',
    value: 1,
    strike: { cleanse: 'all' },
    super: { energy: 1 },
    up: PLUS1,
    strikeText: '1 энергия за фишку. Снимает скобы, угольки и кляксы с соседних фишек.',
    superText: 'Ещё 1 энергия за фишку.',
    upText: '+1 энергия за фишку.',
  }),
  urgent: g('urgent', 'Печать «Срочно»', 'common', 'card_urgent', {
    fam: 'ink',
    value: 1,
    strike: { delay: 1 },
    super: { energy: 1 },
    up: PLUS1,
    strikeText: '1 энергия за фишку. Таймер цели +1 (раз за ход).',
    superText: 'Ещё 1 энергия за фишку.',
    upText: '+1 энергия за фишку.',
  }),
  blotcurse: g('blotcurse', 'Клякса', 'uncommon', 'card_blotcurse', {
    fam: 'ink',
    value: 0,
    strike: { aoe: 2 },
    super: { aoe: 2 },
    up: { strike: { aoe: 3 } },
    strikeText: 'Вместо энергии: 2 урона за фишку каждому врагу.',
    superText: 'Разлив: ещё 2 урона за фишку каждому врагу.',
    upText: '3 урона за фишку каждому врагу.',
  }),
  quill: g('quill', 'Перо', 'uncommon', 'card_quill', {
    fam: 'ink',
    value: 2,
    strike: { quill: 3 },
    super: { energy: 1 },
    up: PLUS1,
    strikeText: '2 энергии за фишку. +3 урона удару, если энергия заполнилась.',
    superText: 'Ещё 1 энергия за фишку.',
    upText: '+1 энергия за фишку.',
  }),
  copystamp: g(
    'copystamp',
    'Штамп «Копия»',
    'rare',
    'card_copystamp',
    {
      fam: 'ink',
      value: 1,
      strike: { stamp: 2 },
      super: { stamp: 2 },
      up: PLUS1,
      strikeText: '1 энергия за фишку. 2 случайные фишки поля становятся красными.',
      superText: 'Ещё 2 фишки становятся красными.',
      upText: '+1 энергия за фишку.',
    },
    'bundle_ink',
  ),
  carbon: g(
    'carbon',
    'Копирка',
    'rare',
    'card_carbon',
    {
      fam: 'ink',
      value: 1,
      strike: { copyNext: 1 },
      super: { energy: 1 },
      up: PLUS1,
      strikeText: '1 энергия за фишку. Следующая группа этого хода срабатывает дважды.',
      superText: 'Ещё 1 энергия за фишку.',
      upText: '+1 энергия за фишку.',
    },
    'bundle_ink',
  ),
  weight: g(
    'weight',
    'Пресс-папье',
    'uncommon',
    'card_weight',
    {
      fam: 'ink',
      value: 1,
      strike: {},
      super: { stun: true },
      up: PLUS1,
      strikeText: '1 энергия за фишку.',
      superText: 'Придавить: цель пропускает действие.',
      upText: '+1 энергия за фишку.',
    },
    'bundle_ink',
  ),

  // ── Yellow: coins and finds (coins per group) ───────────────────────
  penny: g('penny', 'Монетка', 'starter', 'tile_coin', {
    fam: 'coin',
    value: 0,
    strike: {},
    super: { coins: 1 },
    up: PLUS1,
    strikeText: 'Копит находки: каждая жёлтая фишка — деление шкалы.',
    superText: 'Монета.',
    upText: 'Монета за каждую группу.',
  }),
  receipt: g('receipt', 'Чек', 'common', 'card_receipt', {
    fam: 'coin',
    value: 0,
    strike: { finds: 1 },
    super: { coins: 1 },
    up: { value: 1 },
    strikeText: 'Находки копятся вдвое: два деления шкалы за фишку.',
    superText: 'Монета.',
    upText: 'Монета за каждую группу.',
  }),
  bonus: g('bonus', 'Премия', 'uncommon', 'card_bonus', {
    fam: 'coin',
    value: 0,
    strike: { dmgPerTile: 3 },
    super: { dmgPerTile: 2 },
    up: { strike: { dmgPerTile: 4 } },
    strikeText: '+3 урона удару за фишку.',
    superText: 'Ещё +2 урона за фишку.',
    upText: '+4 урона за фишку.',
  }),
  creditcard: g(
    'creditcard',
    'Кредитка',
    'uncommon',
    'card_card',
    {
      fam: 'coin',
      value: 0,
      strike: { dmgPerTile: 6, costPerGroup: 1 },
      super: { dmgPerTile: 3 },
      up: { strike: { dmgPerTile: 8, costPerGroup: 1 } },
      strikeText: '+6 урона удару за фишку, но группа стоит монету (без денег не работает).',
      superText: 'Ещё +3 урона за фишку.',
      upText: '+8 урона за фишку.',
    },
    'bundle_accounting',
  ),
  piggy: g('piggy', 'Копилка', 'uncommon', 'card_piggy', {
    fam: 'coin',
    value: 0,
    strike: { afterFight: 1 },
    super: { coins: 1 },
    up: PLUS1,
    strikeText: 'Монета после боя за каждую группу.',
    superText: 'И монета сразу.',
    upText: 'Монета сразу за каждую группу.',
  }),
  report: g(
    'report',
    'Квартальный отчёт',
    'rare',
    'card_report',
    {
      fam: 'coin',
      value: 0,
      strike: { famDmg: 2 },
      super: { coins: 1 },
      up: { strike: { famDmg: 3 } },
      strikeText: 'Раз за ход: +2 урона удару за каждый цвет, собранный до отчёта.',
      superText: 'Монета.',
      upText: '+3 урона за цвет.',
    },
    'bundle_accounting',
  ),
  goldclip: g(
    'goldclip',
    'Золотая скрепка',
    'rare',
    'card_goldclip',
    {
      fam: 'coin',
      value: 0,
      strike: { bonusPct: 0.3 },
      super: { coins: 1 },
      up: { strike: { bonusPct: 0.5 } },
      strikeText: 'Раз за ход: урон хода +30%.',
      superText: 'Монета.',
      upText: 'Урон хода +50%.',
    },
    'bundle_accounting',
  ),
};

/** An item with its upgrade merged in: the value adds, effects replace. */
export function withUpgrade(def: GearDef, up: boolean): GearDef {
  if (!up) return def;
  return {
    ...def,
    value: def.value + (def.up.value ?? 0),
    strike: { ...def.strike, ...def.up.strike },
    super: { ...def.super, ...def.up.super },
  };
}

/** The plain item of every colour: what a hero starts with (unless the hero says otherwise). */
export const BASE_GEAR: Record<Fam, string> = { blade: 'knife', shield: 'shield', ink: 'battery', coin: 'penny' };

/** Coins an item of each rarity costs at the till (the act scales it). */
export const GEAR_PRICE: Record<Pool, number> = { starter: 8, common: 10, uncommon: 14, rare: 20, boss: 26, shop: 14 };

/** Gear the rewards and the till can offer. */
export function gearPoolOf(unlocked: readonly string[]): string[] {
  return Object.values(GEAR)
    .filter((d) => d.pool !== 'starter' && (!d.unlock || unlocked.includes(d.unlock)))
    .map((d) => d.id);
}

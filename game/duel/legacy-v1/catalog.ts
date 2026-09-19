export const COLORS = ['earth', 'fire', 'air', 'water'] as const;
export type Color = (typeof COLORS)[number];
export const KINDS = [...COLORS, 'skull', 'xp', 'gold'] as const;
export type Kind = (typeof KINDS)[number] | 'wild';
export const LABELS: Record<Kind, string> = {
  earth: 'Земля',
  fire: 'Огонь',
  air: 'Воздух',
  water: 'Вода',
  skull: 'Череп',
  xp: 'Опыт',
  gold: 'Золото',
  wild: 'Джокер ×3',
};
export type Stats = Record<Color | 'battle' | 'cunning' | 'morale', number>;
export type Mana = Record<Color, number>;
export type Slot = 'weapon' | 'armor' | 'charm' | 'ring';
export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Оружие',
  armor: 'Одежда',
  charm: 'Талисман',
  ring: 'Кольцо',
};
export const STAT_NAMES: Record<keyof Stats, string> = {
  ...LABELS,
  battle: 'Бой',
  cunning: 'Хитрость',
  morale: 'Дух',
};
export type SpellId =
  | 'bolt'
  | 'mend'
  | 'slice'
  | 'forge'
  | 'drain'
  | 'wall'
  | 'transmute'
  | 'erase'
  | 'trance'
  | 'palm'
  | 'bomb';
export type Spell = {
  id: SpellId;
  name: string;
  description: string;
  cost: Partial<Mana>;
  cooldown: number;
  target?: boolean;
  hostile?: boolean;
};
export const SPELLS: Record<SpellId, Spell> = {
  bolt: {
    id: 'bolt',
    name: 'Разряд',
    description: '10 урона. Ещё +1 за каждые 5 мастерства огня.',
    cost: { fire: 6, air: 3 },
    cooldown: 1,
    hostile: true,
  },
  mend: {
    id: 'mend',
    name: 'Передышка',
    description: 'Восстановить 11 здоровья. Ход переходит врагу.',
    cost: { water: 6, earth: 3 },
    cooldown: 2,
  },
  slice: {
    id: 'slice',
    name: 'Рассечение',
    description:
      'Собрать 3 фишки по горизонтали вокруг выбранной. При 10 воздуха — 5 фишек (по 2 с каждой стороны).',
    cost: { earth: 3, air: 6 },
    cooldown: 1,
    target: true,
  },
  forge: {
    id: 'forge',
    name: 'Костяной шрифт',
    description:
      'Превратить выбранную фишку в череп. Возникшие совпадения достаются вам.',
    cost: { earth: 4, fire: 4 },
    cooldown: 1,
    target: true,
  },
  drain: {
    id: 'drain',
    name: 'Взыскание',
    description: '6 урона. Забрать у врага до 3 маны каждого цвета.',
    cost: { fire: 5, water: 4 },
    cooldown: 2,
    hostile: true,
  },
  wall: {
    id: 'wall',
    name: 'Стена стихий',
    description:
      'На 3 действия врага: каждая единица вашей маны поглощает 1 урон. Тратится самый полный запас.',
    cost: { earth: 3, air: 3 },
    cooldown: 3,
  },
  transmute: {
    id: 'transmute',
    name: 'Обмен',
    description:
      'Всю землю на поле превратить в воду. Совпадения соберутся сразу.',
    cost: { air: 5, fire: 3 },
    cooldown: 2,
  },
  erase: {
    id: 'erase',
    name: 'Ластик',
    description:
      'Убрать строку выбранной фишки без сбора. Каскады после падения уже дают ресурсы.',
    cost: { air: 4, water: 3 },
    cooldown: 2,
    target: true,
  },
  trance: {
    id: 'trance',
    name: 'Сосредоточение',
    description:
      '+5 Ки (максимум 8). Сохранить инициативу. Восстановление: 3 ваших действия.',
    cost: { earth: 4, water: 4 },
    cooldown: 3,
  },
  palm: {
    id: 'palm',
    name: 'Удар ладонью',
    description:
      'Потратить весь Ки: по 2 урона за единицу. От 5 Ки — оглушить на 1 действие. Повторный контроль защищён 3 действия.',
    cost: { fire: 3, air: 3 },
    cooldown: 2,
    hostile: true,
  },
  bomb: {
    id: 'bomb',
    name: 'Взрывной череп',
    description:
      'Выбранный череп получает +5 урона и взрыв всех соседей при сборе.',
    cost: { fire: 5, earth: 3 },
    cooldown: 2,
    target: true,
  },
};
export type ItemId =
  | 'paperKnife'
  | 'tideNeedle'
  | 'fullBlade'
  | 'coat'
  | 'veil'
  | 'tidePurse'
  | 'mint'
  | 'reservoir'
  | 'scholar'
  | 'ward';
export type Item = {
  id: ItemId;
  name: string;
  slot: Slot;
  price: number;
  description: string;
};
export const ITEMS: Record<ItemId, Item> = {
  paperKnife: {
    id: 'paperKnife',
    name: 'Нож для бумаги',
    slot: 'weapon',
    price: 12,
    description: '+1 к каждой волне урона черепами.',
  },
  tideNeedle: {
    id: 'tideNeedle',
    name: 'Игла прилива',
    slot: 'weapon',
    price: 24,
    description: 'Собрать 2+ воды за волну → 2 урона. Срабатывает и от взрыва.',
  },
  fullBlade: {
    id: 'fullBlade',
    name: 'Полный клинок',
    slot: 'weapon',
    price: 30,
    description:
      'Удар черепами: +4 урона за каждый полностью заполненный запас маны.',
  },
  coat: {
    id: 'coat',
    name: 'Рабочая куртка',
    slot: 'armor',
    price: 18,
    description: 'Первые 2 урона каждого действия врага поглощаются.',
  },
  veil: {
    id: 'veil',
    name: 'Плащ тени',
    slot: 'armor',
    price: 28,
    description:
      'Матч 4+ даёт тень. Следующая волна черепов наносит ×1,5 урона. Тень живёт 3 ваших действия.',
  },
  tidePurse: {
    id: 'tidePurse',
    name: 'Кошелёк прилива',
    slot: 'charm',
    price: 22,
    description:
      'Собрать 3+ воды за волну → +2 золота. Оно может запустить Монетный пресс.',
  },
  mint: {
    id: 'mint',
    name: 'Монетный пресс',
    slot: 'ring',
    price: 26,
    description:
      'Собрать 2+ золота за волну → создать 1 череп в случайной обычной клетке. Один раз за волну.',
  },
  reservoir: {
    id: 'reservoir',
    name: 'Резервуар',
    slot: 'charm',
    price: 22,
    description: '+8 к вместимости каждого запаса маны.',
  },
  scholar: {
    id: 'scholar',
    name: 'Печать стажёра',
    slot: 'ring',
    price: 18,
    description: 'За сбор звёзд: +2 опыта за волну.',
  },
  ward: {
    id: 'ward',
    name: 'Сухая печать',
    slot: 'ring',
    price: 25,
    description:
      '+20% вероятности отменить вражеское заклинание, направленное на вас.',
  },
};
export type ClassId = 'blade' | 'elementalist' | 'warlock' | 'monk';
export const CLASSES: Record<
  ClassId,
  {
    name: string;
    description: string;
    stats: Stats;
    spells: SpellId[];
    gear: ItemId[];
    cheap: (keyof Stats)[];
  }
> = {
  blade: {
    name: 'Мастер клинка',
    description: 'Геометрия поля и сильные черепа.',
    stats: {
      earth: 3,
      fire: 2,
      air: 4,
      water: 1,
      battle: 5,
      cunning: 2,
      morale: 3,
    },
    spells: ['slice', 'forge', 'mend'],
    gear: ['paperKnife', 'veil'],
    cheap: ['battle', 'air'],
  },
  elementalist: {
    name: 'Стихийник',
    description: 'Вода приносит ману, урон и золото. Мана также защищает.',
    stats: {
      earth: 3,
      fire: 3,
      air: 3,
      water: 5,
      battle: 1,
      cunning: 1,
      morale: 3,
    },
    spells: ['bolt', 'wall', 'transmute', 'mend'],
    gear: ['tideNeedle', 'tidePurse', 'mint'],
    cheap: ['water', 'earth'],
  },
  warlock: {
    name: 'Чернокнижник',
    description: 'Создаёт взрывные черепа и крадёт чужую ману.',
    stats: {
      earth: 4,
      fire: 5,
      air: 1,
      water: 3,
      battle: 3,
      cunning: 2,
      morale: 1,
    },
    spells: ['forge', 'bomb', 'drain', 'erase'],
    gear: ['fullBlade', 'reservoir'],
    cheap: ['fire', 'cunning'],
  },
  monk: {
    name: 'Монах',
    description: 'Накапливает Ки для удара и перехвата инициативы.',
    stats: {
      earth: 4,
      fire: 2,
      air: 3,
      water: 4,
      battle: 2,
      cunning: 1,
      morale: 4,
    },
    spells: ['trance', 'palm', 'mend'],
    gear: ['coat', 'scholar'],
    cheap: ['morale', 'earth'],
  },
};
export const FOES = [
  {
    name: 'Бумажная крыса',
    art: 'paper-rat',
    hp: 32,
    spells: ['bolt'] as SpellId[],
    gear: [] as ItemId[],
    trait: 'Собирает черепа и копит огонь для разряда.',
  },
  {
    name: 'Архивариус',
    art: 'librarian',
    hp: 44,
    spells: ['bolt', 'mend'] as SpellId[],
    gear: ['scholar'] as ItemId[],
    trait: 'Лечится водой. Не оставляйте ему синие совпадения.',
  },
  {
    name: 'Сборщик долгов',
    art: 'raider',
    hp: 54,
    spells: ['drain', 'forge'] as SpellId[],
    gear: ['tideNeedle'] as ItemId[],
    trait: 'Отнимает ману. Сбор воды наносит вам урон.',
  },
  {
    name: 'Редактор',
    art: 'redactor',
    hp: 64,
    spells: ['erase', 'bolt', 'wall'] as SpellId[],
    gear: ['coat'] as ItemId[],
    trait: 'Перестраивает поле и защищается собственными запасами.',
  },
  {
    name: 'Цензор',
    art: 'censor',
    hp: 86,
    spells: ['forge', 'bomb', 'drain', 'bolt'] as SpellId[],
    gear: ['fullBlade', 'ward'] as ItemId[],
    trait: 'Берегитесь полных запасов: они усиливают его черепа.',
  },
];

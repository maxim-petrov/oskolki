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
export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'veryRare',
  'legendary',
] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_NAMES: Record<Rarity, string> = {
  common: 'Common · Обычный',
  uncommon: 'Uncommon · Необычный',
  rare: 'Rare · Редкий',
  veryRare: 'Very Rare · Очень редкий',
  legendary: 'Legendary · Легендарный',
};
export const RARITY_PRICE: Record<Rarity, number> = {
  common: 12,
  uncommon: 22,
  rare: 34,
  veryRare: 50,
  legendary: 0,
};
export type ItemId =
  | 'paperKnife'
  | 'stylus'
  | 'coat'
  | 'apron'
  | 'copperClip'
  | 'bluePass'
  | 'scholar'
  | 'abacus'
  | 'tideNeedle'
  | 'chargeSeal'
  | 'pocketVest'
  | 'answerCloak'
  | 'tidePurse'
  | 'reservoir'
  | 'wick'
  | 'conductor'
  | 'fullBlade'
  | 'contractBlade'
  | 'veil'
  | 'overflowRobe'
  | 'catalyst'
  | 'mint'
  | 'ward'
  | 'bloodInkwell'
  | 'quarterCutter'
  | 'mirrorVest'
  | 'insurance'
  | 'carbonPaper'
  | 'capacitor'
  | 'directorPen'
  | 'spinningTop'
  | 'infiniteDiploma'
  | 'graphite'
  | 'cottonCuffs'
  | 'teaBag'
  | 'lens'
  | 'emberKnife'
  | 'archiveVest'
  | 'metronome'
  | 'fireSeal'
  | 'mortgage'
  | 'saltCoat'
  | 'prism'
  | 'waterwheel'
  | 'glassNib'
  | 'ledger'
  | 'goldenLining'
  | 'eclipseRing';
export type Item = {
  id: ItemId;
  name: string;
  slot: Slot;
  rarity: Rarity;
  price: number;
  description: string;
  tags: string[];
};
export const ITEMS: Record<ItemId, Item> = {
  paperKnife: {
    id: 'paperKnife',
    name: 'Нож для бумаги',
    slot: 'weapon',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description: 'Первая волна черепов за действие: +1 урона.',
    tags: ['skull'],
  },
  stylus: {
    id: 'stylus',
    name: 'Стальной стилус',
    slot: 'weapon',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description:
      'Прямой урон заклинания: +2. Не усиливает черепа и эффекты предметов.',
    tags: ['spell'],
  },
  coat: {
    id: 'coat',
    name: 'Рабочая куртка',
    slot: 'armor',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description: 'Поглощает первые 2 урона каждого действия противника.',
    tags: ['defense'],
  },
  apron: {
    id: 'apron',
    name: 'Фартук подмастерья',
    slot: 'armor',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description: 'Собрать 3 земли за действие → 2 барьера.',
    tags: ['earth', 'defense'],
  },
  copperClip: {
    id: 'copperClip',
    name: 'Медная скрепка',
    slot: 'charm',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description: 'Собрать 3 огня за действие → 1 мана воздуха.',
    tags: ['fire', 'spell'],
  },
  bluePass: {
    id: 'bluePass',
    name: 'Синий пропуск',
    slot: 'charm',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description: 'В начале каждого боя: +2 воды и +2 земли.',
    tags: ['water', 'earth', 'spell'],
  },
  scholar: {
    id: 'scholar',
    name: 'Печать стажёра',
    slot: 'ring',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description:
      'Сбор звёзд: +2 опыта за действие, максимум 6 дополнительного опыта за бой.',
    tags: ['growth'],
  },
  abacus: {
    id: 'abacus',
    name: 'Счётные костяшки',
    slot: 'ring',
    rarity: 'common',
    price: RARITY_PRICE.common,
    description: 'Собрать 3 монеты за действие → 2 барьера.',
    tags: ['gold', 'defense'],
  },
  tideNeedle: {
    id: 'tideNeedle',
    name: 'Игла прилива',
    slot: 'weapon',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description: 'Собрать 3 воды за действие → 2 урона противнику.',
    tags: ['water'],
  },
  chargeSeal: {
    id: 'chargeSeal',
    name: 'Молоток наборщика',
    slot: 'weapon',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description: 'Первая группа 4+ черепов за действие: +4 урона.',
    tags: ['skull', 'long'],
  },
  pocketVest: {
    id: 'pocketVest',
    name: 'Карманный жилет',
    slot: 'armor',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description: 'Каждый бой начинается с 6 барьера.',
    tags: ['defense'],
  },
  answerCloak: {
    id: 'answerCloak',
    name: 'Плащ ответа',
    slot: 'armor',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description:
      'Потеря здоровья от врага заряжает следующую волну черепов: +3 урона. Заряд не складывается.',
    tags: ['risk', 'skull'],
  },
  tidePurse: {
    id: 'tidePurse',
    name: 'Кошелёк прилива',
    slot: 'charm',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description:
      'Собрать 3 воды за действие → 2 золота. Максимум 8 дополнительного золота за бой.',
    tags: ['water', 'gold'],
  },
  reservoir: {
    id: 'reservoir',
    name: 'Резервуар',
    slot: 'charm',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description:
      '+8 к вместимости каждого цвета маны. Запасы не заполняются автоматически.',
    tags: ['spell', 'reserve'],
  },
  wick: {
    id: 'wick',
    name: 'Фитиль',
    slot: 'charm',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description:
      'Группа 4+ огня делает первый обычный череп на поле взрывным (+5). Один раз до реального действия врага.',
    tags: ['fire', 'long', 'skull'],
  },
  conductor: {
    id: 'conductor',
    name: 'Кольцо проводника',
    slot: 'ring',
    rarity: 'uncommon',
    price: RARITY_PRICE.uncommon,
    description:
      'Сбор двух разных стихий за действие → 2 маны в наименее заполненный запас.',
    tags: ['spell', 'reserve', 'elements'],
  },
  fullBlade: {
    id: 'fullBlade',
    name: 'Полный клинок',
    slot: 'weapon',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'Первая волна черепов: +4 за каждый полный запас маны, затем тратит по 2 маны из этих запасов.',
    tags: ['skull', 'reserve'],
  },
  contractBlade: {
    id: 'contractBlade',
    name: 'Договорной клинок',
    slot: 'weapon',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'При здоровье не выше половины: первая волна черепов за действие получает +5 урона.',
    tags: ['risk', 'skull'],
  },
  veil: {
    id: 'veil',
    name: 'Плащ тени',
    slot: 'armor',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'Совпадение 4+ заряжает следующую волну черепов: ×1,5 урона. Заряд живёт 3 ваших действия, не складывается.',
    tags: ['long', 'skull'],
  },
  overflowRobe: {
    id: 'overflowRobe',
    name: 'Мантия переполнения',
    slot: 'armor',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'Потерять 3 маны из-за полных запасов за действие → 3 барьера.',
    tags: ['reserve', 'defense'],
  },
  catalyst: {
    id: 'catalyst',
    name: 'Катализатор',
    slot: 'charm',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'После заклинания вернуть до 2 маны самого дорогого цвета. Хотя бы 1 мана этого цвета расходуется.',
    tags: ['spell'],
  },
  mint: {
    id: 'mint',
    name: 'Монетный пресс',
    slot: 'ring',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'Получить 2 золота с поля или от Кошелька → один случайный череп. Один раз до реального действия врага.',
    tags: ['gold', 'skull'],
  },
  ward: {
    id: 'ward',
    name: 'Сухая печать',
    slot: 'ring',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      '+20 п.п. к отмене направленного на вас заклинания. Общий предел — 45%.',
    tags: ['defense'],
  },
  bloodInkwell: {
    id: 'bloodInkwell',
    name: 'Кровавая чернильница',
    slot: 'ring',
    rarity: 'rare',
    price: RARITY_PRICE.rare,
    description:
      'Первое заклинание до действия врага: скидка до 2 маны дорогого цвета за 2 здоровья. Минимум 1 мана. При HP ≤2 скидка отключена.',
    tags: ['risk', 'spell'],
  },
  quarterCutter: {
    id: 'quarterCutter',
    name: 'Четвертной резак',
    slot: 'weapon',
    rarity: 'veryRare',
    price: RARITY_PRICE.veryRare,
    description:
      'Тройки черепов не наносят урон. Первая группа 4+ черепов: +8 урона за действие. Прямой сбор и взрыв — обычный урон без бонуса.',
    tags: ['skull', 'long'],
  },
  mirrorVest: {
    id: 'mirrorVest',
    name: 'Зеркальная жилетка',
    slot: 'armor',
    rarity: 'veryRare',
    price: RARITY_PRICE.veryRare,
    description:
      'В начале вашего действия: 2 барьера. Каждые 2 поглощённого барьером урона отражают 1, максимум 3 за действие врага.',
    tags: ['defense', 'gold'],
  },
  insurance: {
    id: 'insurance',
    name: 'Страховой полис',
    slot: 'charm',
    rarity: 'veryRare',
    price: RARITY_PRICE.veryRare,
    description:
      'Один раз за забег пережить смертельное попадание с 1 HP и получить 6 барьера против оставшихся попаданий.',
    tags: ['defense'],
  },
  carbonPaper: {
    id: 'carbonPaper',
    name: 'Копирка',
    slot: 'charm',
    rarity: 'veryRare',
    price: RARITY_PRICE.veryRare,
    description:
      'Первое прямое заклинание до действия врага: дополнительно половина базового урона вниз, максимум 6. Не копирует другие эффекты.',
    tags: ['spell'],
  },
  capacitor: {
    id: 'capacitor',
    name: 'Кольцо-конденсатор',
    slot: 'ring',
    rarity: 'veryRare',
    price: RARITY_PRICE.veryRare,
    description:
      'Каждые 12 маны, потраченные на заклинания с учётом возврата, заряжают кольцо. Следующий сбор стихии в последующем действии: +4 маны её цвета. Один заряд.',
    tags: ['spell', 'reserve'],
  },
  directorPen: {
    id: 'directorPen',
    name: 'Перо директора',
    slot: 'weapon',
    rarity: 'legendary',
    price: RARITY_PRICE.legendary,
    description:
      'Сбор 3 фишек стихии ставит её печать. Четыре разные печати → 8 урона и 4 барьера. Максимум раз до действия врага.',
    tags: ['elements', 'defense'],
  },
  spinningTop: {
    id: 'spinningTop',
    name: 'Вечная юла',
    slot: 'charm',
    rarity: 'legendary',
    price: RARITY_PRICE.legendary,
    description:
      'Каждое третье заклинание заряжает дополнительное действие вместо передачи хода. Один заряд; максимум раз до реального действия врага.',
    tags: ['spell'],
  },
  infiniteDiploma: {
    id: 'infiniteDiploma',
    name: 'Диплом бесконечности',
    slot: 'ring',
    rarity: 'legendary',
    price: RARITY_PRICE.legendary,
    description:
      'Звёзды больше не дают опыт. Первые 4 за действие дают по 1 мане каждого цвета. Опыт за победу сохраняется.',
    tags: ['reserve', 'spell'],
  },
  graphite: {
    id: 'graphite',
    name: 'Графитовый резец',
    slot: 'weapon',
    rarity: 'common',
    price: 12,
    description:
      'Собрать 3 воздуха за действие → первая следующая волна черепов этого действия получает +2 урона.',
    tags: ['air', 'skull'],
  },
  cottonCuffs: {
    id: 'cottonCuffs',
    name: 'Хлопковые манжеты',
    slot: 'armor',
    rarity: 'common',
    price: 12,
    description:
      'Собрать 3 воды за действие → восстановить 1 HP. Не более 6 HP за бой.',
    tags: ['water', 'healing'],
  },
  teaBag: {
    id: 'teaBag',
    name: 'Чайный пакетик',
    slot: 'charm',
    rarity: 'common',
    price: 12,
    description: 'Собрать 3 земли за действие → 1 мана воды.',
    tags: ['earth', 'water', 'spell'],
  },
  lens: {
    id: 'lens',
    name: 'Линза корректора',
    slot: 'ring',
    rarity: 'common',
    price: 12,
    description:
      'Собрать 3 звезды за действие → 2 маны воздуха. Опыт сохраняется.',
    tags: ['growth', 'air', 'spell'],
  },
  emberKnife: {
    id: 'emberKnife',
    name: 'Раскалённый нож',
    slot: 'weapon',
    rarity: 'uncommon',
    price: 22,
    description:
      'Собрать 3 огня за действие → зарядить следующую волну черепов: +3 урона. Один заряд, сохраняется между действиями.',
    tags: ['fire', 'skull'],
  },
  archiveVest: {
    id: 'archiveVest',
    name: 'Архивный жилет',
    slot: 'armor',
    rarity: 'uncommon',
    price: 22,
    description: 'Собрать 3 звезды за действие → 3 барьера. Опыт сохраняется.',
    tags: ['growth', 'defense'],
  },
  metronome: {
    id: 'metronome',
    name: 'Метроном',
    slot: 'charm',
    rarity: 'uncommon',
    price: 22,
    description:
      'Собрать 3 воздуха за действие → зарядить следующее успешное прямое заклинание: +3 урона. Один заряд.',
    tags: ['air', 'spell'],
  },
  fireSeal: {
    id: 'fireSeal',
    name: 'Угольная печать',
    slot: 'ring',
    rarity: 'uncommon',
    price: 22,
    description: 'Собрать 3 черепа за действие → 2 маны огня.',
    tags: ['skull', 'fire', 'spell'],
  },
  mortgage: {
    id: 'mortgage',
    name: 'Клинок закладной',
    slot: 'weapon',
    rarity: 'rare',
    price: 34,
    description:
      'Первая волна черепов за действие: +6 урона за 2 HP. При HP ≤2 бонус отключён. Самооплата обходит защиту.',
    tags: ['risk', 'skull'],
  },
  saltCoat: {
    id: 'saltCoat',
    name: 'Соляной плащ',
    slot: 'armor',
    rarity: 'rare',
    price: 34,
    description:
      'Первое заклинание до действия врага даёт 3 барьера. Передышка лечит 7 HP вместо 11.',
    tags: ['spell', 'defense', 'healing'],
  },
  prism: {
    id: 'prism',
    name: 'Трёхгранная призма',
    slot: 'charm',
    rarity: 'rare',
    price: 34,
    description:
      'Собрать три разные стихии за действие → 3 урона и 2 барьера. Только физические фишки.',
    tags: ['elements', 'defense'],
  },
  waterwheel: {
    id: 'waterwheel',
    name: 'Водяное колесо',
    slot: 'ring',
    rarity: 'rare',
    price: 34,
    description:
      'Собрать 3 воды за действие → 3 маны земли, но потерять до 2 маны огня.',
    tags: ['water', 'earth', 'spell'],
  },
  glassNib: {
    id: 'glassNib',
    name: 'Стеклянное перо',
    slot: 'weapon',
    rarity: 'veryRare',
    price: 50,
    description:
      'Прямые заклинания: +5 урона. Первое попадание врага за действие получает +1 урона до защиты.',
    tags: ['spell', 'risk'],
  },
  ledger: {
    id: 'ledger',
    name: 'Долговая книга',
    slot: 'charm',
    rarity: 'veryRare',
    price: 50,
    description:
      '6 физических монет за бой заряжают следующую волну черепов: +6 урона. Один заряд; пока он готов, монеты не копят новый.',
    tags: ['gold', 'skull'],
  },
  goldenLining: {
    id: 'goldenLining',
    name: 'Золотая подкладка',
    slot: 'armor',
    rarity: 'legendary',
    price: 0,
    description:
      'Собрать 3 монеты за действие → потратить 2 золота и вылечить до 3 HP. Раз до действия врага, не более 12 HP за бой.',
    tags: ['gold', 'healing'],
  },
  eclipseRing: {
    id: 'eclipseRing',
    name: 'Кольцо смены',
    slot: 'ring',
    rarity: 'legendary',
    price: 0,
    description:
      'Первое совпадение 4+ до действия врага: по 2 маны каждой стихии за 2 HP. При HP ≤2 не срабатывает.',
    tags: ['long', 'risk', 'elements'],
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
    gear: ['paperKnife', 'coat'],
    cheap: ['battle', 'air'],
  },
  elementalist: {
    name: 'Стихийник',
    description: 'Превращает землю в воду; использует ману для магии и защиты.',
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
    gear: ['stylus', 'bluePass'],
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
    gear: ['paperKnife', 'copperClip'],
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
    gear: ['coat', 'bluePass'],
    cheap: ['morale', 'earth'],
  },
};
export { ENCOUNTERS as FOES } from './campaign.ts';

export type Pool = 'treasure' | 'shop' | 'boss' | 'deal' | 'secret';
export type Tag = 'bureau' | 'pyro' | 'accountant' | 'coffee' | 'pets';

export interface Mods {
  damage: number;
  damageMul: number;
  armorCap: number;
  startArmor: number;
  preview: number;
  wrap: boolean;
  pierce: boolean;
  crossRockets: boolean;
  bombRadius: number;
  magnet: boolean;
  inkDamage: number;
  coinDamage: number;
  coinBonus: number;
  shieldDamage: boolean;
  bleedOnHit: boolean;
  igniteOn4: boolean;
  chaos: boolean;
  luck: number;
  battery: number;
  firstHitDouble: boolean;
  lamp: boolean;
  censorImmune: boolean;
  emberImmune: boolean;
  clockEvery: number;
  garlandEvery: number;
  freezeOn4Shields: boolean;
  planeOn4: boolean;
  echo: boolean;
  spider: number;
  cactus: number;
  catBowl: boolean;
  flash: boolean;
  mint: boolean;
  ledger: boolean;
  bureau: boolean;
  pyroBlast: boolean;
  accountant: boolean;
  coffeeFirstMove: boolean;
  petMaster: boolean;
  timerBonus: number;
  prismOn4: boolean;
}

export function baseMods(): Mods {
  return {
    damage: 0,
    damageMul: 1,
    armorCap: 3,
    startArmor: 0,
    preview: 1,
    wrap: false,
    pierce: false,
    crossRockets: false,
    bombRadius: 1,
    magnet: false,
    inkDamage: 0,
    coinDamage: 0,
    coinBonus: 0,
    shieldDamage: false,
    bleedOnHit: false,
    igniteOn4: false,
    chaos: false,
    luck: 0,
    battery: 0,
    firstHitDouble: false,
    lamp: false,
    censorImmune: false,
    emberImmune: false,
    clockEvery: 0,
    garlandEvery: 0,
    freezeOn4Shields: false,
    planeOn4: false,
    echo: false,
    spider: 0,
    cactus: 0,
    catBowl: false,
    flash: false,
    mint: false,
    ledger: false,
    bureau: false,
    pyroBlast: false,
    accountant: false,
    coffeeFirstMove: false,
    petMaster: false,
    timerBonus: 0,
    prismOn4: false,
  };
}

export interface ItemDef {
  id: string;
  name: string;
  tagline: string;
  desc: string;
  kind: 'passive' | 'active';
  /** Ink needed to use an active item. */
  charge?: number;
  /** Where the active item works. */
  when?: 'combat' | 'explore' | 'any';
  /** Active target: a cell, a column, an enemy, or none. */
  aim?: 'cell' | 'col' | 'enemy';
  pools: Pool[];
  quality: 0 | 1 | 2 | 3 | 4;
  tags?: Tag[];
  /** Achievement id that unlocks the item; absent = available from the start. */
  unlock?: string;
  /** Heart containers granted on pickup (negative for deals). */
  hearts?: number;
  /** Heal half-hearts on pickup. */
  heal?: number;
  coins?: number;
  bombs?: number;
  keys?: number;
  apply?: (m: Mods) => void;
}

export const ITEMS: Record<string, ItemDef> = {
  coffee: {
    id: 'coffee',
    name: 'Крепкий кофе',
    tagline: 'Урон вверх',
    desc: '+0,5 к урону клинков.',
    kind: 'passive',
    pools: ['treasure', 'shop', 'boss'],
    quality: 1,
    tags: ['coffee'],
    apply: (m) => {
      m.damage += 0.5;
    },
  },
  sandwich: {
    id: 'sandwich',
    name: 'Бутерброд',
    tagline: 'Здоровье вверх',
    desc: '+1 контейнер сердца и полное лечение.',
    kind: 'passive',
    pools: ['treasure', 'shop', 'boss'],
    quality: 1,
    hearts: 1,
    heal: 99,
  },
  vest: {
    id: 'vest',
    name: 'Бронежилет из папок',
    tagline: 'Броня вверх',
    desc: 'Предел брони +2. Каждая комната начинается с 1 брони.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    apply: (m) => {
      m.armorCap += 2;
      m.startArmor += 1;
    },
  },
  ring: {
    id: 'ring',
    name: 'Кольцевая скоба',
    tagline: 'Края соединены',
    desc: 'Края поля соединены: линии совпадений продолжаются через край, а крайние фишки меняются с фишками на другом краю.',
    kind: 'passive',
    pools: ['treasure', 'secret'],
    quality: 3,
    tags: ['bureau'],
    apply: (m) => {
      m.wrap = true;
    },
  },
  carbon: {
    id: 'carbon',
    name: 'Копирка',
    tagline: 'Эхо',
    desc: 'Первая группа каждого хода срабатывает ещё раз с половинной силой.',
    kind: 'passive',
    pools: ['treasure', 'boss'],
    quality: 3,
    tags: ['bureau'],
    apply: (m) => {
      m.echo = true;
    },
  },
  punch: {
    id: 'punch',
    name: 'Дырокол',
    tagline: 'Пробивание',
    desc: 'Клинки игнорируют броню и щиты врагов.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    apply: (m) => {
      m.pierce = true;
    },
  },
  loupe: {
    id: 'loupe',
    name: 'Лупа',
    tagline: 'Видно дальше',
    desc: 'Очередь над полем показывает 3 следующие фишки вместо одной.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 1,
    unlock: 'killCabinet',
    apply: (m) => {
      m.preview = 3;
    },
  },
  plane: {
    id: 'plane',
    name: 'Бумажный самолётик',
    tagline: 'Четвёрки летают',
    desc: 'Группа из 4+ клинков запускает самолётик: 2 урона каждому врагу.',
    kind: 'passive',
    pools: ['treasure'],
    quality: 2,
    apply: (m) => {
      m.planeOn4 = true;
    },
  },
  dynamite: {
    id: 'dynamite',
    name: 'Праздничный динамит',
    tagline: 'Бомбы больше',
    desc: 'Бомбы-фишки и бомбы из запаса очищают квадрат 5×5.',
    kind: 'passive',
    pools: ['treasure', 'secret'],
    quality: 2,
    tags: ['pyro'],
    unlock: 'bombs10',
    apply: (m) => {
      m.bombRadius = 2;
    },
  },
  tape: {
    id: 'tape',
    name: 'Двусторонний скотч',
    tagline: 'Щиты бьют',
    desc: 'Совпадение папок наносит цели урон, равный полученной броне ×2.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    apply: (m) => {
      m.shieldDamage = true;
    },
  },
  magnet: {
    id: 'magnet',
    name: 'Магнит',
    tagline: 'Притяжение',
    desc: 'Монеты, соседние с любой собранной группой, собираются вместе с ней.',
    kind: 'passive',
    pools: ['shop', 'treasure'],
    quality: 1,
    tags: ['accountant'],
    apply: (m) => {
      m.magnet = true;
    },
  },
  spider: {
    id: 'spider',
    name: 'Скрепка-паук',
    tagline: 'Питомец',
    desc: 'После каждого хода кусает самого слабого врага на 1.',
    kind: 'passive',
    pools: ['treasure', 'boss'],
    quality: 2,
    tags: ['pets'],
    apply: (m) => {
      m.spider += 1;
    },
  },
  cactus: {
    id: 'cactus',
    name: 'Кактус на столе',
    tagline: 'Колючки',
    desc: 'Враг, ударивший тебя, получает 3 урона.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 1,
    tags: ['pets'],
    apply: (m) => {
      m.cactus += 3;
    },
  },
  inkwell: {
    id: 'inkwell',
    name: 'Чернильница',
    tagline: 'Чернила жгут',
    desc: 'Совпадения чернил наносят цели 1 урон за фишку.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    apply: (m) => {
      m.inkDamage += 1;
    },
  },
  scissors: {
    id: 'scissors',
    name: 'Ржавые ножницы',
    tagline: 'Кровотечение',
    desc: 'Каждое попадание клинков добавляет цели 1 кровотечение: урон в конце хода, стек уменьшается на 1.',
    kind: 'passive',
    pools: ['treasure', 'boss'],
    quality: 2,
    apply: (m) => {
      m.bleedOnHit = true;
    },
  },
  match: {
    id: 'match',
    name: 'Тлеющая спичка',
    tagline: 'Поджог',
    desc: 'Группа из 4+ фишек любого семейства поджигает цель: 2 урона в конце хода, 3 хода.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    tags: ['pyro'],
    apply: (m) => {
      m.igniteOn4 = true;
    },
  },
  calculator: {
    id: 'calculator',
    name: 'Сломанный калькулятор',
    tagline: 'Хаос',
    desc: 'Каждый урон умножается на случайный коэффициент от 0,5 до 2,5.',
    kind: 'passive',
    pools: ['treasure', 'secret'],
    quality: 1,
    apply: (m) => {
      m.chaos = true;
    },
  },
  lucky: {
    id: 'lucky',
    name: 'Счастливая монетка',
    tagline: 'Удача',
    desc: '15% шанс удвоить эффект группы.',
    kind: 'passive',
    pools: ['shop', 'treasure', 'secret'],
    quality: 2,
    tags: ['accountant'],
    apply: (m) => {
      m.luck += 0.15;
    },
  },
  battery: {
    id: 'battery',
    name: 'Батарейка',
    tagline: 'Перезарядка',
    desc: '+1 заряд активного предмета после каждого хода.',
    kind: 'passive',
    pools: ['shop', 'treasure'],
    quality: 2,
    apply: (m) => {
      m.battery += 1;
    },
  },
  pen: {
    id: 'pen',
    name: 'Бесконечная ручка',
    tagline: 'Крест',
    desc: 'Ракеты очищают сразу строку и столбец.',
    kind: 'passive',
    pools: ['treasure', 'boss'],
    quality: 3,
    unlock: 'rockets3',
    apply: (m) => {
      m.crossRockets = true;
    },
  },
  gum: {
    id: 'gum',
    name: 'Мятная жвачка',
    tagline: 'Чистая работа',
    desc: 'Комната, пройденная без урона, лечит ½ сердца.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 1,
    unlock: 'bossNoHit',
    apply: (m) => {
      m.mint = true;
    },
  },
  timesheet: {
    id: 'timesheet',
    name: 'Табель',
    tagline: 'Точность',
    desc: 'Первое попадание по каждому врагу наносит двойной урон.',
    kind: 'passive',
    pools: ['treasure', 'boss'],
    quality: 2,
    tags: ['bureau'],
    apply: (m) => {
      m.firstHitDouble = true;
    },
  },
  register: {
    id: 'register',
    name: 'Кассовый аппарат',
    tagline: 'Монеты бьют',
    desc: 'Совпадения монет наносят цели 1 урон за фишку.',
    kind: 'passive',
    pools: ['shop', 'treasure'],
    quality: 2,
    tags: ['accountant'],
    apply: (m) => {
      m.coinDamage += 1;
    },
  },
  ledger: {
    id: 'ledger',
    name: 'Бухгалтерская книга',
    tagline: 'Проценты',
    desc: 'При входе в новую комнату +1 монета за каждые 10 монет в кошельке.',
    kind: 'passive',
    pools: ['shop'],
    quality: 1,
    tags: ['accountant'],
    apply: (m) => {
      m.ledger = true;
    },
  },
  wallet: {
    id: 'wallet',
    name: 'Толстый кошелёк',
    tagline: 'Жадность',
    desc: 'Каждое совпадение монет даёт на 1 монету больше.',
    kind: 'passive',
    pools: ['shop', 'treasure'],
    quality: 1,
    tags: ['accountant'],
    apply: (m) => {
      m.coinBonus += 1;
    },
  },
  ice: {
    id: 'ice',
    name: 'Ведро льда',
    tagline: 'Холод',
    desc: 'Группа из 4+ папок замораживает врагов: +1 к их таймерам.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    apply: (m) => {
      m.freezeOn4Shields = true;
    },
  },
  lamp: {
    id: 'lamp',
    name: 'Настольная лампа',
    tagline: 'Свет',
    desc: 'Цензура не действует. Урон клинков +20%. Ты несёшь свой свет.',
    kind: 'passive',
    pools: ['treasure', 'secret'],
    quality: 2,
    apply: (m) => {
      m.lamp = true;
      m.censorImmune = true;
    },
  },
  garland: {
    id: 'garland',
    name: 'Гирлянда',
    tagline: 'Праздник',
    desc: 'Каждый 6-й ход случайная фишка становится бомбой.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 2,
    tags: ['pyro'],
    apply: (m) => {
      m.garlandEvery = m.garlandEvery ? Math.max(3, m.garlandEvery - 2) : 6;
    },
  },
  clock: {
    id: 'clock',
    name: 'Сломанные часы',
    tagline: 'Стоп',
    desc: 'Каждый 4-й ход не тратит время: враги не тикают.',
    kind: 'passive',
    pools: ['treasure', 'boss'],
    quality: 3,
    apply: (m) => {
      m.clockEvery = 4;
    },
  },
  gloves: {
    id: 'gloves',
    name: 'Резиновые перчатки',
    tagline: 'Не горит',
    desc: 'Угольки больше не ранят.',
    kind: 'passive',
    pools: ['shop'],
    quality: 0,
    tags: ['pyro'],
    apply: (m) => {
      m.emberImmune = true;
    },
  },
  bowl: {
    id: 'bowl',
    name: 'Кошачья миска',
    tagline: 'Мурлыка',
    desc: 'Зачистка комнаты лечит ½ сердца, не чаще раза в 3 комнаты.',
    kind: 'passive',
    pools: ['treasure', 'shop'],
    quality: 1,
    tags: ['pets'],
    apply: (m) => {
      m.catBowl = true;
    },
  },
  flash: {
    id: 'flash',
    name: 'Флешка',
    tagline: 'Резервная копия',
    desc: 'Раз за этаж смертельный удар оставляет тебе ½ сердца.',
    kind: 'passive',
    pools: ['shop', 'secret'],
    quality: 3,
    apply: (m) => {
      m.flash = true;
    },
  },
  award: {
    id: 'award',
    name: 'Грамота «Сотрудник месяца»',
    tagline: 'Всё вверх',
    desc: '+0,3 урона, +1 контейнер сердца, предел брони +1.',
    kind: 'passive',
    pools: ['boss', 'secret'],
    quality: 4,
    hearts: 1,
    heal: 2,
    apply: (m) => {
      m.damage += 0.3;
      m.armorCap += 1;
    },
  },
  espresso: {
    id: 'espresso',
    name: 'Двойной эспрессо',
    tagline: 'Урон вверх',
    desc: '+1 к урону клинков.',
    kind: 'passive',
    pools: ['boss', 'shop'],
    quality: 3,
    tags: ['coffee'],
    apply: (m) => {
      m.damage += 1;
    },
  },

  // ── Deals: paid in heart containers ─────────────────────────────────
  blood: {
    id: 'blood',
    name: 'Кровавый контракт',
    tagline: 'Урон вверх ценой крови',
    desc: '+1 урона. Клинки вызывают кровотечение.',
    kind: 'passive',
    pools: ['deal'],
    quality: 3,
    apply: (m) => {
      m.damage += 1;
      m.bleedOnHit = true;
    },
  },
  nightshift: {
    id: 'nightshift',
    name: 'Ночная смена',
    tagline: 'Время тянется',
    desc: 'Таймеры всех врагов +1.',
    kind: 'passive',
    pools: ['deal'],
    quality: 4,
    apply: (m) => {
      m.timerBonus += 1;
    },
  },
  bonus: {
    id: 'bonus',
    name: 'Премия',
    tagline: 'Деньги и сила',
    desc: '+1 урона и 25 монет.',
    kind: 'passive',
    pools: ['deal'],
    quality: 3,
    coins: 25,
    apply: (m) => {
      m.damage += 1;
    },
  },
  pact: {
    id: 'pact',
    name: 'Пакт с Цензором',
    tagline: 'Радуга',
    desc: 'Цензура не действует. Каждая группа из 4 создаёт призму вместо ракеты.',
    kind: 'passive',
    pools: ['deal'],
    quality: 4,
    apply: (m) => {
      m.censorImmune = true;
      m.prismOn4 = true;
    },
  },

  // ── Active items ────────────────────────────────────────────────────
  eraser: {
    id: 'eraser',
    name: 'Ластик',
    tagline: 'Стереть фишку',
    desc: 'Убирает выбранную фишку: сверху упадёт новая. Снимает скрепки и угольки. Время не тратит.',
    kind: 'active',
    charge: 3,
    when: 'combat',
    aim: 'cell',
    pools: ['shop'],
    quality: 1,
  },
  coffeeToGo: {
    id: 'coffeeToGo',
    name: 'Кофе с собой',
    tagline: 'Два хода даром',
    desc: 'Следующие 2 хода враги не тикают.',
    kind: 'active',
    charge: 6,
    when: 'combat',
    pools: ['treasure', 'shop'],
    quality: 2,
    tags: ['coffee'],
  },
  stapler: {
    id: 'stapler',
    name: 'Степлер',
    tagline: 'Оглушение',
    desc: 'Выбранный враг пропускает следующее действие.',
    kind: 'active',
    charge: 6,
    when: 'combat',
    aim: 'enemy',
    pools: ['treasure', 'shop'],
    quality: 2,
  },
  corrector: {
    id: 'corrector',
    name: 'Корректор',
    tagline: 'Чистый лист',
    desc: 'Снимает с поля кляксы, скрепки, угольки, якоря и цензуру.',
    kind: 'active',
    charge: 6,
    when: 'combat',
    pools: ['treasure', 'shop'],
    quality: 1,
  },
  shredder: {
    id: 'shredder',
    name: 'Шредер',
    tagline: 'Столбец в лапшу',
    desc: 'Очищает выбранный столбец, фишки дают свой эффект.',
    kind: 'active',
    charge: 9,
    when: 'combat',
    aim: 'col',
    pools: ['treasure', 'boss'],
    quality: 3,
  },
  megaphone: {
    id: 'megaphone',
    name: 'Мегафон',
    tagline: 'Всем ждать',
    desc: 'Все враги +2 к таймерам.',
    kind: 'active',
    charge: 9,
    when: 'combat',
    pools: ['treasure', 'shop'],
    quality: 2,
  },
  giftbox: {
    id: 'giftbox',
    name: 'Коробка с сюрпризом',
    tagline: 'Бум и радуга',
    desc: 'Две бомбы и призма появляются на поле.',
    kind: 'active',
    charge: 12,
    when: 'combat',
    pools: ['treasure', 'boss', 'secret'],
    quality: 3,
    tags: ['pyro'],
  },
  dice: {
    id: 'dice',
    name: 'Игральный кубик',
    tagline: 'Переиграть',
    desc: 'Перебрасывает предметы на пьедесталах в комнате. Вне боя.',
    kind: 'active',
    charge: 6,
    when: 'explore',
    pools: ['secret', 'shop'],
    quality: 3,
  },
  mop: {
    id: 'mop',
    name: 'Швабра',
    tagline: 'Прибраться',
    desc: 'Снимает кляксы, скрепки, угольки и цензуру, даёт 1 броню.',
    kind: 'active',
    charge: 4,
    when: 'combat',
    pools: [],
    quality: 1,
  },
};

export const TRANSFORMATIONS: Record<Tag, { name: string; desc: string; apply: (m: Mods) => void }> = {
  bureau: {
    name: 'Бюрократ',
    desc: 'Каждая группа считается на 1 фишку больше.',
    apply: (m) => {
      m.bureau = true;
    },
  },
  pyro: {
    name: 'Пироман',
    desc: 'Взрывы поджигают врагов. Угольки не ранят.',
    apply: (m) => {
      m.pyroBlast = true;
      m.emberImmune = true;
    },
  },
  accountant: {
    name: 'Бухгалтер',
    desc: 'Каждые 5 монет за ход дают 1 броню.',
    apply: (m) => {
      m.accountant = true;
    },
  },
  coffee: {
    name: 'Кофеман',
    desc: 'Первый ход в каждой комнате не тратит время. +0,5 урона.',
    apply: (m) => {
      m.coffeeFirstMove = true;
      m.damage += 0.5;
    },
  },
  pets: {
    name: 'Хозяин питомцев',
    desc: 'Питомцы действуют дважды.',
    apply: (m) => {
      m.petMaster = true;
    },
  },
};

export function computeMods(items: readonly string[], transformations: readonly string[]): Mods {
  const m = baseMods();
  for (const id of items) ITEMS[id]?.apply?.(m);
  for (const t of transformations) TRANSFORMATIONS[t as Tag]?.apply(m);
  if (m.petMaster) {
    m.spider *= 2;
    m.cactus *= 2;
  }
  return m;
}

export function tagCounts(items: readonly string[]): Map<Tag, number> {
  const counts = new Map<Tag, number>();
  for (const id of items) for (const tag of ITEMS[id]?.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return counts;
}

export const PASSIVE_IDS = Object.values(ITEMS)
  .filter((i) => i.kind === 'passive')
  .map((i) => i.id);

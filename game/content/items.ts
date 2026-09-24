/**
 * Items: passive relics that bend the rules, one active skill slot charged by ink,
 * and pocket consumables. Effects are Mods flags read by the combat and run code.
 */
export type Pool = 'common' | 'uncommon' | 'rare' | 'boss' | 'shop' | 'starter';

export interface Mods {
  redPlus: number;
  bluePlus: number;
  inkPlus: number;
  coinPlus: number;
  /** +mult on every move. */
  multFlat: number;
  /** Extra mult per cascade wave beyond the first. */
  cascadeMult: number;
  /** First move of every fight: mult ×2. */
  firstMoveX: boolean;
  /** Chance that the move's mult doubles. */
  luck: number;
  /** Mult × random 0.5–2.5. */
  chaos: boolean;
  preview: number;
  wrap: boolean;
  crossRockets: boolean;
  bombRadius: number;
  prismOn4: boolean;
  garlandEvery: number;
  clockEvery: number;
  /** Final strike ×N against paper enemies. */
  paperX: number;
  pierce: boolean;
  firstHitDouble: boolean;
  bleedOnRed: number;
  igniteOn4: boolean;
  planeOn4: number;
  inkDamage: number;
  coinDamage: number;
  armorToDamage: boolean;
  freezeOn4Shields: boolean;
  spider: number;
  cactus: number;
  battery: number;
  startArmor: number;
  /** The first group of every move scores twice. */
  echo: boolean;
  censorImmune: boolean;
  emberImmune: boolean;
  /** +1 mult if the move had violet tiles (desk lamp). */
  lampMult: boolean;
  /** +1 mult if the move had gold tiles (calculator). */
  calcGoldMult: boolean;
  /** Armor for every junk tile cleared (mop). */
  mopJunk: number;
  interest: boolean;
  healAfterFight: number;
  healNoHit: number;
  flash: boolean;
  timerBonus: number;
  pockets: number;
  /** Seal finish on N random tiles at the start of a fight. */
  sealStart: number;
}

export function baseMods(): Mods {
  return {
    redPlus: 0,
    bluePlus: 0,
    inkPlus: 0,
    coinPlus: 0,
    multFlat: 0,
    cascadeMult: 0,
    firstMoveX: false,
    luck: 0,
    chaos: false,
    preview: 1,
    wrap: false,
    crossRockets: false,
    bombRadius: 1,
    prismOn4: false,
    garlandEvery: 0,
    clockEvery: 0,
    paperX: 1,
    pierce: false,
    firstHitDouble: false,
    bleedOnRed: 0,
    igniteOn4: false,
    planeOn4: 0,
    inkDamage: 0,
    coinDamage: 0,
    armorToDamage: false,
    freezeOn4Shields: false,
    spider: 0,
    cactus: 0,
    battery: 0,
    startArmor: 0,
    echo: false,
    censorImmune: false,
    emberImmune: false,
    lampMult: false,
    calcGoldMult: false,
    mopJunk: 0,
    interest: false,
    healAfterFight: 0,
    healNoHit: 0,
    flash: false,
    timerBonus: 0,
    pockets: 3,
    sealStart: 0,
  };
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: 'passive' | 'active';
  /** Sprite id of the icon. */
  icon: string;
  pool: Pool;
  /** Ink needed to use an active item. */
  charge?: number;
  /** Active target: a cell, a column, an enemy, or none. */
  aim?: 'cell' | 'col' | 'enemy';
  /** Meta unlock that adds the item to the pools; absent = always available. */
  unlock?: string;
  maxHp?: number;
  heal?: number;
  coins?: number;
  apply?: (m: Mods) => void;
}

const i = (def: ItemDef) => def;

export const ITEMS: Record<string, ItemDef> = {
  // ── Starting items ────────────────────────────────────────────────
  knife: i({ id: 'knife', name: 'Канцелярский нож', desc: 'Итоговый удар по бумажным врагам ×2.', kind: 'passive', icon: 'item_knife', pool: 'starter', apply: (m) => (m.paperX *= 2) }),
  calculator: i({ id: 'calculator', name: 'Калькулятор', desc: '+1 множ, если в ходу собраны золотые фишки.', kind: 'passive', icon: 'item_calculator', pool: 'starter', apply: (m) => (m.calcGoldMult = true) }),
  mop: i({ id: 'mop', name: 'Швабра', desc: 'Каждая убранная клякса или волокита даёт 2 брони.', kind: 'passive', icon: 'item_mop', pool: 'starter', apply: (m) => (m.mopJunk += 2) }),

  // ── Common ────────────────────────────────────────────────────────
  coffee: i({ id: 'coffee', name: 'Крепкий кофе', desc: 'Красные фишки +1 к урону.', kind: 'passive', icon: 'item_coffee', pool: 'common', apply: (m) => (m.redPlus += 1) }),
  binderclip: i({ id: 'binderclip', name: 'Зажим для бумаг', desc: 'Синие фишки +1 к броне.', kind: 'passive', icon: 'item_binderclip', pool: 'common', apply: (m) => (m.bluePlus += 1) }),
  inkpot: i({ id: 'inkpot', name: 'Запасной картридж', desc: 'Фиолетовые фишки +1 к заряду.', kind: 'passive', icon: 'item_inkpot', pool: 'common', apply: (m) => (m.inkPlus += 1) }),
  wallet: i({ id: 'wallet', name: 'Толстый кошелёк', desc: 'Золотые фишки +1 монета.', kind: 'passive', icon: 'item_wallet', pool: 'common', apply: (m) => (m.coinPlus += 1) }),
  vestrelic: i({ id: 'vestrelic', name: 'Жилет охранника', desc: 'Каждый бой начинается с 6 брони.', kind: 'passive', icon: 'item_vest', pool: 'common', apply: (m) => (m.startArmor += 6) }),
  sandwich: i({ id: 'sandwich', name: 'Бутерброд', desc: '+8 к максимуму здоровья. Лечит 8.', kind: 'passive', icon: 'item_sandwich', pool: 'common', maxHp: 8, heal: 8 }),
  bowl: i({ id: 'bowl', name: 'Кошачья миска', desc: 'После каждого боя лечит 5.', kind: 'passive', icon: 'item_bowl', pool: 'common', apply: (m) => (m.healAfterFight += 5) }),
  gum: i({ id: 'gum', name: 'Мятная жвачка', desc: 'Бой без полученного урона лечит 8.', kind: 'passive', icon: 'item_gum', pool: 'common', apply: (m) => (m.healNoHit += 8) }),
  ledger: i({ id: 'ledger', name: 'Бухгалтерская книга', desc: 'В начале боя +1 монета за каждые 10 в кошельке.', kind: 'passive', icon: 'item_ledger', pool: 'common', apply: (m) => (m.interest = true) }),
  loupe: i({ id: 'loupe', name: 'Лупа', desc: 'Очередь над полем показывает 3 следующие фишки.', kind: 'passive', icon: 'item_loupe', pool: 'common', apply: (m) => (m.preview = 3) }),
  gloves: i({ id: 'gloves', name: 'Резиновые перчатки', desc: 'Угольки не ранят.', kind: 'passive', icon: 'item_gloves', pool: 'common', apply: (m) => (m.emberImmune = true) }),

  // ── Uncommon ──────────────────────────────────────────────────────
  battery: i({ id: 'battery', name: 'Батарейка', desc: '+1 заряд навыка после каждого хода.', kind: 'passive', icon: 'item_battery', pool: 'uncommon', apply: (m) => (m.battery += 1) }),
  spider: i({ id: 'spider', name: 'Скрепка-паук', desc: 'После каждого хода кусает самого слабого врага на 3.', kind: 'passive', icon: 'item_spider', pool: 'uncommon', apply: (m) => (m.spider += 3) }),
  cactus: i({ id: 'cactus', name: 'Кактус на столе', desc: 'Враг, ударивший тебя, получает 5 урона.', kind: 'passive', icon: 'item_cactus', pool: 'uncommon', apply: (m) => (m.cactus += 5) }),
  inkwell: i({ id: 'inkwell', name: 'Чернильница', desc: 'Каждая фиолетовая фишка наносит цели 2 урона.', kind: 'passive', icon: 'item_inkwell', pool: 'uncommon', apply: (m) => (m.inkDamage += 2) }),
  register: i({ id: 'register', name: 'Кассовый аппарат', desc: 'Каждая золотая фишка наносит цели 2 урона.', kind: 'passive', icon: 'item_register', pool: 'uncommon', apply: (m) => (m.coinDamage += 2) }),
  tape: i({ id: 'tape', name: 'Двусторонний скотч', desc: 'Броня, полученная за ход, ещё и бьёт цель.', kind: 'passive', icon: 'item_tape', pool: 'uncommon', apply: (m) => (m.armorToDamage = true) }),
  rustyblade: i({ id: 'rustyblade', name: 'Ржавое лезвие', desc: 'Каждая красная группа даёт цели 2 кровотечения.', kind: 'passive', icon: 'item_scissors', pool: 'uncommon', apply: (m) => (m.bleedOnRed += 2) }),
  match: i({ id: 'match', name: 'Тлеющая спичка', desc: 'Группа из 4+ фишек поджигает цель: 4 урона три хода.', kind: 'passive', icon: 'item_match', pool: 'uncommon', apply: (m) => (m.igniteOn4 = true) }),
  ice: i({ id: 'ice', name: 'Ведро льда', desc: 'Синяя группа из 4+ замораживает врагов: таймеры +1.', kind: 'passive', icon: 'item_ice', pool: 'uncommon', apply: (m) => (m.freezeOn4Shields = true) }),
  plane: i({ id: 'plane', name: 'Бумажный самолётик', desc: 'Красная группа из 4+ — 6 урона каждому врагу.', kind: 'passive', icon: 'item_plane', pool: 'uncommon', apply: (m) => (m.planeOn4 += 6) }),
  lucky: i({ id: 'lucky', name: 'Счастливая монетка', desc: 'С шансом 20% множ хода удваивается.', kind: 'passive', icon: 'item_lucky', pool: 'uncommon', apply: (m) => (m.luck += 0.2) }),
  dynamite: i({ id: 'dynamite', name: 'Праздничный динамит', desc: 'Бомбы взрывают квадрат 5×5.', kind: 'passive', icon: 'item_dynamite', pool: 'uncommon', apply: (m) => (m.bombRadius = 2) }),
  garland: i({ id: 'garland', name: 'Гирлянда', desc: 'Каждый 5-й ход случайная фишка становится бомбой.', kind: 'passive', icon: 'item_garland', pool: 'uncommon', apply: (m) => (m.garlandEvery = 5) }),
  timesheet: i({ id: 'timesheet', name: 'Табель', desc: 'Первый удар по каждому врагу ×2.', kind: 'passive', icon: 'item_timesheet', pool: 'uncommon', apply: (m) => (m.firstHitDouble = true) }),
  calc2: i({ id: 'calc2', name: 'Кривой калькулятор', desc: 'Множ хода умножается на случайное число от 0,5 до 2,5.', kind: 'passive', icon: 'item_calculator', pool: 'uncommon', apply: (m) => (m.chaos = true) }),
  lamp: i({
    id: 'lamp',
    name: 'Настольная лампа',
    desc: 'Цензура не действует. +1 множ, если в ходу были фиолетовые фишки.',
    kind: 'passive',
    icon: 'item_lamp',
    pool: 'uncommon',
    apply: (m) => {
      m.censorImmune = true;
      m.lampMult = true;
    },
  }),

  // ── Rare ──────────────────────────────────────────────────────────
  ring: i({ id: 'ring', name: 'Кольцевая скоба', desc: 'Края поля соединены: линии и обмены идут через край.', kind: 'passive', icon: 'item_ring', pool: 'rare', apply: (m) => (m.wrap = true) }),
  pen: i({ id: 'pen', name: 'Бесконечная ручка', desc: 'Ракеты очищают строку и столбец сразу.', kind: 'passive', icon: 'item_pen', pool: 'rare', apply: (m) => (m.crossRockets = true) }),
  clock: i({ id: 'clock', name: 'Сломанные часы', desc: 'Каждый 4-й ход не тратит время: враги не тикают.', kind: 'passive', icon: 'item_clock', pool: 'rare', apply: (m) => (m.clockEvery = 4) }),
  puncher: i({ id: 'puncher', name: 'Пробойник', desc: 'Итоговый удар пробивает броню и щит врагов.', kind: 'passive', icon: 'item_punch', pool: 'rare', apply: (m) => (m.pierce = true) }),
  poster: i({ id: 'poster', name: 'Мотивационный плакат', desc: 'Каждая волна каскада даёт ещё +1 множ.', kind: 'passive', icon: 'item_poster', pool: 'rare', apply: (m) => (m.cascadeMult += 1) }),
  coffeemachine: i({ id: 'coffeemachine', name: 'Кофемашина', desc: 'Первый ход каждого боя — множ ×2.', kind: 'passive', icon: 'item_coffeemachine', pool: 'rare', apply: (m) => (m.firstMoveX = true) }),
  carbonpack: i({ id: 'carbonpack', name: 'Пачка копирки', desc: 'Первая группа каждого хода срабатывает дважды.', kind: 'passive', icon: 'item_carbon', pool: 'rare', apply: (m) => (m.echo = true) }),
  flash: i({ id: 'flash', name: 'Флешка', desc: 'Раз за отдел смертельный удар оставляет тебе 1 здоровье.', kind: 'passive', icon: 'item_flash', pool: 'rare', apply: (m) => (m.flash = true) }),

  // ── Boss ──────────────────────────────────────────────────────────
  award: i({ id: 'award', name: 'Грамота «Сотрудник месяца»', desc: '+1 множ каждый ход.', kind: 'passive', icon: 'item_award', pool: 'boss', apply: (m) => (m.multFlat += 1) }),
  nightshift: i({ id: 'nightshift', name: 'Ночная смена', desc: 'Таймеры всех врагов +1.', kind: 'passive', icon: 'item_nightshift', pool: 'boss', apply: (m) => (m.timerBonus += 1) }),
  espresso: i({ id: 'espresso', name: 'Двойной эспрессо', desc: 'Красные фишки +2 к урону.', kind: 'passive', icon: 'item_espresso', pool: 'boss', apply: (m) => (m.redPlus += 2) }),
  pocketbag: i({ id: 'pocketbag', name: 'Портфель', desc: '+2 кармана для расходников. +15 к максимуму здоровья.', kind: 'passive', icon: 'item_pocketbag', pool: 'boss', maxHp: 15, heal: 15, apply: (m) => (m.pockets += 2) }),
  stamprelic: i({ id: 'stamprelic', name: 'Печать отдела', desc: 'В начале боя 3 фишки поля получают печать: +1 множ при сборе.', kind: 'passive', icon: 'item_stamprelic', pool: 'boss', apply: (m) => (m.sealStart += 3) }),
  prismpact: i({ id: 'prismpact', name: 'Радужная скрепка', desc: 'Группы из 4 создают призму вместо ракеты.', kind: 'passive', icon: 'item_pact', pool: 'boss', apply: (m) => (m.prismOn4 = true) }),

  // ── Active skills (charged by ink) ────────────────────────────────
  eraser: i({ id: 'eraser', name: 'Ластик', desc: 'Убирает выбранную фишку: сверху упадёт новая. Время не тратит.', kind: 'active', icon: 'item_eraser', pool: 'shop', charge: 3, aim: 'cell' }),
  stapler: i({ id: 'stapler', name: 'Степлер', desc: 'Выбранный враг пропускает следующее действие.', kind: 'active', icon: 'item_stapler', pool: 'uncommon', charge: 6, aim: 'enemy' }),
  coffeeToGo: i({ id: 'coffeeToGo', name: 'Кофе с собой', desc: 'Следующие 2 хода враги не тикают.', kind: 'active', icon: 'item_coffeeToGo', pool: 'uncommon', charge: 6 }),
  corrector: i({ id: 'corrector', name: 'Корректор', desc: 'Снимает с поля кляксы, волокиту, скобы, угольки и цензуру.', kind: 'active', icon: 'item_corrector', pool: 'common', charge: 5 }),
  shredder: i({ id: 'shredder', name: 'Шредер', desc: 'Очищает выбранный столбец, фишки срабатывают.', kind: 'active', icon: 'item_shredder', pool: 'rare', charge: 8, aim: 'col' }),
  megaphone: i({ id: 'megaphone', name: 'Мегафон', desc: 'Таймеры всех врагов +2.', kind: 'active', icon: 'item_megaphone', pool: 'uncommon', charge: 8 }),
  giftbox: i({ id: 'giftbox', name: 'Коробка с сюрпризом', desc: 'Две бомбы и призма появляются на поле.', kind: 'active', icon: 'item_giftbox', pool: 'rare', charge: 10 }),
};

export interface PocketDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: number;
  aim?: 'cell';
}

export const POCKETS: Record<string, PocketDef> = {
  bomb: { id: 'bomb', name: 'Бомба', desc: 'Взрыв 3×3 в выбранном месте. Время не тратит.', icon: 'pocket_bomb', price: 30, aim: 'cell' },
  coffee: { id: 'coffee', name: 'Кофе', desc: 'Лечит 12 здоровья.', icon: 'pocket_coffee', price: 30 },
  eraser: { id: 'eraser', name: 'Ластик', desc: 'Убирает выбранную фишку. Время не тратит.', icon: 'pocket_eraser', price: 25, aim: 'cell' },
  sticker: { id: 'sticker', name: 'Стикер «Срочно»', desc: 'Таймеры всех врагов +2.', icon: 'pocket_sticker', price: 35 },
  energy: { id: 'energy', name: 'Энергетик', desc: '+2 множ к следующему ходу.', icon: 'pocket_energy', price: 30 },
};

export function computeMods(relics: readonly string[]): Mods {
  const m = baseMods();
  for (const id of relics) ITEMS[id]?.apply?.(m);
  return m;
}

export const RELIC_PRICE: Record<Pool, number> = { starter: 0, common: 120, uncommon: 160, rare: 230, boss: 300, shop: 140 };

/** Passive relics that can drop (actives come from their own pools). */
export function relicPool(unlocked: readonly string[], exclude: readonly string[]): string[] {
  return Object.values(ITEMS)
    .filter((d) => d.pool !== 'starter' && d.kind === 'passive' && (!d.unlock || unlocked.includes(d.unlock)) && !exclude.includes(d.id))
    .map((d) => d.id);
}

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
  /** Damage bonus of every strike (+0.25 = +25%): an implicit, permanent multiplier. */
  dmgBonus: number;
  /** Damage bonus for every cascade wave beyond the first. */
  cascadeBonus: number;
  /** Damage bonus of the first strike of every fight. */
  firstStrikeBonus: number;
  /** Chance that the strike deals double damage. */
  luck: number;
  /** The move's damage changes at random: −50%…+100%. */
  chaos: boolean;
  preview: number;
  wrap: boolean;
  crossRockets: boolean;
  bombRadius: number;
  prismOn4: boolean;
  garlandEvery: number;
  clockEvery: number;
  pierce: boolean;
  /** Damage bonus of the first hit on every enemy. */
  firstHitBonus: number;
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
  /** The first enemy blow of every fight does not get through. */
  firstBlowGuard: boolean;
  /** Damage bonus every gold tile puts aside for the next strike that deals damage (the abacus). */
  bankPer: number;
  /** Damage bonus of the move after a skill (the hot key). */
  skillBonus: number;
  /** The first group of every move scores twice. */
  echo: boolean;
  censorImmune: boolean;
  emberImmune: boolean;
  /** Damage per violet group of the move (desk lamp). */
  inkGroupDmg: number;
  /** Damage per gold group of the move (calculator). */
  goldGroupDmg: number;
  /** Energy a weapon swap costs less (the intern's pass). */
  swapDiscount: number;
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
  /** Damage bonus for every 50 coins in the wallet. */
  coinBonus: number;
  /** Share of the armour that survives the enemies' action. */
  armorKeep: number;
  /** Columns and rows added to the board (negative: taken away). */
  boardW: number;
  boardH: number;
  /** A tile may be dragged along its row or column any distance. */
  slide: boolean;
  /** Diagonal neighbours swap too. */
  diagonal: boolean;
  /** Staples, anchors and water do not hold tiles. */
  unpinned: boolean;
  /** Rockets placed on the board when a fight starts. */
  startRockets: number;
  /** Damage bonus for every group of 5 or more tiles. */
  bigGroupBonus: number;
  /** +1 max health after each won fight, up to this much in a run. */
  growHp: number;
}

export function baseMods(): Mods {
  return {
    redPlus: 0,
    bluePlus: 0,
    inkPlus: 0,
    coinPlus: 0,
    dmgBonus: 0,
    cascadeBonus: 0,
    firstStrikeBonus: 0,
    luck: 0,
    chaos: false,
    preview: 1,
    wrap: false,
    crossRockets: false,
    bombRadius: 1,
    prismOn4: false,
    garlandEvery: 0,
    clockEvery: 0,
    pierce: false,
    firstHitBonus: 0,
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
    firstBlowGuard: false,
    bankPer: 0,
    skillBonus: 0,
    echo: false,
    censorImmune: false,
    emberImmune: false,
    inkGroupDmg: 0,
    goldGroupDmg: 0,
    swapDiscount: 0,
    mopJunk: 0,
    interest: false,
    healAfterFight: 0,
    healNoHit: 0,
    flash: false,
    timerBonus: 0,
    pockets: 3,
    sealStart: 0,
    coinBonus: 0,
    armorKeep: 0,
    boardW: 0,
    boardH: 0,
    slide: false,
    diagonal: false,
    unpinned: false,
    startRockets: 0,
    bigGroupBonus: 0,
    growHp: 0,
  };
}

/** What a red group does with a weapon in hand, besides its damage. */
export interface WeaponEffect {
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
  /** Damage of every red tile in cascade waves (2+), instead of the weapon's own. */
  cascadeTile?: number;
  /** Share of the target's maximum health it loses at once (through armour: it grows with the act). */
  hpPct?: number;
}

/** A weapon: red tiles show it and strike with it. A group of 4+ is its super strike. */
export interface WeaponDef {
  /** Damage of every red tile of a group. */
  tile: number;
  /** Added to the tile damage in every act after the first (a weapon that grows with the shift). */
  tileAct?: number;
  strike: WeaponEffect;
  super: WeaponEffect;
  /** Texts for the tooltip: the strike (any red group) and the super strike (a red group of 4+). */
  strikeText: string;
  superText: string;
}

/** Weapons a hero can carry; swapping in a fight costs energy. */
export const MAX_WEAPONS = 3;
export const WEAPON_SWAP_COST = 2;

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: 'passive' | 'active' | 'weapon';
  weapon?: WeaponDef;
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
  /** The skill costs this share of its charge (items multiply). */
  skillCost?: number;
  apply?: (m: Mods) => void;
}

const i = (def: ItemDef) => def;
const w = (id: string, name: string, pool: Pool, icon: string, weapon: WeaponDef, unlock?: string): ItemDef => ({
  id,
  name,
  desc: `${weapon.strikeText} Группа из 4+: ${weapon.superText[0].toLowerCase()}${weapon.superText.slice(1)}`,
  kind: 'weapon',
  icon,
  pool,
  weapon,
  ...(unlock ? { unlock } : {}),
});

export const ITEMS: Record<string, ItemDef> = {
  // ── Starting items ────────────────────────────────────────────────
  badge: i({ id: 'badge', name: 'Пропуск стажёра', desc: 'Смена оружия в бою стоит на 1 энергию меньше.', kind: 'passive', icon: 'item_badge', pool: 'starter', apply: (m) => (m.swapDiscount += 1) }),
  calculator: i({ id: 'calculator', name: 'Калькулятор', desc: 'Каждая золотая группа хода: +3 урона удару.', kind: 'passive', icon: 'item_calculator', pool: 'starter', apply: (m) => (m.goldGroupDmg += 3) }),
  mop: i({ id: 'mop', name: 'Швабра', desc: 'Каждые 2 убранные кляксы или волокиты дают броню на ½ сердца.', kind: 'passive', icon: 'item_mop', pool: 'starter', apply: (m) => (m.mopJunk += 1) }),

  // ── Common ────────────────────────────────────────────────────────
  coffee: i({ id: 'coffee', name: 'Крепкий кофе', desc: 'Красные фишки +1 к урону.', kind: 'passive', icon: 'item_coffee', pool: 'common', apply: (m) => (m.redPlus += 1) }),
  binderclip: i({ id: 'binderclip', name: 'Зажим для бумаг', desc: 'Синие группы дают на ½ сердца брони больше.', kind: 'passive', icon: 'item_binderclip', pool: 'common', apply: (m) => (m.bluePlus += 1) }),
  inkpot: i({ id: 'inkpot', name: 'Запасной картридж', desc: 'Фиолетовые фишки +1 к энергии.', kind: 'passive', icon: 'item_inkpot', pool: 'common', apply: (m) => (m.inkPlus += 1) }),
  wallet: i({ id: 'wallet', name: 'Толстый кошелёк', desc: 'Золотые фишки +1 монета.', kind: 'passive', icon: 'item_wallet', pool: 'common', apply: (m) => (m.coinPlus += 1) }),
  vestrelic: i({ id: 'vestrelic', name: 'Жилет охранника', desc: 'Первый удар врага в каждом бою вдвое слабее.', kind: 'passive', icon: 'item_vest', pool: 'uncommon', apply: (m) => (m.firstBlowGuard = true) }),
  sandwich: i({ id: 'sandwich', name: 'Бутерброд', desc: '+1 сердце к максимуму (и к потолку брони). Лечит 1 сердце.', kind: 'passive', icon: 'item_sandwich', pool: 'common', maxHp: 2, heal: 2 }),
  bowl: i({ id: 'bowl', name: 'Кошачья миска', desc: 'После каждого боя лечит ½ сердца.', kind: 'passive', icon: 'item_bowl', pool: 'common', apply: (m) => (m.healAfterFight += 1) }),
  gum: i({ id: 'gum', name: 'Мятная жвачка', desc: 'Бой без полученного урона лечит 1 сердце.', kind: 'passive', icon: 'item_gum', pool: 'common', apply: (m) => (m.healNoHit += 2) }),
  ledger: i({ id: 'ledger', name: 'Бухгалтерская книга', desc: 'В начале боя +1 монета за каждые 10 в кошельке.', kind: 'passive', icon: 'item_ledger', pool: 'common', apply: (m) => (m.interest = true) }),
  loupe: i({ id: 'loupe', name: 'Лупа', desc: 'Очередь над полем показывает 3 следующие фишки.', kind: 'passive', icon: 'item_loupe', pool: 'common', apply: (m) => (m.preview = 3) }),
  gloves: i({ id: 'gloves', name: 'Резиновые перчатки', desc: 'Угольки не ранят.', kind: 'passive', icon: 'item_gloves', pool: 'common', apply: (m) => (m.emberImmune = true) }),
  clipholder: i({ id: 'clipholder', name: 'Скрепочница', desc: 'В начале боя две фишки поля становятся ракетами.', kind: 'passive', icon: 'item_clipholder', pool: 'common', apply: (m) => (m.startRockets += 2) }),
  destapler: i({ id: 'destapler', name: 'Антистеплер', desc: 'Скобы, якоря и вода не держат фишки: они ходят как обычно.', kind: 'passive', icon: 'item_destapler', pool: 'common', apply: (m) => (m.unpinned = true) }),
  calendar: i({ id: 'calendar', name: 'Настольный календарь', desc: 'Каждый третий выигранный бой: +1 сердце к максимуму (до +3 за смену).', kind: 'passive', icon: 'item_calendar', pool: 'common', apply: (m) => (m.growHp = 3) }),

  // ── Uncommon ──────────────────────────────────────────────────────
  battery: i({ id: 'battery', name: 'Батарейка', desc: '+1 энергия после каждого хода.', kind: 'passive', icon: 'item_battery', pool: 'uncommon', apply: (m) => (m.battery += 1) }),
  spider: i({ id: 'spider', name: 'Скрепка-паук', desc: 'После каждого хода кусает самого слабого врага на 3 (растёт с отделом).', kind: 'passive', icon: 'item_spider', pool: 'uncommon', apply: (m) => (m.spider += 3) }),
  cactus: i({ id: 'cactus', name: 'Кактус на столе', desc: 'Враг, ударивший тебя, получает 5 урона (растёт с отделом).', kind: 'passive', icon: 'item_cactus', pool: 'uncommon', apply: (m) => (m.cactus += 5) }),
  inkwell: i({ id: 'inkwell', name: 'Чернильница', desc: 'Каждая фиолетовая фишка наносит цели 2 урона.', kind: 'passive', icon: 'item_inkwell', pool: 'uncommon', apply: (m) => (m.inkDamage += 2) }),
  register: i({ id: 'register', name: 'Кассовый аппарат', desc: 'Каждая золотая фишка наносит цели 2 урона.', kind: 'passive', icon: 'item_register', pool: 'uncommon', apply: (m) => (m.coinDamage += 2) }),
  tape: i({ id: 'tape', name: 'Двусторонний скотч', desc: 'Броня хода ещё и бьёт цель: 4 урона за каждую половинку сердца.', kind: 'passive', icon: 'item_tape', pool: 'uncommon', apply: (m) => (m.armorToDamage = true) }),
  rustyblade: i({ id: 'rustyblade', name: 'Ржавое лезвие', desc: 'Каждая красная группа даёт цели 2 кровотечения (урон растёт с отделом).', kind: 'passive', icon: 'item_scissors', pool: 'uncommon', apply: (m) => (m.bleedOnRed += 2) }),
  match: i({ id: 'match', name: 'Тлеющая спичка', desc: 'Группа из 4+ фишек или взрыв поджигает цель: 4 урона три хода (растёт с отделом).', kind: 'passive', icon: 'item_match', pool: 'uncommon', apply: (m) => (m.igniteOn4 = true) }),
  ice: i({ id: 'ice', name: 'Ведро льда', desc: 'Синяя группа из 4+ замораживает врагов: таймеры +1.', kind: 'passive', icon: 'item_ice', pool: 'uncommon', apply: (m) => (m.freezeOn4Shields = true) }),
  plane: i({ id: 'plane', name: 'Бумажный самолётик', desc: 'Красная группа из 4+ — 6 урона каждому врагу (растёт с отделом).', kind: 'passive', icon: 'item_plane', pool: 'uncommon', apply: (m) => (m.planeOn4 += 6) }),
  lucky: i({ id: 'lucky', name: 'Счастливая монетка', desc: 'С шансом 20% удар хода вдвое сильнее.', kind: 'passive', icon: 'item_lucky', pool: 'uncommon', apply: (m) => (m.luck += 0.2) }),
  dynamite: i({ id: 'dynamite', name: 'Праздничный динамит', desc: 'Бомбы взрывают квадрат 5×5.', kind: 'passive', icon: 'item_dynamite', pool: 'uncommon', apply: (m) => (m.bombRadius = 2) }),
  garland: i({ id: 'garland', name: 'Гирлянда', desc: 'Каждый 5-й ход случайная фишка становится бомбой.', kind: 'passive', icon: 'item_garland', pool: 'uncommon', apply: (m) => (m.garlandEvery = 5) }),
  timesheet: i({ id: 'timesheet', name: 'Табель', desc: 'Первый удар по каждому врагу +100% урона.', kind: 'passive', icon: 'item_timesheet', pool: 'uncommon', apply: (m) => (m.firstHitBonus += 1) }),
  tapemeasure: i({ id: 'tapemeasure', name: 'Рулетка', desc: 'Фишку можно протащить по строке или столбцу на любое расстояние: фишки между сдвигаются на клетку.', kind: 'passive', icon: 'item_tapemeasure', pool: 'rare', apply: (m) => (m.slide = true) }),
  setsquare: i({ id: 'setsquare', name: 'Угольник', desc: 'Фишки меняются местами и по диагонали.', kind: 'passive', icon: 'item_setsquare', pool: 'uncommon', apply: (m) => (m.diagonal = true) }),
  abacus: i({ id: 'abacus', name: 'Счёты', desc: 'Каждая собранная золотая фишка откладывает +10% урона к следующему удару (до +50%).', kind: 'passive', icon: 'item_abacus', pool: 'uncommon', apply: (m) => (m.bankPer += 0.1) }),
  binding: i({ id: 'binding', name: 'Брошюровщик', desc: 'Группа из 5 и больше фишек: +50% урона.', kind: 'passive', icon: 'item_binding', pool: 'uncommon', apply: (m) => (m.bigGroupBonus += 0.5) }),
  calc2: i({ id: 'calc2', name: 'Кривой калькулятор', desc: 'Урон хода случайно меняется: от −50% до +100%.', kind: 'passive', icon: 'item_calculator', pool: 'uncommon', apply: (m) => (m.chaos = true) }),
  lamp: i({
    id: 'lamp',
    name: 'Настольная лампа',
    desc: 'Цензура не действует. Каждая фиолетовая группа хода: +3 урона удару.',
    kind: 'passive',
    icon: 'item_lamp',
    pool: 'uncommon',
    apply: (m) => {
      m.censorImmune = true;
      m.inkGroupDmg += 3;
    },
  }),

  // ── Rare ──────────────────────────────────────────────────────────

  pen: i({ id: 'pen', unlock: 'bundle_relics', name: 'Бесконечная ручка', desc: 'Ракеты очищают строку и столбец сразу.', kind: 'passive', icon: 'item_pen', pool: 'rare', apply: (m) => (m.crossRockets = true) }),
  clock: i({ id: 'clock', name: 'Сломанные часы', desc: 'Каждый 4-й ход не тратит время: враги не тикают.', kind: 'passive', icon: 'item_clock', pool: 'rare', apply: (m) => (m.clockEvery = 4) }),
  puncher: i({ id: 'puncher', name: 'Пробойник', desc: 'Итоговый удар пробивает броню и щит врагов.', kind: 'passive', icon: 'item_punch', pool: 'rare', apply: (m) => (m.pierce = true) }),
  poster: i({ id: 'poster', name: 'Мотивационный плакат', desc: 'Каждая волна каскада после первой: +15% урона.', kind: 'passive', icon: 'item_poster', pool: 'rare', apply: (m) => (m.cascadeBonus += 0.15) }),
  coffeemachine: i({ id: 'coffeemachine', name: 'Кофемашина', desc: 'Первый удар каждого боя +100% урона.', kind: 'passive', icon: 'item_coffeemachine', pool: 'rare', apply: (m) => (m.firstStrikeBonus += 1) }),
  carbonpack: i({ id: 'carbonpack', unlock: 'bundle_relics', name: 'Пачка копирки', desc: 'Первая группа каждого хода срабатывает дважды.', kind: 'passive', icon: 'item_carbon', pool: 'rare', apply: (m) => (m.echo = true) }),
  extension: i({ id: 'extension', name: 'Удлинитель', desc: 'Поле шире на столбец: больше фишек, больше совпадений.', kind: 'passive', icon: 'item_extension', pool: 'rare', apply: (m) => (m.boardW += 1) }),
  flash: i({ id: 'flash', name: 'Флешка', desc: 'Раз за отдел смертельный удар оставляет тебе ½ сердца.', kind: 'passive', icon: 'item_flash', pool: 'rare', apply: (m) => (m.flash = true) }),

  // ── Boss ──────────────────────────────────────────────────────────
  award: i({ id: 'award', name: 'Грамота «Сотрудник месяца»', desc: 'Урон +25%.', kind: 'passive', icon: 'item_award', pool: 'boss', apply: (m) => (m.dmgBonus += 0.25) }),
  nightshift: i({ id: 'nightshift', name: 'Ночная смена', desc: 'Таймеры всех врагов +1.', kind: 'passive', icon: 'item_nightshift', pool: 'boss', apply: (m) => (m.timerBonus += 1) }),
  espresso: i({ id: 'espresso', name: 'Двойной эспрессо', desc: 'Красные фишки +2 к урону.', kind: 'passive', icon: 'item_espresso', pool: 'boss', apply: (m) => (m.redPlus += 2) }),
  pocketbag: i({ id: 'pocketbag', name: 'Портфель', desc: '+2 кармана для расходников. +2 сердца к максимуму (и к потолку брони).', kind: 'passive', icon: 'item_pocketbag', pool: 'boss', maxHp: 4, heal: 4, apply: (m) => (m.pockets += 2) }),
  stamprelic: i({ id: 'stamprelic', name: 'Печать отдела', desc: 'В начале боя 3 фишки поля получают печать: +2 урона при сборе.', kind: 'passive', icon: 'item_stamprelic', pool: 'boss', apply: (m) => (m.sealStart += 3) }),
  vault: i({ id: 'vault', name: 'Сейф директора', desc: '+10% урона за каждые 50 монет в кошельке.', kind: 'passive', icon: 'item_vault', pool: 'boss', apply: (m) => (m.coinBonus += 0.1) }),
  hotkey: i({ id: 'hotkey', name: 'Горячая клавиша', desc: 'Навык стоит на треть меньше энергии; удар хода после навыка +50%.', kind: 'passive', icon: 'item_hotkey', pool: 'boss', skillCost: 2 / 3, apply: (m) => (m.skillBonus += 0.5) }),
  steeldoor: i({ id: 'steeldoor', name: 'Бронедверь', desc: 'После действия врагов половина брони остаётся.', kind: 'passive', icon: 'item_steeldoor', pool: 'boss', apply: (m) => (m.armorKeep = 0.5) }),
  // The ring gives every row a second chance at the edge: too strong for a rare (+36 points to wins).
  ring: i({ id: 'ring', unlock: 'bundle_relics', name: 'Кольцевая скоба', desc: 'Левый и правый края поля соединены: строки и обмены идут через край.', kind: 'passive', icon: 'item_ring', pool: 'boss', apply: (m) => (m.wrap = true) }),
  foldtable: i({ id: 'foldtable', name: 'Раскладной стол', desc: 'Поле больше на строку и столбец.', kind: 'passive', icon: 'item_foldtable', pool: 'boss', apply: (m) => ((m.boardW += 1), (m.boardH += 1)) }),
  closet: i({ id: 'closet', name: 'Тесная каморка', desc: 'Поле уже на столбец, зато урон +100%.', kind: 'passive', icon: 'item_closet', pool: 'boss', apply: (m) => ((m.boardW -= 1), (m.dmgBonus += 1)) }),
  prismpact: i({ id: 'prismpact', name: 'Радужная скрепка', desc: 'Первая группа из 4 за ход создаёт призму вместо ракеты.', kind: 'passive', icon: 'item_pact', pool: 'boss', apply: (m) => (m.prismOn4 = true) }),

  // ── Weapons (red tiles strike with the one in hand; a red group of 4+ is its super strike) ──
  knife: w('knife', 'Канцелярский нож', 'starter', 'card_knife', {
    tile: 2,
    strike: { paper: 1 },
    super: { allPerTile: 2 },
    strikeText: '2 урона за фишку. По бумажным врагам +100%.',
    superText: 'Длинный разрез: ещё 2 урона за фишку каждому врагу.',
  }),
  staplegun: w('staplegun', 'Строительный степлер', 'common', 'card_stapler', {
    tile: 2,
    strike: { delay: 1 },
    super: { stun: true },
    strikeText: '2 урона за фишку. Скобы: таймер цели +1 (раз за ход).',
    superText: 'Скрепить намертво: цель пропускает действие.',
  }),
  scissors: w('scissors', 'Ножницы', 'uncommon', 'card_scissors', {
    tile: 2,
    strike: { bleed: 1 },
    super: { bleed: 3 },
    strikeText: '2 урона за фишку. Цель кровоточит: 1 (растёт с отделом).',
    superText: 'Двойное лезвие: ещё 3 кровотечения.',
  }),
  punch: w('punch', 'Дырокол', 'uncommon', 'card_punch', {
    tile: 2,
    strike: { pierce: true },
    super: { stun: true },
    strikeText: '2 урона за фишку. Удар пробивает броню и щит.',
    superText: 'Сквозная дыра: цель пропускает действие.',
  }),
  ruler: w('ruler', 'Линейка', 'uncommon', 'card_ruler', {
    tile: 2,
    strike: { allPerTile: 3 },
    super: { allPerTile: 3 },
    strikeText: 'Бьёт всех: 2 урона за фишку цели и ещё 3 — каждому врагу.',
    superText: 'Плашмя по всем: ещё 3 за фишку каждому врагу.',
  }),
  sharpener: w('sharpener', 'Точилка', 'uncommon', 'card_sharpener', {
    tile: 2,
    strike: { cascadeTile: 6 },
    super: { perTile: 3 },
    strikeText: '2 урона за фишку, а в каскаде — 6.',
    superText: 'Стружка: ещё 3 за фишку.',
  }),
  awl: w('awl', 'Шило', 'rare', 'card_awl', {
    tile: 4,
    tileAct: 2,
    strike: { pierce: true },
    super: { perTile: 4 },
    strikeText: '4 урона за фишку (+2 с каждым отделом), насквозь через броню и щит.',
    superText: 'Прокол: ещё 4 за фишку.',
  }, 'bundle_paper'),
  cutter: w('cutter', 'Резак', 'rare', 'card_cutter', {
    tile: 2,
    strike: { paper: 2 },
    super: { hpPct: 0.1 },
    strikeText: '2 урона за фишку. По бумажным врагам +200%.',
    superText: 'Гильотина: цель теряет 10% максимума здоровья.',
  }, 'bundle_paper'),

  // ── Active skills (charged by energy from violet tiles) ────────────────────────────────
  eraser: i({ id: 'eraser', name: 'Ластик', desc: 'Убирает выбранную фишку, сверху падает новая. Время не тратит; сложившиеся ряды сгорают впустую.', kind: 'active', icon: 'item_eraser', pool: 'shop', charge: 3, aim: 'cell' }),
  stapler: i({ id: 'stapler', name: 'Степлер', desc: 'Выбранный враг пропускает следующее действие.', kind: 'active', icon: 'item_stapler', pool: 'uncommon', charge: 6, aim: 'enemy' }),
  coffeeToGo: i({ id: 'coffeeToGo', name: 'Кофе с собой', desc: 'Следующие 2 хода враги не тикают.', kind: 'active', icon: 'item_coffeeToGo', pool: 'uncommon', charge: 6 }),
  corrector: i({ id: 'corrector', name: 'Корректор', desc: 'Снимает с поля кляксы, волокиту, скобы, угольки и цензуру. Сложившиеся ряды сгорают впустую.', kind: 'active', icon: 'item_corrector', pool: 'common', charge: 5 }),
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
  coffee: { id: 'coffee', name: 'Кофе', desc: 'Лечит 1 сердце.', icon: 'pocket_coffee', price: 30 },
  eraser: { id: 'eraser', name: 'Ластик', desc: 'Убирает выбранную фишку. Время не тратит; сложившиеся ряды сгорают впустую.', icon: 'pocket_eraser', price: 25, aim: 'cell' },
  sticker: { id: 'sticker', name: 'Стикер «Срочно»', desc: 'Таймеры всех врагов +2.', icon: 'pocket_sticker', price: 35 },
  energy: { id: 'energy', name: 'Энергетик', desc: 'Следующий ход: урон +100%.', icon: 'pocket_energy', price: 30 },
};

export function computeMods(relics: readonly string[]): Mods {
  const m = baseMods();
  for (const id of relics) ITEMS[id]?.apply?.(m);
  return m;
}

export const RELIC_PRICE: Record<Pool, number> = { starter: 0, common: 100, uncommon: 135, rare: 190, boss: 250, shop: 110 };

/** Passive relics that can drop (actives come from their own pools). */
export function relicPool(unlocked: readonly string[], exclude: readonly string[]): string[] {
  return Object.values(ITEMS)
    .filter((d) => d.pool !== 'starter' && d.kind !== 'active' && (!d.unlock || unlocked.includes(d.unlock)) && !exclude.includes(d.id))
    .map((d) => d.id);
}

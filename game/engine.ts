// Pure deterministic game state. Rendering only replays the returned frames.
export type Family = 'blade' | 'shield' | 'spark' | 'focus';
export type Variant = 'venom' | 'bomb' | 'spiked' | 'marked' | null;
export type Tile = {
  id: number;
  family: Family;
  variant: Variant;
  ink?: true;
  root?: { owner: number; expires: number };
};
export type Enemy = {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  poison: number;
  kind: EnemyKind;
  damage: number;
};
export const NEW_ENEMY_KINDS = [
  'paper-rat',
  'stapler',
  'moth',
  'eraser',
  'bell',
  'ink-slime',
  'librarian',
  'candle',
  'mirror',
  'safe',
] as const;
export const ARCHIVE_ENEMY_KINDS = [
  'reed-crab',
  'ink-eel',
  'leech',
  'ink-scribe',
  'anchor',
  'lantern-fish',
] as const;
export const TOTAL_ROOMS = 20;
export const BIOMES = [
  { id: 'cellar', name: 'Подвал', firstRoom: 1, lastRoom: 10 },
  { id: 'archive', name: 'Затопленный архив', firstRoom: 11, lastRoom: 20 },
] as const;
export const biomeAt = (depth: number) => BIOMES[depth > 10 ? 1 : 0];
export type EnemyKind =
  | (typeof NEW_ENEMY_KINDS)[number]
  | (typeof ARCHIVE_ENEMY_KINDS)[number]
  | 'tide-keeper'
  | 'redactor'
  | 'censor'
  | 'raider'
  | 'armored'
  | 'cultist'
  | 'poisoner'
  | 'rooter'
  | 'boss';
export const ENEMY_CATALOG: Record<
  EnemyKind,
  { name: string; hp: number; damage: number; tactic: string }
> = {
  redactor: {
    name: 'Редактор',
    hp: 120,
    damage: 8,
    tactic:
      'Ставит запрет на одно семейство на 2 хода, затем удар 8 и удар 14. Группа запрещённого семейства даёт ему 6 блока перед её эффектом. Правка снимает запрет. При половине здоровья удары сильнее на 2.',
  },
  'reed-crab': {
    name: 'Картотечный краб',
    hp: 28,
    damage: 7,
    tactic: 'Закрывает ящики на 8 блока, затем хватает клешнёй.',
  },
  'ink-eel': {
    name: 'Чернильный угорь',
    hp: 24,
    damage: 5,
    tactic: 'Первый удар и каждый второй после него проходят сквозь защиту.',
  },
  leech: {
    name: 'Буквоед',
    hp: 25,
    damage: 6,
    tactic: 'Крадёт до 2 фокуса и лечится на столько же, затем кусает.',
  },
  'ink-scribe': {
    name: 'Мокрый писарь',
    hp: 28,
    damage: 6,
    tactic:
      'Чередует 3 кляксы и удар. Собранная клякса ранит на 1. Матч фокуса смывает все кляксы.',
  },
  anchor: {
    name: 'Якорный смотритель',
    hp: 34,
    damage: 7,
    tactic: 'Готовит удар на 12, бьёт, затем набирает 6 блока.',
  },
  'lantern-fish': {
    name: 'Фонарный удильщик',
    hp: 28,
    damage: 6,
    tactic: 'Два хода атакует, на третий восстанавливает до 6 здоровья.',
  },
  'tide-keeper': {
    name: 'Хранитель прилива',
    hp: 108,
    damage: 7,
    tactic:
      'Кляксы, подготовка, тяжёлый удар. При половине здоровья прилив усиливается до 6, удар — до 16.',
  },
  raider: {
    name: 'Костяной налётчик',
    hp: 18,
    damage: 6,
    tactic: 'Атакует каждый ход.',
  },
  armored: {
    name: 'Латный страж',
    hp: 22,
    damage: 8,
    tactic: 'Чередует защиту и атаку.',
  },
  cultist: {
    name: 'Служитель праха',
    hp: 14,
    damage: 4,
    tactic: 'Атакует каждый ход.',
  },
  poisoner: {
    name: 'Отравитель',
    hp: 18,
    damage: 3,
    tactic: 'Чередует удар и яд.',
  },
  rooter: {
    name: 'Корневик',
    hp: 18,
    damage: 5,
    tactic: 'Связывает фишки, затем атакует.',
  },
  boss: {
    name: 'Привратник',
    hp: 70,
    damage: 6,
    tactic: 'Готовит сильный удар раз в три хода.',
  },
  'paper-rat': {
    name: 'Бумажная крыса',
    hp: 18,
    damage: 4,
    tactic: 'Чередует укус и более сильный наскок.',
  },
  stapler: {
    name: 'Скобогрыз',
    hp: 22,
    damage: 8,
    tactic: 'Смыкает панцирь на 6 блока, затем кусает.',
  },
  moth: {
    name: 'Книжная моль',
    hp: 18,
    damage: 5,
    tactic: 'Похищает 2 энергии, затем атакует.',
  },
  eraser: {
    name: 'Ластик-вышибала',
    hp: 24,
    damage: 5,
    tactic: 'Готовит удар на 9, затем наносит обычный удар.',
  },
  bell: {
    name: 'Гулкий звонарь',
    hp: 22,
    damage: 5,
    tactic: 'Раскачивается один ход, затем бьёт на 11.',
  },
  'ink-slime': {
    name: 'Чернильная жижа',
    hp: 22,
    damage: 4,
    tactic: 'Чередует удар и 2 яда сквозь защиту.',
  },
  librarian: {
    name: 'Слепой архивариус',
    hp: 24,
    damage: 5,
    tactic: 'Связывает 2 фишки. Собери их до следующего ответа.',
  },
  candle: {
    name: 'Огарок',
    hp: 26,
    damage: 6,
    tactic: 'После двух атак восстанавливает 4 здоровья.',
  },
  mirror: {
    name: 'Кривое зеркало',
    hp: 22,
    damage: 6,
    tactic: 'Набирает 5 блока, затем бьёт сквозь защиту.',
  },
  safe: {
    name: 'Сейф-страж',
    hp: 30,
    damage: 8,
    tactic: 'Набирает 10 блока, затем дважды атакует.',
  },
  censor: {
    name: 'Главный цензор',
    hp: 78,
    damage: 6,
    tactic:
      'Две фазы. При половине здоровья и ниже связывает фишки и усиливает тяжёлую печать.',
  },
};
export function bossPhase(e: Enemy): 1 | 2 {
  return ['censor', 'tide-keeper', 'redactor'].includes(e.kind) &&
    e.hp <= e.maxHp / 2
    ? 2
    : 1;
}
export type EnemyIntent = {
  type:
    | 'attack'
    | 'block'
    | 'roots'
    | 'poison'
    | 'prepare'
    | 'drain'
    | 'heal'
    | 'pierce'
    | 'ink'
    | 'siphon'
    | 'redact';
  value: number;
  text: string;
  family?: Family;
};
export type Balance = {
  health: number;
  blade: number;
  shield: number;
  enemyPower: number;
  animation: number;
};
export type Phase =
  | 'battle'
  | 'reward'
  | 'map'
  | 'shop'
  | 'rest'
  | 'event'
  | 'trial'
  | 'victory'
  | 'defeat';
export type Room = {
  id: string;
  kind:
    | 'battle'
    | 'elite'
    | 'event'
    | 'trial'
    | 'shop'
    | 'rest'
    | 'boss'
    | 'treasure';
  name: string;
  description: string;
  roster?: EnemyKind[];
  next?: string[];
};
export type Offer = {
  id: string;
  kind:
    | 'relic'
    | 'modifier'
    | 'skill'
    | 'upgrade'
    | 'potion'
    | 'equipment'
    | 'seal';
  name: string;
  description: string;
  tag: string;
  cost?: number;
  quality?: 0 | 1 | 2;
  baseCost?: number;
  discount?: number;
};
export const EQUIPMENT_SLOTS = [
  'weapon',
  'helmet',
  'clothing',
  'trousers',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type Equipment = Record<EquipmentSlot, string | null>;
export const EQUIPMENT_SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: 'Ближний бой',
  helmet: 'Шлем',
  clothing: 'Одежда',
  trousers: 'Штаны',
};
export const EQUIPMENT_TIERS = ['Простое', 'Добротное', 'Редкое'] as const;
export type EquipmentItem = Offer & {
  kind: 'equipment';
  slot: EquipmentSlot;
  tier: 0 | 1 | 2;
  bonus: number;
  icon: number;
};
const gear = (
  id: string,
  slot: EquipmentSlot,
  tier: 0 | 1 | 2,
  name: string,
  bonus: number,
): EquipmentItem => ({
  id,
  kind: 'equipment',
  slot,
  tier,
  name,
  bonus,
  icon: tier * 4 + EQUIPMENT_SLOTS.indexOf(slot),
  tag: EQUIPMENT_TIERS[tier],
  description:
    bonus === 0
      ? 'Простая вещь для первого спуска. Без бонусов.'
      : {
          weapon: `+${bonus} урона за каждую комбинацию клинков.`,
          helmet: `+${bonus} к максимальному здоровью. При замене здоровье растёт на разницу бонусов.`,
          clothing: `+${bonus} блока за каждую комбинацию щитов.`,
          trousers: `+${bonus} к запасу фокуса.`,
        }[slot],
});
export const EQUIPMENT: EquipmentItem[] = [
  gear('gear-cutter', 'weapon', 0, 'Нож для бумаги', 0),
  gear('gear-tin-helmet', 'helmet', 0, 'Помятый шлем', 4),
  gear('gear-shirt', 'clothing', 0, 'Старая рубашка', 0),
  gear('gear-worn-trousers', 'trousers', 0, 'Потёртые штаны', 0),
  gear('gear-rusty-dagger', 'weapon', 0, 'Ржавый кинжал', 1),
  gear('gear-cleaver', 'weapon', 1, 'Железный тесак', 2),
  gear('gear-axe', 'weapon', 1, 'Боевой топор', 3),
  gear('gear-iron-helmet', 'helmet', 1, 'Железный шлем', 8),
  gear('gear-jacket', 'clothing', 1, 'Кожаная куртка', 2),
  gear('gear-reinforced-trousers', 'trousers', 1, 'Укреплённые штаны', 1),
  gear('gear-rune-sword', 'weapon', 2, 'Рунный меч', 4),
  gear('gear-bronze-helmet', 'helmet', 2, 'Шлем хранителя', 12),
  gear('gear-brigandine', 'clothing', 2, 'Бригантина', 4),
  gear('gear-guard-trousers', 'trousers', 2, 'Штаны стража', 2),
];
export const WEAPONS = EQUIPMENT.filter((item) => item.slot === 'weapon');
export const equipmentById = (id: string | null | undefined) =>
  EQUIPMENT.find((item) => item.id === id);
export const startingEquipment = (): Equipment => ({
  weapon: 'gear-cutter',
  helmet: null,
  clothing: 'gear-shirt',
  trousers: 'gear-worn-trousers',
});
export function equipmentBonus(s: State, slot: EquipmentSlot) {
  if (slot === 'weapon' && (s.rulesVersion ?? 0) >= 2)
    return s.weaponQuality ?? 0;
  return equipmentById(s.equipment[slot])?.bonus ?? 0;
}
export function equipmentSummary(item: EquipmentItem | undefined) {
  if (!item) return 'Без шлема';
  if (item.slot === 'weapon' && item.quality !== undefined)
    return `Качество ${item.quality}/2 · ${WEAPON_RULES[item.id].short}`;
  if (!item.bonus) return 'Без бонусов';
  return {
    weapon: `+${item.bonus} урона клинками`,
    helmet: `+${item.bonus} здоровья`,
    clothing: `+${item.bonus} блока щитами`,
    trousers: `+${item.bonus} к запасу фокуса`,
  }[item.slot];
}
export const WEAPON_RULES: Record<
  string,
  { short: string; description: string }
> = {
  'gear-cutter': {
    short: 'До 2 урона сквозь блок',
    description:
      'Наносит D урона. До 2 урона каждого попадания проходит сквозь блок.',
  },
  'gear-rusty-dagger': {
    short: '−2 урона, +2 яда',
    description:
      'Наносит D−2 урона (минимум 0). Выжившая цель получает 2 яда после попадания.',
  },
  'gear-cleaver': {
    short: 'Делит удар между двумя',
    description:
      'При двух целях треть D (округление вниз) получает следующий живой враг по порядку, остаток — выбранный. При одной цели весь D идёт ей.',
  },
  'gear-axe': {
    short: 'Тройка −2, матч 4+ +4',
    description:
      'Тройка клинков наносит D−2 урона (минимум 0). Группа из 4+ клинков — D+4.',
  },
  'gear-rune-sword': {
    short: '−2 урона, +1 энергия',
    description:
      'Группа наносит D−2 урона (минимум 0) и даёт 1 энергию. Первая группа клинков за ход усиливает следующий атакующий приём за энергию на 2 урона. Один заряд за ход.',
  },
};
export function weaponOffer(id: string, quality: 0 | 1 | 2 = 0): EquipmentItem {
  const base = equipmentById(id);
  if (!base || base.slot !== 'weapon') throw Error('Неизвестное оружие');
  return {
    ...base,
    tier: quality,
    quality,
    bonus: quality,
    tag: `Качество ${quality}/2`,
    description: `${WEAPON_RULES[id].description} D = число клинков × урон фишки + 2 за уровень семейства + ${quality} качества.`,
  };
}
export function equipmentForRun(
  s: State,
  id: string | null | undefined,
  quality?: 0 | 1 | 2,
) {
  const item = equipmentById(id);
  if (item?.slot !== 'weapon' || (s.rulesVersion ?? 0) < 2) return item;
  return weaponOffer(
    item.id,
    quality ?? (id === s.equipment.weapon ? (s.weaponQuality ?? 0) : 0),
  );
}
export function itemRequirement(s: State, id: string): string | undefined {
  if ((s.rulesVersion ?? 0) < 3) return;
  if (
    ['lens', 'vessel'].includes(id) &&
    !s.skills.some((id) => ['blood', 'seal'].includes(id))
  )
    return 'Нужен приём с ценой в здоровье.';
  if (
    ['toxin', 'heart', 'bookmark'].includes(id) &&
    s.equipment.weapon !== 'gear-rusty-dagger' &&
    !s.modifiers.includes('venom')
  )
    return 'Нужен источник яда: ржавый кинжал или ядовитые клинки.';
  if (id === 'conductor' && !s.modifiers.includes('bomb'))
    return 'Нужна пороховая искра — модификатор с бомбами.';
  if (id === 'return' && !s.skills.includes('bolt'))
    return 'Нужен приём за 6 энергии: Разряд.';
}
export function offerForRun(s: State, offer: Offer): Offer {
  if ((s.rulesVersion ?? 0) < 3 || !['skill', 'relic'].includes(offer.kind))
    return offer;
  // Temporary battle charges do not carry into the next room; permanent seal
  // costs and the current equipment/relic dependencies do affect this choice.
  const item = itemForRun({ ...s, flags: [] }, offer.id);
  return item ? { ...offer, description: item.description } : offer;
}
export function itemForRun(s: State, id: string): Offer | undefined {
  const gear = equipmentForRun(s, id);
  if (gear) return gear;
  let item = itemById(id);
  if ((s.rulesVersion ?? 0) >= 4 && item) {
    if (id === 'thorns')
      item = {
        ...item,
        description:
          'После каждого удара врага возвращает ему половину поглощённого этим ударом блока (вниз). Яд, корни и прилив не отражаются.',
      };
    if (id === 'vessel')
      item = {
        ...item,
        description:
          'После первой жертвы здоровьем за ход следующая группа клинков в этом же ходу даёт 4 блока.',
      };
  }
  const requirement = itemRequirement(s, id);
  if (item && requirement)
    return { ...item, description: `${item.description} ${requirement}` };
  if (
    (s.rulesVersion ?? 0) >= 3 &&
    item &&
    ['bolt', 'pierce', 'blood', 'seal'].includes(id)
  ) {
    const base = { bolt: 12, pierce: 8, blood: 8, seal: 16 }[id]!;
    const lens =
      ['blood', 'seal'].includes(id) && s.relics.includes('lens') ? 4 : 0;
    const rune =
      ['bolt', 'seal'].includes(id) && s.flags.includes('turn:rune-armed')
        ? 2
        : 0;
    const penalty = hasSeal(s, 'double-edit') ? 3 : 0;
    const cost = {
      bolt: '6 энергии',
      pierce: '3 фокуса',
      blood: '2 здоровья',
      seal: '2 здоровья + 3 энергии',
    }[id];
    return {
      ...item,
      description: `${cost} · ${Math.max(0, base + lens + rune - penalty)} урона${id === 'pierce' ? ' сквозь блок' : ''}.${rune ? ' Рунный заряд +2 учтён.' : ''}${lens ? ' Линза +4 учтена.' : ''}${penalty ? ' Цена Двойной правки −3 учтена.' : ''}`,
    };
  }
  if (
    (s.rulesVersion ?? 0) >= 2 &&
    s.flags.includes('turn:rune-armed') &&
    ['bolt', 'seal'].includes(id) &&
    item
  ) {
    const damage =
      id === 'bolt' ? 14 : 18 + (s.relics.includes('lens') ? 4 : 0);
    return {
      ...item,
      description: `${id === 'bolt' ? '6 энергии' : '2 здоровья + 3 энергии'} · ${damage} урона. Рунный заряд +2 уже учтён; расходуется этим приёмом.`,
    };
  }
  return item;
}
export function sharpeningOffer(s: State): Offer | undefined {
  if ((s.rulesVersion ?? 0) < 2 || (s.weaponQuality ?? 0) >= 2) return;
  return {
    id: 'sharpen',
    kind: 'upgrade',
    name: 'Заточка оружия',
    description: `Качество ${s.weaponQuality ?? 0} → ${(s.weaponQuality ?? 0) + 1}: +1 урона за группу клинков. Тип оружия сохраняется.`,
    tag: 'Текущее оружие',
  };
}
export function restOptions(s: State) {
  const sharpening = sharpeningOffer(s);
  return [...upgradeOptions(s), ...(sharpening ? [sharpening] : [])];
}
export function equipmentOptions(s: State): EquipmentItem[] {
  const maxTier = s.room >= 6 ? 2 : 1;
  if ((s.rulesVersion ?? 0) >= 2) {
    const quality: 0 | 1 | 2 = s.room >= 11 ? 2 : s.room >= 5 ? 1 : 0;
    const weapons = WEAPONS.filter(
      (w) => w.id !== s.equipment.weapon || quality > (s.weaponQuality ?? 0),
    ).map((w) => weaponOffer(w.id, quality));
    const armor = EQUIPMENT_SLOTS.filter((slot) => slot !== 'weapon').flatMap(
      (slot) => {
        const bonus = equipmentBonus(s, slot);
        const next = EQUIPMENT.find(
          (item) =>
            item.slot === slot &&
            item.tier <= maxTier &&
            item.bonus > (s.equipment[slot] ? bonus : -1),
        );
        return next ? [next] : [];
      },
    );
    return [...weapons, ...armor];
  }
  // Classic saves retain the original progression.
  // Keep one next improvement per slot, including stronger weapons of the same quality.
  return EQUIPMENT_SLOTS.flatMap((slot) => {
    const bonus = equipmentById(s.equipment[slot])?.bonus ?? -1;
    const next = EQUIPMENT.filter(
      (item) =>
        item.slot === slot && item.bonus > bonus && item.tier <= maxTier,
    ).sort((a, b) => a.bonus - b.bonus)[0];
    return next ? [next] : [];
  });
}
export function isEquipment(value: unknown): value is Equipment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const equipment = value as Equipment;
  return (
    Object.keys(equipment).length === 4 &&
    EQUIPMENT_SLOTS.every(
      (slot) =>
        (slot === 'helmet' && equipment[slot] === null) ||
        equipmentById(equipment[slot])?.slot === slot,
    )
  );
}
export type Stats = {
  matches: number;
  cascades: number;
  kills: number;
  skills: number;
  damage: number;
  blocked: number;
  big: number;
  sacrifices: number;
  trials: number;
  edits?: number;
  poisonKills?: number;
  shieldGroups?: number;
  focusGroups?: number;
};
export type DamageEvent = {
  source: string;
  amount: number;
  blocked: number;
  room: number;
  round: number;
};
export type HeroId = 'wanderer' | 'warden';
export const HEROES = [
  {
    id: 'wanderer' as const,
    name: 'Странник',
    description:
      '40 здоровья. Начинает каждый бой с 3 энергией. Неиспользованный блок исчезает.',
  },
  {
    id: 'warden' as const,
    name: 'Страж',
    description:
      '48 здоровья. До 4 блока переносится между ходами. Каждый бой начинается без энергии.',
  },
];
export type RunRecord = {
  id: string;
  seed: number;
  outcome: 'victory' | 'defeat' | 'abandoned';
  hero?: HeroId;
  ending?: string;
  difficulty?: 0 | 1;
  modified: boolean;
  rules: number;
  room: number;
  path: string[];
  weapon: string | null;
  relics: string[];
  modifiers: string[];
  seal?: SealId;
  stats: Stats;
  damageEvents: DamageEvent[];
  log: string[];
};
export type State = {
  version: 2;
  rulesVersion?: 2 | 3 | 4;
  hero?: HeroId;
  difficulty?: 0 | 1;
  redaction?: { family: Family; expires: number };
  echo?: Family;
  damageEvents?: DamageEvent[];
  chronicle?: string[];
  weaponQuality?: 0 | 1 | 2;
  streams?: Record<'map' | 'encounters' | 'loot', number>;
  journey?: {
    nodes: (Room & { depth: number; next: string[] })[];
    current: string;
    visited: string[];
  };
  seal?: SealId;
  rewardSource?: 'battle' | 'elite' | 'treasure' | 'seal' | 'event' | 'trial';
  treasureRerolled?: boolean;
  equipment: Equipment;
  seed: number;
  rng: number;
  serial: number;
  runId: string;
  phase: Phase;
  board: Tile[];
  hp: number;
  maxHp: number;
  block: number;
  heroPoison: number;
  tide?: { row: number; turns: number; cleared: boolean };
  energy: number;
  focus: number;
  gold: number;
  round: number;
  room: number;
  roomKind: Room['kind'];
  target: number;
  enemies: Enemy[];
  moved: boolean;
  cast: boolean;
  consumed: boolean;
  relics: string[];
  modifiers: string[];
  skills: string[];
  potions: number;
  upgrades: Record<Family, number>;
  log: string[];
  offers: Offer[];
  path: string[];
  flags: string[];
  balance: Balance;
  modified: boolean;
  stats: Stats;
  trial: {
    remaining: number;
    energy: number;
    damage: number;
    protection: number;
    paused: boolean;
  } | null;
};
export type CombatCue = {
  actor: 'hero' | 'status' | number;
  type: 'attack' | 'cast' | 'guard' | 'heal' | 'poison' | 'roots' | 'prepare';
  target?: 'hero' | number;
};
export type Frame = {
  state: State;
  cells: number[];
  label: string;
  cue?: CombatCue;
};
export type Result = { state: State; frames: Frame[]; error?: string };
export const FAMILIES: Family[] = ['blade', 'shield', 'spark', 'focus'];
export const FAMILY_NAMES: Record<Family, string> = {
  blade: 'Клинок',
  shield: 'Щит',
  spark: 'Искра',
  focus: 'Фокус',
};
export const DEFAULT_BALANCE: Balance = {
  health: 40,
  blade: 2,
  shield: 2,
  enemyPower: 1,
  animation: 260,
};
export const RELICS: Offer[] = [
  {
    id: 'thorns',
    kind: 'relic',
    name: 'Шипованный обод',
    description:
      'Первый матч щитов за ход наносит урон, равный половине полученного блока.',
    tag: 'Блок → урон',
  },
  {
    id: 'coil',
    kind: 'relic',
    name: 'Медная катушка',
    description:
      'Первый матч щитов даёт 1 энергию за каждые 3 блока. Не больше 4 за ход.',
    tag: 'Блок → энергия',
  },
  {
    id: 'return',
    kind: 'relic',
    name: 'Обратная тяга',
    description:
      'Потрать 6 энергии на приём: следующий матч щитов в этом ходу даёт ещё 3 блока.',
    tag: 'Энергия → блок',
  },
  {
    id: 'toxin',
    kind: 'relic',
    name: 'Токсичный амулет',
    description:
      'Первый прямой удар по отравленной цели за ход добавляет 2 яда.',
    tag: 'Яд',
  },
  {
    id: 'heart',
    kind: 'relic',
    name: 'Грибное сердце',
    description:
      'Первое убийство отравленного врага в бою восстанавливает 3 здоровья.',
    tag: 'Яд → лечение',
  },
  {
    id: 'prism',
    kind: 'relic',
    name: 'Стеклянная призма',
    description: 'Первый каскад после ручного сдвига даёт 2 энергии.',
    tag: 'Каскады',
  },
  {
    id: 'conductor',
    kind: 'relic',
    name: 'Проводник',
    description:
      'За каждые 2 разрушенные бомбой фишки — 1 энергия. Не больше 3 за ход.',
    tag: 'Разрушение',
  },
  {
    id: 'order',
    kind: 'relic',
    name: 'Камень порядка',
    description: 'Правка поля дополнительно даёт 3 блока.',
    tag: 'Контроль → блок',
  },
  {
    id: 'lens',
    kind: 'relic',
    name: 'Алая линза',
    description: 'Приёмы с ценой в здоровье наносят на 4 урона больше.',
    tag: 'Жертва',
  },
  {
    id: 'vessel',
    kind: 'relic',
    name: 'Кровяной сосуд',
    description:
      'После первой жертвы в бою следующий матч клинков даёт 4 блока.',
    tag: 'Жертва → блок',
  },
  {
    id: 'lamp',
    kind: 'relic',
    name: 'Переполненная лампа',
    description: 'Первое переполнение энергии за ход наносит 4 урона.',
    tag: 'Переполнение',
  },
  {
    id: 'thread',
    kind: 'relic',
    name: 'Ритуальная нить',
    description: 'Первый матч из 5+ фишек в бою восстанавливает 3 здоровья.',
    tag: 'Большие матчи',
  },
];
RELICS.push(
  {
    id: 'carbon',
    kind: 'relic',
    name: 'Копирка',
    description:
      'После правки следующая группа клинков в этом ходу наносит на 3 урона больше. Один раз за ход.',
    tag: 'Правка → урон',
  },
  {
    id: 'bookmark',
    kind: 'relic',
    name: 'Заразная закладка',
    description:
      'Убитый отравленный враг передаёт следующему живому половину оставшегося яда (вниз). Переданный яд не срабатывает в тот же ответ врагов.',
    tag: 'Яд → новая цель',
  },
);
RELICS.push(
  {
    id: 'tape',
    kind: 'relic',
    name: 'Копировальная лента',
    description:
      'Первый матч 4+ после сдвига записывает семейство. При следующем сдвиге с другим семейством даёт эхо: клинок — 4 урона, щит — 4 блока, искра — 2 энергии, фокус — 2 фокуса. Одно эхо; каскады и правки не записываются. Заряд исчезает между комнатами.',
    tag: 'Чередование',
  },
  {
    id: 'binding',
    kind: 'relic',
    name: 'Боевой переплёт',
    description:
      'Открывает приём: потратить до 8 накопленного блока, нанести вдвое больше урона выбранному врагу. Занимает единственный приём этого хода. Без затрат энергии.',
    tag: 'Защита → удар',
  },
);
export const CORE_RELIC_IDS = RELICS.slice(0, 12).map((o) => o.id);
function relicPoolFor(s: State) {
  return RELICS.filter(
    (o) =>
      CORE_RELIC_IDS.includes(o.id) ||
      ((s.rulesVersion ?? 0) >= 4 && s.flags.includes(`run:available:${o.id}`)),
  );
}
function modifierPoolFor(s: State) {
  return MODIFIERS.filter(
    (o) =>
      ['venom', 'bomb'].includes(o.id) ||
      ((s.rulesVersion ?? 0) >= 4 && s.flags.includes(`run:available:${o.id}`)),
  );
}
export const MODIFIERS: Offer[] = [
  {
    id: 'venom',
    kind: 'modifier',
    name: 'Ядовитые клинки',
    description:
      'Четверть новых клинков накладывает 1 яд. Они собираются с обычными клинками.',
    tag: 'Меняет поле',
  },
  {
    id: 'bomb',
    kind: 'modifier',
    name: 'Пороховая искра',
    description:
      'Четверть новых искр становится бомбами и разрушает соседей. Семейство — Искра.',
    tag: 'Меняет поле',
  },
];
MODIFIERS.push(
  {
    id: 'spiked',
    kind: 'modifier',
    name: 'Колючие щиты',
    description:
      'Четверть новых щитов с шипом. Каждый собранный щит с шипом наносит 1 урона выбранной цели.',
    tag: 'Щиты → урон',
  },
  {
    id: 'marked',
    kind: 'modifier',
    name: 'Защитная помета',
    description:
      'Четверть нового фокуса с пометой. Матч с пометой даёт 3 блока один раз за ход.',
    tag: 'Фокус → блок',
  },
);
export const SKILLS: Offer[] = [
  {
    id: 'bolt',
    kind: 'skill',
    name: 'Разряд',
    description: '6 энергии · 12 урона выбранному врагу.',
    tag: '6 энергии',
  },
  {
    id: 'guard',
    kind: 'skill',
    name: 'Стойка',
    description: '4 энергии · 8 блока.',
    tag: '4 энергии',
  },
  {
    id: 'pierce',
    kind: 'skill',
    name: 'Точный удар',
    description: '3 фокуса · 8 урона сквозь блок.',
    tag: '3 фокуса',
  },
  {
    id: 'blood',
    kind: 'skill',
    name: 'Кровавый выпад',
    description: '2 здоровья · 8 урона. Самоповреждение игнорирует блок.',
    tag: '2 здоровья',
  },
  {
    id: 'seal',
    kind: 'skill',
    name: 'Кровавая печать',
    description: '2 здоровья + 3 энергии · 16 урона.',
    tag: 'Жертва + энергия',
  },
  {
    id: 'reshape',
    kind: 'skill',
    name: 'Перекройка',
    description: '6 фокуса · превратить 3 клетки выбранной строки в клинки.',
    tag: '6 фокуса',
  },
];
export const SEALS: Offer[] = [
  {
    id: 'red-line',
    kind: 'seal',
    name: 'Красная строка',
    tag: 'Сила за здоровье',
    description:
      '+4 урона каждой группе клинков. Цена: −8 максимального здоровья до конца спуска.',
  },
  {
    id: 'enduring-record',
    kind: 'seal',
    name: 'Несгораемая запись',
    tag: 'Запас защиты',
    description:
      'До 6 неиспользованного блока переносится в следующий ход. Цена: каждая группа щитов даёт на 2 блока меньше (минимум 0).',
  },
  {
    id: 'double-edit',
    kind: 'seal',
    name: 'Двойная правка',
    tag: 'Две клетки за 3 фокуса',
    description:
      'Правка меняет две разные клетки на одно выбранное семейство за 3 фокуса. Цена: атакующие приёмы наносят на 3 урона меньше (минимум 0).',
  },
];
export type SealId = 'red-line' | 'enduring-record' | 'double-edit';
export const hasSeal = (s: State, id: SealId) =>
  (s.rulesVersion ?? 0) >= 3 && s.seal === id;
export function sealConsequences(s: State, id: string) {
  if (id === 'red-line') {
    const max = s.maxHp - 8;
    return max > 0
      ? `Здоровье после печати и передышки: ${Math.min(max, Math.min(s.hp, max) + Math.ceil(max / 2))}/${max}. Каждая группа клинков: +4 урона, включая каскады.`
      : 'Нужно больше 8 максимального здоровья. Эту печать принять нельзя.';
  }
  if (id === 'enduring-record')
    return `Тройка щитов без временных бонусов: ${Math.max(0, 3 * s.balance.shield + 2 * s.upgrades.shield + equipmentBonus(s, 'clothing') - 2)} блока. Остаток после ответа врагов: до 6 на следующий ход; между комнатами не сохраняется.`;
  const changed = { ...s, seal: 'double-edit' as const };
  const skills = s.skills
    .filter((id) => ['bolt', 'pierce', 'blood', 'seal'].includes(id))
    .map(
      (id) => `${itemById(id)?.name}: ${itemForRun(changed, id)?.description}`,
    )
    .join(' ');
  return `Выбери семейство и две разные клетки. Замены и совпадения сработают вместе, только после второго выбора. Один приём за ход. Твои атакующие приёмы после печати: ${skills || 'пока не экипированы'}`;
}
export const itemById = (id: string) =>
  [...RELICS, ...MODIFIERS, ...SKILLS, ...EQUIPMENT, ...SEALS].find(
    (x) => x.id === id,
  );
export const copy = <T>(s: T): T => JSON.parse(JSON.stringify(s));
// Mulberry32, adapted from Max's match3-engine/src/engine/rng.ts.
export function random(
  s: State,
  stream: 'board' | 'map' | 'encounters' | 'loot' = 'board',
): number {
  // Legacy runs retain their single sequence byte for byte.
  let t =
    (s.rulesVersion ?? 0) >= 3 && stream !== 'board'
      ? (s.streams![stream] = (s.streams![stream] + 0x6d2b79f5) >>> 0)
      : (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function note(s: State, message: string) {
  s.log = [message, ...s.log].slice(0, 8);
  if ((s.rulesVersion ?? 0) >= 4)
    s.chronicle = [message, ...(s.chronicle ?? [])].slice(0, 80);
}
function once(s: State, key: string) {
  if (s.flags.includes(key)) return false;
  s.flags.push(key);
  return true;
}
function tile(s: State, family?: Family): Tile {
  const f = family ?? FAMILIES[Math.floor(random(s) * 4)];
  let variant: Variant = null;
  if (f === 'blade' && s.modifiers.includes('venom') && random(s) < 0.25)
    variant = 'venom';
  if (f === 'spark' && s.modifiers.includes('bomb') && random(s) < 0.25)
    variant = 'bomb';
  if ((s.rulesVersion ?? 0) >= 4) {
    if (f === 'shield' && s.modifiers.includes('spiked') && random(s) < 0.25)
      variant = 'spiked';
    if (f === 'focus' && s.modifiers.includes('marked') && random(s) < 0.25)
      variant = 'marked';
  }
  return { id: ++s.serial, family: f, variant };
}
export function groups(board: Tile[]): number[][] {
  const runs: number[][] = [];
  for (const axis of ['row', 'col'])
    for (let line = 0; line < 6; line++) {
      let start = 0;
      const idx = (n: number) => (axis === 'row' ? line * 6 + n : n * 6 + line);
      while (start < 6) {
        let end = start + 1;
        while (end < 6 && board[idx(end)].family === board[idx(start)].family)
          end++;
        if (end - start >= 3)
          runs.push(
            Array.from({ length: end - start }, (_, j) => idx(start + j)),
          );
        start = end;
      }
    }
  const merged: number[][] = [];
  for (const run of runs) {
    const combined = new Set(run);
    let touched = true;
    while (touched) {
      touched = false;
      for (let i = merged.length - 1; i >= 0; i--)
        if (merged[i].some((x) => combined.has(x))) {
          merged[i].forEach((x) => combined.add(x));
          merged.splice(i, 1);
          touched = true;
        }
    }
    merged.push([...combined]);
  }
  return merged;
}
export function shifted(
  board: Tile[],
  axis: 'row' | 'col',
  line: number,
  amount: number,
): Tile[] {
  const out = board.slice();
  for (let n = 0; n < 6; n++) {
    const dest = (((n + amount) % 6) + 6) % 6;
    out[axis === 'row' ? line * 6 + dest : dest * 6 + line] =
      board[axis === 'row' ? line * 6 + n : n * 6 + line];
  }
  return out;
}
export function validMoves(board: Tile[]) {
  const moves: {
    axis: 'row' | 'col';
    line: number;
    amount: number;
    cells: number[];
  }[] = [];
  for (const axis of ['row', 'col'] as const)
    for (let line = 0; line < 6; line++)
      for (let amount = 1; amount <= 5; amount++) {
        const cells = groups(shifted(board, axis, line, amount)).flat();
        if (cells.length) moves.push({ axis, line, amount, cells });
      }
  return moves;
}
function newBoard(s: State) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const b: Tile[] = [];
    for (let i = 0; i < 36; i++) {
      const options = FAMILIES.filter(
        (f) =>
          !(i % 6 >= 2 && b[i - 1].family === f && b[i - 2].family === f) &&
          !(i >= 12 && b[i - 6].family === f && b[i - 12].family === f),
      );
      b.push(tile(s, options[Math.floor(random(s) * options.length)]));
    }
    const moves = validMoves(b);
    if (
      moves.length >= 3 &&
      moves.some((m) =>
        m.cells.some((i) =>
          ['blade', 'spark'].includes(
            shifted(b, m.axis, m.line, m.amount)[i].family,
          ),
        ),
      )
    ) {
      s.board = b;
      return;
    }
  }
  throw Error('Не удалось создать поле');
}
export function energyMax(s: State) {
  return s.upgrades.spark >= 1 ? 15 : 12;
}
export function focusMax(s: State) {
  return (s.upgrades.focus >= 1 ? 9 : 6) + equipmentBonus(s, 'trousers');
}
function heal(s: State, value: number) {
  const actual = Math.min(value, s.maxHp - s.hp);
  s.hp += actual;
  if (actual) note(s, `Восстановлено ${actual} здоровья`);
}
function hit(
  s: State,
  value: number,
  piercing: boolean | number = false,
  direct = true,
  targetId?: number,
) {
  if (s.phase === 'trial' && s.trial) {
    s.trial.damage += value;
    return;
  }
  const e =
    targetId !== undefined
      ? s.enemies.find((e) => e.id === targetId && e.hp > 0)
      : (s.enemies.find((e) => e.id === s.target && e.hp > 0) ??
        s.enemies.find((e) => e.hp > 0));
  if (!e) return;
  if (
    direct &&
    e.poison > 0 &&
    s.relics.includes('toxin') &&
    once(s, 'turn:toxin')
  )
    e.poison += 2;
  const bypass =
    typeof piercing === 'number'
      ? Math.min(value, piercing)
      : piercing
        ? value
        : 0;
  const absorb = Math.min(Math.max(0, value - bypass), e.block);
  e.block -= absorb;
  const damage = Math.min(e.hp, value - absorb);
  e.hp -= damage;
  s.stats.damage += damage;
  if (e.hp <= 0) {
    s.stats.kills++;
    spreadPoison(s, e);
    if (e.poison > 0 && s.relics.includes('heart') && once(s, 'battle:heart'))
      heal(s, 3);
  }
}
function spreadPoison(s: State, dead: Enemy) {
  if ((s.rulesVersion ?? 0) < 4 || !s.relics.includes('bookmark')) return;
  const target = s.enemies.find((e) => e.hp > 0 && e.id !== dead.id);
  const value = Math.floor(dead.poison / 2);
  if (target && value) {
    target.poison += value;
    note(s, `Закладка: ${value} яда → ${target.name}`);
  }
}
function weaponAttack(s: State, count: number, venom: number) {
  const id = s.equipment.weapon ?? 'gear-cutter';
  const base =
    count * s.balance.blade +
    s.upgrades.blade * 2 +
    equipmentBonus(s, 'weapon');
  const first =
    s.enemies.find((e) => e.id === s.target && e.hp > 0) ??
    s.enemies.find((e) => e.hp > 0);
  const second = s.enemies.find((e) => e.hp > 0 && e.id !== first?.id);
  let value = base;
  if (['gear-rusty-dagger', 'gear-rune-sword'].includes(id))
    value = Math.max(0, base - 2);
  if (id === 'gear-axe') value = Math.max(0, base + (count >= 4 ? 4 : -2));
  if (hasSeal(s, 'red-line')) value += 4;
  if ((s.rulesVersion ?? 0) >= 4 && s.flags.includes('turn:carbon-armed')) {
    value += 3;
    s.flags = s.flags.filter((f) => f !== 'turn:carbon-armed');
    note(s, 'Копирка: +3 урона группе клинков.');
  }
  const splash = id === 'gear-cleaver' && second ? Math.floor(value / 3) : 0;
  const strikes = [
    { target: first, value: value - splash },
    ...(splash ? [{ target: second, value: splash }] : []),
  ];
  for (const strike of strikes) {
    hit(
      s,
      strike.value,
      id === 'gear-cutter' ? 2 : false,
      true,
      strike.target?.id,
    );
    const addedPoison = venom + (id === 'gear-rusty-dagger' ? 2 : 0);
    if (strike.target && strike.target.hp > 0 && addedPoison)
      strike.target.poison += addedPoison;
  }
  if (id === 'gear-rune-sword') {
    gainEnergy(s, 1);
    if (s.trial) s.trial.energy++;
    if (once(s, 'turn:rune-trigger')) s.flags.push('turn:rune-armed');
  }
  note(
    s,
    `${equipmentById(id)?.name}: ${value} урона${splash ? `, из них ${splash} второй цели` : ''}${id === 'gear-rusty-dagger' ? ', +2 яда выжившей цели' : ''}${id === 'gear-rune-sword' ? ', +1 энергия' : ''}`,
  );
}
function gainEnergy(s: State, amount: number) {
  const overflow = s.energy + amount > energyMax(s);
  s.energy = Math.min(energyMax(s), s.energy + amount);
  if (overflow && s.relics.includes('lamp') && once(s, 'turn:lamp'))
    hit(s, 4, false, false);
}
function poison(s: State, amount: number) {
  const e =
    s.enemies.find((e) => e.id === s.target && e.hp > 0) ??
    s.enemies.find((e) => e.hp > 0);
  if (e) e.poison += amount;
}
function collapse(s: State, removed: Set<number>) {
  const next = s.board.slice();
  for (let col = 0; col < 6; col++) {
    const survivors = Array.from({ length: 6 }, (_, row) => row * 6 + col)
      .filter((i) => !removed.has(i))
      .map((i) => s.board[i]);
    while (survivors.length < 6) survivors.unshift(tile(s));
    for (let row = 0; row < 6; row++) next[row * 6 + col] = survivors[row];
  }
  s.board = next;
}
export function tideDamage(s: State) {
  const base = s.enemies.some(
    (e) => e.kind === 'tide-keeper' && e.hp > 0 && bossPhase(e) === 2,
  )
    ? 6
    : 4;
  return base - (s.flags.includes('run:sluice') ? 2 : 0);
}
function startTide(s: State) {
  // Every fresh warning has at least one legal matching response on this board.
  const rows = [
    ...new Set(
      validMoves(s.board).flatMap((m) => m.cells.map((i) => Math.floor(i / 6))),
    ),
  ].sort((a, b) => a - b);
  s.tide = {
    row: rows[Math.floor(random(s, 'encounters') * rows.length)] ?? 0,
    turns: 3,
    cleared: false,
  };
}
function recordDamage(s: State, source: string, amount: number, blocked = 0) {
  if ((s.rulesVersion ?? 0) < 4 || (!amount && !blocked)) return;
  s.damageEvents = [
    ...(s.damageEvents ?? []),
    { source, amount, blocked, room: s.room, round: s.round },
  ].slice(-20);
}
function hurtHero(
  s: State,
  value: number,
  piercing = false,
  source = 'Опасность поля',
) {
  const blocked = piercing ? 0 : Math.min(s.block, value);
  s.block -= blocked;
  s.stats.blocked += blocked;
  const damage = Math.min(s.hp, value - blocked);
  s.hp -= damage;
  recordDamage(s, source, damage, blocked);
  return damage;
}
function resolve(
  s: State,
  frames: Frame[],
  manual: boolean,
  firstWaveOnly = false,
) {
  let wave = 0;
  while (true) {
    const matches = groups(s.board);
    if (!matches.length) break;
    if (wave++ > 128) throw Error('Цепочка эффектов не завершилась');
    if (wave > 1) {
      s.stats.cascades++;
      if (manual && s.relics.includes('prism') && once(s, 'turn:prism'))
        gainEnergy(s, 2);
    }
    const waveTarget =
      s.enemies.find((e) => e.id === s.target && e.hp > 0)?.id ??
      s.enemies.find((e) => e.hp > 0)?.id;
    const hasBlades = matches.some(
      (indices) => s.board[indices[0]].family === 'blade',
    );
    const hasShields = matches.some(
      (indices) => s.board[indices[0]].family === 'shield',
    );
    const removed = new Set(matches.flat());
    if (
      s.tide &&
      !s.tide.cleared &&
      [...removed].some((i) => Math.floor(i / 6) === s.tide!.row)
    ) {
      s.tide.cleared = true;
      note(s, 'Сток открыт — этот прилив не нанесёт урона.');
    }
    // A focus match cleans the whole wave first, independent of group order.
    if (
      matches.some((indices) => s.board[indices[0]].family === 'focus') &&
      s.board.some((t) => t.ink)
    ) {
      s.board.forEach((t) => delete t.ink);
      note(s, 'Фокус смыл все кляксы.');
    }
    const inkDamage = [...removed].filter((i) => s.board[i].ink).length;
    const collateral = new Set<number>();
    const tapeMove =
      (s.rulesVersion ?? 0) >= 4 &&
      manual &&
      wave === 1 &&
      s.relics.includes('tape');
    const previousEcho = tapeMove ? s.echo : undefined;
    let echoUsed = false;
    for (const indices of matches) {
      s.stats.matches++;
      const family = s.board[indices[0]].family;
      const count = indices.length;
      if ((s.rulesVersion ?? 0) >= 4) {
        if (family === 'shield')
          s.stats.shieldGroups = (s.stats.shieldGroups ?? 0) + 1;
        if (family === 'focus')
          s.stats.focusGroups = (s.stats.focusGroups ?? 0) + 1;
      }
      if ((s.rulesVersion ?? 0) >= 4 && s.redaction?.family === family) {
        const boss = s.enemies.find((e) => e.kind === 'redactor' && e.hp > 0);
        if (boss) {
          boss.block += 6;
          note(
            s,
            `Запрещённое семейство ${FAMILY_NAMES[family]}: Редактор получает 6 блока.`,
          );
        }
      }
      if (previousEcho && !echoUsed && family !== previousEcho) {
        echoUsed = true;
        delete s.echo;
        if (previousEcho === 'blade') hit(s, 4, false, false);
        if (previousEcho === 'shield') {
          s.block += 4;
          if (s.trial) s.trial.protection += 4;
        }
        if (previousEcho === 'spark') {
          gainEnergy(s, 2);
          if (s.trial) s.trial.energy += 2;
        }
        if (previousEcho === 'focus')
          s.focus = Math.min(focusMax(s), s.focus + 2);
        note(s, `Копировальная лента: эхо «${FAMILY_NAMES[previousEcho]}».`);
      }
      if (count >= 5) {
        s.stats.big++;
        if (s.relics.includes('thread') && once(s, 'battle:thread')) heal(s, 3);
      }
      if (family === 'blade') {
        const venom = indices.filter(
          (i) => s.board[i].variant === 'venom',
        ).length;
        if ((s.rulesVersion ?? 0) >= 2) weaponAttack(s, count, venom);
        else {
          poison(s, venom);
          const value =
            count * s.balance.blade +
            s.upgrades.blade * 2 +
            equipmentBonus(s, 'weapon');
          hit(s, value);
          note(s, `Клинки: ${value} урона`);
        }
        if (s.flags.includes('vessel:armed')) {
          s.block += 4;
          s.flags = s.flags.filter((x) => x !== 'vessel:armed');
        }
      }
      if (family === 'shield') {
        let block =
          count * s.balance.shield +
          s.upgrades.shield * 2 +
          equipmentBonus(s, 'clothing');
        if (s.flags.includes('return:armed')) {
          block += 3;
          s.flags = s.flags.filter((x) => x !== 'return:armed');
        }
        if (hasSeal(s, 'enduring-record')) block = Math.max(0, block - 2);
        s.block += block;
        if (s.trial) s.trial.protection += block;
        note(s, `Щиты: +${block} блока`);
        if (
          (s.rulesVersion ?? 0) < 4 &&
          s.relics.includes('thorns') &&
          once(s, 'turn:thorns')
        ) {
          const dmg = Math.floor(block / 2);
          hit(s, dmg, false, false);
          note(s, `Шипованный обод: ${dmg} урона`);
        }
        if (s.relics.includes('coil') && once(s, 'turn:coil')) {
          const gain = Math.min(4, Math.floor(block / 3));
          gainEnergy(s, gain);
          note(s, `Медная катушка: +${gain} энергии`);
        }
      }
      if (family === 'spark') {
        const value = count + (s.upgrades.spark >= 2 ? 1 : 0);
        gainEnergy(s, value);
        if (s.trial) s.trial.energy += value;
        note(s, `Искры: +${value} энергии`);
      }
      if (family === 'focus') {
        const value =
          count + (s.upgrades.focus >= 2 && once(s, 'turn:focus') ? 1 : 0);
        s.focus = Math.min(focusMax(s), s.focus + value);
        note(s, `Фокус: +${value}`);
      }
      if ((s.rulesVersion ?? 0) >= 4) {
        const spikes = indices.filter(
          (i) => s.board[i].variant === 'spiked',
        ).length;
        if (spikes) hit(s, spikes, false, false);
        if (
          indices.some((i) => s.board[i].variant === 'marked') &&
          once(s, 'turn:marked')
        ) {
          s.block += 3;
          if (s.trial) s.trial.protection += 3;
        }
      }
      for (const i of indices)
        if (s.board[i].variant === 'bomb')
          for (const j of [
            i - 6,
            i + 6,
            ...(i % 6 ? [i - 1] : []),
            ...(i % 6 < 5 ? [i + 1] : []),
          ])
            if (j >= 0 && j < 36 && !removed.has(j)) collateral.add(j);
    }
    if (tapeMove && !s.echo) {
      const record = matches.find((indices) => indices.length >= 4);
      if (record) {
        s.echo = s.board[record[0]].family;
        note(
          s,
          `Лента записала «${FAMILY_NAMES[s.echo]}»: собери другое семейство следующим сдвигом.`,
        );
      }
    }
    if ((s.rulesVersion ?? 0) >= 4) {
      const queue = [...removed].filter((i) => s.board[i].variant === 'bomb');
      const fired = new Set<number>();
      while (queue.length) {
        const i = queue.shift()!;
        if (fired.has(i)) continue;
        fired.add(i);
        for (const j of [
          i - 6,
          i + 6,
          ...(i % 6 ? [i - 1] : []),
          ...(i % 6 < 5 ? [i + 1] : []),
        ]) {
          if (j < 0 || j >= 36) continue;
          if (!removed.has(j)) collateral.add(j);
          if (s.board[j].variant === 'bomb' && !fired.has(j)) queue.push(j);
        }
      }
    }
    if (collateral.size) {
      if (s.relics.includes('conductor')) {
        const old = Number(
          s.flags.find((f) => f.startsWith('conductor:'))?.split(':')[1] ?? 0,
        );
        const gain = Math.min(3 - old, Math.floor(collateral.size / 2));
        if (gain > 0) {
          gainEnergy(s, gain);
          s.flags = s.flags.filter((f) => !f.startsWith('conductor:'));
          s.flags.push(`conductor:${old + gain}`);
        }
      }
      note(s, `Бомба разрушила ${collateral.size} фишек`);
    }
    if (inkDamage) {
      hurtHero(s, inkDamage, true, 'Собранные кляксы');
      note(s, `Собранные кляксы: −${inkDamage} здоровья сквозь защиту.`);
    }
    frames.push({
      state: copy(s),
      cells: [...removed, ...collateral],
      label: wave === 1 ? 'Комбинация' : `Каскад ×${wave}`,
      cue: {
        actor: 'hero',
        type: hasBlades ? 'attack' : hasShields ? 'guard' : 'cast',
        target: waveTarget,
      },
    });
    collateral.forEach((i) => removed.add(i));
    if (firstWaveOnly) return;
    collapse(s, removed);
    if (
      s.hp <= 0 ||
      ((s.rulesVersion ?? 0) >= 4 &&
        s.phase === 'battle' &&
        s.enemies.every((e) => e.hp <= 0))
    )
      break;
  }
  if (!validMoves(s.board).length) {
    newBoard(s);
    note(s, 'Ходов нет — поле бесплатно перемешано');
  }
}
export function intent(s: State, e: Enemy): EnemyIntent {
  const damage = (bonus = 0, round = s.round) => {
    const pressure = (s.rulesVersion ?? 0) >= 4 && s.difficulty === 1 ? 2 : 0;
    const rage =
      Math.max(
        0,
        round - (s.roomKind === 'boss' ? 16 : s.roomKind === 'elite' ? 12 : 8),
      ) * 2;
    return Math.max(
      0,
      Math.round((e.damage + bonus) * s.balance.enemyPower) + rage + pressure,
    );
  };
  const attack = (bonus = 0): EnemyIntent => ({
    type: 'attack',
    value: damage(bonus),
    text: 'Удар ' + damage(bonus),
  });
  const block = (value: number): EnemyIntent => ({
    type: 'block',
    value,
    text: 'Защита ' + value,
  });
  const roots = (value: number): EnemyIntent => ({
    type: 'roots',
    value,
    text: 'Свяжет фишки: ' + value,
  });
  const prepare = (bonus: number): EnemyIntent => ({
    type: 'prepare',
    value: damage(bonus, s.round + 1),
    text: 'Готовит удар ' + damage(bonus, s.round + 1),
  });
  const odd = s.round % 2 === 1;
  const cycle = s.round % 3;
  const ink = (value: number): EnemyIntent => ({
    type: 'ink',
    value: Math.min(value, 6 - s.board.filter((t) => t.ink).length),
    text: `Нанесёт кляксы: ${Math.min(value, 6 - s.board.filter((t) => t.ink).length)}`,
  });
  switch (e.kind) {
    case 'redactor': {
      if (cycle === 1) {
        const family = FAMILIES[Math.floor((s.round - 1) / 3) % 4];
        return {
          type: 'redact',
          value: 6,
          family,
          text: `Запрет: ${FAMILY_NAMES[family]}. Группа даёт боссу 6 блока; правка снимает.`,
        };
      }
      return attack((cycle === 0 ? 6 : 0) + (bossPhase(e) === 2 ? 2 : 0));
    }
    case 'reed-crab':
      return odd ? block(8) : attack();
    case 'ink-eel':
      return odd
        ? {
            type: 'pierce',
            value: damage(),
            text: 'Сквозь защиту: ' + damage(),
          }
        : attack();
    case 'leech':
      return odd
        ? {
            type: 'siphon',
            value: Math.min(2, s.focus),
            text: `Украдёт фокус: ${Math.min(2, s.focus)} → лечение`,
          }
        : attack();
    case 'ink-scribe':
      return odd ? ink(3) : attack();
    case 'anchor':
      return cycle === 1 ? prepare(5) : cycle === 2 ? attack(5) : block(6);
    case 'lantern-fish':
      return cycle === 0
        ? {
            type: 'heal',
            value: Math.min(6, e.maxHp - Math.max(0, e.hp - e.poison)),
            text: 'Восстановит до 6 здоровья',
          }
        : attack();
    case 'tide-keeper': {
      const furious =
        bossPhase({ ...e, hp: Math.max(0, e.hp - e.poison) }) === 2;
      if (cycle === 1) return ink(furious ? 5 : 3);
      return cycle === 2 ? prepare(furious ? 9 : 5) : attack(furious ? 9 : 5);
    }
    case 'paper-rat':
      return attack(odd ? 0 : 2);
    case 'stapler':
      return odd ? block(6) : attack();
    case 'moth':
      return odd
        ? {
            type: 'drain',
            value: Math.min(2, s.energy),
            text: 'Похитит энергию: ' + Math.min(2, s.energy),
          }
        : attack();
    case 'eraser':
      return cycle === 1 ? prepare(4) : attack(cycle === 2 ? 4 : 0);
    case 'bell':
      return odd ? prepare(6) : attack(6);
    case 'ink-slime':
    case 'poisoner':
      return !odd
        ? { type: 'poison', value: 2, text: 'Наложит 2 яда' }
        : attack();
    case 'librarian':
    case 'rooter':
      return odd ? roots(2) : attack();
    case 'candle':
      return cycle === 0
        ? {
            type: 'heal',
            value: Math.min(4, e.maxHp - Math.max(0, e.hp - e.poison)),
            text: 'Восстановит до 4 здоровья',
          }
        : attack();
    case 'mirror':
      return odd
        ? block(5)
        : {
            type: 'pierce',
            value: damage(),
            text: 'Сквозь защиту: ' + damage(),
          };
    case 'safe':
      return cycle === 1 ? block(10) : attack();
    case 'censor': {
      const furious =
        bossPhase({ ...e, hp: Math.max(0, e.hp - e.poison) }) === 2;
      if (cycle === 2) return prepare(furious ? 10 : 6);
      if (cycle === 0) return attack(furious ? 10 : 6);
      return furious ? roots(3) : attack();
    }
    case 'boss':
      return cycle === 2 ? prepare(6) : attack(cycle === 0 ? 6 : 0);
    case 'armored':
      return odd ? block(8) : attack();
    default:
      return attack();
  }
}
function result(s: State, frames: Frame[] = [], error?: string): Result {
  return { state: s, frames, error };
}
function checkFinish(s: State) {
  for (const t of s.board)
    if (t.root && !s.enemies.some((e) => e.id === t.root?.owner && e.hp > 0))
      delete t.root;
  if (s.hp <= 0) {
    s.hp = 0;
    s.phase = 'defeat';
    delete s.redaction;
    delete s.echo;
    delete s.tide;
    note(
      s,
      `${s.hero === 'warden' ? 'Страж' : 'Странник'} пал. Следующий путь будет другим.`,
    );
  } else if (s.phase === 'battle' && s.enemies.every((e) => e.hp <= 0)) {
    s.gold +=
      (s.rulesVersion ?? 0) >= 3
        ? s.roomKind === 'boss'
          ? s.room === TOTAL_ROOMS
            ? 0
            : 40
          : s.roomKind === 'elite'
            ? 25 + Math.floor(random(s, 'loot') * 11)
            : 12 + Math.floor(random(s, 'loot') * 7)
        : s.roomKind === 'boss'
          ? 40
          : s.roomKind === 'elite'
            ? 30
            : 15;
    if (s.roomKind === 'elite' && !s.flags.includes('run:elite'))
      s.flags.push('run:elite');
    s.phase =
      s.roomKind === 'boss' && s.room === TOTAL_ROOMS ? 'victory' : 'reward';
    if ((s.rulesVersion ?? 0) >= 3)
      s.rewardSource =
        s.roomKind === 'boss'
          ? 'seal'
          : s.roomKind === 'elite'
            ? 'elite'
            : 'battle';
    s.offers =
      (s.rulesVersion ?? 0) >= 3 && s.phase === 'victory'
        ? []
        : rewardOffers(s);
    if ((s.rulesVersion ?? 0) >= 3 && s.phase === 'victory')
      delete s.rewardSource;
    delete s.tide;
    delete s.redaction;
    delete s.echo;
    s.board.forEach((t) => delete t.ink);
    if (s.roomKind === 'boss' && s.room === 10 && (s.rulesVersion ?? 0) < 3) {
      heal(s, Math.ceil(s.maxHp / 2));
      s.potions = Math.min(2, s.potions + 1);
      s.heroPoison = 0;
      note(
        s,
        'Цензор повержен. Перед спуском: +50% максимального здоровья и зелье (до 2). Снаряжение остаётся с тобой.',
      );
    }
    note(
      s,
      s.phase === 'victory'
        ? `${s.enemies[0]?.name ?? 'Босс'} повержен. Оба биома пройдены.`
        : 'Комната очищена. Выбери награду.',
    );
  } else if (
    s.phase === 'trial' &&
    s.trial &&
    s.trial.energy >= 18 &&
    s.trial.damage >= 30
  ) {
    s.stats.trials++;
    s.phase = 'reward';
    if ((s.rulesVersion ?? 0) >= 3) s.rewardSource = 'trial';
    s.offers = rewardOffers(s, true);
    note(s, 'Шлюз открыт! Испытание пройдено.');
    s.trial = null;
    delete s.echo;
  }
}
export function startRun(
  seed = 19062026,
  balance: Balance = DEFAULT_BALANCE,
  rulesVersion: 2 | 3 | 4 = 4,
): State {
  seed = seed >>> 0;
  const s: State = {
    version: 2,
    rulesVersion,
    weaponQuality: 0,
    equipment: startingEquipment(),
    seed,
    rng: seed >>> 0,
    serial: 0,
    runId: `run-${seed}`,
    phase: 'battle',
    board: [],
    hp: balance.health,
    maxHp: balance.health,
    block: 0,
    heroPoison: 0,
    energy: 3,
    focus: 0,
    gold: 25,
    round: 1,
    room: 1,
    roomKind: 'battle',
    target: 1,
    enemies: [],
    moved: false,
    cast: false,
    consumed: false,
    relics: [],
    modifiers: [],
    skills: ['bolt', 'guard'],
    potions: 1,
    upgrades: { blade: 0, shield: 0, spark: 0, focus: 0 },
    log: ['Сдвинь строку или столбец и собери три одинаковых символа.'],
    offers: [],
    path: ['Вход в крипту'],
    flags: CORE_RELIC_IDS.map((id) => `run:available:${id}`),
    balance: { ...balance },
    modified:
      balance.health !== 40 ||
      balance.blade !== 2 ||
      balance.shield !== 2 ||
      balance.enemyPower !== 1,
    stats: {
      matches: 0,
      cascades: 0,
      kills: 0,
      skills: 0,
      damage: 0,
      blocked: 0,
      big: 0,
      sacrifices: 0,
      trials: 0,
    },
    trial: null,
  };
  if (rulesVersion >= 3) {
    s.streams = {
      map: (seed ^ 0x91e10da5) >>> 0,
      encounters: (seed ^ 0x7f4a7c15) >>> 0,
      loot: (seed ^ 0xbf58476d) >>> 0,
    };
    s.journey = createJourney(s);
  }
  s.enemies = [makeEnemy(s, 'raider', 18)];
  s.target = s.enemies[0].id;
  newBoard(s);
  return s;
}
function makeEnemy(
  s: State,
  kind: EnemyKind,
  hp = ENEMY_CATALOG[kind].hp,
): Enemy {
  const definition = ENEMY_CATALOG[kind];
  return {
    id: ++s.serial,
    kind,
    hp,
    maxHp: hp,
    name: definition.name,
    block: 0,
    poison: 0,
    damage: definition.damage,
  };
}
export function previewMove(
  input: State,
  axis: 'row' | 'col',
  line: number,
  amount: number,
) {
  const error = moveError(input, axis, line, amount);
  if (error) return { error };
  const s = copy(input);
  s.board = shifted(s.board, axis, line, amount);
  const frames: Frame[] = [];
  resolve(s, frames, true, true);
  const cells = frames[0]?.cells ?? [];
  const defeated = s.enemies.filter((e) => e.hp === 0).map((e) => e.id);
  return {
    error: undefined,
    cells,
    targets: s.enemies
      .map((e) => {
        const before = input.enemies.find((old) => old.id === e.id)!;
        return {
          id: e.id,
          name: e.name,
          damage: before.hp - e.hp,
          block: before.block - e.block,
          poison: e.poison - before.poison,
          defeated: before.hp > 0 && e.hp === 0,
          phaseChanged: e.hp > 0 && bossPhase(e) !== bossPhase(before),
          intent: e.hp > 0 ? intent(s, e) : null,
        };
      })
      .filter((e) => e.damage || e.block || e.poison || e.phaseChanged),
    block: s.block - input.block,
    energy: s.energy - input.energy,
    focus: s.focus - input.focus,
    health: s.hp - input.hp,
    trialDamage: (s.trial?.damage ?? 0) - (input.trial?.damage ?? 0),
    tideCleared: !!s.tide?.cleared && !input.tide?.cleared,
    inkCleared:
      input.board.filter((t) => t.ink).length -
      s.board.filter((t, i) => t.ink && !cells.includes(i)).length,
    rootsCleared: s.board.filter(
      (t, i) =>
        t.root && (cells.includes(i) || defeated.includes(t.root.owner)),
    ).length,
    runeReady: input.phase !== 'trial' && s.flags.includes('turn:rune-armed'),
    limitsUsed: s.flags.filter(
      (f) => !input.flags.includes(f) && /^(turn:|battle:|conductor:)/.test(f),
    ),
    lethal: s.hp === 0,
    enemiesDefeated:
      input.phase === 'battle' && s.enemies.every((e) => !e.hp) && s.hp > 0,
  };
}
function moveError(
  input: State,
  axis: 'row' | 'col',
  line: number,
  amount: number,
) {
  if (
    !['battle', 'trial'].includes(input.phase) ||
    input.moved ||
    input.trial?.paused
  )
    return 'Сначала заверши ход.';
  if (
    !['row', 'col'].includes(axis) ||
    !Number.isInteger(line) ||
    line < 0 ||
    line > 5 ||
    !Number.isInteger(amount) ||
    amount < -5 ||
    amount > 5 ||
    amount === 0
  )
    return 'Выбери сдвиг от 1 до 5 клеток.';
  if (!groups(shifted(input.board, axis, line, amount)).length)
    return 'Нет комбинации — сдвиг не тратится.';
}
export function move(
  input: State,
  axis: 'row' | 'col',
  line: number,
  amount: number,
): Result {
  const error = moveError(input, axis, line, amount);
  if (error) return result(input, [], error);
  const s = copy(input);
  s.board = shifted(s.board, axis, line, amount);
  s.moved = s.phase !== 'trial';
  const frames: Frame[] = [];
  resolve(s, frames, true);
  if (s.phase === 'trial') {
    s.cast = false;
    s.consumed = false;
    s.flags = s.flags.filter(
      (f) =>
        f.startsWith('battle:') ||
        f.startsWith('run:') ||
        ((s.rulesVersion ?? 0) < 4 && f === 'vessel:armed'),
    );
    s.block = 0;
  }
  checkFinish(s);
  return result(s, frames);
}
export function endTurn(input: State): Result {
  if (input.phase !== 'battle') return result(input);
  const s = copy(input);
  const frames: Frame[] = [];
  if (s.tide) {
    s.tide.turns--;
    if (s.tide.turns === 0 && !s.tide.cleared) {
      const value = tideDamage(s);
      const blocked = Math.min(s.block, value);
      const damage = hurtHero(s, value, false, 'Прилив');
      note(s, `Прилив: ${damage} урона, ${blocked} в блок.`);
      frames.push({
        state: copy(s),
        cells: Array.from({ length: 6 }, (_, i) => s.tide!.row * 6 + i),
        label: 'Прилив',
        cue: { actor: 'status', type: 'attack', target: 'hero' },
      });
      if (s.hp <= 0) {
        checkFinish(s);
        return result(s, frames);
      }
    }
  }
  if (s.heroPoison > 0) {
    recordDamage(s, 'Яд', Math.min(s.hp, s.heroPoison));
    s.hp -= s.heroPoison;
    note(s, `Яд: ${s.heroPoison} урона сквозь блок`);
    s.heroPoison--;
    frames.push({
      state: copy(s),
      cells: [],
      label: 'Яд',
      cue: { actor: 'status', type: 'poison', target: 'hero' },
    });
    if (s.hp <= 0) {
      checkFinish(s);
      return result(s, frames);
    }
  }
  const poisonAtStart = new Map(s.enemies.map((e) => [e.id, e.poison]));
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    // Snapshot the displayed intent before this enemy's status tick.
    const action = intent(s, e);
    const tickingPoison =
      (s.rulesVersion ?? 0) >= 4 ? poisonAtStart.get(e.id)! : e.poison;
    if (tickingPoison > 0) {
      const damage = Math.min(e.hp, tickingPoison);
      e.hp -= damage;
      s.stats.damage += damage;
      e.poison--;
      frames.push({
        state: copy(s),
        cells: [],
        label: 'Яд',
        cue: { actor: 'status', type: 'poison', target: e.id },
      });
      if (e.hp <= 0) {
        s.stats.kills++;
        if ((s.rulesVersion ?? 0) >= 4)
          s.stats.poisonKills = (s.stats.poisonKills ?? 0) + 1;
        spreadPoison(s, e);
        if (s.relics.includes('heart') && once(s, 'battle:heart')) heal(s, 3);
        continue;
      }
    }
    const rooted = s.board.filter(
      (t) => t.root?.owner === e.id && (t.root?.expires ?? Infinity) <= s.round,
    );
    if (rooted.length) {
      const damage = rooted.length * 2;
      const absorb = Math.min(s.block, damage);
      s.block -= absorb;
      s.stats.blocked += absorb;
      recordDamage(s, 'Корни', Math.min(s.hp, damage - absorb), absorb);
      s.hp -= damage - absorb;
      rooted.forEach((t) => delete t.root);
      note(s, `Корни: ${damage - absorb} урона`);
      frames.push({
        state: copy(s),
        cells: [],
        label: 'Корни',
        cue: { actor: 'status', type: 'roots', target: 'hero' },
      });
      if (s.hp <= 0) break;
    }
    e.block = 0;
    if (action.type === 'poison') {
      s.heroPoison = (s.heroPoison ?? 0) + action.value;
      note(s, `Герой отравлен: +${action.value} яда`);
    }
    if (action.type === 'roots') {
      const candidates = s.board.filter((t) => !t.root);
      for (let n = 0; n < action.value && candidates.length; n++) {
        const t = candidates.splice(
          Math.floor(random(s, 'encounters') * candidates.length),
          1,
        )[0];
        t.root = { owner: e.id, expires: s.round + 1 };
      }
      note(s, 'Собери отмеченные корнями фишки до следующего ответа.');
    }
    if (action.type === 'redact' && action.family) {
      s.redaction = { family: action.family, expires: s.round + 2 };
      note(s, action.text);
    }
    if (action.type === 'block') e.block = action.value;
    if (action.type === 'drain') {
      s.energy = Math.max(0, s.energy - action.value);
      note(s, `${e.name}: −${action.value} энергии`);
    }
    if (action.type === 'heal') {
      e.hp = Math.min(e.maxHp, e.hp + action.value);
      note(s, `${e.name}: +${action.value} здоровья`);
    }
    if (action.type === 'attack' || action.type === 'pierce') {
      const blocked =
        action.type === 'pierce' ? 0 : Math.min(s.block, action.value);
      s.block -= blocked;
      s.stats.blocked += blocked;
      recordDamage(s, e.name, Math.min(s.hp, action.value - blocked), blocked);
      s.hp -= action.value - blocked;
      note(s, `${e.name}: ${action.value - blocked} урона, ${blocked} в блок`);
      if (
        (s.rulesVersion ?? 0) >= 4 &&
        s.hp > 0 &&
        blocked >= 2 &&
        s.relics.includes('thorns')
      ) {
        hit(s, Math.floor(blocked / 2), false, false, e.id);
        note(
          s,
          `Шипованный обод: ${Math.floor(blocked / 2)} урона → ${e.name}`,
        );
      }
    }
    if (action.type === 'prepare')
      note(s, `${e.name}: ${action.text.toLowerCase()} на следующий ход`);
    if (action.type === 'ink') {
      const choices = s.board.filter((t) => !t.ink);
      for (let i = 0; i < action.value; i++) {
        const index = Math.floor(random(s, 'encounters') * choices.length);
        choices.splice(index, 1)[0].ink = true;
      }
      note(s, `${e.name}: ${action.value} клякс. Матч фокуса смоет их все.`);
    }
    if (action.type === 'siphon') {
      s.focus -= action.value;
      e.hp = Math.min(e.maxHp, e.hp + action.value);
      note(
        s,
        `${e.name} украл ${action.value} фокуса и восстановил до ${action.value} здоровья.`,
      );
    }
    frames.push({
      state: copy(s),
      cells: [],
      label: ['attack', 'pierce'].includes(action.type)
        ? `${e.name} атакует`
        : action.text,
      cue: {
        actor: e.id,
        type:
          action.type === 'block'
            ? 'guard'
            : action.type === 'pierce'
              ? 'attack'
              : ['drain', 'ink', 'siphon', 'redact'].includes(action.type)
                ? 'cast'
                : (action.type as CombatCue['type']),
        target:
          action.type === 'heal' || action.type === 'block' ? e.id : 'hero',
      },
    });
    if (s.hp <= 0) break;
  }
  checkFinish(s);
  if (s.phase === 'battle') {
    s.round++;
    if (s.redaction && s.round > s.redaction.expires) delete s.redaction;
    if (s.tide?.turns === 0) startTide(s);
    s.block = Math.min(
      s.block,
      hasSeal(s, 'enduring-record') ? 6 : s.hero === 'warden' ? 4 : 0,
    );
    s.moved = false;
    s.cast = false;
    s.consumed = false;
    s.flags = s.flags.filter(
      (f) =>
        f.startsWith('battle:') ||
        f.startsWith('run:') ||
        ((s.rulesVersion ?? 0) < 4 && f === 'vessel:armed'),
    );
  }
  return result(s, frames);
}
export function castSkill(
  input: State,
  id: string,
  index = 0,
  family: Family = 'blade',
  secondIndex?: number,
): Result {
  if (
    !['battle', 'trial'].includes(input.phase) ||
    input.cast ||
    input.trial?.paused
  )
    return result(input, [], 'Одна способность за ход.');
  const binding =
    id === 'binding' &&
    (input.rulesVersion ?? 0) >= 4 &&
    input.relics.includes('binding');
  if (id !== 'edit' && !binding && !input.skills.includes(id))
    return result(input, [], 'Этот приём не экипирован.');
  const costs: Record<string, [number, number, number]> = {
    binding: [0, 0, 0],
    bolt: [6, 0, 0],
    guard: [4, 0, 0],
    pierce: [0, 3, 0],
    blood: [0, 0, 2],
    seal: [3, 0, 2],
    reshape: [0, 6, 0],
    edit: [0, 3, 0],
  };
  const cost = costs[id];
  if (!cost) return result(input, [], 'Неизвестный приём.');
  if (id === 'binding' && (!binding || input.block < 1))
    return result(input, [], 'Нужен Боевой переплёт и хотя бы 1 блок.');
  if (input.energy < cost[0] || input.focus < cost[1] || input.hp <= cost[2])
    return result(input, [], 'Недостаточно ресурсов.');
  if (index < 0 || index >= 36 || !FAMILIES.includes(family))
    return result(input, [], 'Выбери фишку на поле.');
  const double = id === 'edit' && hasSeal(input, 'double-edit');
  if (
    (input.rulesVersion ?? 0) >= 3 &&
    (!Number.isInteger(index) ||
      (double &&
        (!Number.isInteger(secondIndex) ||
          secondIndex! < 0 ||
          secondIndex! >= 36 ||
          secondIndex === index)))
  )
    return result(input, [], 'Выбери две разные клетки для правки.');
  const s = copy(input);
  s.cast = true;
  s.stats.skills++;
  s.energy -= cost[0];
  s.focus -= cost[1];
  recordDamage(s, `Жертва: ${itemById(id)?.name ?? id}`, cost[2]);
  s.hp -= cost[2];
  if (cost[2]) {
    s.stats.sacrifices++;
    if (
      s.relics.includes('vessel') &&
      once(s, (s.rulesVersion ?? 0) >= 4 ? 'turn:vessel' : 'battle:vessel')
    )
      s.flags.push('vessel:armed');
  }
  if (cost[0] >= 6 && s.relics.includes('return')) s.flags.push('return:armed');
  const bonus = cost[2] && s.relics.includes('lens') ? 4 : 0;
  const rune =
    (s.rulesVersion ?? 0) >= 2 &&
    cost[0] > 0 &&
    ['bolt', 'seal'].includes(id) &&
    s.flags.includes('turn:rune-armed')
      ? 2
      : 0;
  if (rune) {
    s.flags = s.flags.filter((f) => f !== 'turn:rune-armed');
    note(s, 'Рунный заряд: +2 урона приёму.');
  }
  const damage = (value: number) =>
    Math.max(0, value - (hasSeal(s, 'double-edit') ? 3 : 0));
  if (id === 'binding') {
    const spent = Math.min(8, s.block);
    s.block -= spent;
    hit(s, damage(spent * 2), false, false);
    note(s, `Боевой переплёт: ${spent} блока → ${damage(spent * 2)} урона.`);
  }
  if (id === 'bolt') hit(s, damage(12 + rune));
  if (id === 'guard') s.block += 8;
  if (id === 'pierce') hit(s, damage(8), true);
  if (id === 'blood') hit(s, damage(8 + bonus));
  if (id === 'seal') hit(s, damage(16 + bonus + rune));
  if (id === 'edit') {
    if (s.redaction) {
      delete s.redaction;
      note(s, 'Правка сняла запрет Редактора.');
    }
    if ((s.rulesVersion ?? 0) >= 4) {
      s.stats.edits = (s.stats.edits ?? 0) + 1;
      if (s.relics.includes('carbon') && once(s, 'turn:carbon'))
        s.flags.push('turn:carbon-armed');
    }
    for (const cell of double ? [index, secondIndex!] : [index]) {
      s.board[cell] = tile(s, family);
      s.board[cell].variant = null;
    }
    if (s.relics.includes('order')) s.block += 3;
  }
  if (id === 'reshape') {
    const row = Math.floor(index / 6);
    for (let col = 0; col < 3; col++) {
      s.board[row * 6 + col] = tile(s, 'blade');
      s.board[row * 6 + col].variant = null;
    }
  }
  note(
    s,
    id === 'edit'
      ? double
        ? 'Правка: две фишки заменены вместе'
        : 'Правка: фишка заменена'
      : `Приём: ${itemById(id)?.name}`,
  );
  const frames: Frame[] = [
    {
      state: copy(s),
      cells:
        id === 'edit'
          ? double
            ? [index, secondIndex!]
            : [index]
          : id === 'reshape'
            ? [
                Math.floor(index / 6) * 6,
                Math.floor(index / 6) * 6 + 1,
                Math.floor(index / 6) * 6 + 2,
              ]
            : [],
      label: id === 'edit' ? 'Правка поля' : (itemById(id)?.name ?? 'Приём'),
      cue: {
        actor: 'hero',
        type:
          id === 'guard'
            ? 'guard'
            : ['blood', 'pierce', 'binding'].includes(id)
              ? 'attack'
              : 'cast',
        target: s.target,
      },
    },
  ];
  resolve(s, frames, false);
  checkFinish(s);
  return result(s, frames);
}
export function consumePotion(input: State): Result {
  if (
    !['battle', 'trial'].includes(input.phase) ||
    input.consumed ||
    input.potions <= 0 ||
    input.hp === input.maxHp ||
    input.trial?.paused
  )
    return result(input, [], 'Зелье сейчас недоступно.');
  const s = copy(input);
  s.potions--;
  s.consumed = true;
  heal(s, 8);
  return result(s, [
    {
      state: copy(s),
      cells: [],
      label: 'Лечебное зелье',
      cue: { actor: 'hero', type: 'heal' },
    },
  ]);
}
export function rewardOffers(s: State, strong = false): Offer[] {
  if ((s.rulesVersion ?? 0) >= 3) return journeyRewardOffers(s, strong);
  const gearPool = equipmentOptions(s);
  if (s.room === 1 && (s.rulesVersion ?? 0) >= 2) {
    const weapons = gearPool.filter((o) => o.slot === 'weapon');
    const mods = modifierPoolFor(s).filter((o) => !s.modifiers.includes(o.id));
    const useful = relicPoolFor(s).filter(
      (r) =>
        ['thorns', 'coil', 'prism', 'order', 'lamp', 'thread'].includes(r.id) &&
        !s.relics.includes(r.id),
    );
    return [weapons, mods, useful].flatMap((pool) =>
      pool.length ? [pool[Math.floor(random(s, 'loot') * pool.length)]] : [],
    );
  }
  const equipment = gearPool.length
    ? [gearPool[Math.floor(random(s, 'loot') * gearPool.length)]]
    : [];
  if (s.room === 1)
    return [
      ...equipment,
      ...[RELICS[0], ...modifierPoolFor(s)].filter(
        (x) => !s.relics.includes(x.id) && !s.modifiers.includes(x.id),
      ),
    ];
  const pool = [
    ...relicPoolFor(s).filter(
      (x) =>
        !s.relics.includes(x.id) &&
        ((s.rulesVersion ?? 0) >= 2 ||
          BASE_RELICS.includes(x.id) ||
          s.flags.includes(`run:available:${x.id}`)),
    ),
    ...modifierPoolFor(s).filter((x) => !s.modifiers.includes(x.id)),
    ...(strong
      ? []
      : [
          ...SKILLS.filter((x) => !s.skills.includes(x.id)),
          ...upgradeOptions(s),
        ]),
  ];
  const offers: Offer[] = [];
  const synergy = s.relics.includes('thorns')
    ? 'coil'
    : s.modifiers.includes('venom')
      ? 'toxin'
      : s.modifiers.includes('bomb')
        ? 'prism'
        : null;
  const candidate = pool.findIndex((x) => x.id === synergy);
  if ((s.rulesVersion ?? 0) < 2 && candidate >= 0)
    offers.push(pool.splice(candidate, 1)[0]);
  while (offers.length < 3 && pool.length)
    offers.push(pool.splice(Math.floor(random(s, 'loot') * pool.length), 1)[0]);
  return [...equipment, ...offers];
}

export const BASE_RELICS = ['thorns', 'order'];
export const ACHIEVEMENTS = [
  {
    id: 'first-match',
    name: 'Первый осколок',
    description: 'Собрать первую комбинацию',
    reward: 'coil',
  },
  {
    id: 'first-skill',
    name: 'Пробуждение',
    description: 'Применить боевой приём',
    reward: 'return',
  },
  {
    id: 'five',
    name: 'Идеальная линия',
    description: 'Собрать 5 или больше фишек',
    reward: 'thread',
  },
  {
    id: 'block',
    name: 'Непоколебимый',
    description: 'Поглотить 12 урона за забег',
    reward: 'heart',
  },
  {
    id: 'three-kills',
    name: 'Тропа костей',
    description: 'Победить 3 врагов за забег',
    reward: 'toxin',
  },
  {
    id: 'cascades',
    name: 'Цепная реакция',
    description: 'Вызвать 3 каскада за забег',
    reward: 'prism',
  },
  {
    id: 'sacrifice',
    name: 'Цена силы',
    description: 'Оплатить приём здоровьем',
    reward: 'lens',
  },
  {
    id: 'trial',
    name: 'До последней искры',
    description: 'Открыть шлюз за 45 секунд',
    reward: 'conductor',
  },
  {
    id: 'elite',
    name: 'Сильнее страха',
    description: 'Победить элиту',
    reward: 'vessel',
  },
  {
    id: 'win',
    name: 'По ту сторону',
    description: 'Победить Привратника',
    reward: 'lamp',
  },
];
ACHIEVEMENTS.push(
  {
    id: 'three-edits',
    name: 'Точная копия',
    description: 'Сделать 3 правки за обычный забег. Открывает Копирку.',
    reward: 'carbon',
  },
  {
    id: 'poison-finish',
    name: 'Заражение',
    description:
      'Победить 3 врагов тиками яда за обычный забег. Открывает Заразную закладку.',
    reward: 'bookmark',
  },
  {
    id: 'shield-mastery',
    name: 'Острый край',
    description:
      'Собрать 5 групп щитов за обычный забег. Открывает Колючие щиты.',
    reward: 'spiked',
  },
  {
    id: 'focus-mastery',
    name: 'На полях',
    description:
      'Собрать 5 групп фокуса за обычный забег. Открывает Защитную помету.',
    reward: 'marked',
  },
);
export type Meta = {
  version: 1;
  unlocked: string[];
  streak: number;
  best: number;
  wins: number;
  finished: string[];
  marks?: string[];
  history?: RunRecord[];
  seen?: string[];
};
export const EMPTY_META: Meta = {
  version: 1,
  unlocked: [],
  streak: 0,
  best: 0,
  wins: 0,
  finished: [],
};
function rememberRun(m: Meta, s: State, outcome: RunRecord['outcome']) {
  if ((s.rulesVersion ?? 0) < 4) return;
  const r: RunRecord = {
    id: s.runId,
    seed: s.seed,
    outcome,
    modified: s.modified,
    rules: s.rulesVersion ?? 0,
    hero: s.hero ?? 'wanderer',
    difficulty: s.difficulty ?? 0,
    ...(outcome === 'victory'
      ? { ending: s.enemies[0]?.kind ?? 'tide-keeper' }
      : {}),
    room: s.room,
    path: [...s.path],
    weapon: s.equipment.weapon,
    relics: [...s.relics],
    modifiers: [...s.modifiers],
    ...(s.seal ? { seal: s.seal } : {}),
    stats: copy(s.stats),
    damageEvents: copy(s.damageEvents ?? []),
    log: [...(s.chronicle ?? s.log)],
  };
  m.history = [r, ...(m.history ?? []).filter((x) => x.id !== r.id)].slice(
    0,
    30,
  );
}
export function defeatExplanation(
  s: Pick<State, 'damageEvents' | 'phase'>,
): string {
  if (s.phase !== 'defeat') return '';
  const last = [...(s.damageEvents ?? [])].reverse().find((e) => e.amount > 0);
  return last
    ? `Последний урон: ${last.source}, ${last.amount} здоровья, ${last.blocked} поглощено блоком. Комната ${last.room}, ход ${last.round}.`
    : 'В этом старом сохранении источник последнего урона не записан.';
}
export function updateMeta(input: Meta, s: State): Meta {
  const m = copy(input);
  if ((s.rulesVersion ?? 0) >= 4 && !s.modified)
    m.seen = [
      ...new Set([
        ...(m.seen ?? []),
        ...s.enemies.map((e) => `enemy:${e.kind}`),
        ...[
          ...s.relics,
          ...s.modifiers,
          ...s.skills,
          ...Object.values(s.equipment),
          ...s.offers.map((o) => o.id),
        ]
          .filter(Boolean)
          .map((id) => `item:${id}`),
      ]),
    ];
  const checks: Record<string, boolean> = {
    'three-edits': (s.rulesVersion ?? 0) >= 4 && (s.stats.edits ?? 0) >= 3,
    'poison-finish':
      (s.rulesVersion ?? 0) >= 4 && (s.stats.poisonKills ?? 0) >= 3,
    'shield-mastery':
      (s.rulesVersion ?? 0) >= 4 && (s.stats.shieldGroups ?? 0) >= 5,
    'focus-mastery':
      (s.rulesVersion ?? 0) >= 4 && (s.stats.focusGroups ?? 0) >= 5,
    'first-match': s.stats.matches > 0,
    'first-skill': s.stats.skills > 0,
    five: s.stats.big > 0,
    block: s.stats.blocked >= 12,
    'three-kills': s.stats.kills >= 3,
    cascades: s.stats.cascades >= 3,
    sacrifice: s.stats.sacrifices > 0,
    trial: s.stats.trials > 0,
    elite: s.flags.includes('run:elite'),
    win: s.phase === 'victory',
  };
  // Lab settings never advance achievements or normal victory streaks.
  if (!s.modified)
    for (const a of ACHIEVEMENTS)
      if (checks[a.id] && !m.unlocked.includes(a.id)) m.unlocked.push(a.id);
  if (
    ['victory', 'defeat'].includes(s.phase) &&
    !m.finished.includes(s.runId)
  ) {
    m.finished.push(s.runId);
    rememberRun(m, s, s.phase as 'victory' | 'defeat');
    if (!s.modified) {
      if (s.phase === 'victory') {
        m.streak++;
        m.wins++;
        if ((s.rulesVersion ?? 0) >= 4)
          m.marks = [
            ...new Set([
              ...(m.marks ?? []),
              `${s.hero ?? 'wanderer'}:${s.enemies[0]?.kind ?? 'tide-keeper'}`,
              ...(s.difficulty === 1
                ? [
                    `hard:${s.hero ?? 'wanderer'}:${s.enemies[0]?.kind ?? 'tide-keeper'}`,
                  ]
                : []),
            ]),
          ];
        m.best = Math.max(m.best, m.streak);
      } else m.streak = 0;
    }
  }
  return m;
}
export function abandonMeta(input: Meta, s: State) {
  const m = copy(input);
  if (
    !['victory', 'defeat'].includes(s.phase) &&
    !s.modified &&
    !m.finished.includes(s.runId)
  ) {
    m.streak = 0;
    m.finished.push(s.runId);
    rememberRun(m, s, 'abandoned');
  }
  return m;
}
export function progressionRewards(m: Meta): string[] {
  const marks = m.marks ?? [];
  return [
    ...(marks.includes('warden:tide-keeper') ? ['binding'] : []),
    ...(marks.some((mark) => /^(wanderer|warden):redactor$/.test(mark))
      ? ['tape']
      : []),
  ];
}
export function availableRelics(m: Meta, rulesVersion?: 2 | 3 | 4) {
  if ((rulesVersion ?? 0) >= 2)
    return [
      ...CORE_RELIC_IDS,
      ...((rulesVersion ?? 0) >= 4 ? progressionRewards(m) : []),
      ...((rulesVersion ?? 0) >= 4
        ? ACHIEVEMENTS.filter(
            (a) =>
              m.unlocked.includes(a.id) && !CORE_RELIC_IDS.includes(a.reward),
          ).map((a) => a.reward)
        : []),
    ];
  return [
    ...BASE_RELICS,
    ...ACHIEVEMENTS.filter((a) => m.unlocked.includes(a.id)).map(
      (a) => a.reward,
    ),
  ];
}
export function withUnlocks(s: State, m: Meta) {
  s.flags = s.flags.filter((f) => !f.startsWith('run:available:'));
  s.flags.push(
    ...availableRelics(m, s.rulesVersion).map((id) => `run:available:${id}`),
  );
  if (
    (s.rulesVersion ?? 0) >= 4 &&
    m.wins > 0 &&
    !s.flags.includes('run:alternate-access')
  ) {
    s.flags.push('run:alternate-access');
    const pump = s.journey?.nodes.find(
      (n) => n.depth === 17 && n.kind === 'event',
    );
    if (pump)
      pump.description +=
        ' Ещё здесь можно отдать 6 максимального здоровья за проход к Редактору вместо Хранителя.';
  }
  return s;
}
export function startAdventure(
  seed: number,
  balance: Balance,
  meta: Meta,
  hero: HeroId = 'wanderer',
  difficulty: 0 | 1 = 0,
): State {
  const s = withUnlocks(startRun(seed, balance), meta);
  s.hero = meta.wins > 0 && hero === 'warden' ? 'warden' : 'wanderer';
  s.difficulty = meta.wins > 0 && difficulty === 1 ? 1 : 0;
  if (s.hero === 'warden') {
    s.maxHp += 8;
    s.hp += 8;
    s.energy = 0;
  }
  note(
    s,
    `${HEROES.find((h) => h.id === s.hero)!.name}. ${s.difficulty ? 'Напряжение I: удары врагов сильнее на 2.' : 'Обычная сложность.'}`,
  );
  return s;
}
export function canEnterForbidden(s: State) {
  return (
    (s.rulesVersion ?? 0) >= 4 &&
    s.phase === 'event' &&
    s.room === 17 &&
    s.flags.includes('run:alternate-access') &&
    s.maxHp > 6 &&
    !!s.journey
  );
}
export function nextRooms(s: State): Room[] {
  if ((s.rulesVersion ?? 0) >= 3 && s.journey) {
    const ids =
      s.journey.nodes.find((n) => n.id === s.journey!.current)?.next ?? [];
    return s.journey.nodes.filter((n) => ids.includes(n.id));
  }
  return roomsAtDepth(s.room + 1);
}
// The map and room-entry validation share the same route definitions.
export function roomsAtDepth(n: number): Room[] {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_ROOMS) return [];
  if (n === 1)
    return [
      {
        id: '1-battle',
        kind: 'battle',
        name: 'Вход в крипту',
        description: 'Начало пути.',
      },
    ];
  const mk = (kind: Room['kind'], name: string, description: string): Room => ({
    id: `${n}-${kind}`,
    kind,
    name,
    description,
  });
  if (n === 5)
    return [
      mk(
        'shop',
        'Торговец у переправы',
        'Потрать золото на реликвии, приёмы и зелья.',
      ),
    ];
  if (n === 9)
    return [
      mk(
        'rest',
        'Тлеющий костёр',
        'Восстанови здоровье или улучши семейство фишек.',
      ),
    ];
  const encounter = (id: string, kind: Room['kind'], name: string): Room => ({
    id,
    kind,
    name,
    description: ROOM_ENEMIES[id]
      .map((key) => ENEMY_CATALOG[key].name + ': ' + ENEMY_CATALOG[key].tactic)
      .join(' '),
  });
  if (n > 10) {
    switch (n) {
      case 11:
        return [encounter('11-battle', 'battle', 'Затопленный порог')];
      case 12:
        return [
          encounter('12-battle', 'battle', 'Промокшие рукописи'),
          encounter('12-elite', 'elite', 'Гнездо буквоедов'),
        ];
      case 13:
        return [
          encounter('13-battle', 'battle', 'Угриный канал'),
          mk(
            'event',
            'Сухой тайник',
            'Припасы или реликвия под уцелевшей полкой.',
          ),
        ];
      case 14:
        return [
          encounter('14-battle', 'battle', 'Якорная галерея'),
          encounter('14-elite', 'elite', 'Мокрая канцелярия'),
        ];
      case 15:
        return [
          mk(
            'shop',
            'Плавучая лавка Саввы',
            'Новые товары и скидки. Пополни запасы перед глубинами.',
          ),
        ];
      case 16:
        return [
          encounter('16-battle', 'battle', 'Огни под водой'),
          encounter('16-elite', 'elite', 'Утонувший каталог'),
        ];
      case 17:
        return [
          mk(
            'event',
            'Сердце насосной',
            'Почини насос за 30 золота: прилив навсегда слабее на 2 в этом забеге. Или забери припасы.',
          ),
          mk(
            'trial',
            'Аварийный шлюз',
            'Открой затвор за 45 секунд: 18 энергии и 30 урона.',
          ),
        ];
      case 18:
        return [
          encounter('18-battle', 'battle', 'Чернильная заводь'),
          encounter('18-elite', 'elite', 'Караул глубин'),
        ];
      case 19:
        return [
          mk(
            'rest',
            'Сухой причал',
            'Последняя передышка перед Хранителем прилива.',
          ),
        ];
      case 20:
        return [encounter('20-boss', 'boss', 'Сердце затопленного архива')];
    }
  }
  if (n === 10) return [encounter('10-boss', 'boss', 'Зал Главного цензора')];
  if (n === 6)
    return [
      encounter('6-battle', 'battle', 'Чернильный сток'),
      encounter('6-rooter', 'battle', 'Запретный архив'),
    ];
  if (n === 3)
    return [
      mk('event', 'Забытый алтарь', 'Неизвестная реликвия за часть здоровья.'),
      encounter('3-battle', 'battle', 'Изъеденная библиотека'),
    ];
  if (n === 7)
    return [
      mk(
        'trial',
        'Закрывающийся шлюз',
        '45 секунд: энергия для механизма и урон по преграде.',
      ),
      mk(
        'event',
        'Тайник странника',
        'Припасы, оставленные тем, кто шёл до тебя.',
      ),
    ];
  if (n === 4)
    return [
      encounter('4-battle', 'battle', 'Комната исправлений'),
      encounter('4-elite', 'elite', 'Тревожный караул'),
    ];
  if (n === 8)
    return [
      encounter('8-battle', 'battle', 'Свечной коридор'),
      encounter('8-elite', 'elite', 'Хранилище отражений'),
    ];
  return [
    encounter('2-battle', 'battle', 'Бумажные норы'),
    encounter('2-armored', 'battle', 'Скреплённый проход'),
  ];
}
// Stage 2: each choice owns its lane until the next shared stop.
function createJourney(s: State): NonNullable<State['journey']> {
  const nodes: NonNullable<State['journey']>['nodes'] = [];
  for (const offset of [0, 10]) {
    const archive = offset > 0;
    const riskLane = Math.floor(random(s, 'map') * 2);
    const trialLane = Math.floor(random(s, 'map') * 2);
    const firstPool: EnemyKind[] = archive
      ? ['ink-scribe', 'ink-eel', 'lantern-fish']
      : ['paper-rat', 'stapler', 'moth'];
    const secondPool: EnemyKind[] = archive
      ? ['leech', 'librarian', 'lantern-fish']
      : ['ink-slime', 'librarian', 'candle'];
    for (let local = 1; local <= 10; local++) {
      const depth = offset + local;
      const forked = [2, 3, 4, 6, 7, 8].includes(local);
      for (let lane = 0; lane < (forked ? 2 : 1); lane++) {
        let kind: Room['kind'] = 'battle';
        let roster: EnemyKind[] | undefined;
        let name = '';
        if (local === 1) {
          roster = archive ? ['reed-crab'] : ['raider'];
          name = archive ? 'Вход в затопленный архив' : 'Вход в крипту';
        }
        if ([2, 6].includes(local)) {
          const pool = local === 2 ? firstPool : secondPool;
          roster = [
            pool.splice(
              Math.floor(random(s, 'encounters') * pool.length),
              1,
            )[0],
          ];
        }
        if (local === 3) {
          kind = 'treasure';
          name = lane ? 'Забытая кладовая' : 'Запечатанный запасник';
        }
        if (local === 4) {
          kind = lane === riskLane ? 'elite' : 'battle';
          roster = archive
            ? kind === 'elite'
              ? ['ink-scribe', 'stapler']
              : ['anchor']
            : kind === 'elite'
              ? ['bell', 'paper-rat']
              : ['eraser'];
        }
        if (local === 5) {
          kind = 'shop';
          name = archive ? 'Плавучая лавка Саввы' : 'Торговец у переправы';
        }
        if (local === 7) {
          kind = lane === trialLane ? 'trial' : 'event';
          name =
            kind === 'trial'
              ? 'Закрывающийся шлюз'
              : archive
                ? 'Сердце насосной'
                : 'Тайник странника';
        }
        if (local === 8) {
          kind = lane === trialLane ? 'elite' : 'battle';
          roster = archive
            ? kind === 'elite'
              ? ['mirror', 'anchor']
              : ['ink-scribe', 'ink-slime']
            : kind === 'elite'
              ? ['safe', 'mirror']
              : ['candle'];
        }
        if ((s.rulesVersion ?? 0) >= 4 && local === 8) {
          if (archive)
            roster =
              kind === 'elite'
                ? ['anchor', 'lantern-fish']
                : ['ink-scribe', 'paper-rat'];
          else if (kind === 'elite') roster = ['safe', 'moth'];
        }
        if (local === 9) {
          kind = 'rest';
          name = archive ? 'Сухой причал' : 'Тлеющий костёр';
        }
        if (local === 10) {
          kind = 'boss';
          name = archive ? 'Хранитель прилива' : 'Цензор';
          roster = archive ? ['tide-keeper'] : ['censor'];
        }
        if (!name)
          name = `${kind === 'elite' ? 'Элита: ' : ''}${roster!.map((e) => ENEMY_CATALOG[e].name).join(' и ')}`;
        const reward = {
          battle: 'Бой: 12–18 золота и одна из двух находок.',
          elite:
            'Элита: 25–35 золота и выбор из трёх реликвий или модификаторов.',
          treasure:
            'Одна случайная реликвия бесплатно. Можно сменить находку один раз за 20 золота.',
          event: archive
            ? 'Припасы бесплатно или ремонт насоса за 30 золота.'
            : 'Припасы бесплатно или сильная находка за 5 здоровья.',
          trial:
            '45 секунд: 18 энергии и 30 урона. Успех — сильная находка; провал — потеря здоровья.',
          shop: 'Ассортимент и скидки фиксированы. Здесь ветки соединяются.',
          rest: 'Лечение или усиление. Здесь ветки соединяются.',
          boss: archive
            ? 'Последний бой спуска.'
            : '40 золота, выбор печати с ценой или отказ. Затем передышка и архив.',
        }[kind];
        let next: string[] = [];
        if (depth < TOTAL_ROOMS) {
          next = [1, 5].includes(local)
            ? [`${depth + 1}-0`, `${depth + 1}-1`]
            : [2, 3, 6, 7].includes(local)
              ? [`${depth + 1}-${lane}`]
              : [`${depth + 1}-0`];
        }
        const continuation =
          local === 2
            ? ` Затем кладовая → ${lane === riskLane ? 'элита' : 'обычный бой'} → магазин.`
            : local === 6
              ? ` Затем ${lane === trialLane ? 'испытание → элита' : 'событие → обычный бой'} → привал.`
              : '';
        nodes.push({
          id: `${depth}-${lane}`,
          depth,
          kind,
          name,
          description: reward + continuation,
          ...(roster ? { roster } : {}),
          next,
        });
      }
    }
  }
  return { nodes, current: '1-0', visited: ['1-0'] };
}
function drawOffers(s: State, pool: Offer[], count: number): Offer[] {
  const remaining = [...pool],
    result: Offer[] = [];
  while (remaining.length && result.length < count)
    result.push(
      remaining.splice(Math.floor(random(s, 'loot') * remaining.length), 1)[0],
    );
  return result;
}
function treasureOffers(s: State, excluded: string[] = []) {
  return drawOffers(
    s,
    relicPoolFor(s).filter(
      (o) => !s.relics.includes(o.id) && !excluded.includes(o.id),
    ),
    1,
  );
}
export function canRerollTreasure(s: State) {
  return (
    (s.rulesVersion ?? 0) >= 3 &&
    s.phase === 'reward' &&
    s.rewardSource === 'treasure' &&
    !s.treasureRerolled &&
    s.gold >= 20 &&
    relicPoolFor(s).some(
      (o) => !s.relics.includes(o.id) && !s.offers.some((a) => a.id === o.id),
    )
  );
}
export function rerollTreasure(input: State): Result {
  if (!canRerollTreasure(input))
    return result(
      input,
      [],
      'Нужны 20 золота, другая доступная реликвия и неиспользованная смена находки.',
    );
  const s = copy(input);
  s.offers = treasureOffers(
    s,
    s.offers.map((o) => o.id),
  );
  s.gold -= 20;
  s.treasureRerolled = true;
  note(s, 'Кладовая: новая находка за 20 золота. Повторная смена недоступна.');
  return result(s);
}
function journeyRewardOffers(s: State, strong: boolean): Offer[] {
  if (s.roomKind === 'boss' && s.room === TOTAL_ROOMS) return [];
  if (s.rewardSource === 'seal') return copy(SEALS);
  if (s.rewardSource === 'treasure') return treasureOffers(s);
  const relics = relicPoolFor(s).filter((o) => !s.relics.includes(o.id));
  const modifiers = modifierPoolFor(s).filter(
    (o) => !s.modifiers.includes(o.id),
  );
  if (s.room === 1 && !strong) {
    return [
      ...drawOffers(
        s,
        equipmentOptions(s).filter((o) => o.slot === 'weapon'),
        1,
      ),
      ...drawOffers(s, modifiers, 1),
      ...drawOffers(
        s,
        relics.filter((o) =>
          ['thorns', 'coil', 'prism', 'order', 'lamp', 'thread'].includes(o.id),
        ),
        1,
      ),
    ];
  }
  if (strong || s.rewardSource === 'elite') {
    const guaranteed = drawOffers(s, relics, 1);
    return [
      ...guaranteed,
      ...drawOffers(
        s,
        [...relics, ...modifiers].filter(
          (o) => !guaranteed.some((a) => a.id === o.id),
        ),
        3 - guaranteed.length,
      ),
    ];
  }
  const sharpening = sharpeningOffer(s);
  const equipment = [
    ...equipmentOptions(s),
    ...upgradeOptions(s),
    ...(sharpening ? [sharpening] : []),
  ];
  const techniques = [
    ...SKILLS.filter((o) => !s.skills.includes(o.id)),
    ...modifiers,
  ];
  const offers = [
    ...drawOffers(s, equipment, 1),
    ...drawOffers(s, techniques, 1),
  ];
  const fallback = [...equipment, ...techniques, ...relics].filter(
    (o) => !offers.some((a) => a.id === o.id),
  );
  return [...offers, ...drawOffers(s, fallback, 2 - offers.length)];
}
function validJourneySave(s: State): boolean {
  const j = s.journey;
  const uint = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    !Array.isArray(s.offers) ||
    !s.offers.every((o) => o && typeof o.id === 'string') ||
    !Array.isArray(s.relics)
  )
    return false;
  if (
    !j ||
    !Array.isArray(j.nodes) ||
    j.nodes.length !== 32 ||
    !Array.isArray(j.visited) ||
    !s.streams ||
    !['map', 'encounters', 'loot'].every((k) =>
      uint(s.streams![k as keyof typeof s.streams]),
    ) ||
    !uint(s.seed) ||
    !uint(s.rng) ||
    !Array.isArray(s.path) ||
    s.path.length !== s.room ||
    j.visited.length !== s.room
  )
    return false;
  const ids = new Set(j.nodes.map((n) => n?.id));
  if (ids.size !== 32) return false;
  for (const n of j.nodes) {
    if (
      !n ||
      !Number.isInteger(n.depth) ||
      n.depth < 1 ||
      n.depth > 20 ||
      typeof n.name !== 'string' ||
      typeof n.description !== 'string' ||
      !Array.isArray(n.next)
    )
      return false;
    const local = ((n.depth - 1) % 10) + 1;
    const lane = n.id === `${n.depth}-0` ? 0 : n.id === `${n.depth}-1` ? 1 : -1;
    if (lane < 0 || (lane === 1 && ![2, 3, 4, 6, 7, 8].includes(local)))
      return false;
    const legalKinds =
      local === 3
        ? ['treasure']
        : local === 5
          ? ['shop']
          : local === 7
            ? ['event', 'trial']
            : local === 9
              ? ['rest']
              : local === 10
                ? ['boss']
                : [4, 8].includes(local)
                  ? ['battle', 'elite']
                  : ['battle'];
    if (!legalKinds.includes(n.kind)) return false;
    if (
      ['battle', 'elite', 'boss'].includes(n.kind) &&
      (!Array.isArray(n.roster) ||
        !n.roster.length ||
        n.roster.length > 2 ||
        !n.roster.every((e) => Object.hasOwn(ENEMY_CATALOG, e)))
    )
      return false;
    if (
      n.roster?.includes('redactor') &&
      ((s.rulesVersion ?? 0) < 4 ||
        n.depth !== 20 ||
        !s.flags.includes('run:forbidden'))
    )
      return false;
    const expected =
      n.depth === 20
        ? []
        : [1, 5].includes(local)
          ? [`${n.depth + 1}-0`, `${n.depth + 1}-1`]
          : [2, 3, 6, 7].includes(local)
            ? [`${n.depth + 1}-${lane}`]
            : [`${n.depth + 1}-0`];
    if (
      JSON.stringify(n.next) !== JSON.stringify(expected) ||
      n.next.some((id) => !ids.has(id))
    )
      return false;
  }
  for (let i = 0; i < j.visited.length; i++) {
    const node = j.nodes.find((n) => n.id === j.visited[i]);
    if (
      !node ||
      node.depth !== i + 1 ||
      node.name !== s.path[i] ||
      (i &&
        !j.nodes.find((n) => n.id === j.visited[i - 1])!.next.includes(node.id))
    )
      return false;
  }
  const current = j.nodes.find((n) => n.id === j.current);
  if (
    !current ||
    j.current !== j.visited.at(-1) ||
    current.depth !== s.room ||
    current.kind !== s.roomKind
  )
    return false;
  if (
    s.seal !== undefined &&
    (!SEALS.some((o) => o.id === s.seal) ||
      s.room < 10 ||
      (s.room === 10 && s.phase !== 'map'))
  )
    return false;
  if (s.phase === 'reward') {
    const source =
      s.roomKind === 'boss'
        ? 'seal'
        : s.roomKind === 'treasure'
          ? 'treasure'
          : s.roomKind === 'elite'
            ? 'elite'
            : s.roomKind;
    if (
      s.rewardSource !== source ||
      !Array.isArray(s.offers) ||
      new Set(s.offers.map((o) => o?.id)).size !== s.offers.length
    )
      return false;
    if (
      source === 'seal' &&
      (s.room !== 10 ||
        s.offers.length !== 3 ||
        !s.offers.every(
          (o) => o.kind === 'seal' && SEALS.some((a) => a.id === o.id),
        ))
    )
      return false;
    if (
      source === 'treasure' &&
      (typeof s.treasureRerolled !== 'boolean' ||
        s.offers.length > 1 ||
        !s.offers.every(
          (o) =>
            o.kind === 'relic' &&
            RELICS.some((r) => r.id === o.id) &&
            !s.relics.includes(o.id),
        ))
    )
      return false;
  } else if (s.rewardSource !== undefined || s.treasureRerolled !== undefined)
    return false;
  if (
    s.phase === 'victory' &&
    (s.room !== 20 || s.roomKind !== 'boss' || s.offers.length)
  )
    return false;
  return true;
}

export type RouteNode = Room & {
  depth: number;
  status: 'visited' | 'current' | 'available' | 'future' | 'skipped';
};
export function routeMap(s: State): RouteNode[][] {
  if ((s.rulesVersion ?? 0) >= 3 && s.journey) {
    const j = s.journey,
      reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      j.nodes.find((n) => n.id === id)?.next.forEach(visit);
    };
    visit(j.current);
    const available = new Set(
      s.phase === 'map' ? nextRooms(s).map((n) => n.id) : [],
    );
    return Array.from({ length: TOTAL_ROOMS }, (_, i) =>
      j.nodes
        .filter((n) => n.depth === i + 1)
        .map(
          (n): RouteNode => ({
            ...n,
            status:
              n.id === j.current && s.phase !== 'victory'
                ? 'current'
                : j.visited.includes(n.id)
                  ? 'visited'
                  : available.has(n.id)
                    ? 'available'
                    : reachable.has(n.id)
                      ? 'future'
                      : 'skipped',
          }),
        ),
    );
  }
  return Array.from({ length: TOTAL_ROOMS }, (_, index) => {
    const depth = index + 1;
    const rooms = roomsAtDepth(depth);
    const visited = s.path?.[index];
    // Preserve named stops from older saves even when the encounter catalog changes.
    if (
      depth <= s.room &&
      visited &&
      !rooms.some((room) => room.name === visited)
    ) {
      rooms.push({
        id: `${depth}-legacy`,
        kind: depth === s.room ? s.roomKind : 'battle',
        name: visited,
        description: 'Комната из пройденного пути.',
      });
    }
    return rooms.map(
      (room): RouteNode => ({
        ...room,
        depth,
        status:
          depth <= s.room
            ? room.name === visited || (!visited && room === rooms[0])
              ? depth === s.room && s.phase !== 'victory'
                ? 'current'
                : 'visited'
              : 'skipped'
            : depth === s.room + 1 && s.phase === 'map'
              ? 'available'
              : 'future',
      }),
    );
  });
}

const ROOM_ENEMIES: Record<string, EnemyKind[]> = {
  '2-battle': ['paper-rat'],
  '2-armored': ['stapler'],
  '3-battle': ['moth'],
  '4-battle': ['eraser'],
  '4-elite': ['bell', 'paper-rat'],
  '6-battle': ['ink-slime'],
  '6-rooter': ['librarian'],
  '8-battle': ['candle'],
  '8-elite': ['safe', 'mirror'],
  '10-boss': ['censor'],
  '11-battle': ['reed-crab'],
  '12-battle': ['ink-scribe'],
  '12-elite': ['leech', 'moth'],
  '13-battle': ['ink-eel'],
  '14-battle': ['anchor'],
  '14-elite': ['ink-scribe', 'stapler'],
  '16-battle': ['lantern-fish'],
  '16-elite': ['librarian', 'leech'],
  '18-battle': ['ink-scribe', 'ink-slime'],
  '18-elite': ['mirror', 'anchor'],
  '20-boss': ['tide-keeper'],
};

export function enterRoom(input: State, id: string): Result {
  if (input.phase !== 'map')
    return result(input, [], 'Сначала заверши текущую комнату.');
  const room = nextRooms(input).find((r) => r.id === id);
  if (!room) return result(input, [], 'Этот путь недоступен.');
  const s = copy(input);
  s.room++;
  if ((s.rulesVersion ?? 0) >= 3) {
    s.journey!.current = room.id;
    s.journey!.visited.push(room.id);
    delete s.rewardSource;
    delete s.treasureRerolled;
  }
  s.heroPoison = 0;
  delete s.tide;
  delete s.redaction;
  delete s.echo;
  s.board.forEach((t) => {
    delete t.ink;
    delete t.root;
  });
  s.roomKind = room.kind;
  s.path.push(room.name);
  s.round = 1;
  s.block = 0;
  s.energy = s.hero === 'warden' ? 0 : 3;
  s.focus = 0;
  s.cast = false;
  s.moved = false;
  s.consumed = false;
  s.trial = null;
  delete s.echo;
  s.flags = s.flags.filter((f) => f.startsWith('run:'));
  s.offers = [];
  s.enemies = [];
  if (['battle', 'elite', 'boss'].includes(room.kind)) {
    s.phase = 'battle';
    const scale = Math.floor(s.room / 3) * 3;
    s.enemies = (room.roster ?? ROOM_ENEMIES[id]).map((kind) =>
      makeEnemy(
        s,
        kind,
        ENEMY_CATALOG[kind].hp + (room.kind === 'boss' ? 0 : scale),
      ),
    );
    s.target = s.enemies[0].id;
    newBoard(s);
    if (s.room > 10) startTide(s);
    note(s, `${room.name}. Враги показывают намерения.`);
  } else if (room.kind === 'treasure') {
    s.phase = 'reward';
    s.rewardSource = 'treasure';
    s.treasureRerolled = false;
    s.offers = treasureOffers(s);
  } else if (room.kind === 'shop') {
    s.phase = 'shop';
    s.offers = shopOffers(s);
  } else if (room.kind === 'rest') s.phase = 'rest';
  else if (room.kind === 'event') s.phase = 'event';
  else {
    s.phase = 'trial';
    s.energy = 0;
    s.trial = {
      remaining: 45,
      energy: 0,
      damage: 0,
      protection: 0,
      paused: true,
    };
    newBoard(s);
    note(s, 'Открой шлюз: 18 энергии от матчей и 30 урона.');
  }
  return result(s);
}
function upgradeOffer(f: Family): Offer {
  return {
    id: `up-${f}`,
    kind: 'upgrade',
    name: `${FAMILY_NAMES[f]} +`,
    description: {
      blade: 'Каждая группа клинков наносит на 2 урона больше.',
      shield: 'Каждая группа щитов даёт на 2 блока больше.',
      spark: 'Уровень 1: запас энергии 15. Уровень 2: +1 энергия на матч.',
      focus: 'Уровень 1: запас фокуса 9. Уровень 2: +1 фокус раз за ход.',
    }[f],
    tag: 'До конца забега',
  };
}
export function upgradeOptions(s: State) {
  return FAMILIES.filter((f) => s.upgrades[f] < 2).map(upgradeOffer);
}
function grant(s: State, offer: Offer, slot?: number): string | undefined {
  if (offer.kind === 'seal') {
    if (
      (s.rulesVersion ?? 0) < 3 ||
      s.rewardSource !== 'seal' ||
      s.seal ||
      !SEALS.some((o) => o.id === offer.id)
    )
      return 'Эта печать недоступна.';
    if (offer.id === 'red-line') {
      if (s.maxHp <= 8) return 'Нужно больше 8 максимального здоровья.';
      s.maxHp -= 8;
      s.hp = Math.min(s.hp, s.maxHp);
    }
    s.seal = offer.id as SealId;
    note(s, `Принята печать: ${offer.name}. ${offer.description}`);
    return;
  }
  if (offer.kind === 'equipment') {
    const item = equipmentById(offer.id);
    if (!item) return 'Неизвестный предмет экипировки.';
    const previous = equipmentById(s.equipment[item.slot]);
    if ((s.rulesVersion ?? 0) >= 2 && item.slot === 'weapon') {
      const quality = offer.quality;
      if (quality === undefined || ![0, 1, 2].includes(quality))
        return 'Неизвестное качество оружия.';
      if (previous?.id === item.id && quality === s.weaponQuality)
        return 'Такое оружие уже надето.';
      s.equipment.weapon = item.id;
      s.weaponQuality = quality;
      note(
        s,
        `Оружие: ${item.name}, качество ${quality}/2. ${WEAPON_RULES[item.id].short}.`,
      );
      return;
    }
    if (previous && previous.bonus >= item.bonus)
      return 'У тебя уже есть такая же или более сильная вещь.';
    s.equipment[item.slot] = item.id;
    if (item.slot === 'helmet') {
      const difference = item.bonus - (previous?.bonus ?? 0);
      s.maxHp += difference;
      s.hp = Math.min(s.maxHp, s.hp + difference);
    }
    note(
      s,
      `Надето: ${item.name}${previous ? ` вместо «${previous.name}»` : ''}`,
    );
    return;
  }
  if (offer.kind === 'relic') {
    if (s.relics.includes(offer.id)) return 'Эта реликвия уже есть.';
    s.relics.push(offer.id);
  }
  if (offer.kind === 'modifier') {
    if (s.modifiers.includes(offer.id))
      return 'Этот модификатор уже установлен.';
    if (s.modifiers.length >= 2) {
      if (slot === undefined || slot < 0 || slot > 1)
        return 'Выбери модификатор для замены.';
      s.modifiers[slot] = offer.id;
    } else s.modifiers.push(offer.id);
  }
  if (offer.kind === 'skill') {
    if (s.skills.includes(offer.id)) return 'Этот приём уже экипирован.';
    if (s.skills.length >= 2) {
      if (slot === undefined || slot < 0 || slot > 1)
        return 'Выбери приём для замены.';
      s.skills[slot] = offer.id;
    } else s.skills.push(offer.id);
  }
  if (offer.id === 'sharpen') {
    if (!sharpeningOffer(s)) return 'Оружие уже заточено до предела.';
    s.weaponQuality = ((s.weaponQuality ?? 0) + 1) as 1 | 2;
    note(s, `Оружие заточено: качество ${s.weaponQuality}/2.`);
    return;
  }
  if (offer.kind === 'upgrade') {
    const f = offer.id.slice(3) as Family;
    if (!FAMILIES.includes(f) || s.upgrades[f] >= 2)
      return 'Семейство уже улучшено до предела.';
    s.upgrades[f]++;
  }
  if (offer.kind === 'potion') {
    if (s.potions >= 2) return 'Оба места для зелий заняты.';
    s.potions++;
  }
  note(s, `Получено: ${offer.name}`);
}
export function chooseReward(
  input: State,
  id: string | null,
  slot?: number,
): Result {
  if (input.phase !== 'reward') return result(input, [], 'Награды сейчас нет.');
  const s = copy(input);
  if (id) {
    const offer = s.offers.find((o) => o.id === id);
    if (!offer) return result(input, [], 'Эта награда недоступна.');
    const error = grant(s, offer, slot);
    if (error) return result(input, [], error);
  }
  if ((s.rulesVersion ?? 0) >= 3) {
    if (!id && s.rewardSource === 'battle') {
      s.gold += 8;
      note(s, 'Вся награда обменяна на 8 золота.');
    }
    if (s.rewardSource === 'seal') {
      heal(s, Math.ceil(s.maxHp / 2));
      s.potions = Math.min(2, s.potions + 1);
      s.heroPoison = 0;
      note(
        s,
        'Передышка перед архивом: до 50% максимального здоровья и зелье (до 2).',
      );
    }
    delete s.rewardSource;
    delete s.treasureRerolled;
  }
  s.offers = [];
  s.phase = 'map';
  return result(s);
}
function shopOffers(s: State): Offer[] {
  const relicPool = relicPoolFor(s).filter(
    (r) =>
      !s.relics.includes(r.id) &&
      ((s.rulesVersion ?? 0) >= 2 || s.flags.includes(`run:available:${r.id}`)),
  );
  const offers: Offer[] = [];
  const gearPool = equipmentOptions(s);
  for (let i = 0; i < 2 && gearPool.length; i++) {
    const item = gearPool.splice(
      Math.floor(random(s, 'loot') * gearPool.length),
      1,
    )[0];
    if ((s.rulesVersion ?? 0) >= 2)
      for (let j = gearPool.length - 1; j >= 0; j--)
        if (gearPool[j].slot === item.slot) gearPool.splice(j, 1);
    offers.push({ ...item, cost: [25, 40, 65][item.tier] });
  }
  for (let i = 0; i < 2 && relicPool.length; i++)
    offers.push({
      ...relicPool.splice(
        Math.floor(random(s, 'loot') * relicPool.length),
        1,
      )[0],
      cost: 65,
    });
  const skills = SKILLS.filter((x) => !s.skills.includes(x.id));
  if (skills.length)
    offers.push({
      ...skills[Math.floor(random(s, 'loot') * skills.length)],
      cost: 40,
    });
  const mods = modifierPoolFor(s).filter((x) => !s.modifiers.includes(x.id));
  if (mods.length)
    offers.push({
      ...mods[Math.floor(random(s, 'loot') * mods.length)],
      cost: 55,
    });
  offers.push({
    id: 'potion',
    kind: 'potion',
    name: 'Лечебное зелье',
    description: 'Восстанавливает 8 здоровья в бою. До двух зелий с собой.',
    tag: 'Расходник',
    cost: 25,
  });
  const ups = upgradeOptions(s);
  const sharpening = sharpeningOffer(s);
  if (sharpening) offers.push({ ...sharpening, cost: 40 });
  if (ups.length)
    offers.push({
      ...ups[Math.floor(random(s, 'loot') * ups.length)],
      cost: (s.rulesVersion ?? 0) >= 3 ? 40 : 35,
    });
  // Roll once on entry, using the saved run RNG. Displaying or buying an offer
  // never re-rolls its price, including purchases that need a replacement slot.
  const salePool = offers.map((_, index) => index);
  for (let i = 0; i < Math.min(2, offers.length - 1); i++) {
    const index = salePool.splice(
      Math.floor(random(s, 'loot') * salePool.length),
      1,
    )[0];
    const offer = offers[index];
    const discount = [20, 30, 40][Math.floor(random(s, 'loot') * 3)];
    const baseCost = offer.cost!;
    offers[index] = {
      ...offer,
      baseCost,
      discount,
      cost: Math.ceil((baseCost * (100 - discount)) / 100),
    };
  }
  return offers;
}
export function buy(input: State, id: string, slot?: number): Result {
  if (input.phase !== 'shop') return result(input);
  const offer = input.offers.find((o) => o.id === id);
  if (!offer || !offer.cost) return result(input, [], 'Предмет недоступен.');
  if (input.gold < offer.cost) return result(input, [], 'Недостаточно золота.');
  const s = copy(input);
  const error = grant(s, offer, slot);
  if (error) return result(input, [], error);
  s.gold -= offer.cost;
  s.offers = s.offers.filter((o) => o.id !== id);
  return result(s);
}
export function leaveRoom(input: State): Result {
  if (!['shop', 'event', 'rest'].includes(input.phase)) return result(input);
  const s = copy(input);
  s.phase = 'map';
  s.offers = [];
  return result(s);
}
export function rest(input: State, choice: string): Result {
  if (input.phase !== 'rest') return result(input);
  const s = copy(input);
  if (choice === 'heal') heal(s, Math.ceil(s.maxHp * 0.25));
  else {
    const offer = restOptions(s).find((x) => x.id === choice);
    if (!offer) return result(input, [], 'Улучшение недоступно.');
    const error = grant(s, offer);
    if (error) return result(input, [], error);
  }
  s.phase = 'map';
  return result(s);
}
export function eventChoice(input: State, choice: string): Result {
  if (input.phase !== 'event') return result(input);
  if (choice === 'forbidden') {
    if (!canEnterForbidden(input))
      return result(
        input,
        [],
        'Проход доступен в насосной после первой победы. Нужно больше 6 максимального здоровья.',
      );
    const s = copy(input);
    s.maxHp -= 6;
    s.hp = Math.min(s.hp, s.maxHp);
    s.flags.push('run:forbidden');
    const final = s.journey!.nodes.find((n) => n.depth === 20)!;
    final.name = 'Запретный отдел — Редактор';
    final.roster = ['redactor'];
    final.description =
      'Альтернативный финал. Запрет семейств: правка, пробивание и смена комбинаций помогут пройти.';
    s.phase = 'map';
    note(
      s,
      'Цена пропуска: −6 максимального здоровья до конца спуска. Финал заменён на Запретный отдел.',
    );
    return result(s);
  }
  if (input.room === 17 && !['repair', 'supplies'].includes(choice))
    return result(input, [], 'Почини насос или забери припасы.');
  const s = copy(input);
  if (choice === 'repair') {
    if (s.room !== 17 || s.gold < 30 || s.flags.includes('run:sluice'))
      return result(input, [], 'Насос можно починить здесь за 30 золота.');
    s.gold -= 30;
    s.flags.push('run:sluice');
    s.phase = 'map';
    note(s, 'Насос работает. Каждый прилив до конца забега слабее на 2.');
    return result(s);
  }
  if (choice === 'relic') {
    if (s.hp <= 5) return result(input, [], 'Нужно больше 5 здоровья.');
    recordDamage(s, 'Тайник: цена находки', 5);
    s.hp -= 5;
    s.phase = 'reward';
    if ((s.rulesVersion ?? 0) >= 3) s.rewardSource = 'event';
    s.offers = rewardOffers(s, true);
  } else if (choice === 'supplies') {
    heal(s, 5);
    s.gold += 10;
    s.phase = 'map';
  } else return result(input, [], 'Выбери действие.');
  return result(s);
}
export function pauseTrial(input: State, paused: boolean): Result {
  if (input.phase !== 'trial' || !input.trial) return result(input);
  const s = copy(input);
  s.trial!.paused = paused;
  return result(s);
}
export function tickTrial(input: State, seconds: number): Result {
  if (input.phase !== 'trial' || !input.trial || input.trial.paused)
    return result(input);
  if (!Number.isFinite(seconds) || seconds <= 0) return result(input);
  const s = copy(input);
  s.trial!.remaining = Math.max(0, s.trial!.remaining - seconds);
  if (s.trial!.remaining === 0) {
    const cost = Math.max(0, 6 - Math.floor(s.trial!.protection / 6));
    recordDamage(s, 'Закрывшийся шлюз', Math.min(cost, s.hp - 1));
    s.hp = Math.max(1, s.hp - cost);
    s.trial = null;
    delete s.echo;
    s.phase = 'map';
    note(s, `Шлюз закрылся. Потеряно ${cost} здоровья. Можно продолжить путь.`);
  }
  return result(s);
}
function validDamageEvents(value: unknown): value is DamageEvent[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (e) =>
        e &&
        typeof e.source === 'string' &&
        [e.amount, e.blocked, e.room, e.round].every(
          (n) => Number.isInteger(n) && n >= 0,
        ),
    )
  );
}
export function isSave(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  return (
    s.version === 2 &&
    (s.hero === undefined ||
      ((s.rulesVersion ?? 0) >= 4 && HEROES.some((h) => h.id === s.hero))) &&
    (s.difficulty === undefined ||
      ((s.rulesVersion ?? 0) >= 4 && [0, 1].includes(s.difficulty))) &&
    (s.redaction === undefined ||
      ((s.rulesVersion ?? 0) >= 4 &&
        s.redaction !== null &&
        FAMILIES.includes(s.redaction.family) &&
        Number.isInteger(s.redaction.expires) &&
        s.redaction.expires >= s.round &&
        s.phase === 'battle' &&
        Array.isArray(s.enemies) &&
        s.enemies.some((e) => e.kind === 'redactor' && e.hp > 0))) &&
    (s.echo === undefined ||
      ((s.rulesVersion ?? 0) >= 4 &&
        FAMILIES.includes(s.echo) &&
        ['battle', 'trial'].includes(s.phase) &&
        Array.isArray(s.relics) &&
        s.relics.includes('tape'))) &&
    (s.damageEvents === undefined || validDamageEvents(s.damageEvents)) &&
    (s.chronicle === undefined ||
      (Array.isArray(s.chronicle) &&
        s.chronicle.length <= 80 &&
        s.chronicle.every((x) => typeof x === 'string'))) &&
    isEquipment(s.equipment) &&
    (s.rulesVersion === undefined ||
      s.rulesVersion === 2 ||
      s.rulesVersion === 3 ||
      s.rulesVersion === 4) &&
    ((s.rulesVersion ?? 0) < 3 || validJourneySave(s)) &&
    ((s.rulesVersion ?? 0) < 2 ||
      (Number.isInteger(s.weaponQuality) &&
        [0, 1, 2].includes(s.weaponQuality!))) &&
    typeof s.runId === 'string' &&
    Number.isFinite(s.rng) &&
    Number.isInteger(s.room) &&
    s.room >= 1 &&
    s.room <= TOTAL_ROOMS &&
    (s.room <= 10 || s.phase !== 'battle' || s.tide !== undefined) &&
    (s.tide === undefined ||
      (s.tide !== null &&
        typeof s.tide === 'object' &&
        s.room > 10 &&
        s.phase === 'battle' &&
        Number.isInteger(s.tide.row) &&
        s.tide.row >= 0 &&
        s.tide.row < 6 &&
        Number.isInteger(s.tide.turns) &&
        s.tide.turns >= 1 &&
        s.tide.turns <= 3 &&
        typeof s.tide.cleared === 'boolean')) &&
    Array.isArray(s.board) &&
    s.board.length === 36 &&
    s.board.every(
      (t) =>
        t &&
        FAMILIES.includes(t.family) &&
        Number.isFinite(t.id) &&
        [
          null,
          'venom',
          'bomb',
          ...((s.rulesVersion ?? 0) >= 4 ? ['spiked', 'marked'] : []),
        ].includes(t.variant) &&
        (t.ink === undefined || t.ink === true),
    ) &&
    s.board.filter((t) => t.ink).length <= 6 &&
    Number.isFinite(s.hp) &&
    Number.isFinite(s.maxHp) &&
    s.maxHp > 0 &&
    s.hp <= s.maxHp &&
    Number.isFinite(s.energy) &&
    Number.isFinite(s.focus) &&
    s.hp >= 0 &&
    s.energy >= 0 &&
    s.focus >= 0 &&
    Array.isArray(s.enemies) &&
    s.enemies.every(
      (e) =>
        e &&
        Object.hasOwn(ENEMY_CATALOG, e.kind) &&
        Number.isFinite(e.hp) &&
        e.hp >= 0 &&
        Number.isFinite(e.maxHp) &&
        e.maxHp > 0 &&
        e.hp <= e.maxHp &&
        Number.isFinite(e.damage) &&
        e.damage >= 0 &&
        Number.isFinite(e.id),
    ) &&
    Array.isArray(s.relics) &&
    Array.isArray(s.modifiers) &&
    Array.isArray(s.skills) &&
    Array.isArray(s.flags) &&
    Array.isArray(s.log) &&
    Array.isArray(s.offers) &&
    s.offers.every(
      (offer) =>
        offer &&
        (offer.kind !== 'equipment' ||
          (!!equipmentById(offer.id) &&
            ((s.rulesVersion ?? 0) < 2 ||
              equipmentById(offer.id)?.slot !== 'weapon' ||
              [0, 1, 2].includes(offer.quality!)))),
    ) &&
    !!s.stats &&
    !!s.balance &&
    !!s.upgrades &&
    [
      'battle',
      'reward',
      'map',
      'shop',
      'rest',
      'event',
      'trial',
      'victory',
      'defeat',
    ].includes(s.phase)
  );
}
// Keep the existing storage key so an ongoing local run is upgraded in place.
// Migration is pure and consumes no randomness; malformed gear is never accepted.
export function loadSave(value: unknown): State | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const migrated =
    source.version === 1 && source.equipment === undefined
      ? {
          ...source,
          version: 2,
          equipment: startingEquipment(),
          heroPoison: source.heroPoison ?? 0,
        }
      : source;
  return isSave(migrated) ? copy(migrated) : null;
}
export function isMeta(value: unknown): value is Meta {
  if (!value || typeof value !== 'object') return false;
  const m = value as Meta;
  return (
    m.version === 1 &&
    (m.marks === undefined ||
      (Array.isArray(m.marks) &&
        m.marks.every(
          (x) =>
            typeof x === 'string' &&
            /^(hard:)?(wanderer|warden):(tide-keeper|redactor)$/.test(x),
        ))) &&
    Array.isArray(m.unlocked) &&
    m.unlocked.every((x) => ACHIEVEMENTS.some((a) => a.id === x)) &&
    Number.isInteger(m.streak) &&
    m.streak >= 0 &&
    Number.isInteger(m.best) &&
    Number.isInteger(m.wins) &&
    Array.isArray(m.finished) &&
    m.finished.every((x) => typeof x === 'string') &&
    (m.seen === undefined ||
      (Array.isArray(m.seen) && m.seen.every((x) => typeof x === 'string'))) &&
    (m.history === undefined ||
      (Array.isArray(m.history) &&
        m.history.length <= 30 &&
        m.history.every(
          (r) =>
            r &&
            typeof r.id === 'string' &&
            Number.isInteger(r.seed) &&
            ['victory', 'defeat', 'abandoned'].includes(r.outcome) &&
            typeof r.modified === 'boolean' &&
            Number.isInteger(r.room) &&
            Array.isArray(r.path) &&
            r.path.every((x) => typeof x === 'string') &&
            Array.isArray(r.relics) &&
            Array.isArray(r.modifiers) &&
            !!r.stats &&
            Array.isArray(r.log) &&
            r.log.every((x) => typeof x === 'string') &&
            validDamageEvents(r.damageEvents),
        )))
  );
}

export function canCast(s: State, id: string): boolean {
  const c: Record<string, [number, number, number]> = {
    binding: [0, 0, 0],
    bolt: [6, 0, 0],
    guard: [4, 0, 0],
    pierce: [0, 3, 0],
    blood: [0, 0, 2],
    seal: [3, 0, 2],
    reshape: [0, 6, 0],
    edit: [0, 3, 0],
  };
  const cost = c[id];
  return (
    !!cost &&
    ['battle', 'trial'].includes(s.phase) &&
    !s.trial?.paused &&
    !s.cast &&
    (id === 'binding'
      ? (s.rulesVersion ?? 0) >= 4 &&
        s.relics.includes('binding') &&
        s.block > 0
      : id === 'edit' || s.skills.includes(id)) &&
    s.energy >= cost[0] &&
    s.focus >= cost[1] &&
    s.hp > cost[2]
  );
}

export function configureRun(
  s: State,
  preset: 'normal' | 'shields' | 'poison' | 'cascades' | 'editor' | 'runes',
): State {
  if (preset === 'normal') return s;
  s.modified = true;
  s.flags.push(...RELICS.map((x) => `run:available:${x.id}`));
  if (preset === 'shields') s.relics = ['thorns', 'coil', 'return'];
  if (preset === 'editor') {
    s.equipment.weapon = 'gear-axe';
    s.relics = ['order', 'thread'];
    s.focus = 3;
  }
  if (preset === 'runes') {
    s.equipment.weapon = 'gear-rune-sword';
    s.relics = ['coil', 'lamp'];
  }
  if (preset === 'poison') {
    if ((s.rulesVersion ?? 0) >= 2) s.equipment.weapon = 'gear-rusty-dagger';
    s.modifiers = ['venom'];
    s.relics = ['toxin', 'heart'];
  }
  if (preset === 'cascades') {
    s.modifiers = ['bomb'];
    s.relics = ['prism', 'conductor'];
  }
  newBoard(s);
  return s;
}

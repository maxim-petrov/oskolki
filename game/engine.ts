// Pure deterministic game state. Rendering only replays the returned frames.
export type Family = 'blade' | 'shield' | 'spark' | 'focus';
export type Variant = 'venom' | 'bomb' | null;
export type Tile = {
  id: number;
  family: Family;
  variant: Variant;
  root?: { owner: number; expires: number };
};
export type Enemy = {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  poison: number;
  kind: 'raider' | 'armored' | 'cultist' | 'poisoner' | 'rooter' | 'boss';
  damage: number;
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
  kind: 'battle' | 'elite' | 'event' | 'trial' | 'shop' | 'rest' | 'boss';
  name: string;
  description: string;
};
export type Offer = {
  id: string;
  kind: 'relic' | 'modifier' | 'skill' | 'upgrade' | 'potion' | 'equipment';
  name: string;
  description: string;
  tag: string;
  cost?: number;
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
  gear('gear-cleaver', 'weapon', 1, 'Железный тесак', 2),
  gear('gear-iron-helmet', 'helmet', 1, 'Железный шлем', 8),
  gear('gear-jacket', 'clothing', 1, 'Кожаная куртка', 2),
  gear('gear-reinforced-trousers', 'trousers', 1, 'Укреплённые штаны', 1),
  gear('gear-rune-sword', 'weapon', 2, 'Рунный меч', 4),
  gear('gear-bronze-helmet', 'helmet', 2, 'Шлем хранителя', 12),
  gear('gear-brigandine', 'clothing', 2, 'Бригантина', 4),
  gear('gear-guard-trousers', 'trousers', 2, 'Штаны стража', 2),
];
export const equipmentById = (id: string | null | undefined) =>
  EQUIPMENT.find((item) => item.id === id);
export const startingEquipment = (): Equipment => ({
  weapon: 'gear-cutter',
  helmet: null,
  clothing: 'gear-shirt',
  trousers: 'gear-worn-trousers',
});
export function equipmentBonus(s: State, slot: EquipmentSlot) {
  return equipmentById(s.equipment[slot])?.bonus ?? 0;
}
export function equipmentSummary(item: EquipmentItem | undefined) {
  if (!item) return 'Без шлема';
  if (!item.bonus) return 'Без бонусов';
  return {
    weapon: `+${item.bonus} урона клинками`,
    helmet: `+${item.bonus} здоровья`,
    clothing: `+${item.bonus} блока щитами`,
    trousers: `+${item.bonus} к запасу фокуса`,
  }[item.slot];
}
export function equipmentOptions(s: State): EquipmentItem[] {
  const maxTier = s.room >= 6 ? 2 : 1;
  // One next upgrade per slot; never offer gear that is already worn or weaker.
  return EQUIPMENT_SLOTS.flatMap((slot) => {
    const tier = equipmentById(s.equipment[slot])?.tier ?? -1;
    const next = EQUIPMENT.find(
      (item) =>
        item.slot === slot && item.tier === tier + 1 && item.tier <= maxTier,
    );
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
};
export type State = {
  version: 2;
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
export const itemById = (id: string) =>
  [...RELICS, ...MODIFIERS, ...SKILLS, ...EQUIPMENT].find((x) => x.id === id);
export const copy = <T>(s: T): T => JSON.parse(JSON.stringify(s));
// Mulberry32, adapted from Max's match3-engine/src/engine/rng.ts.
export function random(s: State): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function note(s: State, message: string) {
  s.log = [message, ...s.log].slice(0, 8);
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
function hit(s: State, value: number, piercing = false, direct = true) {
  if (s.phase === 'trial' && s.trial) {
    s.trial.damage += value;
    return;
  }
  const e =
    s.enemies.find((e) => e.id === s.target && e.hp > 0) ??
    s.enemies.find((e) => e.hp > 0);
  if (!e) return;
  if (
    direct &&
    e.poison > 0 &&
    s.relics.includes('toxin') &&
    once(s, 'turn:toxin')
  )
    e.poison += 2;
  const absorb = piercing ? 0 : Math.min(value, e.block);
  e.block -= absorb;
  const damage = Math.min(e.hp, value - absorb);
  e.hp -= damage;
  s.stats.damage += damage;
  if (e.hp <= 0) {
    s.stats.kills++;
    if (e.poison > 0 && s.relics.includes('heart') && once(s, 'battle:heart'))
      heal(s, 3);
  }
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
function resolve(s: State, frames: Frame[], manual: boolean) {
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
    const collateral = new Set<number>();
    for (const indices of matches) {
      s.stats.matches++;
      const family = s.board[indices[0]].family;
      const count = indices.length;
      if (count >= 5) {
        s.stats.big++;
        if (s.relics.includes('thread') && once(s, 'battle:thread')) heal(s, 3);
      }
      if (family === 'blade') {
        poison(s, indices.filter((i) => s.board[i].variant === 'venom').length);
        const value =
          count * s.balance.blade +
          s.upgrades.blade * 2 +
          equipmentBonus(s, 'weapon');
        hit(s, value);
        note(s, `Клинки: ${value} урона`);
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
        s.block += block;
        if (s.trial) s.trial.protection += block;
        note(s, `Щиты: +${block} блока`);
        if (s.relics.includes('thorns') && once(s, 'turn:thorns')) {
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
    collapse(s, removed);
  }
  if (!validMoves(s.board).length) {
    newBoard(s);
    note(s, 'Ходов нет — поле бесплатно перемешано');
  }
}
export function intent(s: State, e: Enemy) {
  const rage =
    Math.max(
      0,
      s.round - (s.roomKind === 'boss' ? 16 : s.roomKind === 'elite' ? 12 : 8),
    ) * 2;
  if (e.kind === 'rooter' && s.round % 2 === 1)
    return { type: 'roots', value: 2, text: 'Корни: 2 фишки' };
  if (e.kind === 'poisoner' && s.round % 2 === 0)
    return { type: 'poison', value: 2, text: 'Наложит 2 яда' };
  if (e.kind === 'boss' && s.round % 3 === 2)
    return { type: 'prepare', value: 0, text: 'Готовит сильный удар' };
  if (e.kind === 'armored' && s.round % 2 === 1)
    return { type: 'block', value: 8, text: 'Защита 8' };
  const value =
    Math.round(e.damage * s.balance.enemyPower) +
    rage +
    (e.kind === 'boss' && s.round % 3 === 0 ? 6 : 0);
  return { type: 'attack', value, text: `Удар ${value}` };
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
    note(s, 'Странник пал. Следующий путь будет другим.');
  } else if (s.phase === 'battle' && s.enemies.every((e) => e.hp <= 0)) {
    s.gold += s.roomKind === 'boss' ? 40 : s.roomKind === 'elite' ? 30 : 15;
    if (s.roomKind === 'elite' && !s.flags.includes('run:elite'))
      s.flags.push('run:elite');
    s.phase = s.roomKind === 'boss' ? 'victory' : 'reward';
    s.offers = rewardOffers(s);
    note(
      s,
      s.phase === 'victory'
        ? 'Привратник повержен. Крипта пройдена.'
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
    s.offers = rewardOffers(s, true);
    note(s, 'Шлюз открыт! Испытание пройдено.');
    s.trial = null;
  }
}
export function startRun(
  seed = 19062026,
  balance: Balance = DEFAULT_BALANCE,
): State {
  const s: State = {
    version: 2,
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
    flags: ['run:available:thorns', 'run:available:order'],
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
  s.enemies = [makeEnemy(s, 'raider', 18)];
  s.target = s.enemies[0].id;
  newBoard(s);
  return s;
}
function makeEnemy(s: State, kind: Enemy['kind'], hp: number): Enemy {
  return {
    id: ++s.serial,
    kind,
    hp,
    maxHp: hp,
    name: {
      raider: 'Костяной налётчик',
      armored: 'Латный страж',
      cultist: 'Служитель праха',
      poisoner: 'Отравитель',
      rooter: 'Корневик',
      boss: 'Привратник',
    }[kind],
    block: 0,
    poison: 0,
    damage:
      kind === 'cultist'
        ? 4
        : kind === 'poisoner'
          ? 3
          : kind === 'rooter'
            ? 5
            : kind === 'armored'
              ? 8
              : 6,
  };
}
export function move(
  input: State,
  axis: 'row' | 'col',
  line: number,
  amount: number,
): Result {
  if (
    !['battle', 'trial'].includes(input.phase) ||
    input.moved ||
    input.trial?.paused
  )
    return result(input, [], 'Сначала заверши ход.');
  if (
    !Number.isInteger(line) ||
    line < 0 ||
    line > 5 ||
    !Number.isInteger(amount) ||
    amount % 6 === 0
  )
    return result(input, [], 'Выбери строку или столбец.');
  const b = shifted(input.board, axis, line, amount);
  if (!groups(b).length)
    return result(input, [], 'Нет комбинации — сдвиг возвращён.');
  const s = copy(input);
  s.board = b;
  s.moved = s.phase !== 'trial';
  const frames: Frame[] = [];
  resolve(s, frames, true);
  if (s.phase === 'trial') {
    s.cast = false;
    s.consumed = false;
    s.flags = s.flags.filter(
      (f) =>
        f.startsWith('battle:') || f.startsWith('run:') || f === 'vessel:armed',
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
  if (s.heroPoison > 0) {
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
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    if (e.poison > 0) {
      const damage = Math.min(e.hp, e.poison);
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
    const action = intent(s, e);
    e.block = 0;
    if (action.type === 'poison') {
      s.heroPoison = (s.heroPoison ?? 0) + action.value;
      note(s, 'Герой отравлен: +2 яда');
    }
    if (action.type === 'roots') {
      const candidates = s.board.filter((t) => !t.root);
      for (let n = 0; n < 2 && candidates.length; n++) {
        const t = candidates.splice(
          Math.floor(random(s) * candidates.length),
          1,
        )[0];
        t.root = { owner: e.id, expires: s.round + 1 };
      }
      note(s, 'Собери отмеченные корнями фишки до следующего ответа.');
    }
    if (action.type === 'block') e.block = action.value;
    if (action.type === 'attack') {
      const blocked = Math.min(s.block, action.value);
      s.block -= blocked;
      s.stats.blocked += blocked;
      s.hp -= action.value - blocked;
      note(s, `${e.name}: ${action.value - blocked} урона, ${blocked} в блок`);
    }
    if (action.type === 'prepare') note(s, 'Привратник поднимает топор…');
    frames.push({
      state: copy(s),
      cells: [],
      label: action.type === 'attack' ? `${e.name} атакует` : action.text,
      cue: {
        actor: e.id,
        type:
          action.type === 'block'
            ? 'guard'
            : (action.type as CombatCue['type']),
        target: 'hero',
      },
    });
    if (s.hp <= 0) break;
  }
  checkFinish(s);
  if (s.phase === 'battle') {
    s.round++;
    s.block = 0;
    s.moved = false;
    s.cast = false;
    s.consumed = false;
    s.flags = s.flags.filter(
      (f) =>
        f.startsWith('battle:') || f.startsWith('run:') || f === 'vessel:armed',
    );
  }
  return result(s, frames);
}
export function castSkill(
  input: State,
  id: string,
  index = 0,
  family: Family = 'blade',
): Result {
  if (
    !['battle', 'trial'].includes(input.phase) ||
    input.cast ||
    input.trial?.paused
  )
    return result(input, [], 'Одна способность за ход.');
  if (id !== 'edit' && !input.skills.includes(id))
    return result(input, [], 'Этот приём не экипирован.');
  const costs: Record<string, [number, number, number]> = {
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
  if (input.energy < cost[0] || input.focus < cost[1] || input.hp <= cost[2])
    return result(input, [], 'Недостаточно ресурсов.');
  if (index < 0 || index >= 36 || !FAMILIES.includes(family))
    return result(input, [], 'Выбери фишку на поле.');
  const s = copy(input);
  s.cast = true;
  s.stats.skills++;
  s.energy -= cost[0];
  s.focus -= cost[1];
  s.hp -= cost[2];
  if (cost[2]) {
    s.stats.sacrifices++;
    if (s.relics.includes('vessel') && once(s, 'battle:vessel'))
      s.flags.push('vessel:armed');
  }
  if (cost[0] >= 6 && s.relics.includes('return')) s.flags.push('return:armed');
  const bonus = cost[2] && s.relics.includes('lens') ? 4 : 0;
  if (id === 'bolt') hit(s, 12);
  if (id === 'guard') s.block += 8;
  if (id === 'pierce') hit(s, 8, true);
  if (id === 'blood') hit(s, 8 + bonus);
  if (id === 'seal') hit(s, 16 + bonus);
  if (id === 'edit') {
    s.board[index] = tile(s, family);
    s.board[index].variant = null;
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
    id === 'edit' ? 'Правка: фишка заменена' : `Приём: ${itemById(id)?.name}`,
  );
  const frames: Frame[] = [
    {
      state: copy(s),
      cells:
        id === 'edit'
          ? [index]
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
            : ['blood', 'pierce'].includes(id)
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
  const gearPool = equipmentOptions(s);
  const equipment = gearPool.length
    ? [gearPool[Math.floor(random(s) * gearPool.length)]]
    : [];
  if (s.room === 1)
    return [
      ...equipment,
      ...[RELICS[0], ...MODIFIERS].filter(
        (x) => !s.relics.includes(x.id) && !s.modifiers.includes(x.id),
      ),
    ];
  const pool = [
    ...RELICS.filter(
      (x) =>
        !s.relics.includes(x.id) &&
        (BASE_RELICS.includes(x.id) ||
          s.flags.includes(`run:available:${x.id}`)),
    ),
    ...MODIFIERS.filter((x) => !s.modifiers.includes(x.id)),
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
  if (candidate >= 0) offers.push(pool.splice(candidate, 1)[0]);
  while (offers.length < 3 && pool.length)
    offers.push(pool.splice(Math.floor(random(s) * pool.length), 1)[0]);
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
export type Meta = {
  version: 1;
  unlocked: string[];
  streak: number;
  best: number;
  wins: number;
  finished: string[];
};
export const EMPTY_META: Meta = {
  version: 1,
  unlocked: [],
  streak: 0,
  best: 0,
  wins: 0,
  finished: [],
};
export function updateMeta(input: Meta, s: State): Meta {
  const m = copy(input);
  const checks: Record<string, boolean> = {
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
    if (!s.modified) {
      if (s.phase === 'victory') {
        m.streak++;
        m.wins++;
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
  }
  return m;
}
export function availableRelics(m: Meta) {
  return [
    ...BASE_RELICS,
    ...ACHIEVEMENTS.filter((a) => m.unlocked.includes(a.id)).map(
      (a) => a.reward,
    ),
  ];
}
export function withUnlocks(s: State, m: Meta) {
  s.flags = s.flags.filter((f) => !f.startsWith('run:available:'));
  s.flags.push(...availableRelics(m).map((id) => `run:available:${id}`));
  return s;
}
export function nextRooms(s: State): Room[] {
  const n = s.room + 1;
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
  if (n === 10)
    return [
      mk(
        'boss',
        'Привратник',
        'Босс: удар 6 → подготовка → удар 12. Победа завершит забег.',
      ),
    ];
  if (n === 6)
    return [
      mk(
        'battle',
        'Лаборатория ядов',
        'Отравитель чередует обычный удар и яд.',
      ),
      {
        ...mk(
          'battle',
          'Проросшие своды',
          'Корневик помечает фишки. Собери их до следующего ответа.',
        ),
        id: `${n}-rooter`,
      },
    ];
  if (n === 3)
    return [
      mk('event', 'Забытый алтарь', 'Неизвестная реликвия за часть здоровья.'),
      mk('battle', 'Костяной дозор', 'Обычный бой. Золото и выбор награды.'),
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
  if (n === 4 || n === 8)
    return [
      mk(
        'battle',
        'Старые катакомбы',
        'Один противник. Более безопасный путь.',
      ),
      mk(
        'elite',
        'Зал двух стражей',
        'Два противника. Больше золота и сильная награда.',
      ),
    ];
  return [
    mk('battle', 'Костяной дозор', 'Быстрый противник. Удар каждый ход.'),
    {
      ...mk('battle', 'Латный караул', 'Страж чередует защиту и атаку.'),
      id: `${n}-armored`,
    },
  ];
}
export function enterRoom(input: State, id: string): Result {
  if (input.phase !== 'map')
    return result(input, [], 'Сначала заверши текущую комнату.');
  const room = nextRooms(input).find((r) => r.id === id);
  if (!room) return result(input, [], 'Этот путь недоступен.');
  const s = copy(input);
  s.room++;
  s.heroPoison = 0;
  s.roomKind = room.kind;
  s.path.push(room.name);
  s.round = 1;
  s.block = 0;
  s.energy = 3;
  s.focus = 0;
  s.cast = false;
  s.moved = false;
  s.consumed = false;
  s.trial = null;
  s.flags = s.flags.filter((f) => f.startsWith('run:'));
  s.offers = [];
  s.enemies = [];
  if (['battle', 'elite', 'boss'].includes(room.kind)) {
    s.phase = 'battle';
    const scale = Math.floor(s.room / 3) * 3;
    if (room.kind === 'boss') s.enemies = [makeEnemy(s, 'boss', 70)];
    else if (room.kind === 'elite')
      s.enemies = [
        makeEnemy(s, 'raider', 18 + scale),
        makeEnemy(s, 'cultist', 14 + scale),
      ];
    else
      s.enemies = [
        makeEnemy(
          s,
          id.endsWith('rooter')
            ? 'rooter'
            : s.room === 6
              ? 'poisoner'
              : id.endsWith('armored')
                ? 'armored'
                : 'raider',
          (id.endsWith('armored') ? 22 : 18) + scale,
        ),
      ];
    s.target = s.enemies[0].id;
    newBoard(s);
    note(s, `${room.name}. Враги показывают намерения.`);
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
  if (offer.kind === 'equipment') {
    const item = equipmentById(offer.id);
    if (!item) return 'Неизвестный предмет экипировки.';
    const previous = equipmentById(s.equipment[item.slot]);
    if (previous && previous.tier >= item.tier)
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
  s.offers = [];
  s.phase = 'map';
  return result(s);
}
function shopOffers(s: State): Offer[] {
  const relicPool = RELICS.filter(
    (r) =>
      !s.relics.includes(r.id) && s.flags.includes(`run:available:${r.id}`),
  );
  const offers: Offer[] = [];
  const gearPool = equipmentOptions(s);
  for (let i = 0; i < 2 && gearPool.length; i++) {
    const item = gearPool.splice(Math.floor(random(s) * gearPool.length), 1)[0];
    offers.push({ ...item, cost: [25, 40, 65][item.tier] });
  }
  for (let i = 0; i < 2 && relicPool.length; i++)
    offers.push({
      ...relicPool.splice(Math.floor(random(s) * relicPool.length), 1)[0],
      cost: 65,
    });
  const skills = SKILLS.filter((x) => !s.skills.includes(x.id));
  if (skills.length)
    offers.push({ ...skills[Math.floor(random(s) * skills.length)], cost: 40 });
  const mods = MODIFIERS.filter((x) => !s.modifiers.includes(x.id));
  if (mods.length)
    offers.push({ ...mods[Math.floor(random(s) * mods.length)], cost: 55 });
  offers.push({
    id: 'potion',
    kind: 'potion',
    name: 'Лечебное зелье',
    description: 'Восстанавливает 8 здоровья в бою. До двух зелий с собой.',
    tag: 'Расходник',
    cost: 25,
  });
  const ups = upgradeOptions(s);
  if (ups.length)
    offers.push({ ...ups[Math.floor(random(s) * ups.length)], cost: 35 });
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
    const offer = upgradeOptions(s).find((x) => x.id === choice);
    if (!offer) return result(input, [], 'Улучшение недоступно.');
    const error = grant(s, offer);
    if (error) return result(input, [], error);
  }
  s.phase = 'map';
  return result(s);
}
export function eventChoice(input: State, choice: string): Result {
  if (input.phase !== 'event') return result(input);
  const s = copy(input);
  if (choice === 'relic') {
    if (s.hp <= 5) return result(input, [], 'Нужно больше 5 здоровья.');
    s.hp -= 5;
    s.phase = 'reward';
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
    s.hp = Math.max(1, s.hp - cost);
    s.trial = null;
    s.phase = 'map';
    note(s, `Шлюз закрылся. Потеряно ${cost} здоровья. Можно продолжить путь.`);
  }
  return result(s);
}
export function isSave(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  return (
    s.version === 2 &&
    isEquipment(s.equipment) &&
    typeof s.runId === 'string' &&
    Number.isFinite(s.rng) &&
    Number.isInteger(s.room) &&
    s.room >= 1 &&
    s.room <= 10 &&
    Array.isArray(s.board) &&
    s.board.length === 36 &&
    s.board.every(
      (t) =>
        t &&
        FAMILIES.includes(t.family) &&
        Number.isFinite(t.id) &&
        [null, 'venom', 'bomb'].includes(t.variant),
    ) &&
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
      (e) => Number.isFinite(e.hp) && Number.isFinite(e.damage),
    ) &&
    Array.isArray(s.relics) &&
    Array.isArray(s.modifiers) &&
    Array.isArray(s.skills) &&
    Array.isArray(s.flags) &&
    Array.isArray(s.log) &&
    Array.isArray(s.offers) &&
    s.offers.every(
      (offer) =>
        offer && (offer.kind !== 'equipment' || !!equipmentById(offer.id)),
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
    Array.isArray(m.unlocked) &&
    m.unlocked.every((x) => ACHIEVEMENTS.some((a) => a.id === x)) &&
    Number.isInteger(m.streak) &&
    m.streak >= 0 &&
    Number.isInteger(m.best) &&
    Number.isInteger(m.wins) &&
    Array.isArray(m.finished)
  );
}

export function canCast(s: State, id: string): boolean {
  const c: Record<string, [number, number, number]> = {
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
    (id === 'edit' || s.skills.includes(id)) &&
    s.energy >= cost[0] &&
    s.focus >= cost[1] &&
    s.hp > cost[2]
  );
}

export function configureRun(
  s: State,
  preset: 'normal' | 'shields' | 'poison' | 'cascades',
): State {
  if (preset === 'normal') return s;
  s.modified = true;
  s.flags.push(...RELICS.map((x) => `run:available:${x.id}`));
  if (preset === 'shields') s.relics = ['thorns', 'coil', 'return'];
  if (preset === 'poison') {
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

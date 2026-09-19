import {
  CLASSES,
  COLORS,
  FOES,
  ITEMS,
  SPELLS,
  type ClassId,
  type Color,
  type ItemId,
  type Mana,
  type Slot,
  type SpellId,
  type Stats,
} from './catalog.ts';
import {
  adjacent,
  blastCells,
  fall,
  findMatches,
  freshBoard,
  isColor,
  legalSwaps,
  swapBoard,
  type Match,
  type Tile,
} from './board.ts';
export type Side = 'hero' | 'enemy';
export type Config = {
  seed: number;
  classId: ClassId;
  mode: 'duel' | 'route';
  foe: number;
};
export type Fighter = {
  name: string;
  art: string;
  hp: number;
  maxHp: number;
  mana: Mana;
  stats: Stats;
  spells: SpellId[];
  gear: Partial<Record<Slot, ItemId>>;
  ready: Partial<Record<SpellId, number>>;
  actions: number;
  ki: number;
  wall: number;
  stealthUntil: number;
  stunned: number;
  immune: number;
  gold: number;
  xp: number;
  level: number;
  points: number;
};
export type Command =
  | { type: 'swap'; a: number; b: number }
  | { type: 'cast'; spell: SpellId; target?: number }
  | { type: 'reward'; item: ItemId | null }
  | { type: 'buy'; item: ItemId }
  | { type: 'train'; stat: keyof Stats; gold?: boolean }
  | { type: 'next' };
export type Duel = {
  version: 1;
  config: Config;
  rng: { board: number; effect: number; loot: number };
  board: Tile[];
  hero: Fighter;
  enemy: Fighter;
  actor: Side;
  phase: 'battle' | 'camp' | 'won' | 'lost';
  room: number;
  sequence: number;
  log: string[];
  offers: ItemId[];
  stock: ItemId[];
  rewarded: boolean;
  commands: Command[];
  metrics: {
    matches: number;
    longest: number;
    damage: number;
    spells: number;
    extra: number;
    storms: number;
    turns: number;
  };
  achievements: string[];
};
export type Frame = {
  board: Tile[];
  after: Tile[];
  cells: number[];
  actor: Side;
  text: string;
};
export type Result = { state: Duel; error?: string; frames: Frame[] };
const emptyMana = (): Mana => ({ earth: 0, fire: 0, air: 0, water: 0 });
const other = (side: Side): Side => (side === 'hero' ? 'enemy' : 'hero');
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const note = (s: Duel, text: string) => {
  s.log = [...s.log.slice(-29), text];
};
const own = (f: Fighter, item: ItemId) => Object.values(f.gear).includes(item);
export const manaCap = (f: Fighter, color: Color) =>
  20 + 2 * f.stats[color] + (own(f, 'reservoir') ? 8 : 0);
export const statPrice = (s: Duel, stat: keyof Stats) =>
  (CLASSES[s.config.classId].cheap.includes(stat) ? 1 : 2) +
  Math.floor(s.hero.stats[stat] / 10);
export const trainingGold = (s: Duel, stat: keyof Stats) =>
  12 + s.hero.stats[stat] * 3;
export const experienceNeeded = (f: Fighter) => 18 + (f.level - 1) * 12;
const rand = (s: Duel, stream: keyof Duel['rng']) => {
  s.rng[stream] = (Math.imul(s.rng[stream], 1664525) + 1013904223) >>> 0;
  return s.rng[stream] / 4294967296;
};
function equip(f: Fighter, id: ItemId) {
  f.gear[ITEMS[id].slot] = id;
  for (const c of COLORS) f.mana[c] = Math.min(f.mana[c], manaCap(f, c));
}
function fighter(
  name: string,
  art: string,
  hp: number,
  stats: Stats,
  spells: SpellId[],
  gear: ItemId[],
): Fighter {
  const f: Fighter = {
    name,
    art,
    hp,
    maxHp: hp,
    mana: emptyMana(),
    stats: copy(stats),
    spells: spells.slice(),
    gear: {},
    ready: {},
    actions: 0,
    ki: 0,
    wall: 0,
    stealthUntil: 0,
    stunned: 0,
    immune: 0,
    gold: 0,
    xp: 0,
    level: 1,
    points: 0,
  };
  gear.forEach((id) => equip(f, id));
  for (const c of COLORS) f.mana[c] = Math.min(4, Math.floor(f.stats[c] / 2));
  return f;
}
function opponent(index: number): Fighter {
  const foe = FOES[index];
  const mastery = 1 + index;
  return fighter(
    foe.name,
    foe.art,
    foe.hp,
    {
      earth: mastery,
      fire: mastery,
      air: mastery,
      water: mastery,
      battle: Math.max(0, index - 1),
      cunning: index,
      morale: index,
    },
    foe.spells,
    foe.gear,
  );
}
export function createDuel(config: Config): Duel {
  if (!validConfig(config)) throw new Error('Неверная настройка дуэли');
  const heroClass = CLASSES[config.classId];
  const hp = 64 + heroClass.stats.morale * 3;
  const hero = fighter(
    heroClass.name,
    'wanderer',
    hp,
    heroClass.stats,
    heroClass.spells,
    heroClass.gear,
  );
  hero.gold = config.mode === 'route' ? 10 : 0;
  const room = config.mode === 'route' ? 0 : config.foe;
  const s: Duel = {
    version: 1,
    config: copy(config),
    rng: {
      board: (config.seed ^ 0x9e3779b9) >>> 0,
      effect: (config.seed ^ 0x85ebca6b) >>> 0,
      loot: (config.seed ^ 0xc2b2ae35) >>> 0,
    },
    board: [],
    hero,
    enemy: opponent(room),
    actor: 'hero',
    phase: 'battle',
    room,
    sequence: 0,
    log: ['Ваш ход. Поменяйте соседние фишки или примените заклинание.'],
    offers: [],
    stock: [],
    rewarded: false,
    commands: [],
    metrics: {
      matches: 0,
      longest: 0,
      damage: 0,
      spells: 0,
      extra: 0,
      storms: 0,
      turns: 0,
    },
    achievements: [],
  };
  s.board = freshBoard(() => rand(s, 'board'));
  return s;
}
export function validConfig(c: unknown): c is Config {
  if (!c || typeof c !== 'object') return false;
  const v = c as Config;
  return (
    Number.isInteger(v.seed) &&
    v.seed >= 0 &&
    v.seed <= 0xffffffff &&
    typeof v.classId === 'string' &&
    Object.hasOwn(CLASSES, v.classId) &&
    ['duel', 'route'].includes(v.mode) &&
    Number.isInteger(v.foe) &&
    v.foe >= 0 &&
    v.foe < FOES.length
  );
}
function gainMana(f: Fighter, color: Color, amount: number) {
  f.mana[color] = Math.min(manaCap(f, color), f.mana[color] + amount);
}
function unlock(s: Duel, id: string) {
  if (!s.achievements.includes(id)) s.achievements.push(id);
}
function advanceLevel(f: Fighter) {
  while (f.xp >= experienceNeeded(f)) {
    f.xp -= experienceNeeded(f);
    f.level++;
    f.points += 4;
    f.maxHp += 3;
    f.hp = Math.min(f.maxHp, f.hp + 3);
  }
}
// Armor applies once per opposing action, across all spell, item and cascade hits.
type ActionContext = {
  side: Side;
  armorLeft: number;
  extra: boolean;
  groups: number;
  frames: Frame[];
  itemTriggered: boolean;
};
function damage(s: Duel, ctx: ActionContext, amount: number, source: string) {
  const target = s[other(ctx.side)];
  if (target.hp <= 0 || amount <= 0) return;
  let damage = amount;
  const absorbed = Math.min(ctx.armorLeft, damage);
  ctx.armorLeft -= absorbed;
  damage -= absorbed;
  if (target.wall > 0) {
    while (damage > 0) {
      const c = [...COLORS].sort((a, b) => target.mana[b] - target.mana[a])[0];
      if (target.mana[c] === 0) break;
      target.mana[c]--;
      damage--;
    }
  }
  const actual = Math.min(target.hp, damage);
  target.hp -= actual;
  if (ctx.side === 'hero') s.metrics.damage += actual;
  note(
    s,
    `${s[ctx.side].name}: ${source} — ${actual} урона${amount > actual && target.hp > 0 ? `, защита поглотила ${amount - actual}` : ''}.`,
  );
}
function collect(
  s: Duel,
  ctx: ActionContext,
  cells: Set<number>,
  groups: Match[],
) {
  const actor = s[ctx.side],
    board = s.board;
  const counts: Record<string, number> = {
    earth: 0,
    fire: 0,
    air: 0,
    water: 0,
    skull: 0,
    gold: 0,
    xp: 0,
  };
  for (const i of cells) if (board[i].kind !== 'wild') counts[board[i].kind]++;
  // A wildcard crossing two colors belongs to the first color (earth/fire/air/water).
  // Each actual tile and each wildcard pays out at most once, including bomb overlaps.
  const assigned = new Set<number>();
  for (const g of groups)
    if (isColor(g.kind)) {
      const wilds = g.cells.filter(
        (i) => cells.has(i) && board[i].kind === 'wild' && !assigned.has(i),
      );
      wilds.forEach((i) => assigned.add(i));
      if (wilds.length) {
        const normal = g.cells.filter(
          (i) => cells.has(i) && board[i].kind === g.kind,
        ).length;
        counts[g.kind] +=
          (normal + wilds.length) * Math.min(27, 3 ** wilds.length) - normal;
      }
    }
  for (const c of COLORS)
    if (counts[c])
      gainMana(
        actor,
        c,
        counts[c] + Math.floor((counts[c] * actor.stats[c]) / 15),
      );
  let gold = counts.gold * (1 + Math.floor(actor.stats.cunning / 10));
  if (counts.water >= 3 && own(actor, 'tidePurse')) {
    gold += 2;
    ctx.itemTriggered = true;
    note(s, `${actor.name}: вода → 2 золота.`);
  }
  actor.gold += gold;
  if (counts.xp)
    actor.xp +=
      counts.xp +
      Math.floor((counts.xp * actor.stats.morale) / 10) +
      (own(actor, 'scholar') ? 2 : 0);
  if (groups.some((g) => g.cells.length >= 4) && own(actor, 'veil'))
    actor.stealthUntil = actor.actions + 4;
  if (counts.skull) {
    let hit =
      counts.skull +
      Math.floor(actor.stats.battle / 3) +
      [...cells].reduce((n, i) => n + (board[i].power ?? 0), 0);
    if (own(actor, 'paperKnife')) hit++;
    if (own(actor, 'fullBlade'))
      hit +=
        COLORS.filter((c) => actor.mana[c] === manaCap(actor, c)).length * 4;
    if (actor.stealthUntil > actor.actions) {
      hit = Math.ceil(hit * 1.5);
      actor.stealthUntil = 0;
    }
    damage(s, ctx, hit, 'черепа');
  }
  if (counts.water >= 2 && own(actor, 'tideNeedle')) {
    damage(s, ctx, 2, 'Игла прилива');
    ctx.itemTriggered = true;
  }
  return gold;
}
function resolve(
  s: Duel,
  ctx: ActionContext,
  initial?: number[],
  collectInitial = true,
) {
  let pending = initial;
  for (let wave = 0; wave < 64; wave++) {
    const groups = pending ? [] : findMatches(s.board);
    if (!pending && !groups.length) return;
    ctx.groups += groups.length;
    const selected = pending ?? groups.flatMap((g) => g.cells);
    const cells =
      pending && !collectInitial
        ? new Set(selected)
        : blastCells(s.board, selected);
    const before = copy(s.board);
    const large = groups.filter((g) => g.cells.length >= 4);
    if (large.length) ctx.extra = true;
    if (ctx.side === 'hero') {
      s.metrics.matches += groups.length;
      s.metrics.longest = Math.max(
        s.metrics.longest,
        ...groups.map((g) => g.cells.length),
      );
      if (groups.some((g) => g.longest >= 5)) unlock(s, 'five');
      if ([...cells].some((i) => s.board[i].power)) unlock(s, 'blast');
    }
    const gold =
      pending && !collectInitial ? 0 : collect(s, ctx, cells, groups);
    // Five in a straight line creates a wildcard at its middle, after collection.
    const protectedTiles = new Map<number, Tile>();
    for (const g of groups.filter((g) => g.longest >= 5)) {
      const i = g.cells[Math.floor(g.cells.length / 2)];
      protectedTiles.set(i, { kind: 'wild' });
    }
    s.board = fall(s.board, cells, () => rand(s, 'board'), protectedTiles);
    if (gold >= 2 && own(s[ctx.side], 'mint') && s[other(ctx.side)].hp > 0) {
      const candidates = s.board
        .map((t, i) => (t.kind !== 'wild' && t.kind !== 'skull' ? i : -1))
        .filter((i) => i >= 0);
      if (candidates.length) {
        s.board[candidates[Math.floor(rand(s, 'effect') * candidates.length)]] =
          { kind: 'skull' };
        ctx.itemTriggered = true;
        note(s, `${s[ctx.side].name}: золото → череп.`);
      }
    }
    ctx.frames.push({
      board: before,
      after: copy(s.board),
      cells: [...cells],
      actor: ctx.side,
      text: pending
        ? collectInitial
          ? 'Сбор заклинанием'
          : 'Строка удалена'
        : `Совпадения: ${groups.map((g) => g.cells.length).join(' + ')}${large.length ? ' · ещё ход' : ''}`,
    });
    pending = undefined;
    if (s[other(ctx.side)].hp <= 0) return;
  }
  // Technical circuit breaker; resources already collected remain. Never an endless cascade.
  s.board = freshBoard(() => rand(s, 'board'));
  note(s, 'Длинная цепочка завершена: поле обновилось.');
}
export function spellError(
  s: Duel,
  spellId: SpellId,
  side: Side = s.actor,
): string | null {
  const f = s[side],
    spell = SPELLS[spellId];
  if (s.phase !== 'battle') return 'Бой уже завершён';
  if (!spell || !f.spells.includes(spellId)) return 'Заклинание не изучено';
  if ((f.ready[spellId] ?? 0) > f.actions)
    return `Восстановление: ${(f.ready[spellId] ?? 0) - f.actions} действ.`;
  if (COLORS.some((c) => f.mana[c] < (spell.cost[c] ?? 0)))
    return 'Недостаточно маны';
  if (spellId === 'palm' && f.ki === 0) return 'Сначала накопите Ки';
  if (spellId === 'trance' && f.ki >= 8) return 'Ки уже на максимуме';
  if (spellId === 'mend' && f.hp === f.maxHp) return 'Здоровье уже полное';
  if (
    spellId === 'bomb' &&
    !s.board.some((t) => t.kind === 'skull' && !t.power)
  )
    return 'Нет обычного черепа';
  return null;
}
function cast(
  s: Duel,
  ctx: ActionContext,
  id: SpellId,
  target?: number,
): string | undefined {
  const error = spellError(s, id);
  if (error) return error;
  const spell = SPELLS[id],
    actor = s[ctx.side],
    enemy = s[other(ctx.side)];
  if (
    spell.target &&
    (!Number.isInteger(target) || target! < 0 || target! >= 64)
  )
    return 'Выберите фишку на поле';
  if (
    id === 'bomb' &&
    (s.board[target!].kind !== 'skull' || s.board[target!].power)
  )
    return 'Выберите обычный череп';
  if (id === 'forge' && s.board[target!].kind === 'skull')
    return 'Здесь уже череп';
  const empowered = actor.mana.air >= 10;
  for (const c of COLORS) actor.mana[c] -= spell.cost[c] ?? 0;
  actor.ready[id] = actor.actions + spell.cooldown + 1;
  note(s, `${actor.name}: ${spell.name}.`);
  if (ctx.side === 'hero') s.metrics.spells++;
  const resistance = Math.min(
    0.45,
    enemy.stats.morale * 0.01 + (own(enemy, 'ward') ? 0.2 : 0),
  );
  if (spell.hostile && rand(s, 'effect') < resistance) {
    note(s, `${enemy.name} отразил заклинание. Мана потрачена.`);
    return;
  }
  switch (id) {
    case 'bolt':
      damage(s, ctx, 10 + Math.floor(actor.stats.fire / 5), 'Разряд');
      break;
    case 'mend':
      actor.hp = Math.min(actor.maxHp, actor.hp + 11);
      break;
    case 'slice': {
      const radius = empowered ? 2 : 1,
        col = target! % 8,
        row = Math.floor(target! / 8);
      const cells = Array.from(
        { length: radius * 2 + 1 },
        (_, n) => col - radius + n,
      )
        .filter((x) => x >= 0 && x < 8)
        .map((x) => row * 8 + x);
      resolve(s, ctx, cells);
      break;
    }
    case 'erase':
      resolve(
        s,
        ctx,
        Array.from({ length: 8 }, (_, n) => Math.floor(target! / 8) * 8 + n),
        false,
      );
      break;
    case 'forge':
      s.board[target!] = { kind: 'skull' };
      resolve(s, ctx);
      break;
    case 'bomb':
      s.board[target!] = { kind: 'skull', power: 5 };
      break;
    case 'drain':
      damage(s, ctx, 6, 'Взыскание');
      for (const c of COLORS) {
        const n = Math.min(3, enemy.mana[c]);
        enemy.mana[c] -= n;
        gainMana(actor, c, n);
      }
      break;
    case 'wall':
      actor.wall = 3;
      break;
    case 'transmute':
      s.board = s.board.map((t) =>
        t.kind === 'earth' ? { kind: 'water' } : t,
      );
      resolve(s, ctx);
      break;
    case 'trance':
      actor.ki = Math.min(8, actor.ki + 5);
      ctx.extra = true;
      break;
    case 'palm': {
      const ki = actor.ki;
      actor.ki = 0;
      damage(s, ctx, ki * 2, 'Удар ладонью');
      if (ki >= 5 && enemy.immune === 0) {
        enemy.stunned = 1;
        enemy.immune = 4;
        note(s, `${enemy.name} оглушён: пропустит действие.`);
      }
      break;
    }
  }
}
export function ensurePlayable(s: Duel): boolean {
  if (findMatches(s.board).length || legalSwaps(s.board).length) return false;
  s.board = freshBoard(() => rand(s, 'board'));
  for (const f of [s.hero, s.enemy]) for (const c of COLORS) gainMana(f, c, 3);
  s.metrics.storms++;
  note(
    s,
    'Буря маны: поле обновлено, оба участника получили по 3 маны каждого цвета.',
  );
  return true;
}
function finishBattle(s: Duel) {
  if (s.hero.hp <= 0) {
    s.phase = 'lost';
    note(
      s,
      'Вы проснулись за своим столом. Попробуйте другую сборку или тот же seed.',
    );
    return;
  }
  if (s.enemy.hp > 0) return;
  s.hero.gold += 8 + s.room * 2;
  s.hero.xp += 8 + s.room * 2;
  advanceLevel(s.hero);
  unlock(s, 'victory');
  if (s.config.mode === 'duel' || s.room === FOES.length - 1) {
    s.phase = 'won';
    if (s.config.mode === 'route') unlock(s, 'route');
    note(s, 'Дуэль окончена.');
    return;
  }
  s.phase = 'camp';
  const oldHp = s.hero.hp;
  s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 12);
  const choices = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) => !own(s.hero, id),
  );
  // Loot has its own stream: testing another build cannot perturb refill RNG.
  const draw = () =>
    choices.splice(Math.floor(rand(s, 'loot') * choices.length), 1)[0];
  s.offers = Array.from({ length: Math.min(3, choices.length) }, draw);
  s.stock = Array.from({ length: Math.min(3, choices.length) }, draw);
  s.rewarded = false;
  note(
    s,
    `Комната пройдена. +${8 + s.room * 2} золота, отдых восстановил ${s.hero.hp - oldHp} здоровья.`,
  );
}
function endAction(s: Duel, ctx: ActionContext) {
  const actor = s[ctx.side],
    enemy = s[other(ctx.side)];
  if (!ctx.extra && ctx.groups > 0 && enemy.hp > 0) {
    const chance = Math.min(
      0.12,
      0.02 +
        actor.stats.cunning * 0.004 +
        COLORS.reduce((n, c) => n + actor.stats[c], 0) * 0.0005,
    );
    if (rand(s, 'effect') < chance) {
      ctx.extra = true;
      note(s, `${actor.name}: удачное совпадение — ещё ход.`);
      if (rand(s, 'effect') < 0.5) {
        const candidates = s.board
          .map((t, i) => (isColor(t.kind) ? i : -1))
          .filter((i) => i >= 0);
        if (candidates.length) {
          s.board[
            candidates[Math.floor(rand(s, 'effect') * candidates.length)]
          ] = { kind: 'wild' };
          note(s, `${actor.name}: удача создала джокер ×3.`);
          resolve(s, ctx);
        }
      }
    }
  }
  if (ctx.groups >= 5 && ctx.side === 'hero') {
    unlock(s, 'cascade');
    note(s, 'Героическое усилие: пять совпадений за действие.');
  }
  if (ctx.itemTriggered && ctx.side === 'hero') unlock(s, 'synergy');
  actor.actions++;
  s.metrics.turns++;
  enemy.wall = Math.max(0, enemy.wall - 1);
  actor.immune = Math.max(0, actor.immune - 1);
  finishBattle(s);
  if (s.phase !== 'battle') return;
  ensurePlayable(s);
  if (ctx.extra) {
    s.actor = ctx.side;
    if (ctx.side === 'hero') s.metrics.extra++;
    note(s, `${actor.name} сохраняет инициативу.`);
  } else s.actor = other(ctx.side);
  const next = s[s.actor];
  if (next.stunned > 0) {
    next.stunned--;
    next.actions++;
    next.immune = Math.max(0, next.immune - 1);
    s[other(s.actor)].wall = Math.max(0, s[other(s.actor)].wall - 1);
    note(s, `${next.name} пропускает действие из-за оглушения.`);
    s.actor = other(s.actor);
  }
}
export function dispatchDuel(original: Duel, command: Command): Result {
  const invalid = (error: string): Result => ({
    state: original,
    error,
    frames: [],
  });
  if (!command || typeof command !== 'object')
    return invalid('Неизвестное действие');
  if (original.commands.length >= 2000)
    return invalid('Лимит записи достигнут. Начните новый тест.');
  const s = copy(original);
  const ctx: ActionContext = {
    side: s.actor,
    armorLeft: own(s[other(s.actor)], 'coat') ? 2 : 0,
    extra: false,
    groups: 0,
    frames: [],
    itemTriggered: false,
  };
  if (s.phase === 'battle') {
    if (command.type === 'swap') {
      if (!adjacent(command.a, command.b))
        return invalid('Можно менять только соседние фишки');
      const board = swapBoard(s.board, command);
      if (
        !findMatches(board).some(
          (m) => m.cells.includes(command.a) || m.cells.includes(command.b),
        )
      )
        return invalid('Перестановка должна собрать хотя бы 3 фишки');
      s.board = board;
      note(
        s,
        `${s[s.actor].name}: перестановка ${Math.floor(command.a / 8) + 1}:${(command.a % 8) + 1} ↔ ${Math.floor(command.b / 8) + 1}:${(command.b % 8) + 1}.`,
      );
      resolve(s, ctx);
    } else if (command.type === 'cast') {
      const error = cast(s, ctx, command.spell, command.target);
      if (error) return invalid(error);
    } else return invalid('Сейчас идёт бой');
    endAction(s, ctx);
  } else if (s.phase === 'camp') {
    switch (command.type) {
      case 'reward':
        if (
          s.rewarded ||
          (command.item !== null && !s.offers.includes(command.item))
        )
          return invalid('Выберите одну из предложенных находок');
        if (command.item) equip(s.hero, command.item);
        s.rewarded = true;
        break;
      case 'buy':
        if (
          !s.stock.includes(command.item) ||
          s.hero.gold < ITEMS[command.item].price
        )
          return invalid('Товар недоступен или не хватает золота');
        s.hero.gold -= ITEMS[command.item].price;
        equip(s.hero, command.item);
        s.stock = s.stock.filter((id) => id !== command.item);
        break;
      case 'train': {
        if (!Object.hasOwn(s.hero.stats, command.stat))
          return invalid('Неизвестная характеристика');
        const price = command.gold
          ? trainingGold(s, command.stat)
          : statPrice(s, command.stat);
        if (
          (command.gold ? s.hero.gold : s.hero.points) < price ||
          s.hero.stats[command.stat] >= 30
        )
          return invalid('Недостаточно средств или достигнут предел');
        if (command.gold) s.hero.gold -= price;
        else s.hero.points -= price;
        s.hero.stats[command.stat]++;
        if (command.stat === 'morale') {
          s.hero.maxHp += 3;
          s.hero.hp += 3;
        }
        break;
      }
      case 'next':
        if (!s.rewarded)
          return invalid('Сначала выберите находку или пропустите её');
        s.room++;
        s.enemy = opponent(s.room);
        s.phase = 'battle';
        s.actor = 'hero';
        s.hero.ready = {};
        s.hero.actions = 0;
        s.hero.ki = 0;
        s.hero.wall = 0;
        s.hero.stunned = 0;
        s.hero.immune = 0;
        s.hero.stealthUntil = 0;
        for (const c of COLORS)
          s.hero.mana[c] = Math.min(4, Math.floor(s.hero.stats[c] / 2));
        s.board = freshBoard(() => rand(s, 'board'));
        s.offers = [];
        s.stock = [];
        note(s, `Следующая дуэль: ${s.enemy.name}.`);
        break;
      default:
        return invalid('Бой окончен: выберите награду и продолжайте');
    }
  } else return invalid('Забег завершён');
  s.sequence++;
  s.commands.push(copy(command));
  return { state: s, frames: ctx.frames };
}
export function fingerprint(s: Duel): string {
  const { commands: _commands, ...content } = s;
  const text = JSON.stringify(content);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export const saveDuel = (s: Duel) =>
  JSON.stringify({
    schema: 'oskolki-shared-board-1',
    config: s.config,
    commands: s.commands,
    fingerprint: fingerprint(s),
  });
// Saves contain a command journal, never trusted mutable fighter/board data.
export function loadDuel(raw: string): Duel | null {
  if (raw.length > 500000) return null;
  try {
    const data = JSON.parse(raw);
    if (
      data.schema !== 'oskolki-shared-board-1' ||
      !validConfig(data.config) ||
      !Array.isArray(data.commands) ||
      data.commands.length > 2000
    )
      return null;
    let s = createDuel(data.config);
    for (const command of data.commands) {
      const r = dispatchDuel(s, command);
      if (r.error) return null;
      s = r.state;
    }
    return fingerprint(s) === data.fingerprint ? s : null;
  } catch {
    return null;
  }
}

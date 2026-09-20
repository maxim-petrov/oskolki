import * as v2 from '../legacy-v2/engine.ts';
import { BIOMES, ENCOUNTERS, restHealing, victoryReward } from './campaign.ts';
import * as legacy from '../legacy-v1/engine.ts';
import {
  freshItems,
  itemState,
  owns,
  spellPayment,
  type ItemState,
} from './item-rules.ts';
import { createOffers } from './loot.ts';
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
} from '../board.ts';
export type Side = 'hero' | 'enemy';
export type Config = {
  seed: number;
  classId: ClassId;
  mode: 'duel' | 'route';
  foe: number;
  testGear?: ItemId[];
};
export type Fighter = {
  items?: ItemState;
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
  version: 1 | 2 | 3;
  rareOffered?: boolean;
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
const own = owns;
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
    items: freshItems(),
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
  if (own(f, 'bluePass')) {
    gainMana(f, 'water', 2);
    gainMana(f, 'earth', 2);
  }
  if (own(f, 'pocketVest')) itemState(f).barrier = 6;
  return f;
}
function opponent(index: number): Fighter {
  const foe = FOES[index];
  const mastery = foe.mastery;
  return fighter(
    foe.name,
    foe.art,
    foe.hp,
    {
      earth: mastery,
      fire: mastery,
      air: mastery,
      water: mastery,
      battle: foe.battle,
      cunning: foe.biome + 1,
      morale: foe.biome + 1,
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
    config.testGear ?? heroClass.gear,
  );
  hero.gold = config.mode === 'route' ? 10 : 0;
  const room = config.mode === 'route' ? 0 : config.foe;
  const s: Duel = {
    version: 3,
    rareOffered: false,
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
    v.foe < FOES.length &&
    (v.testGear === undefined ||
      (v.mode === 'duel' &&
        Array.isArray(v.testGear) &&
        v.testGear.length <= 4 &&
        v.testGear.every(
          (id) => typeof id === 'string' && Object.hasOwn(ITEMS, id),
        ) &&
        new Set(v.testGear.map((id) => ITEMS[id].slot)).size ===
          v.testGear.length))
  );
}
function gainMana(f: Fighter, color: Color, amount: number) {
  const overflow = Math.max(0, f.mana[color] + amount - manaCap(f, color));
  f.mana[color] = Math.min(manaCap(f, color), f.mana[color] + amount);
  return overflow;
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
  extra: boolean;
  groups: number;
  frames: Frame[];
  itemTriggered: boolean;
  used: Set<ItemId>;
  physical: Record<string, number>;
  overflow: number;
  gold: number;
  mint: boolean;
  wick: boolean;
  armor: Record<Side, number>;
  reflected: Record<Side, number>;
  blocked: Record<Side, number>;
  glassHit: Set<Side>;
};
function proc(s: Duel, ctx: ActionContext, id: ItemId, series = false) {
  const f = s[ctx.side];
  if (
    !own(f, id) ||
    ctx.used.has(id) ||
    (series && itemState(f).initiative[id])
  )
    return false;
  ctx.used.add(id);
  if (series) itemState(f).initiative[id] = true;
  ctx.itemTriggered = true;
  note(s, `${f.name}: ${ITEMS[id].name}.`);
  return true;
}
function barrier(f: Fighter, amount: number) {
  itemState(f).barrier = Math.min(6, itemState(f).barrier + amount);
}
function addMana(s: Duel, ctx: ActionContext, color: Color, amount: number) {
  const f = s[ctx.side];
  ctx.overflow += gainMana(f, color, amount);
  if (ctx.overflow >= 3 && proc(s, ctx, 'overflowRobe')) barrier(f, 3);
}
function emptiest(f: Fighter): Color {
  return [...COLORS].sort(
    (a, b) => f.mana[a] / manaCap(f, a) - f.mana[b] / manaCap(f, b),
  )[0];
}
function damage(
  s: Duel,
  ctx: ActionContext,
  amount: number,
  source: string,
  targetSide: Side = other(ctx.side),
  reflection = false,
) {
  const target = s[targetSide],
    sourceSide = other(targetSide);
  if (target.hp <= 0 || amount <= 0) return;
  let hit = amount;
  if (!reflection && own(target, 'glassNib') && !ctx.glassHit.has(targetSide)) {
    hit++;
    ctx.glassHit.add(targetSide);
  }
  const absorbed = Math.min(ctx.armor[targetSide], hit);
  ctx.armor[targetSide] -= absorbed;
  hit -= absorbed;
  const shield = Math.min(itemState(target).barrier, hit);
  itemState(target).barrier -= shield;
  hit -= shield;
  if (target.wall > 0) {
    while (hit > 0) {
      const c = [...COLORS].sort((a, b) => target.mana[b] - target.mana[a])[0];
      if (!target.mana[c]) break;
      target.mana[c]--;
      hit--;
    }
  }
  if (
    hit >= target.hp &&
    own(target, 'insurance') &&
    !itemState(target).insuranceUsed
  ) {
    itemState(target).insuranceUsed = true;
    hit = target.hp - 1;
    barrier(target, 6);
    note(s, `${target.name}: Страховой полис использован — 1 здоровья.`);
  }
  const actual = Math.min(target.hp, hit);
  target.hp -= actual;
  if (sourceSide === 'hero') s.metrics.damage += actual;
  if (actual > 0 && own(target, 'answerCloak')) itemState(target).answer = true;
  note(
    s,
    `${s[sourceSide].name}: ${source} — ${actual} урона${amount > actual && target.hp > 0 ? `, защита поглотила ${amount - actual}` : ''}.`,
  );
  if (!reflection && shield > 0 && own(target, 'mirrorVest')) {
    ctx.blocked[targetSide] += shield;
    const total = Math.min(3, Math.floor(ctx.blocked[targetSide] / 2));
    const reflected = total - ctx.reflected[targetSide];
    ctx.reflected[targetSide] = total;
    if (reflected)
      damage(s, ctx, reflected, 'Зеркальная жилетка', sourceSide, true);
  }
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
  // Physical cells are separate from wildcard/mastery multipliers and resource grants.
  const physical: Record<string, number> = {};
  for (const i of cells)
    if (board[i].kind !== 'wild')
      physical[board[i].kind] = (physical[board[i].kind] ?? 0) + 1;
  const wildAssigned = new Set<number>();
  for (const g of groups)
    if (isColor(g.kind))
      for (const i of g.cells) {
        if (cells.has(i) && board[i].kind === 'wild' && !wildAssigned.has(i)) {
          wildAssigned.add(i);
          physical[g.kind] = (physical[g.kind] ?? 0) + 1;
        }
      }
  for (const [kind, n] of Object.entries(physical))
    ctx.physical[kind] = (ctx.physical[kind] ?? 0) + n;
  for (const c of COLORS)
    if (counts[c])
      addMana(
        s,
        ctx,
        c,
        counts[c] + Math.floor((counts[c] * actor.stats[c]) / 15),
      );
  const st = itemState(actor);
  if (
    own(actor, 'capacitor') &&
    st.capacitorReadyAt !== null &&
    actor.actions >= st.capacitorReadyAt
  ) {
    const color = groups.find((g) => isColor(g.kind))?.kind;
    if (color && isColor(color) && proc(s, ctx, 'capacitor')) {
      st.capacitorReadyAt = null;
      addMana(s, ctx, color, 4);
    }
  }
  if (ctx.physical.earth >= 3 && proc(s, ctx, 'apron')) barrier(actor, 2);
  if (ctx.physical.gold >= 3 && proc(s, ctx, 'abacus')) barrier(actor, 2);
  if (ctx.physical.fire >= 3 && proc(s, ctx, 'copperClip'))
    addMana(s, ctx, 'air', 1);
  if (
    COLORS.filter((c) => ctx.physical[c] > 0).length >= 2 &&
    proc(s, ctx, 'conductor')
  )
    addMana(s, ctx, emptiest(actor), 2);
  if (ctx.physical.earth >= 3 && proc(s, ctx, 'teaBag'))
    addMana(s, ctx, 'water', 1);
  if (ctx.physical.xp >= 3 && proc(s, ctx, 'lens')) addMana(s, ctx, 'air', 2);
  if (ctx.physical.xp >= 3 && proc(s, ctx, 'archiveVest')) barrier(actor, 3);
  if (ctx.physical.fire >= 3 && proc(s, ctx, 'emberKnife')) st.ember = true;
  if (ctx.physical.air >= 3 && proc(s, ctx, 'metronome')) st.metronome = true;
  if (ctx.physical.skull >= 3 && proc(s, ctx, 'fireSeal'))
    addMana(s, ctx, 'fire', 2);
  if (ctx.physical.water >= 3 && proc(s, ctx, 'waterwheel')) {
    actor.mana.fire = Math.max(0, actor.mana.fire - 2);
    addMana(s, ctx, 'earth', 3);
  }
  if (
    ctx.physical.water >= 3 &&
    st.healed < 6 &&
    actor.hp < actor.maxHp &&
    proc(s, ctx, 'cottonCuffs')
  ) {
    actor.hp++;
    st.healed++;
  }
  if (own(actor, 'ledger') && !st.ledgerReady) {
    st.ledgerCoins += physical.gold ?? 0;
    if (st.ledgerCoins >= 6) {
      st.ledgerCoins %= 6;
      st.ledgerReady = true;
    }
  }
  let gold = counts.gold * (1 + Math.floor(actor.stats.cunning / 10));
  if (
    ctx.physical.water >= 3 &&
    st.purseGold < 8 &&
    proc(s, ctx, 'tidePurse')
  ) {
    gold += 2;
    st.purseGold += 2;
  }
  actor.gold += gold;
  ctx.gold += gold;
  if (
    ctx.physical.gold >= 3 &&
    actor.gold >= 2 &&
    actor.hp < actor.maxHp &&
    st.healed < 12 &&
    proc(s, ctx, 'goldenLining', true)
  ) {
    const healed = Math.min(3, 12 - st.healed, actor.maxHp - actor.hp);
    actor.gold -= 2;
    actor.hp += healed;
    st.healed += healed;
  }
  if (counts.xp) {
    if (own(actor, 'infiniteDiploma')) {
      const n = Math.min(
        counts.xp,
        Math.max(0, 4 - ((ctx.physical.xp ?? 0) - counts.xp)),
      );
      for (const c of COLORS) if (n) addMana(s, ctx, c, n);
    } else {
      actor.xp += counts.xp + Math.floor((counts.xp * actor.stats.morale) / 10);
      if (st.scholarXp < 6 && proc(s, ctx, 'scholar')) {
        actor.xp += 2;
        st.scholarXp += 2;
      }
    }
  }
  if (
    actor.hp > 2 &&
    groups.some((g) => g.cells.length >= 4) &&
    proc(s, ctx, 'eclipseRing', true)
  ) {
    actor.hp -= 2;
    for (const c of COLORS) addMana(s, ctx, c, 2);
  }
  if (groups.some((g) => g.cells.length >= 4) && proc(s, ctx, 'veil'))
    actor.stealthUntil = actor.actions + 4;
  if (
    groups.some((g) => g.kind === 'fire' && g.cells.length >= 4) &&
    own(actor, 'wick')
  )
    ctx.wick = true;
  if (ctx.gold >= 2 && own(actor, 'mint')) ctx.mint = true;
  if (own(actor, 'directorPen') && !st.initiative.directorPen) {
    for (const c of COLORS)
      if (ctx.physical[c] >= 3 && !st.seals.includes(c)) st.seals.push(c);
    if (st.seals.length === 4 && proc(s, ctx, 'directorPen', true)) {
      st.seals = [];
      barrier(actor, 4);
      damage(s, ctx, 8, 'Перо директора');
    }
  }
  if (
    actor.hp > 0 &&
    s[other(ctx.side)].hp > 0 &&
    COLORS.filter((c) => ctx.physical[c] > 0).length >= 3 &&
    proc(s, ctx, 'prism')
  ) {
    barrier(actor, 2);
    damage(s, ctx, 3, 'Трёхгранная призма');
  }
  if (actor.hp <= 0 || s[other(ctx.side)].hp <= 0) return gold;
  if (counts.skull) {
    let skulls = counts.skull;
    const long = groups.some((g) => g.kind === 'skull' && g.cells.length >= 4);
    if (own(actor, 'quarterCutter')) {
      // Only natural triples are suppressed. Direct spell/blast collection keeps its base damage.
      const suppressed = new Set(
        groups
          .filter((g) => g.kind === 'skull' && g.cells.length === 3)
          .flatMap((g) => g.cells),
      );
      skulls -= suppressed.size;
    }
    const blast = [...cells].reduce((n, i) => n + (board[i].power ?? 0), 0);
    let hit =
      skulls > 0 ? skulls + Math.floor(actor.stats.battle / 3) + blast : blast;
    if (hit > 0) {
      if (proc(s, ctx, 'paperKnife')) hit++;
      if (ctx.physical.air >= 3 && proc(s, ctx, 'graphite')) hit += 2;
      if (st.ember && own(actor, 'emberKnife')) {
        hit += 3;
        st.ember = false;
      }
      if (st.ledgerReady && own(actor, 'ledger')) {
        hit += 6;
        st.ledgerReady = false;
      }
      if (actor.hp > 2 && proc(s, ctx, 'mortgage')) {
        actor.hp -= 2;
        hit += 6;
      }
      if (long && proc(s, ctx, 'chargeSeal')) hit += 4;
      if (long && proc(s, ctx, 'quarterCutter')) hit += 8;
      if (actor.hp <= actor.maxHp / 2 && proc(s, ctx, 'contractBlade'))
        hit += 5;
      if (proc(s, ctx, 'fullBlade'))
        for (const c of COLORS)
          if (actor.mana[c] === manaCap(actor, c)) {
            hit += 4;
            actor.mana[c] -= 2;
          }
      if (st.answer && own(actor, 'answerCloak')) {
        hit += 3;
        st.answer = false;
      }
      if (actor.stealthUntil > actor.actions) {
        hit = Math.ceil(hit * 1.5);
        actor.stealthUntil = 0;
      }
      damage(s, ctx, hit, 'черепа');
    }
  }
  if (
    actor.hp > 0 &&
    s[other(ctx.side)].hp > 0 &&
    ctx.physical.water >= 3 &&
    proc(s, ctx, 'tideNeedle')
  )
    damage(s, ctx, 2, 'Игла прилива');
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
    if (!(pending && !collectInitial)) collect(s, ctx, cells, groups);
    // Five in a straight line creates a wildcard at its middle, after collection.
    const protectedTiles = new Map<number, Tile>();
    for (const g of groups.filter((g) => g.longest >= 5)) {
      const i = g.cells[Math.floor(g.cells.length / 2)];
      protectedTiles.set(i, { kind: 'wild' });
    }
    s.board = fall(s.board, cells, () => rand(s, 'board'), protectedTiles);
    if (s.hero.hp > 0 && s.enemy.hp > 0) {
      if (ctx.mint && !itemState(s[ctx.side]).initiative.mint) {
        const candidates = s.board
          .map((t, i) => (t.kind !== 'wild' && t.kind !== 'skull' ? i : -1))
          .filter((i) => i >= 0);
        if (candidates.length && proc(s, ctx, 'mint', true))
          s.board[
            candidates[Math.floor(rand(s, 'effect') * candidates.length)]
          ] = { kind: 'skull' };
      }
      if (ctx.wick && !itemState(s[ctx.side]).initiative.wick) {
        const target = s.board.findIndex((t) => t.kind === 'skull' && !t.power);
        if (target >= 0 && proc(s, ctx, 'wick', true))
          s.board[target] = { kind: 'skull', power: 5 };
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
    if (s.hero.hp <= 0 || s.enemy.hp <= 0) return;
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
  if (s.version === 1)
    return legacy.spellError(s as legacy.Duel, spellId, side);
  if (s.version === 2) return v2.spellError(s as v2.Duel, spellId, side);
  const f = s[side],
    spell = SPELLS[spellId];
  if (s.phase !== 'battle') return 'Бой уже завершён';
  if (!spell || !f.spells.includes(spellId)) return 'Заклинание не изучено';
  if ((f.ready[spellId] ?? 0) > f.actions)
    return `Восстановление: ${(f.ready[spellId] ?? 0) - f.actions} действ.`;
  const payment = spellPayment(f, spellId, s.version >= 2);
  if (COLORS.some((c) => f.mana[c] < (payment.cost[c] ?? 0)))
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
  const payment = spellPayment(actor, id);
  for (const c of COLORS) actor.mana[c] -= payment.cost[c] ?? 0;
  if (payment.health) {
    actor.hp -= payment.health;
    proc(s, ctx, 'bloodInkwell', true);
  }
  if (proc(s, ctx, 'saltCoat', true)) barrier(actor, 3);
  let spent = COLORS.reduce((n, c) => n + (payment.cost[c] ?? 0), 0);
  if (proc(s, ctx, 'catalyst')) {
    const refund = Math.min(
      2,
      Math.max(0, (payment.cost[payment.expensive] ?? 0) - 1),
    );
    addMana(s, ctx, payment.expensive, refund);
    spent -= refund;
  }
  const st = itemState(actor);
  if (own(actor, 'capacitor') && st.capacitorReadyAt === null) {
    st.capacitorSpent += spent;
    if (st.capacitorSpent >= 12) {
      st.capacitorSpent %= 12;
      st.capacitorReadyAt = actor.actions + 1;
    }
  }
  if (own(actor, 'spinningTop') && !st.topReady) {
    st.topCasts++;
    if (st.topCasts >= 3) {
      st.topCasts = 0;
      st.topReady = true;
    }
  }
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
  const direct = (base: number, name: string) => {
    let hit = base;
    if (proc(s, ctx, 'stylus')) hit += 2;
    if (proc(s, ctx, 'glassNib')) hit += 5;
    if (st.metronome && own(actor, 'metronome')) {
      hit += 3;
      st.metronome = false;
    }
    if (proc(s, ctx, 'carbonPaper', true))
      hit += Math.min(6, Math.floor(base / 2));
    damage(s, ctx, hit, name);
  };
  switch (id) {
    case 'bolt':
      direct(10 + Math.floor(actor.stats.fire / 5), 'Разряд');
      break;
    case 'mend':
      actor.hp = Math.min(
        actor.maxHp,
        actor.hp + (own(actor, 'saltCoat') ? 7 : 11),
      );
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
      direct(6, 'Взыскание');
      if (actor.hp <= 0 || enemy.hp <= 0) break;
      for (const c of COLORS) {
        const n = Math.min(3, enemy.mana[c]);
        enemy.mana[c] -= n;
        addMana(s, ctx, c, n);
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
      direct(ki * 2, 'Удар ладонью');
      if (actor.hp <= 0 || enemy.hp <= 0) break;
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
  s.hero.gold += victoryReward(s.room);
  s.hero.xp += victoryReward(s.room);
  advanceLevel(s.hero);
  unlock(s, 'victory');
  if (s.config.mode === 'route' && ENCOUNTERS[s.room].kind === 'boss')
    unlock(s, `biome-${ENCOUNTERS[s.room].biome + 1}`);
  if (s.config.mode === 'duel' || s.room === FOES.length - 1) {
    s.phase = 'won';
    if (s.config.mode === 'route') unlock(s, 'fourBiomes');
    note(s, 'Дуэль окончена.');
    return;
  }
  s.phase = 'camp';
  const oldHp = s.hero.hp;
  s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + restHealing(s.room));
  const loot = createOffers(s.hero, s.room, !!s.rareOffered, () =>
    rand(s, 'loot'),
  );
  s.offers = loot.offers;
  s.stock = loot.stock;
  s.rareOffered = loot.rareOffered;
  s.rewarded = false;
  note(
    s,
    `Комната пройдена. +${victoryReward(s.room)} золота, отдых восстановил ${s.hero.hp - oldHp} здоровья.`,
  );
}
function endAction(s: Duel, ctx: ActionContext) {
  const actor = s[ctx.side],
    enemy = s[other(ctx.side)];
  if (!ctx.extra && ctx.groups > 0 && enemy.hp > 0 && actor.hp > 0) {
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
  if (
    !ctx.extra &&
    actor.hp > 0 &&
    enemy.hp > 0 &&
    itemState(actor).topReady &&
    proc(s, ctx, 'spinningTop', true)
  ) {
    itemState(actor).topReady = false;
    ctx.extra = true;
  }
  itemState(enemy).barrier = 0;
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
  if (original.version === 1)
    return legacy.dispatchDuel(
      original as legacy.Duel,
      command as legacy.Command,
    ) as Result;
  if (original.version === 2)
    return v2.dispatchDuel(
      original as v2.Duel,
      command as v2.Command,
    ) as Result;
  const invalid = (error: string): Result => ({
    state: original,
    error,
    frames: [],
  });
  if (!command || typeof command !== 'object')
    return invalid('Неизвестное действие');
  if (original.commands.length >= 6000)
    return invalid('Лимит записи достигнут. Начните новый тест.');
  const s = copy(original);
  const ctx: ActionContext = {
    side: s.actor,
    extra: false,
    groups: 0,
    frames: [],
    itemTriggered: false,
    used: new Set(),
    physical: {},
    overflow: 0,
    gold: 0,
    mint: false,
    wick: false,
    armor: {
      hero: own(s.hero, 'coat') ? 2 : 0,
      enemy: own(s.enemy, 'coat') ? 2 : 0,
    },
    blocked: { hero: 0, enemy: 0 },
    glassHit: new Set(),
    reflected: { hero: 0, enemy: 0 },
  };
  if (s.phase === 'battle') {
    itemState(s[other(s.actor)]).initiative = {};
    if (proc(s, ctx, 'mirrorVest')) barrier(s[s.actor], 2);
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
        s.hero.items = freshItems(itemState(s.hero).insuranceUsed);
        if (own(s.hero, 'pocketVest')) itemState(s.hero).barrier = 6;
        for (const c of COLORS)
          s.hero.mana[c] = Math.min(4, Math.floor(s.hero.stats[c] / 2));
        if (own(s.hero, 'bluePass')) {
          gainMana(s.hero, 'water', 2);
          gainMana(s.hero, 'earth', 2);
        }
        s.board = freshBoard(() => rand(s, 'board'));
        s.offers = [];
        s.stock = [];
        note(
          s,
          `${BIOMES[ENCOUNTERS[s.room].biome].name}. Следующая дуэль: ${s.enemy.name}.`,
        );
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
  s.version === 1
    ? legacy.saveDuel(s as legacy.Duel)
    : s.version === 2
      ? v2.saveDuel(s as v2.Duel)
      : JSON.stringify({
          schema: 'oskolki-shared-board-3',
          config: s.config,
          commands: s.commands,
          fingerprint: fingerprint(s),
        });
// Saves contain a command journal, never trusted mutable fighter/board data.
export function loadDuel(raw: string): Duel | null {
  if (raw.length > 1000000) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.schema === 'oskolki-shared-board-1')
      return legacy.loadDuel(raw) as Duel | null;
    if (data?.schema === 'oskolki-shared-board-2')
      return v2.loadDuel(raw) as Duel | null;
    if (
      data.schema !== 'oskolki-shared-board-3' ||
      !validConfig(data.config) ||
      !Array.isArray(data.commands) ||
      data.commands.length > 6000
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

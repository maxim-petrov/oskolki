import { CLASSES, ITEMS, RARITIES, type ItemId } from '../duel/catalog.ts';
import { ENCOUNTERS, BIOMES } from '../duel/campaign.ts';
import { LOOT_WEIGHTS, SHOP_WEIGHTS } from '../duel/loot.ts';
import {
  CHANNELS,
  CHANNEL_NAMES,
  adjacent,
  findMatches,
  freshBoard,
  fall,
  legalSwaps,
  reshuffle,
  swapBoard,
  type Channel,
  type Match,
  type Tile,
} from './board.ts';
import * as items from './items.ts';
import type {
  ActionSummary,
  Command,
  Config,
  Enemy,
  Frame,
  GroupEvent,
  Hero,
  Intent,
  ItemContext,
  Loadout,
  Result,
  State,
} from './types.ts';
export type { Command, Config, State } from './types.ts';
export const DEFAULT_SKILLS: Loadout = {
  strike: 'heavy',
  arcane: 'burst',
  mend: 'restore',
  rage: 'physical',
  super: 'nova',
};
export const TURN_LIMIT = 40;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const summary = (): ActionSummary => ({
  damage: 0,
  healing: 0,
  casts: 0,
  waves: 0,
  created: 0,
  supers: 0,
  gold: 0,
  xp: 0,
  delayed: false,
});
const reserves = () => ({ strike: 0, arcane: 0, mend: 0, rage: 0 });
const memory = (): Hero['itemState'] => ({
  action: {},
  cycle: {},
  battle: {},
  run: {},
});
const note = (s: State, t: string) => {
  s.log = [...s.log.slice(-39), t];
};
function random(s: State, stream: keyof State['rng']) {
  s.rng[stream] = (Math.imul(s.rng[stream], 1664525) + 1013904223) >>> 0;
  return s.rng[stream] / 4294967296;
}
function nextTile(s: State) {
  return s.nextId++;
}
function upgradeStats(s: State) {
  const c = CLASSES[s.config.classId];
  s.hero.physical = 8 + Math.floor(c.stats.battle / 2) + (s.hero.level - 1) * 2;
  s.hero.magic = 8 + Math.floor(c.stats.air / 2) + (s.hero.level - 1) * 2;
  s.hero.healing =
    5 + Math.floor(c.stats.water / 3) + Math.floor((s.hero.level - 1) / 2);
}
export function enemyFor(room: number): Enemy {
  const e = ENCOUNTERS[room],
    b = e.biome,
    pos = room % 5,
    boss = e.kind === 'boss';
  const damage = 6 + b * 6 + Math.floor(pos / 2),
    wait = b === 0 ? 3 : 2;
  const attack: Intent = {
    kind: 'attack',
    name: boss ? 'Тяжёлый удар' : 'Удар',
    wait,
    damage: damage + (boss ? 4 : 0),
    hits: 1,
  };
  let skill: Intent;
  if (pos === 0)
    skill =
      b >= 2
        ? {
            kind: 'bomb',
            name: 'Чернильная бомба',
            wait: 3,
            damage: damage - 2,
            hits: 1,
            count: 2,
          }
        : {
            kind: 'lock',
            name: 'Скрепить поле',
            wait: 3,
            damage: 3 + b * 2,
            hits: 1,
            count: 2,
          };
  else if (pos === 1)
    skill = {
      kind: 'heal',
      name: 'Восстановление',
      wait: 3,
      damage: Math.ceil(damage / 2),
      hits: 1,
    };
  else if (pos === 2)
    skill = {
      kind: 'drain',
      name: 'Изъять резонанс',
      wait: 2,
      damage,
      hits: 1,
    };
  else if (pos === 3)
    skill = {
      kind: 'flurry',
      name: 'Двойная правка',
      wait: 2,
      damage: Math.max(4, damage - 3),
      hits: 2,
    };
  else
    skill = {
      kind: b % 2 ? 'lock' : 'bomb',
      name: b % 2 ? 'Печать директора' : 'Взрывная печать',
      wait: 3,
      damage: damage + 2,
      hits: 1,
      count: 2 + b,
    };
  const hp = 90 + room * 26 + (boss ? 120 + b * 30 : 0) + (pos === 3 ? 12 : 0);
  return {
    name: e.name,
    art: e.art,
    hp,
    maxHp: hp,
    defense: b * 6 + (boss ? 4 : 0),
    stage: 0,
    countdown: wait,
    delay: 0,
    weaken: 0,
    cycle: 0,
    intents: boss
      ? [
          attack,
          skill,
          {
            kind: 'flurry',
            name: 'Серия ударов',
            wait: 2,
            damage: damage - 2,
            hits: 3,
          },
        ]
      : [attack, skill],
  };
}
export const currentIntent = (s: State) =>
  s.enemy.intents[s.enemy.cycle % s.enemy.intents.length];
export function intentText(s: State) {
  const i = currentIntent(s),
    damage = Math.floor(i.damage * (1 + s.enemy.stage * 0.15));
  const attack =
    Math.max(0, damage - s.enemy.weaken) + (i.hits > 1 ? ` × ${i.hits}` : '');
  const effect =
    i.kind === 'lock'
      ? ` · ${i.count} скрепки`
      : i.kind === 'bomb'
        ? ` · ${i.count} бомбы на 3 хода`
        : i.kind === 'drain'
          ? ' · −2 каждого резонанса'
          : i.kind === 'heal'
            ? ' · лечится на 8% HP'
            : '';
  return `${i.name}: ${attack} урона${effect}`;
}
export function createGame(config: Config): State {
  if (!validConfig(config)) throw new Error('Неверные настройки испытания');
  const c = CLASSES[config.classId],
    hero: Hero = {
      hp: 120,
      maxHp: 120,
      barrier: 0,
      rage: 0,
      resonance: reserves(),
      gear: {},
      physical: 8,
      magic: 8,
      healing: 5,
      gold: config.mode === 'route' ? 10 : 0,
      xp: 0,
      level: 1,
      itemState: memory(),
    };
  for (const id of config.testGear ?? c.gear) hero.gear[ITEMS[id].slot] = id;
  const room = config.mode === 'route' ? 0 : config.foe;
  const s: State = {
    version: 1,
    config: clone(config),
    rng: {
      board: (config.seed ^ 0x9e3779b9) >>> 0,
      effect: (config.seed ^ 0x85ebca6b) >>> 0,
      loot: (config.seed ^ 0xc2b2ae35) >>> 0,
    },
    nextId: 1,
    board: [],
    hero,
    enemy: enemyFor(room),
    room,
    phase: 'battle',
    turn: 0,
    action: 0,
    guard: false,
    offers: [],
    stock: [],
    rewarded: false,
    commands: [],
    log: [],
    skills: clone(config.skills ?? DEFAULT_SKILLS),
    buffs: { physical: 0, magic: 0, healing: 0, weakness: 0 },
    last: summary(),
    metrics: {
      swaps: 0,
      supers: 0,
      damage: 0,
      maxCombo: 0,
      stones: 0,
      victories: 0,
      shuffles: 0,
    },
    achievements: [],
  };
  upgradeStats(s);
  s.board = freshBoard(
    () => random(s, 'board'),
    () => nextTile(s),
  );
  items.startBattle(context(s));
  note(
    s,
    'Соберите тройку. Четвёрка создаёт усиленный камень, пятёрка — суперприём.',
  );
  return s;
}
function context(s: State): ItemContext {
  return {
    state: s,
    hero: s.hero,
    enemy: s.enemy,
    damage: (n) => damage(s, n, 0),
    heal: (n) => heal(s, n),
    addBarrier: (n) => {
      const gain = Math.max(0, Math.min(12 - s.hero.barrier, n));
      s.hero.barrier += gain;
      return gain;
    },
    grantResonance: (c, n) => {
      const old = s.hero.resonance[c];
      s.hero.resonance[c] = Math.max(
        0,
        Math.min(items.resonanceCap(s.hero), old + n),
      );
      const lost = Math.max(0, old + n - s.hero.resonance[c]);
      if (lost) items.onOverflow(context(s), lost);
      return lost;
    },
    addGold: (n) => {
      s.hero.gold += n;
      s.last.gold += n;
    },
    addXp: (n) => {
      s.hero.xp += n;
      s.last.xp += n;
    },
    delayEnemy: () => {
      if (
        s.hero.hp <= 0 ||
        s.enemy.hp <= 0 ||
        s.hero.itemState.cycle.delayUsed ||
        s.enemy.delay > 0
      )
        return false;
      s.enemy.delay = 1;
      s.hero.itemState.cycle.delayUsed = 1;
      s.last.delayed = true;
      note(s, 'Действие врага отложено на один обмен.');
      return true;
    },
    random: () => random(s, 'effect'),
    log: (t) => note(s, t),
  };
}
function damage(s: State, amount: number, defense: number) {
  if (s.hero.hp <= 0 || s.enemy.hp <= 0) return;
  const n = Math.min(
    s.enemy.hp,
    Math.max(0, Math.floor(amount * (1 - Math.max(0, defense) / 100))),
  );
  s.enemy.hp -= n;
  s.last.damage += n;
  s.metrics.damage += n;
}
function heal(s: State, n: number) {
  const healed = Math.max(0, Math.min(s.hero.maxHp - s.hero.hp, Math.floor(n)));
  s.hero.hp += healed;
  s.last.healing += healed;
  return healed;
}
function award(s: State, id: string) {
  if (!s.achievements.includes(id)) s.achievements.push(id);
}
function baseDamage(s: State, g: Match, special: boolean) {
  const rage = 1 + s.hero.rage / 100;
  if (g.kind === 'super' && s.skills.super === 'nova')
    return ((s.hero.physical + s.hero.magic) / 2) * 5 * rage;
  if (g.kind === 'strike' || g.kind === 'arcane') {
    const skill = g.kind === 'strike' ? s.skills.strike : s.skills.arcane;
    const coefficient = special
      ? skill === 'heavy' || skill === 'burst'
        ? 2.5
        : skill === 'leech'
          ? 1.3
          : 1.2
      : 1;
    const buff = g.kind === 'strike' ? s.buffs.physical : s.buffs.magic;
    return (
      (g.kind === 'strike' ? s.hero.physical : s.hero.magic) *
      (coefficient + g.bonus) *
      rage *
      (buff > 0 ? 1.3 : 1)
    );
  }
  return 0;
}
function promote(s: State, cells: number[], kind: Channel) {
  const index = s.board.findIndex(
    (t, i) =>
      !cells.includes(i) &&
      t.kind === kind &&
      t.level === 1 &&
      !t.locked &&
      !t.bomb,
  );
  if (index >= 0) s.board[index] = { ...s.board[index], level: 2 };
}
function cleanse(s: State, all = false) {
  let count = 0;
  for (const t of s.board)
    if (t.locked || t.bomb) {
      delete t.locked;
      delete t.bomb;
      if (++count === (all ? 56 : 5)) break;
    }
}
function resolve(
  s: State,
  frames: Frame[],
  manual: boolean,
  anchor?: [number, number],
  initialSuper?: number,
) {
  let groups: Match[];
  if (initialSuper !== undefined)
    groups = [
      {
        kind: 'super',
        cells: [initialSuper],
        longest: 1,
        shape: 'three',
        casts: 1,
        bonus: 0,
      },
    ];
  else groups = findMatches(s.board);
  for (let wave = 0; groups.length && wave < 100; wave++) {
    s.last.waves++;
    const before = clone(s.board),
      removed = new Set(groups.flatMap((g) => g.cells)),
      protectedTiles = new Map<number, Tile>();
    for (const g of groups) {
      if (s.enemy.hp <= 0 || s.hero.hp <= 0) break;
      const special =
          g.kind === 'super' || g.cells.some((i) => before[i].level > 1),
        channel = g.kind === 'super' ? null : g.kind;
      const event: GroupEvent = {
        match: g,
        channel,
        firstWave: wave === 0,
        special,
        manual,
        removed,
        protectedTiles,
        baseDamage: baseDamage(s, g, special),
        bonusDamage: 0,
        bonusScale: 1,
        income: channel ? g.cells.length : 0,
        cancelUpgrade: false,
      };
      const ctx = context(s);
      items.beforeGroup(ctx, event);
      if (channel) ctx.grantResonance(channel, event.income);
      const count =
        g.kind === 'super' ? (g.cells.length >= 3 ? 4 : 1) : g.casts;
      if (special) s.hero.itemState.action.enhanced = 1;
      for (let cast = 0; cast < count; cast++) {
        if (s.enemy.hp <= 0 || s.hero.hp <= 0) break;
        if (g.kind === 'strike' || g.kind === 'arcane') {
          s.last.casts++;
          const previous = s.enemy.hp,
            piercing =
              special && g.kind === 'strike' && s.skills.strike === 'pierce';
          damage(
            s,
            event.baseDamage * event.bonusScale +
              (cast === 0 ? event.bonusDamage : 0),
            piercing ? 0 : s.enemy.defense - s.enemy.stage * 5,
          );
          if (
            special &&
            g.kind === 'strike' &&
            s.skills.strike === 'leech' &&
            previous > s.enemy.hp
          )
            heal(s, Math.max(1, Math.floor((previous - s.enemy.hp) * 0.1)));
          if (special && g.kind === 'arcane' && s.skills.arcane === 'weaken')
            s.buffs.weakness = 4;
          if (special && g.kind === 'arcane' && s.skills.arcane === 'delay')
            ctx.delayEnemy();
        } else if (g.kind === 'mend') {
          const k = special
            ? s.skills.mend === 'restore'
              ? 1.9
              : s.skills.mend === 'cleanse'
                ? 1.1
                : 0.9
            : 1;
          let n =
            s.hero.healing *
            (k + g.bonus) *
            (1 + s.hero.rage / 100) *
            (s.buffs.healing > 0 ? 1.5 : 1);
          if (s.hero.gear.armor === 'saltCoat') n *= 0.6;
          heal(s, n);
          if (special && cast === 0) {
            if (s.skills.mend === 'cleanse') cleanse(s);
            if (s.skills.mend === 'grow') promote(s, [...removed], 'strike');
          }
        } else if (g.kind === 'rage') {
          if (s.hero.rage >= 60) {
            s.last.casts++;
            damage(
              s,
              ((s.hero.physical + s.hero.magic) / 2) *
                0.8 *
                (1 + s.hero.rage / 100),
              0,
            );
          }
          s.hero.rage = Math.min(
            60,
            s.hero.rage + Math.floor(4 * ((special ? 1.5 : 1) + g.bonus)),
          );
          if (special) s.buffs[s.skills.rage] = 4;
        } else {
          s.last.supers++;
          if (s.skills.super === 'nova') {
            s.last.casts++;
            damage(
              s,
              event.baseDamage * event.bonusScale +
                (cast === 0 ? event.bonusDamage : 0),
              0,
            );
          } else if (s.skills.super === 'renew') {
            heal(s, s.hero.healing * 3 * (1 + s.hero.rage / 100));
            cleanse(s, true);
          } else {
            heal(s, s.hero.healing);
            s.hero.rage = Math.min(60, s.hero.rage + 20);
          }
        }
      }
      items.afterGroup(ctx, event);
      if (g.upgrade && !event.cancelUpgrade && channel) {
        const cell =
          anchor?.find((i) => g.cells.includes(i)) ??
          g.cells.reduce(
            (best, i) => (before[i].level > before[best].level ? i : best),
            g.cells[0],
          );
        // Creation wins over an item replacement; only one tile can occupy a cell.
        protectedTiles.set(cell, {
          id: nextTile(s),
          kind: g.upgrade === 'super' ? 'super' : channel,
          level: g.upgrade === 'super' ? 1 : g.upgrade,
        });
        s.last.created++;
        s.metrics.stones++;
        if (g.upgrade === 'super') award(s, 'super-forged');
      }
      // Matches bordering a threat clear it without harvesting another resource.
      for (let i = 0; i < s.board.length; i++)
        if (
          !removed.has(i) &&
          s.board[i].bomb &&
          g.cells.some((cell) => adjacent(cell, i))
        )
          delete s.board[i].bomb;
    }
    s.board = fall(
      s.board,
      removed,
      () => random(s, 'board'),
      () => nextTile(s),
      protectedTiles,
    );
    frames.push({
      board: before,
      after: clone(s.board),
      cells: [...removed],
      text: `Попаданий: ${s.last.casts} · ${s.last.damage} урона${s.last.healing ? ` · +${s.last.healing} HP` : ''}`,
      kind: initialSuper !== undefined && wave === 0 ? 'super' : 'match',
      heroHp: s.hero.hp,
      enemyHp: s.enemy.hp,
    });
    anchor = undefined;
    groups = findMatches(s.board);
    if (s.enemy.hp <= 0 || s.hero.hp <= 0) break;
    if (wave === 99) {
      s.board = freshBoard(
        () => random(s, 'board'),
        () => nextTile(s),
      );
      note(s, 'Длинная серия завершена: поле обновлено.');
    }
  }
}
function incoming(s: State, n: number, index: number) {
  const ctx = context(s);
  let hit = Math.max(0, items.beforeEnemyHit(ctx, n, index));
  const absorbed = Math.min(s.hero.barrier, hit);
  s.hero.barrier -= absorbed;
  hit -= absorbed;
  hit = items.afterBarrierDamage(ctx, hit);
  hit = items.preventDeath(ctx, hit);
  const lost = Math.min(s.hero.hp, Math.max(0, Math.floor(hit)));
  s.hero.hp -= lost;
  items.afterEnemyHit(ctx, lost, absorbed, index);
}
function enemyAct(s: State, frames: Frame[]) {
  const intent = currentIntent(s),
    before = clone(s.board),
    ctx = context(s);
  {
    for (
      let hit = 0;
      hit < intent.hits && s.hero.hp > 0 && s.enemy.hp > 0;
      hit++
    )
      incoming(
        s,
        Math.max(
          0,
          Math.floor(
            intent.damage *
              (1 + s.enemy.stage * 0.15) *
              (s.buffs.weakness > 0 ? 0.7 : 1),
          ) - (hit === 0 ? s.enemy.weaken : 0),
        ),
        hit,
      );
    if (s.hero.hp > 0 && s.enemy.hp > 0) {
      if (intent.kind === 'heal') {
        const amount = Math.min(
          s.enemy.maxHp - s.enemy.hp,
          Math.ceil(s.enemy.maxHp * 0.08),
        );
        s.enemy.hp += amount;
        note(s, `Враг восстановил ${amount} HP.`);
      }
      if (intent.kind === 'drain') {
        for (const c of CHANNELS)
          s.hero.resonance[c] = Math.max(0, s.hero.resonance[c] - 2);
        s.hero.rage = Math.max(0, s.hero.rage - 4);
      }
      if (intent.kind === 'lock' || intent.kind === 'bomb') {
        const candidates = s.board
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => t.kind !== 'super' && !t.locked && !t.bomb);
        for (let j = 0; j < (intent.count ?? 1) && candidates.length; j++) {
          const n = Math.floor(random(s, 'effect') * candidates.length),
            { i } = candidates.splice(n, 1)[0];
          if (intent.kind === 'lock') s.board[i].locked = 3;
          else s.board[i].bomb = 3;
        }
      }
    }
  }
  s.hero.barrier = 0;
  items.afterEnemyAction(ctx);
  s.enemy.weaken = 0;
  s.enemy.cycle++;
  s.enemy.countdown = currentIntent(s).wait;
  frames.push({
    board: before,
    after: clone(s.board),
    cells: [],
    text: intent.name,
    kind: 'enemy',
    heroHp: s.hero.hp,
    enemyHp: s.enemy.hp,
  });
}
function ensureMoves(s: State, frames: Frame[]) {
  if (
    s.phase !== 'battle' ||
    s.board.some((t) => t.kind === 'super' && !t.locked) ||
    legalSwaps(s.board).length
  )
    return;
  const before = clone(s.board);
  s.board = reshuffle(s.board, () => random(s, 'board'));
  if (
    !legalSwaps(s.board).length &&
    !s.board.some((t) => t.kind === 'super' && !t.locked)
  ) {
    // An entirely pinned board cannot shuffle. Expire pins explicitly, preserving
    // earned upgraded and super tiles instead of discarding the player's work.
    s.board = s.board.map((t) => {
      const next = { ...t };
      delete next.locked;
      return next;
    });
    s.board = reshuffle(s.board, () => random(s, 'board'));
    if (
      !legalSwaps(s.board).length &&
      !s.board.some((t) => t.kind === 'super' && !t.locked)
    ) {
      const earned = s.board.filter((t) => t.level > 1 || t.kind === 'super');
      s.board = freshBoard(
        () => random(s, 'board'),
        () => nextTile(s),
      );
      for (let i = 0; i < earned.length; i++)
        s.board[i] = { ...s.board[i], level: earned[i].level };
      note(
        s,
        'Закрытый расклад восстановлен: уровни сохранены, виды камней перераспределены.',
      );
    }
  }
  s.metrics.shuffles++;
  note(s, 'Нет доступных обменов — поле перемешано без расхода хода.');
  frames.push({
    board: before,
    after: clone(s.board),
    cells: [],
    text: 'Новый расклад',
    kind: 'shuffle',
    heroHp: s.hero.hp,
    enemyHp: s.enemy.hp,
  });
}
function offers(s: State) {
  const e = ENCOUNTERS[s.room],
    owned = Object.values(s.hero.gear);
  let pool = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) =>
      !owned.includes(id) &&
      !(id === 'insurance' && s.hero.itemState.run.insurance),
  );
  let legendary = false;
  const pick = (weights: number[]) => {
    const eligible = pool.filter(
      (id) => !legendary || ITEMS[id].rarity !== 'legendary',
    );
    const effective = weights.map((w, i) =>
      eligible.some((id) => ITEMS[id].rarity === RARITIES[i]) ? w : 0,
    );
    let roll = random(s, 'loot') * effective.reduce((a, b) => a + b, 0);
    let tier = effective.findIndex((w) => w > 0);
    for (let i = 0; i < effective.length; i++) {
      if (effective[i] <= 0) continue;
      roll -= effective[i];
      if (roll < 0) {
        tier = i;
        break;
      }
    }
    const choices = eligible.filter(
      (id) => ITEMS[id].rarity === RARITIES[tier],
    );
    if (!choices.length) return null;
    const id = choices[Math.floor(random(s, 'loot') * choices.length)];
    pool = pool.filter((x) => x !== id);
    legendary ||= ITEMS[id].rarity === 'legendary';
    return id;
  };
  const weights = LOOT_WEIGHTS[e.kind][e.biome],
    guaranteed =
      e.kind === 'boss'
        ? weights.map((w, i) => (i < Math.min(3, e.biome + 1) ? 0 : w))
        : weights;
  s.offers = [];
  s.stock = [];
  for (let i = 0; i < 3; i++) {
    const id = pick(
      i === 0 &&
        pool.some((id) => guaranteed[RARITIES.indexOf(ITEMS[id].rarity)] > 0)
        ? guaranteed
        : weights,
    );
    if (id) s.offers.push(id);
  }
  for (let i = 0; i < 3; i++) {
    const id = pick(SHOP_WEIGHTS[e.biome]);
    if (id) s.stock.push(id);
  }
}
function outcome(s: State) {
  if (s.hero.hp <= 0) {
    s.phase = 'lost';
    note(s, 'Вы просыпаетесь за рабочим столом. Юла всё ещё крутится.');
    return true;
  }
  if (s.enemy.hp > 0) return false;
  s.metrics.victories++;
  const e = ENCOUNTERS[s.room],
    gold =
      8 + e.biome * 3 + (e.kind === 'boss' ? 10 : e.kind === 'elite' ? 5 : 0);
  s.hero.gold += gold;
  s.hero.xp += 8 + e.biome * 2;
  while (s.hero.xp >= 12 + s.hero.level * 6) {
    s.hero.xp -= 12 + s.hero.level * 6;
    s.hero.level++;
    s.hero.maxHp += 8;
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 8);
    upgradeStats(s);
  }
  if (e.kind === 'boss') award(s, `boss-${e.biome}`);
  if (s.config.mode === 'duel' || s.room === ENCOUNTERS.length - 1) {
    s.phase = 'won';
    note(s, 'Дверь открылась. Победа.');
  } else {
    s.phase = 'camp';
    offers(s);
    s.rewarded = false;
    note(
      s,
      `Бой завершён: +${gold} золота. Выберите находку и следующую дверь.`,
    );
  }
  return true;
}
function finishAction(
  s: State,
  frames: Frame[],
  spendsTurn: boolean,
  oldHazards: Set<number>,
) {
  const ctx = context(s);
  const gold = Math.min(6, Math.max(0, s.last.casts - 1));
  if (gold) {
    ctx.addGold(gold);
    items.onIncome(ctx, 'gold', gold);
  }
  if (s.hero.itemState.action.enhanced) {
    // Diploma trades this earned XP only; victory experience remains intact.
    if (s.hero.gear.ring !== 'infiniteDiploma') ctx.addXp(1);
    items.onIncome(ctx, 'xp', 1);
  }
  items.afterAction(ctx);
  if (spendsTurn) {
    s.turn++;
    s.metrics.swaps++;
  }
  s.metrics.maxCombo = Math.max(s.metrics.maxCombo, s.last.casts);
  if (s.last.casts >= 7) award(s, 'seven-hit-combo');
  if (outcome(s)) return;
  if (s.last.casts >= 11 || s.last.damage >= s.enemy.maxHp * 0.3)
    s.enemy.stage = 2;
  else if (
    s.enemy.stage === 0 &&
    (s.last.casts >= 7 || s.last.damage >= s.enemy.maxHp * 0.18)
  )
    s.enemy.stage = 1;
  if (spendsTurn) {
    // The final legal swap can win; a failed forty-first opportunity cannot.
    if (s.turn >= TURN_LIMIT) {
      s.phase = 'lost';
      note(s, 'Смена закончилась: исчерпаны 40 обменов.');
      return;
    }
    if (s.enemy.delay > 0) s.enemy.delay--;
    else s.enemy.countdown--;
    const survivingHazards = new Map(
      s.board
        .filter((t) => oldHazards.has(t.id))
        .map((t) => [t.id, { bomb: t.bomb, locked: t.locked }]),
    );
    if (s.enemy.countdown <= 0) enemyAct(s, frames);
    if (outcome(s)) return;
    for (const t of s.board) {
      const old = survivingHazards.get(t.id);
      if (!old) continue;
      if (old.locked && t.locked && --t.locked <= 0) delete t.locked;
      if (old.bomb && t.bomb && --t.bomb <= 0) {
        delete t.bomb;
        // An expired hazard is not the first hit of a new enemy action.
        incoming(s, 10 + ENCOUNTERS[s.room].biome * 3, -1);
        note(s, 'Чернильная бомба взорвалась.');
        if (s.hero.hp <= 0 || s.enemy.hp <= 0) break;
      }
    }
    for (const b of ['physical', 'magic', 'healing', 'weakness'] as const)
      s.buffs[b] = Math.max(0, s.buffs[b] - 1);
  }
  if (!outcome(s)) ensureMoves(s, frames);
}
function equip(s: State, id: ItemId) {
  s.hero.gear[ITEMS[id].slot] = id;
  for (const c of CHANNELS)
    s.hero.resonance[c] = Math.min(
      s.hero.resonance[c],
      items.resonanceCap(s.hero),
    );
  if (s.hero.gear.ring !== 'yieldRing') s.guard = false;
}
export function dispatch(original: State, command: Command): Result {
  if (!validCommand(command))
    return { state: original, frames: [], error: 'Неизвестное действие' };
  const s: State = clone({ ...original, commands: [] });
  const frames: Frame[] = [];
  const fail = (error: string): Result => ({
    state: original,
    frames: [],
    error,
  });
  if (command.type === 'guard') {
    if (s.phase !== 'battle' || s.hero.gear.ring !== 'yieldRing')
      return fail('Кольцо уступки не надето');
    s.guard = command.value;
  } else if (command.type === 'swap' || command.type === 'super') {
    if (s.phase !== 'battle') return fail('Бой уже завершён');
    if (command.type === 'swap') {
      const { a, b } = command;
      if (!adjacent(a, b) || s.board[a].locked || s.board[b].locked)
        return fail('Выберите две соседние свободные фишки');
      const next = swapBoard(s.board, { a, b });
      if (
        !findMatches(next).some(
          (g) => g.cells.includes(a) || g.cells.includes(b),
        )
      )
        return fail('Нужно собрать минимум три одинаковые фишки');
      s.board = next;
    } else if (
      s.board[command.cell]?.kind !== 'super' ||
      s.board[command.cell].locked
    )
      return fail('Здесь нет готового суперприёма');
    const oldHazards = new Set(
      s.board.filter((t) => t.locked || t.bomb).map((t) => t.id),
    );
    s.action++;
    s.last = summary();
    items.startAction(context(s));
    if (command.type === 'swap')
      resolve(s, frames, true, [command.a, command.b]);
    else {
      s.metrics.supers++;
      resolve(s, frames, false, undefined, command.cell);
    }
    finishAction(s, frames, command.type === 'swap', oldHazards);
  } else {
    if (s.phase !== 'camp') return fail('Это действие доступно между боями');
    if (command.type === 'reward') {
      if (s.rewarded) return fail('Находка уже выбрана');
      if (command.item !== null && !s.offers.includes(command.item))
        return fail('Этой находки нет среди наград');
      if (command.item) equip(s, command.item);
      s.rewarded = true;
    }
    if (command.type === 'buy') {
      const item = ITEMS[command.item];
      if (!s.stock.includes(command.item) || s.hero.gold < item.price)
        return fail('Товар недоступен или не хватает золота');
      s.hero.gold -= item.price;
      equip(s, command.item);
      s.stock = s.stock.filter((id) => id !== command.item);
    }
    if (command.type === 'next') {
      if (!s.rewarded) return fail('Выберите находку или откажитесь');
      s.room++;
      s.enemy = enemyFor(s.room);
      s.phase = 'battle';
      s.turn = 0;
      s.hero.hp = Math.min(
        s.hero.maxHp,
        s.hero.hp + (s.room % 5 === 0 ? 24 : 8),
      );
      s.hero.rage = Math.floor(s.hero.rage * 0.2);
      s.hero.barrier = 0;
      s.hero.resonance = reserves();
      const run = s.hero.itemState.run;
      s.hero.itemState = memory();
      s.hero.itemState.run = run;
      s.buffs = { physical: 0, magic: 0, healing: 0, weakness: 0 };
      s.last = summary();
      s.board = freshBoard(
        () => random(s, 'board'),
        () => nextTile(s),
      );
      items.startBattle(context(s));
      s.offers = [];
      s.stock = [];
      note(s, `${BIOMES[ENCOUNTERS[s.room].biome].name}. ${s.enemy.name}.`);
    }
  }
  s.commands = [...original.commands, clone(command)];
  return { state: s, frames };
}
export function previewSwap(s: State, a: number, b: number) {
  if (
    s.phase !== 'battle' ||
    !adjacent(a, b) ||
    s.board[a].locked ||
    s.board[b].locked
  )
    return null;
  const matches = findMatches(swapBoard(s.board, { a, b }));
  if (!matches.some((g) => g.cells.includes(a) || g.cells.includes(b)))
    return null;
  return {
    cells: [...new Set(matches.flatMap((g) => g.cells))],
    text: matches
      .map(
        (g) =>
          `${CHANNEL_NAMES[g.kind]}: ${g.casts} ${g.kind === 'mend' ? 'лечения' : g.kind === 'rage' ? 'усиления' : 'приёма'}${g.upgrade ? ` + ${g.upgrade === 'super' ? 'S' : `камень ${g.upgrade}`}` : ''}`,
      )
      .join(' · '),
  };
}
const skillChoices: Record<keyof Loadout, string[]> = {
  strike: ['heavy', 'pierce', 'leech'],
  arcane: ['burst', 'weaken', 'delay'],
  mend: ['restore', 'cleanse', 'grow'],
  rage: ['physical', 'magic', 'healing'],
  super: ['nova', 'renew', 'surge'],
};
function validConfig(c: Config) {
  if (
    !c ||
    !Number.isInteger(c.seed) ||
    c.seed < 0 ||
    c.seed > 0xffffffff ||
    !Object.hasOwn(CLASSES, c.classId) ||
    !['route', 'duel'].includes(c.mode) ||
    !Number.isInteger(c.foe) ||
    c.foe < 0 ||
    c.foe >= 20
  )
    return false;
  if (c.testGear) {
    if (
      c.mode !== 'duel' ||
      !Array.isArray(c.testGear) ||
      c.testGear.length > 4 ||
      c.testGear.some((id) => !Object.hasOwn(ITEMS, id))
    )
      return false;
    if (
      new Set(c.testGear.map((id) => ITEMS[id].slot)).size !== c.testGear.length
    )
      return false;
  }
  if (
    c.skills &&
    (Object.keys(skillChoices) as (keyof Loadout)[]).some(
      (k) => !skillChoices[k].includes(c.skills![k]),
    )
  )
    return false;
  return true;
}
function validCommand(c: Command) {
  if (!c || typeof c !== 'object') return false;
  switch (c.type) {
    case 'swap':
      return Number.isInteger(c.a) && Number.isInteger(c.b);
    case 'super':
      return Number.isInteger(c.cell) && c.cell >= 0 && c.cell < 56;
    case 'guard':
      return typeof c.value === 'boolean';
    case 'reward':
      return c.item === null || Object.hasOwn(ITEMS, c.item);
    case 'buy':
      return Object.hasOwn(ITEMS, c.item);
    case 'next':
      return true;
    default:
      return false;
  }
}
const fingerprint = (s: State) => {
  let hash = 2166136261;
  const text = JSON.stringify({ ...s, commands: [] });
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
};
export function saveGame(s: State) {
  return JSON.stringify({
    schema: 'oskolki-mirror-1',
    config: s.config,
    commands: s.commands,
    fingerprint: fingerprint(s),
  });
}
export function loadGame(raw: string): State | null {
  try {
    if (raw.length > 2_000_000) return null;
    const data = JSON.parse(raw);
    if (
      data.schema !== 'oskolki-mirror-1' ||
      !validConfig(data.config) ||
      !Array.isArray(data.commands) ||
      data.commands.length > 5000
    )
      return null;
    let s = createGame(data.config);
    for (const c of data.commands) {
      const r = dispatch(s, c);
      if (r.error) return null;
      s = r.state;
    }
    return fingerprint(s) === data.fingerprint ? s : null;
  } catch {
    return null;
  }
}

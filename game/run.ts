import { chance, derive, int, pick, range, rng, shuffle, weighted } from './rng.ts';
import {
  alive,
  playerActive,
  playerBomb,
  playerMove,
  setTarget,
  startCombat,
} from './combat.ts';
import { CHARACTERS, FLOORS } from './content/floors.ts';
import { ENEMIES } from './content/enemies.ts';
import {
  ITEMS,
  TRANSFORMATIONS,
  computeMods,
  tagCounts,
  type Mods,
  type Pool,
} from './content/items.ts';
import { DIRS, OPPOSITE, generateFloor, secretAt } from './mapgen.ts';
import type {
  Action,
  CharId,
  Dir,
  GameEvent,
  Pickup,
  PickupKind,
  Room,
  RunState,
  ShopSlot,
} from './types.ts';

export const RULES = 'rebirth-1';

export function modsOf(run: RunState): Mods {
  return computeMods(run.hero.items, run.hero.transformations);
}

export function currentRoom(run: RunState): Room {
  return run.map.rooms[run.room];
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export interface NewRunOptions {
  seed: number;
  char?: CharId;
  /** Item ids unlocked in the profile. */
  unlocked?: string[];
  /** 0-based index of the final floor (2 = three floors, 3 = with Directorate). */
  lastFloor?: number;
  customSeed?: boolean;
}

export function newRun(opts: NewRunOptions): { run: RunState; events: GameEvent[] } {
  const seed = opts.seed >>> 0;
  const ch = CHARACTERS[opts.char ?? 'intern'];
  const pool = Object.values(ITEMS)
    .filter((i) => i.pools.length && (!i.unlock || opts.unlocked?.includes(i.unlock)))
    .map((i) => i.id)
    .filter((id) => id !== ch.active && !ch.items.includes(id));
  const run: RunState = {
    v: 1,
    seed,
    customSeed: !!opts.customSeed,
    floor: 0,
    lastFloor: opts.lastFloor ?? 2,
    rng: {
      board: rng(derive(seed, 'board')),
      loot: rng(derive(seed, 'loot')),
      map: rng(derive(seed, 'map')),
      ai: rng(derive(seed, 'ai')),
      fx: rng(derive(seed, 'fx')),
    },
    hero: {
      char: ch.id,
      hearts: ch.hearts,
      hp: ch.hearts * 2,
      soul: ch.soul,
      armor: 0,
      charge: 0,
      coins: ch.coins,
      bombs: ch.bombs,
      keys: ch.keys,
      baseDamage: ch.damage,
      active: ch.active,
      items: [...ch.items],
      transformations: [],
      flashUsed: false,
    },
    map: { rooms: [], start: 0, boss: 0 },
    room: 0,
    phase: 'explore',
    combat: null,
    pool,
    stats: {
      moves: 0,
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
      coinsEarned: 0,
      bombsUsed: 0,
      maxCombo: 0,
      maxRocketsInMove: 0,
      roomsCleared: 0,
      bossesNoHit: 0,
      itemsTaken: 0,
      cascadeDamage: 0,
      matchDamage: 0,
      deathCause: '',
      bossesKilled: [],
    },
    nextId: 1,
    catCooldown: 0,
    flags: {},
  };
  run.hero.charge = run.hero.active ? (ITEMS[run.hero.active].charge ?? 0) : 0;
  const events: GameEvent[] = [];
  enterFloor(run, 0, events);
  return { run, events };
}

function enterFloor(run: RunState, floor: number, ev: GameEvent[]) {
  run.floor = floor;
  run.map = generateFloor(run.rng.map, floor);
  run.room = run.map.start;
  run.hero.flashUsed = false;
  run.hero.armor = 0;
  ev.push({ t: 'floor', floor });
  ev.push({ t: 'enterRoom', room: run.room, dir: null });
}

// ── Items ────────────────────────────────────────────────────────────

const QUALITY_WEIGHT = (floor: number) => [1, 3, 3, floor >= 1 ? 3 : 1.5, floor >= 2 ? 1.2 : 0.4];

export function rollItem(run: RunState, pool: Pool, reserve = true): string {
  const candidates = run.pool.filter((id) => ITEMS[id].pools.includes(pool));
  if (!candidates.length) return pool === 'deal' ? 'bonus' : 'sandwich';
  const weights = QUALITY_WEIGHT(run.floor);
  const id = weighted(
    run.rng.loot,
    candidates.map((c) => [c, weights[ITEMS[c].quality]] as const),
  );
  if (reserve) run.pool = run.pool.filter((x) => x !== id);
  return id;
}

function nextId(run: RunState) {
  return run.nextId++;
}

function checkTransformations(run: RunState, ev: GameEvent[], item: string) {
  const counts = tagCounts(run.hero.items);
  for (const [tag, n] of counts) {
    if (n >= 3 && !run.hero.transformations.includes(tag)) {
      run.hero.transformations.push(tag);
      ev.push({ t: 'item', item, source: 'pedestal', transformation: tag });
      ev.push({ t: 'message', text: `Трансформация: ${TRANSFORMATIONS[tag].name}` });
    }
  }
}

function heal(run: RunState, halves: number) {
  const before = run.hero.hp;
  run.hero.hp = Math.min(run.hero.hearts * 2, run.hero.hp + halves);
  return run.hero.hp - before;
}

export function gainItem(run: RunState, id: string, source: 'pedestal' | 'shop' | 'deal', ev: GameEvent[]) {
  const def = ITEMS[id];
  const room = currentRoom(run);
  run.stats.itemsTaken++;
  if (def.kind === 'active') {
    const old = run.hero.active;
    run.hero.active = id;
    run.hero.charge = def.charge ?? 0;
    if (old) room.pedestals.push({ id: nextId(run), item: old });
  } else {
    run.hero.items.push(id);
    if (def.hearts) {
      run.hero.hearts = Math.max(1, Math.min(12, run.hero.hearts + def.hearts));
      run.hero.hp = Math.min(run.hero.hp, run.hero.hearts * 2);
    }
    if (def.heal) heal(run, def.heal);
    if (def.coins) run.hero.coins = Math.min(99, run.hero.coins + def.coins);
    if (def.bombs) run.hero.bombs = Math.min(99, run.hero.bombs + def.bombs);
    if (def.keys) run.hero.keys = Math.min(99, run.hero.keys + def.keys);
  }
  ev.push({ t: 'item', item: id, source });
  checkTransformations(run, ev, id);
}

// ── Pickups ──────────────────────────────────────────────────────────

const DROP_TABLE: [PickupKind, number][] = [
  ['coin', 30],
  ['nickel', 5],
  ['half', 16],
  ['heart', 6],
  ['bomb', 12],
  ['key', 11],
  ['chest', 10],
  ['soul', 5],
  ['lockedChest', 4],
];

function rollPickup(run: RunState): Pickup {
  return { id: nextId(run), kind: weighted(run.rng.loot, DROP_TABLE) };
}

/** Collects a pickup if it makes sense; returns false when it must stay on the floor. */
function collect(run: RunState, p: Pickup, ev: GameEvent[], manual: boolean): boolean {
  const h = run.hero;
  switch (p.kind) {
    case 'coin':
    case 'nickel': {
      const n = p.kind === 'coin' ? 1 : 5;
      h.coins = Math.min(99, h.coins + n);
      run.stats.coinsEarned += n;
      ev.push({ t: 'pickup', pickup: p, amount: n });
      return true;
    }
    case 'half':
    case 'heart': {
      if (h.hp >= h.hearts * 2) return false;
      const got = heal(run, p.kind === 'half' ? 1 : 2);
      ev.push({ t: 'pickup', pickup: p, amount: got });
      return true;
    }
    case 'soul':
      h.soul = Math.min(12, h.soul + 2);
      ev.push({ t: 'pickup', pickup: p, amount: 2 });
      return true;
    case 'bomb':
      h.bombs = Math.min(99, h.bombs + 1);
      ev.push({ t: 'pickup', pickup: p, amount: 1 });
      return true;
    case 'key':
      h.keys = Math.min(99, h.keys + 1);
      ev.push({ t: 'pickup', pickup: p, amount: 1 });
      return true;
    case 'chest': {
      ev.push({ t: 'pickup', pickup: p, amount: 0 });
      const n = range(run.rng.loot, 2, 3);
      for (let k = 0; k < n; k++) {
        const inner: Pickup = {
          id: nextId(run),
          kind: weighted(run.rng.loot, [
            ['coin', 5],
            ['bomb', 2],
            ['key', 2],
            ['half', 2],
          ] as [PickupKind, number][]),
        };
        if (!collect(run, inner, ev, false)) currentRoom(run).pickups.push(inner);
      }
      return true;
    }
    case 'lockedChest': {
      if (!manual || h.keys <= 0) return false;
      h.keys--;
      ev.push({ t: 'pickup', pickup: p, amount: 0 });
      if (chance(run.rng.loot, 0.6)) {
        currentRoom(run).pedestals.push({ id: nextId(run), item: rollItem(run, 'treasure') });
      } else {
        for (const kind of ['nickel', 'soul'] as PickupKind[]) collect(run, { id: nextId(run), kind }, ev, false);
      }
      return true;
    }
  }
}

// ── Rooms ────────────────────────────────────────────────────────────

const PICKUP_PRICES: Partial<Record<PickupKind, number>> = { half: 3, heart: 5, bomb: 5, key: 5, soul: 7 };

function stockRoom(run: RunState, room: Room) {
  if (room.kind === 'treasure' && !room.pedestals.length) {
    room.pedestals.push({ id: nextId(run), item: rollItem(run, 'treasure') });
  }
  if (room.kind === 'shop' && !room.shop.length) {
    const slots: ShopSlot[] = [];
    for (let k = 0; k < 2; k++) {
      const item = rollItem(run, 'shop');
      slots.push({ id: nextId(run), kind: 'item', item, price: 15 + 4 * ITEMS[item].quality + int(run.rng.loot, 3) });
    }
    const pickups = shuffle(run.rng.loot, ['half', 'heart', 'bomb', 'key', 'soul'] as PickupKind[]).slice(0, 2);
    for (const kind of pickups) slots.push({ id: nextId(run), kind, price: PICKUP_PRICES[kind]! });
    room.shop = slots;
  }
  if (room.kind === 'secret' && !room.cleared) {
    room.cleared = true;
    if (chance(run.rng.loot, 0.55)) room.pedestals.push({ id: nextId(run), item: rollItem(run, 'secret') });
    const n = range(run.rng.loot, 2, 4);
    for (let k = 0; k < n; k++)
      room.pickups.push({ id: nextId(run), kind: pick(run.rng.loot, ['nickel', 'coin', 'soul', 'bomb'] as PickupKind[]) });
  }
}

function enterRoom(run: RunState, room: Room, dir: Dir | null, ev: GameEvent[]) {
  const first = !room.visited;
  run.room = room.id;
  room.visited = true;
  room.seen = true;
  for (const id of Object.values(room.doors)) if (id !== undefined && !run.map.rooms[id].hidden) run.map.rooms[id].seen = true;
  ev.push({ t: 'enterRoom', room: room.id, dir });
  const mods = modsOf(run);
  if (first && mods.ledger && room.kind !== 'start') {
    const interest = Math.floor(run.hero.coins / 10);
    if (interest > 0) {
      run.hero.coins = Math.min(99, run.hero.coins + interest);
      ev.push({ t: 'message', text: `Проценты: +${interest}` });
    }
  }
  if (!room.cleared && (room.kind === 'combat' || room.kind === 'boss')) {
    run.combat = startCombat(run, room, mods, ev);
    run.nextId = Math.max(run.nextId, run.combat.board.nextId);
    run.phase = 'combat';
  } else {
    stockRoom(run, room);
    // Leftover pickups are grabbed automatically when possible.
    room.pickups = room.pickups.filter((p) => !collect(run, p, ev, false));
  }
}

function clearRoom(run: RunState, ev: GameEvent[]) {
  const c = run.combat!;
  const room = currentRoom(run);
  const mods = modsOf(run);
  room.cleared = true;
  run.stats.roomsCleared++;
  run.hero.armor = 0;
  const drops: Pickup[] = [];
  if (c.boss) {
    const boss = room.enemies[0];
    run.stats.bossesKilled.push(boss);
    if (c.damageTaken === 0) run.stats.bossesNoHit++;
    drops.push({ id: nextId(run), kind: 'heart' });
    if (run.floor < run.lastFloor) {
      room.pedestals.push({ id: nextId(run), item: rollItem(run, 'boss') });
      room.trapdoor = true;
      const dealChance = 0.35 + (c.damageTaken === 0 ? 0.35 : 0);
      if (chance(run.rng.loot, dealChance)) {
        for (let k = 0; k < 2; k++) {
          const item = rollItem(run, 'deal');
          room.pedestals.push({ id: nextId(run), item, hearts: ITEMS[item].quality >= 4 ? 2 : 1 });
        }
        ev.push({ t: 'message', text: 'Сверхурочные: сделка открыта' });
      }
    }
  } else if (chance(run.rng.loot, 0.45)) drops.push(rollPickup(run));
  if (mods.mint && c.damageTaken === 0) {
    const got = heal(run, 1);
    if (got) ev.push({ t: 'message', text: 'Мятная жвачка: +½' });
  }
  if (mods.catBowl) {
    if (run.catCooldown <= 0) {
      const got = heal(run, 1);
      if (got) {
        ev.push({ t: 'message', text: 'Мурлыка: +½' });
        run.catCooldown = 3;
      }
    } else run.catCooldown--;
  }
  run.combat = null;
  run.phase = 'explore';
  ev.push({ t: 'roomClear', pickups: drops });
  room.pickups.push(...drops);
  room.pickups = room.pickups.filter((p) => !collect(run, p, ev, false));
  if (c.boss && run.floor >= run.lastFloor) {
    run.phase = 'won';
    ev.push({ t: 'won' });
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────

export function dispatch(state: RunState, action: Action): { run: RunState; events: GameEvent[] } {
  const run = clone(state);
  const ev: GameEvent[] = [];
  if (run.phase === 'dead' || run.phase === 'won') {
    ev.push({ t: 'invalid', reason: 'Забег окончен' });
    return { run, events: ev };
  }
  const mods = modsOf(run);
  const room = currentRoom(run);
  const inCombat = run.phase === 'combat' && run.combat;
  switch (action.type) {
    case 'move':
      if (!inCombat) return fail(run, ev, 'Не в бою');
      playerMove(run, mods, action.move, ev);
      break;
    case 'target':
      if (!inCombat) return fail(run, ev, 'Не в бою');
      setTarget(run, action.uid, ev);
      return { run, events: ev };
    case 'bomb':
      if (!inCombat) return fail(run, ev, 'Не в бою');
      playerBomb(run, mods, action.cell, ev);
      break;
    case 'active': {
      if (inCombat) {
        playerActive(run, mods, action, ev);
        break;
      }
      const def = run.hero.active ? ITEMS[run.hero.active] : undefined;
      if (!def || def.when !== 'explore') return fail(run, ev, 'Сейчас нельзя');
      if (run.hero.charge < (def.charge ?? 0)) return fail(run, ev, 'Мало чернил');
      const rerollable = room.pedestals.filter((p) => !p.taken && !p.hearts);
      if (!rerollable.length) return fail(run, ev, 'Нечего перебрасывать');
      run.hero.charge -= def.charge ?? 0;
      for (const p of rerollable) p.item = rollItem(run, room.kind === 'boss' ? 'boss' : room.kind === 'secret' ? 'secret' : 'treasure');
      ev.push({ t: 'activeUsed', item: def.id });
      break;
    }
    case 'go': {
      if (inCombat) return fail(run, ev, 'Двери заперты, пока идёт бой');
      const id = room.doors[action.dir];
      if (id === undefined) return fail(run, ev, 'Там стена');
      const next = run.map.rooms[id];
      if (next.hidden) return fail(run, ev, 'Там стена');
      if (next.locked) {
        if (run.hero.keys <= 0) return fail(run, ev, 'Нужен ключ');
        run.hero.keys--;
        next.locked = false;
        ev.push({ t: 'message', text: 'Дверь открыта ключом' });
      }
      enterRoom(run, next, action.dir, ev);
      break;
    }
    case 'take': {
      if (inCombat) return fail(run, ev, 'Сначала бой');
      const p = room.pickups.find((x) => x.id === action.pickup);
      if (!p) return fail(run, ev, 'Нечего брать');
      if (!collect(run, p, ev, true)) return fail(run, ev, p.kind === 'lockedChest' ? 'Нужен ключ' : 'Сердца полны');
      room.pickups = room.pickups.filter((x) => x.id !== p.id);
      break;
    }
    case 'pedestal': {
      if (inCombat) return fail(run, ev, 'Сначала бой');
      const p = room.pedestals.find((x) => x.id === action.id && !x.taken);
      if (!p) return fail(run, ev, 'Нечего брать');
      if (p.hearts) {
        if (run.hero.hearts <= p.hearts) return fail(run, ev, 'Не хватает сердец');
        run.hero.hearts -= p.hearts;
        run.hero.hp = Math.min(run.hero.hp, run.hero.hearts * 2);
        p.taken = true;
        // Taking one deal closes the others.
        for (const other of room.pedestals) if (other.hearts) other.taken = true;
        gainItem(run, p.item, 'deal', ev);
      } else {
        p.taken = true;
        gainItem(run, p.item, 'pedestal', ev);
      }
      room.pedestals = room.pedestals.filter((x) => !x.taken || x.id === p.id);
      room.pedestals = room.pedestals.filter((x) => !x.taken);
      break;
    }
    case 'buy': {
      if (room.kind !== 'shop') return fail(run, ev, 'Здесь не магазин');
      const slot = room.shop.find((s) => s.id === action.id && !s.sold);
      if (!slot) return fail(run, ev, 'Продано');
      if (run.hero.coins < slot.price) return fail(run, ev, 'Не хватает монет');
      if (slot.kind === 'item') {
        run.hero.coins -= slot.price;
        slot.sold = true;
        gainItem(run, slot.item!, 'shop', ev);
      } else {
        const p: Pickup = { id: nextId(run), kind: slot.kind };
        if (!collect(run, p, ev, true)) return fail(run, ev, 'Сердца полны');
        run.hero.coins -= slot.price;
        slot.sold = true;
      }
      break;
    }
    case 'bombWall': {
      if (inCombat) return fail(run, ev, 'Сначала бой');
      if (run.hero.bombs <= 0) return fail(run, ev, 'Нет бомб');
      run.hero.bombs--;
      run.stats.bombsUsed++;
      const secret = secretAt(run.map, room, action.dir);
      if (secret) {
        secret.hidden = false;
        secret.seen = true;
        room.doors[action.dir] = secret.id;
        secret.doors[OPPOSITE[action.dir]] = room.id;
        ev.push({ t: 'secret', room: secret.id });
      } else ev.push({ t: 'message', text: 'Только стена' });
      break;
    }
    case 'descend': {
      if (inCombat || room.kind !== 'boss' || !room.trapdoor) return fail(run, ev, 'Некуда спускаться');
      enterFloor(run, run.floor + 1, ev);
      break;
    }
  }
  // Post-action bookkeeping.
  const phase = (): RunState['phase'] => run.phase;
  if (run.combat && phase() === 'combat' && !alive(run.combat).length) clearRoom(run, ev);
  if (phase() === 'dead') ev.push({ t: 'dead', cause: run.stats.deathCause });
  return { run, events: ev };
}

function fail(run: RunState, ev: GameEvent[], reason: string) {
  ev.push({ t: 'invalid', reason });
  return { run, events: ev };
}

export function doorDirs(run: RunState): Dir[] {
  const room = currentRoom(run);
  return DIRS.filter((d) => {
    const id = room.doors[d];
    return id !== undefined && !run.map.rooms[id].hidden;
  });
}

export function enemyName(id: string) {
  return ENEMIES[id]?.name ?? id;
}

export function floorName(run: RunState) {
  return FLOORS[run.floor].name;
}

export function saveRun(run: RunState): string {
  return JSON.stringify({ rules: RULES, run });
}

export function loadRun(raw: string): RunState | null {
  try {
    const data = JSON.parse(raw);
    if (data?.rules !== RULES || data.run?.v !== 1) return null;
    return data.run as RunState;
  } catch {
    return null;
  }
}

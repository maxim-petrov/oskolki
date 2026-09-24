import { derive, int, pick, range, rng, shuffle, weighted } from './rng.ts';
import { alive, activeCost, playerActive, playerMove, playerPocket, setTarget, startCombat } from './combat.ts';
import { ACTS, CHARACTERS } from './content/acts.ts';
import { CARDS, RARITY_PRICE, STARTER_DECKS, rewardPool, type Rarity } from './content/cards.ts';
import { ENEMIES } from './content/enemies.ts';
import { EVENTS, EVENT_BY_ID, type EventApi } from './content/events.ts';
import { ITEMS, POCKETS, RELIC_PRICE, computeMods, relicPool, type Mods } from './content/items.ts';
import { generateActMap, reachable } from './actmap.ts';
import type {
  Action,
  CharId,
  Combat,
  DeckCard,
  Fam,
  Finish,
  GameEvent,
  MapNode,
  PickState,
  RewardOption,
  RunState,
} from './types.ts';

export const RULES = 'office-3';
/** A deck never gets thinner than this. */
export const MIN_DECK = 5;

export function modsOf(run: RunState): Mods {
  return computeMods(run.hero.relics);
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function currentNode(run: RunState): MapNode | null {
  return run.node >= 0 ? run.map.nodes[run.node] : null;
}

export interface NewRunOptions {
  seed: number;
  char?: CharId;
  /** Meta unlocks: cards, items and characters opened with shards. */
  unlocked?: string[];
  /** 0-based index of the final act (2 = three acts, 3 = with the Directorate). */
  lastAct?: number;
  customSeed?: boolean;
  /** Start with the intro fight against the paper stack. */
  intro?: boolean;
  /** Consumables bought on the board of requests. */
  pockets?: string[];
}

export function newRun(opts: NewRunOptions): { run: RunState; events: GameEvent[] } {
  const seed = opts.seed >>> 0;
  const ch = CHARACTERS[opts.char ?? 'intern'];
  const unlocked = opts.unlocked ?? [];
  let uid = 1;
  const deck: DeckCard[] = STARTER_DECKS[ch.id].map((id) => ({ uid: uid++, id, up: false }));
  const run: RunState = {
    v: 3,
    seed,
    customSeed: !!opts.customSeed,
    act: 0,
    lastAct: opts.lastAct ?? 2,
    rng: {
      board: rng(derive(seed, 'board')),
      loot: rng(derive(seed, 'loot')),
      map: rng(derive(seed, 'map')),
      ai: rng(derive(seed, 'ai')),
      fx: rng(derive(seed, 'fx')),
    },
    hero: {
      char: ch.id,
      hp: ch.maxHp,
      maxHp: ch.maxHp,
      armor: 0,
      ward: 0,
      reflect: 0,
      charge: 0,
      coins: ch.coins,
      active: ch.active,
      relics: [ch.relic],
      pockets: [],
      deck,
      flashUsed: false,
    },
    map: { nodes: [], rows: 0, cols: 0, boss: 0 },
    node: -1,
    phase: 'map',
    combat: null,
    rewards: [],
    shop: null,
    event: null,
    pick: null,
    bossRelics: [],
    relicPool: relicPool(unlocked, [ch.relic]),
    cardPool: rewardPool(unlocked),
    seenEvents: [],
    treasure: null,
    fightsInAct: 0,
    lastEncounter: '',
    removals: 0,
    eventRelic: null,
    stats: {
      moves: 0,
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
      coinsEarned: 0,
      maxCombo: 0,
      maxMult: 0,
      maxHit: 0,
      maxRocketsInMove: 0,
      fights: 0,
      elites: 0,
      floors: 0,
      bossesNoHit: 0,
      cardsTaken: 0,
      relicsTaken: 0,
      deathCause: '',
      bossesKilled: [],
      shards: 0,
    },
    nextId: 1,
    flags: {},
  };
  run.hero.pockets = Array(modsOf(run).pockets).fill(null);
  for (const p of [...ch.pockets, ...(opts.pockets ?? [])]) givePocket(run, p);
  const events: GameEvent[] = [];
  enterAct(run, 0, events);
  if (opts.intro) {
    run.flags.intro = true;
    beginCombat(run, 'intro', ['kipa'], events);
  }
  return { run, events };
}

function enterAct(run: RunState, act: number, ev: GameEvent[]) {
  run.act = act;
  run.map = generateActMap(run.rng.map, ACTS[act].looks);
  run.node = -1;
  run.phase = 'map';
  run.fightsInAct = 0;
  run.lastEncounter = '';
  run.hero.flashUsed = false;
  ev.push({ t: 'act', act });
}

// ── Deck, relics, pockets ────────────────────────────────────────────

function nextUid(run: RunState) {
  return Math.max(0, ...run.hero.deck.map((c) => c.uid)) + 1;
}

export function cardName(id: string) {
  return CARDS[id]?.name ?? id;
}

export function addCard(run: RunState, id: string, up: boolean, source: string, ev: GameEvent[], finish?: Finish) {
  run.hero.deck.push({ uid: nextUid(run), id, up, ...(finish ? { finish } : {}) });
  if (CARDS[id]?.rarity !== 'status') run.stats.cardsTaken++;
  ev.push({ t: 'card', card: id, source });
}

const CARD_ODDS: Record<'fight' | 'elite' | 'boss' | 'shop' | 'intro', [Rarity, number][]> = {
  intro: [['common', 1]],
  fight: [
    ['common', 62],
    ['uncommon', 32],
    ['rare', 6],
  ],
  elite: [
    ['common', 40],
    ['uncommon', 45],
    ['rare', 15],
  ],
  boss: [
    ['uncommon', 30],
    ['rare', 70],
  ],
  shop: [
    ['common', 50],
    ['uncommon', 37],
    ['rare', 13],
  ],
};

/** Distinct cards for a reward or the till. */
export function rollCards(run: RunState, n: number, kind: keyof typeof CARD_ODDS, fam?: Fam): { id: string; up: boolean }[] {
  const out: { id: string; up: boolean }[] = [];
  const upChance = [0, 0.12, 0.25, 0.3][Math.min(run.act, 3)];
  for (let k = 0; k < n; k++) {
    const rarity = weighted(run.rng.loot, CARD_ODDS[kind]);
    const taken = new Set(out.map((c) => c.id));
    const fits = (id: string) => !taken.has(id) && (!fam || CARDS[id].fam === fam);
    let pool = run.cardPool.filter((id) => CARDS[id].rarity === rarity && fits(id));
    if (!pool.length) pool = run.cardPool.filter(fits);
    if (!pool.length) break;
    const id = pick(run.rng.loot, pool);
    out.push({ id, up: kind !== 'shop' && int(run.rng.loot, 1000) < upChance * 1000 });
  }
  return out;
}

export function relicName(id: string) {
  return ITEMS[id]?.name ?? id;
}

const RELIC_ODDS: [('common' | 'uncommon' | 'rare'), number][] = [
  ['common', 50],
  ['uncommon', 33],
  ['rare', 17],
];

/** A relic from the pool (removed from it); null when nothing is left. */
export function rollRelic(run: RunState, tier?: 'common' | 'uncommon' | 'rare' | 'boss'): string | null {
  const want = tier ?? weighted(run.rng.loot, RELIC_ODDS);
  let pool = run.relicPool.filter((id) => ITEMS[id].pool === want);
  if (!pool.length && want !== 'boss') pool = run.relicPool.filter((id) => ITEMS[id].pool !== 'boss');
  if (!pool.length) return null;
  const id = pick(run.rng.loot, pool);
  run.relicPool = run.relicPool.filter((x) => x !== id);
  return id;
}

/** Active skills the player could swap to. */
function activePool(run: RunState): string[] {
  return Object.values(ITEMS)
    .filter((d) => d.kind === 'active' && d.id !== run.hero.active)
    .map((d) => d.id);
}

export function gainRelic(run: RunState, id: string, source: string, ev: GameEvent[]) {
  const def = ITEMS[id];
  const hero = run.hero;
  if (def.kind === 'active') {
    hero.active = id;
    hero.charge = Math.min(hero.charge, def.charge ?? 0);
  } else {
    hero.relics.push(id);
    if (def.maxHp) {
      hero.maxHp += def.maxHp;
      ev.push({ t: 'maxHp', amount: def.maxHp });
    }
    if (def.heal) heal(run, def.heal, ev);
    if (def.coins) hero.coins = Math.min(999, hero.coins + def.coins);
    const slots = modsOf(run).pockets;
    while (hero.pockets.length < slots) hero.pockets.push(null);
  }
  run.relicPool = run.relicPool.filter((x) => x !== id);
  run.stats.relicsTaken++;
  ev.push({ t: 'relic', relic: id, source });
}

function givePocket(run: RunState, id: string): boolean {
  const slot = run.hero.pockets.indexOf(null);
  if (slot < 0) return false;
  run.hero.pockets[slot] = id;
  return true;
}

function rollPocket(run: RunState): string {
  return pick(run.rng.loot, Object.keys(POCKETS));
}

function heal(run: RunState, amount: number, ev: GameEvent[]) {
  const before = run.hero.hp;
  run.hero.hp = Math.min(run.hero.maxHp, run.hero.hp + Math.max(0, Math.round(amount)));
  const got = run.hero.hp - before;
  if (got > 0) ev.push({ t: 'heal', amount: got });
  return got;
}

function gainShards(run: RunState, n: number, ev: GameEvent[]) {
  if (n <= 0) return;
  run.stats.shards += n;
  ev.push({ t: 'shards', amount: n });
}

// ── Nodes ────────────────────────────────────────────────────────────

function encounter(run: RunState, kind: 'fight' | 'elite' | 'boss'): string[] {
  const act = ACTS[run.act];
  if (kind === 'boss') return [act.boss];
  const list = kind === 'elite' ? act.elites : run.fightsInAct < 2 ? act.weak : act.strong;
  let options = list.filter((e) => e.join('+') !== run.lastEncounter);
  if (!options.length) options = list;
  const chosen = pick(run.rng.map, options);
  run.lastEncounter = chosen.join('+');
  return [...chosen];
}

function beginCombat(run: RunState, kind: Combat['kind'], enemies: string[], ev: GameEvent[]) {
  run.combat = startCombat(run, kind, enemies, modsOf(run), ev);
  run.phase = 'combat';
  if (kind === 'fight') run.fightsInAct++;
}

function enterNode(run: RunState, node: MapNode, ev: GameEvent[]) {
  run.node = node.id;
  node.visited = true;
  run.stats.floors++;
  if (run.stats.floors % 3 === 0) gainShards(run, 1, ev);
  ev.push({ t: 'enterNode', node: node.id, kind: node.kind });
  run.rewards = [];
  run.shop = null;
  run.event = null;
  run.treasure = null;
  switch (node.kind) {
    case 'fight':
    case 'elite':
    case 'boss':
      beginCombat(run, node.kind, encounter(run, node.kind), ev);
      break;
    case 'rest':
      run.phase = 'rest';
      break;
    case 'shop':
      openShop(run);
      run.phase = 'shop';
      break;
    case 'treasure': {
      const relic = rollRelic(run) ?? 'sandwich';
      run.treasure = { relic, coins: range(run.rng.loot, 15, 30), opened: false };
      run.phase = 'treasure';
      break;
    }
    case 'event': {
      const fresh = EVENTS.filter((e) => !run.seenEvents.includes(e.id));
      if (!fresh.length) {
        beginCombat(run, 'fight', encounter(run, 'fight'), ev);
        break;
      }
      const def = pick(run.rng.map, fresh);
      run.seenEvents.push(def.id);
      run.event = { id: def.id };
      run.phase = 'event';
      break;
    }
  }
}

const FINISH_PRICE: Record<Finish, number> = { sharp: 60, gild: 55, seal: 70, copy: 110, laminate: 40 };

function openShop(run: RunState) {
  const vary = (p: number) => Math.round(p * (0.9 + int(run.rng.loot, 21) / 100));
  const cards = rollCards(run, 5, 'shop').map((c) => ({ id: c.id, up: false, price: vary(RARITY_PRICE[CARDS[c.id].rarity]), sold: false }));
  if (cards.length) {
    const sale = int(run.rng.loot, cards.length);
    cards[sale].price = Math.round(cards[sale].price / 2);
  }
  const relics: { id: string; price: number; sold: boolean }[] = [];
  for (let k = 0; k < 2; k++) {
    const id = rollRelic(run);
    if (id) relics.push({ id, price: vary(RELIC_PRICE[ITEMS[id].pool]), sold: false });
  }
  const actives = activePool(run);
  if (actives.length) {
    const id = pick(run.rng.loot, actives);
    relics.push({ id, price: vary(RELIC_PRICE.shop), sold: false });
  }
  const pockets = shuffle(run.rng.loot, Object.keys(POCKETS))
    .slice(0, 3)
    .map((id) => ({ id, price: vary(POCKETS[id].price), sold: false }));
  const finishes: Finish[] = ['sharp', 'gild', 'seal', 'laminate', 'copy'];
  const kind = weighted(run.rng.loot, finishes.map((f) => [f, f === 'copy' ? 1 : 3] as const));
  run.shop = {
    cards,
    relics,
    pockets,
    finish: { kind, price: vary(FINISH_PRICE[kind]), sold: false },
    removePrice: 50 + 25 * run.removals,
    removed: false,
  };
}

// ── Combat end ──────────────────────────────────────────────────────

function winCombat(run: RunState, ev: GameEvent[]) {
  const c = run.combat!;
  const mods = modsOf(run);
  const hero = run.hero;
  ev.push({ t: 'combatWon', kind: c.kind });
  hero.armor = 0;
  hero.ward = 0;
  hero.reflect = 0;
  const node = currentNode(run);
  const kind = c.kind;
  if (kind === 'fight') run.stats.fights++;
  if (kind === 'elite') run.stats.elites++;
  if (kind === 'boss') {
    const boss = c.enemies[0]?.def ?? '';
    run.stats.bossesKilled.push(boss);
    if (c.damageTaken === 0) run.stats.bossesNoHit++;
  }
  heal(run, mods.healAfterFight + (c.damageTaken === 0 ? mods.healNoHit : 0), ev);
  if (kind === 'elite') gainShards(run, 1, ev);
  if (kind === 'boss') gainShards(run, 3, ev);
  run.combat = null;
  if (kind === 'boss' && run.act >= run.lastAct) {
    run.phase = 'won';
    ev.push({ t: 'won' });
    return;
  }
  // Rewards.
  const rewards: RewardOption[] = [];
  const coinRange: Record<Combat['kind'], [number, number]> = { intro: [8, 8], fight: [10, 18], elite: [25, 35], boss: [60, 75] };
  const [lo, hi] = coinRange[kind];
  rewards.push({ kind: 'coins', amount: range(run.rng.loot, lo, hi) + c.bonusCoins });
  const cards = rollCards(run, 3, kind === 'intro' ? 'intro' : kind);
  if (cards.length) rewards.push({ kind: 'card', cards: cards.map((x) => x.id), ups: cards.map((x) => x.up) });
  if (kind === 'elite') {
    const r = rollRelic(run);
    if (r) rewards.push({ kind: 'relic', relic: r });
  }
  if (run.eventRelic) {
    rewards.push({ kind: 'relic', relic: run.eventRelic });
    run.eventRelic = null;
  }
  const pocketChance = kind === 'elite' ? 0.45 : kind === 'fight' ? 0.3 : 0;
  if (pocketChance && int(run.rng.loot, 100) < pocketChance * 100) rewards.push({ kind: 'pocket', pocket: rollPocket(run) });
  run.rewards = rewards;
  run.phase = 'reward';
  void node;
}

function afterReward(run: RunState, ev: GameEvent[]) {
  run.rewards = [];
  const node = currentNode(run);
  if (node?.kind === 'boss') {
    run.bossRelics = [];
    for (let k = 0; k < 3; k++) {
      const id = rollRelic(run, 'boss');
      if (id) run.bossRelics.push(id);
    }
    run.phase = run.bossRelics.length ? 'bossReward' : 'map';
    if (!run.bossRelics.length) nextAct(run, ev);
    return;
  }
  run.phase = 'map';
}

function nextAct(run: RunState, ev: GameEvent[]) {
  // Between acts the hero recovers most of the missing health.
  heal(run, Math.round((run.hero.maxHp - run.hero.hp) * 0.75), ev);
  run.bossRelics = [];
  enterAct(run, run.act + 1, ev);
}

// ── Picks (remove / upgrade / finish / transform / copy) ─────────────

export function pickable(run: RunState, p: PickState, card: DeckCard): boolean {
  const def = CARDS[card.id];
  if (!def) return false;
  switch (p.purpose) {
    case 'remove':
      return run.hero.deck.length > MIN_DECK;
    case 'upgrade':
      return !card.up && def.rarity !== 'status' && def.v !== def.vUp;
    case 'finish':
      return def.rarity !== 'status' && card.finish !== p.finish;
    case 'copy':
      return def.rarity !== 'status';
    case 'transform':
      return true;
  }
}

function startPick(run: RunState, pick: PickState) {
  run.pick = pick;
  run.phase = 'pick';
}

function endPick(run: RunState) {
  const from = run.pick?.from ?? 'map';
  run.pick = null;
  run.phase = from === 'rest' ? 'map' : from;
}

function applyPick(run: RunState, card: DeckCard, ev: GameEvent[]) {
  const p = run.pick!;
  const hero = run.hero;
  switch (p.purpose) {
    case 'remove':
      hero.deck = hero.deck.filter((c) => c.uid !== card.uid);
      ev.push({ t: 'cardRemoved', card: card.id });
      break;
    case 'upgrade':
      card.up = true;
      ev.push({ t: 'cardUpgraded', card: card.id });
      break;
    case 'finish':
      card.finish = p.finish;
      ev.push({ t: 'cardFinished', card: card.id, finish: p.finish! });
      break;
    case 'copy':
      addCard(run, card.id, card.up, 'copy', ev, card.finish);
      break;
    case 'transform': {
      const def = CARDS[card.id];
      const rarity: Rarity = def.rarity === 'starter' || def.rarity === 'status' ? 'common' : def.rarity;
      let pool = run.cardPool.filter((id) => id !== card.id && CARDS[id].rarity === rarity);
      if (!pool.length) pool = run.cardPool.filter((id) => id !== card.id);
      const id = pick(run.rng.loot, pool);
      ev.push({ t: 'cardRemoved', card: card.id });
      card.id = id;
      ev.push({ t: 'card', card: id, source: 'transform' });
      break;
    }
  }
}

// ── Events ───────────────────────────────────────────────────────────

function eventApi(run: RunState, ev: GameEvent[]): EventApi {
  return {
    run,
    roll: () => int(run.rng.loot, 10000) / 10000,
    coins: (n) => {
      run.hero.coins = Math.max(0, Math.min(999, run.hero.coins + n));
      ev.push({ t: 'coins', amount: n });
    },
    heal: (n) => void heal(run, n, ev),
    hurt: (n) => {
      const red = Math.min(n, run.hero.hp - 1);
      run.hero.hp -= red;
      run.stats.damageTaken += red;
      ev.push({ t: 'hurt', amount: red, cause: 'event' });
    },
    maxHp: (n) => {
      run.hero.maxHp += n;
      run.hero.hp = Math.min(run.hero.maxHp, run.hero.hp + Math.max(0, n));
      ev.push({ t: 'maxHp', amount: n });
    },
    card: (id, up = false) => {
      addCard(run, id, up, 'event', ev);
      return cardName(id);
    },
    randomCard: (rarity, fam) => {
      const pool = run.cardPool.filter((id) => (!rarity || CARDS[id].rarity === rarity) && (!fam || CARDS[id].fam === fam));
      const id = pick(run.rng.loot, pool.length ? pool : run.cardPool);
      addCard(run, id, false, 'event', ev);
      return cardName(id);
    },
    curse: () => addCard(run, 'redtape', false, 'curse', ev),
    relic: (tier) => {
      const id = rollRelic(run, tier);
      if (!id) return null;
      gainRelic(run, id, 'event', ev);
      return relicName(id);
    },
    pocket: () => {
      const id = rollPocket(run);
      if (!givePocket(run, id)) return null;
      ev.push({ t: 'pocket', pocket: id });
      return POCKETS[id].name;
    },
    shards: (n) => gainShards(run, n, ev),
    pick: (purpose, count, finish) => startPick(run, { purpose, count, from: 'event', ...(finish ? { finish } : {}) }),
    upgradeRandom: (n) => {
      const list = shuffle(run.rng.loot, run.hero.deck.filter((c) => !c.up && CARDS[c.id].rarity !== 'status'));
      return list.slice(0, n).map((c) => {
        c.up = true;
        ev.push({ t: 'cardUpgraded', card: c.id });
        return cardName(c.id);
      });
    },
    finishRandom: (finish, n) => {
      const list = shuffle(run.rng.loot, run.hero.deck.filter((c) => c.finish !== finish && CARDS[c.id].rarity !== 'status'));
      return list.slice(0, n).map((c) => {
        c.finish = finish;
        ev.push({ t: 'cardFinished', card: c.id, finish });
        return cardName(c.id);
      });
    },
    eliteFight: () => {
      run.eventRelic = rollRelic(run);
      beginCombat(run, 'elite', encounter(run, 'elite'), ev);
    },
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────

function fail(run: RunState, ev: GameEvent[], reason: string) {
  ev.push({ t: 'invalid', reason });
  return { run, events: ev };
}

export function dispatch(state: RunState, action: Action): { run: RunState; events: GameEvent[] } {
  const run = clone(state);
  const ev: GameEvent[] = [];
  if (run.phase === 'dead' || run.phase === 'won') return fail(run, ev, 'Смена окончена');
  const mods = modsOf(run);
  const inCombat = run.phase === 'combat' && !!run.combat;
  const hero = run.hero;
  switch (action.type) {
    case 'move':
      if (!inCombat) return fail(run, ev, 'Не в бою');
      playerMove(run, mods, action.move, ev);
      break;
    case 'target':
      if (!inCombat) return fail(run, ev, 'Не в бою');
      setTarget(run, action.uid, ev);
      return { run, events: ev };
    case 'active':
      if (!inCombat) return fail(run, ev, 'Только в бою');
      playerActive(run, mods, action, ev);
      break;
    case 'pocket':
      if (!playerPocket(run, mods, action.slot, action.cell, ev)) return { run, events: ev };
      break;
    case 'discardPocket':
      if (!hero.pockets[action.slot]) return fail(run, ev, 'Карман пуст');
      hero.pockets[action.slot] = null;
      break;
    case 'travel': {
      if (run.phase !== 'map') return fail(run, ev, 'Сначала закончи здесь');
      if (!reachable(run.map, run.node).includes(action.node)) return fail(run, ev, 'Туда не пройти');
      enterNode(run, run.map.nodes[action.node], ev);
      break;
    }
    case 'reward': {
      if (run.phase !== 'reward') return fail(run, ev, 'Наград нет');
      const r = run.rewards[action.index];
      if (!r || r.taken) return fail(run, ev, 'Уже взято');
      if (r.kind === 'coins') {
        hero.coins = Math.min(999, hero.coins + (r.amount ?? 0));
        run.stats.coinsEarned += r.amount ?? 0;
        ev.push({ t: 'coins', amount: r.amount ?? 0 });
      } else if (r.kind === 'card') {
        const k = action.card ?? -1;
        const id = r.cards?.[k];
        if (!id) return fail(run, ev, 'Выбери фишку');
        addCard(run, id, !!r.ups?.[k], 'reward', ev);
      } else if (r.kind === 'relic' && r.relic) gainRelic(run, r.relic, 'reward', ev);
      else if (r.kind === 'pocket' && r.pocket) {
        if (!givePocket(run, r.pocket)) return fail(run, ev, 'Карманы полны');
        ev.push({ t: 'pocket', pocket: r.pocket });
      }
      r.taken = true;
      break;
    }
    case 'buy': {
      const shop = run.shop;
      if (run.phase !== 'shop' || !shop) return fail(run, ev, 'Здесь не касса');
      if (action.kind === 'finish') {
        const f = shop.finish;
        if (!f || f.sold) return fail(run, ev, 'Продано');
        if (hero.coins < f.price) return fail(run, ev, 'Не хватает монет');
        startPick(run, { purpose: 'finish', finish: f.kind, count: 1, from: 'shop', cost: f.price });
        break;
      }
      const list = action.kind === 'card' ? shop.cards : action.kind === 'relic' ? shop.relics : shop.pockets;
      const slot = list[action.index];
      if (!slot || slot.sold) return fail(run, ev, 'Продано');
      if (hero.coins < slot.price) return fail(run, ev, 'Не хватает монет');
      if (action.kind === 'pocket') {
        if (!givePocket(run, slot.id)) return fail(run, ev, 'Карманы полны');
        ev.push({ t: 'pocket', pocket: slot.id });
      } else if (action.kind === 'card') addCard(run, slot.id, false, 'shop', ev);
      else gainRelic(run, slot.id, 'shop', ev);
      hero.coins -= slot.price;
      slot.sold = true;
      break;
    }
    case 'remove': {
      const shop = run.shop;
      if (run.phase !== 'shop' || !shop) return fail(run, ev, 'Здесь не касса');
      if (shop.removed) return fail(run, ev, 'Шредер уже занят');
      if (hero.coins < shop.removePrice) return fail(run, ev, 'Не хватает монет');
      if (hero.deck.length <= MIN_DECK) return fail(run, ev, 'Колода слишком тонкая');
      startPick(run, { purpose: 'remove', count: 1, from: 'shop', cost: shop.removePrice });
      break;
    }
    case 'rest': {
      if (run.phase !== 'rest') return fail(run, ev, 'Здесь не кулер');
      if (action.choice === 'heal') {
        heal(run, Math.round(hero.maxHp * 0.3), ev);
        run.phase = 'map';
      } else {
        const p: PickState = { purpose: 'upgrade', count: 1, from: 'rest' };
        if (!hero.deck.some((c) => pickable(run, p, c))) return fail(run, ev, 'Нечего повышать');
        startPick(run, p);
      }
      break;
    }
    case 'pick': {
      const p = run.pick;
      if (run.phase !== 'pick' || !p) return fail(run, ev, 'Нечего выбирать');
      const card = hero.deck.find((c) => c.uid === action.uid);
      if (!card || !pickable(run, p, card)) return fail(run, ev, 'Эту фишку нельзя');
      if (p.cost) {
        if (hero.coins < p.cost) return fail(run, ev, 'Не хватает монет');
        hero.coins -= p.cost;
        if (p.from === 'shop' && run.shop) {
          if (p.purpose === 'remove') {
            run.shop.removed = true;
            run.removals++;
          } else if (run.shop.finish) run.shop.finish.sold = true;
        }
        p.cost = 0;
      }
      applyPick(run, card, ev);
      p.count--;
      if (p.count <= 0 || !hero.deck.some((c) => pickable(run, p, c))) endPick(run);
      break;
    }
    case 'open': {
      const t = run.treasure;
      if (run.phase !== 'treasure' || !t || t.opened) return fail(run, ev, 'Нечего открывать');
      t.opened = true;
      gainRelic(run, t.relic, 'treasure', ev);
      hero.coins = Math.min(999, hero.coins + t.coins);
      ev.push({ t: 'coins', amount: t.coins });
      break;
    }
    case 'event': {
      const state = run.event;
      const def = state ? EVENT_BY_ID[state.id] : undefined;
      if (run.phase !== 'event' || !state || !def) return fail(run, ev, 'Здесь ничего не происходит');
      if (state.result !== undefined) return fail(run, ev, 'Уже решено');
      const opt = def.options[action.option];
      if (!opt) return fail(run, ev, 'Нет такого выбора');
      const locked = opt.locked?.(run);
      if (locked) return fail(run, ev, locked);
      state.result = opt.run(eventApi(run, ev));
      state.step = action.option;
      break;
    }
    case 'bossRelic': {
      if (run.phase !== 'bossReward') return fail(run, ev, 'Нечего выбирать');
      const id = run.bossRelics[action.index];
      if (!id) return fail(run, ev, 'Нет такого предмета');
      gainRelic(run, id, 'boss', ev);
      nextAct(run, ev);
      break;
    }
    case 'leave': {
      switch (run.phase) {
        case 'reward':
          afterReward(run, ev);
          break;
        case 'shop':
        case 'rest':
        case 'treasure':
          run.phase = 'map';
          break;
        case 'event':
          if (run.event?.result === undefined) return fail(run, ev, 'Сначала выбери');
          run.phase = 'map';
          break;
        case 'pick': {
          const from = run.pick?.from ?? 'map';
          run.pick = null;
          run.phase = from;
          break;
        }
        case 'bossReward':
          nextAct(run, ev);
          break;
        default:
          return fail(run, ev, 'Отсюда не уйти');
      }
      break;
    }
  }
  const phase = run.phase as RunState['phase'];
  if (phase === 'combat' && run.combat && !alive(run.combat).length) winCombat(run, ev);
  if (phase === 'dead') ev.push({ t: 'dead', cause: run.stats.deathCause });
  return { run, events: ev };
}

// ── Helpers for views and bots ───────────────────────────────────────

export function enemyName(id: string) {
  return ENEMIES[id]?.name ?? id;
}

export function actName(run: RunState) {
  return ACTS[Math.min(run.act, ACTS.length - 1)].name;
}

export function chargeCost(run: RunState) {
  return activeCost(run);
}

export function saveRun(run: RunState): string {
  return JSON.stringify({ rules: RULES, run });
}

export function loadRun(raw: string): RunState | null {
  try {
    const data = JSON.parse(raw);
    if (data?.rules !== RULES || data.run?.v !== 3) return null;
    return data.run as RunState;
  } catch {
    return null;
  }
}

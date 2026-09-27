import { derive, int, pick, range, rng, shuffle, weighted } from './rng.ts';
import { MAX_ENEMIES, alive, armMove, armorCap, bagTokens, energyCap, playerActive, playerMove, playerPocket, setTarget, startCombat, swapCost, unarm } from './combat.ts';
import { ACTS, CHARACTERS } from './content/acts.ts';
import { BASE_GEAR, GEAR, GEAR_PRICE, MAX_GEAR, gearPoolOf } from './content/gear.ts';
import { ENEMIES } from './content/enemies.ts';
import { EVENTS, EVENT_BY_ID, type EventApi } from './content/events.ts';
import { FINDS, FIND_KINDS, FIND_METER } from './content/finds.ts';
import { MAX_COINS, gainCoins, loseCoins, priceScale } from './economy.ts';

export { PRICE_ACT, priceScale } from './economy.ts';
import { ITEMS, POCKETS, RELIC_PRICE, computeMods, relicPool, type Mods, type Pool } from './content/items.ts';
import { generateActMap, reachable } from './actmap.ts';
import { FAMS } from './types.ts';
import type { Action, CharId, Combat, DevOp, Fam, GameEvent, MapNode, PickState, RewardOption, RunState, ShopState } from './types.ts';

export const RULES = 'gear-1';

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
  /** Extra starting coins (the advance). */
  coins?: number;
}

export function newRun(opts: NewRunOptions): { run: RunState; events: GameEvent[] } {
  const seed = opts.seed >>> 0;
  const ch = CHARACTERS[opts.char ?? 'intern'];
  const unlocked = opts.unlocked ?? [];
  // Only the plain items (a hero may bring one of its own): every colour of the board is one item.
  const start = (f: Fam) => ch.gear?.[f] ?? BASE_GEAR[f];
  const run: RunState = {
    v: 4,
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
      coins: Math.min(MAX_COINS, ch.coins + (opts.coins ?? 0)),
      active: ch.active,
      gear: { blade: [start('blade')], shield: [start('shield')], ink: [start('ink')], coin: [start('coin')] },
      equip: { blade: start('blade'), shield: start('shield'), ink: start('ink'), coin: start('coin') },
      ups: [],
      tape: 0,
      keys: 0,
      finds: 0,
      relics: [ch.relic],
      pockets: [],
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
    gearPool: gearPoolOf(unlocked),
    seenEvents: [],
    treasure: null,
    fightsInAct: 0,
    lastEncounter: '',
    shreds: 0,
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
      gearTaken: 0,
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

// ── Gear, relics, pockets ────────────────────────────────────────────

export function gearName(id: string, up = false) {
  return (ITEMS[id]?.name ?? id) + (up ? '+' : '');
}

/** The colour of an item of gear (undefined for anything else). */
export function famOf(id: string): Fam | undefined {
  return ITEMS[id]?.gear?.fam;
}

/** A colour can take one more item. */
export function handRoom(run: RunState, fam: Fam): boolean {
  return (run.hero.gear[fam]?.length ?? 0) < MAX_GEAR;
}

/**
 * A new item goes into its colour's hand and is held at once (outside a fight a swap back is
 * free). A full hand or an item already carried takes nothing.
 */
export function gainGear(run: RunState, id: string, source: string, ev: GameEvent[]): boolean {
  const fam = famOf(id);
  const hero = run.hero;
  if (!fam || hero.gear[fam].includes(id) || !handRoom(run, fam)) return false;
  hero.gear[fam].push(id);
  if (!run.combat) hero.equip[fam] = id;
  run.gearPool = run.gearPool.filter((x) => x !== id);
  run.stats.gearTaken++;
  hero.charge = Math.min(hero.charge, energyCap(run));
  ev.push({ t: 'gearGained', id, source });
  return true;
}

export function upgradeGear(run: RunState, id: string, ev: GameEvent[]): boolean {
  if (!famOf(id) || run.hero.ups.includes(id)) return false;
  run.hero.ups.push(id);
  ev.push({ t: 'gearUpgraded', id });
  return true;
}

/** Gear odds by source: fights mostly offer common items, bosses rare ones. */
const GEAR_ODDS: Record<'fight' | 'elite' | 'boss' | 'shop' | 'intro', [Pool, number][]> = {
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

/**
 * Distinct items for a reward or the till: never one already carried, never a colour whose hand is
 * full (a full hand has nowhere to put it); `fam` asks for one colour.
 */
export function rollGear(run: RunState, n: number, kind: keyof typeof GEAR_ODDS, fam?: Fam): string[] {
  const out: string[] = [];
  const owned = new Set(FAMS.flatMap((f) => run.hero.gear[f]));
  for (let k = 0; k < n; k++) {
    const rarity = weighted(run.rng.loot, GEAR_ODDS[kind]);
    const fits = (id: string) => {
      const f = famOf(id)!;
      return !out.includes(id) && !owned.has(id) && handRoom(run, f) && (!fam || f === fam);
    };
    let pool = run.gearPool.filter((id) => GEAR[id]?.pool === rarity && fits(id));
    if (!pool.length) pool = run.gearPool.filter(fits);
    if (!pool.length) break;
    out.push(pick(run.rng.loot, pool));
  }
  return out;
}

/** Gear the hero could still upgrade (the held items first). */
export function upgradable(run: RunState, fam?: Fam): string[] {
  const hero = run.hero;
  return FAMS.filter((f) => !fam || f === fam)
    .flatMap((f) => [hero.equip[f], ...hero.gear[f].filter((id) => id !== hero.equip[f])])
    .filter((id) => !hero.ups.includes(id));
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

/** A tier above: what a key finds on the safe's upper shelf. */
const TIER_UP: Record<'common' | 'uncommon' | 'rare', 'uncommon' | 'rare'> = { common: 'uncommon', uncommon: 'rare', rare: 'rare' };

/** Three items a key shows: relics a tier above the usual roll, a skill among them half the time. */
function keyChoices(run: RunState): string[] {
  const out: string[] = [];
  const skills = activePool(run);
  if (skills.length && int(run.rng.loot, 100) < 50) out.push(pick(run.rng.loot, skills));
  while (out.length < 3) {
    const id = rollRelic(run, TIER_UP[weighted(run.rng.loot, RELIC_ODDS)]);
    if (!id) break;
    out.push(id);
  }
  return out;
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
  if (def.kind === 'gear') {
    gainGear(run, id, source, ev);
    return;
  } else if (def.kind === 'active') {
    hero.active = id;
    hero.charge = Math.min(hero.charge, energyCap(run));
  } else {
    hero.relics.push(id);
    if (def.maxHp) {
      hero.maxHp += def.maxHp;
      ev.push({ t: 'maxHp', amount: def.maxHp });
    }
    if (def.heal) heal(run, def.heal, ev);
    if (def.coins) gainCoins(run, def.coins);
    const slots = modsOf(run).pockets;
    while (hero.pockets.length < slots) hero.pockets.push(null);
    // A cheaper skill: the energy never exceeds the meter.
    hero.charge = Math.min(hero.charge, energyCap(run));
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
      run.treasure = { relic, coins: range(run.rng.loot, 3, 6), opened: false };
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

/** «Мастерская» (one upgrade) and the shredder (one red tape curse out) at the till. */
const UPGRADE_PRICE = 10;
const SHRED_PRICE = 6;

/** Reprinting the till: 4 coins, 4 more each time in the same shop (grows with the act too). */
export function rerollPrice(run: RunState): number {
  return Math.round((4 + 4 * (run.shop?.rerolls ?? 0)) * priceScale(run));
}

/** Gear, items, pockets and the services on offer. */
function stockShop(run: RunState): Pick<ShopState, 'gear' | 'relics' | 'pockets' | 'upgrade'> {
  const scale = priceScale(run);
  const vary = (p: number) => Math.round(p * scale * (0.9 + int(run.rng.loot, 21) / 100));
  const gear = rollGear(run, 3, 'shop').map((id) => ({ id, price: vary(GEAR_PRICE[GEAR[id].pool]), sold: false }));
  if (gear.length) {
    const sale = int(run.rng.loot, gear.length);
    gear[sale].price = Math.round(gear[sale].price / 2);
  }
  const relics: { id: string; price: number; sold: boolean }[] = [];
  for (let k = 0; k < 2; k++) {
    const id = rollRelic(run);
    if (id) relics.push({ id, price: vary(RELIC_PRICE[ITEMS[id].pool]), sold: false });
  }
  // A skill in half the shops: skills are rare, and every one changes how a fight goes.
  const actives = activePool(run);
  if (actives.length && int(run.rng.loot, 100) < 50) {
    const id = pick(run.rng.loot, actives);
    relics.push({ id, price: vary(RELIC_PRICE.shop), sold: false });
  }
  const pockets = shuffle(run.rng.loot, Object.keys(POCKETS))
    .slice(0, 3)
    .map((id) => ({ id, price: vary(POCKETS[id].price), sold: false }));
  const upgrade = upgradable(run).length ? { price: vary(UPGRADE_PRICE), sold: false } : null;
  return { gear, relics, pockets, upgrade };
}

function openShop(run: RunState) {
  const shred = run.hero.tape > 0 ? { price: Math.round((SHRED_PRICE + 3 * run.shreds) * priceScale(run)), used: false } : null;
  run.shop = { ...stockShop(run), shred, rerolls: 0 };
}

// ── Combat end ──────────────────────────────────────────────────────

function winCombat(run: RunState, ev: GameEvent[]) {
  const c = run.combat!;
  unarm(run);
  // A find nobody picked up waits on the next board.
  const left = c.board.cells.find((t) => t.find)?.find;
  if (left) run.hero.findNext = left;
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
  // The desk calendar: every third won fight adds a heart container (up to growHp of them).
  if (mods.growHp) {
    hero.wins = (hero.wins ?? 0) + 1;
    if (hero.wins % 3 === 0 && (hero.grown ?? 0) < mods.growHp) {
      hero.grown = (hero.grown ?? 0) + 1;
      hero.maxHp += 2;
      hero.hp += 2;
      ev.push({ t: 'message', text: 'Календарь: +1 сердце' });
    }
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
  // Things are short (the wallet holds 99): a plain fight pays a few coins half the time and offers
  // a choice of gear now and then; the bosses and the upper management pay more.
  const coinRange: Record<Combat['kind'], [number, number]> = { intro: [2, 2], fight: [3, 5], elite: [5, 8], boss: [10, 15] };
  const [lo, hi] = coinRange[kind];
  const paid = kind !== 'fight' || int(run.rng.loot, 100) < 50;
  const coins = (paid ? range(run.rng.loot, lo, hi) : 0) + c.bonusCoins;
  if (coins > 0) rewards.push({ kind: 'coins', amount: coins });
  const offered = kind !== 'fight' || int(run.rng.loot, 100) < 40;
  if (offered) {
    const gear = rollGear(run, kind === 'fight' || kind === 'intro' ? 2 : 3, kind === 'intro' ? 'intro' : kind);
    // Nowhere to put an item (every hand full): an upgrade instead.
    if (gear.length) rewards.push({ kind: 'gear', gear });
    else if (upgradable(run).length) rewards.push({ kind: 'upgrade' });
  }
  if (kind === 'boss' && upgradable(run).length) rewards.push({ kind: 'upgrade' });
  if (kind === 'elite') {
    const r = rollRelic(run);
    if (r) rewards.push({ kind: 'relic', relic: r });
    // A key to the safe from a quarter of the upper management.
    if (int(run.rng.loot, 100) < 25) rewards.push({ kind: 'key', amount: 1 });
  }
  if (run.eventRelic) {
    rewards.push({ kind: 'relic', relic: run.eventRelic });
    run.eventRelic = null;
  }
  const pocketChance = kind === 'elite' ? 0.3 : kind === 'fight' ? 0.15 : 0;
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
  // Between acts the hero recovers half the missing health (hearts are short).
  heal(run, Math.round((run.hero.maxHp - run.hero.hp) * 0.5), ev);
  run.bossRelics = [];
  enterAct(run, run.act + 1, ev);
}

// ── Picks (upgrade / transform an item of gear) ─────────────────────

export function pickable(run: RunState, p: PickState, id: string): boolean {
  const fam = famOf(id);
  if (!fam || !run.hero.gear[fam].includes(id) || (p.fam && p.fam !== fam)) return false;
  switch (p.purpose) {
    case 'upgrade':
      return !run.hero.ups.includes(id);
    case 'transform':
      // Something else of the colour must be on offer.
      return run.gearPool.some((x) => famOf(x) === fam && !run.hero.gear[fam].includes(x));
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

function applyPick(run: RunState, id: string, ev: GameEvent[]) {
  const p = run.pick!;
  const hero = run.hero;
  switch (p.purpose) {
    case 'upgrade':
      upgradeGear(run, id, ev);
      break;
    case 'transform': {
      // The item is traded for another of its colour (same rarity if there is one), held if it was.
      const fam = famOf(id)!;
      const rarity = GEAR[id]?.pool === 'starter' ? 'common' : GEAR[id]?.pool;
      const fresh = run.gearPool.filter((x) => famOf(x) === fam && !hero.gear[fam].includes(x));
      const same = fresh.filter((x) => GEAR[x]?.pool === rarity);
      const next = pick(run.rng.loot, same.length ? same : fresh);
      hero.gear[fam] = hero.gear[fam].map((x) => (x === id ? next : x));
      if (hero.equip[fam] === id) hero.equip[fam] = next;
      hero.ups = hero.ups.filter((x) => x !== id);
      run.gearPool = run.gearPool.filter((x) => x !== next);
      ev.push({ t: 'gearDropped', id });
      ev.push({ t: 'gearGained', id: next, source: 'transform' });
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
      const d = n >= 0 ? gainCoins(run, n) : -loseCoins(run, -n);
      ev.push({ t: 'coins', amount: d });
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
    gear: (id) => (gainGear(run, id, 'event', ev) ? gearName(id) : null),
    randomGear: (rarity, fam) => {
      const owned = new Set(FAMS.flatMap((f) => run.hero.gear[f]));
      const fits = (id: string) => !owned.has(id) && handRoom(run, famOf(id)!) && (!fam || famOf(id) === fam);
      const pool = run.gearPool.filter((id) => fits(id) && (!rarity || GEAR[id]?.pool === rarity));
      const list = pool.length ? pool : run.gearPool.filter(fits);
      if (!list.length) return null;
      const id = pick(run.rng.loot, list);
      gainGear(run, id, 'event', ev);
      return gearName(id);
    },
    curse: () => {
      run.hero.tape++;
      ev.push({ t: 'tape', amount: 1 });
    },
    uncurse: () => {
      if (run.hero.tape <= 0) return false;
      run.hero.tape--;
      ev.push({ t: 'tape', amount: -1 });
      return true;
    },
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
    pick: (purpose, count, fam) => startPick(run, { purpose, count, from: 'event', ...(fam ? { fam } : {}) }),
    upgradeRandom: (n, fam) =>
      shuffle(run.rng.loot, upgradable(run, fam))
        .slice(0, n)
        .map((id) => {
          upgradeGear(run, id, ev);
          return gearName(id, true);
        }),
    upgradeEquipped: (fam) => {
      const id = run.hero.equip[fam];
      return upgradeGear(run, id, ev) ? gearName(id, true) : null;
    },
    key: (n) => {
      run.hero.keys = Math.max(0, Math.min(9, run.hero.keys + n));
      ev.push({ t: 'keys', amount: n });
    },
    findSoon: () => {
      run.hero.findNext ??= weighted(
        run.rng.loot,
        FIND_KINDS.map((k) => [k, FINDS[k].weight]),
      );
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
    case 'arm':
      if (!inCombat) return fail(run, ev, 'Только в бою');
      if (!armMove(run, action.what, ev)) return { run, events: ev };
      break;
    case 'gear': {
      // Another carried item of its colour in hand: free between fights, energy in a fight; it spends no time.
      const fam = famOf(action.id);
      if (!fam || !hero.gear[fam].includes(action.id)) return fail(run, ev, 'Нет такой вещи');
      if (hero.equip[fam] === action.id) return fail(run, ev, 'Уже в руке');
      if (inCombat) {
        const cost = swapCost(run);
        if (hero.charge < cost) return fail(run, ev, `Нужно ${cost} энергии`);
        hero.charge -= cost;
      }
      hero.equip[fam] = action.id;
      ev.push({ t: 'gear', id: action.id, fam });
      break;
    }
    case 'dropGear': {
      // Putting an item down makes room in its colour; it may turn up again later.
      const fam = famOf(action.id);
      if (inCombat) return fail(run, ev, 'Не в бою');
      if (!fam || !hero.gear[fam].includes(action.id)) return fail(run, ev, 'Нет такой вещи');
      if (hero.gear[fam].length <= 1) return fail(run, ev, 'Без вещи цвета нельзя');
      hero.gear[fam] = hero.gear[fam].filter((x) => x !== action.id);
      hero.ups = hero.ups.filter((x) => x !== action.id);
      if (hero.equip[fam] === action.id) hero.equip[fam] = hero.gear[fam][0];
      if (GEAR[action.id]?.pool !== 'starter' && !run.gearPool.includes(action.id)) run.gearPool.push(action.id);
      hero.charge = Math.min(hero.charge, energyCap(run));
      ev.push({ t: 'gearDropped', id: action.id });
      break;
    }
    case 'pocket':
      if (!playerPocket(run, mods, action.slot, action.cell, ev)) return { run, events: ev };
      break;
    case 'discardPocket':
      if (!hero.pockets[action.slot]) return fail(run, ev, 'Карман пуст');
      hero.pockets[action.slot] = null;
      break;
    case 'travel': {
      if (run.phase !== 'map') return fail(run, ev, 'Сначала закончи здесь');
      if (!run.dev?.anywhere && !reachable(run.map, run.node).includes(action.node)) return fail(run, ev, 'Туда не пройти');
      enterNode(run, run.map.nodes[action.node], ev);
      break;
    }
    case 'reward': {
      if (run.phase !== 'reward') return fail(run, ev, 'Наград нет');
      const r = run.rewards[action.index];
      if (!r || r.taken) return fail(run, ev, 'Уже взято');
      if (r.kind === 'coins') ev.push({ t: 'coins', amount: gainCoins(run, r.amount ?? 0) }); else if (r.kind === 'gear') {
        const id = r.gear?.[action.pick ?? -1];
        if (!id) return fail(run, ev, 'Выбери вещь');
        if (!gainGear(run, id, 'reward', ev)) return fail(run, ev, `Руки заняты: вещей цвета не больше ${MAX_GEAR}`);
      } else if (r.kind === 'upgrade') {
        // The row is taken when the item is chosen: backing out of the choice keeps it.
        if (!upgradable(run).length) return fail(run, ev, 'Улучшать нечего');
        startPick(run, { purpose: 'upgrade', count: 1, from: 'reward', reward: action.index });
        break;
      } else if (r.kind === 'key') {
        hero.keys = Math.min(9, hero.keys + (r.amount ?? 1));
        ev.push({ t: 'keys', amount: r.amount ?? 1 });
      } else if (r.kind === 'shards') gainShards(run, r.amount ?? 1, ev);
      else if (r.kind === 'relic' && r.relic) gainRelic(run, r.relic, 'reward', ev);
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
      if (action.kind === 'upgrade') {
        const u = shop.upgrade;
        if (!u || u.sold) return fail(run, ev, 'Продано');
        if (hero.coins < u.price) return fail(run, ev, 'Не хватает монет');
        if (!upgradable(run).length) return fail(run, ev, 'Улучшать нечего');
        startPick(run, { purpose: 'upgrade', count: 1, from: 'shop', cost: u.price });
        break;
      }
      const list = action.kind === 'gear' ? shop.gear : action.kind === 'relic' ? shop.relics : shop.pockets;
      const slot = list[action.index];
      if (!slot || slot.sold) return fail(run, ev, 'Продано');
      if (hero.coins < slot.price) return fail(run, ev, 'Не хватает монет');
      if (action.kind === 'pocket') {
        if (!givePocket(run, slot.id)) return fail(run, ev, 'Карманы полны');
        ev.push({ t: 'pocket', pocket: slot.id });
      } else if (action.kind === 'gear') {
        if (!gainGear(run, slot.id, 'shop', ev)) return fail(run, ev, `Руки заняты: вещей цвета не больше ${MAX_GEAR}`);
      } else gainRelic(run, slot.id, 'shop', ev);
      hero.coins -= slot.price;
      slot.sold = true;
      break;
    }
    case 'reroll': {
      const shop = run.shop;
      if (run.phase !== 'shop' || !shop) return fail(run, ev, 'Здесь не касса');
      const price = rerollPrice(run);
      if (hero.coins < price) return fail(run, ev, 'Не хватает монет');
      hero.coins -= price;
      // Items not bought go back to the pool: a reprint shows new ones, it does not burn them.
      for (const r of shop.relics) if (!r.sold && ITEMS[r.id]?.kind === 'passive' && !run.relicPool.includes(r.id)) run.relicPool.push(r.id);
      run.shop = { ...shop, ...stockShop(run), rerolls: (shop.rerolls ?? 0) + 1 };
      ev.push({ t: 'coins', amount: -price });
      break;
    }
    case 'remove': {
      const shop = run.shop;
      if (run.phase !== 'shop' || !shop) return fail(run, ev, 'Здесь не касса');
      const s = shop.shred;
      if (!s || s.used) return fail(run, ev, 'Шредер уже занят');
      if (hero.tape <= 0) return fail(run, ev, 'Волокиты нет');
      if (hero.coins < s.price) return fail(run, ev, 'Не хватает монет');
      hero.coins -= s.price;
      hero.tape--;
      s.used = true;
      run.shreds++;
      ev.push({ t: 'tape', amount: -1 });
      break;
    }
    case 'rest': {
      if (run.phase !== 'rest') return fail(run, ev, 'Здесь не кулер');
      if (action.choice === 'heal') {
        heal(run, Math.round(hero.maxHp * 0.3), ev);
        run.phase = 'map';
      } else {
        if (!upgradable(run).length) return fail(run, ev, 'Улучшать нечего');
        startPick(run, { purpose: 'upgrade', count: 1, from: 'rest' });
      }
      break;
    }
    case 'pick': {
      const p = run.pick;
      if (run.phase !== 'pick' || !p) return fail(run, ev, 'Нечего выбирать');
      if (!pickable(run, p, action.id)) return fail(run, ev, 'Эту вещь нельзя');
      if (p.cost) {
        if (hero.coins < p.cost) return fail(run, ev, 'Не хватает монет');
        hero.coins -= p.cost;
        if (p.from === 'shop' && run.shop?.upgrade) run.shop.upgrade.sold = true;
        p.cost = 0;
      }
      applyPick(run, action.id, ev);
      if (p.reward !== undefined && run.rewards[p.reward]) run.rewards[p.reward].taken = true;
      p.count--;
      if (p.count <= 0 || !FAMS.some((f) => hero.gear[f].some((id) => pickable(run, p, id)))) endPick(run);
      break;
    }
    case 'open': {
      const t = run.treasure;
      if (run.phase !== 'treasure' || !t || t.opened) return fail(run, ev, 'Нечего открывать');
      if (action.index !== undefined) {
        // The key's choice: one item, the others go back to the pool.
        const id = t.choices?.[action.index];
        if (!id) return fail(run, ev, 'Выбери предмет');
        for (const x of t.choices!) if (x !== id && ITEMS[x]?.kind === 'passive' && !run.relicPool.includes(x)) run.relicPool.push(x);
        t.opened = true;
        t.relic = id;
        gainRelic(run, id, 'treasure', ev);
        ev.push({ t: 'coins', amount: gainCoins(run, t.coins) });
        break;
      }
      if (action.key) {
        // A key opens the upper shelf: a choice of three a tier above (a skill among them half the time).
        if (t.choices) return fail(run, ev, 'Сейф уже открыт');
        if (hero.keys <= 0) return fail(run, ev, 'Нет ключа');
        hero.keys--;
        ev.push({ t: 'keys', amount: -1 });
        if (ITEMS[t.relic]?.kind === 'passive' && !run.relicPool.includes(t.relic)) run.relicPool.push(t.relic);
        t.choices = keyChoices(run);
        if (!t.choices.length) {
          t.opened = true;
          ev.push({ t: 'coins', amount: gainCoins(run, t.coins) });
        }
        break;
      }
      if (t.choices) return fail(run, ev, 'Выбери предмет');
      t.opened = true;
      gainRelic(run, t.relic, 'treasure', ev);
      ev.push({ t: 'coins', amount: gainCoins(run, t.coins) });
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
    case 'dev':
      if (!run.customSeed) return fail(run, ev, 'Только в тестовом забеге');
      applyDev(run, action.op, ev);
      break;
    case 'leave': {
      switch (run.phase) {
        case 'reward':
          afterReward(run, ev);
          break;
        case 'shop':
        case 'rest':
          run.phase = 'map';
          break;
        case 'treasure': {
          // Items a key showed and nobody took go back to the pool.
          const t = run.treasure;
          if (t?.choices && !t.opened) for (const x of t.choices) if (ITEMS[x]?.kind === 'passive' && !run.relicPool.includes(x)) run.relicPool.push(x);
          run.phase = 'map';
          break;
        }
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

// ── Dev panel (custom runs only) ─────────────────────────────────────

/** Test commands: set up the hero, the build and the place, switch cheats, jump anywhere. */
function applyDev(run: RunState, op: DevOp, ev: GameEvent[]) {
  const hero = run.hero;
  switch (op.op) {
    case 'hero':
      if (op.maxHp !== undefined) hero.maxHp = Math.max(1, Math.round(op.maxHp));
      if (op.hp !== undefined) hero.hp = Math.max(1, Math.min(hero.maxHp, Math.round(op.hp)));
      hero.hp = Math.min(hero.hp, hero.maxHp);
      hero.armor = Math.min(hero.armor, armorCap(run));
      if (op.coins !== undefined) hero.coins = Math.max(0, Math.min(MAX_COINS, Math.round(op.coins)));
      if (op.charge !== undefined) hero.charge = Math.max(0, Math.min(energyCap(run), Math.round(op.charge)));
      if (op.armor !== undefined) hero.armor = Math.max(0, Math.min(armorCap(run), Math.round(op.armor)));
      if (op.keys !== undefined) hero.keys = Math.max(0, Math.min(9, Math.round(op.keys)));
      if (op.finds !== undefined) hero.finds = Math.max(0, Math.min(FIND_METER, Math.round(op.finds)));
      break;
    case 'build': {
      // Gear may come in its own list or among the items (the dev panel picks them there); a colour
      // left out gets the hero's plain item.
      const gearIds = [...(op.gear ?? []), ...(op.relics ?? [])].filter((id, k, all) => famOf(id) && all.indexOf(id) === k);
      if (op.gear || gearIds.length) {
        const start = (f: Fam) => CHARACTERS[hero.char].gear?.[f] ?? BASE_GEAR[f];
        for (const f of FAMS) {
          const list = gearIds.filter((id) => famOf(id) === f).slice(0, MAX_GEAR);
          hero.gear[f] = list.length ? list : [start(f)];
          if (!hero.gear[f].includes(hero.equip[f])) hero.equip[f] = hero.gear[f][0];
        }
      }
      for (const id of op.equip ?? []) {
        const f = famOf(id);
        if (f && hero.gear[f].includes(id)) hero.equip[f] = id;
      }
      if (op.ups) hero.ups = op.ups.filter((id, k, all) => famOf(id) && all.indexOf(id) === k);
      hero.ups = hero.ups.filter((id) => FAMS.some((f) => hero.gear[f].includes(id)));
      if (op.tape !== undefined) hero.tape = Math.max(0, Math.min(9, Math.round(op.tape)));
      if (op.relics) hero.relics = op.relics.filter((id, k, all) => ITEMS[id]?.kind === 'passive' && all.indexOf(id) === k);
      if (op.active !== undefined) hero.active = op.active && ITEMS[op.active]?.kind === 'active' ? op.active : null;
      const slots = modsOf(run).pockets;
      const wanted = op.pockets ?? hero.pockets;
      hero.pockets = Array.from({ length: slots }, (_, k) => {
        const id = wanted[k];
        return id && POCKETS[id] ? id : null;
      });
      hero.charge = run.dev?.ink ? energyCap(run) : Math.min(hero.charge, energyCap(run));
      // A fight in progress draws from the new kit from now on.
      if (run.combat) {
        run.combat.board.source = bagTokens(run);
        run.combat.board.bag = [];
      }
      break;
    }
    case 'set':
      run.dev = { ...run.dev, ...op.dev };
      if (run.dev.ink) hero.charge = energyCap(run);
      break;
    case 'act':
      run.combat = null;
      run.rewards = [];
      run.shop = null;
      run.event = null;
      run.treasure = null;
      run.pick = null;
      enterAct(run, Math.max(0, Math.min(ACTS.length - 1, Math.round(op.act))), ev);
      run.lastAct = Math.max(run.lastAct, run.act);
      break;
    case 'enter': {
      // The place starts right here; the map keeps its current node.
      run.combat = null;
      run.rewards = [];
      run.shop = null;
      run.event = null;
      run.treasure = null;
      run.pick = null;
      switch (op.kind) {
        case 'fight':
        case 'elite':
        case 'boss': {
          const wanted = (op.enemies ?? []).filter((e) => ENEMIES[e]).slice(0, MAX_ENEMIES);
          beginCombat(run, op.kind, wanted.length ? wanted : encounter(run, op.kind), ev);
          break;
        }
        case 'rest':
          run.phase = 'rest';
          break;
        case 'shop':
          openShop(run);
          run.phase = 'shop';
          break;
        case 'treasure':
          run.treasure = { relic: rollRelic(run) ?? 'sandwich', coins: 5, opened: false };
          run.phase = 'treasure';
          break;
        case 'event': {
          const def = (op.event && EVENT_BY_ID[op.event]) || pick(run.rng.map, EVENTS);
          run.event = { id: def.id };
          run.phase = 'event';
          break;
        }
        case 'bossReward':
          run.bossRelics = [];
          for (let k = 0; k < 3; k++) {
            const id = rollRelic(run, 'boss');
            if (id) run.bossRelics.push(id);
          }
          run.phase = run.bossRelics.length ? 'bossReward' : 'map';
          break;
        default:
          run.phase = 'map';
      }
      break;
    }
    case 'travel': {
      const node = run.map.nodes[op.node];
      if (!node) break;
      run.combat = null;
      run.phase = 'map';
      enterNode(run, node, ev);
      break;
    }
    case 'win':
      // dispatch's tail sees no enemies alive and wins the fight.
      if (run.combat) for (const e of run.combat.enemies) e.hp = 0;
      break;
    case 'lose':
      hero.hp = 0;
      run.phase = 'dead';
      run.stats.deathCause = 'Тест: сдался';
      break;
  }
}

// ── Helpers for views and bots ───────────────────────────────────────

export function enemyName(id: string) {
  return ENEMIES[id]?.name ?? id;
}

export function actName(run: RunState) {
  return ACTS[Math.min(run.act, ACTS.length - 1)].name;
}

export function saveRun(run: RunState): string {
  return JSON.stringify({ rules: RULES, run });
}

export function loadRun(raw: string): RunState | null {
  try {
    const data = JSON.parse(raw);
    if (data?.rules !== RULES || data.run?.v !== 4) return null;
    const run = data.run as RunState;
    // Saves from before boards had a size: they were all 6×6.
    if (run.combat && !run.combat.board.w) Object.assign(run.combat.board, { w: 6, h: 6 });
    return run;
  } catch {
    return null;
  }
}

import type { Rng } from './rng.ts';

export const W = 6;
export const H = 6;
export const CELLS = W * H;
/** Upcoming tiles kept above every column. */
export const QUEUE_LEN = 6;
/** Tiles each deck card puts into the bag. */
export const BAG_COPIES = 3;

export type Fam = 'blade' | 'shield' | 'ink' | 'coin';
export const FAMS: readonly Fam[] = ['blade', 'shield', 'ink', 'coin'];
export type TileKind = Fam | 'prism' | 'junk';
export type SpecialKind = 'rocketH' | 'rocketV' | 'bomb';
/** Card finishes (like Balatro enhancements): a mark on one card of the deck. */
export type Finish = 'sharp' | 'gild' | 'seal' | 'copy' | 'laminate';

export interface Tile {
  id: number;
  kind: TileKind;
  /** The deck card this tile was drawn from (absent on prisms made by matches). */
  card?: string;
  up?: boolean;
  finish?: Finish;
  special?: SpecialKind;
  /** Stapled: the tile cannot be moved. */
  pin?: boolean;
  /** Ember fuse in ticks; at zero it burns the hero. */
  fuse?: number;
  /** Censored for this many ticks: the player cannot see the family. */
  hidden?: number;
}

/** One card of the deck. Each card puts BAG_COPIES tiles into the bag. */
export interface DeckCard {
  uid: number;
  id: string;
  up: boolean;
  finish?: Finish;
}

export interface BagToken {
  card: string;
  up: boolean;
  finish?: Finish;
}

export interface BoardState {
  cells: Tile[];
  queue: Tile[][];
  nextId: number;
  /** Number of flooded rows at the bottom; their tiles cannot swap sideways. */
  flood: number;
  /** Ticks left on anchored columns / rows: their tiles cannot be moved. */
  colLock: number[];
  rowLock: number[];
  /** Draw pile of the fight: shuffled deck tokens; refilled when empty. */
  bag: BagToken[];
  /** Deck tokens a refill is built from (the fight's copy of the deck). */
  source: BagToken[];
}

export type Line = 'row' | 'col';
/** An enemy grabbing a whole row (the crab): delta 1..W-1, positive = right. */
export interface LineShift {
  line: Line;
  index: number;
  delta: number;
}

/** The player's move: the tile at `from` swaps places with its neighbour at `to`. */
export interface Move {
  from: number;
  to: number;
}

export interface Group {
  fam: Fam;
  cells: number[];
  size: number;
  longest: number;
  cross: boolean;
  horizontal: boolean;
  make: SpecialKind | 'prism' | null;
  at: number;
}

export type IntentKind =
  | 'attack'
  | 'heavy'
  | 'block'
  | 'heal'
  | 'summon'
  | 'ink'
  | 'pin'
  | 'ember'
  | 'censor'
  | 'stealCharge'
  | 'stealCoins'
  | 'pinch'
  | 'tide'
  | 'submerge'
  | 'shine'
  | 'anchor'
  | 'strike'
  | 'erase'
  | 'tape'
  | 'hurry';

export interface Intent {
  kind: IntentKind;
  /** Damage (hp), block amount, heal amount or tiles affected. */
  value: number;
  timer: number;
  summon?: string;
}

export type Material = 'paper' | 'rubber' | 'ink' | 'metal' | 'glass' | 'wax' | 'flesh' | 'water';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  armor?: number;
  size: 'S' | 'M' | 'L' | 'boss';
  material: Material;
  intents: Intent[];
  /** Boss phases: when hp <= at * maxHp the cycle switches (after the current action). */
  phases?: { at: number; intents: Intent[] }[];
  traits?: ('splits' | 'light' | 'diver')[];
  splitInto?: string;
  coins?: number;
  blurb: string;
}

export interface EnemyState {
  uid: number;
  def: string;
  hp: number;
  maxHp: number;
  block: number;
  armor: number;
  cycle: number;
  countdown: number;
  phase: number;
  bleed: number;
  burn: number;
  burnTurns: number;
  stunned: boolean;
  /** Just shook off a stun: cannot be stunned again until it acts. */
  stunImmune: boolean;
  submerged: boolean;
  shining: boolean;
  hitOnce: boolean;
  /** Act damage multiplier baked in at spawn. */
  dmgMul: number;
  /** Coins stolen by this enemy; returned on death. */
  stolen: number;
}

export type CharId = 'intern' | 'accountant' | 'janitor';

export interface Hero {
  char: CharId;
  hp: number;
  maxHp: number;
  armor: number;
  /** Next enemy blow is weaker by this much (umbrella). */
  ward: number;
  /** Share of the next blow sent back (clipboard), 0..1. */
  reflect: number;
  charge: number;
  coins: number;
  active: string | null;
  relics: string[];
  pockets: (string | null)[];
  deck: DeckCard[];
  flashUsed: boolean;
}

export interface Combat {
  kind: 'fight' | 'elite' | 'boss' | 'intro';
  board: BoardState;
  enemies: EnemyState[];
  target: number;
  moves: number;
  ticks: number;
  freeTicks: number;
  damageTaken: number;
  nextUid: number;
  garland: number;
  /** Energy drink: bonus multiplier for the next move. */
  nextMult: number;
  /** Piggy banks and other end-of-fight payouts collected during the fight. */
  bonusCoins: number;
}

export type NodeKind = 'fight' | 'elite' | 'event' | 'shop' | 'rest' | 'treasure' | 'boss';

export interface MapNode {
  id: number;
  row: number;
  col: number;
  kind: NodeKind;
  next: number[];
  visited: boolean;
  /** Room look for the stage (a location of the act's building). */
  look: number;
}

export interface ActMap {
  nodes: MapNode[];
  rows: number;
  cols: number;
  boss: number;
}

export interface RunStats {
  moves: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  coinsEarned: number;
  maxCombo: number;
  maxMult: number;
  maxHit: number;
  maxRocketsInMove: number;
  fights: number;
  elites: number;
  floors: number;
  bossesNoHit: number;
  cardsTaken: number;
  relicsTaken: number;
  deathCause: string;
  bossesKilled: string[];
  shards: number;
}

export interface RewardOption {
  kind: 'coins' | 'card' | 'relic' | 'pocket' | 'shards';
  amount?: number;
  cards?: string[];
  /** Which of the offered cards come upgraded. */
  ups?: boolean[];
  relic?: string;
  pocket?: string;
  taken?: boolean;
}

export interface ShopState {
  cards: { id: string; up: boolean; price: number; sold: boolean }[];
  relics: { id: string; price: number; sold: boolean }[];
  pockets: { id: string; price: number; sold: boolean }[];
  /** Card finishing service: one card gets the finish. */
  finish: { kind: Finish; price: number; sold: boolean } | null;
  removePrice: number;
  removed: boolean;
}

export interface TreasureState {
  relic: string;
  coins: number;
  opened: boolean;
}

export interface EventState {
  id: string;
  /** Outcome text after a choice, shown before leaving. */
  result?: string;
  /** Extra state some events keep between steps. */
  step?: number;
}

/** A pending choice of a card from the deck (remove / upgrade / finish / transform / copy). */
export interface PickState {
  purpose: 'remove' | 'upgrade' | 'finish' | 'transform' | 'copy';
  finish?: Finish;
  /** Cards still to choose. */
  count: number;
  /** Where the pick came from: completion and cancel return there (a rest is used up). */
  from: 'shop' | 'rest' | 'event' | 'map';
  /** Coins charged when the first card is chosen (shop services). */
  cost?: number;
}

export interface RunState {
  v: 3;
  seed: number;
  customSeed: boolean;
  act: number;
  lastAct: number;
  rng: { board: Rng; loot: Rng; map: Rng; ai: Rng; fx: Rng };
  hero: Hero;
  map: ActMap;
  /** Current map node (-1 before the first step of an act). */
  node: number;
  phase: 'map' | 'combat' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure' | 'bossReward' | 'pick' | 'dead' | 'won';
  combat: Combat | null;
  rewards: RewardOption[];
  shop: ShopState | null;
  event: EventState | null;
  pick: PickState | null;
  bossRelics: string[];
  relicPool: string[];
  cardPool: string[];
  /** Events already seen this run (not repeated). */
  seenEvents: string[];
  treasure: TreasureState | null;
  /** Fights fought in the current act (the first ones are easier). */
  fightsInAct: number;
  lastEncounter: string;
  /** Cards removed at the till this run (each removal costs more). */
  removals: number;
  /** A fight started by an event pays this relic on top. */
  eventRelic: string | null;
  stats: RunStats;
  nextId: number;
  flags: Record<string, boolean>;
}

export type Action =
  | { type: 'move'; move: Move }
  | { type: 'target'; uid: number }
  | { type: 'active'; cell?: number; col?: number; uid?: number }
  | { type: 'pocket'; slot: number; cell?: number }
  | { type: 'discardPocket'; slot: number }
  | { type: 'travel'; node: number }
  | { type: 'reward'; index: number; card?: number }
  | { type: 'buy'; kind: 'card' | 'relic' | 'pocket' | 'finish'; index: number }
  | { type: 'remove' }
  | { type: 'rest'; choice: 'heal' | 'upgrade' }
  | { type: 'event'; option: number }
  | { type: 'pick'; uid: number }
  | { type: 'open' }
  | { type: 'bossRelic'; index: number }
  | { type: 'leave' };

/** Snapshot copied into events so the view can replay without reading engine state. */
export type BoardSnap = Tile[];

export interface Effect {
  kind: 'damage' | 'armor' | 'charge' | 'coins' | 'heal' | 'kill' | 'status' | 'proc';
  amount: number;
  uid?: number;
  from?: number[];
  fam?: Fam | 'prism';
  source?: string;
  status?: 'bleed' | 'burn' | 'stun' | 'freeze';
  blocked?: number;
  text?: string;
}

/** Swap combos: two specials swapped together fire as one bigger blast. */
export type ComboKind = 'cross' | 'bigCross' | 'bigBomb' | 'nova';

export interface Blast {
  kind: SpecialKind | 'prism' | 'bomb-item' | 'active' | ComboKind;
  at: number;
  cells: number[];
}

/** What one tile added to the move's tally (the scoring counter animates these). */
export interface TileScore {
  i: number;
  id: number;
  card?: string;
  fam: Fam | 'prism';
  dmg?: number;
  armor?: number;
  aoe?: number;
  coins?: number;
  charge?: number;
  mult?: number;
  xmult?: number;
  note?: string;
}

/** The move's running score: resources and the multiplier. */
export interface Tally {
  dmg: number;
  armor: number;
  aoe: number;
  mult: number;
  xmult: number;
  coins: number;
  charge: number;
}

export type GameEvent =
  | { t: 'swap'; move: Move; board: BoardSnap }
  | {
      t: 'wave';
      n: number;
      groups: Group[];
      blasts: Blast[];
      cleared: { i: number; id: number; kind: TileKind; cause: 'match' | 'blast' | 'splash' }[];
      created: { at: number; tile: Tile }[];
      scores: TileScore[];
      tally: Tally;
      effects: Effect[];
      falls: { id: number; from: number; to: number }[];
      spawns: { id: number; to: number; rank: number }[];
      board: BoardSnap;
      queue: Tile[][];
      flood: number;
    }
  | {
      t: 'strike';
      tally: Tally;
      /** Final numbers after multipliers and material bonuses. */
      damage: number;
      aoe: number;
      armor: number;
      target: number;
      notes: string[];
    }
  | { t: 'effects'; effects: Effect[] }
  | { t: 'tick'; timers: { uid: number; countdown: number }[] }
  | {
      t: 'enemyAct';
      uid: number;
      intent: Intent;
      cells?: number[];
      hurt?: { amount: number; armor: number; red: number };
      summoned?: EnemyState[];
      healed?: { uid: number; amount: number };
      board?: BoardSnap;
      stolen?: number;
      skipped?: boolean;
      added?: number;
    }
  | { t: 'phase'; uid: number; phase: number }
  | { t: 'ember'; cells: number[]; hurt: { amount: number; armor: number; red: number } }
  | { t: 'board'; reason: 'reshuffle' | 'enemy' | 'active' | 'timers'; board: BoardSnap; queue?: Tile[][] }
  | { t: 'enemyDie'; uid: number; split?: EnemyState[] }
  | { t: 'combatStart'; kind: Combat['kind'] }
  | { t: 'combatWon'; kind: Combat['kind'] }
  | { t: 'act'; act: number }
  | { t: 'enterNode'; node: number; kind: NodeKind }
  | { t: 'relic'; relic: string; source: string }
  | { t: 'card'; card: string; source: string }
  | { t: 'cardRemoved'; card: string }
  | { t: 'cardUpgraded'; card: string }
  | { t: 'cardFinished'; card: string; finish: Finish }
  | { t: 'pocket'; pocket: string }
  | { t: 'pocketUsed'; pocket: string }
  | { t: 'coins'; amount: number }
  | { t: 'heal'; amount: number }
  | { t: 'hurt'; amount: number; cause: string }
  | { t: 'maxHp'; amount: number }
  | { t: 'shards'; amount: number }
  | { t: 'activeUsed'; item: string }
  | { t: 'dead'; cause: string }
  | { t: 'won' }
  | { t: 'invalid'; reason: string }
  | { t: 'message'; text: string };

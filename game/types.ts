import type { Rng } from './rng.ts';

export const W = 6;
export const H = 6;
export const CELLS = W * H;
/** Upcoming tiles kept above every column. */
export const QUEUE_LEN = 6;

export type Fam = 'blade' | 'shield' | 'ink' | 'coin';
export const FAMS: readonly Fam[] = ['blade', 'shield', 'ink', 'coin'];
export type TileKind = Fam | 'prism' | 'junk';
export type SpecialKind = 'rocketH' | 'rocketV' | 'bomb';

export interface Tile {
  id: number;
  kind: TileKind;
  special?: SpecialKind;
  /** Stapled: its row and column cannot be shifted. */
  pin?: boolean;
  /** Ember fuse in ticks; at zero it burns the hero. */
  fuse?: number;
  /** Censored for this many ticks: the player cannot see the family. */
  hidden?: number;
}

export interface BoardState {
  cells: Tile[];
  queue: Tile[][];
  nextId: number;
  /** Number of flooded rows at the bottom; they cannot shift horizontally. */
  flood: number;
  colLock: number[];
  rowLock: number[];
}

export type Line = 'row' | 'col';
/** delta: 1..W-1, positive = right (row) or down (col). */
export interface Move {
  line: Line;
  index: number;
  delta: number;
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
  | 'erase';

export interface Intent {
  kind: IntentKind;
  /** Damage in half-hearts, block amount, heal amount or tiles affected. */
  value: number;
  timer: number;
  summon?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  armor?: number;
  size: 'S' | 'M' | 'L' | 'boss';
  intents: Intent[];
  /** Boss phases: when hp <= at * maxHp the cycle switches (after the current action). */
  phases?: { at: number; intents: Intent[] }[];
  traits?: ('flying' | 'splits' | 'light' | 'diver')[];
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
  pendingPhase: number;
  bleed: number;
  burn: number;
  burnTurns: number;
  stunned: boolean;
  submerged: boolean;
  shining: boolean;
  hitOnce: boolean;
  dmgBonus: number;
  /** Coins stolen by this enemy; returned on death. */
  stolen: number;
}

export type PickupKind =
  | 'coin'
  | 'nickel'
  | 'half'
  | 'heart'
  | 'soul'
  | 'bomb'
  | 'key'
  | 'chest'
  | 'lockedChest';

export interface Pickup {
  id: number;
  kind: PickupKind;
}

export interface Pedestal {
  id: number;
  item: string;
  /** Shop / deal prices. */
  coins?: number;
  hearts?: number;
  taken?: boolean;
}

export interface ShopSlot {
  id: number;
  kind: 'item' | PickupKind;
  item?: string;
  price: number;
  sold?: boolean;
}

export type RoomKind =
  | 'start'
  | 'combat'
  | 'treasure'
  | 'shop'
  | 'boss'
  | 'secret'
  | 'deal'
  | 'challenge';

export type Dir = 'n' | 'e' | 's' | 'w';

export interface Room {
  id: number;
  x: number;
  y: number;
  kind: RoomKind;
  doors: Partial<Record<Dir, number>>;
  visited: boolean;
  seen: boolean;
  cleared: boolean;
  locked: boolean;
  hidden: boolean;
  dist: number;
  enemies: string[];
  pickups: Pickup[];
  pedestals: Pedestal[];
  shop: ShopSlot[];
  variant: number;
  trapdoor: boolean;
}

export interface FloorMap {
  rooms: Room[];
  start: number;
  boss: number;
}

export type CharId = 'intern' | 'accountant' | 'janitor';

export interface Hero {
  char: CharId;
  hearts: number;
  hp: number;
  soul: number;
  armor: number;
  charge: number;
  coins: number;
  bombs: number;
  keys: number;
  baseDamage: number;
  active: string | null;
  items: string[];
  transformations: string[];
  flashUsed: boolean;
}

export interface Combat {
  roomId: number;
  board: BoardState;
  enemies: EnemyState[];
  target: number;
  moves: number;
  ticks: number;
  freeTicks: number;
  damageTaken: number;
  boss: boolean;
  nextUid: number;
  garland: number;
  clock: number;
}

export interface RunStats {
  moves: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  coinsEarned: number;
  bombsUsed: number;
  maxCombo: number;
  maxRocketsInMove: number;
  roomsCleared: number;
  bossesNoHit: number;
  itemsTaken: number;
  cascadeDamage: number;
  matchDamage: number;
  deathCause: string;
  bossesKilled: string[];
}

export interface RunState {
  v: 1;
  seed: number;
  customSeed: boolean;
  floor: number;
  lastFloor: number;
  rng: { board: Rng; loot: Rng; map: Rng; ai: Rng; fx: Rng };
  hero: Hero;
  map: FloorMap;
  room: number;
  phase: 'explore' | 'combat' | 'dead' | 'won';
  combat: Combat | null;
  pool: string[];
  stats: RunStats;
  nextId: number;
  catCooldown: number;
  flags: Record<string, boolean>;
}

export type Action =
  | { type: 'move'; move: Move }
  | { type: 'target'; uid: number }
  | { type: 'active'; cell?: number; col?: number; uid?: number }
  | { type: 'bomb'; cell: number }
  | { type: 'go'; dir: Dir }
  | { type: 'take'; pickup: number }
  | { type: 'pedestal'; id: number }
  | { type: 'buy'; id: number }
  | { type: 'bombWall'; dir: Dir }
  | { type: 'descend' };

/** Snapshot copied into events so the view can replay without reading engine state. */
export type BoardSnap = Tile[];

export interface Effect {
  kind:
    | 'damage'
    | 'armor'
    | 'charge'
    | 'coins'
    | 'heal'
    | 'soul'
    | 'kill'
    | 'status'
    | 'proc';
  amount: number;
  uid?: number;
  from?: number[];
  fam?: Fam | 'prism';
  source?: string;
  status?: 'bleed' | 'burn' | 'stun' | 'freeze';
  blocked?: number;
  text?: string;
}

export interface Blast {
  kind: SpecialKind | 'prism' | 'bomb-item' | 'active';
  at: number;
  cells: number[];
}

export type GameEvent =
  | { t: 'shift'; move: Move; board: BoardSnap }
  | {
      t: 'wave';
      n: number;
      groups: Group[];
      blasts: Blast[];
      cleared: { i: number; id: number; kind: TileKind; cause: 'match' | 'blast' | 'splash' }[];
      created: { at: number; tile: Tile }[];
      effects: Effect[];
      falls: { id: number; from: number; to: number }[];
      spawns: { id: number; to: number; rank: number }[];
      board: BoardSnap;
      queue: Tile[][];
      flood: number;
    }
  | { t: 'effects'; effects: Effect[] }
  | { t: 'tick'; timers: { uid: number; countdown: number }[] }
  | {
      t: 'enemyAct';
      uid: number;
      intent: Intent;
      cells?: number[];
      hurt?: { amount: number; armor: number; soul: number; red: number };
      summoned?: EnemyState[];
      healed?: { uid: number; amount: number };
      board?: BoardSnap;
      stolen?: number;
      skipped?: boolean;
    }
  | { t: 'phase'; uid: number; phase: number }
  | { t: 'ember'; cells: number[]; hurt: { amount: number; armor: number; soul: number; red: number } }
  | { t: 'board'; reason: 'reshuffle' | 'enemy' | 'active' | 'timers'; board: BoardSnap; queue?: Tile[][] }
  | { t: 'enemyDie'; uid: number; split?: EnemyState[] }
  | { t: 'roomClear'; pickups: Pickup[] }
  | { t: 'enterRoom'; room: number; dir: Dir | null }
  | { t: 'combatStart'; room: number; boss: boolean }
  | { t: 'pickup'; pickup: Pickup; amount: number }
  | { t: 'item'; item: string; source: 'pedestal' | 'shop' | 'deal'; transformation?: string }
  | { t: 'activeUsed'; item: string }
  | { t: 'secret'; room: number }
  | { t: 'floor'; floor: number }
  | { t: 'dead'; cause: string }
  | { t: 'won' }
  | { t: 'invalid'; reason: string }
  | { t: 'message'; text: string };

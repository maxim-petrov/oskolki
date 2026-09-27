import type { Rng } from './rng.ts';

export const W = 6;
export const H = 6;
export const CELLS = W * H;
/** Upcoming tiles kept above every column. */
export const QUEUE_LEN = 6;
/** Tiles each point of a colour's weight puts into the bag (a weight of 4 → 12 tiles). */
export const BAG_COPIES = 3;

export type Fam = 'blade' | 'shield' | 'ink' | 'coin';
export const FAMS: readonly Fam[] = ['blade', 'shield', 'ink', 'coin'];
export type TileKind = Fam | 'prism' | 'junk';
export type SpecialKind = 'rocketH' | 'rocketV' | 'bomb';
/** A find on a tile: matching or blasting the tile collects it. */
export type FindKind = 'coins' | 'key' | 'heart' | 'battery' | 'bomb';

/**
 * A board tile: a colour (every tile of a colour is the item held for it), a prism or junk. There
 * are no cards: what a tile does is decided by the hero's gear of its colour.
 */
export interface Tile {
  id: number;
  kind: TileKind;
  special?: SpecialKind;
  /** Stapled: the tile cannot be moved. */
  pin?: boolean;
  /** Ember fuse in ticks; at zero it burns the hero. */
  fuse?: number;
  /** Censored for this many ticks: the player cannot see the family. */
  hidden?: number;
  /** Junk that is red tape («Волокита»): enemies and curses slip it into the bag. */
  tape?: boolean;
  /** The department's stamp: the tile's group works as a super. */
  seal?: boolean;
  /** A find waiting on the tile. */
  find?: FindKind;
}

/** A bag token: a tile of a colour, or red tape. */
export type BagToken = { kind: Fam } | { kind: 'junk'; tape: true };

/** Board size in cells (6×6 by default; items and enemies change it). */
export interface Dims {
  w: number;
  h: number;
}

export interface BoardState extends Dims {
  cells: Tile[];
  queue: Tile[][];
  nextId: number;
  /** Number of flooded rows at the bottom; their tiles cannot swap sideways. */
  flood: number;
  /** Ticks left on anchored columns / rows: their tiles cannot be moved. */
  colLock: number[];
  rowLock: number[];
  /** Draw pile of the fight: shuffled colour tokens; refilled when empty. */
  bag: BagToken[];
  /** Tokens a refill is built from: the colour weights of the fight (and its red tape). */
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
  traits?: ('splits' | 'light' | 'diver' | 'turnstile' | 'cramped')[];
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
  /** Ticks left under water: a dive ends on time even when the enemy's timer is pushed back. */
  dive?: number;
  /** Ticks this enemy has been held back since its last action (see MAX_HOLD). */
  held?: number;
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
  /** Damage per half-heart of the next blow sent back at the attacker (clipboard). */
  reflect: number;
  /** Energy: violet tiles fill it; skills and gear swaps spend it. */
  charge: number;
  coins: number;
  active: string | null;
  /** Gear carried per colour (1..MAX_GEAR) and the item held: every tile of the colour is it. */
  gear: Record<Fam, string[]>;
  equip: Record<Fam, string>;
  /** Upgraded gear («Щит+»). */
  ups: string[];
  /** Red tape curses: each puts BAG_COPIES junk tiles into the bag of every fight. */
  tape: number;
  keys: number;
  /** Finds meter: yellow tiles fill it; a full meter puts a find on the board. */
  finds: number;
  /** A find left on a board when its fight ended: it comes back in the next fight. */
  findNext?: FindKind;
  relics: string[];
  pockets: (string | null)[];
  flashUsed: boolean;
  /** Heart containers the desk calendar has added this run, and fights won since it came. */
  grown?: number;
  wins?: number;
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
  /** Energy drink: damage bonus of the next strike (+1 = +100%). */
  nextBonus: number;
  /** Piggy banks and other end-of-fight payouts collected during the fight. */
  bonusCoins: number;
  /** The guard's vest has taken this fight's first blow. */
  guarded?: boolean;
  /** Damage bonus the abacus has put aside for the next strike that deals damage. */
  bank?: number;
  /** Damage bonus the hot key gives the move after a skill. */
  skillBonus?: number;
  /**
   * What energy has readied for the next move: «Заряд» (every group of its first wave is a super),
   * «Вне очереди» (the enemies do not tick after it), the accountant's double entry (the groups of its
   * first wave score twice).
   */
  armed?: { charge?: boolean; rush?: boolean; double?: boolean };
  /** The move number of the last move made out of turn (never two in a row). */
  lastRush?: number;
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
  /** Coins that did not fit the wallet. */
  coinsLost?: number;
  /** Finds that came onto the board and were picked up. */
  finds?: number;
  findsTaken?: number;
  maxCombo: number;
  maxMult: number;
  maxHit: number;
  maxRocketsInMove: number;
  fights: number;
  elites: number;
  floors: number;
  bossesNoHit: number;
  gearTaken: number;
  relicsTaken: number;
  deathCause: string;
  bossesKilled: string[];
  shards: number;
}

export interface RewardOption {
  kind: 'coins' | 'gear' | 'upgrade' | 'relic' | 'pocket' | 'key' | 'shards';
  amount?: number;
  /** Gear on offer: take one (or none). */
  gear?: string[];
  relic?: string;
  pocket?: string;
  taken?: boolean;
}

export interface ShopState {
  gear: { id: string; price: number; sold: boolean }[];
  relics: { id: string; price: number; sold: boolean }[];
  pockets: { id: string; price: number; sold: boolean }[];
  /** «Мастерская»: one item gets its upgrade. */
  upgrade: { price: number; sold: boolean } | null;
  /** The shredder: one red tape curse out (only offered with a curse). */
  shred: { price: number; used: boolean } | null;
  /** Reprints of the till in this shop (each costs more). */
  rerolls?: number;
}

export interface TreasureState {
  relic: string;
  coins: number;
  opened: boolean;
  /** Opened with a key: a choice of items instead of the one. */
  choices?: string[];
}

export interface EventState {
  id: string;
  /** Outcome text after a choice, shown before leaving. */
  result?: string;
  /** Extra state some events keep between steps. */
  step?: number;
}

/** A pending choice of an item of the hero's gear: upgrade it, or trade it for another of its colour. */
export interface PickState {
  purpose: 'upgrade' | 'transform';
  /** Only gear of this colour. */
  fam?: Fam;
  /** Items still to choose. */
  count: number;
  /** Where the pick came from: completion and cancel return there (a rest is used up). */
  from: 'shop' | 'rest' | 'event' | 'map' | 'reward';
  /** Coins charged when the first item is chosen (shop services). */
  cost?: number;
  /** The reward row that started the pick: it is taken once an item is chosen. */
  reward?: number;
}

/**
 * Test settings of a custom run, set from the dev panel: cheats and number knobs. Absent in normal
 * runs; a custom run never counts for the profile.
 */
export interface DevState {
  /** The hero takes no damage. */
  god?: boolean;
  /** The skill is always charged. */
  ink?: boolean;
  /** Enemy timers stand still: they never act. */
  freeze?: boolean;
  /** Multipliers: enemy health (new enemies), enemy damage (new enemies), the hero's strikes. */
  enemyHp?: number;
  enemyDmg?: number;
  heroDmg?: number;
  /** Stage override for the view (a RoomId) and its lighting. */
  room?: string;
  dark?: boolean;
  /** Any map node can be entered, not only the next row. */
  anywhere?: boolean;
}

/** Dev panel commands (the `dev` action; custom runs only). */
export type DevOp =
  | { op: 'hero'; hp?: number; maxHp?: number; coins?: number; charge?: number; armor?: number; keys?: number; finds?: number }
  /**
   * The hero's kit: gear ids (any colour; gear listed among `relics` counts too), the items held,
   * upgrades, red tape curses, items, skill and pockets.
   */
  | { op: 'build'; gear?: string[]; equip?: string[]; ups?: string[]; tape?: number; relics?: string[]; active?: string | null; pockets?: (string | null)[] }
  | { op: 'set'; dev: DevState }
  | { op: 'act'; act: number }
  | { op: 'enter'; kind: NodeKind | 'bossReward' | 'map'; enemies?: string[]; event?: string }
  | { op: 'travel'; node: number }
  | { op: 'win' }
  | { op: 'lose' };

export interface RunState {
  v: 4;
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
  /** Gear the rewards and the till can offer (unlocks applied; the starting items are not in it). */
  gearPool: string[];
  /** Events already seen this run (not repeated). */
  seenEvents: string[];
  treasure: TreasureState | null;
  /** Fights fought in the current act (the first ones are easier). */
  fightsInAct: number;
  lastEncounter: string;
  /** Curses shredded at the till this run (each costs more). */
  shreds: number;
  /** A fight started by an event pays this relic on top. */
  eventRelic: string | null;
  stats: RunStats;
  nextId: number;
  flags: Record<string, boolean>;
  /** Dev panel settings (custom runs only). */
  dev?: DevState;
}

export type Action =
  | { type: 'move'; move: Move }
  | { type: 'target'; uid: number }
  | { type: 'active'; cell?: number; col?: number; uid?: number }
  /** Spend energy on the next move: «Заряд» or «Вне очереди» (again: cancel, the energy comes back). */
  | { type: 'arm'; what: 'charge' | 'rush' }
  /** Hold another carried item of its colour (costs energy in a fight). */
  | { type: 'gear'; id: string }
  /** Put a carried item down (between fights; never the last of its colour). */
  | { type: 'dropGear'; id: string }
  | { type: 'pocket'; slot: number; cell?: number }
  | { type: 'discardPocket'; slot: number }
  | { type: 'travel'; node: number }
  | { type: 'reward'; index: number; pick?: number }
  | { type: 'buy'; kind: 'gear' | 'relic' | 'pocket' | 'upgrade'; index: number }
  /** The till's shredder: one red tape curse out. */
  | { type: 'remove' }
  | { type: 'reroll' }
  | { type: 'rest'; choice: 'heal' | 'upgrade' }
  | { type: 'event'; option: number }
  | { type: 'pick'; id: string }
  | { type: 'open'; key?: boolean; index?: number }
  | { type: 'bossRelic'; index: number }
  | { type: 'leave' }
  | { type: 'dev'; op: DevOp };

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
  fam: Fam | 'prism';
  dmg?: number;
  armor?: number;
  aoe?: number;
  coins?: number;
  charge?: number;
  /** Damage bonus this tile adds to the move, as a fraction (+0.25 = +25%). */
  bonus?: number;
  note?: string;
}

/** The move's running score: damage, armour, energy, coins and the damage bonus of the move. */
export interface Tally {
  dmg: number;
  armor: number;
  aoe: number;
  /** Damage bonus of the move as a fraction (+0.25 = +25%): no explicit multiplier. */
  bonus: number;
  coins: number;
  charge: number;
}

export type GameEvent =
  | { t: 'swap'; move: Move; board: BoardSnap; /** The tile was dragged along its line (the ones between shifted). */ slide?: boolean }
  | {
      t: 'wave';
      n: number;
      /** Lines that fell into place after a board tool (eraser, corrector): they clear for nothing. */
      idle?: boolean;
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
      /** The shield raised by a block action. */
      block?: number;
      skipped?: boolean;
      added?: number;
    }
  | { t: 'phase'; uid: number; phase: number }
  | { t: 'ember'; cells: number[]; hurt: { amount: number; armor: number; red: number } }
  | { t: 'board'; reason: 'reshuffle' | 'enemy' | 'active' | 'timers'; board: BoardSnap; queue?: Tile[][] }
  /** The board changed its size mid-fight (a cramped enemy fell): new cells came in. */
  | { t: 'resize'; w: number; h: number; board: BoardSnap; queue: Tile[][] }
  /** Another item held: every tile of its colour is it now. */
  | { t: 'gear'; id: string; fam: Fam }
  | { t: 'armed'; what: 'charge' | 'rush' | 'double'; on: boolean }
  | { t: 'enemyDie'; uid: number; split?: EnemyState[] }
  | { t: 'combatStart'; kind: Combat['kind'] }
  | { t: 'combatWon'; kind: Combat['kind'] }
  | { t: 'act'; act: number }
  | { t: 'enterNode'; node: number; kind: NodeKind }
  | { t: 'relic'; relic: string; source: string }
  | { t: 'gearGained'; id: string; source: string }
  | { t: 'gearUpgraded'; id: string }
  | { t: 'gearDropped'; id: string }
  /** Red tape curses changed (gained or shredded). */
  | { t: 'tape'; amount: number }
  | { t: 'keys'; amount: number }
  /** A find came onto the board (at a cell) or was picked up. */
  | { t: 'findSpawn'; cell: number; find: FindKind }
  | { t: 'found'; find: FindKind; text: string }
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

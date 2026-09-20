import type { ClassId, ItemId, Slot } from '../../duel/catalog.ts';
import type { Channel, Match, Tile } from './board.ts';
export type Reserves = Record<Channel, number>;
export type ItemMemory = {
  action: Record<string, number>;
  cycle: Record<string, number>;
  battle: Record<string, number>;
  run: Record<string, number>;
  previous?: Channel;
};
export type Hero = {
  hp: number;
  maxHp: number;
  barrier: number;
  rage: number;
  resonance: Reserves;
  gear: Partial<Record<Slot, ItemId>>;
  physical: number;
  magic: number;
  healing: number;
  gold: number;
  xp: number;
  level: number;
  itemState: ItemMemory;
};
export type IntentKind =
  | 'attack'
  | 'flurry'
  | 'lock'
  | 'bomb'
  | 'drain'
  | 'heal';
export type Intent = {
  kind: IntentKind;
  name: string;
  wait: number;
  damage: number;
  hits: number;
  count?: number;
};
export type Enemy = {
  name: string;
  art: string;
  hp: number;
  maxHp: number;
  defense: number;
  stage: 0 | 1 | 2;
  countdown: number;
  delay: number;
  weaken: number;
  cycle: number;
  intents: Intent[];
};
export type Loadout = {
  strike: 'heavy' | 'pierce' | 'leech';
  arcane: 'burst' | 'weaken' | 'delay';
  mend: 'restore' | 'cleanse' | 'grow';
  rage: 'physical' | 'magic' | 'healing';
  super: 'nova' | 'renew' | 'surge';
};
export type Config = {
  seed: number;
  classId: ClassId;
  mode: 'route' | 'duel';
  foe: number;
  testGear?: ItemId[];
  skills?: Loadout;
};
export type Command =
  | { type: 'swap'; a: number; b: number }
  | { type: 'super'; cell: number }
  | { type: 'guard'; value: boolean }
  | { type: 'reward'; item: ItemId | null }
  | { type: 'buy'; item: ItemId }
  | { type: 'next' };
export type ActionSummary = {
  damage: number;
  healing: number;
  casts: number;
  waves: number;
  created: number;
  supers: number;
  gold: number;
  xp: number;
  delayed: boolean;
};
export type State = {
  version: 1;
  config: Config;
  rng: { board: number; effect: number; loot: number };
  nextId: number;
  board: Tile[];
  hero: Hero;
  enemy: Enemy;
  room: number;
  phase: 'battle' | 'camp' | 'won' | 'lost';
  turn: number;
  action: number;
  guard: boolean;
  offers: ItemId[];
  stock: ItemId[];
  rewarded: boolean;
  commands: Command[];
  log: string[];
  skills: Loadout;
  buffs: { physical: number; magic: number; healing: number; weakness: number };
  last: ActionSummary;
  metrics: {
    swaps: number;
    supers: number;
    damage: number;
    maxCombo: number;
    stones: number;
    victories: number;
    shuffles: number;
  };
  achievements: string[];
};
export type Frame = {
  board: Tile[];
  after: Tile[];
  cells: number[];
  text: string;
  kind: 'match' | 'enemy' | 'super' | 'shuffle';
  heroHp: number;
  enemyHp: number;
};
export type Result = { state: State; frames: Frame[]; error?: string };
export type GroupEvent = {
  match: Match;
  channel: Channel | null;
  firstWave: boolean;
  special: boolean;
  manual: boolean;
  removed: Set<number>;
  protectedTiles: Map<number, Tile>;
  baseDamage: number;
  bonusDamage: number;
  bonusScale: number;
  income: number;
  cancelUpgrade: boolean;
};
export type ItemContext = {
  state: State;
  hero: Hero;
  enemy: Enemy;
  damage: (amount: number) => void;
  heal: (amount: number) => number;
  addBarrier: (amount: number) => number;
  grantResonance: (channel: Channel, amount: number) => number;
  addGold: (amount: number) => void;
  addXp: (amount: number) => void;
  delayEnemy: () => boolean;
  random: () => number;
  log: (text: string) => void;
};

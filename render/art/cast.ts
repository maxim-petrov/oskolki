import type { SpriteDef } from '../sprite.ts';

/**
 * Room props: pedestals, the trapdoor, chests, door arrows and the shop sign.
 * The heroes and the merchant live in heroes.ts. Same rules as the rest of the art: warm key
 * light from the upper left, cold rim on the right, cold shadows, 1px ink0 outline.
 */

// ---------------------------------------------------------------------------
// Props.
const stoneLegend = {
  '.': '',
  k: 'ink0',
  W: 'paper',
  a: 'grey4',
  b: 'grey3',
  c: 'grey2',
  d: 'grey1',
  e: 'cold1',
  f: 'cold4',
};

const pedestal = [
  '..kkkkkkkkkkkkkk..',
  '.kWWaaaaaaaaaaaak.',
  'kWaaaaaaaaaaaaaaak',
  'kbbbbbbbbbbbbbbbfk',
  'kccccccccccccccdek',
  '.kkkkkkkkkkkkkkkk.',
  '...kWbbbcbbbbcfk..',
  '...kWbbbcbbbbcfk..',
  '...kccccccccccek..',
  '...kWbcbbbbcbdfk..',
  '.kkkkkkkkkkkkkkkk.',
  'kWaaaaaaaaaaaaaaak',
  'kbbbbbbbbbbbbbbdek',
  'kkkkkkkkkkkkkkkkkk',
];

const dealLegend = {
  '.': '',
  k: 'ink0',
  W: 'grey1',
  b: 'ink3',
  c: 'ink2',
  d: 'ink1',
  e: 'vio0',
  f: 'cold2',
  q: 'red3',
  r: 'red2',
  R: 'red1',
  x: 'red0',
  S: 'red4',
  L: 'red5',
  X: 'red2',
  o: 'gold2',
  O: 'gold3',
};

const pedestalDeal = [
  '..kkkkkkkkkkkkkk..',
  '.kqqrrrrrrrrrrrrk.',
  'kqrrrrrrrrrrrrrrRk',
  'kRrrrrrrrrrrrrrRRk',
  'kxRRRRRRRRRRRRRRxk',
  '.kkkkkRRRRRRRkkkk.',
  '...kWbkRRRRRkcfk..',
  '...kWbkSLSSSkcfk..',
  '...kWkSSXXXSSkfk..',
  '...kWbkXSSXXkdfk..',
  '.kkkkkkkkkkkkkkkk.',
  'kOoooooooooooooook',
  'kbccccccccccccccek',
  'kkkkkkkkkkkkkkkkkk',
];

const trapLegend = {
  '.': '',
  k: 'ink0',
  W: 'paper',
  a: 'grey3',
  b: 'grey2',
  f: 'cold4',
  U: 'wood4',
  u: 'wood3',
  v: 'wood2',
  V: 'wood1',
  P: 'ink3',
  y: 'grey4',
  h: 'ink1',
  g: 'ink2',
  e: 'cold1',
};

const trapClosed = [
  '................................',
  '....kkkkkkkkkkkkkkkkkkkkkkkk....',
  '...kWaaaaaaaaaaaaaaaaaaaaaabk...',
  '..kakkkkkkkkkkkkkkkkkkkkkkkkbk..',
  '..kakUuuuVuuuVuuuuVuuuVuuuvkbk..',
  '..kakyPPPPPPPPPPPPPPPPPPPPykbk..',
  '.kaakuuuuVuuuVuuuuVuuuVuuuvkbfk.',
  '.kaakuuuuVuuuVuyyuVuuuVuuuvkbfk.',
  '.kaakyPPPPPPPPykkyPPPPPPPPykbfk.',
  'kaaakkkkkkkkkkkkkkkkkkkkkkkkbbbk',
  'kWaaaaaaaaaaaaaaaaaaaaaaaaaabbbk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
];

const trapOpen = [
  '............k......k............',
  '....kkkkkkkkUkkkkkkUkkkkkkkk....',
  '...kWaaaaaakUkaaaakUkaaaaaabk...',
  '..kakkkkkkkkukkkkkkukkkkkkkkbk..',
  '..kakeeeeeeeuUUUUUUueeeeeeekbk..',
  '..kakgggggggvggggggvgggggggkbk..',
  '.kaakhhhhhhhvuuuuuuvhhhhhhhkbfk.',
  '.kaakhhhhhhhVhhhhhhVhhhhhhhkbfk.',
  '.kaakkkhhhhhVVVVVVVVhhhhhkkkbfk.',
  'kaaakkkkkkkkkkkkkkkkkkkkkkkkbbbk',
  'kWaaaaaaaaaaaaaaaaaaaaaaaaaabbbk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
];

const chestLegend = {
  '.': '',
  k: 'ink0',
  U: 'wood4',
  u: 'wood3',
  v: 'wood2',
  V: 'wood1',
  i: 'grey4',
  I: 'grey3',
  J: 'grey2',
  o: 'gold3',
  O: 'gold4',
  j: 'gold2',
  e: 'cold1',
  f: 'cold4',
  h: 'ink1',
  W: 'cream',
};

const chestClosed = [
  '..kkkkkkkkkkkk..',
  '.kUUuiuuuuiuuvk.',
  'kUuuuiuuuuiuuvfk',
  'kuvvvIvvvvIvvVVk',
  'kkkkkkkoOkkkkkkk',
  'kUuuuiuojuiuuvfk',
  'kuuuuiukkuiuuvfk',
  'kuvvvIvvvvIvvvVk',
  'kVVVVIVVVVIVVVVk',
  'kuvvvIvvvvIvvvfk',
  'kuvvvIvvvvIvvvVk',
  'kVVVVJVVVVJVVVek',
  'kkkkkkkkkkkkkkkk',
];

const chestOpen = [
  '.kkkkkkkkkkkkkk.',
  '.kvVVVVVVVVVVVk.',
  '.kvVVVVVVVVVVVk.',
  'kkkkkkkkkkkkkkkk',
  'kUhhhhhhhhhhhhfk',
  'kuhhhWOhhhhhhhVk',
  'kkkkkkkkkkkkkkkk',
  'kuvvvIvvvvIvvvfk',
  'kVVVVIVVVVIVVVVk',
  'kuvvvIvvvvIvvvfk',
  'kuvvvIvvvvIvvvVk',
  'kVVVVJVVVVJVVVek',
  'kkkkkkkkkkkkkkkk',
];

const goldLegend = {
  '.': '',
  k: 'ink0',
  W: 'cream',
  G: 'gold4',
  g: 'gold3',
  j: 'gold2',
  J: 'gold1',
  y: 'grey4',
  a: 'grey3',
  e: 'grey2',
  h: 'ink1',
  f: 'cold4',
};

const goldClosed = [
  '..kkkkkkkkkkkk..',
  '.kWWgjggggjggjk.',
  'kWggggggggggggfk',
  'kgjjjJjjjjJjjJJk',
  'kkkkkkkyykkkkkkk',
  'kWgggjgyygjgggfk',
  'kgggjjkaakjjggJk',
  'kgjjjJkekkJjjjJk',
  'kJJJJJkkkkJJJJJk',
  'kgjjjJjjjjJjjjfk',
  'kgjjjJjjjjJjjjJk',
  'kJJJJJJJJJJJJJJk',
  'kkkkkkkkkkkkkkkk',
];

const goldOpen = [
  '.kkkkkkkkkkkkkk.',
  '.kjJJJJJJJJJJjk.',
  '.kjJJJJJJJJJJjk.',
  'kkkkkkkkkkkkkkkk',
  'kWhhhhhhhhhhhhfk',
  'kghhhWGhhhhhhhJk',
  'kkkkkkkkkkkkkkkk',
  'kgjjjJjjjjJjjjfk',
  'kJJJJJJJJJJJJJJk',
  'kgjjjJjjjjJjjjfk',
  'kgjjjJjjjjJjjjJk',
  'kJJJJJJJJJJJJJJk',
  'kkkkkkkkkkkkkkkk',
];

const arrowLegend = {
  '.': '',
  k: 'ink0',
  W: 'cream',
  w: 'paper',
  q: 'paper2',
};

const arrowRight = [
  '.....k.....',
  '.....kk....',
  '.....kWk...',
  'kkkkkkWWk..',
  'kWWWWWWWwk.',
  'kWwwwwwwwqk',
  'kqqqqqwwqk.',
  'kkkkkkwqk..',
  '.....kqk...',
  '.....kk....',
  '.....k.....',
];

const arrowUp = [
  '.....k.....',
  '....kWk....',
  '...kWwqk...',
  '..kWWwwqk..',
  '.kWWwwwwqk.',
  'kkkkWwqkkkk',
  '...kWwqk...',
  '...kWwqk...',
  '...kWwqk...',
  '...kWqqk...',
  '...kkkkk...',
];

const signLegend = {
  '.': '',
  k: 'ink0',
  U: 'wood4',
  u: 'wood3',
  v: 'wood2',
  V: 'wood1',
  y: 'grey4',
  q: 'paper2',
  f: 'cold4',
};

const sign = [
  '.....kqk........................kqk.....',
  '.....kUk........................kUk.....',
  '.....kqk........................kqk.....',
  '.....kUk........................kUk.....',
  '..kkkkykkkkkkkkkkkkkkkkkkkkkkkkkkykkkk..',
  '.kUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUuk.',
  'kUukkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkuVk',
  'kUukVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVkuVk',
  'kUukvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkuVk',
  'kUukvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkuVk',
  'kUukvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkuVk',
  'kUukvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkuVk',
  'kUukvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkuVk',
  'kUukvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkuVk',
  'kUukkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkuVk',
  'kuVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVfk',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
];

export const CAST: Record<string, SpriteDef> = {
  pedestal: { w: 18, h: 14, legend: stoneLegend, frames: { idle0: pedestal }, ox: 9, oy: 13 },
  pedestal_deal: { w: 18, h: 14, legend: dealLegend, frames: { idle0: pedestalDeal }, ox: 9, oy: 13 },
  trapdoor: { w: 32, h: 12, legend: trapLegend, frames: { closed: trapClosed, open: trapOpen }, ox: 16, oy: 11 },
  chest: { w: 16, h: 13, legend: chestLegend, frames: { closed: chestClosed, open: chestOpen }, ox: 8, oy: 12 },
  chest_locked: { w: 16, h: 13, legend: goldLegend, frames: { closed: goldClosed, open: goldOpen }, ox: 8, oy: 12 },
  door_arrow: { w: 11, h: 11, legend: arrowLegend, frames: { idle0: arrowRight }, ox: 5, oy: 5 },
  door_arrow_up: { w: 11, h: 11, legend: arrowLegend, frames: { idle0: arrowUp }, ox: 5, oy: 5 },
  shopkeeper_sign: { w: 40, h: 17, legend: signLegend, frames: { idle0: sign }, ox: 20, oy: 16 },
};

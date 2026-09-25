/**
 * «Дворец слов» palette (this branch): the quiet greys, grey-olive and grey-lilac of the old
 * paper office with dusty pink paper, one red and one teal signal (see docs/ART.md). The names
 * are kept from the night palette, so every sprite keeps its ramps and simply turns muted.
 */
export const PAL = {
  // Cold darks
  ink0: '#171916',
  ink1: '#23261f',
  ink2: '#30332e',
  ink3: '#3f443c',
  cold1: '#2a4547',
  cold2: '#32696d',
  cold3: '#4e8488',
  cold4: '#7fa6a6',
  cold5: '#bdceca',
  cold6: '#e2ebe7',
  // Teal (rain, water, glass)
  teal0: '#1b3034',
  teal1: '#26474b',
  teal2: '#346569',
  teal3: '#4f8e93',
  teal4: '#72bec8',
  teal5: '#b8e0e2',
  // Violet (ink)
  vio0: '#221b2a',
  vio1: '#382b45',
  vio2: '#4f3c60',
  vio3: '#675078',
  vio4: '#9a83ae',
  vio5: '#e0cee8',
  // Warm (blood, fire, light)
  red0: '#3a1412',
  red1: '#6a221e',
  red2: '#a52e2a',
  red3: '#c0453c',
  red4: '#d8796c',
  red5: '#ebb4a8',
  orange1: '#86491f',
  orange2: '#b36a37',
  orange3: '#cf8c55',
  orange4: '#e4bb8a',
  gold1: '#745124',
  gold2: '#a07a38',
  gold3: '#c6a258',
  gold4: '#e5d29b',
  cream: '#fff6ee',
  // Wood
  wood0: '#241a14',
  wood1: '#3a2b20',
  wood2: '#56402f',
  wood3: '#7a5c42',
  wood4: '#a58461',
  // Green
  green0: '#1c2519',
  green1: '#2c3a26',
  green2: '#405937',
  green3: '#687f57',
  green4: '#bfc8a4',
  // Neutral
  grey0: '#2b2c29',
  grey1: '#4e534c',
  grey2: '#666b63',
  grey3: '#858980',
  grey4: '#b5b7b0',
  paper: '#e4e0d9',
  paper2: '#cececa',
  white: '#fff6ee',
  // Office drab: the sickly green-grey of cubicle partitions and endless corridors.
  drab0: '#33312f',
  drab1: '#4c4946',
  drab2: '#66625e',
  drab3: '#827d78',
  drab4: '#a39e98',
  drab5: '#c8c4be',
  // Slate: blue-grey carpet, filing steel, cold plastic.
  slate0: '#33313b',
  slate1: '#484553',
  slate2: '#5e5a6a',
  slate3: '#777384',
  slate4: '#9e9aaa',
  // Beige: old computer plastic, manila folders.
  beige0: '#5a5345',
  beige1: '#7f775f',
  beige2: '#a69e85',
  beige3: '#d2cab3',
  // CRT glow.
  crt0: '#1e2823',
  crt1: '#3b5847',
  crt2: '#93b89c',
  // Olive-khaki: trousers, old desks and cabinets of the paper office.
  olive0: '#2a2a15',
  olive1: '#43411f',
  olive2: '#5a582a',
  olive3: '#75723b',
  olive4: '#979459',
  // Skin
  skin0: '#8a5b45',
  skin1: '#c8906c',
  skin2: '#e9b993',
  skin3: '#f8dab5',
} as const;

export type PalName = keyof typeof PAL;

export function hex(name: string): string {
  return (PAL as Record<string, string>)[name] ?? name;
}

export function rgb(color: string): [number, number, number] {
  const h = hex(color).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(color: string, a: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${r},${g},${b},${a})`;
}

/** Family colours: warm for blade/coin, cold for shield/ink. */
export const FAM_COLORS = {
  blade: { dark: 'red1', mid: 'red3', light: 'red5', glow: 'orange4' },
  shield: { dark: 'cold1', mid: 'cold3', light: 'cold5', glow: 'cold6' },
  ink: { dark: 'vio1', mid: 'vio3', light: 'vio5', glow: 'vio5' },
  coin: { dark: 'gold1', mid: 'gold3', light: 'gold4', glow: 'cream' },
  prism: { dark: 'grey1', mid: 'white', light: 'white', glow: 'white' },
  junk: { dark: 'ink1', mid: 'vio1', light: 'vio2', glow: 'vio3' },
} as const;

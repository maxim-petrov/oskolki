/**
 * Night palette with a strong warm/cold split: cold ambient (ink, blue, teal, violet)
 * against warm light (amber, orange, red, gold). Sprites reference these names.
 */
export const PAL = {
  // Cold darks
  ink0: '#07070f',
  ink1: '#0f1122',
  ink2: '#171b35',
  ink3: '#222949',
  cold1: '#2f3a6b',
  cold2: '#3f5190',
  cold3: '#5673bd',
  cold4: '#7fa1dc',
  cold5: '#b4cdf1',
  cold6: '#e2ecfb',
  // Teal (rain, water, glass)
  teal0: '#0c2229',
  teal1: '#123a46',
  teal2: '#1b5c66',
  teal3: '#2a8c88',
  teal4: '#53bfae',
  teal5: '#9ae8d4',
  // Violet (ink)
  vio0: '#170c28',
  vio1: '#2e1551',
  vio2: '#4d2385',
  vio3: '#753cbf',
  vio4: '#a26ae6',
  vio5: '#d6b8ff',
  // Warm (blood, fire, light)
  red0: '#3a0d15',
  red1: '#6e1828',
  red2: '#a8263a',
  red3: '#df3f44',
  red4: '#ff7a5c',
  red5: '#ffb099',
  orange1: '#9c3f18',
  orange2: '#d9661f',
  orange3: '#ff9830',
  orange4: '#ffc467',
  gold1: '#8f5f10',
  gold2: '#c9911b',
  gold3: '#f4c83a',
  gold4: '#ffec85',
  cream: '#fff5d6',
  // Wood
  wood0: '#1e0f0b',
  wood1: '#351d14',
  wood2: '#56311f',
  wood3: '#7e4b2b',
  wood4: '#ad743e',
  // Green
  green0: '#0f2219',
  green1: '#1c4428',
  green2: '#33713a',
  green3: '#64a748',
  green4: '#b0dc6c',
  // Neutral
  grey0: '#27262f',
  grey1: '#403e4b',
  grey2: '#63606c',
  grey3: '#918e9b',
  grey4: '#c6c2c8',
  paper: '#ebe1cb',
  paper2: '#c9bc9f',
  white: '#ffffff',
  // Office drab: the sickly green-grey of cubicle partitions and endless corridors.
  drab0: '#1b201e',
  drab1: '#2e3531',
  drab2: '#4a544e',
  drab3: '#6e7a72',
  drab4: '#99a59c',
  drab5: '#c7d0c8',
  // Slate: blue-grey carpet, filing steel, cold plastic.
  slate0: '#22272d',
  slate1: '#333a42',
  slate2: '#4a535d',
  slate3: '#6b7682',
  slate4: '#97a2ad',
  // Beige: old computer plastic, manila folders.
  beige0: '#5a5344',
  beige1: '#877d66',
  beige2: '#b0a68b',
  beige3: '#d5ccb1',
  // CRT glow.
  crt0: '#12301e',
  crt1: '#2c7a45',
  crt2: '#8dfc9e',
  // Olive-khaki (trousers, old desks) and the neutral greys of the «Дворец слов» cast (shirts, suits).
  olive0: '#2a2a15',
  olive1: '#43411f',
  olive2: '#5a582a',
  olive3: '#75723b',
  olive4: '#979459',
  ash1: '#666b63',
  ash2: '#858980',
  ash3: '#b5b7b0',
  ash4: '#cececa',
  rose: '#e3c9ce',
  // Skin
  skin0: '#7d4a37',
  skin1: '#bf8261',
  skin2: '#e6ad84',
  skin3: '#ffd3ad',
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

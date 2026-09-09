export const ICON_NAMES = [
  'blade',
  'shield',
  'spark',
  'focus',
  'venom',
  'bomb',
  'heart',
  'coin',
  'potion',
  'relic',
  'crown',
  'star',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

'use client';
import { useId } from 'react';
export const ROYAL_ICONS = [
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
export type RoyalIconName = (typeof ROYAL_ICONS)[number];
const REGIONS = [
  [15.5, 33.0, 341, 341],
  [398.0, 35.0, 324, 324],
  [743.0, 40.0, 319, 319],
  [1097.0, 45.0, 316, 316],
  [17.5, 383.0, 335, 335],
  [383.5, 378.0, 318, 318],
  [751.0, 400.0, 298, 298],
  [1101.5, 397.0, 297, 297],
  [15.5, 719.0, 319, 319],
  [392.5, 730.0, 301, 301],
  [741.0, 728.5, 307, 307],
  [1094.0, 728.0, 305, 305],
];
export function RoyalIcon({
  name,
  size = 30,
  className = '',
}: {
  name: RoyalIconName;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, ''),
    index = ROYAL_ICONS.indexOf(name);
  const [x, y, cellW, cellH] = REGIONS[index];
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className={`royal-icon size-royal ${className}`}
      viewBox={`${x} ${y} ${cellW} ${cellH}`}
    >
      <defs>
        <filter
          id={`icon-matte-${uid}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={cellW}
          height={cellH}
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -10 -10 -10 0 27"
          />
        </filter>
      </defs>
      <image
        href="/art/royal/icons.png"
        width={1448}
        height={1086}
        filter={`url(#icon-matte-${uid})`}
      />
    </svg>
  );
}

'use client';
import { useId } from 'react';
import type { RoyalIconName } from '@/components/royal-icon';

// The atlas uses a skull for poison, a fire burst for a bomb, and a spellbook
// for a relic. The four basic families retain their familiar silhouettes.
const CELL: Record<RoyalIconName, number> = {
  blade: 0, shield: 1, spark: 2, focus: 3,
  venom: 10, bomb: 9, heart: 4, coin: 5,
  potion: 6, relic: 7, crown: 8, star: 3,
};

export function PaperIcon({ name, size = 30, className = '' }: {
  name: RoyalIconName; size?: number; className?: string;
}) {
  const index = CELL[name];
  const id = useId().replace(/:/g, '');
  const x = (index % 4) * 362 + 18;
  const y = Math.floor(index / 4) * 362 + 18;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className={`paper-icon ${className}`}
      viewBox={`${x} ${y} 326 326`}
    >
      <defs>
        <clipPath id={`paper-icon-${id}`}>
          <rect x={x} y={y} width={326} height={326} />
        </clipPath>
      </defs>
      <image href="/art/paper/icons.png" width={1448} height={1086} clipPath={`url(#paper-icon-${id})`} />
    </svg>
  );
}

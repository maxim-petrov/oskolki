'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';

// Per-item native x/y/width/height; several effects cross equal grid boundaries.
const REGIONS = [
  [45, 13, 294, 350],
  [403, 35, 302, 308],
  [802, 23, 228, 338],
  [1127, 24, 284, 326],
  [44, 378, 284, 309],
  [428, 357, 292, 326],
  [762, 387, 305, 292],
  [1146, 408, 252, 258],
  [78, 697, 210, 357],
  [403, 700, 286, 357],
  [749, 726, 318, 317],
  [1119, 703, 294, 339],
];

export function UnderworldIcon({
  name,
  size = 30,
  className = '',
}: {
  name: RoyalIconName;
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const [x, y, width, height] = REGIONS[ROYAL_ICONS.indexOf(name)];
  const extent = Math.max(width, height) + 12;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className={`underworld-icon size-underworld ${className}`}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
    >
      <defs>
        <clipPath id={`underworld-icon-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
      </defs>
      <image
        href="/art/underworld/icons.png"
        width={1448}
        height={1086}
        clipPath={`url(#underworld-icon-${id})`}
      />
    </svg>
  );
}

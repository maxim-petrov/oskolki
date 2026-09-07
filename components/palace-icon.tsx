'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';
import { PalaceCutout } from '@/components/palace-cutout';

// Measured item bounds, including detached sparks. The source stays untouched.
const REGIONS = [
  [67, 31, 307, 306],
  [449, 31, 257, 306],
  [816, 31, 261, 315],
  [1174, 31, 301, 306],
  [84, 362, 216, 290],
  [445, 361, 275, 291],
  [816, 389, 270, 253],
  [1194, 372, 256, 270],
  [79, 670, 222, 314],
  [428, 673, 274, 309],
  [814, 702, 280, 251],
  [1163, 670, 313, 311],
];

export function PalaceIcon({
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
      shapeRendering="crispEdges"
      width={size}
      height={size}
      className={`palace-icon size-palace ${className}`}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
    >
      <defs>
        <clipPath id={`palace-icon-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <PalaceCutout
          id={`palace-icon-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/pronoun-palace/icons.png"
        width={1536}
        height={1024}
        clipPath={`url(#palace-icon-${id})`}
        filter={`url(#palace-icon-alpha-${id})`}
      />
    </svg>
  );
}

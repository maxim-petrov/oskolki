'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';
import { SummitCutout } from '@/components/summit-cutout';

// Measured item bounds, including detached sparks. The source stays untouched.
const REGIONS = [
  [96, 73, 228, 239],
  [474, 61, 207, 260],
  [890, 59, 165, 262],
  [1251, 71, 192, 250],
  [95, 393, 195, 252],
  [474, 380, 200, 266],
  [843, 418, 235, 214],
  [1238, 409, 210, 219],
  [95, 702, 195, 262],
  [442, 749, 272, 186],
  [826, 713, 268, 232],
  [1216, 705, 254, 256],
];

export function SummitIcon({
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
      className={`summit-icon size-summit ${className}`}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
    >
      <defs>
        <clipPath id={`summit-icon-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <SummitCutout
          id={`summit-icon-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/summit/icons.png"
        width={1536}
        height={1024}
        clipPath={`url(#summit-icon-${id})`}
        filter={`url(#summit-icon-alpha-${id})`}
      />
    </svg>
  );
}

'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';

// Measured x/y/width/height; clip each item even when its UI box is non-square.
const REGIONS = [
  [55, 46, 300, 309],
  [430, 53, 227, 296],
  [807, 46, 196, 302],
  [1134, 46, 258, 309],
  [93, 388, 176, 291],
  [438, 389, 248, 290],
  [794, 437, 213, 209],
  [1151, 418, 222, 235],
  [71, 720, 219, 286],
  [421, 708, 245, 316],
  [752, 740, 307, 238],
  [1132, 713, 264, 297],
];

export function MidnightIcon({
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
      className={`midnight-icon size-midnight ${className}`}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
    >
      <defs>
        <clipPath id={`midnight-icon-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <filter
          id={`midnight-icon-alpha-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={width}
          height={height}
          colorInterpolationFilters="sRGB"
        >
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
      <image
        href="/art/midnight/icons.png"
        width={1448}
        height={1086}
        clipPath={`url(#midnight-icon-${id})`}
        filter={`url(#midnight-icon-alpha-${id})`}
      />
    </svg>
  );
}

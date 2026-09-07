'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';

// Native x/y/width/height, including each item's highlights and detached sparks.
const REGIONS = [
  [29, 12, 293, 345],
  [398, 33, 290, 298],
  [802, 10, 225, 344],
  [1118, 16, 296, 347],
  [66, 365, 260, 344],
  [413, 366, 286, 331],
  [785, 372, 254, 333],
  [1135, 407, 254, 275],
  [54, 732, 258, 324],
  [416, 715, 258, 341],
  [753, 746, 299, 292],
  [1123, 722, 288, 325],
];

export function DeadCellsIcon({
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
      className={`deadcells-icon size-deadcells ${className}`}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
    >
      <defs>
        <clipPath id={`deadcells-icon-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <filter
          id={`deadcells-icon-alpha-${id}`}
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
        href="/art/dead-cells/icons.png"
        width={1448}
        height={1086}
        clipPath={`url(#deadcells-icon-${id})`}
        filter={`url(#deadcells-icon-alpha-${id})`}
      />
    </svg>
  );
}

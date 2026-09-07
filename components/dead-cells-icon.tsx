'use client';
import { DeadCellsCutout } from '@/components/dead-cells-cutout';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';

// Native x/y/width/height, including each item's highlights and detached sparks.
const REGIONS = [
  [32, 17, 282, 344],
  [413, 43, 277, 294],
  [778, 16, 257, 347],
  [1102, 31, 309, 339],
  [61, 371, 266, 342],
  [412, 372, 301, 332],
  [766, 374, 281, 340],
  [1111, 406, 278, 288],
  [42, 727, 282, 333],
  [393, 704, 290, 356],
  [745, 733, 305, 308],
  [1102, 713, 309, 343],
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
      shapeRendering="crispEdges"
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
        <DeadCellsCutout
          id={`deadcells-icon-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/dead-cells/icons-pixel.png"
        width={1448}
        height={1086}
        clipPath={`url(#deadcells-icon-${id})`}
        filter={`url(#deadcells-icon-alpha-${id})`}
      />
    </svg>
  );
}

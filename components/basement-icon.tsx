'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';
import { BasementCutout } from '@/components/basement-cutout';

// Measured item bounds, including detached sparks. The source stays untouched.
const REGIONS = [
  [37, 30, 318, 291],
  [444, 30, 236, 291],
  [853, 37, 192, 285],
  [1163, 30, 341, 300],
  [72, 354, 227, 293],
  [440, 346, 278, 294],
  [814, 395, 274, 248],
  [1213, 381, 244, 258],
  [66, 680, 232, 298],
  [458, 666, 202, 300],
  [796, 705, 294, 243],
  [1190, 680, 284, 299],
];

export function BasementIcon({
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
      className={`basement-icon size-basement ${className}`}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
    >
      <defs>
        <clipPath id={`basement-icon-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <BasementCutout
          id={`basement-icon-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/basement/icons.png"
        width={1536}
        height={1024}
        clipPath={`url(#basement-icon-${id})`}
        filter={`url(#basement-icon-alpha-${id})`}
      />
    </svg>
  );
}

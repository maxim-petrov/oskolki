'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';

// Measured native atlas bounds [left, top, right, bottom]. Independent clips
// keep neighboring icons out of non-square UI containers.
const REGIONS = [
  [59, 48, 325, 329], [429, 45, 659, 334], [799, 63, 1016, 335], [1131, 56, 1385, 329],
  [76, 400, 287, 682], [416, 384, 677, 670], [773, 423, 1037, 653], [1152, 419, 1372, 656],
  [74, 745, 287, 1028], [444, 741, 649, 1032], [768, 760, 1044, 1022], [1131, 746, 1388, 1030],
];

export function DarkTaleIcon({ name, size = 30, className = '' }: {
  name: RoyalIconName; size?: number; className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const [x, y, right, bottom] = REGIONS[ROYAL_ICONS.indexOf(name)];
  const width = right - x, height = bottom - y, extent = Math.max(width, height) + 12;
  return (
    <svg aria-hidden="true" width={size} height={size} className={`dark-tale-icon ${className}`} viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}>
      <defs><clipPath id={`dark-icon-${id}`}><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
      <image href="/art/dark-tale/icons.png" width={1448} height={1086} clipPath={`url(#dark-icon-${id})`} />
    </svg>
  );
}

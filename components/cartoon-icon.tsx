'use client';
import { useId } from 'react';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';

const REGIONS: [number, number, number, number][] = [
  [29, 9, 334, 337], [444, 11, 273, 335], [810, 7, 316, 345], [1182, 12, 327, 324],
  [37, 352, 293, 313], [441, 345, 293, 324], [811, 388, 302, 264], [1194, 363, 289, 304],
  [52, 679, 241, 323], [415, 665, 324, 342], [796, 673, 329, 316], [1179, 679, 324, 319],
];
const OUTLINES: Partial<Record<RoyalIconName, string>> = {
  bomb: '438,342 737,342 737,662 610,662 610,672 438,672',
  relic: '610,663 742,663 742,1010 412,1010 412,672 610,672',
};

export function CartoonIcon({ name, size = 30, className = '' }: {
  name: RoyalIconName; size?: number; className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const index = ROYAL_ICONS.indexOf(name);
  const [x, y, width, height] = REGIONS[index];
  const extent = Math.max(width, height) + 16;
  const outline = OUTLINES[name];
  return (
    <svg aria-hidden="true" width={size} height={size} className={`cartoon-icon ${className}`} viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}>
      <defs><clipPath id={`cartoon-icon-${id}`}>{outline ? <polygon points={outline} /> : <rect x={x} y={y} width={width} height={height} />}</clipPath></defs>
      <image href="/art/cartoon/icons.png" width={1536} height={1024} clipPath={`url(#cartoon-icon-${id})`} />
    </svg>
  );
}

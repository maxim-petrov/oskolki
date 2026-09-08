'use client';
import { ROYAL_ICONS, type RoyalIconName } from '@/components/royal-icon';
import { ArcadeRaster } from '@/components/arcade-raster';
const REGIONS: [number, number, number, number][] = [
  [74, 58, 249, 272],
  [448, 73, 264, 263],
  [861, 70, 212, 270],
  [1199, 74, 241, 252],
  [95, 382, 198, 261],
  [447, 358, 242, 285],
  [818, 397, 274, 243],
  [1213, 384, 229, 248],
  [103, 689, 174, 275],
  [423, 712, 310, 245],
  [806, 701, 308, 251],
  [1193, 690, 270, 267],
];
export function ArcadeIcon({
  name,
  size = 30,
  className = '',
}: {
  name: RoyalIconName;
  size?: number;
  className?: string;
}) {
  const crop = REGIONS[ROYAL_ICONS.indexOf(name)];
  const [x, y, w, h] = crop,
    extent = Math.max(w, h) + 16;
  return (
    <ArcadeRaster
      src="/art/arcade/icons-pixel.png"
      crop={crop}
      frame={[x + (w - extent) / 2, y + (h - extent) / 2, extent, extent]}
      width={32}
      height={32}
      className={`arcade-icon size-arcade ${className}`}
      style={{ '--arcade-icon-size': `${size}px` } as React.CSSProperties}
    />
  );
}

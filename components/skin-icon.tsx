'use client';
import { ArcadeIcon } from '@/components/arcade-icon';
import { SummitIcon } from '@/components/summit-icon';
import { useId } from 'react';
import { useVisualStyle } from '@/components/visual-style';
import { PaperIcon } from '@/components/paper-icon';
import { CartoonIcon } from '@/components/cartoon-icon';
import { DarkTaleIcon } from '@/components/dark-tale-icon';
import { MidnightIcon } from '@/components/midnight-icon';
import { UnderworldIcon } from '@/components/underworld-icon';
import { DeadCellsIcon } from '@/components/dead-cells-icon';
import { PalaceIcon } from '@/components/palace-icon';
import { BasementIcon } from '@/components/basement-icon';
import {
  RoyalIcon,
  ROYAL_ICONS,
  type RoyalIconName,
} from '@/components/royal-icon';
export type SkinIconName = RoyalIconName;
type IconProps = { name: SkinIconName; size?: number; className?: string };
const REGIONS = [
  [71.0, 62.0, 288],
  [416.0, 62.0, 285],
  [746.5, 46.0, 306],
  [1086.0, 46.0, 305],
  [79.5, 411.0, 255],
  [404.5, 391.0, 283],
  [766.0, 414.0, 270],
  [1118.0, 415.0, 251],
  [47.5, 724.0, 296],
  [399.0, 740.0, 283],
  [745.0, 712.0, 313],
  [1111.5, 735.0, 266],
];
function PixelIcon({ name, size = 30, className = '' }: IconProps) {
  const id = useId().replace(/:/g, '');
  const [x, y, extent] = REGIONS[ROYAL_ICONS.indexOf(name)];
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className={`pixel-icon size-pixel ${className}`}
      viewBox={`${x} ${y} ${extent} ${extent}`}
    >
      <defs>
        <filter
          id={`pixel-icon-matte-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={extent}
          height={extent}
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -50 -50 -50 0 148"
          />
        </filter>
      </defs>
      <image
        href="/art/pixel/icons.png"
        width={1448}
        height={1086}
        filter={`url(#pixel-icon-matte-${id})`}
      />
    </svg>
  );
}
export function SkinIcon(props: IconProps) {
  const style = useVisualStyle();
  if (style === 'arcade') return <ArcadeIcon {...props} />;
  if (style === 'summit') return <SummitIcon {...props} />;
  if (
    style === 'palace' ||
    style === 'palace-pop' ||
    style === 'palace-vivid' ||
    style === 'palace-cellar' ||
    style === 'palace-summit'
  )
    return <PalaceIcon {...props} />;
  if (style === 'basement') return <BasementIcon {...props} />;
  if (style === 'deadcells') return <DeadCellsIcon {...props} />;
  if (style === 'underworld') return <UnderworldIcon {...props} />;
  if (style === 'midnight') return <MidnightIcon {...props} />;
  if (style === 'darktale') return <DarkTaleIcon {...props} />;
  if (style === 'cartoon') return <CartoonIcon {...props} />;
  if (style === 'paper') return <PaperIcon {...props} />;
  return style === 'pixel' ? (
    <PixelIcon {...props} />
  ) : (
    <RoyalIcon {...props} />
  );
}

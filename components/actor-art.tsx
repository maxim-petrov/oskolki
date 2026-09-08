'use client';
import { SummitActorArt } from '@/components/summit-actor-art';
import { useId } from 'react';
import { useVisualStyle } from '@/components/visual-style';
import { PixelActorArt } from '@/components/pixel-actor-art';
import { RoyalActorArt } from '@/components/royal-actor-art';
import { PaperActorArt } from '@/components/paper-actor-art';
import { CartoonActorArt } from '@/components/cartoon-actor-art';
import { DarkTaleActorArt } from '@/components/dark-tale-actor-art';
import { MidnightActorArt } from '@/components/midnight-actor-art';
import { UnderworldActorArt } from '@/components/underworld-actor-art';
import { DeadCellsActorArt } from '@/components/dead-cells-actor-art';
import { PalaceActorArt } from '@/components/palace-actor-art';
import { BasementActorArt } from '@/components/basement-actor-art';
import type { Pose } from '@/game/motion';
// Atlas coordinates measured from the generated source. Keep the texture intact:
// the renderer uses a light-background color key, like a sprite material.
// Independent regions avoid clipping a raised axe at a nominal grid boundary.
type Region = {
  crop: [number, number, number, number];
  anchor: [number, number];
};
const HERO: Record<Pose, Region> = {
  idle: { crop: [120, 105, 340, 372], anchor: [310, 471] },
  windup: { crop: [590, 102, 348, 365], anchor: [781, 461] },
  strike: { crop: [1005, 180, 442, 282], anchor: [1180, 451] },
  guard: { crop: [156, 580, 275, 300], anchor: [312, 870] },
  hurt: { crop: [590, 572, 361, 300], anchor: [784, 864] },
  death: { crop: [1040, 688, 354, 183], anchor: [1220, 866] },
};
const ENEMY: Record<Pose, Region> = {
  idle: { crop: [20, 90, 492, 453], anchor: [355, 537] },
  windup: { crop: [580, 0, 390, 541], anchor: [787, 538] },
  strike: { crop: [930, 154, 565, 390], anchor: [1297, 530] },
  guard: { crop: [60, 548, 416, 438], anchor: [332, 978] },
  hurt: { crop: [498, 548, 462, 440], anchor: [791, 984] },
  death: { crop: [930, 775, 563, 223], anchor: [1206, 987] },
};
export function ActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const style = useVisualStyle();
  if (style === 'summit') return <SummitActorArt hero={hero} pose={pose} />;
  if (style === 'palace') return <PalaceActorArt hero={hero} pose={pose} />;
  if (style === 'basement') return <BasementActorArt hero={hero} pose={pose} />;
  if (style === 'deadcells')
    return <DeadCellsActorArt hero={hero} pose={pose} />;
  if (style === 'underworld')
    return <UnderworldActorArt hero={hero} pose={pose} />;
  if (style === 'midnight') return <MidnightActorArt hero={hero} pose={pose} />;
  if (style === 'darktale') return <DarkTaleActorArt hero={hero} pose={pose} />;
  if (style === 'cartoon') return <CartoonActorArt hero={hero} pose={pose} />;
  if (style === 'paper') return <PaperActorArt hero={hero} pose={pose} />;
  if (style === 'pixel') return <PixelActorArt hero={hero} pose={pose} />;
  if (style === 'royal') return <RoyalActorArt hero={hero} pose={pose} />;
  const region = (hero ? HERO : ENEMY)[pose],
    size = hero ? 420 : 520;
  const [x, y, w, h] = region.crop,
    [ax, ay] = region.anchor;
  return (
    <svg
      className={`sprite-art art-${hero ? 'wanderer' : 'guardian'} pose-${pose}`}
      viewBox={`${ax - size / 2} ${ay - size + 20} ${size} ${size}`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`crop-${id}`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
        <filter
          id={`matte-${id}`}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -10 -10 -10 0 27"
          />
        </filter>
      </defs>
      <g clipPath={`url(#crop-${id})`}>
        <image
          href={hero ? '/art/wanderer-poses.png' : '/art/guardian-poses.png'}
          width={1536}
          height={1024}
          filter={`url(#matte-${id})`}
        />
      </g>
    </svg>
  );
}

'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
import { PalaceCutout } from './palace-cutout';
import { HeldWeaponArt } from './held-weapon-art';
// Measured native crops and hands. Original bitmap is never recolored or resized on disk.
export const WARDEN_FRAMES: Record<
  Pose,
  {
    bounds: [number, number, number, number];
    feet: [number, number];
    hand: [number, number];
    angle: number;
  }
> = {
  idle: {
    bounds: [98, 45, 272, 485],
    feet: [232, 528],
    hand: [143, 378],
    angle: 48,
  },
  windup: {
    bounds: [560, 79, 370, 451],
    feet: [747, 528],
    hand: [658, 111],
    angle: -65,
  },
  strike: {
    bounds: [1046, 101, 463, 429],
    feet: [1240, 528],
    hand: [1470, 282],
    angle: 0,
  },
  guard: {
    bounds: [60, 591, 346, 411],
    feet: [229, 1000],
    hand: [274, 775],
    angle: -60,
  },
  hurt: {
    bounds: [558, 591, 366, 411],
    feet: [735, 1000],
    hand: [625, 846],
    angle: 48,
  },
  death: {
    bounds: [974, 813, 542, 188],
    feet: [1244, 1000],
    hand: [1350, 974],
    angle: 8,
  },
};
export function WardenArt({
  pose,
  weaponId,
}: {
  pose: Pose;
  weaponId: string | null;
}) {
  const id = useId().replace(/:/g, ''),
    f = WARDEN_FRAMES[pose],
    [x, y, w, h] = f.bounds;
  return (
    <svg
      className={`sprite-art palace-actor pose-${pose}`}
      viewBox="0 0 384 384"
      overflow="visible"
      aria-hidden="true"
      data-hero="warden"
      shapeRendering="crispEdges"
    >
      <defs>
        <clipPath id={`warden-${id}`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
        <PalaceCutout id={`warden-alpha-${id}`} bounds={f.bounds} />
        <clipPath id={`warden-hand-${id}`}>
          <rect x={f.hand[0] - 20} y={f.hand[1] - 17} width={40} height={34} />
        </clipPath>
      </defs>
      <g
        transform={`translate(192 364) scale(.678) translate(${-f.feet[0]} ${-f.feet[1]})`}
      >
        <image
          href="/art/pronoun-palace/warden-poses.png"
          width={1536}
          height={1024}
          clipPath={`url(#warden-${id})`}
          filter={`url(#warden-alpha-${id})`}
        />
        <g
          transform={`translate(${f.hand[0]} ${f.hand[1]}) scale(${1 / 0.678})`}
        >
          <HeldWeaponArt weaponId={weaponId} hand={[0, 0]} angle={f.angle} />
        </g>
        <image
          href="/art/pronoun-palace/warden-poses.png"
          width={1536}
          height={1024}
          clipPath={`url(#warden-hand-${id})`}
          filter={`url(#warden-alpha-${id})`}
        />
      </g>
    </svg>
  );
}

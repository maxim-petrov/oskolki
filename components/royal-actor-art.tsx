'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
type Region = { crop: number[]; anchor: number[] };
const FRAMES: Record<'hero' | 'rival', Record<Pose, Region>> = {
  hero: {
    idle: { crop: [31, 57, 275, 306], anchor: [200, 357] },
    windup: { crop: [369, 38, 240, 327], anchor: [511, 357] },
    strike: { crop: [669, 96, 401, 267], anchor: [790, 357] },
    guard: { crop: [41, 394, 232, 301], anchor: [174, 689] },
    hurt: { crop: [383, 396, 239, 303], anchor: [506, 694] },
    death: { crop: [672, 457, 303, 247], anchor: [823, 695] },
  },
  rival: {
    idle: { crop: [19, 750, 276, 285], anchor: [192, 1028] },
    windup: { crop: [389, 720, 219, 314], anchor: [495, 1028] },
    strike: { crop: [666, 760, 403, 273], anchor: [785, 1028] },
    guard: { crop: [54, 1092, 231, 290], anchor: [178, 1375] },
    hurt: { crop: [369, 1085, 258, 320], anchor: [500, 1380] },
    death: { crop: [692, 1137, 370, 250], anchor: [872, 1380] },
  },
};
export function RoyalActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, ''),
    region = FRAMES[hero ? 'hero' : 'rival'][pose];
  const [x, y, w, h] = region.crop,
    [ax, ay] = region.anchor,
    size = 350;
  const mirrored = !hero && (pose === 'strike' || pose === 'hurt');
  return (
    <svg
      className={`sprite-art royal-actor art-${hero ? 'wanderer' : 'guardian'} pose-${pose}`}
      viewBox={`${ax - size / 2} ${ay - size + 20} ${size} ${size}`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`royal-crop-${id}`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
        <filter
          id={`royal-matte-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={w}
          height={h}
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -10 -10 -10 0 27"
          />
        </filter>
      </defs>
      <g
        transform={mirrored ? `translate(${2 * ax} 0) scale(-1 1)` : undefined}
      >
        <g clipPath={`url(#royal-crop-${id})`}>
          <image
            href="/art/royal/actors.png"
            width={1086}
            height={1448}
            filter={`url(#royal-matte-${id})`}
          />
        </g>
      </g>
    </svg>
  );
}

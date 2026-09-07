'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
type Region = { crop: number[]; anchor: number[] };
// Measured bounds and feet anchors preserve full weapons across each pose.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Region>> = {
  hero: {
    idle: { crop: [70, 118, 216, 255], anchor: [188.0, 371] },
    windup: { crop: [373, 96, 218, 277], anchor: [504.0, 371] },
    strike: { crop: [707, 130, 368, 243], anchor: [799.0, 371] },
    guard: { crop: [75, 449, 221, 231], anchor: [166.0, 678] },
    hurt: { crop: [369, 423, 236, 257], anchor: [534.5, 678] },
    death: { crop: [703, 528, 357, 156], anchor: [879.5, 682] },
  },
  rival: {
    idle: { crop: [41, 786, 247, 245], anchor: [179.0, 1029] },
    windup: { crop: [392, 747, 212, 285], anchor: [482.0, 1030] },
    strike: { crop: [652, 797, 325, 235], anchor: [885.5, 1030] },
    guard: { crop: [80, 1104, 203, 233], anchor: [185.0, 1335] },
    hurt: { crop: [356, 1080, 245, 258], anchor: [456.5, 1336] },
    death: { crop: [687, 1212, 362, 134], anchor: [900.5, 1344] },
  },
};
export function PixelActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const {
    crop: [x, y, w, h],
    anchor: [ax, ay],
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  const size = 310;
  const mirrored = !hero && (pose === 'windup' || pose === 'hurt');
  return (
    <svg
      className={`sprite-art pixel-actor art-${hero ? 'wanderer' : 'guardian'} pose-${pose}`}
      viewBox={`${ax - size / 2} ${ay - size + 20} ${size} ${size}`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`pixel-crop-${id}`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
        <filter
          id={`pixel-matte-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={w}
          height={h}
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -50 -50 -50 0 148"
          />
        </filter>
      </defs>
      <g
        transform={mirrored ? `translate(${2 * ax} 0) scale(-1 1)` : undefined}
      >
        <g clipPath={`url(#pixel-crop-${id})`}>
          <image
            href="/art/pixel/actors.png"
            width={1086}
            height={1448}
            filter={`url(#pixel-matte-${id})`}
          />
        </g>
      </g>
    </svg>
  );
}

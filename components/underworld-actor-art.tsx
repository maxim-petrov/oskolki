'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';

type Rect = [number, number, number, number];
type Frame = { crop: Rect; feet: [number, number]; cutout?: Rect };
// Native PNG remains intact. Fixed source scale and measured body pivots
// prevent weapon length from changing the size or ground position of a pose.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [19, 53, 254, 308], feet: [150, 358] },
    windup: { crop: [354, 17, 255, 346], feet: [485, 360] },
    strike: { crop: [630, 117, 387, 244], feet: [751, 358] },
    guard: { crop: [18, 419, 269, 283], feet: [154, 699] },
    hurt: { crop: [368, 412, 259, 288], feet: [525, 698] },
    death: { crop: [655, 583, 363, 136], feet: [835, 697] },
  },
  rival: {
    idle: { crop: [18, 732, 299, 363], feet: [154, 1093] },
    windup: {
      crop: [338, 738, 283, 347],
      feet: [506, 1083],
      cutout: [584, 898, 37, 36],
    },
    strike: {
      crop: [593, 834, 419, 246],
      feet: [890, 1078],
      cutout: [593, 940, 37, 140],
    },
    guard: { crop: [19, 1122, 311, 349], feet: [156, 1468] },
    hurt: {
      crop: [356, 1129, 316, 337],
      feet: [509, 1464],
      cutout: [628, 1428, 44, 38],
    },
    death: { crop: [633, 1365, 379, 110], feet: [860, 1459] },
  },
};

export function UnderworldActorArt({
  hero,
  pose,
}: {
  hero: boolean;
  pose: Pose;
}) {
  const id = useId().replace(/:/g, '');
  const {
    crop: [x, y, width, height],
    feet: [ax, ay],
    cutout,
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg
      className={`sprite-art underworld-actor pose-${pose}`}
      viewBox={`${ax - 192} ${ay - 364} 384 384`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`underworld-frame-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        {cutout && (
          <mask
            id={`underworld-gap-${id}`}
            maskUnits="userSpaceOnUse"
            x={x}
            y={y}
            width={width}
            height={height}
          >
            <rect x={x} y={y} width={width} height={height} fill="white" />
            <rect
              x={cutout[0]}
              y={cutout[1]}
              width={cutout[2]}
              height={cutout[3]}
              fill="black"
            />
          </mask>
        )}
        <filter
          id={`underworld-alpha-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={width}
          height={height}
          colorInterpolationFilters="sRGB"
        >
          {/* Remove faint export haze while retaining smooth painted edges. */}
          <feComponentTransfer>
            <feFuncA
              type="linear"
              slope={1.0450819672}
              intercept={-0.0327868852}
            />
          </feComponentTransfer>
        </filter>
      </defs>
      <g
        clipPath={`url(#underworld-frame-${id})`}
        mask={cutout ? `url(#underworld-gap-${id})` : undefined}
      >
        <image
          href="/art/underworld/actors.png"
          width={1024}
          height={1536}
          filter={`url(#underworld-alpha-${id})`}
        />
      </g>
    </svg>
  );
}

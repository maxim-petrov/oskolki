'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';

type Rect = [number, number, number, number];
type Frame = { crop: Rect; feet: [number, number]; cutout?: Rect };
// Native source coordinates: x/y/width/height, plus the body's ground pivot.
// Fixed source scale keeps the body steady when a weapon extends the bounds.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [15, 70, 225, 276], feet: [142, 330] },
    windup: { crop: [337, 81, 254, 251], feet: [461, 330] },
    strike: { crop: [614, 122, 395, 211], feet: [728, 331] },
    guard: { crop: [20, 448, 269, 262], feet: [145, 696] },
    hurt: { crop: [343, 443, 286, 259], feet: [519, 696] },
    death: { crop: [685, 551, 317, 171], feet: [850, 708] },
  },
  rival: {
    idle: { crop: [15, 807, 258, 276], feet: [171, 1079] },
    windup: {
      crop: [344, 753, 305, 327],
      feet: [497, 1078],
      cutout: [628, 940, 24, 111],
    },
    strike: {
      crop: [630, 849, 379, 232],
      feet: [909, 1079],
      cutout: [628, 845, 24, 47],
    },
    guard: { crop: [35, 1142, 238, 290], feet: [156, 1430] },
    hurt: { crop: [337, 1144, 299, 288], feet: [426, 1430] },
    death: { crop: [686, 1288, 316, 192], feet: [850, 1441] },
  },
};

export function MidnightActorArt({
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
      className={`sprite-art midnight-actor pose-${pose}`}
      viewBox={`${ax - 192} ${ay - 364} 384 384`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`midnight-frame-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        {cutout && (
          <mask
            id={`midnight-gap-${id}`}
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
          id={`midnight-alpha-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={width}
          height={height}
          colorInterpolationFilters="sRGB"
        >
          {/* Discard export haze below 1/8 alpha without editing the native PNG. */}
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
      <g
        clipPath={`url(#midnight-frame-${id})`}
        mask={cutout ? `url(#midnight-gap-${id})` : undefined}
      >
        <image
          href="/art/midnight/actors.png"
          width={1024}
          height={1536}
          filter={`url(#midnight-alpha-${id})`}
        />
      </g>
    </svg>
  );
}

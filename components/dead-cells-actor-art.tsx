'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';

type Rect = [number, number, number, number];
type Frame = { crop: Rect; feet: [number, number]; polygon?: string };
// Measured on the native atlas. Fixed source scale and a ground pivot keep
// the body stable while long weapons and their effects extend past the body.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [35, 59, 225, 296], feet: [141.36, 354] },
    windup: { crop: [374, 38, 216, 317], feet: [463.91, 354] },
    strike: { crop: [649, 82, 358, 273], feet: [752.36, 354] },
    guard: { crop: [42, 410, 230, 294], feet: [137.29, 703] },
    hurt: { crop: [349, 446, 263, 258], feet: [480.59, 703] },
    death: { crop: [658, 609, 343, 108], feet: [790.5, 706] },
  },
  rival: {
    idle: { crop: [10, 773, 314, 317], feet: [187.31, 1090] },
    windup: {
      crop: [366, 744, 298, 342],
      feet: [464.63, 1085],
      polygon: '366,744 645,744 664,835 636.5,836 617,932 645,1086 366,1086',
    },
    strike: {
      crop: [623, 786, 385, 298],
      feet: [892, 1081],
      polygon: '645,744 664,835 636.5,836 617,932 645,1085 1008,1085 1008,744',
    },
    guard: { crop: [48, 1145, 267, 307], feet: [179.34, 1449] },
    hurt: { crop: [348, 1156, 282, 297], feet: [473.06, 1451] },
    death: { crop: [642, 1278, 363, 204], feet: [860.5, 1432] },
  },
};

export function DeadCellsActorArt({
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
    polygon,
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg
      className={`sprite-art deadcells-actor pose-${pose}`}
      viewBox={`${ax - 192} ${ay - 364} 384 384`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`deadcells-frame-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        {polygon && (
          <clipPath id={`deadcells-separate-${id}`}>
            <polygon points={polygon} />
          </clipPath>
        )}
        <filter
          id={`deadcells-alpha-${id}`}
          filterUnits="userSpaceOnUse"
          x={x}
          y={y}
          width={width}
          height={height}
          colorInterpolationFilters="sRGB"
        >
          {/* Remove faint export residue and keep the original bright pixel edges. */}
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
      <g clipPath={`url(#deadcells-frame-${id})`}>
        <image
          href="/art/dead-cells/actors.png"
          width={1024}
          height={1536}
          clipPath={polygon ? `url(#deadcells-separate-${id})` : undefined}
          filter={`url(#deadcells-alpha-${id})`}
        />
      </g>
    </svg>
  );
}

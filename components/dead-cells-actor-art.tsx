'use client';
import { useId } from 'react';
import { DeadCellsCutout } from '@/components/dead-cells-cutout';
import type { Pose } from '@/game/motion';

type Rect = [number, number, number, number];
type Frame = { crop: Rect; feet: [number, number]; polygon?: string };
// Measured on the native atlas. Fixed source scale and a ground pivot keep
// the body stable while long weapons and their effects extend past the body.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [30, 80, 234, 310], feet: [150, 385] },
    windup: { crop: [367, 72, 225, 318], feet: [466, 385] },
    strike: { crop: [638, 114, 370, 276], feet: [750, 385] },
    guard: { crop: [28, 448, 256, 298], feet: [148, 740] },
    hurt: { crop: [354, 480, 255, 266], feet: [478, 740] },
    death: { crop: [642, 627, 345, 131], feet: [813, 744] },
  },
  rival: {
    idle: { crop: [9, 810, 323, 333], feet: [188, 1137] },
    windup: {
      crop: [354, 783, 299, 360],
      feet: [464, 1137],
      polygon: '354,783 653,783 653,942 621,942 621,1143 354,1143',
    },
    strike: {
      crop: [618, 845, 385, 298],
      feet: [883, 1137],
      polygon: '653,845 1003,845 1003,1143 618,1143 618,942 653,942',
    },
    guard: { crop: [49, 1161, 270, 294], feet: [180, 1450] },
    hurt: { crop: [340, 1168, 284, 288], feet: [470, 1450] },
    death: { crop: [626, 1285, 373, 197], feet: [823, 1440] },
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
      shapeRendering="crispEdges"
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
        <DeadCellsCutout
          id={`deadcells-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <g clipPath={`url(#deadcells-frame-${id})`}>
        <image
          href="/art/dead-cells/actors-pixel.png"
          width={1024}
          height={1536}
          clipPath={polygon ? `url(#deadcells-separate-${id})` : undefined}
          filter={`url(#deadcells-alpha-${id})`}
        />
      </g>
    </svg>
  );
}

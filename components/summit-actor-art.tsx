'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
import { SummitCutout } from '@/components/summit-cutout';

type Frame = {
  crop: [number, number, number, number];
  feet: [number, number];
};
// Native pixel coordinates and body ground anchors, including detached effects.
// All poses share a fixed source scale so a raised weapon never shrinks the body.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [64, 153, 232, 223], feet: [194, 376] },
    windup: { crop: [407, 120, 200, 257], feet: [522, 377] },
    strike: { crop: [699, 171, 291, 206], feet: [812, 377] },
    guard: { crop: [63, 500, 244, 220], feet: [188, 720] },
    hurt: { crop: [398, 502, 231, 217], feet: [557, 719] },
    death: { crop: [704, 589, 298, 136], feet: [813, 725] },
  },
  rival: {
    idle: { crop: [56, 878, 204, 235], feet: [176, 1113] },
    windup: { crop: [412, 830, 190, 287], feet: [507, 1117] },
    strike: { crop: [680, 884, 287, 227], feet: [870, 1111] },
    guard: { crop: [64, 1218, 195, 238], feet: [172, 1456] },
    hurt: { crop: [399, 1233, 218, 220], feet: [501, 1453] },
    death: { crop: [718, 1325, 282, 137], feet: [824, 1453] },
  },
};

export function SummitActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const {
    crop: [x, y, width, height],
    feet: [ax, ay],
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg
      className={`sprite-art summit-actor pose-${pose}`}
      viewBox={`${ax - 192} ${ay - 364} 384 384`}
      overflow="visible"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`summit-frame-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <SummitCutout
          id={`summit-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/summit/actors.png"
        width={1024}
        height={1536}
        clipPath={`url(#summit-frame-${id})`}
        filter={`url(#summit-alpha-${id})`}
      />
    </svg>
  );
}

'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
import { BasementCutout } from '@/components/basement-cutout';

type Frame = { crop: [number, number, number, number]; feet: [number, number] };
// Native pixel coordinates and body ground anchors, including detached effects.
// All poses share a fixed source scale so a raised weapon never shrinks the body.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [98, 100, 179, 278], feet: [175, 376] },
    windup: { crop: [368, 44, 242, 335], feet: [477, 377] },
    strike: { crop: [696, 121, 303, 258], feet: [789, 377] },
    guard: { crop: [72, 469, 206, 262], feet: [159, 729] },
    hurt: { crop: [344, 454, 306, 277], feet: [491, 729] },
    death: { crop: [674, 572, 321, 173], feet: [829, 743] },
  },
  rival: {
    idle: { crop: [72, 812, 213, 284], feet: [179, 1094] },
    windup: { crop: [364, 803, 247, 293], feet: [498, 1094] },
    strike: { crop: [690, 820, 278, 276], feet: [861, 1094] },
    guard: { crop: [63, 1191, 223, 267], feet: [181, 1456] },
    hurt: { crop: [392, 1168, 274, 299], feet: [528, 1465] },
    death: { crop: [682, 1293, 317, 182], feet: [840, 1473] },
  },
};

export function BasementActorArt({
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
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg
      className={`sprite-art basement-actor pose-${pose}`}
      viewBox={`${ax - 192} ${ay - 364} 384 384`}
      overflow="visible"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`basement-frame-${id}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <BasementCutout
          id={`basement-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/basement/actors.png"
        width={1024}
        height={1536}
        clipPath={`url(#basement-frame-${id})`}
        filter={`url(#basement-alpha-${id})`}
      />
    </svg>
  );
}

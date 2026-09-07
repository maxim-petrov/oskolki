'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';

type Frame = {
  bounds: [number, number, number, number];
  feet: [number, number];
  outline?: string;
};

// Atlas-space bounds and ground anchors. Preserve the source alpha and isolate
// the two crossing spear poses with polygons instead of rectangular grid cuts.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { bounds: [28, 32, 276, 343], feet: [159, 368] },
    windup: { bounds: [350, 21, 285, 354], feet: [476, 368] },
    strike: { bounds: [658, 55, 358, 320], feet: [776, 368] },
    guard: { bounds: [22, 398, 266, 336], feet: [159, 726] },
    hurt: { bounds: [349, 413, 287, 321], feet: [515, 726] },
    death: { bounds: [658, 557, 348, 210], feet: [841, 759] },
  },
  rival: {
    idle: { bounds: [29, 790, 270, 325], feet: [175, 1107] },
    windup: {
      bounds: [342, 788, 315, 327], feet: [483, 1107],
      outline: '342,788 657,788 657,965 575,973 582,1115 342,1115',
    },
    strike: {
      bounds: [575, 827, 424, 288], feet: [871, 1107],
      outline: '660,827 999,827 999,1115 677,1115 677,1067 575,1067 575,976 660,976',
    },
    guard: { bounds: [13, 1162, 277, 320], feet: [177, 1474] },
    hurt: { bounds: [346, 1152, 312, 330], feet: [500, 1474] },
    death: { bounds: [651, 1275, 354, 225], feet: [840, 1492] },
  },
};

export function PaperActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const { bounds: [x, y, width, height], feet: [ax, ay], outline } =
    FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg
      className={`sprite-art paper-actor pose-${pose}`}
      viewBox={`${ax - 180} ${ay - 342} 360 360`}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`paper-frame-${id}`}>
          {outline ? <polygon points={outline} /> : <rect x={x} y={y} width={width} height={height} />}
        </clipPath>
      </defs>
      <image
        href="/art/paper/actors.png"
        width={1024}
        height={1536}
        clipPath={`url(#paper-frame-${id})`}
      />
    </svg>
  );
}

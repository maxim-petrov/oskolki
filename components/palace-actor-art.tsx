'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
import { PalaceCutout } from '@/components/palace-cutout';

type Frame = {
  crop: [number, number, number, number];
  feet: [number, number];
  exclude?: [number, number, number, number];
};
// Native pixel coordinates and body ground anchors, including detached effects.
// All poses share a fixed source scale so a raised weapon never shrinks the body.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [86, 42, 180, 342], feet: [153.8, 384] },
    windup: { crop: [374, 83, 224, 301], feet: [463.2, 384] },
    strike: { crop: [672, 121, 332, 263], feet: [775.7, 384] },
    guard: { crop: [59, 444, 213, 297], feet: [139.4, 741] },
    hurt: { crop: [391, 471, 212, 270], feet: [484.6, 741] },
    death: { crop: [645, 626, 360, 134], feet: [780, 741] },
  },
  rival: {
    idle: { crop: [40, 797, 247, 308], feet: [152.9, 1105] },
    windup: {
      crop: [354, 799, 266, 306],
      feet: [489.2, 1105],
      exclude: [618, 900, 2, 11],
    },
    strike: {
      crop: [618, 799, 356, 329],
      feet: [915.4, 1128],
      exclude: [618, 941, 2, 21],
    },
    guard: { crop: [32, 1162, 223, 302], feet: [156.3, 1464] },
    hurt: { crop: [343, 1165, 296, 299], feet: [523, 1464] },
    death: { crop: [657, 1283, 348, 199], feet: [862.5, 1482] },
  },
};

export function PalaceActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const {
    crop: [x, y, width, height],
    feet: [ax, ay],
    exclude,
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg
      className={`sprite-art palace-actor pose-${pose}`}
      viewBox={`${ax - 192} ${ay - 364} 384 384`}
      overflow="visible"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`palace-frame-${id}`}>
          <path
            clipRule="evenodd"
            d={`M${x} ${y}h${width}v${height}h${-width}Z${exclude ? ` M${exclude[0]} ${exclude[1]}h${exclude[2]}v${exclude[3]}h${-exclude[2]}Z` : ''}`}
          />
        </clipPath>
        <PalaceCutout
          id={`palace-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
      </defs>
      <image
        href="/art/pronoun-palace/actors.png"
        width={1024}
        height={1536}
        clipPath={`url(#palace-frame-${id})`}
        filter={`url(#palace-alpha-${id})`}
      />
    </svg>
  );
}

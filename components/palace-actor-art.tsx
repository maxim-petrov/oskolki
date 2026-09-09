'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';
import { PalaceCutout } from '@/components/palace-cutout';
import { HeldWeaponArt } from '@/components/held-weapon-art';
import heroArt from '@/game/hero-art.json';

type Frame = {
  crop: [number, number, number, number];
  feet: [number, number];
  exclude?: [number, number, number, number] | string;
  hand?: [number, number];
  angle?: number;
  handClip?: [number, number, number, number];
};
// Native pixel coordinates and body ground anchors, including detached effects.
// All poses share a fixed source scale so a raised weapon never shrinks the body.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: heroArt.frames as Record<Pose, Frame>,
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

export function PalaceActorArt({
  hero,
  pose,
  weaponId = 'gear-cutter',
}: {
  hero: boolean;
  pose: Pose;
  weaponId?: string | null;
}) {
  const id = useId().replace(/:/g, '');
  const {
    crop: [x, y, width, height],
    feet: [ax, ay],
    exclude,
    hand,
    angle,
    handClip,
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  const src = hero ? heroArt.src : '/art/pronoun-palace/actors.png';
  const sourceWidth = hero ? heroArt.width : 1024;
  const sourceHeight = hero ? heroArt.height : 1536;
  const excludedPath =
    typeof exclude === 'string'
      ? exclude
      : exclude
        ? `M${exclude[0]} ${exclude[1]}h${exclude[2]}v${exclude[3]}h${-exclude[2]}Z`
        : '';
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
            d={`M${x} ${y}h${width}v${height}h${-width}Z ${excludedPath}`}
          />
        </clipPath>
        <PalaceCutout
          id={`palace-alpha-${id}`}
          bounds={[x, y, width, height]}
        />
        {hero && (
          <>
            {/* The native edit supplies the colors, the existing RGBA source
                supplies the silhouette. Keep both source bitmaps untouched. */}
            <filter
              id={`palace-body-alpha-${id}`}
              filterUnits="userSpaceOnUse"
              x={x}
              y={y}
              width={width}
              height={height}
              colorInterpolationFilters="sRGB"
            >
              <feComponentTransfer>
                <feFuncA type="discrete" tableValues="0 1" />
              </feComponentTransfer>
              <feMorphology operator="erode" radius="2" />
            </filter>
            <mask
              id={`palace-body-mask-${id}`}
              maskUnits="userSpaceOnUse"
              x={x}
              y={y}
              width={width}
              height={height}
              style={{ maskType: 'alpha' }}
            >
              <image
                href={heroArt.maskSrc}
                width={1024}
                height={1536}
                filter={`url(#palace-body-alpha-${id})`}
                clipPath={`url(#palace-frame-${id})`}
              />
            </mask>
          </>
        )}
        {handClip && (
          <clipPath id={`palace-hand-${id}`}>
            <rect
              x={handClip[0]}
              y={handClip[1]}
              width={handClip[2]}
              height={handClip[3]}
            />
          </clipPath>
        )}
      </defs>
      <image
        href={src}
        width={sourceWidth}
        height={sourceHeight}
        clipPath={`url(#palace-frame-${id})`}
        filter={`url(#palace-alpha-${id})`}
        mask={hero ? `url(#palace-body-mask-${id})` : undefined}
      />
      {hero && hand && (
        <>
          <HeldWeaponArt weaponId={weaponId} hand={hand} angle={angle ?? 0} />
          {/* Draw the original fingers over the grip, keeping the weapon in the fist. */}
          <image
            href={src}
            width={sourceWidth}
            height={sourceHeight}
            clipPath={`url(#palace-hand-${id})`}
            filter={`url(#palace-alpha-${id})`}
            mask={`url(#palace-body-mask-${id})`}
          />
        </>
      )}
    </svg>
  );
}

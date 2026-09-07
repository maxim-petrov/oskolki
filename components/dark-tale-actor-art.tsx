'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';

type Frame = { crop: [number, number, number, number]; feet: [number, number]; outline?: string };
// Source coordinates, exclusive right/bottom. Keep scale fixed across poses;
// center on the body's ground anchor, never on the weapon-inclusive bounds.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { crop: [26, 90, 295, 373], feet: [136, 369] },
    windup: { crop: [372, 22, 594, 373], feet: [492, 369] },
    strike: { crop: [649, 132, 1013, 373], feet: [743, 369] },
    guard: { crop: [26, 454, 235, 726], feet: [135, 722] },
    hurt: { crop: [365, 472, 597, 732], feet: [516, 722] },
    death: { crop: [658, 619, 1010, 744], feet: [820, 726] },
  },
  rival: {
    idle: { crop: [26, 785, 289, 1117], feet: [204, 1113] },
    windup: { crop: [361, 757, 601, 1119], feet: [512, 1114] },
    strike: { crop: [621, 853, 998, 1121], feet: [898, 1116] },
    guard: { crop: [56, 1142, 289, 1498], feet: [197, 1494] },
    hurt: { crop: [333, 1182, 665, 1498], feet: [499, 1494], outline: '333,1182 665,1182 665,1365 615,1365 615,1498 333,1498' },
    death: { crop: [633, 1372, 998, 1518], feet: [855, 1499] },
  },
};

export function DarkTaleActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const { crop: [x, y, right, bottom], feet: [ax, ay], outline } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg className={`sprite-art dark-tale-actor pose-${pose}`} viewBox={`${ax - 192} ${ay - 364} 384 384`} overflow="visible" aria-hidden="true">
      <defs>
        <clipPath id={`dark-frame-${id}`}>
          {outline ? <polygon points={outline} /> : <rect x={x} y={y} width={right - x} height={bottom - y} />}
        </clipPath>
        <filter id={`dark-alpha-${id}`} filterUnits="userSpaceOnUse" x={x} y={y} width={right - x} height={bottom - y} colorInterpolationFilters="sRGB">
          {/* Alpha-test discards 1–2/255 export haze; the native PNG stays intact. */}
          <feComponentTransfer><feFuncA type="discrete" tableValues="0 1 1 1 1 1 1 1" /></feComponentTransfer>
        </filter>
      </defs>
      <g clipPath={`url(#dark-frame-${id})`}>
        <image href="/art/dark-tale/actors.png" width={1024} height={1536} filter={`url(#dark-alpha-${id})`} />
      </g>
    </svg>
  );
}

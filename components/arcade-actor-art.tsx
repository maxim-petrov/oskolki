'use client';
import type { Pose } from '@/game/motion';
import { ArcadeRaster } from '@/components/arcade-raster';
type Frame = { crop: [number, number, number, number]; feet: [number, number] };
// Measured source bounds retain fists beyond nominal cells. Fixed ground
// anchors and a shared 64x48 backing grid keep every pose at the same scale.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: {
      crop: [23, 51, 241, 344],
      feet: [139.25, 395],
    },
    windup: {
      crop: [347, 52, 268, 344],
      feet: [475.0, 396],
    },
    strike: {
      crop: [670, 60, 340, 336],
      feet: [804.75, 396],
    },
    guard: {
      crop: [23, 427, 238, 328],
      feet: [137.0, 755],
    },
    hurt: {
      crop: [329, 431, 287, 325],
      feet: [505.5, 756],
    },
    death: {
      crop: [633, 605, 373, 151],
      feet: [819.5, 756],
    },
  },
  rival: {
    idle: {
      crop: [41, 788, 254, 328],
      feet: [174.0, 1116],
    },
    windup: {
      crop: [359, 787, 272, 330],
      feet: [500.75, 1117],
    },
    strike: {
      crop: [653, 788, 353, 330],
      feet: [884.0, 1118],
    },
    guard: {
      crop: [30, 1145, 259, 336],
      feet: [160.25, 1481],
    },
    hurt: {
      crop: [329, 1146, 295, 334],
      feet: [453.0, 1480],
    },
    death: {
      crop: [635, 1335, 370, 144],
      feet: [820.0, 1479],
    },
  },
};
export function ArcadeActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const {
    crop,
    feet: [x, y],
  } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <ArcadeRaster
      src="/art/arcade/actors-pixel.png"
      crop={crop}
      frame={[x - 256, y - 360, 512, 384]}
      width={64}
      height={48}
      className={`sprite-art arcade-actor pose-${pose}`}
      style={{
        width: '133.333333%',
        maxWidth: 'none',
        height: '100%',
        marginLeft: '-16.666667%',
      }}
    />
  );
}

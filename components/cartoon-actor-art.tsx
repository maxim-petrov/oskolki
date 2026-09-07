'use client';
import { useId } from 'react';
import type { Pose } from '@/game/motion';

type Frame = { bounds: [number, number, number, number]; feet: [number, number] };
// Source-space bounds include the entire weapon and effect, even across grid
// boundaries. A fixed scale and body-centered ground anchor prevent pose jumps.
const FRAMES: Record<'hero' | 'rival', Record<Pose, Frame>> = {
  hero: {
    idle: { bounds: [27, 95, 244, 284], feet: [153, 376] },
    windup: { bounds: [352, 12, 266, 368], feet: [485, 377] },
    strike: { bounds: [645, 140, 369, 238], feet: [747, 375] },
    guard: { bounds: [35, 441, 283, 293], feet: [144, 731] },
    hurt: { bounds: [330, 430, 309, 303], feet: [508, 730] },
    death: { bounds: [662, 596, 350, 164], feet: [818, 714] },
  },
  rival: {
    idle: { bounds: [8, 852, 290, 292], feet: [182, 1141] },
    windup: { bounds: [387, 754, 240, 390], feet: [507, 1141] },
    strike: { bounds: [648, 861, 364, 282], feet: [888, 1140] },
    guard: { bounds: [29, 1209, 259, 293], feet: [160, 1499] },
    hurt: { bounds: [347, 1172, 298, 332], feet: [493, 1501] },
    death: { bounds: [675, 1351, 338, 173], feet: [838, 1490] },
  },
};

// Render original alpha atlas regions; animation timing still belongs to motion.ts.
export function CartoonActorArt({ hero, pose }: { hero: boolean; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const { bounds: [x, y, width, height], feet: [ax, ay] } = FRAMES[hero ? 'hero' : 'rival'][pose];
  return (
    <svg className={`sprite-art cartoon-actor pose-${pose}`} viewBox={`${ax - 180} ${ay - 342} 360 360`} overflow="visible" aria-hidden="true">
      <defs><clipPath id={`cartoon-frame-${id}`}><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
      <image href="/art/cartoon/actors.png" width={1024} height={1536} clipPath={`url(#cartoon-frame-${id})`} />
    </svg>
  );
}

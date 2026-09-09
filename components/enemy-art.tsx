'use client';
import { useId } from 'react';
import type { Enemy } from '@/game/engine';
import type { Pose } from '@/game/motion';
import { PalaceActorArt } from '@/components/palace-actor-art';
import { PalaceCutout } from '@/components/palace-cutout';
import sources from '@/game/enemy-art.json';

type EnemyArtSource = {
  src: string;
  width: number;
  height: number;
  bounds: number[];
};
const art = sources as Record<string, EnemyArtSource>;
// Native transparent bitmaps stay unchanged. Align measured silhouettes to the
// same ground plane and use the combat frame's anticipation/impact poses.
export function EnemyArt({ enemy, pose }: { enemy: Enemy; pose: Pose }) {
  const id = useId().replace(/:/g, '');
  const source = art[enemy.kind];
  if (!source) return <PalaceActorArt hero={false} pose={pose} />;
  const [x, y, width, height] = source.bounds;
  const boss = ['censor', 'tide-keeper'].includes(enemy.kind);
  const scale = Math.min(
    (boss ? 354 : 314) / width,
    (boss ? 326 : 286) / height,
  );
  const transform = {
    idle: '',
    windup: 'translate(10 0) rotate(5 192 364)',
    strike: 'translate(-18 0) rotate(-7 192 364)',
    guard:
      'translate(8 18) translate(192 346) scale(.94 .94) translate(-192 -346)',
    hurt: 'translate(12 0) rotate(7 192 364)',
    death:
      'translate(0 30) translate(192 334) scale(1 .42) translate(-192 -334)',
  }[pose];
  return (
    <svg
      className={`sprite-art cellar-enemy-art pose-${pose}`}
      viewBox="0 0 384 384"
      overflow="visible"
      shapeRendering="crispEdges"
      aria-hidden="true"
      data-enemy-kind={enemy.kind}
    >
      <defs>
        <PalaceCutout
          id={`enemy-alpha-${id}`}
          bounds={[0, 0, source.width, source.height]}
        />
      </defs>
      <g transform={transform}>
        <g
          transform={`translate(192 364) scale(${scale}) translate(${-x - width / 2} ${-y - height})`}
        >
          <image
            href={source.src}
            width={source.width}
            height={source.height}
            filter={`url(#enemy-alpha-${id})`}
          />
        </g>
      </g>
    </svg>
  );
}

'use client';
import { useId } from 'react';
import { PalaceCutout } from '@/components/palace-cutout';
import { heldWeaponTransform, weaponArtById } from '@/game/weapon-art';

export function HeldWeaponArt({
  weaponId,
  hand,
  angle,
}: {
  weaponId: string | null;
  hand: [number, number];
  angle: number;
}) {
  const uid = useId().replace(/:/g, '');
  const weapon = weaponArtById(weaponId);
  const [x, y, width, height] = weapon.bounds;
  return (
    <g
      className="held-weapon"
      data-weapon-id={weapon.id}
      transform={heldWeaponTransform(weapon, hand, angle)}
    >
      <defs>
        <clipPath id={`held-weapon-${uid}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <PalaceCutout id={`held-alpha-${uid}`} bounds={weapon.bounds} />
      </defs>
      <image
        href={weapon.src}
        width={weapon.width}
        height={weapon.height}
        clipPath={`url(#held-weapon-${uid})`}
        filter={`url(#held-alpha-${uid})`}
        style={{ imageRendering: 'pixelated' }}
      />
    </g>
  );
}

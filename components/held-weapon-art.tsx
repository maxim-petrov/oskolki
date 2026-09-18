import { WeaponShape } from './vector-art';
export function HeldWeaponArt({
  weaponId,
  hand,
  angle,
}: {
  weaponId: string | null;
  hand: [number, number];
  angle: number;
}) {
  return (
    <g
      className="held-weapon"
      transform={`translate(${hand[0]} ${hand[1]}) rotate(${angle}) translate(-16 -28)`}
    >
      <WeaponShape id={weaponId} />
    </g>
  );
}

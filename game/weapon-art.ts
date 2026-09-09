import assets from './weapon-art.json';

export type WeaponArt = {
  src: string;
  width: number;
  height: number;
  bounds: [number, number, number, number];
  grip: [number, number];
  tip: [number, number];
  heldLength: number;
  miniature: {
    src: string;
    width: number;
    height: number;
    bounds: [number, number, number, number];
  };
};

export function weaponArtById(id: string | null | undefined) {
  const catalogue = assets as unknown as Record<string, WeaponArt>;
  const key = id && Object.hasOwn(catalogue, id) ? id : 'gear-cutter';
  return { id: key, ...catalogue[key] };
}

export function boardWeaponArtById(id: string | null | undefined) {
  const weapon = weaponArtById(id);
  return { id: weapon.id, ...weapon.miniature };
}

// Map the full sprite's measured grip to a pose's hand. The board uses a
// separate simplified miniature of the same ID; neither is saved in the run.
export function heldWeaponTransform(
  weapon: WeaponArt,
  hand: [number, number],
  angle: number,
) {
  const dx = weapon.tip[0] - weapon.grip[0];
  const dy = weapon.tip[1] - weapon.grip[1];
  const scale = weapon.heldLength / Math.hypot(dx, dy);
  const rotation = angle - (Math.atan2(dy, dx) * 180) / Math.PI;
  return `translate(${hand[0]} ${hand[1]}) rotate(${rotation}) scale(${scale}) translate(${-weapon.grip[0]} ${-weapon.grip[1]})`;
}

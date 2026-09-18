import type { Pose } from '@/game/motion';
import { VectorPerson, VectorEnemy } from './vector-art';
export function PalaceActorArt({
  hero,
  pose,
  weaponId = 'gear-cutter',
  unarmed = false,
}: {
  hero: boolean;
  pose: Pose;
  weaponId?: string | null;
  unarmed?: boolean;
}) {
  return hero ? (
    <VectorPerson pose={pose} weaponId={weaponId} unarmed={unarmed} />
  ) : (
    <VectorEnemy kind="raider" pose={pose} />
  );
}

import type { Pose } from '@/game/motion';
import { VectorPerson } from './vector-art';
export const WARDEN_FRAMES: Record<Pose, true> = {
  idle: true,
  windup: true,
  strike: true,
  guard: true,
  hurt: true,
  death: true,
};
export function WardenArt({
  pose,
  weaponId,
}: {
  pose: Pose;
  weaponId: string | null;
}) {
  return <VectorPerson kind="warden" pose={pose} weaponId={weaponId} />;
}

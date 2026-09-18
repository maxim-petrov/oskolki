import type { Enemy } from '@/game/engine';
import type { Pose } from '@/game/motion';
import { VectorEnemy } from './vector-art';
export function EnemyArt({ enemy, pose }: { enemy: Enemy; pose: Pose }) {
  return <VectorEnemy kind={enemy.kind} pose={pose} />;
}

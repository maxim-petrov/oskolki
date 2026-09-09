import {
  Sword,
  Shield,
  Sprout,
  Skull,
  Zap,
  Heart,
  Flame,
  Droplet,
  Gem,
} from 'lucide-react';
import { intent, ENEMY_CATALOG, type State, type Enemy } from '@/game/engine';

export function EnemyIntentLabel({
  state,
  enemy,
}: {
  state: State;
  enemy: Enemy;
}) {
  const action = intent(state, enemy);
  const Icon = {
    attack: Sword,
    pierce: Sword,
    block: Shield,
    roots: Sprout,
    poison: Skull,
    drain: Zap,
    ink: Droplet,
    siphon: Gem,
    heal: Heart,
    prepare: Flame,
  }[action.type];
  return (
    <span
      className={`enemy-intent intent-${action.type}`}
      title={ENEMY_CATALOG[enemy.kind].tactic}
    >
      <Icon size={14} aria-hidden="true" /> {action.text}
    </span>
  );
}

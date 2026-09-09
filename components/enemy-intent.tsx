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
import { intent, enemyTactic, type State, type Enemy } from '@/game/engine';

export function EnemyIntentLabel({
  state,
  enemy,
}: {
  state: State;
  enemy: Enemy;
}) {
  const action = intent(state, enemy);
  const Icon = {
    summon: Skull,
    rally: Flame,
    mend: Heart,
    lock: Shield,
    resize: Gem,
    redact: Gem,
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
      title={enemyTactic(state, enemy)}
    >
      <Icon size={14} aria-hidden="true" /> {action.text}
    </span>
  );
}

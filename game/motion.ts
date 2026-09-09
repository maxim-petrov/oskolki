import type { State, Frame, CombatCue } from './engine';
export type Actor = 'hero' | number;
export type Motion = {
  id: number;
  stage: 'windup' | 'impact' | 'recovery';
  duration: number;
  cue: CombatCue;
  before: State;
  after: State;
};
export type Pose = 'idle' | 'windup' | 'strike' | 'guard' | 'hurt' | 'death';
export function actorStats(s: State, actor: Actor) {
  if (actor === 'hero') return { hp: s.hp, block: s.block };
  const enemy = s.enemies.find((e) => e.id === actor);
  return { hp: enemy?.hp ?? 0, block: enemy?.block ?? 0 };
}
export function impactFor(m: Motion | null, actor: Actor) {
  if (!m || m.stage === 'windup')
    return { damage: 0, heal: 0, guard: 0, blocked: 0 };
  const a = actorStats(m.before, actor),
    b = actorStats(m.after, actor);
  return {
    damage: Math.max(0, a.hp - b.hp),
    heal: Math.max(0, b.hp - a.hp),
    guard: Math.max(0, b.block - a.block),
    blocked: Math.max(0, a.block - b.block),
  };
}
// Camera feedback follows the actual strike, including damage absorbed by block.
// It stays outside saved combat rules and never advances the seeded simulation.
export function bossShakeFor(m: Motion | null) {
  if (
    !m ||
    m.stage === 'windup' ||
    m.cue.type !== 'attack' ||
    m.cue.target !== 'hero' ||
    typeof m.cue.actor !== 'number'
  )
    return null;
  const attacker = m.before.enemies.find((e) => e.id === m.cue.actor);
  if (
    !attacker ||
    !['boss', 'censor', 'tide-keeper', 'redactor'].includes(attacker.kind)
  )
    return null;
  const hit = impactFor(m, 'hero');
  const force = m.cue.strength ?? hit.damage + hit.blocked;
  if (force < 10) return null;
  return {
    pixels: force >= 18 ? 12 : 8,
    duration: Math.min(320, Math.floor(m.duration * 0.65)),
  };
}
export function poseFor(s: State, m: Motion | null, actor: Actor): Pose {
  if (actorStats(s, actor).hp <= 0) return 'death';
  const effect = impactFor(m, actor);
  if (effect.damage) return 'hurt';
  if (effect.blocked || effect.guard) return 'guard';
  if (m?.cue.actor === actor) {
    if (m.cue.type === 'guard') return 'guard';
    if (m.cue.type === 'attack')
      return m.stage === 'windup'
        ? 'windup'
        : m.stage === 'impact'
          ? 'strike'
          : 'idle';
    if (m.cue.type === 'prepare') return 'windup';
    if (m.cue.type === 'cast' && m.stage === 'windup') return 'windup';
  }
  return actorStats(s, actor).block > 0 ? 'guard' : 'idle';
}
export function motionFor(
  before: State,
  frame: Frame,
  id: number,
  duration: number,
): Motion {
  return {
    id,
    stage: 'windup',
    duration,
    cue: frame.cue ?? { actor: 'hero', type: 'cast' },
    before,
    after: frame.state,
  };
}

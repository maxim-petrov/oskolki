'use client';
import type { CSSProperties } from 'react';
import { ActorArt } from './actor-art';
import { Shield, Sparkles } from 'lucide-react';
import { impactFor, poseFor, type Actor, type Motion } from '@/game/motion';
import type { State } from '@/game/engine';
export function CombatSprite({
  state,
  motion,
  actor,
}: {
  state: State;
  motion: Motion | null;
  actor: Actor;
}) {
  const pose = poseFor(state, motion, actor),
    effects = impactFor(motion, actor);
  const acting = motion?.cue.actor === actor;
  const hit = effects.damage > 0 || effects.blocked > 0;
  const kind = acting ? motion.cue.type : hit ? 'hit' : 'idle';
  const id = motion?.id ?? 0,
    stage = motion?.stage ?? 'idle';
  const guarding = pose === 'guard';
  return (
    <div
      className={`sprite-root ${actor === 'hero' ? 'hero-sprite' : 'enemy-sprite'} ${pose === 'death' ? 'is-dead' : ''}`}
      aria-hidden="true"
      style={{ '--beat': `${motion?.duration ?? 600}ms` } as CSSProperties}
    >
      <span className="sprite-ground" />
      <div
        key={id}
        className={`sprite-action action-${kind} stage-${stage} pose-${pose}`}
      >
        <ActorArt
          hero={actor === 'hero'}
          pose={pose}
          weaponId={state.equipment.weapon}
        />
        {guarding && (
          <div className={`ward ${effects.blocked ? 'ward-impact' : ''}`}>
            <Shield size={52} strokeWidth={1} />
            <i />
          </div>
        )}
        {acting && kind === 'cast' && (
          <div className={`spell-charge stage-${stage}`}>
            <Sparkles size={28} />
            <i />
            <b />
          </div>
        )}
        {acting && kind === 'heal' && <div className="heal-aura" />}
        {acting && kind === 'prepare' && <div className="rage-aura" />}
      </div>
      {stage !== 'windup' && hit && (
        <div
          key={`hit-${id}`}
          className={`impact-burst ${effects.blocked ? 'blocked-burst' : ''} ${motion?.cue.type === 'poison' ? 'poison-burst' : ''}`}
        >
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {stage !== 'windup' && acting && kind === 'attack' && (
        <div key={`slash-${id}`} className="sword-trail" />
      )}
      {stage !== 'windup' && (hit || effects.heal > 0 || effects.guard > 0) && (
        <div key={`number-${id}`} className="floating-results">
          {effects.damage > 0 && (
            <b
              className={
                motion?.cue.type === 'poison' ? 'poison-damage' : 'damage'
              }
            >
              −{effects.damage}
            </b>
          )}
          {effects.blocked > 0 && (
            <span className="blocked">
              <Shield size={15} />
              {effects.blocked}
            </span>
          )}
          {effects.heal > 0 && <b className="healing">+{effects.heal}</b>}
          {effects.guard > 0 && (
            <span className="guard-gain">
              <Shield size={15} />+{effects.guard}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

'use client';
import { VectorWeapon } from './vector-art';
import { WardenArt } from './warden-art';
import type { CSSProperties } from 'react';
import { EnemyArt } from './enemy-art';
import { bossPhase } from '@/game/engine';
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
  const companionAttack =
    motion &&
    motion.stage !== 'windup' &&
    motion.after.effectState?.events.some(
      (e) =>
        e.source === 'companion' &&
        e.kind === 'attack' &&
        e.effectId > (motion.before.effectState?.serial ?? 0),
    );
  const enemy =
    actor === 'hero' ? undefined : state.enemies.find((e) => e.id === actor);
  return (
    <div
      className={`sprite-root ${actor === 'hero' ? 'hero-sprite' : 'enemy-sprite'} ${pose === 'death' ? 'is-dead' : ''} ${enemy && ['censor', 'tide-keeper', 'redactor'].includes(enemy.kind) && bossPhase(enemy) === 2 ? 'boss-enraged' : ''}`}
      aria-hidden="true"
      style={{ '--beat': `${motion?.duration ?? 600}ms` } as CSSProperties}
    >
      <span className="sprite-ground" />
      <div
        key={id}
        className={`sprite-action action-${kind} stage-${stage} pose-${pose}`}
      >
        {enemy ? (
          <EnemyArt enemy={enemy} pose={pose} />
        ) : state.hero === 'warden' ? (
          <WardenArt pose={pose} weaponId={state.equipment.weapon} />
        ) : (
          <ActorArt
            hero={actor === 'hero'}
            pose={pose}
            weaponId={state.equipment.weapon}
          />
        )}
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
      {actor === 'hero' && state.relics.includes('defective-copy') && (
        <div
          className={`companion-figure ${companionAttack ? 'companion-strike' : ''}`}
          title={`Бракованная копия · ${state.effectState?.companion ?? 0}/3`}
        >
          <svg
            width="52"
            height="66"
            viewBox="0 0 52 66"
            fill="#e6eaf0"
            stroke="#293540"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <path d="M11 10h24l6 6v22H11Z M35 10v7h6 M18 38l-3 19h9l3-12 3 12h9l-4-19Z" />
            <path d="M17 23h4m8 0h4M21 30h8M11 39l-7 9m31-9 9 9" />
            <path d="m14 13 16-5" strokeDasharray="2 3" />
          </svg>
          <span className="companion-weapon">
            <VectorWeapon
              id={state.equipment.weapon ?? 'gear-cutter'}
              size={28}
            />
          </span>
        </div>
      )}
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

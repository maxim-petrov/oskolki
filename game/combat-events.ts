/** Logical events are saved separately from animation frames. Never drive rules from UI cues. */
export type EffectSource =
  | 'match'
  | 'skill'
  | 'companion'
  | 'repeat'
  | 'explosion'
  | 'reflection'
  | 'status'
  | 'resource';
export type EffectContext = {
  rootActionId: number;
  effectId: number;
  parentEffectId?: number;
  source: EffectSource;
  cause: string;
  wave: number;
  scope: 'action' | 'turn' | 'battle' | 'run';
  rulesVersion: number;
};
export type AttackProfile = {
  weapon: string;
  damage: number;
  targeting: 'single' | 'split' | 'all' | 'cross';
  piercing: number | 'full';
  poison: number;
};
export type AttackPacket = {
  profile: AttackProfile;
  strikes: {
    target?: number;
    damage: number;
    piercing: number;
    poison: number;
  }[];
  context: EffectContext;
};
export type CombatEvent = EffectContext & {
  kind: 'action' | 'attack' | 'energy' | 'payment' | 'match' | 'effect';
  amount?: number;
  target?: number;
  cells?: number[];
};

export function attackStrikes(profile: AttackProfile, ids: number[]) {
  const { damage, targeting, poison } = profile;
  const targets = ids.length ? ids : [undefined];
  const values =
    targeting === 'all'
      ? targets.map(() => Math.floor(damage * 0.6))
      : targeting === 'cross'
        ? targets.map((_, i) => (i ? Math.floor(damage * 0.3) : damage))
        : targeting === 'split' && targets.length > 1
          ? [damage - Math.floor(damage / 3), Math.floor(damage / 3)]
          : [damage];
  return values.map((value, i) => ({
    target: targets[i],
    damage: value,
    piercing:
      profile.piercing === 'full' ? value : Math.min(value, profile.piercing),
    poison,
  }));
}
export function scaledPacket(
  packet: AttackPacket,
  factor: number,
  context: EffectContext,
  ids?: number[],
): AttackPacket {
  // Retarget the original distribution BEFORE scaling. Never apply weapon bonuses twice.
  const strikes = ids ? attackStrikes(packet.profile, ids) : packet.strikes;
  return {
    profile: { ...packet.profile },
    context,
    strikes: strikes.map((s) => ({
      ...s,
      damage: Math.floor(s.damage * factor),
      piercing: Math.min(Math.floor(s.damage * factor), s.piercing),
    })),
  };
}

const natural = (n: unknown) =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
export function validContext(c: EffectContext): boolean {
  return (
    !!c &&
    natural(c.rootActionId) &&
    natural(c.effectId) &&
    (c.parentEffectId === undefined || natural(c.parentEffectId)) &&
    [
      'match',
      'skill',
      'companion',
      'repeat',
      'explosion',
      'reflection',
      'status',
      'resource',
    ].includes(c.source) &&
    typeof c.cause === 'string' &&
    natural(c.wave) &&
    ['action', 'turn', 'battle', 'run'].includes(c.scope) &&
    c.rulesVersion === 6
  );
}
export function validPacket(p: AttackPacket): boolean {
  return (
    !!p &&
    !!p.profile &&
    validContext(p.context) &&
    typeof p.profile.weapon === 'string' &&
    natural(p.profile.damage) &&
    natural(p.profile.poison) &&
    (p.profile.piercing === 'full' || natural(p.profile.piercing)) &&
    ['single', 'split', 'all', 'cross'].includes(p.profile.targeting) &&
    Array.isArray(p.strikes) &&
    p.strikes.length <= 4 &&
    p.strikes.every(
      (s) =>
        s &&
        (s.target === undefined || natural(s.target)) &&
        natural(s.damage) &&
        natural(s.piercing) &&
        s.piercing <= s.damage &&
        natural(s.poison),
    )
  );
}

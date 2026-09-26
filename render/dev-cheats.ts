import type { DevState } from '../game/types.ts';

/** The cheats of a test run in words, e.g. «урон героя ×100»; empty for a fair run. */
export function cheatList(dev?: DevState | null): string[] {
  if (!dev) return [];
  const out: string[] = [];
  const x = (v?: number) => (v !== undefined && v !== 1 ? String(v).replace('.', ',') : '');
  if (dev.god) out.push('бессмертие');
  if (dev.ink) out.push('навык всегда заряжен');
  if (dev.freeze) out.push('враги не ходят');
  if (x(dev.heroDmg)) out.push(`урон героя ×${x(dev.heroDmg)}`);
  if (x(dev.enemyHp)) out.push(`здоровье врагов ×${x(dev.enemyHp)}`);
  if (x(dev.enemyDmg)) out.push(`урон врагов ×${x(dev.enemyDmg)}`);
  if (dev.anywhere) out.push('ходить по карте куда угодно');
  return out;
}

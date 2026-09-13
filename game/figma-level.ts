import {
  startRun,
  copy,
  move,
  endTurn,
  castSkill,
  type State,
  type Result,
  type Family,
} from './engine';

// Standalone art/playability slice. It never reads or writes campaign saves.
export const LEVEL_ACTIONS = 5;
export const LEVEL_SEED = 13092026;
export const LEVEL_FAMILY_NAMES: Record<Family, string> = {
  blade: 'Удар',
  shield: 'Защита',
  spark: 'Энергия',
  focus: 'Фокус',
};
export const REFERENCE_BOARD = [
  'sbbfsfee',
  'fssbfebf',
  'bffebbss',
  'sfbbeses',
  'bbeesbsf',
  // One tile differs from the mockup so the initial field has no pre-made match.
  'fbesseff',
  'ssbebbfs',
  'sbfesbsb',
];
const letters: Record<string, Family> = {
  s: 'shield',
  b: 'blade',
  e: 'spark',
  f: 'focus',
};
export function startLevel(seed = LEVEL_SEED): State {
  const s = startRun(seed);
  s.runId = `figma-level-${seed}`;
  s.modified = true;
  s.hp = 32;
  s.energy = 9;
  s.focus = 3;
  s.actions = LEVEL_ACTIONS;
  // Unarmed visual slice: no weapon perks or inventory, no campaign equipment migration.
  s.equipment.weapon = 'bare-hands';
  s.board = REFERENCE_BOARD.join('')
    .split('')
    .map((symbol) => ({
      id: ++s.serial,
      family: letters[symbol],
      variant: null,
    }));
  s.enemies = [
    {
      id: ++s.serial,
      kind: 'raider',
      name: 'Завал отчётов',
      hp: 96,
      maxHp: 96,
      damage: 8,
      block: 0,
      poison: 0,
    },
  ];
  s.target = s.enemies[0].id;
  s.skills = ['pierce', 'seal', 'guard', 'bolt'];
  s.path = ['Архив · Завал отчётов'];
  s.log = ['Разбери завал отчётов, чтобы открыть следующую дверь.'];
  return s;
}
export type LevelAction =
  | { type: 'shift'; axis: 'row' | 'col'; line: number; amount: number }
  | { type: 'skill'; id: string; index?: number; family?: Family }
  | { type: 'end' };
export function levelAction(input: State, action: LevelAction): Result {
  if (input.phase !== 'battle')
    return { state: input, frames: [], error: 'Бой завершён.' };
  const result =
    action.type === 'shift'
      ? move(input, action.axis, action.line, action.amount)
      : action.type === 'skill'
        ? castSkill(input, action.id, action.index, action.family)
        : endTurn(input);
  if (result.error) return result;
  const finish = (original: State) => {
    const s = copy(original);
    if (s.round > input.round && s.phase === 'battle')
      s.actions = LEVEL_ACTIONS;
    if (s.phase === 'reward') {
      s.phase = 'victory';
      s.offers = [];
      s.log[0] = 'Завал разобран. Первый кабинет пройден.';
    }
    return s;
  };
  return {
    state: finish(result.state),
    frames: result.frames.map((f) => ({ ...f, state: finish(f.state) })),
  };
}
export function parallaxOffset(
  x: number,
  y: number,
  strength = 10,
  reduced = false,
) {
  const clamp = (n: number) =>
    Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));
  const distance = reduced ? 0 : Math.max(0, Math.min(18, strength));
  return { x: -clamp(x) * distance, y: -clamp(y) * distance * 0.55 };
}

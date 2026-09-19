import type { EnemyKind, Room } from './engine.ts';

// A small, legible pool for the short experiment; campaign loot is unchanged.
export const SPRINT_RELIC_IDS = [
  'thorns',
  'coil',
  'return',
  'toxin',
  'heart',
  'lamp',
  'order',
  'thread',
];
export const SPRINT_SKILL_IDS = ['bolt', 'guard', 'pierce', 'reshape'];

// Versioned, authored encounters. These definitions also validate saved routes.
export const SCENARIOS = [
  {
    id: 'duel',
    name: 'Первый противник',
    question: 'Несколько маленьких шагов или один большой?',
    roster: ['paper-rat'],
    kind: 'battle',
  },
  {
    id: 'support',
    name: 'Сначала поддержка',
    question: 'Убрать лекаря или добить ударника?',
    roster: ['paper-rat', 'candle'],
    kind: 'battle',
  },
  {
    id: 'boss',
    name: 'Сильный удар',
    question: 'Успеешь подготовиться к удару Цензора?',
    roster: ['censor'],
    kind: 'boss',
  },
  {
    id: 'summon',
    name: 'Незваные гости',
    question: 'Остановить призыв или справиться с подмогой?',
    roster: ['bell', 'paper-rat'],
    kind: 'battle',
  },
  {
    id: 'locks',
    name: 'Поле под замком',
    question: 'Снять печати фокусом или убрать их владельца?',
    roster: ['librarian', 'moth'],
    kind: 'battle',
  },
  {
    id: 'squad',
    name: 'Четыре угрозы',
    question: 'Выбери приоритет среди урона, лечения и усилений.',
    roster: ['stapler', 'moth', 'candle', 'mirror'],
    kind: 'elite',
  },
] as const;
export type EncounterId = (typeof SCENARIOS)[number]['id'];
export type ScenarioId = EncounterId | 'sprint';
export type ScenarioNode = Room & { depth: number; next: string[] };
export const isScenarioId = (id: unknown): id is ScenarioId =>
  id === 'sprint' || SCENARIOS.some((s) => s.id === id);

export function scenarioNodes(id: ScenarioId): ScenarioNode[] {
  if (id !== 'sprint') {
    const encounter = SCENARIOS.find((s) => s.id === id)!;
    return [
      {
        id: 'lab-1',
        depth: 1,
        next: [],
        name: encounter.name,
        description: encounter.question,
        kind: encounter.kind,
        roster: [...encounter.roster] as EnemyKind[],
        concealed: false,
      },
    ];
  }
  const node = (
    depth: number,
    lane: string,
    kind: Room['kind'],
    name: string,
    description: string,
    next: string[],
    roster?: EnemyKind[],
  ): ScenarioNode => ({
    id: `lab-${depth}-${lane}`,
    depth,
    kind,
    name,
    description,
    next,
    concealed: false,
    ...(roster ? { roster } : {}),
  });
  return [
    node(
      1,
      'start',
      'battle',
      'Первый шаг',
      'Один противник. Проверь запас действий.',
      ['lab-2-find'],
      ['paper-rat'],
    ),
    node(
      2,
      'find',
      'treasure',
      'Первая находка',
      'Реликвия изменит следующий бой.',
      ['lab-3-safe', 'lab-3-risk'],
    ),
    node(
      3,
      'safe',
      'battle',
      'Тихий коридор',
      'Один Степлер и обычная награда.',
      ['lab-4-rest', 'lab-4-shop'],
      ['stapler'],
    ),
    node(
      3,
      'risk',
      'elite',
      'Рискнуть',
      'Звонарь и крыса. Более сильная награда.',
      ['lab-4-rest', 'lab-4-shop'],
      ['bell', 'paper-rat'],
    ),
    node(
      4,
      'rest',
      'rest',
      'Перевести дух',
      'Восстанови здоровье или усиль сборку.',
      ['lab-5-pair'],
    ),
    node(
      4,
      'shop',
      'shop',
      'Вложиться в сборку',
      'Потрать монеты на полезную находку.',
      ['lab-5-pair'],
    ),
    node(
      5,
      'pair',
      'battle',
      'Взаимопомощь',
      'Крыса и Огарок: выбери цель.',
      ['lab-6-boss'],
      ['paper-rat', 'candle'],
    ),
    node(
      6,
      'boss',
      'boss',
      'Цензор',
      'Последняя проверка сборки.',
      [],
      ['censor'],
    ),
  ];
}

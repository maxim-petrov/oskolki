import {
  startScenario,
  DEFAULT_BALANCE,
  copy,
  isSave,
  actionLeft,
  RELICS,
  SKILLS,
  MODIFIERS,
  WEAPONS,
  type ScenarioLoadout,
  type State,
  type Balance,
  type Result,
} from './engine.ts';
import { gameAction } from './webmcp.ts';
import { isScenarioId, type ScenarioId } from './scenarios.ts';
import type { CombatEvent } from './combat-events.ts';

export const LAB_VERSION = 'lab-1-rules7';
export const LAB_SAVE_KEY = 'oskolki.lab.session.v1';
export const LAB_PROFILE_KEY = 'oskolki.lab.profile.v1';
export const LAB_BUILDS_KEY = 'oskolki.lab.builds.v1';
export const LAB_HISTORY_KEY = 'oskolki.lab.history.v1';
export const LAB_SEED = 707;
export const BUILDS = [
  {
    id: 'normal',
    name: 'С чистого листа',
    description: 'Обычный нож. Сравнивай находки с базовым боем.',
    weapon: 'gear-cutter',
    relics: [],
    modifiers: [],
    skills: ['bolt', 'guard'],
  },
  {
    id: 'shields',
    name: 'Ответный удар',
    description: 'Собирай щиты: блок отражает урон и питает энергию.',
    weapon: 'gear-cutter',
    relics: ['thorns', 'coil', 'return'],
    modifiers: [],
    skills: ['bolt', 'guard'],
  },
  {
    id: 'poison',
    name: 'Заражение',
    description: 'Кинжал накладывает яд. Выбирай, кого отравить и кого добить.',
    weapon: 'gear-rusty-dagger',
    relics: ['toxin', 'heart'],
    modifiers: ['venom'],
    skills: ['bolt', 'guard'],
  },
  {
    id: 'runes',
    name: 'Рунная цепь',
    description: 'Удары заряжают приёмы. Перелив энергии запускает Лампу.',
    weapon: 'gear-rune-sword',
    relics: ['coil', 'lamp'],
    modifiers: [],
    skills: ['bolt', 'guard'],
  },
] as const;
export type BuildId = (typeof BUILDS)[number]['id'];
export type LabCommand = { action: string; [key: string]: unknown };
export type LabConfig = {
  scenario: ScenarioId;
  build: BuildId;
  seed: number;
  scored: boolean;
  balance: Balance;
  custom?: ScenarioLoadout;
};
export const defaultConfig = (): LabConfig => ({
  scenario: 'duel',
  build: 'normal',
  seed: LAB_SEED,
  scored: false,
  balance: { ...DEFAULT_BALANCE, animation: 80 },
});
export function loadoutFor(config: LabConfig): ScenarioLoadout {
  const b = BUILDS.find((x) => x.id === config.build)!;
  return config.custom
    ? copy(config.custom)
    : {
        weapon: b.weapon,
        quality: 0,
        relics: [...b.relics],
        modifiers: [...b.modifiers],
        skills: [...b.skills],
      };
}
const uniqueKnown = (v: unknown, pool: { id: string }[], max: number) =>
  Array.isArray(v) &&
  v.length <= max &&
  new Set(v).size === v.length &&
  v.every((id) => typeof id === 'string' && pool.some((p) => p.id === id));
export function validLoadout(v: unknown): v is ScenarioLoadout {
  const x = v as ScenarioLoadout;
  return (
    !!x &&
    WEAPONS.some((w) => w.id === x.weapon) &&
    [0, 1, 2].includes(x.quality) &&
    uniqueKnown(x.relics, RELICS, 6) &&
    uniqueKnown(x.modifiers, MODIFIERS, 2) &&
    uniqueKnown(x.skills, SKILLS, 2)
  );
}
export function validConfig(v: unknown): v is LabConfig {
  const c = v as LabConfig;
  return (
    !!c &&
    isScenarioId(c.scenario) &&
    BUILDS.some((b) => b.id === c.build) &&
    Number.isInteger(c.seed) &&
    c.seed >= 0 &&
    c.seed <= 0xffffffff &&
    typeof c.scored === 'boolean' &&
    !!c.balance &&
    Object.entries({
      health: [10, 100],
      blade: [1, 5],
      shield: [1, 5],
      enemyPower: [0.5, 2],
      animation: [0, 300],
    }).every(([key, range]) => {
      const n = c.balance[key as keyof Balance];
      return Number.isFinite(n) && n >= range[0] && n <= range[1];
    }) &&
    (c.custom === undefined || validLoadout(c.custom)) &&
    (!c.scored ||
      (c.seed === LAB_SEED &&
        !c.custom &&
        c.scenario !== 'sprint' &&
        ['health', 'blade', 'shield', 'enemyPower'].every(
          (k) =>
            c.balance[k as keyof Balance] ===
            DEFAULT_BALANCE[k as keyof Balance],
        ))) &&
    (c.scenario !== 'sprint' || (c.build === 'normal' && !c.custom))
  );
}
export type LabEntry = {
  command: LabCommand;
  activeMs: number;
  room: number;
  round: number;
  actionsLeft: number;
  hpDelta: number;
  damage: number;
  blocked: number;
  energyDelta: number;
  focusDelta: number;
  goldDelta: number;
  effects: CombatEvent[];
  messages: string[];
  checksum: string;
};
export type LabSession = {
  version: typeof LAB_VERSION;
  config: LabConfig;
  initial: State;
  current: State;
  entries: LabEntry[];
  marks: string[];
  prepared?: { room: number; round: number };
  imported: boolean;
  note: string;
};
export const LAB_GOALS = [
  {
    id: 'prepared',
    name: 'Подготовленный удар',
    description: 'Сдвиг без совпадения, затем совпадение в том же ходу.',
  },
  {
    id: 'reflection',
    name: 'Ответный аргумент',
    description: 'Добей противника отражённым уроном.',
  },
  {
    id: 'poison',
    name: 'Заражение',
    description: 'Добей противника тиком яда.',
  },
  {
    id: 'overflow',
    name: 'Замкнутая цепь',
    description: 'Переполни энергию и вызови эффект Лампы.',
  },
  {
    id: 'support',
    name: 'Сначала поддержка',
    description: 'Победи лекаря, пока его напарник ещё жив.',
  },
  {
    id: 'three-builds',
    name: 'Три подхода',
    description: 'Победи в одной ситуации тремя разными готовыми сборками.',
  },
] as const;
// Stable across JSON round-trips; also used to detect stale replay packages.
export function checksum(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  const text = JSON.stringify(canonical(value));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function createLabSession(config: LabConfig): LabSession {
  if (!validConfig(config))
    throw Error(
      'Проверь сборку, seed и параметры. Для зачёта нужны исходные условия.',
    );
  const initial = startScenario(
    config.scenario,
    config.seed,
    loadoutFor(config),
    config.balance,
  );
  if (!isSave(initial))
    throw Error('Не удалось подготовить корректный сценарий.');
  return {
    version: LAB_VERSION,
    config: copy(config),
    initial: copy(initial),
    current: initial,
    entries: [],
    marks: [],
    imported: false,
    note: '',
  };
}
export function recordLabAction(
  session: LabSession,
  command: LabCommand,
  result: Result,
  activeMs = 0,
): LabSession {
  if (result.error) return session;
  const before = session.current,
    after = result.state;
  if (!after.scenario || !isSave(after))
    throw Error('Состояние сценария не прошло проверку.');
  const serial = before.effectState?.serial ?? 0;
  const events = new Map<number, CombatEvent>();
  for (const state of [...result.frames.map((f) => f.state), after])
    for (const e of state.effectState?.events ?? [])
      if (e.effectId > serial) events.set(e.effectId, e);
  const effects = [...events.values()];
  const marks = new Set(session.marks);
  let prepared = session.prepared;
  if (
    prepared &&
    (prepared.room !== after.room || prepared.round !== after.round)
  )
    prepared = undefined;
  if (command.action === 'shift') {
    if (after.stats.matches === before.stats.matches)
      prepared = { room: before.room, round: before.round };
    else if (prepared) marks.add('prepared');
  }
  if ((after.stats.poisonKills ?? 0) > (before.stats.poisonKills ?? 0))
    marks.add('poison');
  if (effects.some((e) => e.cause === 'lamp' && e.kind === 'effect'))
    marks.add('overflow');
  // Track each animation checkpoint so later retaliation cannot steal credit for a kill.
  let previous = before;
  for (const state of [...result.frames.map((f) => f.state), after]) {
    for (const dead of state.enemies.filter(
      (e) =>
        e.hp === 0 && previous.enemies.some((p) => p.id === e.id && p.hp > 0),
    )) {
      const hit = [...(state.effectState?.events ?? [])]
        .reverse()
        .find(
          (e) =>
            e.effectId > (previous.effectState?.serial ?? 0) &&
            e.cause === 'damage' &&
            e.target === dead.id &&
            (e.amount ?? 0) > 0,
        );
      if (hit?.source === 'reflection') marks.add('reflection');
      if (
        dead.kind === 'candle' &&
        state.enemies.some((e) => e.id !== dead.id && e.hp > 0)
      )
        marks.add('support');
    }
    previous = state;
  }
  const messages = [
    ...new Set(
      result.frames
        .flatMap((f) => [f.label, ...f.state.log.slice(0, 1)])
        .concat(after.log.slice(0, 2)),
    ),
  ].filter(Boolean);
  const entry: LabEntry = {
    command: copy(command),
    activeMs: Math.max(0, Math.round(activeMs)),
    room: before.room,
    round: before.round,
    actionsLeft:
      command.action === 'end_turn' ? actionLeft(before) : actionLeft(after),
    hpDelta: after.hp - before.hp,
    damage: after.stats.damage - before.stats.damage,
    blocked: after.stats.blocked - before.stats.blocked,
    energyDelta: after.energy - before.energy,
    focusDelta: after.focus - before.focus,
    goldDelta: after.gold - before.gold,
    effects,
    messages,
    checksum: checksum(after),
  };
  return {
    ...session,
    current: copy(after),
    entries: [...session.entries, entry],
    marks: [...marks],
    prepared,
  };
}
export function executeLab(
  session: LabSession,
  command: LabCommand,
  activeMs = 0,
) {
  const result = gameAction(session.current, command);
  if (result.error) throw Error(result.error);
  return {
    result,
    session: recordLabAction(session, command, result, activeMs),
  };
}
export function replayLab(value: unknown, importAsReport = false): LabSession {
  const source = value as LabSession;
  if (
    !source ||
    source.version !== LAB_VERSION ||
    !validConfig(source.config) ||
    !Array.isArray(source.entries) ||
    source.entries.length > 1500 ||
    typeof source.note !== 'string' ||
    source.note.length > 4000 ||
    typeof source.imported !== 'boolean'
  )
    throw Error(
      'Файл не подходит этой версии лаборатории или слишком большой.',
    );
  let replay = createLabSession(source.config);
  if (checksum(replay.initial) !== checksum(source.initial))
    throw Error(
      'Начальные условия изменились. Нужна версия игры, создавшая запись.',
    );
  for (const entry of source.entries) {
    if (
      !Number.isFinite(entry.activeMs) ||
      entry.activeMs < 0 ||
      entry.activeMs > 86400000
    )
      throw Error('Повреждено время действия.');
    replay = executeLab(replay, entry.command, entry.activeMs).session;
    if (replay.entries.at(-1)?.checksum !== entry.checksum)
      throw Error('Повтор разошёлся с записью. Проверь версию игры.');
  }
  if (checksum(replay.current) !== checksum(source.current))
    throw Error('Итог записи не совпал с повтором.');
  return {
    ...replay,
    imported: importAsReport || source.imported,
    note: source.note,
  };
}
export type LabProfile = { marks: string[]; wins: Record<string, BuildId[]> };
export const emptyLabProfile = (): LabProfile => ({ marks: [], wins: {} });
export function readLabProfile(value: unknown): LabProfile {
  const p = value as LabProfile;
  if (
    !p ||
    !Array.isArray(p.marks) ||
    !p.marks.every((m) => LAB_GOALS.some((g) => g.id === m)) ||
    !p.wins ||
    typeof p.wins !== 'object' ||
    Array.isArray(p.wins) ||
    !Object.entries(p.wins).every(
      ([id, builds]) =>
        isScenarioId(id) &&
        Array.isArray(builds) &&
        builds.every((b) => BUILDS.some((x) => x.id === b)),
    )
  )
    return emptyLabProfile();
  return copy(p);
}
export function updateLabProfile(
  profile: LabProfile,
  session: LabSession,
): LabProfile {
  if (
    !session.config.scored ||
    session.imported ||
    !validConfig(session.config)
  )
    return profile;
  const p = copy(profile);
  p.marks = [...new Set([...p.marks, ...session.marks])];
  if (session.current.phase === 'victory') {
    const id = session.config.scenario;
    p.wins[id] = [...new Set([...(p.wins[id] ?? []), session.config.build])];
    if (p.wins[id].length >= 3 && !p.marks.includes('three-builds'))
      p.marks.push('three-builds');
  }
  return p;
}
export function labSummary(session: LabSession) {
  const entries = session.entries;
  return {
    actions: entries.length,
    activeSeconds: Math.round(
      entries.reduce((n, e) => n + e.activeMs, 0) / 1000,
    ),
    unusedActions: entries
      .filter((e) => e.command.action === 'end_turn')
      .reduce((n, e) => n + e.actionsLeft, 0),
    damage: session.current.stats.damage,
    blocked: session.current.stats.blocked,
    healthLost: entries.reduce((n, e) => n + Math.max(0, -e.hpDelta), 0),
  };
}
export type LabHistoryEntry = {
  config: LabConfig;
  outcome: 'victory' | 'defeat' | 'stopped';
  room: number;
  summary: ReturnType<typeof labSummary>;
  note: string;
};
export function historyEntry(session: LabSession): LabHistoryEntry {
  return {
    config: copy(session.config),
    outcome:
      session.current.phase === 'victory'
        ? 'victory'
        : session.current.phase === 'defeat'
          ? 'defeat'
          : 'stopped',
    room: session.current.room,
    summary: labSummary(session),
    note: session.note,
  };
}
export function readLabHistory(value: unknown): LabHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (x) =>
        x &&
        validConfig(x.config) &&
        ['victory', 'defeat', 'stopped'].includes(x.outcome) &&
        Number.isInteger(x.room) &&
        x.room >= 1 &&
        x.room <= 6 &&
        typeof x.note === 'string' &&
        x.note.length <= 4000 &&
        x.summary &&
        [
          'actions',
          'activeSeconds',
          'unusedActions',
          'damage',
          'blocked',
          'healthLost',
        ].every((k) => Number.isFinite(x.summary[k]) && x.summary[k] >= 0),
    )
    .slice(0, 12);
}

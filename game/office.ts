import type { State } from './engine';

// Office memories are presentation/progression context, never combat RNG or stats.
export const OFFICE_SAVE_KEY = 'oskolki.office.v1';
export type Point = { x: number; y: number };
export type OfficeTarget = 'desk' | 'vera' | 'lev' | 'door';
export type OfficeMemory = {
  version: 1;
  introduced: boolean;
  discoveredDoor: boolean;
  awakenings: number;
  lastWakeRunId: string | null;
  wakeAcknowledged?: string | null;
  inRun: boolean;
  runId: string | null;
  position: Point;
  talked: OfficeTarget[];
};
export const DESK_POSITION: Point = { x: 220, y: 458 };
export const OFFICE_TARGETS: {
  id: OfficeTarget;
  name: string;
  action: string;
  point: Point;
}[] = [
  {
    id: 'desk',
    name: 'Твой стол',
    action: 'Осмотреть стол',
    point: DESK_POSITION,
  },
  {
    id: 'vera',
    name: 'Вера · отдел сверки',
    action: 'Поговорить с Верой',
    point: { x: 468, y: 434 },
  },
  {
    id: 'lev',
    name: 'Лев · архив',
    action: 'Поговорить со Львом',
    point: { x: 642, y: 448 },
  },
  {
    id: 'door',
    name: 'Кабинет босса',
    action: 'Открыть дверь босса',
    point: { x: 811, y: 372 },
  },
];
export const emptyOffice = (): OfficeMemory => ({
  version: 1,
  introduced: false,
  discoveredDoor: false,
  awakenings: 0,
  lastWakeRunId: null,
  inRun: false,
  runId: null,
  position: { ...DESK_POSITION },
  talked: [],
});
export function walkable(p: Point) {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    ((p.x >= 65 && p.x <= 935 && p.y >= 420 && p.y <= 555) ||
      (p.x >= 765 && p.x <= 870 && p.y >= 355 && p.y <= 555))
  );
}
export function stepOffice(p: Point, dx: number, dy: number): Point {
  const full = { x: p.x + dx, y: p.y + dy };
  if (walkable(full)) return full;
  const horizontal = { x: p.x + dx, y: p.y };
  if (dx && walkable(horizontal)) return horizontal;
  const vertical = { x: p.x, y: p.y + dy };
  return walkable(vertical) ? vertical : p;
}
export function nearestTarget(p: Point): OfficeTarget | null {
  const nearest = OFFICE_TARGETS.map((t) => ({
    id: t.id,
    d: Math.hypot(t.point.x - p.x, t.point.y - p.y),
  })).sort((a, b) => a.d - b.d)[0];
  return nearest.d <= 88 ? nearest.id : null;
}
// A short route through the common aisle keeps click-to-walk out of furniture.
export function officeWaypoints(from: Point, to: Point): Point[] {
  return [
    ...(from.y < 425 ? [{ x: from.x, y: 452 }] : []),
    { x: to.x, y: Math.max(452, to.y) },
    to,
  ];
}
export function readOffice(value: unknown, run: State | null): OfficeMemory {
  const fallback = emptyOffice();
  const o = value as Partial<OfficeMemory> | null;
  if (
    !o ||
    o.version !== 1 ||
    typeof o.introduced !== 'boolean' ||
    typeof o.discoveredDoor !== 'boolean' ||
    typeof o.inRun !== 'boolean' ||
    !Number.isSafeInteger(o.awakenings) ||
    (o.awakenings ?? -1) < 0 ||
    !o.position ||
    !walkable(o.position) ||
    !Array.isArray(o.talked) ||
    !o.talked.every((id) => OFFICE_TARGETS.some((t) => t.id === id)) ||
    !(o.runId === null || typeof o.runId === 'string') ||
    !(o.wakeAcknowledged == null || typeof o.wakeAcknowledged === 'string') ||
    !(o.lastWakeRunId === null || typeof o.lastWakeRunId === 'string')
  ) {
    return run
      ? {
          ...fallback,
          introduced: true,
          discoveredDoor: true,
          inRun: true,
          runId: run.runId,
        }
      : fallback;
  }
  const memory = structuredClone(o) as OfficeMemory;
  // A separately restored older run remains resumable, even if the office save differs.
  if (run && run.runId !== memory.runId)
    return { ...memory, inRun: true, runId: run.runId };
  return { ...memory, inRun: !!run && memory.inRun };
}
export function wakeFromRun(o: OfficeMemory, run: State): OfficeMemory {
  if (run.phase !== 'defeat' || o.lastWakeRunId === run.runId) return o;
  return {
    ...o,
    introduced: true,
    awakenings: o.awakenings + 1,
    lastWakeRunId: run.runId,
    runId: run.runId,
    inRun: false,
    position: { ...DESK_POSITION },
  };
}
export function continueDestination(
  o: OfficeMemory,
  run: State | null,
): 'run' | 'office' {
  return run && run.phase !== 'defeat' && o.inRun ? 'run' : 'office';
}

export type OfficeLine = { speaker: string; text: string };
export function openingLines(o: OfficeMemory): OfficeLine[] {
  if (o.awakenings)
    return [
      {
        speaker: 'Ты',
        text: 'Резкий вдох. Щека прилипла к отчёту. Я снова за своим рабочим столом.',
      },
      {
        speaker: 'Ты',
        text: 'Там, за дверью, я не смог пройти дальше. Но почему на рукаве нет ни пятна?',
      },
      {
        speaker: 'Ты',
        text: 'Юла всё ещё крутится. Я ведь запустил её… когда?',
      },
    ];
  return [
    {
      speaker: 'Понедельник. 18:00.',
      text: 'Ты переносишь числа из одной таблицы в другую. Последняя строка. Ещё одна последняя строка.',
    },
    {
      speaker: 'Ты',
      text: 'Отчёт знакомый. И этот день тоже. Не могу вспомнить, как пришёл сюда утром.',
    },
    {
      speaker: 'Ты',
      text: 'На столе крутится юла. Пока она не остановится, можно немного отвлечься.',
    },
    {
      speaker: 'Ты',
      text: 'Спрошу коллег. А потом зайду к боссу — пора уходить домой.',
    },
  ];
}
export function officeDialogue(
  target: OfficeTarget,
  topic: number,
  o: OfficeMemory,
): OfficeLine[] {
  if (target === 'desk')
    return [
      {
        speaker: 'Твой стол',
        text: 'В отчёте снова пустая последняя строка. На часах — 18:00. На пропуске дата стёрта.',
      },
      {
        speaker: 'Ты',
        text: o.awakenings
          ? 'Всё вернулось на свои места. Кроме того, что я помню.'
          : 'Юла держится на самом кончике. Ни разу не качнулась.',
      },
    ];
  if (target === 'door')
    return o.discoveredDoor
      ? [
          {
            speaker: 'За дверью',
            text: 'Вместо кабинета — тот же длинный проход. Двери уходят в темноту. Где-то щёлкает картотека.',
          },
          {
            speaker: 'Ты',
            text: 'Я уже знаю: рабочий день здесь сам не закончится.',
          },
        ]
      : [
          { speaker: 'Ты', text: 'Я стучу. Никто не отвечает. Нажимаю ручку.' },
          {
            speaker: 'За дверью',
            text: 'Стола босса нет. Кабинета нет. Впереди — комната, за ней ещё одна, и ещё. Этот коридор не помещается в нашем здании.',
          },
          {
            speaker: 'Ты',
            text: 'Это не переработка. Что-то держит нас здесь. Надо узнать, что находится в конце.',
          },
        ];
  if (target === 'vera')
    return topic === 0
      ? [
          {
            speaker: 'Ты',
            text: o.awakenings
              ? 'Я опять проснулся здесь. Ты видела, как я вернулся?'
              : 'Вера, мы давно здесь работаем?',
          },
          {
            speaker: 'Вера',
            text: o.awakenings
              ? 'Ты и не уходил. Только положил голову на отчёт. Как всегда.'
              : 'С понедельника. Кажется. Не отвлекай, у меня последняя таблица.',
          },
          { speaker: 'Ты', text: 'Ты вчера тоже так говорила.' },
          { speaker: 'Вера', text: 'Значит, осталось совсем немного.' },
        ]
      : [
          { speaker: 'Ты', text: 'Что за дверью босса?' },
          {
            speaker: 'Вера',
            text: o.discoveredDoor
              ? 'Тише. Я тоже слышу ящики. Но если не смотреть туда, это просто кабинет.'
              : 'Кабинет. А что ещё? Хотя бумаги оттуда приносит Лев. Спроси у него.',
          },
          {
            speaker: 'Вера',
            text: 'Если пойдёшь — не пытайся делать всё разом. Иногда три маленьких действия лучше одного большого.',
          },
        ];
  return topic === 0
    ? [
        { speaker: 'Ты', text: 'Лев, где выход?' },
        {
          speaker: 'Лев',
          text: 'По инструкции — через приёмную. По опыту — я ещё ищу.',
        },
        {
          speaker: 'Лев',
          text: o.awakenings
            ? 'Ты сегодня спрашиваешь иначе. Значит, хоть что-то не повторилось.'
            : 'Я стал делать пометки на полях. Каждое утро бумага чистая, а пометки я помню.',
        },
      ]
    : [
        { speaker: 'Ты', text: 'Ты был в комнатах за кабинетом?' },
        {
          speaker: 'Лев',
          text: 'До архива доходил. Дальше — вода. Шкафы там не любят, когда трогают их бумаги.',
        },
        {
          speaker: 'Лев',
          text: 'Смотри, кто помогает остальным. Иногда маленький писарь опаснее большой картотеки.',
        },
        {
          speaker: 'Лев',
          text: 'Если снова окажешься за столом — подойди. Мне важно знать, что я это не придумал.',
        },
      ];
}

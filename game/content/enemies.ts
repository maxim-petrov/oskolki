import type { EnemyDef } from '../types.ts';

/**
 * Enemy catalogue. Numbers are in "act 1 units": the act multiplies hp and damage when the
 * enemy spawns (content/acts.ts). Damage is in hit points; timer = ticks (accepted moves)
 * until the action fires. Material matters to some tiles and items (the paper knife).
 */
export const ENEMIES: Record<string, EnemyDef> = {
  // ── Intro ─────────────────────────────────────────────────────────
  kipa: {
    id: 'kipa',
    name: 'Кипа',
    hp: 40,
    size: 'M',
    material: 'paper',
    intents: [
      { kind: 'attack', value: 8, timer: 3 },
      { kind: 'tape', value: 2, timer: 3 },
    ],
    blurb: 'Стопка, которую ты нёс в архив. Теперь она несёт тебя.',
  },

  // ── Act 1 · Изнанка отдела ────────────────────────────────────────
  rat: {
    id: 'rat',
    name: 'Бумажная крыса',
    hp: 50,
    size: 'S',
    material: 'paper',
    intents: [{ kind: 'attack', value: 14, timer: 3 }],
    blurb: 'Кусает часто, но слабо. Убей первой.',
  },
  drop: {
    id: 'drop',
    name: 'Капля',
    hp: 24,
    size: 'S',
    material: 'ink',
    intents: [{ kind: 'attack', value: 10, timer: 3 }],
    blurb: 'Осколок кляксы.',
  },
  blot: {
    id: 'blot',
    name: 'Клякса',
    hp: 64,
    size: 'S',
    material: 'ink',
    traits: ['splits'],
    splitInto: 'drop',
    intents: [
      { kind: 'ink', value: 2, timer: 3 },
      { kind: 'attack', value: 14, timer: 3 },
    ],
    blurb: 'Заливает фишки чернилами. Умирая, распадается на капли.',
  },
  moth: {
    id: 'moth',
    name: 'Книжная моль',
    hp: 46,
    size: 'S',
    material: 'paper',
    intents: [
      { kind: 'attack', value: 11, timer: 3 },
      { kind: 'stealCharge', value: 3, timer: 3 },
    ],
    blurb: 'Ест чернила из навыка.',
  },
  stapler: {
    id: 'stapler',
    name: 'Скобогрыз',
    hp: 72,
    size: 'M',
    material: 'metal',
    intents: [
      { kind: 'pin', value: 1, timer: 3 },
      { kind: 'attack', value: 18, timer: 3 },
    ],
    blurb: 'Прибивает фишки скобами: их нельзя сдвинуть с места.',
  },
  eraser: {
    id: 'eraser',
    name: 'Ластик-вышибала',
    hp: 96,
    armor: 2,
    size: 'M',
    material: 'rubber',
    intents: [
      { kind: 'erase', value: 1, timer: 3 },
      { kind: 'heavy', value: 29, timer: 4 },
    ],
    blurb: 'Бронирован: каждый удар по нему слабее на 2. Стирает особые фишки.',
  },
  copier: {
    id: 'copier',
    name: 'Копир',
    hp: 100,
    size: 'M',
    material: 'metal',
    intents: [
      { kind: 'tape', value: 3, timer: 3 },
      { kind: 'attack', value: 18, timer: 3 },
    ],
    blurb: 'Выплёвывает волокиту: фишки, которые не собираются.',
  },
  phone: {
    id: 'phone',
    name: 'Телефон',
    hp: 50,
    size: 'S',
    material: 'metal',
    intents: [
      { kind: 'hurry', value: 1, timer: 3 },
      { kind: 'attack', value: 11, timer: 3 },
    ],
    blurb: 'Звонит без конца. От звонка все остальные торопятся.',
  },
  neighbor: {
    id: 'neighbor',
    name: 'Сосед',
    hp: 290,
    size: 'L',
    material: 'flesh',
    intents: [
      { kind: 'tape', value: 2, timer: 3 },
      { kind: 'attack', value: 32, timer: 3 },
      { kind: 'heavy', value: 54, timer: 4 },
    ],
    blurb: 'Сидел за соседним столом. Кажется, он всё ещё работает.',
  },
  cabinet: {
    id: 'cabinet',
    name: 'Картотека',
    hp: 320,
    size: 'L',
    material: 'metal',
    intents: [
      { kind: 'attack', value: 34, timer: 3 },
      { kind: 'summon', value: 1, timer: 4, summon: 'rat' },
      { kind: 'ink', value: 3, timer: 3 },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'heavy', value: 54, timer: 4 },
          { kind: 'summon', value: 1, timer: 3, summon: 'rat' },
          { kind: 'attack', value: 34, timer: 3 },
        ],
      },
    ],
    blurb: 'Старшая по бумагам. Выпускает крыс из ящиков.',
  },
  supervisor: {
    id: 'supervisor',
    name: 'Надзирательница',
    hp: 1100,
    size: 'boss',
    material: 'flesh',
    intents: [
      { kind: 'attack', value: 39, timer: 3 },
      { kind: 'tape', value: 3, timer: 3 },
      { kind: 'summon', value: 1, timer: 4, summon: 'phone' },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'heavy', value: 63, timer: 4 },
          { kind: 'hurry', value: 1, timer: 3 },
          { kind: 'attack', value: 39, timer: 3 },
        ],
      },
    ],
    blurb: 'Та, что попросила отнести стопку в архив. Она знала.',
  },

  // ── Act 2 · Затопленный архив ─────────────────────────────────────
  scribe: {
    id: 'scribe',
    name: 'Мокрый писарь',
    hp: 44,
    size: 'M',
    material: 'flesh',
    intents: [
      { kind: 'attack', value: 19, timer: 3 },
      { kind: 'ink', value: 2, timer: 3 },
    ],
    blurb: 'Пишет размокшими чернилами прямо по полю.',
  },
  crab: {
    id: 'crab',
    name: 'Картотечный краб',
    hp: 50,
    armor: 2,
    size: 'M',
    material: 'paper',
    intents: [
      { kind: 'pinch', value: 1, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
    ],
    blurb: 'Хватает строку клешнёй и двигает её сам. Бронирован.',
  },
  eel: {
    id: 'eel',
    name: 'Чернильный угорь',
    hp: 40,
    size: 'M',
    material: 'ink',
    traits: ['diver'],
    intents: [
      { kind: 'submerge', value: 0, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
    ],
    blurb: 'Ныряет: под водой удары его не достают, а взрывы и урон всем — достают.',
  },
  angler: {
    id: 'angler',
    name: 'Фонарный удильщик',
    hp: 46,
    size: 'M',
    material: 'flesh',
    traits: ['light'],
    intents: [
      { kind: 'stealCoins', value: 8, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
    ],
    blurb: 'Приманивает монеты фонарём. Убьёшь — вернёт украденное.',
  },
  anchor: {
    id: 'anchor',
    name: 'Якорный смотритель',
    hp: 64,
    size: 'L',
    material: 'metal',
    intents: [
      { kind: 'anchor', value: 1, timer: 3 },
      { kind: 'heavy', value: 32, timer: 4 },
    ],
    blurb: 'Бросает якорь: фишки столбца не двигаются 3 хода. Бьёт тяжело.',
  },
  tide: {
    id: 'tide',
    name: 'Хранитель прилива',
    hp: 300,
    size: 'boss',
    material: 'water',
    intents: [
      { kind: 'tide', value: 1, timer: 4 },
      { kind: 'attack', value: 24, timer: 3 },
      { kind: 'summon', value: 1, timer: 4, summon: 'eel' },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'tide', value: 1, timer: 3 },
          { kind: 'heavy', value: 34, timer: 3 },
          { kind: 'attack', value: 24, timer: 3 },
        ],
      },
    ],
    blurb: 'Поднимает воду по строкам: под водой фишки не ходят вбок. Синие группы у воды сгоняют её.',
  },

  // ── Act 3 · Котельная ─────────────────────────────────────────────
  candle: {
    id: 'candle',
    name: 'Огарок',
    hp: 34,
    size: 'S',
    material: 'wax',
    traits: ['light'],
    intents: [
      { kind: 'heal', value: 6, timer: 3 },
      { kind: 'ember', value: 1, timer: 3 },
    ],
    blurb: 'Лечит союзников и роняет угольки на поле.',
  },
  stoker: {
    id: 'stoker',
    name: 'Кочегар',
    hp: 50,
    size: 'M',
    material: 'flesh',
    traits: ['light'],
    intents: [
      { kind: 'ember', value: 2, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
    ],
    blurb: 'Подбрасывает угольки. Собери фишку с фитилём, пока не догорела.',
  },
  bell: {
    id: 'bell',
    name: 'Гулкий звонарь',
    hp: 50,
    size: 'M',
    material: 'metal',
    intents: [
      { kind: 'attack', value: 19, timer: 3 },
      { kind: 'heavy', value: 34, timer: 4 },
    ],
    blurb: 'Долго раскачивает колокол — и бьёт очень больно.',
  },
  safe: {
    id: 'safe',
    name: 'Сейф-страж',
    hp: 66,
    armor: 3,
    size: 'L',
    material: 'metal',
    coins: 12,
    intents: [
      { kind: 'block', value: 10, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
    ],
    blurb: 'Тяжёлая броня и щит. Внутри — монеты.',
  },
  archivist: {
    id: 'archivist',
    name: 'Слепой архивариус',
    hp: 46,
    size: 'M',
    material: 'flesh',
    intents: [
      { kind: 'censor', value: 4, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
    ],
    blurb: 'Закрывает фишки чёрными плашками.',
  },
  shard: {
    id: 'shard',
    name: 'Осколок',
    hp: 14,
    size: 'S',
    material: 'glass',
    intents: [{ kind: 'attack', value: 14, timer: 3 }],
    blurb: 'Отколовшийся кусок зеркала.',
  },
  mirror: {
    id: 'mirror',
    name: 'Кривое зеркало',
    hp: 300,
    size: 'boss',
    material: 'glass',
    intents: [
      { kind: 'shine', value: 1, timer: 3 },
      { kind: 'attack', value: 26, timer: 3 },
      { kind: 'ink', value: 4, timer: 3 },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'shine', value: 1, timer: 3 },
          { kind: 'heavy', value: 39, timer: 3 },
          { kind: 'summon', value: 1, timer: 4, summon: 'shard' },
        ],
      },
    ],
    blurb: 'Пока блестит, отражает часть удара в тебя.',
  },

  // ── Act 4 · Дирекция ──────────────────────────────────────────────
  stamp: {
    id: 'stamp',
    name: 'Печать',
    hp: 58,
    size: 'M',
    material: 'rubber',
    intents: [
      { kind: 'pin', value: 2, timer: 3 },
      { kind: 'attack', value: 24, timer: 3 },
    ],
    blurb: 'Ставит резолюции прямо на фишки.',
  },
  secretary: {
    id: 'secretary',
    name: 'Секретарь',
    hp: 50,
    size: 'M',
    material: 'flesh',
    intents: [
      { kind: 'censor', value: 3, timer: 3 },
      { kind: 'attack', value: 19, timer: 3 },
      { kind: 'heal', value: 8, timer: 3 },
    ],
    blurb: 'Закрывает бумаги и лечит начальство.',
  },
  censor: {
    id: 'censor',
    name: 'Главный цензор',
    hp: 320,
    size: 'boss',
    material: 'flesh',
    intents: [
      { kind: 'censor', value: 5, timer: 3 },
      { kind: 'strike', value: 26, timer: 4 },
      { kind: 'summon', value: 1, timer: 5, summon: 'secretary' },
    ],
    phases: [
      {
        at: 0.6,
        intents: [
          { kind: 'pin', value: 2, timer: 3 },
          { kind: 'heavy', value: 43, timer: 4 },
          { kind: 'censor', value: 5, timer: 3 },
        ],
      },
      {
        at: 0.3,
        intents: [
          { kind: 'ink', value: 6, timer: 4 },
          { kind: 'heavy', value: 46, timer: 4 },
          { kind: 'strike', value: 26, timer: 3 },
        ],
      },
    ],
    blurb: 'Хозяин бесконечного офиса. Вычёркивает всё, что не одобрено.',
  },
};

export const INTENT_TEXT: Record<string, string> = {
  attack: 'Удар',
  heavy: 'Тяжёлый удар',
  block: 'Защита',
  heal: 'Лечение',
  summon: 'Призыв',
  ink: 'Кляксы',
  pin: 'Скрепка',
  ember: 'Уголёк',
  censor: 'Цензура',
  stealCharge: 'Кража чернил',
  stealCoins: 'Кража монет',
  pinch: 'Клешня',
  tide: 'Прилив',
  submerge: 'Нырок',
  shine: 'Блеск',
  anchor: 'Якорь',
  strike: 'Красная печать',
  erase: 'Стереть',
  tape: 'Волокита',
  hurry: 'Звонок',
};

export const MATERIAL_NAME: Record<string, string> = {
  paper: 'бумага',
  rubber: 'резина',
  ink: 'чернила',
  metal: 'металл',
  glass: 'стекло',
  wax: 'воск',
  flesh: 'человек',
  water: 'вода',
};

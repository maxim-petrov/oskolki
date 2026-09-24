import type { EnemyDef } from '../types.ts';

/**
 * Damage is in half-hearts. timer = ticks (accepted moves) until the action fires.
 * cost = budget weight used by the room composer.
 */
export const ENEMIES: Record<string, EnemyDef & { cost: number }> = {
  // ── Floor 1 · Канцелярия ───────────────────────────────────────────
  rat: {
    id: 'rat',
    name: 'Бумажная крыса',
    hp: 8,
    size: 'S',
    cost: 1,
    intents: [{ kind: 'attack', value: 1, timer: 3 }],
    blurb: 'Кусает часто, но слабо. Убей первой.',
  },
  stapler: {
    id: 'stapler',
    name: 'Скобогрыз',
    hp: 12,
    size: 'M',
    cost: 1.5,
    intents: [
      { kind: 'pin', value: 1, timer: 3 },
      { kind: 'attack', value: 1, timer: 3 },
    ],
    blurb: 'Прибивает фишки скобами: их нельзя сдвинуть с места.',
  },
  blot: {
    id: 'blot',
    name: 'Клякса',
    hp: 10,
    size: 'S',
    cost: 1.5,
    traits: ['splits'],
    splitInto: 'drop',
    intents: [
      { kind: 'attack', value: 1, timer: 3 },
      { kind: 'ink', value: 2, timer: 3 },
    ],
    blurb: 'Заливает фишки чернилами. Умирая, распадается на капли.',
  },
  drop: {
    id: 'drop',
    name: 'Капля',
    hp: 4,
    size: 'S',
    cost: 0.5,
    intents: [{ kind: 'attack', value: 1, timer: 3 }],
    blurb: 'Осколок кляксы.',
  },
  moth: {
    id: 'moth',
    name: 'Книжная моль',
    hp: 8,
    size: 'S',
    cost: 1.2,
    intents: [
      { kind: 'attack', value: 1, timer: 3 },
      { kind: 'stealCharge', value: 3, timer: 3 },
    ],
    blurb: 'Ест чернила из активного предмета.',
  },
  eraser: {
    id: 'eraser',
    name: 'Ластик-вышибала',
    hp: 16,
    armor: 1,
    size: 'M',
    cost: 2,
    intents: [
      { kind: 'erase', value: 1, timer: 3 },
      { kind: 'heavy', value: 2, timer: 3 },
    ],
    blurb: 'Бронирован: каждое попадание клинков слабее на 1. Стирает особые фишки.',
  },
  cabinet: {
    id: 'cabinet',
    name: 'Картотека',
    hp: 70,
    size: 'boss',
    cost: 0,
    intents: [
      { kind: 'attack', value: 2, timer: 3 },
      { kind: 'summon', value: 1, timer: 4, summon: 'rat' },
      { kind: 'ink', value: 3, timer: 3 },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'heavy', value: 3, timer: 4 },
          { kind: 'summon', value: 1, timer: 3, summon: 'rat' },
          { kind: 'attack', value: 2, timer: 3 },
        ],
      },
    ],
    blurb: 'Старшая по бумагам. Выпускает крыс из ящиков.',
  },

  // ── Floor 2 · Затопленный архив ────────────────────────────────────
  scribe: {
    id: 'scribe',
    name: 'Мокрый писарь',
    hp: 20,
    size: 'M',
    cost: 2,
    intents: [
      { kind: 'attack', value: 2, timer: 3 },
      { kind: 'ink', value: 2, timer: 3 },
    ],
    blurb: 'Пишет размокшими чернилами прямо по полю.',
  },
  crab: {
    id: 'crab',
    name: 'Картотечный краб',
    hp: 22,
    armor: 1,
    size: 'M',
    cost: 2.2,
    intents: [
      { kind: 'pinch', value: 1, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
    ],
    blurb: 'Хватает строку клешнёй и двигает её сам. Бронирован.',
  },
  eel: {
    id: 'eel',
    name: 'Чернильный угорь',
    hp: 18,
    size: 'M',
    cost: 2,
    traits: ['diver'],
    intents: [
      { kind: 'submerge', value: 0, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
    ],
    blurb: 'Ныряет: под водой клинки его не достают, а взрывы — достают.',
  },
  angler: {
    id: 'angler',
    name: 'Фонарный удильщик',
    hp: 20,
    size: 'M',
    cost: 2,
    traits: ['light'],
    intents: [
      { kind: 'stealCoins', value: 3, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
    ],
    blurb: 'Приманивает монеты фонарём. Убьёшь — вернёт украденное.',
  },
  anchor: {
    id: 'anchor',
    name: 'Якорный смотритель',
    hp: 28,
    size: 'L',
    cost: 2.8,
    intents: [
      { kind: 'anchor', value: 1, timer: 3 },
      { kind: 'heavy', value: 3, timer: 4 },
    ],
    blurb: 'Бросает якорь: фишки столбца не двигаются 3 хода. Бьёт тяжело.',
  },
  tide: {
    id: 'tide',
    name: 'Хранитель прилива',
    hp: 110,
    size: 'boss',
    cost: 0,
    intents: [
      { kind: 'tide', value: 1, timer: 4 },
      { kind: 'attack', value: 2, timer: 3 },
      { kind: 'summon', value: 1, timer: 4, summon: 'eel' },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'tide', value: 1, timer: 3 },
          { kind: 'heavy', value: 3, timer: 3 },
          { kind: 'attack', value: 2, timer: 3 },
        ],
      },
    ],
    blurb: 'Поднимает воду по строкам: под водой фишки не ходят вбок. Папки в затопленной строке сгоняют воду.',
  },

  // ── Floor 3 · Котельная ────────────────────────────────────────────
  candle: {
    id: 'candle',
    name: 'Огарок',
    hp: 16,
    size: 'S',
    cost: 2,
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
    hp: 24,
    size: 'M',
    cost: 2.5,
    traits: ['light'],
    intents: [
      { kind: 'ember', value: 2, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
    ],
    blurb: 'Подбрасывает угольки. Собери фишку с фитилём, пока не догорела.',
  },
  bell: {
    id: 'bell',
    name: 'Гулкий звонарь',
    hp: 26,
    size: 'M',
    cost: 2.5,
    intents: [
      { kind: 'attack', value: 2, timer: 3 },
      { kind: 'heavy', value: 4, timer: 4 },
    ],
    blurb: 'Долго раскачивает колокол — и бьёт очень больно.',
  },
  safe: {
    id: 'safe',
    name: 'Сейф-страж',
    hp: 36,
    armor: 2,
    size: 'L',
    cost: 3,
    coins: 6,
    intents: [
      { kind: 'block', value: 8, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
    ],
    blurb: 'Тяжёлая броня и щит. Внутри — монеты.',
  },
  archivist: {
    id: 'archivist',
    name: 'Слепой архивариус',
    hp: 22,
    size: 'M',
    cost: 2.3,
    intents: [
      { kind: 'censor', value: 4, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
    ],
    blurb: 'Закрывает фишки чёрными плашками.',
  },
  mirror: {
    id: 'mirror',
    name: 'Кривое зеркало',
    hp: 150,
    size: 'boss',
    cost: 0,
    intents: [
      { kind: 'shine', value: 1, timer: 3 },
      { kind: 'attack', value: 3, timer: 3 },
      { kind: 'ink', value: 4, timer: 3 },
    ],
    phases: [
      {
        at: 0.5,
        intents: [
          { kind: 'shine', value: 1, timer: 3 },
          { kind: 'heavy', value: 4, timer: 3 },
          { kind: 'summon', value: 1, timer: 4, summon: 'shard' },
        ],
      },
    ],
    blurb: 'Пока блестит, отражает удары клинков в тебя.',
  },
  shard: {
    id: 'shard',
    name: 'Осколок',
    hp: 10,
    size: 'S',
    cost: 1,
    intents: [{ kind: 'attack', value: 1, timer: 3 }],
    blurb: 'Отколовшийся кусок зеркала.',
  },

  // ── Floor 4 · Дирекция ─────────────────────────────────────────────
  stamp: {
    id: 'stamp',
    name: 'Печать',
    hp: 32,
    size: 'M',
    cost: 3,
    intents: [
      { kind: 'pin', value: 2, timer: 3 },
      { kind: 'attack', value: 3, timer: 3 },
    ],
    blurb: 'Ставит резолюции прямо на фишки.',
  },
  secretary: {
    id: 'secretary',
    name: 'Секретарь',
    hp: 28,
    size: 'M',
    cost: 3,
    intents: [
      { kind: 'censor', value: 3, timer: 3 },
      { kind: 'attack', value: 2, timer: 3 },
      { kind: 'heal', value: 8, timer: 3 },
    ],
    blurb: 'Закрывает бумаги и лечит начальство.',
  },
  censor: {
    id: 'censor',
    name: 'Главный цензор',
    hp: 180,
    size: 'boss',
    cost: 0,
    intents: [
      { kind: 'censor', value: 5, timer: 3 },
      { kind: 'strike', value: 3, timer: 4 },
      { kind: 'summon', value: 1, timer: 5, summon: 'secretary' },
    ],
    phases: [
      {
        at: 0.6,
        intents: [
          { kind: 'pin', value: 2, timer: 3 },
          { kind: 'heavy', value: 4, timer: 4 },
          { kind: 'censor', value: 5, timer: 3 },
        ],
      },
      {
        at: 0.3,
        intents: [
          { kind: 'ink', value: 6, timer: 4 },
          { kind: 'heavy', value: 5, timer: 4 },
          { kind: 'strike', value: 3, timer: 3 },
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
};

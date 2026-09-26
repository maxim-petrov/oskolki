import type { DevBuild, DevCard, DevStart } from './dev.ts';

/**
 * Ready-made tests for the dev panel: every boss and elite with a build that fits its act, item
 * synergies, enemy mechanics, places and stress tests — one click each. Builds are made of real
 * content ids (game/content); the panel can add god mode or a damage multiplier on top.
 */

export interface DevSuiteItem {
  id: string;
  name: string;
  desc: string;
  cfg: DevStart;
}

export interface DevSuite {
  group: string;
  items: DevSuiteItem[];
}

/** Cards: [id, count, upgraded?]. */
function deck(...entries: [string, number, boolean?][]): DevCard[] {
  return entries.flatMap(([id, n, up]) => Array.from({ length: n }, () => ({ id, up: !!up })));
}

function build(cards: DevCard[], relics: string[], active: string | null, pockets: (string | null)[] = []): DevBuild {
  return { deck: cards, relics, active, pockets: [...pockets, null, null, null].slice(0, 3) };
}

/** A build that belongs to each act: the first three are what a decent run holds by then. */
const ACT_BUILD: DevBuild[] = [
  build(deck(['fist', 3], ['scissors', 2], ['redpen', 1], ['folder', 2], ['binder', 1], ['ink', 2], ['quill', 1], ['clip', 2], ['bonus', 1]), ['knife', 'coffee', 'vestrelic'], 'eraser', ['coffee', 'bomb']),
  build(
    deck(['fist', 2], ['scissors', 2], ['stapler', 1], ['alarm', 1], ['folder', 1], ['binder', 1], ['drawer', 1], ['laminator', 1], ['ink', 1], ['quill', 2], ['carbon', 1], ['clip', 1], ['bonus', 2], ['report', 1]),
    ['knife', 'coffee', 'binderclip', 'poster', 'lucky', 'timesheet'],
    'stapler',
    ['bomb', 'energy', 'coffee'],
  ),
  build(
    deck(['scissors', 3, true], ['alarm', 1], ['cutter', 1], ['stapler', 1], ['drawer', 2], ['vest', 1], ['laminator', 1], ['quill', 2], ['carbon', 1], ['copystamp', 1], ['bonus', 2], ['goldclip', 1], ['report', 1], ['card', 1]),
    ['knife', 'espresso', 'poster', 'award', 'coffeemachine', 'carbonpack', 'puncher'],
    'shredder',
    ['bomb', 'bomb', 'energy'],
  ),
  build(
    deck(['scissors', 3, true], ['alarm', 2, true], ['cutter', 1, true], ['drawer', 2], ['vest', 1, true], ['quill', 2, true], ['carbon', 2], ['copystamp', 1], ['bonus', 2, true], ['goldclip', 1, true], ['report', 1, true], ['card', 1]),
    ['knife', 'espresso', 'poster', 'award', 'coffeemachine', 'carbonpack', 'puncher', 'lamp', 'stamprelic', 'pen', 'lucky'],
    'giftbox',
    ['bomb', 'energy', 'sticker'],
  ),
];

const fight = (act: number, place: DevStart['place'], enemies: string[], extra: Partial<DevStart> = {}): DevStart => ({
  char: 'intern',
  act,
  place,
  enemies,
  build: ACT_BUILD[act],
  cheats: {},
  ...extra,
});

/** A synergy test: act 1, a sturdy enemy pair with triple health, so the combo has time to show. */
const combo = (b: DevBuild, enemies = ['copier', 'rat'], extra: Partial<DevStart> = {}): DevStart => ({
  char: 'intern',
  act: 0,
  place: 'fight',
  enemies,
  build: b,
  cheats: { enemyHp: 3 },
  ...extra,
});

export const DEV_SUITES: DevSuite[] = [
  {
    group: 'Боссы',
    items: [
      { id: 'boss1', name: 'Надзирательница', desc: 'Босс 1-го отдела. Сборка середины отдела 1: кулаки, ножницы, премия, нож и кофе.', cfg: fight(0, 'boss', ['supervisor']) },
      { id: 'boss2', name: 'Хранитель прилива', desc: 'Босс архива: поднимает воду по строкам. Сборка к концу 2-го отдела с плакатом и счастливой монеткой.', cfg: fight(1, 'boss', ['tide']) },
      { id: 'boss3', name: 'Кривое зеркало', desc: 'Босс котельной: пока блестит, отражает часть удара. Множ-сборка 3-го отдела с пробойником.', cfg: fight(2, 'boss', ['mirror']) },
      { id: 'boss4', name: 'Главный цензор', desc: 'Финальный босс дирекции: цензура и красная печать. Полная сборка с лампой против цензуры.', cfg: fight(3, 'boss', ['censor']) },
    ],
  },
  {
    group: 'Начальство',
    items: [
      { id: 'elite-neighbor', name: 'Сосед', desc: 'Элита 1-го отдела: волокита и тяжёлые удары.', cfg: fight(0, 'elite', ['neighbor']) },
      { id: 'elite-cabinet', name: 'Картотека', desc: 'Элита 1-го отдела: выпускает крыс и заливает поле кляксами.', cfg: fight(0, 'elite', ['cabinet']) },
      { id: 'elite-anchor', name: 'Якорь и писарь', desc: 'Элита архива: якорь запирает столбцы, писарь льёт кляксы.', cfg: fight(1, 'elite', ['anchor', 'scribe']) },
      { id: 'elite-crabs', name: 'Два краба', desc: 'Элита архива: клешни двигают строки поля.', cfg: fight(1, 'elite', ['crab', 'crab']) },
      { id: 'elite-safe', name: 'Сейф и огарок', desc: 'Элита котельной: броня 3 и щит, огарок лечит союзника.', cfg: fight(2, 'elite', ['safe', 'candle']) },
      { id: 'elite-archivist', name: 'Архивариус и звонарь', desc: 'Элита котельной: цензура плюс тяжёлый колокол.', cfg: fight(2, 'elite', ['archivist', 'bell']) },
      { id: 'elite-stamps', name: 'Две печати', desc: 'Элита дирекции: скобы на фишках и сильные удары.', cfg: fight(3, 'elite', ['stamp', 'stamp']) },
      { id: 'elite-secretaries', name: 'Секретари и архивариус', desc: 'Элита дирекции: три врага, цензура и лечение.', cfg: fight(3, 'elite', ['secretary', 'secretary', 'archivist']) },
    ],
  },
  {
    group: 'Связки предметов',
    items: [
      {
        id: 'combo-cascade',
        name: 'Каскады и множ',
        desc: 'Плакат (+1 множ за волну), радужная скрепка, бесконечная ручка, динамит, гирлянда; точилки бьют впятеро в каскаде.',
        cfg: combo(build(deck(['sharpener', 4], ['scissors', 2], ['bonus', 2], ['alarm', 1], ['folder', 2], ['ink', 1]), ['poster', 'prismpact', 'pen', 'dynamite', 'garland'], 'giftbox', ['bomb'])),
      },
      {
        id: 'combo-gold',
        name: 'Золото бьёт',
        desc: 'Кассовый аппарат (золотые фишки бьют), кошелёк, калькулятор, книга; колода из монет, чеков, золотой скрепки и отчёта.',
        cfg: combo(build(deck(['coin', 3], ['receipt', 3], ['goldclip', 1], ['report', 1], ['card', 1], ['folder', 2]), ['register', 'wallet', 'calculator', 'ledger'], 'megaphone')),
      },
      {
        id: 'combo-ink',
        name: 'Чернила и навык',
        desc: 'Чернильница (фиолетовые бьют), картридж, батарейка, лампа; перья, кляксы, копирка и шредер.',
        cfg: combo(build(deck(['ink', 3], ['quill', 2], ['blotcurse', 2], ['carbon', 1], ['weight', 1], ['fist', 2]), ['inkwell', 'inkpot', 'battery', 'lamp'], 'shredder')),
      },
      {
        id: 'combo-armor',
        name: 'Броня бьёт',
        desc: 'Двусторонний скотч (броня хода бьёт цель), зажим, жилет охранника, кактус; бронежилет удваивает броню хода.',
        cfg: combo(build(deck(['binder', 3], ['vest', 1], ['laminator', 2], ['drawer', 1], ['archivebox', 1], ['clipboard', 1], ['fist', 2]), ['tape', 'binderclip', 'vestrelic', 'cactus'], 'corrector')),
      },
      {
        id: 'combo-bleed',
        name: 'Кровь и огонь',
        desc: 'Ржавое лезвие (кровотечение), спичка (поджог), самолётик (урон всем), двойной эспрессо; красные ручки и кнопки.',
        cfg: combo(build(deck(['redpen', 3], ['pins', 2], ['scissors', 2], ['stapler', 1], ['folder', 2]), ['rustyblade', 'match', 'plane', 'espresso', 'coffee'], 'stapler'), ['rat', 'rat', 'drop']),
      },
      {
        id: 'combo-luck',
        name: 'Удача и хаос',
        desc: 'Счастливая монетка, кривой калькулятор (множ ×0,5–2,5), кофемашина, грамота, пачка копирки.',
        cfg: combo(build(deck(['fist', 3], ['bonus', 2], ['goldclip', 1], ['card', 1], ['folder', 2], ['clip', 2]), ['lucky', 'calc2', 'coffeemachine', 'award', 'carbonpack'], 'coffeeToGo')),
      },
      {
        id: 'combo-time',
        name: 'Контроль времени',
        desc: 'Сломанные часы, ночная смена, ведро льда, кофе с собой, стикеры «Срочно»: враги почти не ходят.',
        cfg: combo(build(deck(['urgent', 2], ['weight', 2], ['umbrella', 2], ['binder', 2], ['fist', 2]), ['clock', 'nightshift', 'ice'], 'coffeeToGo', ['sticker', 'sticker', 'coffee']), ['bell', 'eraser']),
      },
      {
        id: 'combo-paper',
        name: 'Бумажный убийца',
        desc: 'Нож (×2 по бумаге), резаки (×3 по бумаге), табель, пробойник — против бумажных врагов.',
        cfg: combo(build(deck(['cutter', 3], ['fist', 2], ['scissors', 1], ['folder', 2]), ['knife', 'timesheet', 'puncher'], 'eraser'), ['rat', 'moth', 'kipa']),
      },
      {
        id: 'combo-ring',
        name: 'Кольцо и ракеты',
        desc: 'Кольцевая скоба (края поля соединены), ручка (ракеты крестом), динамит 5×5: проверка обменов через край.',
        cfg: combo(build(deck(['ruler', 2], ['scissors', 2], ['fist', 2], ['folder', 2], ['ink', 1]), ['ring', 'pen', 'dynamite'], 'eraser', ['bomb'])),
      },
      {
        id: 'combo-pockets',
        name: 'Бомбы и карманы',
        desc: 'Портфель (+2 кармана), три бомбы, динамит, гирлянда и коробка с сюрпризом.',
        cfg: combo(build(deck(['fist', 3], ['folder', 2], ['ink', 2], ['clip', 2]), ['pocketbag', 'dynamite', 'garland'], 'giftbox', ['bomb', 'bomb', 'bomb'])),
      },
    ],
  },
  {
    group: 'Механики врагов',
    items: [
      { id: 'mech-split', name: 'Кляксы распадаются', desc: 'Две кляксы: заливают фишки и распадаются на капли.', cfg: fight(0, 'fight', ['blot', 'blot']) },
      { id: 'mech-pins', name: 'Скобы', desc: 'Два скобогрыза прибивают фишки: их нельзя сдвинуть.', cfg: fight(0, 'fight', ['stapler', 'stapler']) },
      { id: 'mech-tape', name: 'Волокита', desc: 'Два копира засыпают поле волокитой.', cfg: fight(0, 'fight', ['copier', 'copier']) },
      { id: 'mech-hurry', name: 'Звонок торопит', desc: 'Телефон ускоряет крыс.', cfg: fight(0, 'fight', ['phone', 'rat', 'rat']) },
      { id: 'mech-summon', name: 'Призыв', desc: 'Картотека выпускает крыс из ящиков.', cfg: fight(0, 'elite', ['cabinet']) },
      { id: 'mech-steal', name: 'Кража', desc: 'Моль ест чернила, удильщик крадёт монеты.', cfg: fight(1, 'fight', ['moth', 'angler']) },
      { id: 'mech-crab', name: 'Клешня', desc: 'Краб двигает строку поля сам.', cfg: fight(1, 'fight', ['crab']) },
      { id: 'mech-diver', name: 'Ныряльщики', desc: 'Угри ныряют: прямые удары не достают, взрывы и урон всем — достают.', cfg: fight(1, 'fight', ['eel', 'eel']) },
      { id: 'mech-anchor', name: 'Якорь', desc: 'Столбец не двигается 3 хода.', cfg: fight(1, 'fight', ['anchor']) },
      { id: 'mech-ember', name: 'Угольки', desc: 'Кочегары роняют угольки с фитилём; перчатки из связок от них защищают.', cfg: fight(2, 'fight', ['stoker', 'stoker']) },
      { id: 'mech-censor', name: 'Цензура', desc: 'Архивариус закрывает фишки плашками. Попробуй с лампой и без.', cfg: fight(2, 'fight', ['archivist', 'candle']) },
      { id: 'mech-heavy', name: 'Тяжёлые удары', desc: 'Звонарь и ластик-вышибала: долгий замах, больно.', cfg: fight(2, 'fight', ['bell', 'eraser']) },
      { id: 'mech-armor', name: 'Броня и щит', desc: 'Сейф-страж: броня 3 и щит. Проверка пробойника и дырокола.', cfg: fight(2, 'fight', ['safe']) },
      { id: 'mech-heal', name: 'Лечение', desc: 'Секретари закрывают бумаги и лечат друг друга.', cfg: fight(3, 'fight', ['secretary', 'secretary']) },
    ],
  },
  {
    group: 'Места',
    items: [
      { id: 'place-shop', name: 'Касса, 500 монет', desc: 'Магазин 2-го отдела с полным кошельком.', cfg: { char: 'intern', act: 1, place: 'shop', hero: { coins: 500 }, build: ACT_BUILD[1] } },
      { id: 'place-rest', name: 'Кулер', desc: 'Отдых: вылечиться или улучшить фишку.', cfg: { char: 'intern', act: 0, place: 'rest', hero: { hp: 20 }, build: ACT_BUILD[0] } },
      { id: 'place-treasure', name: 'Сейф', desc: 'Сокровище: предмет и монеты.', cfg: { char: 'intern', act: 0, place: 'treasure' } },
      { id: 'place-bossreward', name: 'Награда босса', desc: 'Выбор одного из трёх предметов босса.', cfg: { char: 'intern', act: 0, place: 'bossReward' } },
      { id: 'place-event', name: 'Случайное событие', desc: 'Служебная записка с выбором.', cfg: { char: 'intern', act: 0, place: 'event', hero: { coins: 200 } } },
      { id: 'place-map', name: 'Карта 3-го отдела', desc: 'План эвакуации котельной, ходить можно куда угодно.', cfg: { char: 'intern', act: 2, place: 'map', build: ACT_BUILD[2], cheats: { anywhere: true } } },
    ],
  },
  {
    group: 'Стресс-тесты',
    items: [
      { id: 'stress-numbers', name: 'Огромные числа', desc: 'Урон героя ×100 и множ-сборка: как счётчик и числа урона выглядят на миллионах.', cfg: fight(2, 'boss', ['mirror'], { cheats: { heroDmg: 100 } }) },
      { id: 'stress-three', name: 'Три сильных врага', desc: 'Сейф, звонарь и кочегар в 3-м отделе, с бессмертием: плотность эффектов на экране.', cfg: fight(2, 'fight', ['safe', 'bell', 'stoker'], { cheats: { god: true } }) },
      { id: 'stress-long', name: 'Долгий бой', desc: 'Враги ×10 здоровья и бессмертие: сверхурочные после 20 ходов.', cfg: fight(0, 'fight', ['copier', 'rat'], { cheats: { god: true, enemyHp: 10 } }) },
      { id: 'stress-lowhp', name: 'На волоске', desc: '1 здоровье и флешка: смертельный удар оставляет 1.', cfg: { ...fight(0, 'fight', ['rat', 'rat']), hero: { hp: 1 }, build: { ...ACT_BUILD[0], relics: [...ACT_BUILD[0].relics, 'flash'] } } },
      { id: 'stress-thin', name: 'Тонкая колода', desc: 'Пять фишек — минимум колоды.', cfg: combo(build(deck(['fist', 2], ['folder', 1], ['ink', 1], ['clip', 1]), ['knife'], 'eraser')) },
      { id: 'stress-fat', name: 'Толстая колода', desc: '30 фишек всех семейств: мешок и поле на большой колоде.', cfg: combo(build(deck(['fist', 4], ['scissors', 3], ['redpen', 2], ['pins', 2], ['folder', 4], ['binder', 3], ['ink', 4], ['quill', 2], ['clip', 3], ['coin', 3]), ['knife'], 'eraser')) },
      {
        id: 'stress-all',
        name: 'Все предметы сразу',
        desc: 'Каждый пассивный предмет игры на одном герое: проверка, что они уживаются вместе.',
        cfg: combo(
          build(ACT_BUILD[2].deck, ['knife', 'calculator', 'mop', 'coffee', 'binderclip', 'inkpot', 'wallet', 'vestrelic', 'sandwich', 'bowl', 'gum', 'ledger', 'loupe', 'gloves', 'battery', 'spider', 'cactus', 'inkwell', 'register', 'tape', 'rustyblade', 'match', 'ice', 'plane', 'lucky', 'dynamite', 'garland', 'timesheet', 'calc2', 'lamp', 'ring', 'pen', 'clock', 'puncher', 'poster', 'coffeemachine', 'carbonpack', 'flash', 'award', 'nightshift', 'espresso', 'pocketbag', 'stamprelic', 'prismpact'], 'giftbox', ['bomb', 'energy', 'coffee']),
          ['copier', 'rat', 'blot'],
        ),
      },
    ],
  },
  {
    group: 'Герои',
    items: [
      { id: 'hero-intern', name: 'Стажёр · старт', desc: 'Стартовая колода стажёра против первой встречи.', cfg: { char: 'intern', act: 0, place: 'fight', enemies: ['rat'] } },
      { id: 'hero-accountant', name: 'Бухгалтер · старт', desc: 'Стартовая колода бухгалтера: золото даёт множ.', cfg: { char: 'accountant', act: 0, place: 'fight', enemies: ['rat'] } },
      { id: 'hero-janitor', name: 'Уборщик · старт', desc: 'Стартовая колода уборщика: грязь на поле — броня.', cfg: { char: 'janitor', act: 0, place: 'fight', enemies: ['copier'] } },
    ],
  },
];

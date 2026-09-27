import { ITEMS } from '../game/content/items.ts';
import { cheatList } from './dev-cheats.ts';
import type { DevBuild, DevStart } from './dev.ts';

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

/**
 * A kit: gear (a colour left out keeps the plain item; the last listed of a colour is held),
 * upgrades, items, the skill and pockets.
 */
function build(gear: string[], relics: string[], active: string | null, pockets: (string | null)[] = [], ups: string[] = [], tape = 0): DevBuild {
  return { gear, equip: gear, ups, tape, relics, active, pockets: [...pockets, null, null, null].slice(0, 3) };
}

/** A build that belongs to each act: the first three are what a decent run holds by then. */
const ACT_BUILD: DevBuild[] = [
  build(['knife', 'scissors', 'shield', 'binder', 'battery', 'quill', 'penny', 'bonus'], ['badge', 'coffee', 'vestrelic'], 'eraser', ['coffee', 'bomb']),
  build(
    ['knife', 'staplegun', 'scissors', 'shield', 'laminator', 'drawer', 'battery', 'carbon', 'quill', 'penny', 'bonus', 'report'],
    ['badge', 'coffee', 'binderclip', 'poster', 'lucky', 'timesheet'],
    'stapler',
    ['bomb', 'choco', 'coffee'],
    ['scissors'],
  ),
  build(
    ['scissors', 'punch', 'cutter', 'drawer', 'laminator', 'foldervest', 'quill', 'carbon', 'copystamp', 'bonus', 'report', 'goldclip'],
    ['badge', 'espresso', 'poster', 'award', 'coffeemachine', 'carbonpack', 'puncher'],
    'shredder',
    ['bomb', 'bomb', 'choco'],
    ['cutter', 'drawer'],
  ),
  build(
    ['cutter', 'scissors', 'awl', 'drawer', 'clipboard', 'foldervest', 'quill', 'copystamp', 'carbon', 'bonus', 'report', 'goldclip'],
    ['badge', 'espresso', 'poster', 'award', 'coffeemachine', 'carbonpack', 'puncher', 'lamp', 'stamprelic', 'pen', 'lucky'],
    'giftbox',
    ['bomb', 'choco', 'sticker'],
    ['awl', 'foldervest', 'quill', 'goldclip', 'report'],
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

/** A synergy test: act 1, a sturdy enemy pair with triple health (a cheat), so the combo has time to show. */
const combo = (b: DevBuild, enemies = ['copier', 'rat'], extra: Partial<DevStart> = {}): DevStart => ({
  char: 'intern',
  act: 0,
  place: 'fight',
  enemies,
  build: b,
  cheats: { enemyHp: 3 },
  ...extra,
});

/** Every test that uses cheats says so in its description (and the panel marks the tile). */
function sayCheats(item: DevSuiteItem): DevSuiteItem {
  const list = cheatList(item.cfg.cheats);
  if (!list.length || /(^|[^а-яё])чит/i.test(item.desc)) return item;
  return { ...item, desc: `С читами: ${list.join(', ')}. ${item.desc}` };
}

const SUITES: DevSuite[] = [
  {
    group: 'Боссы',
    items: [
      { id: 'boss1', name: 'Надзирательница', desc: 'Босс 1-го отдела. Сборка середины отдела 1: нож и ножницы, премия, кофе.', cfg: fight(0, 'boss', ['supervisor']) },
      { id: 'boss2', name: 'Хранитель прилива', desc: 'Босс архива: поднимает воду по строкам. Сборка к концу 2-го отдела с плакатом и счастливой монеткой.', cfg: fight(1, 'boss', ['tide']) },
      { id: 'boss3', name: 'Кривое зеркало', desc: 'Босс котельной: пока блестит, каждый удар по нему стоит сердца. Сборка 3-го отдела: ножницы, резак, дырокол, пробойник.', cfg: fight(2, 'boss', ['mirror']) },
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
        name: 'Каскады',
        desc: 'Плакат (+15% урона за волну), радужная скрепка, бесконечная ручка, динамит, гирлянда; точилка в руке бьёт втрое в каскаде.',
        cfg: combo(build(['knife', 'sharpener', 'bonus'], ['poster', 'prismpact', 'pen', 'dynamite', 'garland'], 'giftbox', ['bomb'])),
      },
      {
        id: 'combo-gold',
        name: 'Золото бьёт',
        desc: 'Кассовый аппарат (золотые фишки бьют), кошелёк, калькулятор, книга; в жёлтой руке чек, отчёт и золотая скрепка.',
        cfg: combo(build(['receipt', 'report', 'goldclip'], ['register', 'wallet', 'calculator', 'ledger'], 'megaphone')),
      },
      {
        id: 'combo-ink',
        name: 'Чернила и навык',
        desc: 'Чернильница (фиолетовые бьют), картридж, пауэрбанк, лампа; в фиолетовой руке перо, копирка и клякса, навык — шредер.',
        cfg: combo(build(['quill', 'carbon', 'blotcurse'], ['inkwell', 'inkpot', 'powerbank', 'lamp'], 'shredder')),
      },
      {
        id: 'combo-armor',
        name: 'Броня бьёт',
        desc: 'Двусторонний скотч (броня хода бьёт цель), зажим, жилет охранника, кактус; бронежилет из папок удваивает броню хода.',
        cfg: combo(build(['laminator', 'archivebox', 'foldervest'], ['tape', 'binderclip', 'vestrelic', 'cactus'], 'corrector')),
      },
      {
        id: 'combo-bleed',
        name: 'Кровь и огонь',
        desc: 'Ржавое лезвие (кровотечение), спичка (поджог), самолётик (урон всем), двойной эспрессо; ножницы в руке.',
        cfg: combo(build(['knife', 'scissors'], ['rustyblade', 'match', 'plane', 'espresso', 'coffee'], 'stapler'), ['rat', 'rat', 'drop']),
      },
      {
        id: 'combo-luck',
        name: 'Удача и хаос',
        desc: 'Счастливая монетка, кривой калькулятор (урон −50%…+100%), кофемашина, грамота, пачка копирки.',
        cfg: combo(build(['bonus', 'creditcard', 'goldclip'], ['lucky', 'calc2', 'coffeemachine', 'award', 'carbonpack'], 'coffeeToGo')),
      },
      {
        id: 'combo-time',
        name: 'Контроль времени',
        desc: 'Сломанные часы, ночная смена, ведро льда, кофе с собой; печать «Срочно» и зонтик в руках: враги почти не ходят.',
        cfg: combo(build(['weight', 'urgent', 'binder', 'umbrella'], ['clock', 'nightshift', 'ice'], 'coffeeToGo', ['sticker', 'sticker', 'coffee']), ['bell', 'eraser']),
      },
      {
        id: 'combo-paper',
        name: 'Бумажный убийца',
        desc: 'Нож и резак (по бумаге +100% и +200%), табель, пробойник — против бумажных врагов.',
        cfg: combo(build(['knife', 'cutter'], ['timesheet', 'puncher'], 'eraser'), ['rat', 'moth', 'kipa']),
      },
      {
        id: 'combo-ring',
        name: 'Кольцо и ракеты',
        desc: 'Кольцевая скоба (предмет босса: края поля соединены), ручка (ракеты крестом), динамит 5×5: проверка обменов через край.',
        cfg: combo(build(['ruler'], ['ring', 'pen', 'dynamite'], 'eraser', ['bomb'])),
      },
      {
        id: 'combo-weapons',
        name: 'Полные руки',
        desc: 'По три вещи каждого цвета, пропуск (смена за 1 энергию) и картридж: меняй вещи посреди боя.',
        cfg: combo(build(['scissors', 'awl', 'knife', 'umbrella', 'clipboard', 'shield', 'quill', 'weight', 'battery', 'bonus', 'piggy', 'penny'], ['badge', 'inkpot'], 'eraser')),
      },
      {
        id: 'combo-pockets',
        name: 'Бомбы и карманы',
        desc: 'Портфель (+2 кармана), три бомбы, динамит, гирлянда и коробка с сюрпризом.',
        cfg: combo(build([], ['pocketbag', 'dynamite', 'garland'], 'giftbox', ['bomb', 'bomb', 'bomb'])),
      },
    ],
  },
  {
    group: 'Снаряжение',
    items: [
      { id: 'gear-red', name: 'Красные: ножницы', desc: 'Ножницы в руке: кровотечение с каждой красной группы, двойное лезвие из четырёх.', cfg: combo(build(['knife', 'scissors'], [], 'eraser')) },
      { id: 'gear-blue', name: 'Синие: планшет', desc: 'Планшет в руке: следующий удар врага бьёт и его.', cfg: combo(build(['shield', 'clipboard'], [], 'eraser'), ['bell', 'rat']) },
      { id: 'gear-violet', name: 'Фиолетовые: клякса', desc: 'Клякса в руке: фиолетовые бьют всех вместо энергии.', cfg: combo(build(['battery', 'blotcurse'], [], 'eraser'), ['rat', 'rat', 'drop']) },
      { id: 'gear-gold', name: 'Жёлтые: кредитка', desc: 'Кредитка в руке: жёлтая группа — +6 урона за фишку, но стоит монету.', cfg: combo(build(['penny', 'creditcard'], [], 'eraser'), undefined, { hero: { coins: 40 } }) },
      { id: 'gear-ups', name: 'Всё улучшено', desc: 'Простые вещи, все улучшены: нож+, щит+, батарейка+, монетка+.', cfg: combo(build([], [], 'eraser', [], ['knife', 'shield', 'battery', 'penny'])) },
    ],
  },
  {
    group: 'Поле',
    items: [
      {
        id: 'board-big',
        name: 'Поле 8×7',
        desc: 'Удлинитель и раскладной стол: поле шире на два столбца и выше на строку; брошюровщик даёт +50% урона за группу из 5.',
        cfg: combo(build([], ['extension', 'foldtable', 'binding'], 'eraser')),
      },
      {
        id: 'board-small',
        name: 'Тесная каморка',
        desc: 'Поле уже на столбец, зато урон +100%: меньше ходов, крупнее удар.',
        cfg: combo(build([], ['closet'], 'eraser')),
      },
      {
        id: 'board-moves',
        name: 'Рулетка и угольник',
        desc: 'Фишку можно протащить по всему ряду, меняться можно и по диагонали; скрепочница кладёт две ракеты в начале боя.',
        cfg: combo(build([], ['tapemeasure', 'setsquare', 'clipholder'], 'eraser')),
      },
      {
        id: 'board-turnstile',
        name: 'Турникет',
        desc: 'Пока он в бою, фишки ходят только вверх и вниз (и рулетка тоже). Убей его первым — вернутся обмены вбок.',
        cfg: fight(0, 'fight', ['turnstile', 'drop']),
      },
      {
        id: 'board-storekeeper',
        name: 'Кладовщица',
        desc: 'Начальство архива: пока она в бою, поле на столбец уже; упадёт — столбец вернётся.',
        cfg: fight(1, 'elite', ['storekeeper', 'scribe']),
      },
      {
        id: 'board-destapler',
        name: 'Антистеплер против скоб',
        desc: 'Скобогрызы прибивают фишки, якорь запирает столбцы — с антистеплером всё ходит.',
        cfg: fight(0, 'fight', ['stapler', 'stapler'], { build: { ...ACT_BUILD[0], relics: [...ACT_BUILD[0].relics, 'destapler'] } }),
      },
      {
        id: 'board-abacus',
        name: 'Счёты и золото',
        desc: 'Счёты (+10% урона следующему удару за золотую фишку) без калькулятора: проверка, что золото работает у любого героя.',
        cfg: combo(build(['receipt', 'bonus'], ['abacus', 'calendar'], 'eraser')),
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
      { id: 'mech-steal', name: 'Кража', desc: 'Моль ест энергию, удильщик крадёт монеты.', cfg: fight(1, 'fight', ['moth', 'angler']) },
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
      { id: 'place-rest', name: 'Кулер', desc: 'Отдых: вылечиться или улучшить вещь.', cfg: { char: 'intern', act: 0, place: 'rest', hero: { hp: 3 }, build: ACT_BUILD[0] } },
      { id: 'place-treasure', name: 'Сейф', desc: 'Сокровище: предмет и монеты.', cfg: { char: 'intern', act: 0, place: 'treasure' } },
      { id: 'place-bossreward', name: 'Награда босса', desc: 'Выбор одного из трёх предметов босса.', cfg: { char: 'intern', act: 0, place: 'bossReward' } },
      { id: 'place-event', name: 'Случайное событие', desc: 'Служебная записка с выбором.', cfg: { char: 'intern', act: 0, place: 'event', hero: { coins: 200 } } },
      { id: 'place-map', name: 'Карта 3-го отдела', desc: 'План эвакуации котельной: любой узел открыт для входа.', cfg: { char: 'intern', act: 2, place: 'map', build: ACT_BUILD[2], cheats: { anywhere: true } } },
    ],
  },
  {
    group: 'Стресс-тесты',
    items: [
      { id: 'stress-numbers', name: 'Огромные числа', desc: 'С читом «урон героя ×100»: итог каждого удара умножается на 100 после всех бонусов. Сборка 3-го отдела против Кривого зеркала — проверка, как выглядят числа на десятках и сотнях тысяч.', cfg: fight(2, 'boss', ['mirror'], { cheats: { heroDmg: 100 } }) },
      { id: 'stress-three', name: 'Три сильных врага', desc: 'С читом «бессмертие». Сейф, звонарь и кочегар в 3-м отделе: плотность эффектов на экране.', cfg: fight(2, 'fight', ['safe', 'bell', 'stoker'], { cheats: { god: true } }) },
      { id: 'stress-long', name: 'Долгий бой', desc: 'С читами «здоровье врагов ×10» и «бессмертие»: бой тянется до сверхурочных после 20 ходов.', cfg: fight(0, 'fight', ['copier', 'rat'], { cheats: { god: true, enemyHp: 10 } }) },
      { id: 'stress-lowhp', name: 'На волоске', desc: 'Половинка сердца и флешка: смертельный удар оставляет половинку.', cfg: { ...fight(0, 'fight', ['rat', 'rat']), hero: { hp: 1 }, build: { ...ACT_BUILD[0], relics: [...ACT_BUILD[0].relics, 'flash'] } } },
      { id: 'stress-thin', name: 'Только простые вещи', desc: 'Нож, щит, батарейка и монетка без предметов: так начинается каждая смена.', cfg: combo(build([], [], 'eraser')) },
      { id: 'stress-fat', name: 'Волокита', desc: 'Три Волокиты в мешке: треть поля — мусор, который убирают только соседние группы.', cfg: combo(build([], [], 'eraser', [], [], 3)) },
      {
        id: 'stress-all',
        name: 'Все предметы сразу',
        desc: 'Каждый пассивный предмет игры и полные руки вещей на одном герое: проверка, что они уживаются вместе.',
        cfg: combo(
          build(ACT_BUILD[2].gear, Object.values(ITEMS).filter((i) => i.kind === 'passive').map((i) => i.id), 'giftbox', ['bomb', 'choco', 'coffee'], ACT_BUILD[2].ups),
          ['copier', 'rat', 'blot'],
        ),
      },
    ],
  },
  {
    group: 'Герои',
    items: [
      { id: 'hero-intern', name: 'Стажёр · старт', desc: 'Простые вещи стажёра против первой встречи.', cfg: { char: 'intern', act: 0, place: 'fight', enemies: ['rat'] } },
      { id: 'hero-accountant', name: 'Бухгалтер · старт', desc: 'Бухгалтер: калькулятор, в мешке больше жёлтых.', cfg: { char: 'accountant', act: 0, place: 'fight', enemies: ['rat'] } },
      { id: 'hero-janitor', name: 'Уборщик · старт', desc: 'Уборщик: файлик вместо щита, грязь на поле — броня.', cfg: { char: 'janitor', act: 0, place: 'fight', enemies: ['copier'] } },
    ],
  },
];

export const DEV_SUITES: DevSuite[] = SUITES.map((suite) => ({ ...suite, items: suite.items.map(sayCheats) }));

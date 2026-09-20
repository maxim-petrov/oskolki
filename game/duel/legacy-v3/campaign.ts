import type { ItemId, SpellId } from './catalog.ts';
export const ROOMS_PER_BIOME = 5;
export const BIOMES = [
  {
    id: 'office',
    name: 'Канцелярия',
    description: 'Освойте общее поле. Простые вещи и первые сочетания.',
    mechanic: 'Черепа, защита и подготовка четвёрок.',
    loot: 'Обычно Common. Усиленный враг — шанс Uncommon. Босс гарантирует Uncommon или лучше.',
  },
  {
    id: 'archive',
    name: 'Затопленный архив',
    description: 'Вода оживила старые счета и папки.',
    mechanic:
      'Враги лечатся, крадут ману и защищаются запасами. Забирайте нужные им цвета.',
    loot: 'Common и Uncommon. Rare — чаще за усиленного врага, гарантирован за босса.',
  },
  {
    id: 'press',
    name: 'Печатная котельная',
    description: 'Чернила кипят, станки печатают взрывные черепа.',
    mechanic:
      'Огонь, взрывы и монеты. Подготовленный череп может забрать любая сторона.',
    loot: 'Uncommon и Rare. Very Rare — за усиленного врага или босса.',
  },
  {
    id: 'directorate',
    name: 'Дирекция',
    description: 'За последней дверью работают правила всей сборки.',
    mechanic:
      'Смешанные стихии, длинные совпадения и отражение. Выбирайте момент сильного удара.',
    loot: 'Rare и Very Rare. Небольшой шанс Legendary, выше у усиленного врага.',
  },
] as const;
export type EncounterKind = 'normal' | 'elite' | 'boss';
export const ENCOUNTER_NAMES: Record<EncounterKind, string> = {
  normal: 'Бой',
  elite: 'Усиленный враг',
  boss: 'Босс',
};
export type Encounter = {
  name: string;
  art: string;
  hp: number;
  mastery: number;
  battle: number;
  spells: SpellId[];
  gear: ItemId[];
  trait: string;
  biome: number;
  kind: EncounterKind;
};
const row = (
  name: string,
  art: string,
  hp: number,
  spells: SpellId[],
  gear: ItemId[],
  trait: string,
) => ({ name, art, hp, spells, gear, trait });
export const ENCOUNTERS: Encounter[] = [
  row(
    'Бумажная крыса',
    'paper-rat',
    28,
    ['bolt'],
    [],
    'Копит огонь для Разряда. Забирайте красные совпадения.',
  ),
  row(
    'Архивариус',
    'librarian',
    34,
    ['mend'],
    ['lens'],
    'Звёзды дают ему воздух; вода и земля нужны для лечения.',
  ),
  row(
    'Сборщик долгов',
    'raider',
    38,
    ['forge'],
    ['paperKnife'],
    'Создаёт черепа и усиливает первую волну. Не оставляйте готовые удары.',
  ),
  row(
    'Редактор',
    'redactor',
    44,
    ['bolt', 'erase'],
    ['coat'],
    'Куртка поглощает 2 урона за действие. Сильный удар эффективнее мелких.',
  ),
  row(
    'Цензор',
    'censor',
    54,
    ['forge', 'bomb'],
    ['chargeSeal', 'pocketVest'],
    'Босс: начинает с барьером. Четвёрки черепов получают +4; взрыв доступен и вам.',
  ),
  row(
    'Мокрый каталог',
    'wet-catalog',
    48,
    ['mend', 'transmute'],
    ['tideNeedle'],
    'Превращает землю в воду, сбор воды наносит урон.',
  ),
  row(
    'Смотритель шлюза',
    'sluice-guard',
    52,
    ['bolt', 'wall'],
    ['apron'],
    'Земля даёт барьер; Стена расходует его ману на защиту.',
  ),
  row(
    'Переписчик счетов',
    'account-scribe',
    56,
    ['drain', 'forge'],
    ['fireSeal'],
    'Черепа питают огонь для кражи маны. Прерывайте цепочку ресурсов.',
  ),
  row(
    'Коллектор',
    'collector',
    64,
    ['drain', 'mend'],
    ['answerCloak', 'tideNeedle'],
    'Усиленный: после потери HP заряжает ответ черепами; вода лечит и ранит.',
  ),
  row(
    'Хранитель глубин',
    'depth-keeper',
    74,
    ['drain', 'wall', 'transmute'],
    ['fullBlade', 'overflowRobe'],
    'Босс: полные запасы усиливают черепа. Его Стена расходует эти же запасы.',
  ),
  row(
    'Угольный курьер',
    'coal-courier',
    66,
    ['bolt', 'forge'],
    ['emberKnife'],
    'Огонь заряжает нож; следующая волна черепов получает +3.',
  ),
  row(
    'Печатник',
    'printer',
    70,
    ['forge', 'bomb'],
    ['wick'],
    'Четвёрка огня готовит взрыв. Заберите его раньше печатника.',
  ),
  row(
    'Кассир топки',
    'furnace-cashier',
    74,
    ['bolt', 'mend'],
    ['ledger', 'abacus'],
    'Монеты дают барьер и заряжают +6 к следующей волне черепов.',
  ),
  row(
    'Перегретый корректор',
    'hot-editor',
    76,
    ['bolt', 'drain'],
    ['glassNib', 'saltCoat'],
    'Усиленный: +5 к прямой магии, но первое попадание по нему получает +1.',
  ),
  row(
    'Главный печатный станок',
    'press-boss',
    96,
    ['forge', 'bomb', 'bolt'],
    ['quarterCutter', 'wick', 'fireSeal'],
    'Босс: тройки черепов слабы, четвёрки получают +8. Взрывы сохраняют урон.',
  ),
  row(
    'Аудитор',
    'auditor',
    84,
    ['drain', 'mend'],
    ['contractBlade', 'bloodInkwell'],
    'Оплачивает скидку здоровьем; ниже половины HP черепа получают +5.',
  ),
  row(
    'Стеклянный советник',
    'glass-adviser',
    88,
    ['bolt', 'wall'],
    ['glassNib', 'metronome'],
    'Воздух заряжает прямую магию. Его стеклянное оружие повышает входящий урон.',
  ),
  row(
    'Секретарь смены',
    'shift-secretary',
    92,
    ['forge', 'transmute', 'bolt'],
    ['prism', 'eclipseRing'],
    'Длинные совпадения дают ману за здоровье, три стихии — урон и барьер.',
  ),
  row(
    'Первый заместитель',
    'deputy',
    94,
    ['bolt', 'drain', 'forge'],
    ['goldenLining', 'carbonPaper'],
    'Усиленный: копирует часть прямого урона, а монеты тратит на лечение.',
  ),
  row(
    'Директор бесконечной смены',
    'director',
    120,
    ['bolt', 'transmute', 'forge', 'drain'],
    ['directorPen', 'mirrorVest', 'conductor'],
    'Босс: четыре цветные печати дают удар и барьер. Барьер отражает до 3 урона за действие.',
  ),
].map((f, i) => ({
  ...f,
  biome: Math.floor(i / 5),
  kind: i % 5 === 4 ? 'boss' : i % 5 === 3 ? 'elite' : 'normal',
  mastery: 1 + Math.floor(i / 5) * 2 + Math.floor((i % 5) / 2),
  battle: Math.floor(i / 5) * 2 + (i % 5 >= 3 ? 2 : 0),
}));
export const biomeAt = (room: number) => BIOMES[ENCOUNTERS[room].biome];
export const victoryReward = (room: number) => {
  const e = ENCOUNTERS[room];
  return (
    8 + e.biome * 3 + (e.kind === 'boss' ? 10 : e.kind === 'elite' ? 5 : 0)
  );
};
export const restHealing = (room: number) =>
  ENCOUNTERS[room].kind === 'boss' ? 36 : 16 + ENCOUNTERS[room].biome * 3;

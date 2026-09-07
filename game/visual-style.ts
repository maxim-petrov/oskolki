export const VISUAL_STYLES = [
  {
    id: 'crypt',
    name: 'Крипта',
    description: 'Тёмное фэнтези',
    arena: '/art/crypt-arena.png',
    arenaAlt: 'Древние своды крипты',
  },
  {
    id: 'royal',
    name: 'Королевство',
    description: 'Яркое приключение',
    arena: '/art/royal/arena.png',
    arenaAlt: 'Солнечный двор сказочного замка',
  },
  {
    id: 'pixel',
    name: 'Пиксели',
    description: 'В духе Shovel Knight',
    arena: '/art/pixel/arena.png',
    arenaAlt: 'Пиксельное подземелье с голубым камнем и лианами',
  },
  {
    id: 'paper',
    name: 'Бумажный мир',
    description: 'В духе The Stick of Truth',
    arena: '/art/paper/arena.png',
    arenaAlt: 'Заснеженный двор с самодельной крепостью из картона',
  },
  {
    id: 'cartoon',
    name: 'Мультрыцари',
    description: 'В духе Castle Crashers',
    arena: '/art/cartoon/arena.png',
    arenaAlt: 'Рисованная лесная крепость с кривыми башнями и частоколом',
  },
  {
    id: 'darktale',
    name: 'Тёмная сказка',
    description: 'В духе Deltarune',
    arena: '/art/dark-tale/arena.png',
    arenaAlt: 'Тёмная пиксельная арена с фиолетовой сеткой, алыми ивами и голубой аркой',
  },
] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number]['id'];
export function isVisualStyle(value: unknown): value is VisualStyle {
  return VISUAL_STYLES.some((style) => style.id === value);
}

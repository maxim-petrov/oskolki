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
] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number]['id'];
export function isVisualStyle(value: unknown): value is VisualStyle {
  return VISUAL_STYLES.some((style) => style.id === value);
}

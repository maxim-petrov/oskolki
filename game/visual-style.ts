export const VISUAL_STYLE = {
  id: 'palace-cellar',
  name: 'Дворец слов — подвал',
  description: 'Дворец слов в палитре The Binding of Isaac',
} as const;
export const ROOM_BACKGROUNDS = [
  {
    id: 'entrance',
    name: 'Вход в крипту',
    alt: 'Подвальная лестница, каменная арка и янтарные фонари',
  },
  {
    id: 'paper-tunnels',
    name: 'Бумажные норы',
    alt: 'Каменные своды, стопки бумаги и ящики',
  },
  {
    id: 'library',
    name: 'Забытые книги',
    alt: 'Старая библиотека со стеллажами и алтарём',
  },
  {
    id: 'corrections',
    name: 'Канцелярия',
    alt: 'Заброшенная канцелярия с перекошенными картотеками',
  },
  {
    id: 'market',
    name: 'Переправа Саввы',
    alt: 'Подземный рынок с гирляндой, полками и фонарями',
  },
  {
    id: 'ink-cistern',
    name: 'Чернильные глубины',
    alt: 'Каналы чернил и старые трубы за каменной дорожкой',
  },
  {
    id: 'waterlock',
    name: 'Нижний шлюз',
    alt: 'Затвор шлюза, цепи и шестерни над тёмной водой',
  },
  {
    id: 'vault',
    name: 'Хранилище',
    alt: 'Бронзовая дверь хранилища, закрытые ящики и потускневшие зеркала',
  },
  {
    id: 'campfire',
    name: 'Последний привал',
    alt: 'Уютная каменная ниша с костром и спальниками',
  },
  {
    id: 'throne',
    name: 'Зал Цензора',
    alt: 'Тронный зал подвала с колоннами и бордовыми знамёнами',
  },
].map((room) => ({
  ...room,
  src: `/art/pronoun-palace/backgrounds/${room.id}.png`,
}));
export function roomBackground(depth: number) {
  return (
    ROOM_BACKGROUNDS[Math.min(9, Math.max(0, Math.trunc(depth) - 1))] ??
    ROOM_BACKGROUNDS[0]
  );
}

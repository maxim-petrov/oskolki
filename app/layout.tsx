import type { Metadata } from 'next';
import './globals.css';
import './palace.css';
import './palace-cellar.css';
import './office.css';
import { VISUAL_STYLE } from '@/game/visual-style';
export const metadata: Metadata = {
  title: 'Осколки — Дворец слов',
  description:
    'Рабочий день ещё не закончился. Исследуй офис и комнаты за дверью босса в тактическом match-3 рогалике.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-skin={VISUAL_STYLE.id}>
      <body>{children}</body>
    </html>
  );
}

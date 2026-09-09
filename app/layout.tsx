import type { Metadata } from 'next';
import './globals.css';
import './palace.css';
import './palace-cellar.css';
import { VISUAL_STYLE } from '@/game/visual-style';
export const metadata: Metadata = {
  title: 'Осколки — в глубину крипты',
  description:
    'Тактический match-3 рогалик. Собери поле, которое сражается по твоим правилам.',
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

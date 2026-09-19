import type { Metadata } from 'next';
import './globals.css';
import './palace.css';
import './palace-cellar.css';
import './office.css';
import './minimal.css';
import './scene-layout.css';
import './lab.css';
import './duel.css';
import { VISUAL_STYLE } from '@/game/visual-style';
export const metadata: Metadata = {
  title: 'Осколки · общая доска',
  icons: { icon: '/art/vector/favicon.svg' },
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

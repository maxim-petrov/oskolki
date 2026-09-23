import type { Metadata } from 'next';
import './game.css';

export const metadata: Metadata = {
  title: 'Осколки',
  icons: { icon: '/favicon.svg' },
  description: 'Пиксельный рогалик из бесконечного офиса: сдвигай строки, собирай тройки, находи предметы, которые переписывают правила.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

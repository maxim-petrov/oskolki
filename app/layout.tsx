import type { Metadata } from 'next';
import './globals.css';
import './royal.css';
import './pixel.css';
import './paper.css';
import './cartoon.css';
import './dark-tale.css';
import './midnight.css';
import './underworld.css';
import './dead-cells.css';
import './basement.css';
import { VisualStyleProvider } from '@/components/visual-style';
export const metadata: Metadata = {
  title: 'Осколки — в глубину крипты',
  description:
    'Тактический match-3 рогалик. Собери поле, которое сражается по твоим правилам.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark" data-skin="crypt">
      <body>
        <VisualStyleProvider>{children}</VisualStyleProvider>
      </body>
    </html>
  );
}

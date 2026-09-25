'use client';
import { useEffect, useRef, useState } from 'react';
import { DevPanel } from '@/components/dev-panel';
import type { DevApi } from '@/render/dev';

const DEV_KEY = 'oskolki.dev.enabled';

/** Mounts the pixel canvas (everything in the game is drawn by render/app.ts) and the dev panel. */
export function GameHost() {
  const host = useRef<HTMLDivElement>(null);
  const [dev, setDev] = useState<DevApi | null>(null);
  const [open, setOpen] = useState(false);
  // Dev mode sticks once opened (or with ?dev); ?dev=0 turns it off.
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('dev') === '0') localStorage.removeItem(DEV_KEY);
      else if (params.has('dev')) localStorage.setItem(DEV_KEY, '1');
      return localStorage.getItem(DEV_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let disposed = false;
    let app: { destroy(): void } | null = null;
    void import('@/render/app').then(({ App }) => {
      if (disposed || !host.current) return;
      const a = new App(host.current);
      app = a;
      setDev(a.dev);
      void a.start();
    });
    return () => {
      disposed = true;
      app?.destroy();
    };
  }, []);
  useEffect(() => {
    const onToggle = (e: Event) => {
      const want = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setOpen((o) => (want === undefined ? !o : want));
      setEnabled(true);
      try {
        localStorage.setItem(DEV_KEY, '1');
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener('osk:dev', onToggle);
    return () => window.removeEventListener('osk:dev', onToggle);
  }, []);
  return (
    <>
      <div ref={host} className="game-host" />
      {dev && open && <DevPanel dev={dev} onClose={() => setOpen(false)} />}
      {dev && enabled && !open && (
        <button className="dev-panel dev-fab" onClick={() => setOpen(true)} title="Dev-панель (`)">
          DEV
        </button>
      )}
    </>
  );
}

'use client';
import { useEffect, useRef } from 'react';

/** Mounts the pixel canvas; everything else is drawn by render/app.ts. */
export function GameHost() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let app: { destroy(): void } | null = null;
    void import('@/render/app').then(({ App }) => {
      if (disposed || !host.current) return;
      const a = new App(host.current);
      app = a;
      void a.start();
    });
    return () => {
      disposed = true;
      app?.destroy();
    };
  }, []);
  return <div ref={host} className="game-host" />;
}

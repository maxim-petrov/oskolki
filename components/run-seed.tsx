'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
export function RunSeed({ seed }: { seed: number }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const value = seed >>> 0;
  return (
    <div className="run-seed">
      <button
        title="Скопировать seed для повторного прохождения"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(String(value));
            setCopied(value);
            setFailed(false);
          } catch {
            setFailed(true);
            setCopied(null);
          }
        }}
      >
        <span>SEED</span>
        <b>{value}</b>
        {copied === value ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <output className={failed ? 'seed-copy-error' : 'sr-only'}>
        {failed
          ? 'Выдели и скопируй номер вручную'
          : copied === value
            ? 'Seed скопирован'
            : ''}
      </output>
    </div>
  );
}

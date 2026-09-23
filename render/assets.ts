import { registerSprites, type SpriteDef } from './sprite.ts';

/**
 * Every module in render/art exports one or more Record<string, SpriteDef>.
 * Vite collects whatever exists, so art can land file by file.
 */
const modules = import.meta.glob('./art/*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

function isSpriteRecord(v: unknown): v is Record<string, SpriteDef> {
  if (!v || typeof v !== 'object') return false;
  const first = Object.values(v as Record<string, unknown>)[0] as SpriteDef | undefined;
  return !!first && typeof first === 'object' && 'frames' in first && 'legend' in first;
}

export function registerArt() {
  for (const mod of Object.values(modules))
    for (const v of Object.values(mod)) if (isSpriteRecord(v)) registerSprites(v);
}

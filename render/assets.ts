import { hex, rgb } from './palette.ts';
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

/**
 * «Дворец слов»: rooms are a quiet backdrop. Their outlines are clearly lighter than the ink
 * contour of the people and monsters, and the brightest highlights settle to paper, so the
 * background never out-contrasts the hero, the enemies or the board.
 */
const QUIET: Record<string, string> = {
  ink0: 'grey1',
  ink1: 'grey1',
  ink2: 'grey2',
  ink3: 'grey2',
  white: 'paper',
  cream: 'paper',
};
const ROOM = /^(os|ar2|bo2|di2|npc_sil)_/;
/** Every room colour leans this much towards the office grey: flatter, lower-contrast walls. */
const HAZE = 0.3;
const HAZE_TO = rgb('#8c8983');

function hazed(name: string): string {
  const [r, g, b] = rgb(hex(name));
  const m = (a: number, t: number) => Math.round(a + (t - a) * HAZE);
  return '#' + [m(r, HAZE_TO[0]), m(g, HAZE_TO[1]), m(b, HAZE_TO[2])].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function quiet(defs: Record<string, SpriteDef>): Record<string, SpriteDef> {
  const out: Record<string, SpriteDef> = {};
  for (const [id, def] of Object.entries(defs)) {
    if (!ROOM.test(id)) {
      out[id] = def;
      continue;
    }
    const legend: Record<string, string> = {};
    for (const [ch, name] of Object.entries(def.legend)) legend[ch] = name ? hazed(QUIET[name] ?? name) : name;
    out[id] = { ...def, legend, outline: def.outline ? (QUIET[def.outline] ?? def.outline) : undefined };
  }
  return out;
}

export function registerArt() {
  for (const mod of Object.values(modules))
    for (const v of Object.values(mod)) if (isSpriteRecord(v)) registerSprites(quiet(v));
}

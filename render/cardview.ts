import { CARDS, FINISH_TEXT, cardText, cardValue } from '../game/content/cards.ts';
import type { Finish } from '../game/types.ts';
import { bigText, measure, paragraph, text } from './font.ts';
import { hex } from './palette.ts';
import { draw, getFrame, hasSprite, type Ctx2D } from './sprite.ts';

/**
 * A tile card as a laminated badge (ui-kit card, 48×64): the tile face in the window, the
 * value big in the body, the name under the card. Full rules go in a text block or a tip.
 */
export const CARD_W = 48;
export const CARD_H = 64;

export interface CardLike {
  id: string;
  up: boolean;
  finish?: Finish;
}

const MULT_CARDS = new Set(['bonus', 'card', 'report']);

/** Badge paper per family: pink for blades, grey-teal for shields, lilac for ink, wood for money. */
const FAM_PAPER: Record<string, string> = { blade: 'rose', shield: 'cold5', ink: 'vio5', coin: 'tile', status: 'grey4' };

/** Short value line for the card body: number and a resource icon. */
export function cardBadge(c: CardLike): { value: string; icon: string; color: string } {
  const def = CARDS[c.id];
  const v = cardValue(c.id, c.up);
  if (!def || def.fam === 'status') return { value: '—', icon: '', color: 'grey3' };
  if (c.id === 'goldclip') return { value: c.up ? '×2' : '×1,5', icon: 'ui_mult', color: 'vio5' };
  if (MULT_CARDS.has(c.id)) return { value: `+${v}`, icon: 'ui_mult', color: 'vio5' };
  if (c.id === 'blotcurse') return { value: `${v}`, icon: 'int_attack', color: 'vio5' };
  switch (def.fam) {
    case 'blade':
      return { value: `${v}`, icon: 'int_attack', color: 'red5' };
    case 'shield':
      return { value: `${v}`, icon: 'ui_armor', color: 'cold6' };
    case 'ink':
      return { value: `${v}`, icon: 'ui_charge', color: 'vio5' };
    default:
      return { value: `${v}`, icon: 'ui_coin', color: 'gold4' };
  }
}

export function cardName(c: CardLike) {
  return (CARDS[c.id]?.name ?? c.id) + (c.up ? '+' : '');
}

/** Rules text with the finish appended. */
export function cardRules(c: CardLike) {
  const base = cardText(c.id, c.up);
  return c.finish ? `${base}\n${FINISH_TEXT[c.finish].name}: ${FINISH_TEXT[c.finish].text}.` : base;
}

export function drawCard(
  ctx: Ctx2D,
  c: CardLike,
  x: number,
  y: number,
  opts: { hot?: boolean; selected?: boolean; dim?: boolean; lift?: number; t?: number; name?: boolean } = {},
) {
  const def = CARDS[c.id];
  const fam = def?.fam ?? 'status';
  const lift = opts.lift ?? (opts.hot ? 3 : 0);
  const cx = Math.round(x);
  const cy = Math.round(y - lift);
  // A paper badge in the family's tint: hard shadow, ink frame, a white window for the tile face.
  const tint = FAM_PAPER[fam] ?? 'paper2';
  ctx.fillStyle = hex('grey1');
  ctx.fillRect(cx + 2, Math.round(y) + 2, CARD_W, CARD_H);
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(cx, cy, CARD_W, CARD_H);
  ctx.fillStyle = hex(tint);
  ctx.fillRect(cx + 1, cy + 1, CARD_W - 2, CARD_H - 2);
  if (def?.rarity === 'rare') {
    // Rare: a second, gold rule inside the frame.
    ctx.fillStyle = hex('gold1');
    ctx.fillRect(cx + 2, cy + 2, CARD_W - 4, 1);
    ctx.fillRect(cx + 2, cy + CARD_H - 3, CARD_W - 4, 1);
    ctx.fillRect(cx + 2, cy + 2, 1, CARD_H - 4);
    ctx.fillRect(cx + CARD_W - 3, cy + 2, 1, CARD_H - 4);
  }
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(cx + 11, cy + 4, 26, 22);
  ctx.fillStyle = hex('paper');
  ctx.fillRect(cx + 12, cy + 5, 24, 20);
  // Tile face in the window.
  const icon = hasSprite(`card_${c.id}`) ? `card_${c.id}` : fam === 'status' ? 'tile_junk' : `tile_${fam}`;
  const f = getFrame(icon);
  draw(ctx, f, cx + 24 - Math.floor(f.w / 2) + f.ox, cy + 15 - Math.floor(f.h / 2) + f.oy);
  // Title band: a short name that fits (the full name goes under the card).
  const name = def?.name ?? c.id;
  let short = name;
  while (measure(short) > 40 && short.length > 3) short = short.slice(0, -1);
  if (short !== name) short = short.slice(0, -1) + '.';
  text(ctx, short, cx + 24, cy + 28, 'ink0', { align: 'center', bold: true });
  // Body: value and resource.
  const b = cardBadge(c);
  if (b.icon) draw(ctx, getFrame(b.icon), cx + 10, cy + 50);
  bigText(ctx, b.value, cx + 41, cy + 43, b.color, { align: 'right' });
  if (c.up) {
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(cx + CARD_W - 9, cy + 2, 7, 7);
    ctx.fillStyle = hex('gold4');
    ctx.fillRect(cx + CARD_W - 8, cy + 5, 5, 1);
    ctx.fillRect(cx + CARD_W - 6, cy + 3, 1, 5);
  }
  if (c.finish) {
    const label = FINISH_TEXT[c.finish].name;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(cx + 2, cy + CARD_H - 11, CARD_W - 4, 9);
    text(ctx, label, cx + 24, cy + CARD_H - 11, c.finish === 'gild' ? 'gold4' : c.finish === 'seal' ? 'red5' : 'cold5', { align: 'center', raw: true });
  }
  if (opts.selected || opts.hot) {
    ctx.fillStyle = hex(opts.selected ? 'red2' : 'ink0');
    ctx.fillRect(cx - 1, cy - 1, CARD_W + 2, 1);
    ctx.fillRect(cx - 1, cy + CARD_H, CARD_W + 2, 1);
    ctx.fillRect(cx - 1, cy - 1, 1, CARD_H + 2);
    ctx.fillRect(cx + CARD_W, cy - 1, 1, CARD_H + 2);
  }
  if (opts.dim) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(cx, cy, CARD_W, CARD_H);
    ctx.globalAlpha = 1;
  }
  if (opts.name) text(ctx, cardName(c), cx + 24, cy + CARD_H + 4, c.up ? 'gold1' : 'ink0', { align: 'center', bold: true });
}

/** Card with its rules as a paragraph under it; returns the height used. */
export function drawCardBlock(ctx: Ctx2D, c: CardLike, x: number, y: number, w: number, opts: { hot?: boolean; selected?: boolean; t?: number } = {}) {
  drawCard(ctx, c, x + Math.round((w - CARD_W) / 2), y, { ...opts, name: true });
  const rarity = CARDS[c.id]?.rarity;
  const rcol = rarity === 'rare' ? 'gold4' : rarity === 'uncommon' ? 'cold5' : 'grey3';
  const rname = rarity === 'rare' ? 'редкая' : rarity === 'uncommon' ? 'необычная' : rarity === 'starter' ? 'стартовая' : rarity === 'status' ? 'статус' : 'обычная';
  text(ctx, rname, x + w / 2, y + CARD_H + 13, rcol, { align: 'center' });
  const h = paragraph(ctx, cardRules(c), x + 2, y + CARD_H + 24, w - 4, 'cold5');
  return CARD_H + 24 + h;
}

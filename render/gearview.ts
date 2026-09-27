import { GEAR, FAM_ROLE, withUpgrade } from '../game/content/gear.ts';
import { heartText } from '../game/text.ts';
import type { Fam } from '../game/types.ts';
import { bigText, measure, paragraph, text } from './font.ts';
import { hex } from './palette.ts';
import { draw, getFrame, hasSprite, type Ctx2D } from './sprite.ts';

/**
 * An item of gear as a laminated badge (ui-kit card, 48×64): the item in the window, its value big
 * in the body, the name under the badge. Full rules go in a text block or a tip.
 */
export const GEAR_W = 48;
export const GEAR_H = 64;

/** Short value line for the badge body: number and a resource icon (the act grows the awl). */
export function gearBadge(id: string, up: boolean, act = 0): { value: string; icon: string; color: string } {
  const item = GEAR[id];
  if (!item) return { value: '—', icon: '', color: 'grey3' };
  const def = withUpgrade(item.gear, up);
  const v = def.value + (def.valueAct ?? 0) * act;
  const s = def.strike;
  if (s.bonusPct) return { value: `+${Math.round(s.bonusPct * 100)}%`, icon: 'int_attack', color: 'gold4' };
  if (s.dmgPerTile) return { value: `+${s.dmgPerTile}`, icon: 'int_attack', color: 'red5' };
  if (s.famDmg) return { value: `+${s.famDmg}`, icon: 'int_attack', color: 'red5' };
  if (s.aoe) return { value: `${s.aoe}`, icon: 'int_attack', color: 'vio5' };
  if (s.coinsPerTile) return { value: `${s.coinsPerTile + v}`, icon: 'ui_coin', color: 'gold4' };
  switch (def.fam) {
    case 'blade':
      return { value: `${v}`, icon: 'int_attack', color: 'red5' };
    case 'shield':
      // Armour in hearts: a group of this colour blocks this much.
      return { value: heartText(v), icon: 'ui_heart_blue', color: 'cold6' };
    case 'ink':
      return { value: `${v}`, icon: 'ui_charge', color: 'vio5' };
    default:
      return { value: `${v}`, icon: 'ui_coin', color: 'gold4' };
  }
}

export function gearTitle(id: string, up = false) {
  return (GEAR[id]?.name ?? id) + (up ? '+' : '');
}

/** Rules: what a group does, what a group of 4+ does, and what the upgrade adds. */
export function gearRules(id: string, up = false) {
  const g = GEAR[id]?.gear;
  if (!g) return '';
  const sup = `${g.superText[0].toLowerCase()}${g.superText.slice(1)}`;
  return `${g.strikeText}\nГруппа из 4+: ${sup}\n${up ? 'Улучшено' : 'Улучшение'}: ${g.upText[0].toLowerCase()}${g.upText.slice(1)}`;
}

/** The colour's role in the player's words: «оружие», «щит»… */
export function famRole(fam: Fam) {
  return FAM_ROLE[fam];
}

export function drawGear(
  ctx: Ctx2D,
  id: string,
  up: boolean,
  x: number,
  y: number,
  opts: { hot?: boolean; selected?: boolean; dim?: boolean; lift?: number; t?: number; name?: boolean; act?: number; held?: boolean } = {},
) {
  const item = GEAR[id];
  const fam = item?.gear.fam ?? 'blade';
  const lift = opts.lift ?? (opts.hot ? 3 : 0);
  const cx = Math.round(x);
  const cy = Math.round(y - lift);
  // Drop shadow.
  ctx.fillStyle = 'rgba(7,7,15,0.5)';
  ctx.fillRect(cx + 2, Math.round(y) + 3, GEAR_W - 2, GEAR_H - 2);
  const frame = `ui_card_${fam}`;
  if (hasSprite(frame)) draw(ctx, getFrame(frame), cx, cy);
  else {
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(cx, cy, GEAR_W, GEAR_H);
    ctx.fillStyle = hex('paper');
    ctx.fillRect(cx + 1, cy + 1, GEAR_W - 2, GEAR_H - 2);
  }
  if (item?.pool === 'rare' && hasSprite('ui_card_rare')) draw(ctx, getFrame('ui_card_rare', Math.floor((opts.t ?? 0) * 2) % 3 === 0 ? 'idle1' : 'idle0'), cx, cy);
  // The item in the window.
  const icon = item && hasSprite(item.icon) ? item.icon : `tile_${fam}`;
  const f = getFrame(icon);
  draw(ctx, f, cx + 24 - Math.floor(f.w / 2) + f.ox, cy + 14 - Math.floor(f.h / 2) + f.oy);
  // Title band: a short name that fits (the full name goes under the badge).
  const name = item?.name ?? id;
  let short = name;
  while (measure(short) > 40 && short.length > 3) short = short.slice(0, -1);
  if (short !== name) short = short.slice(0, -1) + '.';
  text(ctx, short, cx + 24, cy + 26, 'cream', { align: 'center' });
  // Body: value and resource.
  const b = gearBadge(id, up, opts.act ?? 0);
  if (b.icon) draw(ctx, getFrame(b.icon), cx + 10, cy + 48);
  bigText(ctx, b.value, cx + 40, cy + 42, b.color, { align: 'right' });
  if (up) {
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(cx + GEAR_W - 9, cy + 2, 7, 7);
    ctx.fillStyle = hex('gold4');
    ctx.fillRect(cx + GEAR_W - 8, cy + 5, 5, 1);
    ctx.fillRect(cx + GEAR_W - 6, cy + 3, 1, 5);
  }
  if (opts.selected || opts.hot || opts.held) {
    // The item in hand wears a gold frame (a picked one too; the hovered one a pale frame).
    ctx.fillStyle = hex(opts.selected || opts.held ? 'gold4' : 'cream');
    ctx.fillRect(cx - 1, cy - 1, GEAR_W + 2, 1);
    ctx.fillRect(cx - 1, cy + GEAR_H, GEAR_W + 2, 1);
    ctx.fillRect(cx - 1, cy - 1, 1, GEAR_H + 2);
    ctx.fillRect(cx + GEAR_W, cy - 1, 1, GEAR_H + 2);
  }
  if (opts.dim) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(cx, cy, GEAR_W, GEAR_H);
    ctx.globalAlpha = 1;
  }
  if (opts.name) text(ctx, gearTitle(id, up), cx + 24, cy + GEAR_H + 3, up ? 'gold4' : 'cream', { align: 'center', outline: 'ink0' });
}

const RARITY: Record<string, [string, string]> = {
  rare: ['редкая', 'gold4'],
  uncommon: ['необычная', 'cold5'],
  starter: ['простая', 'grey3'],
  common: ['обычная', 'grey3'],
};

/** Badge with its colour, rarity and rules under it; returns the height used. */
export function drawGearBlock(ctx: Ctx2D, id: string, up: boolean, x: number, y: number, w: number, opts: { hot?: boolean; selected?: boolean; t?: number; act?: number } = {}) {
  drawGear(ctx, id, up, x + Math.round((w - GEAR_W) / 2), y, { ...opts, name: true });
  const item = GEAR[id];
  const [rname, rcol] = RARITY[item?.pool ?? 'common'] ?? RARITY.common;
  text(ctx, `${item ? FAM_ROLE[item.gear.fam] : ''} · ${rname}`, x + w / 2, y + GEAR_H + 13, rcol, { align: 'center' });
  const h = paragraph(ctx, gearRules(id, up), x + 2, y + GEAR_H + 24, w - 4, 'cold5');
  return GEAR_H + 24 + h;
}

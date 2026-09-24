import { ACTS } from '../game/content/acts.ts';
import { ITEMS, POCKETS } from '../game/content/items.ts';
import type { RunState } from '../game/types.ts';
import { bigText, text } from './font.ts';
import { hex } from './palette.ts';
import { draw, drawScaled, getFrame, hasSprite, type Ctx2D } from './sprite.ts';
import type { UI } from './ui.ts';
import { L, type Rect } from './view.ts';

/** Animated display values of the hero (numbers chase the engine as effects land). */
export interface Disp {
  hp: number;
  maxHp: number;
  armor: number;
  charge: number;
  cost: number;
  coins: number;
}

function bar(ctx: Ctx2D, x: number, y: number, w: number, h: number, k: number, colors: [string, string, string], back = 'ink2') {
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = hex(back);
  ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * Math.max(0, Math.min(1, k)));
  ctx.fillStyle = hex(colors[1]);
  ctx.fillRect(x, y, fw, h);
  ctx.fillStyle = hex(colors[0]);
  ctx.fillRect(x, y, fw, 1);
  ctx.fillStyle = hex(colors[2]);
  ctx.fillRect(x, y + h - 1, fw, 1);
}

/**
 * Top bar: health with armor, coins, act and floor, buttons for the map, the deck and pause.
 * Returns the id of a clicked button.
 */
export function drawTopBar(ctx: Ctx2D, ui: UI, run: RunState, d: Disp, t: number, pulse: number, incoming: number): string | null {
  const w = L.w;
  const y = 2;
  // Dark strip so the bar reads over the ceiling.
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(0, 0, w, L.top.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = hex('ink2');
  ctx.fillRect(0, L.top.h - 1, w, 1);
  // Health.
  draw(ctx, getFrame('ui_hp'), 8, y + 6);
  const hbw = L.mode === 'wide' ? 90 : Math.min(76, Math.floor(w * 0.28));
  const low = d.hp <= d.maxHp * 0.3;
  bar(ctx, 15, y + 3, hbw, 7, d.hp / d.maxHp, low && Math.floor(t * 4) % 2 ? ['red5', 'red4', 'red2'] : ['red5', 'red3', 'red1'], 'red0');
  if (incoming > 0) {
    // The part of health the next blow will take blinks.
    const k0 = Math.max(0, d.hp - incoming) / d.maxHp;
    const k1 = d.hp / d.maxHp;
    if (Math.floor(t * 5) % 2 === 0) {
      ctx.fillStyle = hex('cream');
      ctx.fillRect(15 + Math.round(hbw * k0), y + 3, Math.max(1, Math.round(hbw * (k1 - k0))), 7);
    }
  }
  text(ctx, `${d.hp}/${d.maxHp}`, 15 + hbw / 2, y + 2 - (pulse > 0 ? 1 : 0), 'cream', { align: 'center', outline: 'ink0' });
  let x = 15 + hbw + 6;
  if (d.armor > 0) {
    draw(ctx, getFrame('ui_armor'), x + 4, y + 6);
    x += 10 + text(ctx, `${d.armor}`, x + 10, y + 2, 'cold5', { outline: 'ink0' }) + 4;
  }
  draw(ctx, getFrame('ui_coin'), x + 4, y + 6);
  x += 10 + text(ctx, `${d.coins}`, x + 10, y + 2, 'gold4', { outline: 'ink0' }) + 6;
  // Right: buttons.
  let bx = w - 14;
  let clicked: string | null = null;
  const btn = (id: string, icon: string, tip: string) => {
    const hot = ui.area(id, bx - 6, 0, 14, L.top.h);
    if (hot) clicked = id;
    if (ui.hovered === id) {
      ctx.fillStyle = hex('ink2');
      ctx.fillRect(bx - 6, 1, 13, L.top.h - 2);
      ui.tooltip(undefined, tip, bx - 60, L.top.h + 2);
    }
    draw(ctx, getFrame(icon), bx, y + 6);
    bx -= 16;
  };
  btn('pause', 'ui_pause', 'Пауза · Esc');
  btn('deck', 'ui_deck', `Колода: ${run.hero.deck.length} · D`);
  btn('map', 'ui_map', 'План эвакуации · M');
  // Act and floor.
  const act = ACTS[Math.min(run.act, ACTS.length - 1)];
  const node = run.node >= 0 ? run.map.nodes[run.node] : null;
  const where = node ? (node.kind === 'boss' ? 'кабинет' : `этаж ${node.row + 1}`) : 'вход';
  const label = L.mode === 'wide' || w >= 300 ? `${act.name} · ${where}` : where;
  if (x < bx - 10) text(ctx, label, bx - 4, y + 2, 'cold4', { align: 'right', outline: 'ink0' });
  return clicked;
}

/** The skill button with its ink meter. Returns true on click. */
export function drawSkill(ctx: Ctx2D, ui: UI, r: Rect, run: RunState, d: Disp, t: number): boolean {
  const id = run.hero.active;
  const def = id ? ITEMS[id] : null;
  const ready = !!def && d.charge >= d.cost;
  const clicked = !!def && ui.area('skill', r.x, r.y, r.w, r.h);
  const hot = ui.hovered === 'skill';
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = hex(ready ? (hot ? 'vio3' : 'vio2') : hot ? 'ink3' : 'ink2');
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = hex(ready ? 'vio4' : 'ink3');
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  if (!def) {
    text(ctx, 'нет навыка', r.x + r.w / 2, r.y + r.h / 2 - 4, 'grey2', { align: 'center' });
    return false;
  }
  const icon = getFrame(def.icon);
  const big = r.h >= 40 && hasSprite(def.icon);
  if (big) drawScaled(ctx, icon, r.x + 4 + icon.ox * 2, r.y + (r.h - 32) / 2 + icon.oy * 2 - 2, 2);
  else draw(ctx, icon, r.x + 4 + icon.ox, r.y + Math.round((r.h - 16) / 2) + icon.oy);
  const tx = r.x + (big ? 40 : 24);
  text(ctx, def.name, tx, r.y + 4, ready ? 'cream' : 'cold4', { outline: 'ink0' });
  const mw = r.x + r.w - 6 - tx;
  bar(ctx, tx, r.y + r.h - 9, mw, 4, d.charge / d.cost, ['vio5', 'vio4', 'vio2'], 'ink1');
  text(ctx, `${d.charge}/${d.cost}`, r.x + r.w - 5, r.y + 4, ready ? 'vio5' : 'cold3', { align: 'right' });
  if (ready && Math.floor(t * 3) % 2 === 0) {
    ctx.fillStyle = hex('vio5');
    ctx.fillRect(r.x, r.y, r.w, 1);
    ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  }
  if (hot) ui.tooltip(def.name, `${def.desc}\nЗаряд: ${def.charge} чернил.${L.touch ? '' : ' Клавиша Q.'}`, ui.p.x, ui.p.y - 50, 'vio5');
  return clicked;
}

/** Pocket slots in a row. Returns the clicked slot index, or -1. */
export function drawPockets(ctx: Ctx2D, ui: UI, x: number, y: number, size: number, run: RunState, armed: number): number {
  let clicked = -1;
  run.hero.pockets.forEach((p, k) => {
    const sx = x + k * (size + 3);
    const id = `pocket-${k}`;
    if (ui.area(id, sx, y, size, size) && p) clicked = k;
    const hot = ui.hovered === id;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(sx, y, size, size);
    ctx.fillStyle = hex(armed === k ? 'orange2' : hot && p ? 'ink3' : 'ink2');
    ctx.fillRect(sx + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = hex('ink1');
    ctx.fillRect(sx + 1, y + size - 2, size - 2, 1);
    if (p) {
      const def = POCKETS[p];
      const f = getFrame(def.icon);
      if (size >= 36) drawScaled(ctx, f, sx + size / 2 - f.w + f.ox * 2, sy(y, size) + f.oy * 2 - f.h, 2);
      else draw(ctx, f, Math.round(sx + size / 2 - f.w / 2 + f.ox), Math.round(y + size / 2 - f.h / 2 + f.oy));
      if (hot) ui.tooltip(def.name, `${def.desc}${L.touch ? '' : `\nКлавиша ${k + 1}.`}`, ui.p.x, ui.p.y - 40, 'gold4');
    } else if (hot) ui.tooltip('Карман', 'Пусто. Расходники — в наградах и в кассе.', ui.p.x, ui.p.y - 40);
    if (!L.touch) text(ctx, `${k + 1}`, sx + 2, y + 1, 'grey2');
  });
  return clicked;
}

const sy = (y: number, size: number) => Math.round(y + size / 2);

/** Relic icons in rows with tooltips. */
export function drawRelics(ctx: Ctx2D, ui: UI, r: Rect, run: RunState) {
  const size = 17;
  const perRow = Math.max(1, Math.floor(r.w / size));
  run.hero.relics.forEach((id, k) => {
    const x = r.x + (k % perRow) * size;
    const y = r.y + Math.floor(k / perRow) * size;
    if (y + size > r.y + r.h) return;
    const def = ITEMS[id];
    if (!def) return;
    const f = getFrame(def.icon);
    draw(ctx, f, Math.round(x + 8 - f.w / 2 + f.ox), Math.round(y + 8 - f.h / 2 + f.oy));
    if (ui.area(`relic-${k}`, x, y, size, size)) void 0;
    if (ui.hovered === `relic-${k}`) ui.tooltip(def.name, def.desc, ui.p.x, ui.p.y - 40, 'gold4');
  });
}

/** Boss health across the top of the stage. */
export function drawBossBar(ctx: Ctx2D, name: string, hp: number, max: number, y: number, t: number) {
  const w = Math.min(260, L.w - 40);
  const x = Math.round((L.w - w) / 2);
  bar(ctx, x, y + 10, w, 6, hp / max, ['red5', 'red3', 'red1'], 'red0');
  bigText(ctx, name, L.w / 2, y, 'red4', { align: 'center', alpha: 0.95 + Math.sin(t * 3) * 0.05 });
  text(ctx, `${hp}/${max}`, x + w, y + 18, 'cream', { align: 'right', outline: 'ink0' });
}

import { ACTS } from '../game/content/acts.ts';
import { CHARGE_COST, RUSH_COST, armBlock } from '../game/combat.ts';
import { FINDS, FIND_METER } from '../game/content/finds.ts';
import { MAX_COINS } from '../game/economy.ts';
import { heartText, heartsText } from '../game/text.ts';
import { FAM_ROLE } from '../game/content/gear.ts';
import { ITEMS, POCKETS } from '../game/content/items.ts';
import { FAMS, type Fam, type RunState } from '../game/types.ts';
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
  /** Energy now, the skill's cost and how much energy the meter holds (it keeps its charge between fights). */
  charge: number;
  cost: number;
  cap: number;
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
 * Top bar: health with armor, coins, act and floor, buttons for the map, the gear and pause.
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
  // Health in hearts (half-heart units): containers for the maximum, filled for what is left;
  // armour follows as blue hearts (it takes the blow first and burns out after the enemies act).
  // The halves the next blows will take through the armour (`incoming`) blink; the last heart
  // beats when it is all that is left.
  const hearts = Math.ceil(d.maxHp / 2);
  const step = L.mode === 'wide' ? 10 : 9;
  const room = L.mode === 'wide' ? 12 : 8;
  const low = d.hp <= 2;
  const blink = incoming > 0 && Math.floor(t * 5) % 2 === 0;
  const hpShown = blink ? Math.max(0, d.hp - incoming) : d.hp;
  let x = 3;
  const hx = x;
  const row = Math.min(hearts, room);
  for (let i = 0; i < row; i++) {
    const fill = Math.max(0, Math.min(2, hpShown - i * 2));
    const icon = fill === 2 ? 'ui_heart' : fill === 1 ? 'ui_heart_half' : 'ui_heart_empty';
    const beat = (low && fill > 0 && Math.floor(t * 3) % 2 === 0) || (pulse > 0 && fill > 0) ? -1 : 0;
    draw(ctx, getFrame(icon), x + 4, y + 6 + beat);
    x += step;
  }
  // More hearts than fit: the rest as a number.
  if (hearts > room) x += text(ctx, `+${heartText(Math.max(0, d.hp - room * 2))}`, x + 1, y + 2, 'red4', { outline: 'ink0' }) + 2;
  ui.area('hp', hx, y, x - hx, 10);
  if (ui.hovered === 'hp')
    ui.tooltip('Здоровье', `${heartText(d.hp)} из ${heartsText(d.maxHp)}. Удары врагов отнимают половинки сердца; новые сердца дают предметы.`, ui.p.x, ui.p.y + 24, 'red4');
  if (d.armor > 0) {
    const ax = x;
    const blue = Math.ceil(d.armor / 2);
    for (let i = 0; i < Math.min(blue, room); i++) {
      const fill = Math.max(0, Math.min(2, d.armor - i * 2));
      if (fill) draw(ctx, getFrame(fill === 2 ? 'ui_heart_blue' : 'ui_heart_blue_half'), x + 4, y + 6);
      x += step;
    }
    ui.area('armor', ax, y, x - ax, 10);
    if (ui.hovered === 'armor')
      ui.tooltip('Броня', `${heartsText(d.armor)}: гасит удары до конца хода врагов и сгорает. Не больше твоих сердец: удар тяжелее ранит всегда.`, ui.p.x, ui.p.y + 24, 'cold5');
  }
  x += 4;
  const cx0 = x;
  draw(ctx, getFrame('ui_coin'), x + 4, y + 6);
  x += 10 + text(ctx, `${d.coins}`, x + 10, y + 2, d.coins >= MAX_COINS ? 'orange4' : 'gold4', { outline: 'ink0' }) + 4;
  // The finds meter under the coins: yellow tiles fill it, a full one puts a find on the board.
  const fk = Math.min(1, (run.hero.finds ?? 0) / FIND_METER);
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(cx0 + 1, y + 11, x - cx0 - 3, 3);
  ctx.fillStyle = hex(fk >= 1 ? (Math.floor(t * 4) % 2 ? 'gold4' : 'white') : 'gold3');
  ctx.fillRect(cx0 + 2, y + 12, Math.round((x - cx0 - 5) * fk), 1);
  ui.area('coins', cx0, y, x - cx0, 12);
  if (ui.hovered === 'coins') {
    const next = run.hero.findNext ? `\nВ следующем бою ждёт: ${FINDS[run.hero.findNext].name.toLowerCase()}.` : '';
    ui.tooltip(
      'Монеты и находки',
      `${d.coins} из ${MAX_COINS}: больше кошелёк не держит.\nНаходки: ${run.hero.finds ?? 0}/${FIND_METER}. Каждая жёлтая фишка копит шкалу; полная кладёт на поле находку — монеты, ключ, сердце, батарейку или бомбу. Собери её группой или взрывом.${next}`,
      ui.p.x,
      ui.p.y + 24,
      'gold4',
    );
  }
  // Keys to the safe on the sixth floor.
  if (run.hero.keys > 0) {
    draw(ctx, getFrame('find_key'), x + 6, y + 12);
    x += 12 + text(ctx, `${run.hero.keys}`, x + 12, y + 2, 'gold4', { outline: 'ink0' }) + 6;
    ui.area('keys', x - 22, y, 20, 12);
    if (ui.hovered === 'keys') ui.tooltip('Ключи от сейфа', 'Сейф на 6-м этаже откроется на выбор из трёх предметов ступенью выше.', ui.p.x, ui.p.y + 24, 'gold4');
  }
  x += 2;
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
  btn('deck', 'ui_deck', 'Снаряжение · D');
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
  const clicked = ui.area('skill', r.x, r.y, r.w, r.h) && !!def;
  const hot = ui.hovered === 'skill';
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = hex(ready ? (hot ? 'vio3' : 'vio2') : hot ? 'ink3' : 'ink2');
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = hex(ready ? 'vio4' : 'ink3');
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  if (!def) {
    text(ctx, 'нет навыка', r.x + r.w / 2, r.y + r.h / 2 - 4, 'grey2', { align: 'center' });
    if (d.cap > 0) {
      meter(ctx, r.x + 6, r.y + r.h - 9, r.w - 12, d.charge, d.cap, 0);
      text(ctx, `${d.charge}/${d.cap}`, r.x + r.w - 5, r.y + 4, 'cold3', { align: 'right' });
    }
    if (hot) ui.tooltip('Нет навыка', 'Энергия фиолетовых фишек идёт на «Заряд», «Вне очереди» и смену вещей; лишняя сверх шкалы бьёт сама: 1 урона за деление.', ui.p.x, ui.p.y - 50, 'vio5');
    return false;
  }
  const icon = getFrame(def.icon);
  const big = r.h >= 40 && hasSprite(def.icon);
  if (big) drawScaled(ctx, icon, r.x + 4 + icon.ox * 2, r.y + (r.h - 32) / 2 + icon.oy * 2 - 2, 2);
  else draw(ctx, icon, r.x + 4 + icon.ox, r.y + Math.round((r.h - 16) / 2) + icon.oy);
  const tx = r.x + (big ? 40 : 24);
  text(ctx, def.name, tx, r.y + 4, ready ? 'cream' : 'cold4', { outline: 'ink0' });
  const mw = r.x + r.w - 6 - tx;
  meter(ctx, tx, r.y + r.h - 9, mw, d.charge, d.cap, d.cost);
  text(ctx, `${d.charge}/${d.cost}`, r.x + r.w - 5, r.y + 4, ready ? 'vio5' : 'cold3', { align: 'right' });
  if (ready && Math.floor(t * 3) % 2 === 0) {
    ctx.fillStyle = hex('vio5');
    ctx.fillRect(r.x, r.y, r.w, 1);
    ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  }
  if (hot) ui.tooltip(def.name, `${def.desc}\nНавык: ${d.cost} энергии из ${d.cap}. Энергия сверх шкалы бьёт: 1 урона за деление.${L.touch ? '' : ' Клавиша Q.'}`, ui.p.x, ui.p.y - 50, 'vio5');
  return clicked;
}

/** The energy meter in whole segments, with a mark at what the skill costs. */
function meter(ctx: Ctx2D, x: number, y: number, w: number, charge: number, cap: number, mark: number) {
  bar(ctx, x, y, w, 4, charge / Math.max(1, cap), ['vio5', 'vio4', 'vio2'], 'ink1');
  ctx.fillStyle = hex('ink0');
  for (let k = 1; k < cap; k++) ctx.fillRect(x + Math.round((w * k) / cap), y, 1, 4);
  if (mark > 0 && mark <= cap) {
    ctx.fillStyle = hex('gold4');
    ctx.fillRect(x + Math.round((w * mark) / cap) - 1, y - 2, 1, 8);
  }
}

const ARM: Record<'charge' | 'rush', { name: string; short: string; cost: number; key: string; tip: string }> = {
  charge: {
    name: 'Заряд',
    short: 'Заряд',
    cost: CHARGE_COST,
    key: 'E',
    tip: 'Все группы следующего хода срабатывают как супер (как группа из 4+), каждого цвета. Только первая волна: предпросмотр точен.',
  },
  rush: {
    name: 'Вне очереди',
    short: 'Вне оч.',
    cost: RUSH_COST,
    key: 'R',
    tip: 'После следующего хода враги не тикают: их таймеры стоят. Кровотечение и огонь идут. Не два хода подряд.',
  },
};

/** «Заряд» or «Вне очереди»: readied (gold), available (violet), not now (grey). Returns true on click. */
export function drawArm(ctx: Ctx2D, ui: UI, r: Rect, run: RunState, what: 'charge' | 'rush', t: number): boolean {
  const a = ARM[what];
  const on = !!run.combat?.armed?.[what];
  const block = armBlock(run, what);
  const key = `arm-${what}`;
  const clicked = ui.area(key, r.x, r.y, r.w, r.h);
  const hot = ui.hovered === key;
  const can = on || !block;
  ctx.fillStyle = hex(on ? 'gold4' : 'ink0');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = hex(on ? (Math.floor(t * 3) % 2 ? 'vio3' : 'vio2') : can ? (hot ? 'vio3' : 'vio1') : 'ink2');
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = hex(can ? 'vio4' : 'ink3');
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  const label = r.w >= 52 ? a.name : a.short;
  text(ctx, label, r.x + r.w / 2, r.y + Math.max(2, Math.round(r.h / 2) - 9), on ? 'gold4' : can ? 'cream' : 'grey2', { align: 'center' });
  const cost = `${a.cost}`;
  draw(ctx, getFrame('ui_charge'), Math.round(r.x + r.w / 2 - 6), r.y + Math.round(r.h / 2) + 5);
  text(ctx, cost, Math.round(r.x + r.w / 2 + 2), r.y + Math.round(r.h / 2), can ? 'vio5' : 'grey2');
  if (hot) {
    const state = on ? 'Готово к ходу. Ещё раз — отмена, энергия вернётся.' : block ? `${block}.` : `${a.cost} энергии.`;
    ui.tooltip(`${a.name} · ${a.cost} энергии`, `${a.tip}\n${state}${L.touch ? '' : ` Клавиша ${a.key}.`}`, ui.p.x, ui.p.y - 60, 'vio5');
  }
  return clicked;
}

/** Slot colours of every colour of the board: face, light edge, dark edge. */
const GEAR_SLOT: Record<Fam, [string, string, string]> = {
  blade: ['red1', 'red2', 'red0'],
  shield: ['cold1', 'cold2', 'ink3'],
  ink: ['vio1', 'vio2', 'vio0'],
  coin: ['gold1', 'gold2', 'wood1'],
};
const GEAR_TIP: Record<Fam, string> = { blade: 'red4', shield: 'cold5', ink: 'vio5', coin: 'gold4' };

/**
 * The items held, one slot per colour: every tile of the colour is that item. A click takes the
 * next carried item of the colour in hand (energy in a fight). `grid` packs the four slots 2×2 into
 * one square (phones). Returns the item to take in hand, or null.
 */
export function drawGear(ctx: Ctx2D, ui: UI, x: number, y: number, size: number, run: RunState, d: Disp, cost: number, grid = false): string | null {
  const hero = run.hero;
  let picked: string | null = null;
  const cell = grid ? Math.floor((size - 1) / 2) : size;
  FAMS.forEach((fam, k) => {
    const list = hero.gear[fam];
    const id = hero.equip[fam];
    const def = ITEMS[id];
    if (!def) return;
    const sx = grid ? x + (k % 2) * (cell + 1) : x + k * (size + 3);
    const sy = grid ? y + Math.floor(k / 2) * (cell + 1) : y;
    const key = `gear-${fam}`;
    const next = list[(list.indexOf(id) + 1) % list.length];
    const can = list.length > 1 && d.charge >= cost;
    if (ui.area(key, sx, sy, cell, cell) && can) picked = next;
    const hot = ui.hovered === key;
    const [face, light, dark] = GEAR_SLOT[fam];
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(sx, sy, cell, cell);
    ctx.fillStyle = hex(hot && can ? light : face);
    ctx.fillRect(sx + 1, sy + 1, cell - 2, cell - 2);
    ctx.fillStyle = hex(light);
    ctx.fillRect(sx + 1, sy + 1, cell - 2, 1);
    ctx.fillStyle = hex(dark);
    ctx.fillRect(sx + 1, sy + cell - 2, cell - 2, 1);
    const f = getFrame(hasSprite(def.icon) ? def.icon : `tile_${fam}`);
    if (cell >= 36) drawScaled(ctx, f, sx + cell / 2 - f.w + f.ox * 2, Math.round(sy + cell / 2) + f.oy * 2 - f.h, 2);
    else draw(ctx, f, Math.round(sx + cell / 2 - f.w / 2 + f.ox), Math.round(sy + cell / 2 - f.h / 2 + f.oy));
    if (hero.ups.includes(id)) {
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(sx + cell - 6, sy + 1, 5, 5);
      ctx.fillStyle = hex('gold4');
      ctx.fillRect(sx + cell - 5, sy + 3, 3, 1);
      ctx.fillRect(sx + cell - 4, sy + 2, 1, 3);
    }
    // Spares: how many items the colour carries (a click takes the next one).
    if (list.length > 1) text(ctx, `${list.length}`, sx + 2, sy + cell - 9, can ? 'vio5' : 'grey2', { outline: 'ink0' });
    if (hot) {
      const others = list.filter((x) => x !== id).map((x) => ITEMS[x]?.name ?? x);
      const price = cost === 1 ? '1 энергию' : `${cost} энергии`;
      const swap = list.length > 1 ? `\nЕщё: ${others.join(', ')}. ${L.touch ? 'Тап' : 'Клик'} — ${ITEMS[next]?.name ?? next} за ${price}.` : '';
      const g = def.gear;
      const up = g && hero.ups.includes(id) ? `\nУлучшено: ${g.upText[0].toLowerCase()}${g.upText.slice(1)}` : '';
      const body = g ? `${g.strikeText}\nГруппа из 4+: ${g.superText[0].toLowerCase()}${g.superText.slice(1)}${up}${swap}` : def.desc;
      ui.tooltip(`${def.name}${hero.ups.includes(id) ? '+' : ''} · ${FAM_ROLE[fam]}`, body, ui.p.x, ui.p.y - 60, GEAR_TIP[fam]);
    }
  });
  return picked;
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

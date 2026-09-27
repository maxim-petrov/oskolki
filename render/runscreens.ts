import { bagWeights } from '../game/combat.ts';
import { heartsText } from '../game/text.ts';
import { EVENT_BY_ID } from '../game/content/events.ts';
import { FAM_ROLE, GEAR } from '../game/content/gear.ts';
import { ITEMS, POCKETS } from '../game/content/items.ts';
import { famOf, pickable, rerollPrice, upgradable } from '../game/run.ts';
import { BAG_COPIES, FAMS, type Action, type Fam, type RunState } from '../game/types.ts';
import { GEAR_H, GEAR_W, drawGear, drawGearBlock, gearRules, gearTitle } from './gearview.ts';
import { LINE, bigText, measure, measureBig, paragraph, text, wrap } from './font.ts';
import { hex } from './palette.ts';
import { draw, drawScaled, frameNames, getFrame, hasSprite, type Ctx2D } from './sprite.ts';
import { panel, type UI } from './ui.ts';
import { L } from './view.ts';

/**
 * Screens between fights: reward, the till, the cooler, events, the safe, gear picks, the boss
 * relic choice and the gear viewer. Each draws itself over the stage and returns an action.
 */
export interface ScreenHost {
  run: RunState;
  t: number;
  act(a: Action): boolean;
  audio: { play(s: 'select' | 'buy' | 'card', p?: number): void };
}

/** Panel rectangle for overlays: under the stage on wide screens, below the stage on tall ones. */
export function overlayRect(minH = 150) {
  if (L.mode === 'wide') {
    const w = Math.min(L.w - 24, 460);
    const h = Math.max(minH, Math.min(L.h - 40, 330));
    return { x: Math.round((L.w - w) / 2), y: Math.max(L.top.h + 6, L.h - h - 8), w, h };
  }
  const y = L.stage.y + Math.round(L.stage.h * 0.45);
  return { x: 4, y, w: L.w - 8, h: L.h - y - 4 };
}

function title(ctx: Ctx2D, s: string, x: number, y: number, color = 'gold4') {
  bigText(ctx, s, x, y, color, { align: 'center' });
}

function paperPanel(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = hex('cream');
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hex('beige2');
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillStyle = hex('beige3');
  for (let ly = y + 22; ly < y + h - 8; ly += 10) ctx.fillRect(x + 6, ly, w - 12, 1);
  ctx.fillStyle = hex('red2');
  ctx.fillRect(x + 14, y + 2, 1, h - 4);
}

// ── Reward ───────────────────────────────────────────────────────────

export class RewardScreen {
  choosing = -1;

  draw(ctx: Ctx2D, ui: UI, h: ScreenHost) {
    const run = h.run;
    if (this.choosing >= 0) return this.drawCards(ctx, ui, h);
    const rows = run.rewards;
    const r = overlayRect(60 + rows.length * 24);
    const w = Math.min(r.w, 300);
    const x = Math.round(r.x + (r.w - w) / 2);
    const rh = 40 + rows.length * 24 + 26;
    const y = L.mode === 'wide' ? Math.round(L.board.y - 12) : r.y;
    panel(ctx, x, y, w, rh, { border: 'gold3', fill: 'ink1', glow: 'gold4' });
    title(ctx, 'НАГРАДА', x + w / 2, y + 8);
    rows.forEach((row, k) => {
      const ry = y + 28 + k * 24;
      const id = `reward-${k}`;
      const disabled = row.taken || (row.kind === 'pocket' && !run.hero.pockets.includes(null));
      const clicked = !disabled && ui.area(id, x + 6, ry, w - 12, 22);
      const hot = ui.hovered === id && !disabled;
      ctx.fillStyle = hex(row.taken ? 'ink1' : hot ? 'ink3' : 'ink2');
      ctx.fillRect(x + 6, ry, w - 12, 22);
      let icon = '';
      let label = '';
      let sub = '';
      if (row.kind === 'coins') {
        icon = 'ui_coin';
        label = `${row.amount} монет`;
      } else if (row.kind === 'gear') {
        icon = GEAR[row.gear?.[0] ?? '']?.icon ?? 'ui_deck';
        label = 'Выбрать вещь';
        sub = (row.gear?.length ?? 3) === 2 ? 'одна из двух: сразу в руку' : 'одна из трёх: сразу в руку';
      } else if (row.kind === 'upgrade') {
        icon = 'ui_deck';
        label = 'Улучшить вещь';
        sub = 'одна вещь на выбор';
      } else if (row.kind === 'key') {
        icon = hasSprite('item_key') ? 'item_key' : 'ui_coin';
        label = 'Ключ от сейфа';
        sub = 'сейф откроется на выбор из трёх';
      } else if (row.kind === 'shards') {
        icon = 'ui_shard';
        label = `Осколки: ${row.amount ?? 1}`;
      } else if (row.kind === 'relic' && row.relic) {
        icon = ITEMS[row.relic].icon;
        label = ITEMS[row.relic].name;
        sub = ITEMS[row.relic].desc;
      } else if (row.kind === 'pocket' && row.pocket) {
        icon = POCKETS[row.pocket].icon;
        label = POCKETS[row.pocket].name;
        sub = disabled && !row.taken ? 'карманы полны' : POCKETS[row.pocket].desc;
      }
      const f = getFrame(hasSprite(icon) ? icon : 'ui_deck');
      draw(ctx, f, x + 16 - Math.floor(f.w / 2) + f.ox, ry + 11 - Math.floor(f.h / 2) + f.oy);
      text(ctx, label, x + 30, ry + (sub ? 2 : 7), row.taken ? 'grey2' : 'cream');
      if (sub) text(ctx, sub.length > 40 ? sub.slice(0, 38) + '…' : sub, x + 30, ry + 12, row.taken ? 'grey1' : 'cold4');
      if (row.taken) text(ctx, 'взято', x + w - 12, ry + 7, 'green3', { align: 'right' });
      if (hot && row.kind === 'relic' && row.relic) ui.tooltip(label, ITEMS[row.relic].desc, ui.p.x, ui.p.y, 'gold4');
      if (clicked) {
        if (row.kind === 'gear') this.choosing = k;
        else h.act({ type: 'reward', index: k });
      }
    });
    const by = y + rh - 22;
    const left = rows.some((x) => !x.taken && x.kind !== 'pocket');
    if (ui.button(ctx, 'reward-leave', x + w - 96, by, 90, 16, left ? 'Пропустить' : 'Дальше', { accent: left ? 'grey3' : 'gold3' })) h.act({ type: 'leave' });
  }

  private drawCards(ctx: Ctx2D, ui: UI, h: ScreenHost) {
    const run = h.run;
    const row = run.rewards[this.choosing];
    if (!row || row.taken || !row.gear) {
      this.choosing = -1;
      return;
    }
    const n = row.gear.length;
    const colW = Math.min(118, Math.floor((L.w - 16) / n));
    const w = colW * n + 12;
    const x = Math.round((L.w - w) / 2);
    // Height follows the longest rules text.
    const textH = Math.max(...row.gear.map((id) => wrap(gearRules(id), colW - 4).length)) * (LINE + 1);
    const hgt = Math.min(L.h - L.top.h - 12, 28 + GEAR_H + 24 + textH + 46);
    const y = L.mode === 'wide' ? Math.max(L.top.h + 6, Math.round((L.h - hgt) / 2)) : L.stage.y + 30;
    panel(ctx, x, y, w, hgt, { border: 'gold3', fill: 'ink0', alpha: 0.96 });
    title(ctx, 'ВЫБЕРИ ВЕЩЬ', x + w / 2, y + 6);
    row.gear.forEach((id, k) => {
      const cx = x + 6 + k * colW;
      const aid = `pick-card-${k}`;
      const clicked = ui.area(aid, cx, y + 24, colW, hgt - 50);
      const hot = ui.hovered === aid;
      if (hot) {
        ctx.fillStyle = hex('ink2');
        ctx.fillRect(cx + 1, y + 24, colW - 2, hgt - 52);
      }
      const used = drawGearBlock(ctx, id, false, cx, y + 28, colW, { hot, t: h.t, act: run.act });
      // What it replaces in hand (the old item stays as a spare).
      const fam = famOf(id);
      if (fam) text(ctx, `в руке: ${gearTitle(run.hero.equip[fam], run.hero.ups.includes(run.hero.equip[fam]))}`, cx + colW / 2, y + 30 + used, 'grey3', { align: 'center' });
      if (clicked) {
        h.audio.play('card');
        h.act({ type: 'reward', index: this.choosing, pick: k });
        this.choosing = -1;
      }
    });
    if (ui.button(ctx, 'cards-skip', x + w / 2 - 45, y + hgt - 22, 90, 16, 'Не брать', { accent: 'grey3' })) this.choosing = -1;
  }
}

// ── The till ────────────────────────────────────────────────────────

export class ShopScreen {
  draw(ctx: Ctx2D, ui: UI, h: ScreenHost) {
    const run = h.run;
    const s = run.shop;
    if (!s) return;
    const r = overlayRect(260);
    const x = r.x;
    const y = L.mode === 'wide' ? L.top.h + 30 : r.y - 40;
    const w = r.w;
    const hh = L.h - y - 6;
    panel(ctx, x, y, w, hh, { border: 'gold3', fill: 'ink1', alpha: 0.96 });
    title(ctx, 'КАССА', x + w / 2, y + 6);
    text(ctx, `У тебя ${run.hero.coins} монет`, x + w - 8, y + 8, 'gold4', { align: 'right' });
    const coins = run.hero.coins;
    const price = (p: number, cx: number, cy: number, sold: boolean) => {
      if (sold) text(ctx, 'продано', cx, cy, 'grey2', { align: 'center' });
      else {
        draw(ctx, getFrame('ui_coin'), cx - measure(`${p}`) / 2 - 4, cy + 4);
        text(ctx, `${p}`, cx + 4, cy, p <= coins ? 'gold4' : 'red4', { align: 'center' });
      }
    };
    // Gear: one of the three at half price.
    const cols = Math.max(1, Math.min(s.gear.length, Math.floor((w - 12) / (GEAR_W + 8))));
    let cy = y + 26;
    s.gear.forEach((c, k) => {
      const col = k % cols;
      const rowi = Math.floor(k / cols);
      const cx = x + 8 + col * (GEAR_W + 8);
      const yy = cy + rowi * (GEAR_H + 22);
      const id = `shop-card-${k}`;
      const clicked = !c.sold && ui.area(id, cx, yy, GEAR_W, GEAR_H);
      const hot = ui.hovered === id;
      drawGear(ctx, c.id, false, cx, yy, { hot, dim: c.sold, t: h.t, act: run.act });
      price(c.price, cx + GEAR_W / 2, yy + GEAR_H + 4, c.sold);
      const fam = famOf(c.id);
      if (hot && fam) ui.tooltip(`${gearTitle(c.id)} · ${FAM_ROLE[fam]}`, `${gearRules(c.id)}\nВ руке сейчас: ${gearTitle(run.hero.equip[fam])} (останется запасной).`, ui.p.x, ui.p.y, 'gold4');
      if (clicked) {
        if (h.act({ type: 'buy', kind: 'gear', index: k })) h.audio.play('buy');
      }
    });
    cy += Math.ceil(s.gear.length / cols) * (GEAR_H + 22) + 2;
    // Relics and pockets in one row of icons.
    const items: { kind: 'relic' | 'pocket'; k: number; icon: string; name: string; desc: string; price: number; sold: boolean }[] = [
      ...s.relics.map((it, k) => ({ kind: 'relic' as const, k, icon: ITEMS[it.id].icon, name: ITEMS[it.id].name, desc: `${ITEMS[it.id].kind === 'active' ? 'Навык (заменит нынешний). ' : ''}${ITEMS[it.id].desc}`, price: it.price, sold: it.sold })),
      ...s.pockets.map((it, k) => ({ kind: 'pocket' as const, k, icon: POCKETS[it.id].icon, name: POCKETS[it.id].name, desc: POCKETS[it.id].desc, price: it.price, sold: it.sold })),
    ];
    const iw = 36;
    const perRow = Math.max(1, Math.floor((w - 12) / iw));
    items.forEach((it, n) => {
      const ix = x + 8 + (n % perRow) * iw;
      const iy = cy + Math.floor(n / perRow) * 34;
      const id = `shop-${it.kind}-${it.k}`;
      const clicked = !it.sold && ui.area(id, ix, iy, iw - 4, 30);
      const hot = ui.hovered === id;
      ctx.fillStyle = hex(hot && !it.sold ? 'ink3' : 'ink2');
      ctx.fillRect(ix, iy, iw - 4, 20);
      const f = getFrame(it.icon);
      draw(ctx, f, ix + (iw - 4) / 2 - Math.floor(f.w / 2) + f.ox, iy + 10 - Math.floor(f.h / 2) + f.oy, it.sold ? 0.3 : 1);
      price(it.price, ix + (iw - 4) / 2, iy + 21, it.sold);
      if (hot) ui.tooltip(it.name, it.desc, ui.p.x, ui.p.y, it.kind === 'relic' ? 'gold4' : 'cold5');
      if (clicked && h.act({ type: 'buy', kind: it.kind, index: it.k })) h.audio.play('buy');
    });
    cy += Math.ceil(items.length / perRow) * 34 + 4;
    // Services.
    const bw = Math.min(150, Math.floor((w - 20) / 2));
    if (s.upgrade) {
      const u = s.upgrade;
      const none = !upgradable(run).length;
      const label = u.sold ? 'Мастерская: занята' : `Мастерская · ${u.price}`;
      if (ui.button(ctx, 'shop-finish', x + 8, cy, bw, 18, label, { disabled: u.sold || none || coins < u.price, accent: 'gold3' })) h.act({ type: 'buy', kind: 'upgrade', index: 0 });
      if (ui.hovered === 'shop-finish') ui.tooltip('Мастерская', none ? 'Всё уже улучшено.' : 'Улучшить одну вещь на выбор.', ui.p.x, ui.p.y);
    }
    if (s.shred) {
      const sh = s.shred;
      const rlabel = sh.used ? 'Шредер: занят' : `Шредер · ${sh.price}`;
      if (ui.button(ctx, 'shop-remove', x + 12 + bw, cy, bw, 18, rlabel, { disabled: sh.used || coins < sh.price || run.hero.tape <= 0, accent: 'red3' })) h.act({ type: 'remove' });
      if (ui.hovered === 'shop-remove') ui.tooltip('Шредер', `Снять одну Волокиту: в мешке станет меньше мусора. Сейчас волокиты: ${run.hero.tape}.`, ui.p.x, ui.p.y);
    }
    const rr = rerollPrice(run);
    if (ui.button(ctx, 'shop-reroll', x + 8, y + hh - 22, 118, 16, `Перепечатать · ${rr}`, { disabled: coins < rr, accent: 'gold3' }) && h.act({ type: 'reroll' })) h.audio.play('buy');
    if (ui.hovered === 'shop-reroll') ui.tooltip('Перепечатать витрину', 'Новые вещи, предметы и карманы. Услуги остаются. Каждый раз дороже.', ui.p.x, ui.p.y - 30);
    if (ui.button(ctx, 'shop-leave', x + w - 80, y + hh - 22, 72, 16, 'Уйти', { accent: 'grey3' })) h.act({ type: 'leave' });
  }
}

// ── The cooler (rest) ───────────────────────────────────────────────

export function drawRest(ctx: Ctx2D, ui: UI, h: ScreenHost) {
  const run = h.run;
  const r = overlayRect(120);
  const w = Math.min(r.w, 320);
  const x = Math.round((L.w - w) / 2);
  const y = L.mode === 'wide' ? L.board.y - 8 : r.y;
  panel(ctx, x, y, w, 118, { border: 'teal3', fill: 'ink1', glow: 'teal4' });
  title(ctx, 'КУЛЕР', x + w / 2, y + 6, 'teal5');
  text(ctx, 'Можно перевести дух. Или разобрать бумаги.', x + w / 2, y + 22, 'cold4', { align: 'center' });
  const heal = Math.round(run.hero.maxHp * 0.3);
  const bw = Math.floor((w - 24) / 2);
  const canUp = upgradable(run).length > 0;
  if (ui.button(ctx, 'rest-heal', x + 8, y + 36, bw, 44, '', { accent: 'green3' })) h.act({ type: 'rest', choice: 'heal' });
  draw(ctx, getFrame('map_rest'), x + 8 + bw / 2, y + 50);
  text(ctx, `Выпить воды`, x + 8 + bw / 2, y + 60, 'cream', { align: 'center' });
  text(ctx, `+${heartsText(heal)}`, x + 8 + bw / 2, y + 69, 'green4', { align: 'center' });
  if (ui.button(ctx, 'rest-up', x + 16 + bw, y + 36, bw, 44, '', { accent: 'gold3', disabled: !canUp })) h.act({ type: 'rest', choice: 'upgrade' });
  draw(ctx, getFrame('ui_deck'), x + 16 + bw + bw / 2, y + 50);
  text(ctx, 'Разобрать бумаги', x + 16 + bw + bw / 2, y + 60, canUp ? 'cream' : 'grey2', { align: 'center' });
  text(ctx, 'улучшить вещь', x + 16 + bw + bw / 2, y + 69, canUp ? 'gold4' : 'grey2', { align: 'center' });
  if (ui.button(ctx, 'rest-leave', x + w - 80, y + 94, 72, 16, 'Уйти', { accent: 'grey3' })) h.act({ type: 'leave' });
}

// ── Events: a memo with choices ─────────────────────────────────────

export function drawEvent(ctx: Ctx2D, ui: UI, h: ScreenHost) {
  const run = h.run;
  const st = run.event;
  const def = st ? EVENT_BY_ID[st.id] : undefined;
  if (!st || !def) return;
  const w = Math.min(L.w - 16, 360);
  const x = Math.round((L.w - w) / 2);
  // A photo pinned to the memo: beside the text on wide memos, above it on narrow ones.
  const art = hasSprite(def.art) ? getFrame(def.art, Math.floor(h.t * 2) % 2 && frameNames(def.art).includes('idle1') ? 'idle1' : 'idle0') : null;
  const side = !!art && w >= 300;
  const tw = w - 30 - (side ? art!.w + 10 : 0);
  const body = st.result ?? def.text;
  const lines = wrap(body, tw);
  const opts = st.result === undefined ? def.options : [];
  const textH = Math.max(lines.length * (LINE + 1), side ? art!.h - 4 : 0) + (art && !side ? art.h + 8 : 0);
  const hh = 34 + textH + 8 + (opts.length ? opts.length * 26 : 24) + 8;
  const y = Math.max(L.top.h + 6, Math.round(L.mode === 'wide' ? (L.h - hh) / 2 + 20 : L.stage.y + L.stage.h * 0.3));
  // Long titles go on two lines (the display font has no smaller size).
  const titleLines: string[] = [];
  if (measureBig(def.title) <= w - 24) titleLines.push(def.title);
  else {
    const words = def.title.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measureBig(test) > w - 24 && line) {
        titleLines.push(line);
        line = word;
      } else line = test;
    }
    if (line) titleLines.push(line);
  }
  const extra = (titleLines.length - 1) * 14;
  paperPanel(ctx, x, y, w, hh + extra);
  titleLines.forEach((l, k) => bigText(ctx, l, x + w / 2, y + 7 + k * 14, 'red3', { align: 'center', outline: 'cream' }));
  let ty = y + 28 + extra;
  if (art) {
    const ax = side ? x + w - art.w - 10 : Math.round(x + (w - art.w) / 2);
    const ay = ty - 2;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(ax + 2, ay + 2, art.w, art.h);
    draw(ctx, art, ax + art.ox, ay + art.oy);
    // A paper clip holds it.
    ctx.fillStyle = hex('grey4');
    ctx.fillRect(ax + 8, ay - 3, 2, 8);
    ctx.fillRect(ax + 12, ay - 3, 2, 8);
    ctx.fillRect(ax + 8, ay - 3, 6, 2);
    if (!side) ty += art.h + 8;
  }
  paragraph(ctx, body, x + 22, ty, tw, st.result !== undefined ? 'red1' : 'ink1');
  let oy = y + 28 + extra + textH + 8;
  if (opts.length) {
    opts.forEach((o, k) => {
      const locked = o.locked?.(run) ?? null;
      const id = `event-${k}`;
      const clicked = !locked && ui.area(id, x + 18, oy, w - 30, 22);
      const hot = ui.hovered === id && !locked;
      ctx.fillStyle = hex(locked ? 'beige2' : hot ? 'gold3' : 'beige3');
      ctx.fillRect(x + 18, oy, w - 30, 22);
      ctx.fillStyle = hex('ink1');
      ctx.fillRect(x + 18, oy + 21, w - 30, 1);
      text(ctx, `${k + 1}. ${o.label}`, x + 24, oy + 2, locked ? 'grey2' : 'ink0');
      text(ctx, locked ?? o.hint, x + 24, oy + 12, locked ? 'red2' : 'slate2');
      if (clicked) h.act({ type: 'event', option: k });
      oy += 26;
    });
  } else if (ui.button(ctx, 'event-leave', x + w - 90, oy, 80, 16, 'Дальше', { accent: 'gold3' })) h.act({ type: 'leave' });
}

// ── The safe ────────────────────────────────────────────────────────

export function drawTreasure(ctx: Ctx2D, ui: UI, h: ScreenHost) {
  const tr = h.run.treasure;
  if (!tr) return;
  const w = Math.min(L.w - 16, 240);
  const x = Math.round((L.w - w) / 2);
  const y = L.mode === 'wide' ? L.board.y : overlayRect().y;
  panel(ctx, x, y, w, 70, { border: 'gold3', fill: 'ink1', glow: 'gold4' });
  title(ctx, 'СЕЙФ', x + w / 2, y + 6);
  if (!tr.opened) {
    text(ctx, 'Код — дата твоего первого рабочего дня.', x + w / 2, y + 24, 'cold4', { align: 'center' });
    if (ui.button(ctx, 'safe-open', x + w / 2 - 50, y + 44, 100, 18, 'Открыть', { accent: 'gold3' })) h.act({ type: 'open' });
  } else {
    const def = ITEMS[tr.relic];
    // Centred: item icons stand on their bottom, gear art (a tile face) is anchored in the middle.
    const f = getFrame(def.icon);
    draw(ctx, f, x + 20 - Math.floor(f.w / 2) + f.ox, y + 28 - Math.floor(f.h / 2) + f.oy);
    text(ctx, def.name, x + 34, y + 24, 'gold4');
    text(ctx, `+${tr.coins} монет`, x + 34, y + 34, 'cold4');
    if (ui.button(ctx, 'safe-leave', x + w - 86, y + 48, 78, 16, 'Дальше', { accent: 'gold3' })) h.act({ type: 'leave' });
  }
}

// ── Gear grid (picks and the viewer) ────────────────────────────────

const FAM_COL: Record<Fam, string> = { blade: 'red4', shield: 'cold5', ink: 'vio5', coin: 'gold4' };

export class DeckGrid {
  scroll = 0;
  /** The item under the pointer, and the one picked in the viewer. */
  hover = '';
  selected = '';

  /**
   * Draws the gear: a row per colour, the item in hand first. Returns the id clicked (or '').
   * `ok` marks items that may be chosen.
   */
  draw(ctx: Ctx2D, ui: UI, run: RunState, x: number, y: number, w: number, h: number, t: number, ok: (id: string) => boolean, wheel: number): string {
    const gap = 6;
    const rowH = GEAR_H + gap + 10;
    const full = FAMS.length * rowH;
    this.scroll = Math.max(0, Math.min(full - h, this.scroll + wheel));
    let clicked = '';
    this.hover = '';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    FAMS.forEach((fam, r) => {
      const hero = run.hero;
      const list = [hero.equip[fam], ...hero.gear[fam].filter((id) => id !== hero.equip[fam])];
      const ry = y + r * rowH - Math.round(this.scroll);
      if (ry + GEAR_H < y || ry > y + h) return;
      const role = FAM_ROLE[fam];
      text(ctx, `${role[0].toUpperCase()}${role.slice(1)}`, x + 2, ry + 2, FAM_COL[fam]);
      const ox = x + Math.min(70, Math.round(w * 0.22));
      list.forEach((id, k) => {
        const cx = ox + k * (GEAR_W + gap);
        const can = ok(id);
        const aid = `deck-${id}`;
        const vis = ui.over(x, y, w, h);
        const hit = vis && ui.area(aid, cx, Math.max(y, ry), GEAR_W, Math.min(GEAR_H, y + h - ry));
        const hot = ui.hovered === aid;
        if (hot) this.hover = id;
        drawGear(ctx, id, hero.ups.includes(id), cx, ry, { hot: hot && can, dim: !can, t, held: k === 0, selected: this.selected === id, act: run.act });
        if (k === 0) text(ctx, 'в руке', cx + GEAR_W / 2, ry + GEAR_H + 2, 'gold4', { align: 'center' });
        if (hit && can) clicked = id;
      });
    });
    ctx.restore();
    if (full > h) {
      // Scroll bar.
      const bh = Math.max(12, Math.round((h * h) / full));
      const by = y + Math.round(((h - bh) * this.scroll) / Math.max(1, full - h));
      ctx.fillStyle = hex('ink2');
      ctx.fillRect(x + w - 3, y, 2, h);
      ctx.fillStyle = hex('cold4');
      ctx.fillRect(x + w - 3, by, 2, bh);
    }
    return clicked;
  }
}

const PICK_TITLE: Record<string, string> = {
  upgrade: 'Какую вещь улучшить?',
  transform: 'Какую вещь заменить на другую того же цвета?',
};

export function drawPick(ctx: Ctx2D, ui: UI, h: ScreenHost, grid: DeckGrid, wheel: number) {
  const run = h.run;
  const p = run.pick;
  if (!p) return;
  const x = 6;
  const y = L.top.h + 4;
  const w = L.w - 12;
  const hh = L.h - y - 4;
  panel(ctx, x, y, w, hh, { border: 'gold3', fill: 'ink0', alpha: 0.97 });
  const head = (PICK_TITLE[p.purpose] ?? 'Выбери вещь') + (p.fam ? ` (${FAM_ROLE[p.fam]})` : '');
  text(ctx, head, x + w / 2, y + 6, 'gold4', { align: 'center' });
  if (p.count > 1) text(ctx, `осталось выбрать: ${p.count}`, x + w / 2, y + 16, 'cold4', { align: 'center' });
  const infoH = 30;
  const id = grid.draw(ctx, ui, run, x + 6, y + 28, w - 12, hh - 28 - infoH - 24, h.t, (g) => pickable(run, p, g), wheel);
  // Details of the hovered item (and what the upgrade adds).
  const hov = grid.hover;
  const iy = y + hh - infoH - 22;
  if (hov && GEAR[hov]) {
    const up = run.hero.ups.includes(hov);
    const line =
      p.purpose === 'upgrade' && !up
        ? `${gearTitle(hov)} → ${gearTitle(hov, true)}: ${GEAR[hov].gear.upText}`
        : `${gearTitle(hov, up)}: ${gearRules(hov, up).replace(/\n/g, ' ')}`;
    paragraph(ctx, line, x + 10, iy, w - 20, 'cold5');
  }
  if (id) h.act({ type: 'pick', id });
  if (ui.button(ctx, 'pick-cancel', x + w - 86, y + hh - 20, 78, 16, 'Отмена', { accent: 'grey3' })) h.act({ type: 'leave' });
}

/**
 * The gear viewer: every colour's items, the bag it makes. A click picks an item; the picked spare
 * can be taken in hand (energy in a fight) or put down between fights. Returns true to close.
 */
export function drawDeckViewer(ctx: Ctx2D, ui: UI, h: ScreenHost, grid: DeckGrid, t: number, wheel: number): boolean {
  const run = h.run;
  const x = 6;
  const y = L.top.h + 4;
  const w = L.w - 12;
  const hh = L.h - y - 4;
  panel(ctx, x, y, w, hh, { border: 'cold3', fill: 'ink0', alpha: 0.97 });
  text(ctx, 'Снаряжение: каждый цвет поля — вещь в руке', x + 8, y + 6, 'cream');
  // The bag: tiles of each colour a refill draws from, and the junk of red tape.
  const wts = bagWeights(run);
  let fx = x + 8;
  fx += text(ctx, 'Мешок:', fx, y + 16, 'cold3') + 4;
  for (const f of FAMS) fx += text(ctx, `${wts[f] * BAG_COPIES}`, fx, y + 16, FAM_COL[f]) + 6;
  if (run.hero.tape) text(ctx, `волокита ${run.hero.tape * BAG_COPIES}`, fx + 4, y + 16, 'grey3');
  const picked = grid.draw(ctx, ui, run, x + 6, y + 28, w - 12, hh - 28 - 44, t, () => true, wheel);
  if (picked) grid.selected = grid.selected === picked ? '' : picked;
  const sel = grid.selected && famOf(grid.selected) && run.hero.gear[famOf(grid.selected)!].includes(grid.selected) ? grid.selected : '';
  const hov = grid.hover || sel;
  if (hov && GEAR[hov]) paragraph(ctx, `${gearTitle(hov, run.hero.ups.includes(hov))}: ${gearRules(hov, run.hero.ups.includes(hov)).replace(/\n/g, ' ')}`, x + 10, y + hh - 40, w - 180, 'cold5');
  if (sel) {
    const fam = famOf(sel)!;
    const held = run.hero.equip[fam] === sel;
    const fight = run.phase === 'combat';
    if (!held && ui.button(ctx, 'gear-hold', x + w - 176, y + hh - 20, 86, 16, fight ? 'В руку · энергия' : 'В руку', { accent: 'gold3' })) h.act({ type: 'gear', id: sel });
    if (!fight && run.hero.gear[fam].length > 1 && ui.button(ctx, 'gear-drop', x + w - 176, y + hh - 38, 86, 16, 'Отложить', { accent: 'red3' })) {
      h.act({ type: 'dropGear', id: sel });
      grid.selected = '';
    }
  }
  return ui.button(ctx, 'deck-close', x + w - 86, y + hh - 20, 78, 16, 'Закрыть', { accent: 'grey3' });
}

// ── Boss relic choice ───────────────────────────────────────────────

export function drawBossReward(ctx: Ctx2D, ui: UI, h: ScreenHost) {
  const list = h.run.bossRelics;
  const colW = Math.min(130, Math.floor((L.w - 20) / Math.max(1, list.length)));
  const w = colW * list.length + 12;
  const x = Math.round((L.w - w) / 2);
  const y = L.mode === 'wide' ? L.top.h + 40 : L.stage.y + 30;
  const hh = 150;
  panel(ctx, x, y, w, hh, { border: 'red3', fill: 'ink0', glow: 'red4', alpha: 0.97 });
  title(ctx, 'ТРОФЕЙ КАБИНЕТА', x + w / 2, y + 6, 'red4');
  list.forEach((id, k) => {
    const def = ITEMS[id];
    const cx = x + 6 + k * colW;
    const aid = `boss-relic-${k}`;
    const clicked = ui.area(aid, cx, y + 24, colW, hh - 50);
    const hot = ui.hovered === aid;
    if (hot) {
      ctx.fillStyle = hex('ink2');
      ctx.fillRect(cx + 1, y + 24, colW - 2, hh - 50);
    }
    drawScaled(ctx, getFrame(def.icon), cx + colW / 2 - 16 + getFrame(def.icon).ox * 2, y + 30 + getFrame(def.icon).oy * 2, 2);
    text(ctx, def.name, cx + colW / 2, y + 66, 'gold4', { align: 'center' });
    paragraph(ctx, def.desc, cx + 4, y + 78, colW - 8, 'cold5');
    if (clicked) h.act({ type: 'bossRelic', index: k });
  });
  if (ui.button(ctx, 'boss-skip', x + w / 2 - 45, y + hh - 22, 90, 16, 'Не брать', { accent: 'grey3' })) h.act({ type: 'leave' });
}

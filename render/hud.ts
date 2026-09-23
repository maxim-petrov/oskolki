import type { RunState } from '../game/types.ts';
import { text } from './font.ts';
import { hex } from './palette.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';

export interface Disp {
  hearts: number;
  hp: number;
  soul: number;
  armor: number;
  armorCap: number;
  charge: number;
  cost: number;
  coins: number;
  bombs: number;
  keys: number;
}

export const HUD = {
  hearts: [8, 8] as const,
  coins: [8, 34] as const,
  bombs: [8, 45] as const,
  keys: [8, 56] as const,
  active: [44, 32] as const,
  armor: [8, 21] as const,
};

/** `incoming`: half-hearts the next enemy blow will take (after armor) — they blink as a warning. */
export function drawHearts(ctx: Ctx2D, d: Disp, t: number, pulse: number, incoming = 0) {
  const [x0, y0] = HUD.hearts;
  let x = x0;
  const low = d.hp + d.soul <= 2;
  const blink = Math.floor(t * 5) % 2 === 0;
  const threatFrom = Math.max(0, d.hp - Math.max(0, incoming - d.soul));
  for (let h = 0; h < d.hearts; h++) {
    const v = d.hp - h * 2;
    const id = v >= 2 ? 'hud_heart_full' : v === 1 ? 'hud_heart_half' : 'hud_heart_empty';
    const beat = low && v > 0 && Math.floor(t * 3) % 2 === 0 ? -1 : 0;
    const y = y0 + beat + (pulse > 0 && h === Math.ceil(d.hp / 2) - 1 ? -1 : 0);
    const threatened = incoming > 0 && v > 0 && h * 2 + 2 > threatFrom;
    draw(ctx, getFrame(threatened && blink ? 'hud_heart_empty' : id), x, y);
    x += 10;
  }
  for (let s = 0; s < Math.ceil(d.soul / 2); s++) {
    const v = d.soul - s * 2;
    draw(ctx, getFrame(v >= 2 ? 'hud_soul_full' : 'hud_soul_half'), x, y0);
    x += 10;
  }
  // Armor pips.
  const [ax, ay] = HUD.armor;
  for (let a = 0; a < d.armorCap; a++) {
    if (a < d.armor) draw(ctx, getFrame('hud_armor'), ax + a * 10, ay);
    else {
      ctx.fillStyle = hex('ink2');
      ctx.fillRect(ax + a * 10 + 2, ay + 3, 5, 4);
    }
  }
}

export function drawResources(ctx: Ctx2D, d: Disp, flashCoins: number) {
  const rows: [string, number, readonly [number, number]][] = [
    ['hud_coin', d.coins, HUD.coins],
    ['hud_bomb', d.bombs, HUD.bombs],
    ['hud_key', d.keys, HUD.keys],
  ];
  for (const [icon, n, [x, y]] of rows) {
    draw(ctx, getFrame(icon), x, y);
    const color = icon === 'hud_coin' && flashCoins > 0 ? 'gold4' : 'cold6';
    text(ctx, String(n).padStart(2, '0'), x + 12, y, color, { outline: 'ink0' });
  }
}

export function drawActive(ctx: Ctx2D, item: string | null, d: Disp, t: number, hot: boolean) {
  const [x, y] = HUD.active;
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x, y, 24, 24);
  ctx.fillStyle = hex(hot ? 'ink3' : 'ink2');
  ctx.fillRect(x + 1, y + 1, 22, 22);
  const ready = item && d.charge >= d.cost;
  ctx.fillStyle = hex(ready ? (Math.floor(t * 4) % 2 ? 'vio4' : 'vio5') : 'cold1');
  ctx.fillRect(x + 1, y, 22, 1);
  if (item) draw(ctx, getFrame(`item_${item}`), x + 12, y + 20);
  // Charge bar with segments.
  const bx = x + 26;
  const h = 22;
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(bx, y + 1, 6, h + 2);
  ctx.fillStyle = hex('vio0');
  ctx.fillRect(bx + 1, y + 2, 4, h);
  if (d.cost > 0) {
    const k = Math.min(1, d.charge / d.cost);
    const fill = Math.round(h * k);
    ctx.fillStyle = hex(ready ? 'vio5' : 'vio3');
    ctx.fillRect(bx + 1, y + 2 + h - fill, 4, fill);
    ctx.fillStyle = hex('ink0');
    for (let s = 1; s < d.cost; s++) {
      const sy = y + 2 + Math.round((h * s) / d.cost);
      if (d.cost <= 12) ctx.fillRect(bx + 1, sy, 4, 1);
    }
  }
}

export function drawMinimap(ctx: Ctx2D, run: RunState, t: number, x0 = 562, y0 = 6) {
  const rooms = run.map.rooms.filter((r) => (r.seen || r.visited) && !r.hidden);
  if (!rooms.length) return;
  const all = run.map.rooms.filter((r) => !r.hidden);
  const minX = Math.min(...all.map((r) => r.x));
  const minY = Math.min(...all.map((r) => r.y));
  const maxX = Math.max(...all.map((r) => r.x));
  const CW = 10;
  const CH = 8;
  const w = (maxX - minX + 1) * CW + 5;
  const h = (Math.max(...all.map((r) => r.y)) - minY + 1) * CH + 5;
  const ox = x0 + Math.max(0, 70 - w);
  ctx.fillStyle = 'rgba(7,7,15,0.72)';
  ctx.fillRect(ox - 3, y0 - 3, w + 1, h + 1);
  for (const r of rooms) {
    const x = ox + (r.x - minX) * CW;
    const y = y0 + (r.y - minY) * CH;
    const cur = r.id === run.room;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(x - 1, y - 1, CW, CH);
    ctx.fillStyle = hex(cur ? 'cream' : r.visited ? 'grey3' : 'grey1');
    ctx.fillRect(x, y, CW - 2, CH - 2);
    if (cur && Math.floor(t * 3) % 2) {
      ctx.fillStyle = hex('gold4');
      ctx.fillRect(x + 1, y + 1, CW - 4, CH - 4);
    }
    const icon =
      r.kind === 'treasure' ? 'map_treasure' : r.kind === 'shop' ? 'map_shop' : r.kind === 'boss' ? 'map_boss' : r.kind === 'secret' ? 'map_secret' : r.kind === 'deal' ? 'map_deal' : null;
    if (icon) draw(ctx, getFrame(icon), x + 1, y - 1);
  }
}

export function drawItemsBar(ctx: Ctx2D, items: string[], x = 8, y = 352) {
  let cx = x;
  for (const id of items.slice(-26)) {
    draw(ctx, getFrame(`item_${id}`), cx + 8, y);
    cx += 17;
  }
  return cx;
}

export function drawBossBar(ctx: Ctx2D, name: string, hp: number, max: number, t: number) {
  const w = 200;
  const x = 320 - w / 2;
  const y = 334;
  text(ctx, name.toUpperCase(), 320, y - 10, 'red5', { align: 'center', outline: 'ink0' });
  ctx.fillStyle = hex('ink0');
  ctx.fillRect(x - 2, y - 2, w + 4, 10);
  ctx.fillStyle = hex('red0');
  ctx.fillRect(x, y, w, 6);
  const k = Math.max(0, hp / max);
  ctx.fillStyle = hex('red2');
  ctx.fillRect(x, y, Math.round(w * k), 6);
  ctx.fillStyle = hex(Math.floor(t * 2) % 2 ? 'red4' : 'red3');
  ctx.fillRect(x, y, Math.round(w * k), 2);
}

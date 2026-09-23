import { FLOORS } from '../game/content/floors.ts';
import { ITEMS } from '../game/content/items.ts';
import { DIRS } from '../game/mapgen.ts';
import type { Dir, Room } from '../game/types.ts';
import { paragraph, text } from './font.ts';
import type { GameView } from './game.ts';
import { hex } from './palette.ts';
import { rand } from './particles.ts';
import { FLOOR_Y } from './scene.ts';
import { draw, getFrame, halo, hasSprite, type Ctx2D } from './sprite.ts';
import type { UI } from './ui.ts';

export const DOOR_X: Record<Dir, number> = { w: 22, n: 262, s: 378, e: 618 };
const DOOR_PREFIX: Record<string, string> = { office: 'of', archive: 'ar', boiler: 'bo', directorate: 'di' };

export const PICKUP_NAMES: Record<string, string> = {
  coin: 'Монета',
  nickel: 'Пятак',
  half: 'Половина сердца',
  heart: 'Сердце',
  soul: 'Синее сердце',
  bomb: 'Бомба',
  key: 'Ключ',
  chest: 'Сундук',
  lockedChest: 'Запертый сундук',
  item: 'Предмет',
};

function doorTarget(v: GameView, room: Room, d: Dir): Room | null {
  const id = room.doors[d];
  if (id === undefined) return null;
  const r = v.run.map.rooms[id];
  return r.hidden ? null : r;
}

function frameColor(target: Room) {
  const k = target.kind;
  return k === 'boss' ? 'red3' : k === 'treasure' ? 'gold3' : k === 'shop' ? 'green3' : k === 'secret' ? 'vio4' : 'wood3';
}

function pedestalX(i: number, n: number) {
  return 320 + (i - (n - 1) / 2) * 60;
}

/** Chests on the floor use the bigger cast sprites; the 12px icons stay for flights to the HUD. */
export const CHEST_SPRITES: Partial<Record<string, string>> = { chest: 'chest', lockedChest: 'chest_locked' };

/** The trapdoor moves aside when a devil deal adds pedestals, so price labels never cover it. */
export function trapdoorX(room: Room) {
  return room.pedestals.length > 1 ? 452 : 320;
}

function pickupXY(k: number): [number, number] {
  return [262 + ((k * 37) % 120), FLOOR_Y + 16 + (k % 2) * 6];
}

/** Lit pass: doors, merchant, pedestals, pickups — they receive the room lighting. */
export function drawRoomWorld(v: GameView, ctx: Ctx2D, room: Room) {
  const t = v.t;
  const fx = FLOORS[v.run.floor].fx;
  for (const d of DIRS) {
    const target = doorTarget(v, room, d);
    if (!target) continue;
    const x = DOOR_X[d];
    const side = d === 'w' || d === 'e';
    const w = side ? 22 : 30;
    const h = 52;
    const sprite = `${DOOR_PREFIX[fx]}_door`;
    const open = target.visited || target.cleared;
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(x - w / 2 - 2, FLOOR_Y - h - 2, w + 4, h + 2);
    ctx.fillStyle = hex(frameColor(target));
    ctx.fillRect(x - w / 2 - 1, FLOOR_Y - h - 1, w + 2, h + 1);
    if (!side && hasSprite(sprite) && !open) draw(ctx, getFrame(sprite), x, FLOOR_Y);
    else {
      ctx.fillStyle = hex(open ? 'ink0' : 'wood1');
      ctx.fillRect(x - w / 2 + 1, FLOOR_Y - h + 1, w - 2, h - 1);
      if (open) {
        // A glimpse of the next room's light.
        ctx.fillStyle = hex(target.kind === 'treasure' ? 'gold1' : target.kind === 'boss' ? 'red0' : 'ink2');
        ctx.fillRect(x - w / 2 + 3, FLOOR_Y - 10, w - 6, 9);
      }
    }
    if (target.locked) {
      ctx.fillStyle = hex('gold3');
      ctx.fillRect(x - 3, FLOOR_Y - h / 2 - 4, 6, 7);
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(x - 1, FLOOR_Y - h / 2 - 2, 2, 3);
    }
    if (target.kind === 'boss') {
      ctx.fillStyle = hex('cream');
      ctx.fillRect(x - 4, FLOOR_Y - h + 5, 8, 6);
      ctx.fillRect(x - 3, FLOOR_Y - h + 11, 6, 2);
      ctx.fillStyle = hex('ink0');
      ctx.fillRect(x - 3, FLOOR_Y - h + 7, 2, 2);
      ctx.fillRect(x + 1, FLOOR_Y - h + 7, 2, 2);
    }
  }
  if (room.kind === 'shop') {
    if (hasSprite('merchant')) draw(ctx, getFrame('merchant', Math.floor(t * 1.5) % 2 ? 'idle0' : 'idle1'), 320, FLOOR_Y - 2);
    if (hasSprite('shopkeeper_sign')) {
      draw(ctx, getFrame('shopkeeper_sign'), 320, FLOOR_Y - 44);
      // Painted letters sit on the 5px-tall recessed panel of the board.
      text(ctx, 'ЛАВКА', 320, FLOOR_Y - 54, 'gold4', { align: 'center' });
    }
    // Display table in front of the merchant.
    ctx.fillStyle = hex('ink0');
    ctx.fillRect(232, FLOOR_Y + 1, 176, 9);
    ctx.fillStyle = hex('wood3');
    ctx.fillRect(233, FLOOR_Y + 2, 174, 3);
    ctx.fillStyle = hex('wood2');
    ctx.fillRect(233, FLOOR_Y + 5, 174, 4);
    ctx.fillStyle = hex('wood1');
    for (const lx of [236, 402]) ctx.fillRect(lx, FLOOR_Y + 9, 3, 14);
  }
  const peds = room.pedestals.filter((p) => !p.taken);
  peds.forEach((p, k) => {
    const x = pedestalX(k, peds.length);
    const y = FLOOR_Y + 8;
    draw(ctx, getFrame(p.hearts ? 'pedestal_deal' : 'pedestal'), x, y);
  });
  room.pickups.forEach((p, k) => {
    const [x, y] = pickupXY(k);
    v.pickupPos.set(p.id, [x, y]);
    const chest = CHEST_SPRITES[p.kind];
    if (chest && hasSprite(chest)) draw(ctx, getFrame(chest, 'closed'), x, y);
    else draw(ctx, getFrame(`pk_${p.kind}`, Math.floor(t * 2 + k) % 2 ? 'idle0' : 'idle1'), x, y);
  });
  for (const c of v.openChests) if (hasSprite(c.sprite)) draw(ctx, getFrame(c.sprite, 'open'), c.x, c.y, Math.min(1, c.t * 2));
  if (room.trapdoor) draw(ctx, getFrame('trapdoor', 'open'), trapdoorX(room), FLOOR_Y + 30);
}

/** Unlit pass: floating items, beams, labels, tooltips and clicks. */
export function drawRoomUI(v: GameView, ctx: Ctx2D, ui: UI, room: Room) {
  const t = v.t;
  const exploring = v.run.phase === 'explore' && !v.busy() && !v.ending;
  for (const d of DIRS) {
    const target = doorTarget(v, room, d);
    const x = DOOR_X[d];
    const side = d === 'w' || d === 'e';
    const w = side ? 22 : 30;
    const h = 52;
    if (!target) {
      if (v.targeting?.kind === 'wall') {
        ctx.globalAlpha = 0.35 + Math.sin(t * 8) * 0.2;
        ctx.fillStyle = hex('orange3');
        ctx.fillRect(x - w / 2, FLOOR_Y - h, w, h);
        ctx.globalAlpha = 1;
        if (ui.area(`wall-${d}`, x - w / 2, FLOOR_Y - h, w, h)) {
          v.targeting = null;
          v.act({ type: 'bombWall', dir: d });
        }
      }
      continue;
    }
    const arrow = hasSprite('door_arrow') ? null : { n: '↑', s: '↓', w: '←', e: '→' }[d];
    const bob = exploring ? Math.round(Math.sin(t * 4 + x) * 1) : 0;
    if (arrow) text(ctx, arrow, x, FLOOR_Y - h - 13 + bob, exploring ? 'gold4' : 'grey2', { align: 'center', outline: 'ink0' });
    else {
      const f = getFrame(d === 'n' || d === 's' ? 'door_arrow_up' : 'door_arrow');
      ctx.save();
      ctx.translate(x, FLOOR_Y - h - 8 + bob);
      if (d === 's') ctx.scale(1, -1);
      if (d === 'w') ctx.scale(-1, 1);
      ctx.globalAlpha = exploring ? 1 : 0.4;
      ctx.drawImage(f.canvas as CanvasImageSource, -Math.floor(f.w / 2), -Math.floor(f.h / 2));
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (exploring && ui.area(`door-${d}`, x - w / 2 - 2, FLOOR_Y - h - 16, w + 4, h + 16)) v.act({ type: 'go', dir: d });
    if (ui.hovered === `door-${d}`) {
      const k = target.kind;
      const label =
        k === 'boss'
          ? 'Кабинет босса'
          : k === 'treasure'
            ? target.locked
              ? 'Сокровищница — нужен ключ'
              : 'Сокровищница'
            : k === 'shop'
              ? 'Лавка Саввы'
              : k === 'secret'
                ? 'Секретная комната'
                : target.cleared
                  ? 'Пройденная комната'
                  : 'Неизвестная комната';
      ui.tooltip(label, 'Клик или стрелка', ui.p.x, ui.p.y, frameColor(target));
    }
  }
  if (room.kind === 'shop') {
    room.shop.forEach((slot, k) => {
      if (slot.sold) return;
      const x = 256 + k * 42;
      const y = FLOOR_Y + 14;
      const afford = v.run.hero.coins >= slot.price;
      // Warm glow under each ware, then the ware itself on the table.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + Math.sin(t * 3 + k) * 0.05;
      ctx.fillStyle = hex('orange2');
      ctx.fillRect(x - 10, FLOOR_Y - 14, 20, 16);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const icon = slot.kind === 'item' ? `item_${slot.item}` : `pk_${slot.kind}`;
      draw(ctx, getFrame(icon), x, FLOOR_Y + 1 + Math.round(Math.sin(t * 3 + k) * 0.6));
      draw(ctx, getFrame('hud_coin'), x - 10, y + 1);
      text(ctx, String(slot.price), x, y + 1, afford ? 'gold4' : 'red4', { outline: 'ink0' });
      if (exploring && ui.area(`shop-${slot.id}`, x - 12, FLOOR_Y - 20, 24, 44)) v.act({ type: 'buy', id: slot.id });
      if (ui.hovered === `shop-${slot.id}`) {
        if (slot.kind === 'item') {
          const def = ITEMS[slot.item!];
          ui.tooltip(`${def.name} — ${slot.price}`, `${def.tagline}. ${def.desc}`, ui.p.x, ui.p.y - 70, 'gold4');
        } else ui.tooltip(`${PICKUP_NAMES[slot.kind]} — ${slot.price}`, afford ? 'Купить' : 'Не хватает монет', ui.p.x, ui.p.y - 40, 'gold4');
      }
    });
  }
  const peds = room.pedestals.filter((p) => !p.taken);
  peds.forEach((p, k) => {
    const x = pedestalX(k, peds.length);
    const y = FLOOR_Y + 8;
    // A cone of light from the ceiling, widening towards the pedestal, with dithered edges.
    ctx.globalCompositeOperation = 'lighter';
    const beam = hex(p.hearts ? 'red2' : 'gold2');
    const core = hex(p.hearts ? 'red3' : 'gold3');
    for (let by = 0; by < y - 16; by += 1) {
      const half = 6 + Math.floor((by / (y - 16)) * 12);
      const pulse = 0.06 + 0.03 * Math.sin(t * 2.2 + by * 0.05);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = beam;
      ctx.fillRect(x - half + (by % 2), by, half * 2 - 1, 1);
      ctx.globalAlpha = pulse * 0.9;
      ctx.fillStyle = core;
      ctx.fillRect(x - Math.floor(half / 3), by, Math.floor(half / 3) * 2, 1);
    }
    ctx.globalAlpha = 0.22 + Math.sin(t * 3) * 0.06;
    ctx.fillStyle = core;
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 16 + k * 2, y - 1 + k, 32 - k * 4, 1);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const bob = Math.round(Math.sin(t * 2.5 + k) * 2);
    draw(ctx, getFrame(`item_${p.item}`), x, y - 16 + bob);
    if (Math.random() < 0.1) v.ps.spawn({ x: x + rand(-8, 8), y: y - 20, vy: -14, max: 0.8, ramp: ['cream', 'gold4'], add: true, layer: 'ui' });
    if (p.hearts) text(ctx, `${p.hearts} серд.`, x, y + 3, 'red4', { align: 'center', outline: 'ink0' });
    if (exploring && ui.area(`ped-${p.id}`, x - 14, y - 40, 28, 44)) v.act({ type: 'pedestal', id: p.id });
    if (ui.hovered === `ped-${p.id}`) {
      const def = ITEMS[p.item];
      ui.tooltip(def.name, `${def.tagline}. ${def.desc}${p.hearts ? `\nЦена: ${p.hearts} контейнер(а) сердца.` : ''}`, ui.p.x, ui.p.y - 60, p.hearts ? 'red4' : 'gold4');
    }
  });
  room.pickups.forEach((p, k) => {
    const [x, y] = pickupXY(k);
    if (exploring && ui.area(`pk-${p.id}`, x - 8, y - 12, 16, 14)) v.act({ type: 'take', pickup: p.id });
    if (ui.hovered === `pk-${p.id}`)
      ui.tooltip(PICKUP_NAMES[p.kind], p.kind === 'lockedChest' ? 'Открыть ключом' : p.kind === 'half' || p.kind === 'heart' ? 'Подберёшь, когда сердца неполны' : 'Взять', ui.p.x, ui.p.y);
  });
  if (room.trapdoor) {
    // Pulsing rim: the way down must be obvious even in the darkest room.
    const pulse = 0.55 + Math.sin(t * 3) * 0.3;
    draw(ctx, halo(getFrame('trapdoor', 'open'), 'gold4'), trapdoorX(room), FLOOR_Y + 30, ui.hovered === 'trapdoor' ? 1 : pulse);
    if (exploring && ui.area('trapdoor', trapdoorX(room) - 20, FLOOR_Y + 16, 40, 18)) v.act({ type: 'descend' });
    if (ui.hovered === 'trapdoor') ui.tooltip('Люк вниз', `Спуститься на этаж ${v.run.floor + 2}. Пробел.`, ui.p.x, ui.p.y - 30, 'gold4');
    if (exploring) text(ctx, 'Пробел — спуститься', 320, FLOOR_Y + 40, 'gold4', { align: 'center', outline: 'ink0', alpha: 0.6 + Math.sin(t * 4) * 0.3 });
  }
  if (room.kind === 'start' && v.run.floor === 0 && exploring) {
    paragraph(ctx, 'Выбери дверь: стрелки или клик. В бою тяни строку или столбец — сдвиг, который собирает 3+ одинаковых фишки, и есть ход.', 212, 118, 216, 'cold6', { outline: 'ink0' });
  }
}

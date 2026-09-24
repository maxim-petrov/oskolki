import { reachable } from '../game/actmap.ts';
import { ACTS } from '../game/content/acts.ts';
import type { MapNode, RunState } from '../game/types.ts';
import { text } from './font.ts';
import { hex } from './palette.ts';
import { draw, getFrame, type Ctx2D } from './sprite.ts';
import type { UI } from './ui.ts';
import { L } from './view.ts';

/**
 * The act map as a sheet of an evacuation plan: rooms in grey lines, fire extinguishers and
 * exits, the route network as dashes, «Вы здесь» on the current node. Nodes climb from the
 * bottom (entry) to the boss's door at the top.
 */
const KIND_NAME: Record<string, [string, string]> = {
  fight: ['Бой', 'Кто-то шуршит за дверью. Награда: монеты и фишка на выбор.'],
  elite: ['Начальство', 'Сильный враг. Награда: предмет, фишка, осколок памяти.'],
  event: ['Непонятное', 'Что-то случится. Может, хорошее.'],
  shop: ['Касса', 'Фишки, предметы, расходники. Шредер для лишних фишек.'],
  rest: ['Кулер', 'Отдых: лечение или повышение фишки.'],
  treasure: ['Сейф', 'Предмет и немного денег.'],
  boss: ['Кабинет', 'Босс отдела. За ним — следующий отдел.'],
};

const ROOM_LABELS = [
  ['Кабинки', 'Архив', 'Бухгалтерия', 'Копировальная'],
  ['Стеллажи', 'Хранилище', 'Насосная', 'Читальный зал'],
  ['Котлы', 'Склад угля', 'Щитовая', 'Раздевалка'],
  ['Приёмная', 'Переговорная', 'Кабинет', 'Библиотека'],
];

function jitter(id: number, k: number) {
  const s = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

export class MapView {
  /** Pointer over a node (for hover pulse). */
  hover = -1;
  /** Touch: the first tap picks a node and shows what it is, the second one goes. */
  picked = -1;
  /** Read-only mode (opened from the top bar). */
  viewOnly = false;

  sheet() {
    const w = Math.min(L.w - (L.mode === 'wide' ? 24 : 8), 440);
    const h = Math.min(L.h - L.top.h - 8, L.mode === 'wide' ? 420 : 640);
    return { x: Math.round((L.w - w) / 2), y: L.top.h + 4, w, h };
  }

  pos(run: RunState, n: MapNode): [number, number] {
    const s = this.sheet();
    const top = s.y + 50;
    const bottom = s.y + s.h - 26;
    const rows = run.map.rows;
    if (n.kind === 'boss') return [Math.round(s.x + s.w / 2), top - 14];
    const colW = (s.w - 40) / run.map.cols;
    const rowH = (bottom - top) / (rows - 1);
    const x = s.x + 20 + (n.col + 0.5) * colW + jitter(n.id, 1) * colW * 0.35;
    const y = bottom - n.row * rowH + jitter(n.id, 2) * rowH * 0.25;
    return [Math.round(x), Math.round(y)];
  }

  /** Draws the sheet; returns the node the player chose to travel to, or -1. */
  draw(ctx: Ctx2D, ui: UI, run: RunState, t: number): number {
    const s = this.sheet();
    const paper = (c: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = hex(c);
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    // Sheet with a double frame.
    paper('ink0', s.x - 1, s.y - 1, s.w + 2, s.h + 2);
    paper('cream', s.x, s.y, s.w, s.h);
    paper('beige1', s.x + 3, s.y + 3, s.w - 6, 1);
    paper('beige1', s.x + 3, s.y + s.h - 4, s.w - 6, 1);
    paper('beige1', s.x + 3, s.y + 3, 1, s.h - 6);
    paper('beige1', s.x + s.w - 4, s.y + 3, 1, s.h - 6);
    // Faint fold lines.
    paper('beige3', s.x + Math.round(s.w / 2), s.y + 5, 1, s.h - 10);
    paper('beige3', s.x + 5, s.y + Math.round(s.h / 2), s.w - 10, 1);
    this.drawRooms(ctx, run, s);
    // Title block.
    const act = ACTS[Math.min(run.act, ACTS.length - 1)];
    text(ctx, 'ПЛАН ЭВАКУАЦИИ', s.x + 12, s.y + 9, 'ink1');
    text(ctx, `${act.name} · лист ${run.act + 1}`, s.x + 12, s.y + 20, 'slate2');
    if (s.w > 300) draw(ctx, getFrame('map_compass'), s.x + s.w - 22, s.y + 20);
    // Exits on the edges.
    draw(ctx, getFrame('map_exit'), s.x + 3, s.y + Math.round(s.h * 0.45));
    draw(ctx, getFrame('map_exit'), s.x + s.w - 4, s.y + Math.round(s.h * 0.7));
    draw(ctx, getFrame('map_exit'), s.x + Math.round(s.w / 2), s.y + s.h - 3);
    // Routes.
    const nodes = run.map.nodes;
    const next = run.phase === 'map' && !this.viewOnly ? new Set(reachable(run.map, run.node)) : new Set<number>();
    const path = new Set<string>();
    for (const n of nodes) if (n.visited) for (const k of n.next) if (nodes[k].visited) path.add(`${n.id}>${k}`);
    for (const n of nodes)
      for (const k of n.next) {
        const [x0, y0] = this.pos(run, n);
        const [x1, y1] = this.pos(run, nodes[k]);
        const walked = path.has(`${n.id}>${k}`);
        const open = n.id === run.node && next.has(k);
        this.dashes(ctx, x0, y0, x1, y1, walked ? 'green2' : open ? 'red3' : 'slate2', walked || open ? 2 : 1, open ? t : 0);
      }
    if (run.node < 0 && next.size)
      for (const id of next) {
        const [x, y] = this.pos(run, nodes[id]);
        this.dashes(ctx, s.x + s.w / 2, s.y + s.h - 4, x, y, 'red3', 2, t);
      }
    // Nodes.
    let chosen = -1;
    this.hover = -1;
    const hit = L.touch ? 16 : 11;
    for (const n of nodes) {
      const [x, y] = this.pos(run, n);
      const r = n.kind === 'boss' ? 14 : 10;
      paper('cream', x - r, y - r + 2, r * 2, r * 2 - 4);
      const done = n.visited && n.id !== run.node;
      const icon = `map_${n.kind}`;
      const f = getFrame(icon, done ? 'done' : 'idle0');
      const can = next.has(n.id);
      const id = `node-${n.id}`;
      if (ui.area(id, x - hit, y - hit, hit * 2, hit * 2) && can) {
        if (!L.touch || this.picked === n.id) chosen = n.id;
        else this.picked = n.id;
      }
      const hot = ui.hovered === id || this.picked === n.id;
      if (hot) this.hover = n.id;
      if (can) {
        // Reachable: a red ring pulses around it.
        const k = Math.floor(t * 3) % 2;
        this.ring(ctx, x, y, r + 3 + (hot ? 1 : k), hot ? 'red4' : 'red3');
      }
      draw(ctx, f, x - f.w / 2 + f.ox, y - f.h / 2 + f.oy - (hot && can ? 1 : 0));
      if (hot) {
        const [title, body] = KIND_NAME[n.kind] ?? [n.kind, ''];
        ui.tooltip(title, can ? `${body}\n${L.touch ? 'Коснись ещё раз — идти.' : 'Клик — идти.'}` : body, x, y, can ? 'red4' : 'slate3');
      }
    }
    if (chosen >= 0) this.picked = -1;
    // «Вы здесь».
    const here = run.node >= 0 ? nodes[run.node] : null;
    const [hx, hy] = here ? this.pos(run, here) : [s.x + s.w / 2, s.y + s.h - 12];
    const bob = Math.round(Math.sin(t * 4) * 1.5);
    draw(ctx, getFrame('map_here'), hx, hy - 10 + bob);
    text(ctx, 'Вы здесь', hx + 8, hy - 22 + bob, 'red3');
    return chosen;
  }

  private ring(ctx: Ctx2D, x: number, y: number, r: number, color: string) {
    ctx.fillStyle = hex(color);
    const steps = Math.max(16, r * 6);
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
    }
  }

  /** Dashed route line; `t` animates the dashes crawling towards the target. */
  private dashes(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, color: string, size: number, t: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.floor(len / 3);
    const shift = t ? Math.floor(t * 8) % 3 : 0;
    ctx.fillStyle = hex(color);
    for (let k = 2; k < n - 1; k++) {
      if ((k + shift) % 3 === 2) continue;
      const a = k / n;
      ctx.fillRect(Math.round(x0 + (x1 - x0) * a), Math.round(y0 + (y1 - y0) * a), size, size);
    }
  }

  /** Grey room outlines with door arcs and labels (decoration, stable per act). */
  private drawRooms(ctx: Ctx2D, run: RunState, s: { x: number; y: number; w: number; h: number }) {
    const wall = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = hex('slate3');
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const m = 14;
    const midX = s.x + s.w * (0.48 + jitter(run.seed + run.act, 3) * 0.1);
    const midY = s.y + s.h * (0.5 + jitter(run.seed + run.act, 4) * 0.1);
    // Outer walls with gaps for the exits.
    wall(s.x + m, s.y + m + 20, s.w - m * 2, 2);
    wall(s.x + m, s.y + s.h - m, s.w / 2 - m - 16, 2);
    wall(s.x + s.w / 2 + 16, s.y + s.h - m, s.w / 2 - m - 16, 2);
    wall(s.x + m, s.y + m + 20, 2, s.h * 0.4 - 10);
    wall(s.x + m, s.y + s.h * 0.5 + 18, 2, s.h * 0.5 - m - 16);
    wall(s.x + s.w - m - 2, s.y + m + 20, 2, s.h * 0.62);
    wall(s.x + s.w - m - 2, s.y + s.h * 0.78, 2, s.h * 0.22 - m + 2);
    // Inner partitions with door gaps.
    wall(midX, s.y + m + 20, 2, (midY - s.y) * 0.55);
    wall(midX, midY + 22, 2, s.y + s.h - m - midY - 22);
    wall(s.x + m, midY, (midX - s.x - m) * 0.55, 2);
    wall(midX + 24, midY, s.x + s.w - m - midX - 24, 2);
    // Door arcs.
    ctx.fillStyle = hex('slate4');
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * (Math.PI / 2);
      ctx.fillRect(Math.round(midX + 2 + Math.cos(a) * 18), Math.round(midY - 2 - Math.sin(a) * 18), 1, 1);
    }
    // Room labels.
    const labels = ROOM_LABELS[Math.min(run.act, ROOM_LABELS.length - 1)];
    text(ctx, labels[0], s.x + m + 6, midY - 12, 'slate3');
    text(ctx, labels[1], midX + 8, s.y + m + 26, 'slate3');
    text(ctx, labels[2], midX + 8, midY + 6, 'slate3');
    text(ctx, labels[3], s.x + m + 6, s.y + s.h - m - 12, 'slate3');
    // Fire extinguishers.
    for (let k = 0; k < 4; k++) {
      const x = s.x + m + 10 + (0.5 + jitter(run.seed + k, 5) * 0.9) * (s.w - m * 2 - 20);
      const y = s.y + 50 + (0.5 + jitter(run.seed + k, 6) * 0.9) * (s.h - 90);
      draw(ctx, getFrame('map_extinguisher'), Math.round(x), Math.round(y));
    }
  }
}

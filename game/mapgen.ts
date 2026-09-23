import { chance, int, range, shuffle, weighted, type Rng } from './rng.ts';
import { ENEMIES } from './content/enemies.ts';
import { FLOORS } from './content/floors.ts';
import type { Dir, FloorMap, Room, RoomKind } from './types.ts';

export const DIRS: Dir[] = ['n', 'e', 's', 'w'];
export const STEP: Record<Dir, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { n: 's', e: 'w', s: 'n', w: 'e' };
const SIZE = 9;

const key = (x: number, y: number) => y * SIZE + x;

function emptyRoom(id: number, x: number, y: number, kind: RoomKind): Room {
  return {
    id,
    x,
    y,
    kind,
    doors: {},
    visited: false,
    seen: false,
    cleared: kind !== 'combat' && kind !== 'boss',
    locked: false,
    hidden: kind === 'secret',
    dist: 0,
    enemies: [],
    pickups: [],
    pedestals: [],
    shop: [],
    variant: 0,
    trapdoor: false,
  };
}

/** Enemy list for a combat room within the floor budget. */
export function composeEnemies(r: Rng, floor: number, dist: number): string[] {
  const def = FLOORS[floor];
  let budget = Math.min(def.budget.max, def.budget.base + def.budget.perDist * dist);
  const out: string[] = [];
  while (out.length < 3) {
    const options = def.pool.filter(([id]) => ENEMIES[id].cost <= budget + 0.3);
    if (!options.length) break;
    const id = weighted(r, options);
    out.push(id);
    budget -= ENEMIES[id].cost;
    if (budget < 0.5) break;
  }
  if (!out.length) {
    const cheapest = [...def.pool].sort((a, b) => ENEMIES[a[0]].cost - ENEMIES[b[0]].cost)[0][0];
    out.push(cheapest);
  }
  return out;
}

/** Isaac-style floor: rooms grow from the start cell; special rooms sit in dead ends. */
export function generateFloor(r: Rng, floor: number): FloorMap {
  const def = FLOORS[floor];
  for (let attempt = 0; attempt < 400; attempt++) {
    const target = range(r, def.rooms[0], def.rooms[1]) + 4; // + start + boss + treasure + shop
    const cells = new Map<number, [number, number]>();
    const sx = 4;
    const sy = 4;
    cells.set(key(sx, sy), [sx, sy]);
    const queue: [number, number][] = [[sx, sy]];
    const occupied = (x: number, y: number) => cells.has(key(x, y));
    const neighbourCount = (x: number, y: number) =>
      DIRS.filter((d) => occupied(x + STEP[d][0], y + STEP[d][1])).length;
    let guard = 0;
    while (cells.size < target && guard++ < 500) {
      if (!queue.length) queue.push([...cells.values()][int(r, cells.size)]);
      const [x, y] = queue.shift()!;
      for (const d of shuffle(r, [...DIRS])) {
        const nx = x + STEP[d][0];
        const ny = y + STEP[d][1];
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        if (occupied(nx, ny)) continue;
        if (neighbourCount(nx, ny) > 1) continue;
        if (!chance(r, 0.5)) continue;
        cells.set(key(nx, ny), [nx, ny]);
        queue.push([nx, ny]);
        if (cells.size >= target) break;
      }
    }
    if (cells.size < target) continue;

    // Distances from start.
    const dist = new Map<number, number>([[key(sx, sy), 0]]);
    const bfs: [number, number][] = [[sx, sy]];
    while (bfs.length) {
      const [x, y] = bfs.shift()!;
      for (const d of DIRS) {
        const nx = x + STEP[d][0];
        const ny = y + STEP[d][1];
        if (occupied(nx, ny) && !dist.has(key(nx, ny))) {
          dist.set(key(nx, ny), dist.get(key(x, y))! + 1);
          bfs.push([nx, ny]);
        }
      }
    }
    const deadEnds = [...cells.values()]
      .filter(([x, y]) => !(x === sx && y === sy) && neighbourCount(x, y) === 1)
      .sort((a, b) => dist.get(key(b[0], b[1]))! - dist.get(key(a[0], a[1]))!);
    if (deadEnds.length < 3) continue;
    const boss = deadEnds[0];
    if (dist.get(key(boss[0], boss[1]))! < 3) continue;
    const rest = shuffle(r, deadEnds.slice(1));
    const treasure = rest[0];
    const shop = rest[1];

    // Secret room: empty cell touching 2+ rooms, never next to the boss.
    const touchesBoss = (x: number, y: number) =>
      DIRS.some((d) => x + STEP[d][0] === boss[0] && y + STEP[d][1] === boss[1]);
    let secret: [number, number] | null = null;
    let bestTouch = 1;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        if (occupied(x, y) || touchesBoss(x, y)) continue;
        const n = neighbourCount(x, y);
        if (n > bestTouch || (n === bestTouch && n >= 2 && chance(r, 0.35))) {
          bestTouch = n;
          secret = [x, y];
        }
      }

    const rooms: Room[] = [];
    const idAt = new Map<number, number>();
    const place = (x: number, y: number, kind: RoomKind) => {
      const room = emptyRoom(rooms.length, x, y, kind);
      room.dist = dist.get(key(x, y)) ?? 0;
      room.variant = int(r, 4);
      rooms.push(room);
      idAt.set(key(x, y), room.id);
      return room;
    };
    for (const [x, y] of cells.values()) {
      const kind: RoomKind =
        x === sx && y === sy
          ? 'start'
          : x === boss[0] && y === boss[1]
            ? 'boss'
            : x === treasure[0] && y === treasure[1]
              ? 'treasure'
              : x === shop[0] && y === shop[1]
                ? 'shop'
                : 'combat';
      const room = place(x, y, kind);
      if (kind === 'combat') room.enemies = composeEnemies(r, floor, room.dist);
      if (kind === 'boss') room.enemies = [def.boss];
      if (kind === 'treasure' && floor > 0) room.locked = true;
    }
    for (const room of rooms)
      for (const d of DIRS) {
        const id = idAt.get(key(room.x + STEP[d][0], room.y + STEP[d][1]));
        if (id !== undefined) room.doors[d] = id;
      }
    if (secret) {
      const s = place(secret[0], secret[1], 'secret');
      s.dist = 99;
    }
    const start = idAt.get(key(sx, sy))!;
    rooms[start].visited = true;
    rooms[start].seen = true;
    for (const id of Object.values(rooms[start].doors)) rooms[id!].seen = true;
    return { rooms, start, boss: idAt.get(key(boss[0], boss[1]))! };
  }
  throw new Error('generateFloor: no layout');
}

/** The hidden secret room adjacent to `room` in direction `dir`, if any. */
export function secretAt(map: FloorMap, room: Room, dir: Dir): Room | undefined {
  const x = room.x + STEP[dir][0];
  const y = room.y + STEP[dir][1];
  return map.rooms.find((s) => s.kind === 'secret' && s.hidden && s.x === x && s.y === y);
}

import { newRun, dispatch, currentRoom } from '../game/run.ts';
import { makeEnemy } from '../game/combat.ts';
import { computeMods } from '../game/content/items.ts';

const F = { b: 'blade', s: 'shield', i: 'ink', c: 'coin', p: 'prism', j: 'junk' };
export function cells(rows, start = 1000) {
  let id = start;
  return rows.flatMap((row) => [...row].map((ch) => ({ id: id++, kind: F[ch] })));
}
export const FILLER = ['sicbsi', 'cbsicb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];

/** A run standing in a fresh combat room with the given enemies and board. */
export function combatRun({ seed = 1, enemies = ['rat'], rows = FILLER, items = [], char } = {}) {
  let { run } = newRun({ seed, char });
  const start = currentRoom(run);
  const dir = Object.entries(start.doors).find(([, id]) => run.map.rooms[id].kind === 'combat')?.[0];
  if (!dir) throw new Error('no combat room next to start for seed ' + seed);
  run = dispatch(run, { type: 'go', dir }).run;
  run.hero.items.push(...items);
  const c = run.combat;
  c.enemies = [];
  c.nextUid = 1;
  const mods = computeMods(run.hero.items, []);
  for (const id of enemies) c.enemies.push(makeEnemy(run, c, id, mods));
  c.target = c.enemies[0].uid;
  c.board.cells = cells(rows);
  return run;
}

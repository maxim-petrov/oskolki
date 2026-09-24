import { newRun } from '../game/run.ts';
import { makeEnemy, startCombat } from '../game/combat.ts';
import { computeMods } from '../game/content/items.ts';

const F = { b: 'blade', s: 'shield', i: 'ink', c: 'coin', p: 'prism', j: 'junk' };
const CARD = { blade: 'fist', shield: 'folder', ink: 'ink', coin: 'clip' };
/** Board from 6 strings of letters b/s/i/c/p/j; tiles carry the starter card of their family. */
export function cells(rows, start = 1000) {
  let id = start;
  return rows.flatMap((row) =>
    [...row].map((ch) => {
      const kind = F[ch];
      return CARD[kind] ? { id: id++, kind, card: CARD[kind] } : { id: id++, kind };
    }),
  );
}
export const FILLER = ['sicbsi', 'cbsicb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
export const STARTER_BAG = ['fist', 'folder', 'ink', 'clip'].flatMap((card) => Array(9).fill({ card, up: false }));

/** A run in a fight with the given enemies and board; relics are added to the hero first. */
export function combatRun({ seed = 1, enemies = ['rat'], rows = FILLER, relics = [], char, quiet = true } = {}) {
  const { run } = newRun({ seed, char });
  run.hero.relics.push(...relics);
  const mods = computeMods(run.hero.relics);
  run.combat = startCombat(run, 'fight', [], mods, []);
  run.phase = 'combat';
  const c = run.combat;
  c.enemies = [];
  c.nextUid = 1;
  for (const id of enemies) c.enemies.push(makeEnemy(run, c, id, mods));
  c.target = c.enemies[0].uid;
  c.board.cells = cells(rows);
  if (quiet) {
    // Refills are paperwork that never matches: numbers in tests stay exact (no surprise cascades).
    c.board.source = [{ card: 'redtape', up: false }];
    c.board.bag = [];
    c.board.queue = c.board.queue.map((q) => q.map((t, k) => ({ id: 20000 + t.id + k, kind: 'junk', card: 'redtape' })));
  }
  return run;
}

/** Puts a card on a board cell. */
export function setCard(run, i, card, extra = {}) {
  const fam = { fist: 'blade', folder: 'shield', ink: 'ink', clip: 'coin' }[card];
  const t = run.combat.board.cells[i];
  run.combat.board.cells[i] = { ...t, card, ...(fam ? { kind: fam } : {}), ...extra };
}

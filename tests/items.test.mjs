import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../game/run.ts';
import { idx } from '../game/board.ts';
import { computeMods, ITEMS } from '../game/content/items.ts';
import { combatRun } from './helpers.mjs';

// Swapping (0,2) down into (1,2) brings a blade next to the blades at (1,0),(1,1).
const BLADE_ROW = ['sicbsi', 'bbicsc', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
function bladeSetup(items, enemies = ['anchor']) {
  const run = combatRun({ rows: BLADE_ROW, items, enemies });
  run.combat.board.cells[idx(0, 2)].kind = 'blade';
  return run;
}
const move = { type: 'move', move: { from: idx(0, 2), to: idx(1, 2) } };
const damageOf = (events) =>
  events.filter((e) => e.t === 'wave').flatMap((w) => w.effects).filter((f) => f.kind === 'damage' && f.source === 'blade');

test('every item and transformation compiles into mods', () => {
  for (const id of Object.keys(ITEMS)) computeMods([id], []);
  const m = computeMods(['ring', 'carbon', 'timesheet'], ['bureau', 'pyro', 'accountant', 'coffee', 'pets']);
  assert.equal(m.wrap, true);
  assert.equal(m.bureau, true);
});

test('coffee raises blade damage', () => {
  const base = damageOf(dispatch(bladeSetup([]), move).events)[0].amount;
  const boosted = damageOf(dispatch(bladeSetup(['coffee', 'espresso']), move).events)[0].amount;
  assert.ok(boosted > base, `${boosted} > ${base}`);
});

test('the hole punch ignores enemy armor', () => {
  const armored = dispatch(bladeSetup([], ['crab']), move);
  const pierced = dispatch(bladeSetup(['punch'], ['crab']), move);
  assert.ok(damageOf(pierced.events)[0].amount > damageOf(armored.events)[0].amount);
});

test('carbon copy echoes the first group at half strength', () => {
  const res = dispatch(bladeSetup(['carbon']), move);
  const procs = res.events.filter((e) => e.t === 'wave').flatMap((w) => w.effects).filter((f) => f.source === 'carbon');
  assert.equal(procs.length, 1);
  const hits = res.events.filter((e) => e.t === 'wave').flatMap((w) => w.effects).filter((f) => f.kind === 'damage');
  assert.ok(hits.length >= 2, 'original hit plus the echo');
});

test('ring binder lets lines and swaps continue across the edge', () => {
  const rows = ['sbbicb', 'icbsic', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
  const across = { type: 'move', move: { from: idx(0, 0), to: idx(0, 5) } };
  // Row 0 "s b b i c b": swapping the edge tiles gives "b b b i c s".
  const plain = dispatch(combatRun({ rows }), across);
  assert.equal(plain.events[0].t, 'invalid', 'without the ring the edges are not neighbours');
  const res = dispatch(combatRun({ rows, items: ['ring'] }), across);
  const first = res.events.find((e) => e.t === 'wave');
  assert.ok(first.groups.some((g) => g.fam === 'blade' && g.cells.includes(0) && g.cells.includes(2)));
  // A line through the edge counts as a match with the ring: "b s i c b b" has blades at 4, 5, 0.
  const run = combatRun({ rows: ['bsicbb', 'icbsic', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], items: ['ring'] });
  const wrapRes = dispatch(run, { type: 'move', move: { from: idx(3, 0), to: idx(3, 1) } });
  const wave = wrapRes.events.find((e) => e.t === 'wave');
  assert.ok(wave.groups.some((g) => g.fam === 'blade' && g.cells.includes(5) && g.cells.includes(0)));
});

test('double-sided tape turns shields into damage', () => {
  const run = combatRun({ rows: ['sicbsi', 'ssicbc', 'bicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], items: ['tape'], enemies: ['anchor'] });
  // A shield at (0,2) swapped down makes (1,0),(1,1),(1,2) a shield line.
  run.combat.board.cells[idx(0, 2)].kind = 'shield';
  const res = dispatch(run, move);
  const tape = res.events.filter((e) => e.t === 'wave').flatMap((w) => w.effects).filter((f) => f.source === 'tape');
  assert.ok(tape.length >= 1 && tape[0].amount > 0);
});

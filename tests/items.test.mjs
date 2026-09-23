import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../game/run.ts';
import { idx } from '../game/board.ts';
import { computeMods, ITEMS } from '../game/content/items.ts';
import { cells, combatRun } from './helpers.mjs';

// Column 2 shifted down by 1 brings a blade to (1,2) next to blades at (1,0),(1,1).
const BLADE_ROW = ['sicbsi', 'bbicsc', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
function bladeSetup(items, enemies = ['anchor']) {
  const run = combatRun({ rows: BLADE_ROW, items, enemies });
  run.combat.board.cells[idx(0, 2)].kind = 'blade';
  return run;
}
const move = { type: 'move', move: { line: 'col', index: 2, delta: 1 } };
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

test('ring binder lets a line continue across the edge', () => {
  const run = combatRun({ rows: ['bsicbi', 'icbsic', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], items: ['ring'] });
  // Row 0: b s i c b i — rotate right by 1 → i b s i c b: blades at 1 and 5 plus wrap (5,0?) no;
  // Instead check the rules directly: a wrap-only match is a legal move with the ring.
  run.combat.board.cells = cells(['bbsicb', 'icbsic', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb']);
  // Row 0 "b b s i c b": wrap joins cells 5,0,1 into a blade line — already a match, so shift another row.
  const res = dispatch(run, { type: 'move', move: { line: 'row', index: 3, delta: 1 } });
  const first = res.events.find((e) => e.t === 'wave');
  assert.ok(first, 'a wave resolved');
  assert.ok(first.groups.some((g) => g.fam === 'blade' && g.cells.includes(5) && g.cells.includes(0)));
});

test('double-sided tape turns shields into damage', () => {
  const run = combatRun({ rows: ['sicbsi', 'ssicbc', 'bicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], items: ['tape'], enemies: ['anchor'] });
  // Column 2 down by 1: (0,2) 'i'→(1,2)? Put a shield at (0,2) so (1,0),(1,1),(1,2) become shields.
  run.combat.board.cells[idx(0, 2)].kind = 'shield';
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 2, delta: 1 } });
  const tape = res.events.filter((e) => e.t === 'wave').flatMap((w) => w.effects).filter((f) => f.source === 'tape');
  assert.ok(tape.length >= 1 && tape[0].amount > 0);
});

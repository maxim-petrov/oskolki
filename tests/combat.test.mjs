import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../game/run.ts';
import { idx } from '../game/board.ts';
import { BLAST_MULT_CAP } from '../game/combat.ts';
import { combatRun, setCard } from './helpers.mjs';

/** Swapping (0,2) down into (1,2) completes the blade line in row 1 on this board. */
const ROWS = ['sibcsi', 'bbiccs', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
const DOWN = { type: 'move', move: { from: idx(0, 2), to: idx(1, 2) } };
const strikeOf = (events) => events.find((e) => e.t === 'strike');

test('three fists deal 6 × mult; the paper knife doubles it against paper', () => {
  const run = combatRun({ rows: ROWS, enemies: ['rat'] });
  const hp = run.combat.enemies[0].hp;
  const res = dispatch(run, DOWN);
  const s = strikeOf(res.events);
  assert.equal(s.tally.dmg, 6);
  assert.equal(s.tally.mult, 1);
  assert.equal(s.damage, 12, 'knife ×2 against a paper rat');
  assert.equal(res.run.combat.enemies[0].hp, hp - 12);
  const ink = combatRun({ rows: ROWS, enemies: ['drop'] });
  assert.equal(strikeOf(dispatch(ink, DOWN).events).damage, 6, 'no bonus against ink');
});

test('every tile of a group scores on the tally, one line per tile', () => {
  const run = combatRun({ rows: ROWS });
  const wave = dispatch(run, DOWN).events.find((e) => e.t === 'wave');
  assert.equal(wave.scores.filter((s) => s.card === 'fist').length, 3);
  assert.ok(wave.scores.every((s) => s.dmg === 2));
});

test('bonus cards add mult per tile; a gold clip multiplies once per move', () => {
  const run = combatRun({ rows: ['sicbsi', 'ccbisb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'] });
  // Row 1: c c _ → swap (0,2) coin? Build a gold line: put coins at (1,0),(1,1) and drop a coin into (1,2).
  run.combat.board.cells[idx(0, 2)] = { id: 9000, kind: 'coin', card: 'bonus' };
  setCard(run, idx(1, 0), 'clip');
  run.combat.board.cells[idx(1, 1)] = { id: 9001, kind: 'coin', card: 'goldclip' };
  const s = strikeOf(dispatch(run, DOWN).events);
  assert.equal(s.tally.mult, 1.5 * 2, 'mult (1 + 1 bonus) × 1.5');
});

test('blast multipliers are capped per move', () => {
  assert.equal(BLAST_MULT_CAP, 6);
});

test('armor from blue tiles is multiplied and spent after the enemies act', () => {
  const run = combatRun({ rows: ['sicbsi', 'issbcb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], enemies: ['rat'] });
  // Drop a shield from (0,3) into (1,3): s s s in row 1.
  run.combat.board.cells[idx(0, 3)] = { id: 9100, kind: 'shield', card: 'folder' };
  run.combat.enemies[0].countdown = 1;
  const res = dispatch(run, { type: 'move', move: { from: idx(0, 3), to: idx(1, 3) } });
  const s = strikeOf(res.events);
  assert.equal(s.armor, 3, 'three folders give 1 armor each');
  const act = res.events.find((e) => e.t === 'enemyAct');
  assert.equal(act.hurt.armor, 3, 'armor soaks the blow');
  assert.equal(res.run.hero.armor, 0);
});

test('armor does not carry over a non-attacking enemy action', () => {
  const run = combatRun({ rows: ROWS, enemies: ['kipa'] });
  const e = run.combat.enemies[0];
  e.cycle = 1; // tape next
  e.countdown = 1;
  run.hero.armor = 10;
  const res = dispatch(run, DOWN);
  assert.ok(res.events.some((x) => x.t === 'enemyAct' && x.intent.kind === 'tape'));
  assert.equal(res.run.hero.armor, 0);
});

test('red tape turns tiles into paperwork and slips into the bag', () => {
  const run = combatRun({ rows: ROWS, enemies: ['kipa'] });
  const e = run.combat.enemies[0];
  e.cycle = 1;
  e.countdown = 1;
  const res = dispatch(run, DOWN);
  const act = res.events.find((x) => x.t === 'enemyAct');
  assert.equal(act.intent.kind, 'tape');
  assert.equal(act.cells.length, 2);
  for (const i of act.cells) assert.equal(act.board[i].card, 'redtape');
  assert.ok(res.run.combat.board.source.some((t) => t.card === 'redtape'));
});

test('laminated tiles are not spoiled', () => {
  const run = combatRun({ rows: ROWS, enemies: ['kipa'] });
  for (const t of run.combat.board.cells) t.finish = 'laminate';
  const e = run.combat.enemies[0];
  e.cycle = 1;
  e.countdown = 1;
  const act = dispatch(run, DOWN).events.find((x) => x.t === 'enemyAct');
  assert.equal(act.cells.length, 0);
});

test('a stunned enemy skips once and cannot be stunned again right away', () => {
  const run = combatRun({ rows: ROWS, enemies: ['rat'] });
  const e = run.combat.enemies[0];
  e.stunned = true;
  e.countdown = 1;
  const res = dispatch(run, DOWN);
  assert.ok(res.events.some((x) => x.t === 'enemyAct' && x.skipped));
  assert.equal(res.run.combat.enemies[0].stunImmune, true);
});

test('invalid moves change nothing and spend no time', () => {
  const run = combatRun();
  const res = dispatch(run, { type: 'move', move: { from: idx(0, 0), to: idx(0, 1) } });
  assert.ok(res.events.some((e) => e.t === 'invalid'));
  assert.equal(dispatch(run, { type: 'move', move: { from: idx(0, 0), to: idx(1, 1) } }).events[0].reason, 'Только с соседней фишкой');
  assert.equal(res.run.combat.moves, 0);
});

test('a swapped rocket fires where it lands and adds to the multiplier', () => {
  const run = combatRun({ enemies: ['anchor'] });
  run.combat.board.cells[idx(2, 1)] = { id: 5000, kind: 'blade', card: 'fist', special: 'rocketH' };
  const res = dispatch(run, { type: 'move', move: { from: idx(2, 1), to: idx(2, 2) } });
  const wave = res.events.find((e) => e.t === 'wave');
  const rocket = wave.blasts.find((b) => b.kind === 'rocketH');
  assert.equal(rocket.at, idx(2, 2));
  assert.deepEqual(rocket.cells, [12, 13, 14, 15, 16, 17]);
  assert.ok(strikeOf(res.events).tally.mult >= 2);
});

test('two swapped specials combine; a prism wipes the family it touches', () => {
  const run = combatRun({ enemies: ['anchor'] });
  run.combat.board.cells[idx(2, 1)] = { id: 5000, kind: 'blade', special: 'rocketH' };
  run.combat.board.cells[idx(2, 2)] = { id: 5001, kind: 'coin', special: 'rocketV' };
  const cross = dispatch(run, { type: 'move', move: { from: idx(2, 1), to: idx(2, 2) } }).events.find((e) => e.t === 'wave');
  assert.equal(cross.blasts[0].kind, 'cross');
  assert.equal(cross.blasts[0].cells.length, 11);
  const run2 = combatRun({ enemies: ['anchor'] });
  run2.combat.board.cells[idx(3, 3)] = { id: 5002, kind: 'prism' };
  const coins = run2.combat.board.cells.filter((t) => t.kind === 'coin').length;
  const wave = dispatch(run2, { type: 'move', move: { from: idx(3, 3), to: idx(3, 4) } }).events.find((e) => e.t === 'wave');
  assert.equal(wave.blasts[0].kind, 'prism');
  assert.equal(wave.cleared.filter((x) => x.kind === 'coin').length, coins);
});

test('the pocket bomb blasts without spending time', () => {
  const run = combatRun({ enemies: ['anchor'] });
  run.hero.pockets[0] = 'bomb';
  const before = run.combat.enemies[0].countdown;
  const res = dispatch(run, { type: 'pocket', slot: 0, cell: idx(2, 2) });
  assert.ok(res.events.some((e) => e.t === 'wave' && e.blasts.some((b) => b.kind === 'bomb-item')));
  assert.equal(res.run.hero.pockets[0], null);
  assert.equal(res.run.combat.enemies[0].countdown, before);
});

test('the fight is deterministic for a seed', () => {
  const a = dispatch(combatRun({ rows: ROWS, seed: 9 }), DOWN);
  const b = dispatch(combatRun({ rows: ROWS, seed: 9 }), DOWN);
  assert.deepEqual(a.events, b.events);
});

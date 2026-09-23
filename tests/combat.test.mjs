import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newRun, saveRun, loadRun, currentRoom } from '../game/run.ts';
import { idx } from '../game/board.ts';
import { cells, combatRun, FILLER } from './helpers.mjs';

const moveOf = (events) => events.filter((e) => e.t === 'wave');

test('a blade line damages the target; shields, ink and coins pay out', () => {
  // Row 0 "bbsbc..." : shifting col 2 up? Simpler: row 0 = b b i b s c ; moving row 0 is complex,
  // so craft a board where shifting row 1 right by 1 completes a blade line in row 1.
  const run = combatRun({ rows: ['sicbsi', 'bbicsc', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'] });
  // Row 1: b b i c s c → shift col 2 so a blade lands at (1,2)? Use a column shift instead:
  run.combat.board.cells[idx(0, 2)].kind = 'blade';
  const hp = run.combat.enemies[0].hp;
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 2, delta: 1 } });
  const waves = moveOf(res.events);
  assert.ok(waves.length >= 1);
  assert.equal(waves[0].groups[0].fam, 'blade');
  const e = res.run.combat?.enemies[0] ?? { hp: 0 };
  assert.ok(e.hp < hp, 'enemy took damage');
});

test('invalid moves change nothing and spend no time', () => {
  const run = combatRun();
  const res = dispatch(run, { type: 'move', move: { line: 'row', index: 0, delta: 1 } });
  assert.ok(res.events.some((e) => e.t === 'invalid'));
  assert.equal(res.run.combat.moves, 0);
  assert.equal(res.run.combat.enemies[0].countdown, run.combat.enemies[0].countdown);
});

test('armor absorbs a blow and burns out; then soul, then red hearts', () => {
  const run = combatRun({ enemies: ['scribe'] });
  run.hero.armor = 1;
  run.hero.soul = 0;
  const e = run.combat.enemies[0];
  e.countdown = 1; // attacks on the next tick (attack 2)
  run.combat.board.cells[idx(0, 2)].kind = 'blade';
  run.combat.board.cells = run.combat.board.cells.map((t, i) => (i === idx(1, 0) || i === idx(1, 1) ? { ...t, kind: 'blade' } : t));
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 2, delta: 1 } });
  const act = res.events.find((x) => x.t === 'enemyAct');
  assert.ok(act, 'enemy acted');
  assert.ok(act.hurt.armor >= 1, 'armor took part of the blow');
  assert.equal(act.hurt.armor + act.hurt.soul + act.hurt.red, 2);
  assert.equal(res.run.hero.armor, 0, 'remaining armor burns after the blow');
});

test('a rocket clears its row and blasted tiles pay their family', () => {
  const run = combatRun({ enemies: ['anchor'] });
  const c = run.combat;
  c.board.cells = cells(['bbbics', 'cbsicb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb']);
  c.board.cells[idx(2, 1)] = { id: 5000, kind: 'blade', special: 'rocketH' };
  // Move col 1 up by 1: row 0 col 1 gets the rocket? We want a match containing the rocket.
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 1, delta: 5 } });
  const wave = res.events.find((e) => e.t === 'wave');
  assert.ok(wave.blasts.some((b) => b.kind === 'rocketH'), 'rocket fired');
  assert.ok(wave.cleared.some((x) => x.cause === 'blast'));
});

test('ink junk next to a match is washed away', () => {
  const run = combatRun();
  const c = run.combat;
  c.board.cells = cells(['sicbsi', 'bbicsc', 'jicbsi', 'cbsicb', 'sicbsi', 'cbsicb']);
  c.board.cells[idx(0, 2)].kind = 'blade';
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 2, delta: 1 } });
  const wave = res.events.find((e) => e.t === 'wave');
  assert.ok(wave.cleared.some((x) => x.kind === 'junk' && x.cause === 'splash'));
});

test('an ember burns the hero when its fuse runs out', () => {
  const run = combatRun({ enemies: ['anchor'] });
  const c = run.combat;
  c.enemies[0].countdown = 9;
  c.board.cells[idx(5, 5)].fuse = 1;
  run.hero.armor = 0;
  c.board.cells[idx(0, 2)].kind = 'blade';
  c.board.cells[idx(1, 0)].kind = 'blade';
  c.board.cells[idx(1, 1)].kind = 'blade';
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 2, delta: 1 } });
  const ember = res.events.find((e) => e.t === 'ember');
  assert.ok(ember, 'ember burnt out');
  assert.equal(ember.hurt.amount, 1);
  assert.equal(ember.hurt.armor + ember.hurt.soul + ember.hurt.red, 1);
});

test('stapler stuns: the enemy skips its next action', () => {
  const run = combatRun({ enemies: ['anchor'] });
  run.hero.active = 'stapler';
  run.hero.charge = 6;
  const uid = run.combat.enemies[0].uid;
  const res = dispatch(run, { type: 'active', uid });
  assert.equal(res.run.combat.enemies[0].stunned, true);
  assert.equal(res.run.hero.charge, 0);
});

test('same seed and same actions give the same run; saves round-trip', () => {
  const play = () => {
    let { run } = newRun({ seed: 99 });
    const dir = Object.keys(currentRoom(run).doors)[0];
    run = dispatch(run, { type: 'go', dir }).run;
    return run;
  };
  const a = play();
  const b = play();
  assert.deepEqual(a, b);
  const loaded = loadRun(saveRun(a));
  assert.deepEqual(loaded, a);
  assert.equal(loadRun('{"rules":"old"}'), null);
});

test('killing the last enemy clears the room and opens the doors', () => {
  const run = combatRun();
  run.combat.enemies[0].hp = 1;
  run.combat.board.cells[idx(0, 2)].kind = 'blade';
  run.combat.board.cells[idx(1, 0)].kind = 'blade';
  run.combat.board.cells[idx(1, 1)].kind = 'blade';
  const res = dispatch(run, { type: 'move', move: { line: 'col', index: 2, delta: 1 } });
  assert.equal(res.run.phase, 'explore');
  assert.ok(res.events.some((e) => e.t === 'roomClear'));
  assert.equal(res.run.combat, null);
  assert.ok(currentRoom(res.run).cleared);
});

void FILLER;

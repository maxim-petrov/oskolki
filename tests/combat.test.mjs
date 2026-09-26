import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../game/run.ts';
import { combatRun, idx, setCard } from './helpers.mjs';
import { foe, line, play, ready, scene } from './scene.mjs';
import { energyCap } from '../game/combat.ts';

/** Swapping (0,2) down into (1,2) completes the blade line in row 1 on this board. */
const ROWS = ['sibcsi', 'bbiccs', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
const DOWN = { type: 'move', move: { from: idx(0, 2), to: idx(1, 2) } };
const strikeOf = (events) => events.find((e) => e.t === 'strike');

test('three red tiles strike with the knife: 6 damage, +100% against paper', () => {
  const run = combatRun({ rows: ROWS, enemies: ['rat'] });
  const hp = run.combat.enemies[0].hp;
  const res = dispatch(run, DOWN);
  const s = strikeOf(res.events);
  assert.equal(s.tally.dmg, 6);
  assert.equal(s.tally.bonus, 1, 'the paper bonus of the knife');
  assert.equal(s.damage, 12, 'knife +100% against a paper rat');
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

test('bonus cards add damage per tile; a gold clip adds +30% once per move', () => {
  const run = combatRun({ rows: ['sicbsi', 'ccbisb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'] });
  // Row 1: c c _ → swap (0,2) coin? Build a gold line: put coins at (1,0),(1,1) and drop a coin into (1,2).
  run.combat.board.cells[idx(0, 2)] = { id: 9000, kind: 'coin', card: 'bonus' };
  setCard(run, idx(1, 0), 'clip');
  run.combat.board.cells[idx(1, 1)] = { id: 9001, kind: 'coin', card: 'goldclip' };
  const s = strikeOf(dispatch(run, DOWN).events);
  assert.equal(s.tally.dmg, 3, 'the bonus card: +3 damage');
  assert.equal(s.tally.bonus, 0.3);
  assert.equal(s.damage, 4, '3 damage +30%');
});

test('a blue group blocks half a heart and the armour is spent after the enemies act', () => {
  const run = combatRun({ rows: ['sicbsi', 'issbcb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], enemies: ['rat'] });
  // Drop a sealed shield (+2 damage) from (0,3) into (1,3): s s s in row 1.
  run.combat.board.cells[idx(0, 3)] = { id: 9100, kind: 'shield', card: 'folder', finish: 'seal' };
  run.combat.enemies[0].countdown = 1;
  const res = dispatch(run, { type: 'move', move: { from: idx(0, 3), to: idx(1, 3) } });
  const s = strikeOf(res.events);
  assert.equal(s.tally.dmg, 2, 'the seal');
  assert.equal(s.armor, 1, 'a group of three folders: half a heart');
  const act = res.events.find((e) => e.t === 'enemyAct');
  assert.equal(act.hurt.armor, act.hurt.amount, 'armor soaks the blow');
  assert.equal(act.hurt.red, 0);
  assert.equal(res.run.hero.armor, 0);
});

test('armor holds at most two hearts (and no more than the health): heavier blows wound', () => {
  assert.equal(hit4Armor({}), 4, 'шесть половинок брони, влезло четыре');
  const run = scene({ hp: 3, maxHp: 3, enemies: ['rat'], enemyHp: 999 });
  ready(run, 'attack');
  foe(run).dmgMul = 30; // a rat that hits for 15 hearts
  const res = play(run, line(run, ['vest', 'vest', 'vest']));
  assert.equal(res.strike.armor, 3, 'четыре половинки брони, влезло три — здоровья меньше потолка');
  assert.ok(res.strike.notes.some((n) => n.startsWith('Броня: не больше')));
  const blow = res.acts[0].hurt;
  assert.equal(blow.armor, 3);
  assert.equal(res.run.phase, 'dead', 'удар сильнее потолка ранит');
});

/** Armour a move of three upgraded vests leaves the hero (3 half-hearts × 2), under the cap. */
function hit4Armor(opts) {
  const run = scene({ enemyHp: 999, ...opts });
  return play(run, line(run, [{ card: 'vest', up: true }, { card: 'vest', up: true }, { card: 'vest', up: true }])).strike.armor;
}

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

test('a swapped rocket fires where it lands and pays only in the tiles it clears', () => {
  const run = combatRun({ enemies: ['anchor'] });
  run.combat.board.cells[idx(2, 1)] = { id: 5000, kind: 'blade', card: 'fist', special: 'rocketH' };
  const res = dispatch(run, { type: 'move', move: { from: idx(2, 1), to: idx(2, 2) } });
  const wave = res.events.find((e) => e.t === 'wave');
  const rocket = wave.blasts.find((b) => b.kind === 'rocketH');
  assert.equal(rocket.at, idx(2, 2));
  assert.deepEqual(rocket.cells, [12, 13, 14, 15, 16, 17]);
  assert.equal(strikeOf(res.events).tally.bonus, 0, 'no multiplier from blasts');
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

test('weapons: swapping costs energy in a fight, nothing between fights; three at most', () => {
  const run = scene({ weapons: ['knife', 'scissors'], charge: 2 });
  const swapped = dispatch(run, { type: 'weapon', id: 'scissors' });
  assert.deepEqual([swapped.run.hero.weapon, swapped.run.hero.charge], ['scissors', 0], '2 энергии');
  assert.ok(swapped.events.some((e) => e.t === 'weapon' && e.id === 'scissors'));
  assert.equal(swapped.run.combat.moves, 0, 'смена не тратит ход');
  const broke = dispatch(swapped.run, { type: 'weapon', id: 'knife' });
  assert.equal(broke.events.find((e) => e.t === 'invalid')?.reason, 'Нужно 2 энергии');
  const calm = { ...swapped.run, combat: null, phase: 'map' };
  assert.equal(dispatch(calm, { type: 'weapon', id: 'knife' }).run.hero.weapon, 'knife', 'вне боя — бесплатно');
  // Red tiles strike with the new weapon at once.
  const cut = scene({ weapons: ['knife', 'awl'], charge: 2, enemyHp: 999 });
  const awl = dispatch(cut, { type: 'weapon', id: 'awl' }).run;
  assert.equal(play(awl, line(awl, ['fist', 'fist', 'fist'])).strike.tally.dmg, 12, 'шило: 4 за фишку');
});

test('energy holds as much as the skill or a weapon swap needs', () => {
  assert.equal(energyCap(scene({})), 0, 'ни навыка, ни второго оружия — энергия не копится');
  assert.equal(energyCap(scene({ weapons: ['knife', 'scissors'] })), 2);
  assert.equal(energyCap(scene({ active: 'stapler', weapons: ['knife', 'scissors'] })), 6);
});

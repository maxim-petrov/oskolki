import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../game/run.ts';
import { combatRun, idx, setTile } from './helpers.mjs';
import { foe, line, play, ready, scene } from './scene.mjs';

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
  assert.equal(wave.scores.filter((s) => s.fam === 'blade').length, 3);
  assert.ok(wave.scores.every((s) => s.dmg === 2));
});

test('the held yellow item decides what gold tiles do: the bonus adds damage per tile', () => {
  const rows = ['sicbsi', 'ccbisb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'];
  const plain = combatRun({ rows });
  setTile(plain, idx(0, 2), 'coin');
  const s = strikeOf(dispatch(plain, DOWN).events);
  assert.deepEqual([s.tally.dmg, s.tally.coins], [0, 0], 'монетка: копит находки, монет за тройку нет');
  const bonus = combatRun({ rows });
  setTile(bonus, idx(0, 2), 'coin');
  bonus.hero.gear.coin.push('bonus');
  bonus.hero.equip.coin = 'bonus';
  const b = strikeOf(dispatch(bonus, DOWN).events);
  assert.deepEqual([b.tally.dmg, b.tally.coins], [9, 0], 'премия: +3 урона с фишки');
});

test('a blue group blocks half a heart and the armour is spent after the enemies act', () => {
  const run = combatRun({ rows: ['sicbsi', 'issbcb', 'sicbsi', 'cbsicb', 'sicbsi', 'cbsicb'], enemies: ['rat'] });
  // Drop a stamped shield from (0,3) into (1,3): s s s in row 1, a super block.
  run.combat.board.cells[idx(0, 3)] = { id: 9100, kind: 'shield', seal: true };
  run.combat.enemies[0].countdown = 1;
  const res = dispatch(run, { type: 'move', move: { from: idx(0, 3), to: idx(1, 3) } });
  const s = strikeOf(res.events);
  assert.equal(s.tally.dmg, 0);
  assert.equal(s.armor, 2, 'a group of three shields with the stamp: half a heart and its super half');
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
  const res = play(run, line(run, ['foldervest', 'foldervest', 'foldervest']));
  assert.equal(res.strike.armor, 3, 'четыре половинки брони, влезло три — здоровья меньше потолка');
  assert.ok(res.strike.notes.some((n) => n.startsWith('Броня: не больше')));
  const blow = res.acts[0].hurt;
  assert.equal(blow.armor, 3);
  assert.equal(res.run.phase, 'dead', 'удар сильнее потолка ранит');
});

/** Armour a move of three upgraded vests leaves the hero (3 half-hearts × 2), under the cap. */
function hit4Armor(opts) {
  const run = scene({ enemyHp: 999, ups: ['foldervest'], ...opts });
  return play(run, line(run, ['foldervest', 'foldervest', 'foldervest'])).strike.armor;
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
  for (const i of act.cells) assert.deepEqual([act.board[i].kind, act.board[i].tape], ['junk', true]);
  assert.ok(res.run.combat.board.source.some((t) => t.kind === 'junk' && t.tape));
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
  run.combat.board.cells[idx(2, 1)] = { id: 5000, kind: 'blade', special: 'rocketH' };
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

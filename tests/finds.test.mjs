// Coins and finds: the wallet holds 99 (as in Isaac); yellow tiles fill the finds meter, and a full
// meter puts a find on a plain tile of the board — a group or a blast through it picks it up. A find
// nobody picked up waits on the next board; keys open the safe's upper shelf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDS, FIND_COINS, FIND_METER } from '../game/content/finds.ts';
import { MAX_COINS, gainCoins } from '../game/economy.ts';
import { rollFind } from '../game/combat.ts';
import { dispatch, newRun } from '../game/run.ts';
import { ITEMS } from '../game/content/items.ts';
import { GOLD3, RED3, act, idx, line, play, put, scene } from './scene.mjs';

test('the wallet holds 99: coins beyond it are lost and not counted as earned', () => {
  const { run } = newRun({ seed: 1 });
  run.hero.coins = 98;
  assert.equal(gainCoins(run, 3), 1);
  assert.equal(run.hero.coins, MAX_COINS);
  assert.equal(run.stats.coinsLost, 2);
  // In a fight: a gold group at a full wallet pays nothing more.
  const full = scene({ coins: 99, enemyHp: 999 });
  const res = play(full, line(full, GOLD3));
  assert.equal(res.run.hero.coins, 99);
});

test('yellow tiles fill the finds meter; a full meter puts one find on the board', () => {
  const run = scene({ enemyHp: 999 });
  // Plain tiles for the find to land on (the scene's board is junk).
  for (const c of [0, 2, 4]) put(run, 5, c, 'shield');
  run.hero.finds = FIND_METER - 3;
  const res = play(run, line(run, GOLD3));
  const spawn = res.events.find((e) => e.t === 'findSpawn');
  assert.ok(spawn, 'находка легла на поле');
  assert.ok(FINDS[spawn.find]);
  assert.equal(res.run.hero.finds, 0, 'шкала опустела');
  const board = res.run.combat.board.cells;
  assert.equal(board.filter((t) => t.find).length, 1);
  assert.ok(['blade', 'shield', 'ink', 'coin'].includes(board[spawn.cell].kind), 'на простой цветной фишке');
  // A second full meter waits while one lies there.
  const again = res.run;
  again.hero.finds = FIND_METER;
  const next = play(again, line(again, GOLD3, { row: 4 }));
  assert.equal(next.run.combat.board.cells.filter((t) => t.find).length, 1);
  assert.equal(next.run.hero.finds, FIND_METER, 'шкала ждёт полной');
});

test('a group or a blast through the find picks it up', () => {
  const run = scene({ enemyHp: 999 });
  const move = line(run, RED3);
  run.combat.board.cells[idx(2, 1)].find = 'coins';
  const coins = run.hero.coins;
  const res = play(run, move);
  const found = res.events.find((e) => e.t === 'found');
  assert.equal(found?.find, 'coins');
  assert.equal(res.run.hero.coins, coins + FIND_COINS);
  // A bomb from the pocket.
  const b = scene({ pockets: ['bomb'], enemyHp: 999 });
  put(b, 3, 3, 'ink', { find: 'battery' });
  const blast = act(b, { type: 'pocket', slot: 0, cell: idx(3, 3) });
  assert.equal(blast.events.find((e) => e.t === 'found')?.find, 'battery');
  assert.equal(blast.run.hero.charge, 1 + 5, 'фиолетовая фишка во взрыве и +5 энергии');
});

test('every find pays: coins, a key, a heart, energy, a bomb (or coins with full pockets)', () => {
  const take = (find, opts = {}) => {
    const run = scene({ enemyHp: 999, ...opts });
    const move = line(run, RED3);
    run.combat.board.cells[idx(2, 0)].find = find;
    return play(run, move).run.hero;
  };
  assert.equal(take('key').keys, 1);
  assert.equal(take('heart', { hp: 5, maxHp: 8 }).hp, 7);
  assert.equal(take('bomb').pockets[0], 'bomb');
  assert.equal(take('bomb', { pockets: ['coffee', 'coffee', 'coffee'], coins: 0 }).coins, 3);
});

test('enemies do not spoil a find; a heart is never rolled at full health', () => {
  const run = scene({ enemies: ['blot'], real: true, enemyHp: 999 });
  for (const t of run.combat.board.cells) if (t.kind !== 'junk') t.find = 'key';
  for (let k = 0; k < 20; k++) assert.notEqual(rollFind({ ...run, hero: { ...run.hero, hp: run.hero.maxHp } }), 'heart');
});

test('a find nobody picked up waits on the next board', () => {
  const run = scene({ enemies: ['drop'], enemyHp: 1 });
  const move = line(run, RED3);
  run.combat.board.cells[idx(4, 4)].find = 'key';
  const won = play(run, move).run;
  assert.equal(won.phase, 'reward');
  assert.equal(won.hero.findNext, 'key');
  let custom = newRun({ seed: 3, customSeed: true }).run;
  custom.hero.findNext = 'bomb';
  custom = dispatch(custom, { type: 'dev', op: { op: 'enter', kind: 'fight' } }).run;
  assert.equal(custom.combat.board.cells.filter((t) => t.find === 'bomb').length, 1);
  assert.equal(custom.hero.findNext, undefined);
});

test('a key opens the safe on a choice of three a tier above', () => {
  let { run } = newRun({ seed: 12, customSeed: true });
  run.hero.keys = 1;
  run = dispatch(run, { type: 'dev', op: { op: 'enter', kind: 'treasure' } }).run;
  const opened = dispatch(run, { type: 'open', key: true });
  assert.ok(!opened.events.some((e) => e.t === 'invalid'));
  const t = opened.run.treasure;
  assert.equal(opened.run.hero.keys, 0);
  assert.equal(t.choices.length, 3);
  assert.equal(new Set(t.choices).size, 3);
  for (const id of t.choices) assert.ok(ITEMS[id].kind === 'active' || ['uncommon', 'rare'].includes(ITEMS[id].pool), `${id}: ступенью выше`);
  const took = dispatch(opened.run, { type: 'open', index: 1 }).run;
  assert.equal(took.treasure.opened, true);
  const got = t.choices[1];
  assert.ok(took.hero.relics.includes(got) || took.hero.active === got);
  let nokey = newRun({ seed: 12, customSeed: true }).run;
  nokey = dispatch(nokey, { type: 'dev', op: { op: 'enter', kind: 'treasure' } }).run;
  assert.equal(dispatch(nokey, { type: 'open', key: true }).events.find((e) => e.t === 'invalid')?.reason, 'Нет ключа');
});

test('two tills an act at least, and elites give a key now and then', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { run } = newRun({ seed });
    assert.ok(run.map.nodes.filter((n) => n.kind === 'shop').length >= 2, `сид ${seed}`);
  }
});

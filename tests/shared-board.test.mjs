import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDuel,
  dispatchDuel,
  loadDuel,
  saveDuel,
  manaCap,
  ensurePlayable,
  spellError,
  statPrice,
  trainingGold,
  fingerprint,
} from '../game/duel/engine.ts';
import {
  findMatches,
  legalSwaps,
  swapBoard,
  freshBoard,
  adjacent,
  blastCells,
} from '../game/duel/board.ts';
import {
  CLASSES,
  COLORS,
  FOES,
  ITEMS,
  KINDS,
  SPELLS,
} from '../game/duel/catalog.ts';
import { chooseAction } from '../game/duel/ai.ts';
const clone = (value) => structuredClone(value);
const start = (patch = {}) =>
  createDuel({ seed: 707, classId: 'blade', mode: 'duel', foe: 0, ...patch });
const step = (s, c) => {
  const r = dispatchDuel(s, c);
  assert.equal(r.error, undefined);
  return r.state;
};
const quiet = () =>
  Array.from({ length: 64 }, (_, i) => ({
    kind: KINDS[((i % 8) + Math.floor(i / 8) * 2) % 7],
  }));
function loaded(classId = 'blade') {
  const s = start({ classId });
  s.rng.effect = 0;
  s.hero.spells = Object.keys(SPELLS);
  s.hero.gear = {};
  s.hero.stats = {
    earth: 0,
    fire: 0,
    air: 0,
    water: 0,
    battle: 0,
    cunning: 0,
    morale: 0,
  };
  s.enemy.stats.morale = 0;
  s.enemy.hp = s.enemy.maxHp = 1000;
  for (const c of COLORS) s.hero.mana[c] = 20;
  return s;
}
function swapFixture(kind, length = 3) {
  for (let seed = 0; seed < 100; seed++) {
    const s = loaded();
    s.rng.board = seed;
    s.board = start({ seed }).board;
    for (let x = 0; x < length; x++) s.board[24 + x] = { kind };
    s.board[24 + Math.floor(length / 2)] = {
      kind: kind === 'earth' ? 'water' : 'earth',
    };
    s.board[32 + Math.floor(length / 2)] = { kind };
    const command = {
      type: 'swap',
      a: 24 + Math.floor(length / 2),
      b: 32 + Math.floor(length / 2),
    };
    const groups = findMatches(swapBoard(s.board, command));
    if (
      !findMatches(s.board).length &&
      groups.length === 1 &&
      groups[0].cells.length === length
    ) {
      const r = dispatchDuel(s, command);
      if (r.frames.length === 1) return { s, command, r };
    }
  }
  throw Error(`No fixture ${kind} ${length}`);
}
test('same seed yields the same board across builds; 200 initial boards have no matches and have a valid swap', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = start({ seed });
    assert.equal(s.board.length, 64);
    assert.equal(findMatches(s.board).length, 0);
    assert.ok(legalSwaps(s.board).length);
    if (seed < 10)
      for (const classId of Object.keys(CLASSES))
        assert.deepEqual(start({ seed, classId }).board, s.board);
  }
  assert.deepEqual(start(), start());
  assert.notDeepEqual(start().board, start({ seed: 708 }).board);
  assert.ok(legalSwaps(freshBoard(() => 0)).length);
});
test('adjacency rejects row wrapping, diagonal, fractions and out-of-range', () => {
  for (const [a, b] of [
    [7, 8],
    [0, 9],
    [-1, 0],
    [63, 64],
    [0, 1.5],
    [NaN, 1],
  ])
    assert.equal(adjacent(a, b), false);
  assert.ok(adjacent(0, 1));
  assert.ok(adjacent(7, 15));
});
test('invalid moves are immutable, cost no turn and consume no RNG', () => {
  const s = start(),
    before = clone(s);
  for (const c of [
    { type: 'swap', a: 7, b: 8 },
    { type: 'swap', a: 0, b: 1 },
    { type: 'cast', spell: 'bolt' },
    { type: 'cast', spell: '__proto__' },
    { type: 'buy', item: 'coat' },
  ]) {
    const r = dispatchDuel(s, c);
    assert.ok(r.error);
    assert.equal(r.state, s);
    assert.deepEqual(s, before);
  }
});
test('ordinary triples transfer initiative, do not harm/heal intrinsically, and fill only actor mana', () => {
  const { s, command } = swapFixture('water');
  s.hero.mana.water = 0;
  s.hero.hp = 30;
  const n = step(s, command);
  assert.equal(n.hero.mana.water, 3);
  assert.equal(n.hero.hp, 30);
  assert.equal(n.enemy.hp, 1000);
  assert.deepEqual(n.enemy.mana, s.enemy.mana);
  assert.equal(n.actor, 'enemy');
});
test('enemy collects into enemy mana from the same board and does not auto-attack', () => {
  const { s, command } = swapFixture('fire');
  s.actor = 'enemy';
  s.enemy.mana.fire = 0;
  const hp = s.hero.hp,
    heroMana = clone(s.hero.mana);
  const n = step(s, command);
  assert.equal(n.enemy.mana.fire, 3);
  assert.equal(n.hero.hp, hp);
  assert.deepEqual(n.hero.mana, heroMana);
  assert.equal(n.actor, 'hero');
});
test('four retains initiative; five also creates a wildcard; bonus turns do not accumulate as a queue', () => {
  for (const length of [4, 5]) {
    const { r } = swapFixture('earth', length);
    assert.equal(r.state.actor, 'hero');
    assert.equal(r.state.metrics.extra, 1);
    assert.equal(
      r.state.board.filter((t) => t.kind === 'wild').length,
      length === 5 ? 1 : 0,
    );
  }
});
test('L and T intersections merge and pay each cell once', () => {
  const b = quiet();
  for (const i of [18, 19, 20, 11, 27]) b[i] = { kind: 'fire' };
  const group = findMatches(b).find((g) => g.kind === 'fire');
  assert.ok(group);
  assert.equal(group.cells.length, 5);
  assert.equal(new Set(group.cells).size, 5);
  assert.equal(group.longest, 3);
});
test('separate triples do not become a four-match', () => {
  const b = quiet();
  for (const i of [0, 1, 2, 61, 62, 63]) b[i] = { kind: 'fire' };
  const groups = findMatches(b).filter((g) => g.kind === 'fire');
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.cells.length === 3));
});
test('wildcards match mana only, not skulls, gold, XP or a line of only wildcards', () => {
  for (const kind of ['skull', 'gold', 'xp', 'wild']) {
    const b = quiet();
    b[0] = { kind };
    b[1] = { kind: 'wild' };
    b[2] = { kind };
    b[3] = { kind: 'skull' };
    assert.ok(!findMatches(b).some((g) => g.cells.includes(1)));
  }
  const b = quiet();
  b[0] = { kind: 'water' };
  b[1] = { kind: 'wild' };
  b[2] = { kind: 'water' };
  assert.ok(
    findMatches(b).some((g) => g.kind === 'water' && g.cells.includes(1)),
  );
});
test('a mana wildcard multiplies its group, and caps mana', () => {
  const { s, command } = swapFixture('water');
  s.board[24] = { kind: 'wild' };
  s.hero.mana.water = 0;
  const n = step(s, command);
  assert.equal(n.hero.mana.water, 9);
  s.hero.mana.water = 19;
  assert.equal(step(s, command).hero.mana.water, 20);
});
test('cross-color wildcard belongs to one group, real colored tiles are not lost', () => {
  const s = loaded();
  s.board = quiet();
  for (const c of COLORS) s.hero.mana[c] = 0;
  for (const i of [18, 20]) s.board[i] = { kind: 'water' };
  for (const i of [11, 27]) s.board[i] = { kind: 'earth' };
  s.board[19] = { kind: 'wild' };
  // Forge resolves the constructed crossing; earth 4 and fire 4 are paid first.
  s.hero.mana.air = 10;
  s.hero.mana.fire = 10;
  s.hero.mana.earth = 4;
  const n = step(s, { type: 'cast', spell: 'forge', target: 63 });
  assert.deepEqual(n.hero.mana, { earth: 9, fire: 6, air: 10, water: 2 });
});
test('overlapping explosions chain, clip at edges and never repeat cells', () => {
  const b = quiet();
  b[0] = { kind: 'skull', power: 5 };
  b[9] = { kind: 'skull', power: 5 };
  const cells = blastCells(b, [0]);
  assert.equal(cells.size, 9);
  assert.deepEqual(
    [...cells].sort((a, b) => a - b),
    [0, 1, 2, 8, 9, 10, 16, 17, 18],
  );
});
test('explosive skull deals +5 and grants resources from blast neighbors only once', () => {
  const { s, command } = swapFixture('skull');
  s.board[24].power = 5;
  const n = step(s, command);
  assert.ok(n.enemy.hp <= 992);
  assert.ok(n.achievements.includes('blast'));
  assert.ok(n.metrics.damage >= 8);
});
test('skull attack includes battle and weapon, and stealth is consumed by one wave', () => {
  const { s, command } = swapFixture('skull');
  s.hero.stats.battle = 6;
  s.hero.gear.weapon = 'paperKnife';
  s.hero.stealthUntil = 4;
  const n = step(s, command);
  assert.equal(n.enemy.hp, 991);
  assert.equal(n.hero.stealthUntil, 0);
});
test('gold and XP belong to collector and do not damage the opponent', () => {
  for (const kind of ['gold', 'xp']) {
    const { s, command } = swapFixture(kind);
    const n = step(s, command);
    assert.equal(n.hero[kind], 3);
    assert.equal(n.enemy[kind], 0);
    assert.equal(n.enemy.hp, 1000);
  }
});
test('mana storm grants both sides mana within cap and preserves initiative', () => {
  const s = loaded();
  s.board = quiet();
  assert.equal(legalSwaps(s.board).length, 0);
  s.hero.mana.water = 19;
  s.actor = 'enemy';
  assert.equal(ensurePlayable(s), true);
  assert.equal(s.hero.mana.water, 20);
  assert.equal(s.enemy.mana.water, 3);
  assert.equal(s.actor, 'enemy');
  assert.equal(findMatches(s.board).length, 0);
  assert.ok(legalSwaps(s.board).length);
});
test('spell costs multiple colors and replaces the swap; cooldown counts own actions', () => {
  const s = loaded(),
    n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.mana.fire, 14);
  assert.equal(n.hero.mana.air, 17);
  assert.equal(n.enemy.hp, 990);
  assert.equal(n.actor, 'enemy');
  assert.equal(spellError(n, 'bolt', 'hero'), 'Восстановление: 1 действ.');
  n.actor = 'hero';
  const again = step(n, { type: 'cast', spell: 'wall' });
  assert.equal(spellError(again, 'bolt', 'hero'), null);
});
test('hostile spell resistance cancels effect but still spends resources and turn', () => {
  const s = loaded();
  s.enemy.gear.ring = 'ward';
  s.enemy.stats.morale = 25;
  s.rng.effect = 0;
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.enemy.hp, s.enemy.hp);
  assert.equal(n.hero.mana.fire, 14);
  assert.equal(n.actor, 'enemy');
  assert.match(n.log.join(' '), /отразил/);
});
test('invalid spell target does not consume cost/RNG', () => {
  const s = loaded();
  for (const target of [undefined, -1, 64, 1.5]) {
    const r = dispatchDuel(s, { type: 'cast', spell: 'slice', target });
    assert.ok(r.error);
    assert.equal(r.state, s);
  }
  const notSkull = s.board.findIndex((t) => t.kind !== 'skull');
  assert.ok(
    dispatchDuel(s, { type: 'cast', spell: 'bomb', target: notSkull }).error,
  );
});
test('heal, drain and elemental wall use their documented resources', () => {
  const s = loaded();
  s.hero.hp = 15;
  const healed = step(s, { type: 'cast', spell: 'mend' });
  assert.equal(healed.hero.hp, 26);
  for (const c of COLORS) s.enemy.mana[c] = 5;
  const drained = step(s, { type: 'cast', spell: 'drain' });
  for (const c of COLORS) assert.equal(drained.enemy.mana[c], 2);
  assert.equal(drained.enemy.hp, 994);
  s.enemy.wall = 3;
  for (const c of COLORS) s.enemy.mana[c] = 2;
  const protectedState = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(protectedState.enemy.hp, 998);
  assert.equal(
    Object.values(protectedState.enemy.mana).reduce((a, b) => a + b),
    0,
  );
  assert.equal(protectedState.enemy.wall, 2);
});
test('armor budget applies once per action, including multiple sources of damage', () => {
  const s = loaded('elementalist');
  s.hero.gear.weapon = 'tideNeedle';
  s.enemy.gear.armor = 'coat';
  s.board = quiet();
  s.board[24] = { kind: 'water' };
  s.board[25] = { kind: 'skull', power: 5 };
  s.board[26] = { kind: 'water' };
  const r = dispatchDuel(s, { type: 'cast', spell: 'slice', target: 25 });
  assert.equal(r.error, undefined);
  const unarmored = clone(s);
  unarmored.enemy.gear = {};
  const r2 = dispatchDuel(unarmored, {
    type: 'cast',
    spell: 'slice',
    target: 25,
  });
  assert.equal(r.state.enemy.hp - r2.state.enemy.hp, 2);
});
test('slice collects; erase removes without paying the erased skulls/resources', () => {
  const s = loaded();
  s.board = quiet();
  s.board[24] = { kind: 'skull' };
  s.board[25] = { kind: 'skull', power: 5 };
  s.board[26] = { kind: 'gold' };
  const collected = dispatchDuel(s, {
    type: 'cast',
    spell: 'slice',
    target: 25,
  });
  assert.ok(collected.state.enemy.hp < 1000);
  assert.ok(collected.frames[0].cells.length > 5);
  const erased = dispatchDuel(s, { type: 'cast', spell: 'erase', target: 25 });
  assert.equal(erased.frames[0].cells.length, 8);
  assert.equal(erased.frames[0].text, 'Строка удалена');
  // Any damage after removal must be from later matched cells, not the deleted bomb.
  assert.ok(erased.state.enemy.hp > collected.state.enemy.hp);
});
test('monk builds Ki, retains initiative, spends Ki and skips only one enemy opportunity', () => {
  const s = loaded('monk');
  const focus = step(s, { type: 'cast', spell: 'trance' });
  assert.equal(focus.hero.ki, 5);
  assert.equal(focus.actor, 'hero');
  const palm = step(focus, { type: 'cast', spell: 'palm' });
  assert.equal(palm.hero.ki, 0);
  assert.equal(palm.enemy.hp, 990);
  assert.equal(palm.actor, 'hero');
  assert.equal(palm.enemy.stunned, 0);
  assert.ok(palm.enemy.immune > 0);
  palm.hero.ki = 5;
  palm.hero.ready.palm = 0;
  const second = step(palm, { type: 'cast', spell: 'palm' });
  assert.equal(second.actor, 'enemy');
});
test('water triggers item damage, gold and one generated skull, using one common cascade resolver', () => {
  const { s, command } = swapFixture('water');
  s.hero.gear = { weapon: 'tideNeedle', charm: 'tidePurse', ring: 'mint' };
  const n = step(s, command);
  assert.ok(n.enemy.hp <= 998);
  assert.ok(n.hero.gold >= 2);
  assert.match(n.log.join(' '), /вода → 2 золота/);
  assert.match(n.log.join(' '), /золото → череп/);
  assert.ok(n.achievements.includes('synergy'));
});
test('full blade uses each full mana pool, including mana gained in this wave', () => {
  const { s, command } = swapFixture('skull');
  s.hero.gear.weapon = 'fullBlade';
  const n = step(s, command);
  assert.equal(n.enemy.hp, 981);
});
test('lethal action ends the battle before any enemy action or further cascade', () => {
  const { s, command } = swapFixture('skull');
  s.enemy.hp = 1;
  const n = step(s, command);
  assert.equal(n.phase, 'won');
  assert.equal(n.enemy.hp, 0);
  assert.equal(n.hero.hp, s.hero.hp);
  assert.equal(chooseAction(n), null);
  assert.ok(dispatchDuel(n, command).error);
});
test('route rewards are seeded, replace slots, and cannot be claimed twice', () => {
  const { s, command } = swapFixture('skull');
  s.config.mode = 'route';
  s.enemy.hp = 1;
  s.hero.hp = 30;
  s.hero.xp = 17;
  const n = step(s, command);
  assert.equal(n.phase, 'camp');
  assert.equal(n.hero.level, 2);
  assert.equal(n.hero.points, 4);
  assert.equal(n.hero.hp, 45);
  assert.equal(n.offers.length, 3);
  assert.equal(new Set([...n.offers, ...n.stock]).size, 6);
  assert.ok(dispatchDuel(n, { type: 'next' }).error);
  const item = n.offers[0],
    taken = step(n, { type: 'reward', item });
  assert.equal(taken.hero.gear[ITEMS[item].slot], item);
  assert.ok(dispatchDuel(taken, { type: 'reward', item }).error);
  const next = step(taken, { type: 'next' });
  assert.equal(next.phase, 'battle');
  assert.equal(next.room, 1);
  assert.equal(next.actor, 'hero');
  assert.equal(next.enemy.hp, FOES[1].hp);
  assert.equal(next.hero.hp, taken.hero.hp);
});
test('class prices, diminishing training, gold purchase and stat caps are enforced', () => {
  const s = start({ mode: 'route' });
  s.phase = 'camp';
  s.hero.points = 100;
  s.hero.gold = 100;
  assert.equal(statPrice(s, 'battle'), 1);
  assert.equal(statPrice(s, 'water'), 2);
  s.hero.stats.battle = 10;
  assert.equal(statPrice(s, 'battle'), 2);
  const price = trainingGold(s, 'morale'),
    oldHp = s.hero.hp;
  const n = step(s, { type: 'train', stat: 'morale', gold: true });
  assert.equal(n.hero.gold, 100 - price);
  assert.equal(n.hero.hp, oldHp + 3);
  n.hero.stats.morale = 30;
  assert.ok(dispatchDuel(n, { type: 'train', stat: 'morale' }).error);
  s.stock = ['coat'];
  const bought = step(s, { type: 'buy', item: 'coat' });
  assert.equal(bought.hero.gold, 100 - ITEMS.coat.price);
  assert.equal(bought.hero.gear.armor, 'coat');
  assert.equal(bought.stock.length, 0);
  assert.ok(dispatchDuel(bought, { type: 'buy', item: 'coat' }).error);
});
test('AI makes identical decisions when only hidden future RNG differs', () => {
  for (let seed = 0; seed < 25; seed++) {
    const s = start({ seed, foe: 4 });
    s.actor = 'enemy';
    for (const c of COLORS) s.enemy.mana[c] = 20;
    const other = clone(s);
    other.rng = { board: 123, effect: 456, loot: 789 };
    assert.deepEqual(chooseAction(s), chooseAction(other));
    assert.equal(dispatchDuel(s, chooseAction(s)).error, undefined);
  }
});
test('save replays exactly, including resumed enemy turn; rejects corrupt and legacy data', () => {
  let s = start();
  for (let i = 0; i < 25 && s.phase === 'battle'; i++)
    s = step(s, chooseAction(s));
  const saved = saveDuel(s);
  assert.deepEqual(loadDuel(saved), s);
  assert.equal(fingerprint(loadDuel(saved)), fingerprint(s));
  const tampered = JSON.parse(saved);
  tampered.fingerprint = 'bad';
  assert.equal(loadDuel(JSON.stringify(tampered)), null);
  tampered.commands.push({ type: 'swap', a: 0, b: 63 });
  assert.equal(loadDuel(JSON.stringify(tampered)), null);
  for (const raw of [
    '{}',
    'null',
    '[1]',
    'oops',
    JSON.stringify({ schema: 'old' }),
  ])
    assert.equal(loadDuel(raw), null);
});
test('200 shared-engine bot duels finish, maintain resource invariants and produce reproducible complete records', () => {
  let wins = 0,
    losses = 0;
  for (const classId of Object.keys(CLASSES))
    for (let seed = 0; seed < 50; seed++) {
      let s = start({ seed, classId, foe: seed % 5 });
      for (let i = 0; i < 500 && s.phase === 'battle'; i++) {
        const before = JSON.stringify(s);
        const cmd = chooseAction(s);
        assert.ok(cmd);
        const n = step(s, cmd);
        assert.equal(JSON.stringify(s), before);
        s = n;
        for (const f of [s.hero, s.enemy]) {
          assert.ok(f.hp >= 0 && f.hp <= f.maxHp);
          for (const c of COLORS)
            assert.ok(f.mana[c] >= 0 && f.mana[c] <= manaCap(f, c));
        }
        if (s.phase === 'battle') {
          assert.equal(findMatches(s.board).length, 0);
          assert.ok(legalSwaps(s.board).length);
        }
      }
      assert.ok(
        ['won', 'lost'].includes(s.phase),
        `${classId}/${seed} did not finish`,
      );
      if (s.phase === 'won') wins++;
      else losses++;
      if (seed === 0) assert.deepEqual(loadDuel(saveDuel(s)), s);
    }
  assert.ok(wins > 0);
  assert.ok(losses > 0);
});
test('full routes use the same actions through rewards, training, shops and final boss', () => {
  let completed = 0;
  for (let seed = 0; seed < 8; seed++) {
    let s = start({ seed, classId: 'elementalist', mode: 'route' });
    for (let i = 0; i < 1000 && !['won', 'lost'].includes(s.phase); i++) {
      if (s.phase === 'battle') s = step(s, chooseAction(s));
      else if (!s.rewarded) s = step(s, { type: 'reward', item: null });
      else if (s.hero.points >= statPrice(s, 'water'))
        s = step(s, { type: 'train', stat: 'water' });
      else s = step(s, { type: 'next' });
    }
    assert.ok(['won', 'lost'].includes(s.phase));
    if (s.phase === 'won') {
      completed++;
      assert.equal(s.room, 4);
      assert.ok(s.achievements.includes('route'));
    }
    if (seed === 0) assert.deepEqual(loadDuel(saveDuel(s)), s);
  }
  assert.ok(
    completed > 0,
    'At least one baseline route must reach and defeat the final boss',
  );
});

test('Lucky Match has a separate wildcard roll; both outcomes keep the same actor', () => {
  for (const [effectSeed, wildcard] of [
    [1972, true],
    [1976, false],
  ]) {
    const { s, command } = swapFixture('gold');
    s.rng.effect = effectSeed;
    const n = step(s, command);
    assert.match(n.log.join(' '), /удачное совпадение/);
    assert.equal(n.actor, 'hero');
    assert.equal(
      n.log.some((line) => line.includes('удача создала джокер')),
      wildcard,
    );
  }
});
test('optimized legal moves equal a full visible-board scan, including wildcards', () => {
  for (let seed = 0; seed < 30; seed++) {
    const board = start({ seed }).board;
    if (seed % 2) board[seed] = { kind: 'wild' };
    const expected = [];
    for (let a = 0; a < 64; a++)
      for (const b of [a + 1, a + 8]) {
        if (
          !adjacent(a, b) ||
          (board[a].kind === board[b].kind && board[a].power === board[b].power)
        )
          continue;
        if (
          findMatches(swapBoard(board, { a, b })).some(
            (m) => m.cells.includes(a) || m.cells.includes(b),
          )
        )
          expected.push({ a, b });
      }
    assert.deepEqual(legalSwaps(board), expected);
  }
});
test('start configuration rejects malformed seeds, prototype keys and impossible opponents', () => {
  for (const patch of [
    { seed: NaN },
    { seed: -1 },
    { seed: 0x100000000 },
    { seed: 1.5 },
    { classId: '__proto__' },
    { foe: 5 },
    { foe: -1 },
    { mode: 'old' },
  ])
    assert.throws(() => start(patch));
});

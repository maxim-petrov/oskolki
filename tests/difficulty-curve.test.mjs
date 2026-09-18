import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as g from '../game/engine.ts';
import { finish } from './helpers/stage2-fixtures.mjs';
const take = (r) => {
  assert.equal(r.error, undefined);
  assert.ok(g.isSave(r.state));
  return r.state;
};
function at(depth, seed = 42, elite = false, rules = 7) {
  let s = g.startRun(seed, g.DEFAULT_BALANCE, rules);
  while (s.room < depth) {
    s = finish(s);
    const rooms = g.nextRooms(s);
    const next =
      rooms.find((r) => r.kind === (elite ? 'elite' : 'battle')) ?? rooms[0];
    s = take(g.enterRoom(s, next.id));
  }
  return s;
}
test('rules-6 starts, second rooms, responses and RNG stay byte identical', () => {
  const fixtures = JSON.parse(
    readFileSync(new URL('./fixtures/rules6-opening.json', import.meta.url)),
  );
  for (const f of fixtures) {
    const s = g.startRun(f.seed, g.DEFAULT_BALANCE, 6);
    assert.deepEqual(g.loadSave(s), s);
    const entered = g.enterRoom({ ...s, phase: 'map' }, '2-0');
    const r1 =
      entered.state.phase === 'battle' ? g.endTurn(entered.state) : entered;
    const r2 = r1.state.phase === 'battle' ? g.endTurn(r1.state) : r1;
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify([s, entered, r1, r2]))
        .digest('hex'),
      f.sha256,
    );
  }
});
test('64 seeded openings stage single enemies, a find, optional pairs, then support and large squads', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 64; seed++) {
    const s = g.startRun(seed);
    assert.equal(s.rulesVersion, 7);
    assert.deepEqual(g.loadSave(s), s);
    assert.deepEqual(g.startRun(seed), s);
    for (const n of s.journey.nodes) {
      if (n.depth === 2 && n.kind === 'battle') {
        assert.equal(n.roster.length, 1);
        assert.ok(['paper-rat', 'stapler', 'moth'].includes(n.roster[0]));
      }
      if (n.depth === 3) {
        assert.equal(n.kind, 'treasure');
        assert.deepEqual(n.next, ['4-0', '4-1']);
      }
      if (n.depth === 4) {
        assert.ok(!n.concealed, 'risk visible before committing');
        assert.equal(n.roster.length, 2);
        assert.ok(!n.roster.some((k) => ['bell', 'candle'].includes(k)));
      }
      if (n.depth === 6 && n.kind === 'battle') {
        assert.equal(n.roster.length, 2);
        n.roster.forEach((k) => seen.add(k));
      }
      if (n.depth === 8)
        assert.equal(n.roster.length, n.kind === 'elite' ? 4 : 3);
      if (n.depth > 10 && n.roster)
        assert.ok(n.kind === 'boss' || n.roster.length >= 2);
    }
    // After either treasure the safe and elite routes are both available.
    const room3 = at(3, seed);
    const map = finish(room3);
    assert.deepEqual(
      g
        .nextRooms(map)
        .map((r) => r.kind)
        .sort(),
      ['battle', 'elite'],
    );
    assert.deepEqual(g.loadSave(map), map);
  }
  assert.ok(
    seen.has('bell') && seen.has('candle'),
    'support and summoning still enter after shop',
  );
});
test('opening intentions are reduced, real damage matches preview, late threats and pressure stay intact', () => {
  for (const room of [1, 2, 4, 6, 8, 10, 11, 20]) {
    const s = at(room);
    // Controlled identical enemy isolates curve from roster and board differences.
    s.phase = 'battle';
    s.enemies = [
      {
        ...s.enemies[0],
        id: 999,
        kind: 'raider',
        name: 'Test',
        hp: 100,
        maxHp: 100,
        damage: 8,
        block: 0,
        poison: 0,
      },
    ];
    s.target = 999;
    s.block = 0;
    s.hp = s.maxHp = 300;
    delete s.tide; // End-turn check below only covers the cellar.
    const legacy = { ...g.copy(s), rulesVersion: 6 };
    const before = g.intent(legacy, legacy.enemies[0]);
    const after = g.intent(s, s.enemies[0]);
    assert.equal(after.value, room <= 2 ? 6 : room === 4 ? 7 : 8);
    if (room >= 8) assert.deepEqual(after, before);
    const hard = { ...s, difficulty: 1 };
    assert.equal(g.intent(hard, hard.enemies[0]).value, after.value + 2);
    if (room < 8) {
      assert.equal(g.endTurn(s).state.hp, s.hp - after.value);
      assert.deepEqual(g.endTurn(s), g.endTurn(JSON.parse(JSON.stringify(s))));
    }
  }
  const ignored = g.startRun(42);
  let s = ignored;
  while (s.phase === 'battle') s = take(g.endTurn(s));
  assert.equal(
    s.phase,
    'defeat',
    'opening still punishes repeatedly ignoring all actions',
  );
});
test('early health grows gently, bosses keep original health, both new route lanes save through two biomes', () => {
  for (const elite of [false, true]) {
    let s = g.startRun(42);
    while (s.room < 20) {
      s = finish(s);
      const rooms = g.nextRooms(s);
      const choice =
        rooms.find((r) => r.kind === (elite ? 'elite' : 'battle')) ?? rooms[0];
      s = take(g.enterRoom(s, choice.id));
      assert.deepEqual(g.loadSave(s), s);
      if (s.phase === 'battle') {
        const scale =
          s.roomKind === 'boss'
            ? 0
            : s.room < 8
              ? Math.max(0, s.room - 2)
              : Math.floor(s.room / 3) * 3;
        for (const e of s.enemies)
          assert.equal(e.maxHp, g.ENEMY_CATALOG[e.kind].hp + scale);
      }
    }
    s = finish(s);
    assert.equal(s.phase, 'victory');
    assert.ok(g.isSave(s));
    assert.ok(g.isMeta(g.updateMeta(g.EMPTY_META, s)));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage1-engine.mjs';
const save = (s) => g.loadSave(JSON.parse(JSON.stringify(s)));
const enter = (depth = 11, id = g.roomsAtDepth(depth)[0].id, seed = 42) => {
  const s = g.startRun(seed);
  s.phase = 'map';
  s.room = depth - 1;
  s.path = Array.from(
    { length: depth - 1 },
    (_, i) => g.roomsAtDepth(i + 1)[0].name,
  );
  const r = g.enterRoom(s, id);
  assert.ok(!r.error);
  return r.state;
};
const enemyFixture = (kind, round = 1) => {
  const s = enter();
  const d = g.ENEMY_CATALOG[kind];
  s.round = round;
  s.roomKind = kind === 'tide-keeper' ? 'boss' : 'battle';
  s.enemies = [
    { ...d, kind, id: 1, hp: d.hp - 8, maxHp: d.hp, block: 0, poison: 0 },
  ];
  s.target = 1;
  s.block = 2;
  s.focus = 3;
  s.tide.cleared = true;
  return s;
};
const apply = (s, m) => g.move(s, m.axis, m.line, m.amount);
function matchFixture(families) {
  for (let seed = 1; seed <= 200; seed++) {
    const s = enter(11, '11-battle', seed);
    s.enemies[0].hp = s.enemies[0].maxHp = 10000;
    for (const m of g.validMoves(s.board)) {
      const shifted = g.shifted(s.board, m.axis, m.line, m.amount);
      const groups = g.groups(shifted);
      const found = [
        ...new Set(groups.map((xs) => shifted[xs[0]].family)),
      ].sort((a, b) => a.localeCompare(b));
      if (
        JSON.stringify(found) ===
        JSON.stringify([...families].sort((a, b) => a.localeCompare(b)))
      )
        return { s, m, shifted, groups };
    }
  }
  throw Error('Matching fixture not found');
}

test('second biome has ten legal depths, all six new enemies, returning enemies and its own final boss', () => {
  const seen = new Set();
  for (let depth = 11; depth <= 20; depth++) {
    for (const room of g.roomsAtDepth(depth)) {
      const s = enter(depth, room.id);
      assert.equal(g.biomeAt(s.room).id, 'archive');
      assert.equal(s.path.length, depth);
      assert.ok(g.isSave(s));
      if (s.phase === 'battle') {
        assert.equal(s.tide.turns, 3);
        assert.ok(
          g
            .validMoves(s.board)
            .some((m) => m.cells.some((i) => Math.floor(i / 6) === s.tide.row)),
        );
        for (const e of s.enemies) {
          seen.add(e.kind);
          assert.ok(room.description.includes(e.name));
        }
      } else assert.equal(s.tide, undefined);
    }
  }
  assert.equal(g.ARCHIVE_ENEMY_KINDS.length, 6);
  g.ARCHIVE_ENEMY_KINDS.forEach((kind) => assert.ok(seen.has(kind)));
  assert.ok(g.NEW_ENEMY_KINDS.some((kind) => seen.has(kind)));
  assert.equal(enter(20).enemies[0].kind, 'tide-keeper');
  assert.deepEqual(g.nextRooms(enter(20)), []);
  assert.ok(g.enterRoom({ ...g.startRun(), phase: 'map' }, '11-battle').error);
});

test('Censor grants a single recovery and reward, carries the build onward, and does not record a win', () => {
  const s = enter(10);
  s.hp = 3;
  s.potions = 0;
  s.heroPoison = 2;
  s.energy = 12;
  s.equipment.weapon = 'gear-rune-sword';
  s.equipment.clothing = 'gear-jacket';
  s.relics = ['thorns', 'coil'];
  s.modifiers = ['bomb'];
  s.upgrades.blade = 2;
  s.enemies[0].hp = 1;
  const before = JSON.stringify(s),
    reward = g.castSkill(s, 'bolt').state;
  assert.equal(JSON.stringify(s), before);
  assert.equal(reward.phase, 'reward');
  assert.equal(reward.hp, 23);
  assert.equal(reward.potions, 1);
  assert.equal(reward.heroPoison, 0);
  assert.equal(reward.gold, s.gold + 40);
  assert.equal(g.updateMeta(g.EMPTY_META, reward).wins, 0);
  assert.equal(g.endTurn(reward).state, reward);
  const map = g.chooseReward(save(reward), null).state;
  const archive = g.enterRoom(map, '11-battle').state;
  for (const key of [
    'equipment',
    'relics',
    'modifiers',
    'upgrades',
    'seed',
    'hp',
    'potions',
  ])
    assert.deepEqual(archive[key], reward[key]);
  assert.equal(archive.energy, 3);
  assert.ok(g.enterRoom(archive, '11-battle').error);
  assert.ok(g.chooseReward(map, null).error);
});

test('completed old cellar saves stay completed and ongoing old saves retain their exact RNG', () => {
  const old = g.startRun(0);
  old.room = 10;
  old.phase = 'victory';
  const loaded = save(old);
  assert.deepEqual(loaded, old);
  assert.ok(g.enterRoom(loaded, '11-battle').error);
  assert.deepEqual(save(g.startRun(123)), g.startRun(123));
});

test('tides warn for three answers, consume block before enemies, and renew only after the cycle', () => {
  const s = enter();
  s.balance.enemyPower = 0;
  const original = JSON.stringify(s),
    row = s.tide.row;
  const one = g.endTurn(s).state;
  assert.equal(one.hp, s.hp);
  assert.equal(one.tide.turns, 2);
  const two = g.endTurn(one).state;
  assert.equal(two.hp, s.hp);
  assert.equal(two.tide.turns, 1);
  two.block = 2;
  const r = g.endTurn(two);
  assert.equal(r.state.hp, s.hp - 2);
  assert.equal(r.state.stats.blocked, 2);
  assert.equal(r.frames[0].label, 'Прилив');
  assert.deepEqual(
    r.frames[0].cells,
    Array.from({ length: 6 }, (_, i) => row * 6 + i),
  );
  assert.equal(r.state.tide.turns, 3);
  assert.equal(r.state.tide.cleared, false);
  assert.ok(
    g
      .validMoves(r.state.board)
      .some((m) => m.cells.some((i) => Math.floor(i / 6) === r.state.tide.row)),
  );
  assert.deepEqual(g.endTurn(save(two)).state, r.state);
  assert.equal(JSON.stringify(s), original);
});

test('a row match cancels the whole tide cycle; invalid shifts cannot cancel or consume RNG', () => {
  const s = enter();
  s.enemies[0].hp = s.enemies[0].maxHp = 10000;
  s.balance.enemyPower = 0;
  assert.equal(g.move(s, 'row', 0, 0).state, s);
  const m = g
    .validMoves(s.board)
    .find((m) => m.cells.some((i) => Math.floor(i / 6) === s.tide.row));
  const r = apply(s, m).state;
  assert.equal(r.tide.cleared, true);
  let next = r;
  for (let i = 0; i < 3; i++) next = g.endTurn(next).state;
  assert.equal(next.hp, r.hp);
  assert.equal(next.tide.cleared, false);
  assert.equal(next.tide.turns, 3);
});

test('board spells can open the drain, and a lethal tide stops enemies and saves a clean defeat', () => {
  const s = enter();
  s.skills = ['reshape'];
  s.focus = 6;
  s.enemies[0].hp = s.enemies[0].maxHp = 10000;
  const changed = g.castSkill(s, 'reshape', s.tide.row * 6).state;
  assert.equal(changed.tide.cleared, true);
  s.hp = 1;
  s.block = 0;
  s.tide.turns = 1;
  const r = g.endTurn(s);
  assert.equal(r.state.phase, 'defeat');
  assert.equal(r.state.hp, 0);
  assert.equal(r.state.tide, undefined);
  assert.equal(r.frames.length, 1);
  assert.deepEqual(save(r.state), r.state);
  assert.equal(g.endTurn(r.state).state, r.state);
});

test('collected ink hurts once per unique tile through block, with visible combat frame', () => {
  const { s, m, shifted, groups } = matchFixture(['blade']);
  const ids = [...new Set(groups.flat())].slice(0, 3).map((i) => shifted[i].id);
  s.board.forEach((t) => {
    if (ids.includes(t.id)) t.ink = true;
  });
  s.block = 50;
  const r = apply(s, m);
  assert.equal(r.state.hp, s.hp - 3);
  assert.equal(r.frames[0].state.hp, s.hp - 3);
  assert.ok(r.state.log.some((x) => x.includes('кляксы')));
  assert.deepEqual(apply(save(s), m).state, r.state);
});

test('focus cleans all ink before any simultaneous blade group can hurt, even at one HP', () => {
  for (const families of [['focus'], ['blade', 'focus']]) {
    const { s, m, shifted, groups } = matchFixture(families);
    const ids = [...new Set(groups.flat())]
      .slice(0, 6)
      .map((i) => shifted[i].id);
    s.board.forEach((t) => {
      if (ids.includes(t.id)) t.ink = true;
    });
    s.hp = 1;
    const r = apply(s, m).state;
    assert.equal(r.hp, 1);
    assert.ok(!r.board.some((t) => t.ink));
    assert.equal(r.phase, 'battle');
  }
});

test('bomb collateral safely destroys ink; lethal collected ink cannot be rescued by later cascades', () => {
  const { s, m, shifted, groups } = matchFixture(['blade']);
  const matched = new Set(groups.flat());
  let found;
  for (const i of matched)
    for (const j of [i - 6, i + 6])
      if (j >= 0 && j < 36 && !matched.has(j)) found = [i, j];
  assert.ok(found);
  const [i, j] = found;
  s.board.find((t) => t.id === shifted[i].id).variant = 'bomb';
  s.board.find((t) => t.id === shifted[j].id).ink = true;
  assert.equal(apply(s, m).state.hp, s.hp);
  const lethal = matchFixture(['blade']);
  lethal.s.hp = 1;
  lethal.s.board.find(
    (t) => t.id === lethal.shifted[lethal.groups[0][0]].id,
  ).ink = true;
  const r = apply(lethal.s, lethal.m).state;
  assert.equal(r.phase, 'defeat');
  assert.equal(r.hp, 0);
  assert.ok(g.isSave(r));
});

test('archive enemy intentions match actual attack, ink, siphon, block and healing outcomes', () => {
  for (const kind of [...g.ARCHIVE_ENEMY_KINDS, 'tide-keeper'])
    for (const round of [1, 2, 3, 4, 5, 6]) {
      const s = enemyFixture(kind, round),
        e = s.enemies[0],
        a = g.intent(s, e),
        r = g.endTurn(s);
      const expected =
        a.type === 'attack'
          ? Math.max(0, a.value - s.block)
          : a.type === 'pierce'
            ? a.value
            : 0;
      assert.equal(r.state.hp, s.hp - expected, `${kind}/${round}`);
      assert.equal(
        r.state.focus,
        s.focus - (a.type === 'siphon' ? a.value : 0),
      );
      assert.equal(
        r.state.enemies[0].hp,
        Math.min(
          e.maxHp,
          e.hp + (['siphon', 'heal'].includes(a.type) ? a.value : 0),
        ),
      );
      assert.equal(r.state.enemies[0].block, a.type === 'block' ? a.value : 0);
      assert.equal(
        r.state.board.filter((t) => t.ink).length,
        a.type === 'ink' ? a.value : 0,
      );
      if (['ink', 'siphon'].includes(a.type))
        assert.equal(r.frames[0].cue.type, 'cast');
      assert.deepEqual(g.endTurn(save(s)), r);
    }
});

test('ink is capped at six, focus cannot go negative, and poison kills prevent special actions', () => {
  let s = enemyFixture('ink-scribe');
  s.board.slice(0, 5).forEach((t) => (t.ink = true));
  assert.equal(g.intent(s, s.enemies[0]).value, 1);
  const r = g.endTurn(s).state;
  assert.equal(r.board.filter((t) => t.ink).length, 6);
  r.round = 3;
  assert.equal(g.intent(r, r.enemies[0]).value, 0);
  s = enemyFixture('leech');
  s.focus = 0;
  assert.equal(g.endTurn(s).state.enemies[0].hp, s.enemies[0].hp);
  for (const kind of ['leech', 'ink-scribe']) {
    s = enemyFixture(kind);
    s.enemies[0].hp = 1;
    s.enemies[0].poison = 1;
    const r = g.endTurn(s).state;
    assert.equal(r.phase, 'reward');
    assert.equal(r.focus, s.focus);
    assert.equal(r.tide, undefined);
    assert.ok(!r.board.some((t) => t.ink));
  }
});

test('pump purchase is atomic, persists across rooms and reduces both boss-phase tides', () => {
  const s = enter(17);
  s.gold = 29;
  assert.equal(g.eventChoice(s, 'repair').state, s);
  assert.equal(g.eventChoice(s, 'relic').state, s);
  s.gold = 30;
  const r = g.eventChoice(s, 'repair').state;
  assert.equal(r.gold, 0);
  assert.equal(r.phase, 'map');
  assert.ok(r.flags.includes('run:sluice'));
  assert.equal(g.eventChoice(r, 'repair').state, r);
  const battle = g.enterRoom(save(r), '18-battle').state;
  assert.equal(g.tideDamage(battle), 2);
  const boss = enter(20);
  boss.flags.push('run:sluice');
  assert.equal(g.tideDamage(boss), 2);
  boss.enemies[0].hp = 54;
  assert.equal(g.tideDamage(boss), 4);
  assert.equal(g.eventChoice({ ...s, room: 13 }, 'repair').state.room, 13);
});

test('keeper changes at half HP, predicts poison threshold, and only its defeat wins the full run once', () => {
  const s = enter(20);
  s.round = 2;
  assert.equal(g.bossPhase(s.enemies[0]), 1);
  assert.equal(g.tideDamage(s), 4);
  s.enemies[0].hp = 55;
  s.enemies[0].poison = 1;
  assert.equal(g.intent(s, s.enemies[0]).value, 16);
  const phase2 = g.endTurn(s).state;
  assert.equal(g.bossPhase(phase2.enemies[0]), 2);
  assert.equal(g.tideDamage(phase2), 6);
  assert.equal(g.intent(phase2, phase2.enemies[0]).value, 16);
  phase2.enemies[0].hp = 1;
  phase2.energy = 12;
  const won = g.castSkill(phase2, 'bolt').state;
  assert.equal(won.phase, 'victory');
  assert.equal(won.room, 20);
  assert.equal(won.tide, undefined);
  assert.equal(g.chooseReward(won, null).state, won);
  const meta = g.updateMeta(g.EMPTY_META, won);
  assert.equal(meta.wins, 1);
  assert.deepEqual(g.updateMeta(meta, save(won)), meta);
});

test('archive saves reject malformed threats and preserve shop, trial, map and combat state', () => {
  const s = enter();
  for (const tide of [
    null,
    {},
    { row: -1, turns: 3, cleared: false },
    { row: 6, turns: 3, cleared: false },
    { row: 0, turns: 0, cleared: false },
    { row: 0, turns: 4, cleared: false },
    { row: 0, turns: 3, cleared: 'yes' },
  ])
    assert.equal(g.loadSave({ ...s, tide }), null);
  assert.equal(g.loadSave({ ...s, tide: undefined }), null);
  const ink = structuredClone(s);
  ink.board[0].ink = 'yes';
  assert.equal(g.loadSave(ink), null);
  ink.board.slice(0, 7).forEach((t) => (t.ink = true));
  assert.equal(g.loadSave(ink), null);
  for (const state of [s, enter(15), enter(17, '17-trial'), enter(19)])
    assert.deepEqual(save(state), state);
  const store = enter(15);
  assert.equal(store.offers.filter((o) => o.discount).length, 2);
  assert.deepEqual(save(store).offers, store.offers);
  const trial = enter(17, '17-trial');
  assert.equal(trial.tide, undefined);
  const failure = g.tickTrial(g.pauseTrial(trial, false).state, 46).state;
  assert.equal(failure.phase, 'map');
  assert.equal(failure.room, 17);
  assert.ok(failure.hp > 0);
});

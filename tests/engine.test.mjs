import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
function moveOf(s, family) {
  for (const m of g.validMoves(s.board)) {
    const b = g.shifted(s.board, m.axis, m.line, m.amount),
      groups = g.groups(b);
    if (
      groups.length === 1 &&
      groups[0].length === 3 &&
      b[groups[0][0]].family === family
    )
      return m;
  }
}
function findState(family) {
  for (let seed = 1; seed < 1000; seed++) {
    const s = g.startRun(seed),
      m = moveOf(s, family);
    if (m) return { s, m };
  }
  throw Error('fixture not found');
}
const applyMove = (s, m) => g.move(s, m.axis, m.line, m.amount);
const allMeta = { ...g.EMPTY_META, unlocked: g.ACHIEVEMENTS.map((x) => x.id) };
test('boards are deterministic, stable and playable across 100 seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const a = g.startRun(seed),
      b = g.startRun(seed);
    assert.deepEqual(a, b);
    assert.equal(a.board.length, 36);
    assert.equal(g.groups(a.board).length, 0);
    assert.ok(g.validMoves(a.board).length >= 3);
    assert.equal(a.target, a.enemies[0].id);
  }
});
test('cyclic shifts wrap without changing the tile multiset', () => {
  const s = g.startRun();
  const shifted = g.shifted(s.board, 'row', 2, 2);
  assert.equal(shifted[12].id, s.board[16].id);
  assert.deepEqual(
    shifted.map((x) => x.id).sort((a, b) => a - b),
    s.board.map((x) => x.id).sort((a, b) => a - b),
  );
  assert.deepEqual(g.shifted(shifted, 'row', 2, -2), s.board);
});
test('invalid moves cost no turn and preserve RNG', () => {
  const s = g.startRun();
  let found = false;
  for (let row = 0; row < 6; row++) {
    const r = g.move(s, 'row', row, 1);
    if (r.error) {
      found = true;
      assert.equal(r.state, s);
      assert.equal(r.frames.length, 0);
    }
  }
  assert.ok(found);
});
test('a successful move locks only the manual shift and leaves a stable board', () => {
  const s = g.startRun(),
    m = g.validMoves(s.board)[0],
    r = applyMove(s, m);
  assert.ok(r.frames.length);
  assert.ok(r.state.moved);
  assert.equal(g.groups(r.state.board).length, 0);
  assert.equal(applyMove(r.state, m).state, r.state);
  assert.equal(s.moved, false);
});
test('item variants preserve matching families', () => {
  const s = g.startRun();
  const before = g.validMoves(s.board);
  s.board.forEach((t) => {
    if (t.family === 'blade') t.variant = 'venom';
    if (t.family === 'spark') t.variant = 'bomb';
  });
  assert.deepEqual(g.validMoves(s.board), before);
});
test('crossing groups never collect the same cell twice', () => {
  const s = g.startRun();
  s.board.forEach(
    (t, i) => (t.family = g.FAMILIES[(Math.floor(i / 6) + (i % 6)) % 4]),
  );
  for (const i of [13, 14, 15, 8, 20]) s.board[i].family = 'blade';
  const cells = g.groups(s.board).flat();
  assert.equal(cells.length, new Set(cells).size);
  assert.equal(cells.filter((x) => x === 14).length, 1);
});
test('a charged spell can be used after matching and only once per turn', () => {
  const { s, m } = findState('spark');
  s.enemies[0].hp = s.enemies[0].maxHp = 100;
  const r = applyMove(s, m).state;
  assert.ok(r.energy >= 6);
  const cast = g.castSkill(r, 'bolt');
  assert.equal(cast.error, undefined);
  assert.ok(cast.state.cast);
  assert.equal(cast.state.energy, r.energy - 6);
  assert.ok(g.castSkill(cast.state, 'bolt').error);
});
test('sacrifice ignores block and cannot pay the last health', () => {
  const s = g.startRun();
  s.skills = ['blood'];
  s.hp = 2;
  s.block = 10;
  assert.ok(g.castSkill(s, 'blood').error);
  s.hp = 5;
  const r = g.castSkill(s, 'blood').state;
  assert.equal(r.hp, 3);
  assert.equal(r.block, 10);
  assert.equal(r.enemies[0].hp, 10);
});
test('killing with a spell immediately reaches reward and prevents enemy retaliation', () => {
  const s = g.startRun();
  s.energy = 12;
  s.enemies[0].hp = 10;
  const r = g.castSkill(s, 'bolt').state;
  assert.equal(r.phase, 'reward');
  assert.equal(g.endTurn(r).state, r);
  assert.equal(r.hp, 40);
});
test('documented shield/coil/return synergy produces the exact first wave', () => {
  const { s, m } = findState('shield');
  s.energy = 6;
  s.relics = ['thorns', 'coil', 'return'];
  s.enemies[0].hp = s.enemies[0].maxHp = 100;
  const charged = g.castSkill(s, 'bolt').state;
  const r = applyMove(charged, m);
  const frame = r.frames[0].state;
  assert.equal(frame.block, 9);
  assert.equal(frame.energy, 3);
  assert.equal(frame.enemies[0].hp, 84);
});
test('energy and focus never exceed their resource caps', () => {
  for (let seed = 1; seed < 25; seed++) {
    const s = g.startRun(seed);
    s.energy = 12;
    s.focus = 6;
    const m = g.validMoves(s.board)[0];
    const r = applyMove(s, m).state;
    assert.ok(r.energy <= g.energyMax(r));
    assert.ok(r.focus <= g.focusMax(r));
  }
});
test('poison can kill before an enemy acts', () => {
  const s = g.startRun();
  s.enemies[0].hp = 2;
  s.enemies[0].poison = 3;
  const r = g.endTurn(s).state;
  assert.equal(r.phase, 'reward');
  assert.equal(r.hp, 40);
});
test('hero poison ignores block and lethal poison stops all enemies', () => {
  const s = g.startRun();
  s.heroPoison = 3;
  s.block = 10;
  s.hp = 2;
  const r = g.endTurn(s).state;
  assert.equal(r.phase, 'defeat');
  assert.equal(r.hp, 0);
  assert.equal(r.block, 10);
});
test('enemy death stops rooted tile threats from that enemy', () => {
  const s = g.startRun();
  s.enemies[0].hp = 1;
  s.enemies[0].poison = 2;
  s.board[0].root = { owner: s.enemies[0].id, expires: 1 };
  const r = g.endTurn(s).state;
  assert.equal(r.hp, 40);
  assert.equal(r.phase, 'reward');
});
test('reward selection is atomic and cannot grant an item twice', () => {
  const s = g.startRun();
  s.phase = 'reward';
  s.offers = [g.RELICS[0]];
  const r = g.chooseReward(s, 'thorns').state;
  assert.equal(r.phase, 'map');
  assert.deepEqual(r.relics, ['thorns']);
  assert.equal(g.chooseReward(r, 'thorns').state, r);
});
test('skills require an explicit replacement slot', () => {
  const s = g.startRun();
  s.phase = 'reward';
  s.offers = [g.SKILLS.find((x) => x.id === 'blood')];
  assert.ok(g.chooseReward(s, 'blood').error);
  const r = g.chooseReward(s, 'blood', 1).state;
  assert.deepEqual(r.skills, ['bolt', 'blood']);
});
test('shop cannot overspend or buy a sold item twice', () => {
  const s = g.startRun();
  s.phase = 'map';
  s.room = 4;
  const shop = g.enterRoom(s, '5-shop').state;
  shop.gold = 0;
  assert.ok(g.buy(shop, shop.offers[0].id).error);
  shop.gold = 100;
  const id = shop.offers[0].id,
    cost = shop.offers[0].cost,
    r = g.buy(shop, id, 0).state;
  assert.equal(r.gold, 100 - cost);
  assert.equal(g.buy(r, id).state, r);
});
test('map exposes one shop, one rest, one boss and real alternative routes', () => {
  const s = g.startRun();
  s.phase = 'map';
  for (const [n, kind] of [
    [4, 'shop'],
    [8, 'rest'],
    [9, 'boss'],
  ]) {
    s.room = n;
    assert.equal(g.nextRooms(s).length, 1);
    assert.equal(g.nextRooms(s)[0].kind, kind);
  }
  s.room = 3;
  assert.deepEqual(
    g.nextRooms(s).map((x) => x.kind),
    ['battle', 'elite'],
  );
});
test('entering a room resets combat resources while retaining the build', () => {
  const s = g.startRun();
  s.phase = 'map';
  s.energy = 12;
  s.focus = 6;
  s.block = 30;
  s.heroPoison = 9;
  s.hp = 27;
  s.relics = ['coil'];
  s.flags.push('turn:coil', 'battle:heart', 'run:available:coil');
  const r = g.enterRoom(s, '2-battle').state;
  assert.equal(r.energy, 3);
  assert.equal(r.focus, 0);
  assert.equal(r.block, 0);
  assert.equal(r.heroPoison, 0);
  assert.equal(r.hp, 27);
  assert.deepEqual(r.relics, ['coil']);
  assert.ok(r.flags.includes('run:available:coil'));
  assert.ok(!r.flags.includes('turn:coil'));
});
test('trial clock pauses, resumes and failure never kills', () => {
  const s = g.startRun();
  s.phase = 'map';
  s.room = 6;
  let r = g.enterRoom(s, '7-trial').state;
  assert.equal(g.tickTrial(r, 20).state.trial.remaining, 45);
  r = g.pauseTrial(r, false).state;
  r.hp = 2;
  r = g.tickTrial(r, 46).state;
  assert.equal(r.phase, 'map');
  assert.equal(r.hp, 1);
});
test('trial success counts generated energy beyond the held resource cap', () => {
  const { s, m } = findState('spark');
  s.phase = 'trial';
  s.trial = {
    remaining: 30,
    energy: 16,
    damage: 30,
    protection: 0,
    paused: false,
  };
  s.energy = 12;
  const r = applyMove(s, m).state;
  assert.equal(r.phase, 'reward');
  assert.equal(r.stats.trials, 1);
  assert.equal(r.energy, 12);
});
test('save / resume preserves future random outcomes', () => {
  const s = g.startRun();
  const a = JSON.parse(JSON.stringify(s));
  assert.ok(g.isSave(a));
  const m = g.validMoves(s.board)[0];
  assert.deepEqual(applyMove(s, m), applyMove(a, m));
  assert.ok(!g.isSave({ version: 1 }));
});
test('meta records a win once and preserves unlocks on defeat', () => {
  const s = g.startRun();
  s.phase = 'victory';
  s.stats.matches = 1;
  let m = g.updateMeta(g.EMPTY_META, s);
  assert.equal(m.streak, 1);
  assert.ok(m.unlocked.includes('first-match'));
  assert.deepEqual(g.updateMeta(m, s), m);
  const lost = g.startRun(2);
  lost.phase = 'defeat';
  m = g.updateMeta(m, lost);
  assert.equal(m.streak, 0);
  assert.equal(m.best, 1);
  assert.ok(m.unlocked.includes('win'));
});
test('lab runs never advance achievements or normal streaks', () => {
  const s = g.configureRun(g.startRun(), 'shields');
  s.phase = 'victory';
  s.stats.matches = 10;
  const m = g.updateMeta(g.EMPTY_META, s);
  assert.equal(m.streak, 0);
  assert.equal(m.unlocked.length, 0);
});
test('new openings only enter subsequent runs', () => {
  const s = g.startRun();
  s.stats.matches = 1;
  const m = g.updateMeta(g.EMPTY_META, s);
  assert.ok(!s.flags.includes('run:available:coil'));
  assert.ok(
    g.withUnlocks(g.startRun(2), m).flags.includes('run:available:coil'),
  );
});
function automatedRun(seed) {
  let s = g.withUnlocks(g.startRun(seed), allMeta);
  let actions = 0;
  while (!['victory', 'defeat'].includes(s.phase) && actions++ < 300) {
    if (s.phase === 'battle') {
      if (s.potions && s.hp < s.maxHp - 8) s = g.consumePotion(s).state;
      const incoming = s.enemies
        .filter((e) => e.hp > 0)
        .reduce(
          (n, e) =>
            n + (g.intent(s, e).type === 'attack' ? g.intent(s, e).value : 0),
          0,
        );
      const candidates = g.validMoves(s.board).map((m) => applyMove(s, m));
      candidates.sort((a, b) => {
        const value = (r) =>
          (r.state.phase === 'reward' || r.state.phase === 'victory'
            ? 10000
            : 0) +
          (r.state.stats.damage - s.stats.damage) * 1.4 +
          Math.min(incoming, r.state.block) * 1.9 +
          (r.state.energy - s.energy) * 0.8 +
          (r.state.focus - s.focus) * 0.25 +
          (r.state.hp - s.hp) * 3;
        return value(b) - value(a);
      });
      if (candidates.length) s = candidates[0].state;
      if (s.phase === 'battle' && !s.cast) {
        if (g.canCast(s, 'bolt')) s = g.castSkill(s, 'bolt').state;
        else if (g.canCast(s, 'guard') && s.block < incoming)
          s = g.castSkill(s, 'guard').state;
      }
      if (s.phase === 'battle') s = g.endTurn(s).state;
    } else if (s.phase === 'reward') {
      const order = [
        'thorns',
        'coil',
        'return',
        'bomb',
        'prism',
        'venom',
        'heart',
      ];
      const o = [...s.offers].sort(
        (a, b) =>
          (order.includes(a.id) ? order.indexOf(a.id) : 99) -
          (order.includes(b.id) ? order.indexOf(b.id) : 99),
      )[0];
      s = g.chooseReward(s, o?.id ?? null, 1).state;
    } else if (s.phase === 'map') {
      const routes = g.nextRooms(s);
      const r =
        routes.find((x) => x.kind === 'event') ??
        routes.find((x) => x.kind === 'battle') ??
        routes[0];
      s = g.enterRoom(s, r.id).state;
    } else if (s.phase === 'shop') {
      const o = s.offers.find((o) => o.kind === 'upgrade' && s.gold >= o.cost);
      if (o) s = g.buy(s, o.id).state;
      s = g.leaveRoom(s).state;
    } else if (s.phase === 'event') s = g.eventChoice(s, 'supplies').state;
    else if (s.phase === 'rest') s = g.rest(s, 'heal').state;
    else if (s.phase === 'trial')
      s = g.tickTrial(g.pauseTrial(s, false).state, 46).state;
    assert.ok(Number.isFinite(s.hp));
    assert.ok(s.energy >= 0 && s.energy <= g.energyMax(s));
    assert.equal(s.board.length, 36);
    assert.ok(g.isSave(s));
  }
  assert.ok(['victory', 'defeat'].includes(s.phase));
  return s;
}
test('complete automated routes terminate without corrupting state', () => {
  let wins = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = automatedRun(seed);
    if (s.phase === 'victory') {
      wins++;
      assert.equal(s.room, 10);
    }
  }
  assert.ok(wins > 0, `expected at least one complete victory; wins=${wins}`);
  console.log(
    `Simulation: ${wins}/12 wins with a deterministic look-ahead bot; not a player balance estimate.`,
  );
});

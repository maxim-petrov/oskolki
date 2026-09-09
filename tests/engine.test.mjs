import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage1-engine.mjs';
// Pre-v0.2 saves deliberately retain their original rules and reward sequence.
function classic(s = g.startRun()) {
  delete s.rulesVersion;
  delete s.weaponQuality;
  s.flags = s.flags.filter((f) => !f.startsWith('run:available:'));
  s.flags.push('run:available:thorns', 'run:available:order');
  return s;
}
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
test('classic saves: new openings only enter subsequent runs', () => {
  const s = classic();
  s.stats.matches = 1;
  const m = g.updateMeta(g.EMPTY_META, s);
  assert.ok(!s.flags.includes('run:available:coil'));
  assert.ok(
    g.withUnlocks(g.startRun(2), m).flags.includes('run:available:coil'),
  );
});
function automatedRun(seed, preferEquipment = false, alternate = false) {
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
          (preferEquipment && a.kind === 'equipment'
            ? -1
            : order.includes(a.id)
              ? order.indexOf(a.id)
              : 99) -
          (preferEquipment && b.kind === 'equipment'
            ? -1
            : order.includes(b.id)
              ? order.indexOf(b.id)
              : 99),
      )[0];
      s = g.chooseReward(s, o?.id ?? null, 1).state;
    } else if (s.phase === 'map') {
      const routes = g.nextRooms(s);
      const r =
        (alternate
          ? (routes.find((x) => x.kind === 'elite') ??
            routes.filter((x) => x.kind === 'battle').at(-1))
          : routes.find((x) => x.kind === 'event')) ??
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
      assert.equal(s.room, 20);
    }
  }
  assert.ok(wins > 0, `expected at least one complete victory; wins=${wins}`);
  console.log(
    `Simulation: ${wins}/12 wins with a deterministic look-ahead bot; not a player balance estimate.`,
  );
});

test('every run starts with basic equipment and a genuinely empty helmet slot', () => {
  const s = g.startRun();
  assert.deepEqual(s.equipment, {
    weapon: 'gear-cutter',
    helmet: null,
    clothing: 'gear-shirt',
    trousers: 'gear-worn-trousers',
  });
  assert.equal(s.hp, 40);
  assert.equal(g.focusMax(s), 6);
  for (const slot of g.EQUIPMENT_SLOTS)
    assert.equal(g.equipmentBonus(s, slot), 0);
  s.equipment.weapon = 'gear-rune-sword';
  assert.equal(g.startRun().equipment.weapon, 'gear-cutter');
});

test('classic saves: gear appears deterministically, progresses by room, and never offers a downgrade', () => {
  for (const room of [1, 2, 4, 6, 9]) {
    const a = classic(g.startRun(room)),
      b = g.copy(a);
    a.room = b.room = room;
    const offers = g.rewardOffers(a),
      same = g.rewardOffers(b);
    assert.deepEqual(offers, same);
    assert.equal(a.rng, b.rng);
    assert.equal(offers.length, 4);
    assert.equal(offers.filter((o) => o.kind === 'equipment').length, 1);
    assert.equal(new Set(offers.map((o) => o.id)).size, offers.length);
  }
  const s = classic();
  for (const slot of g.EQUIPMENT_SLOTS)
    s.equipment[slot] = g.EQUIPMENT.find(
      (o) => o.slot === slot && o.tier === 1,
    ).id;
  s.equipment.weapon = 'gear-axe';
  s.room = 5;
  assert.deepEqual(g.equipmentOptions(s), []);
  assert.equal(g.rewardOffers(s).length, 3);
  s.room = 6;
  assert.equal(g.equipmentOptions(s).length, 4);
  assert.ok(g.equipmentOptions(s).every((o) => o.tier === 2));
  for (const item of g.equipmentOptions(s)) s.equipment[item.slot] = item.id;
  assert.deepEqual(g.equipmentOptions(s), []);
});

test('classic saves: equipment rewards replace only their slot, and invalid or repeated choices are atomic', () => {
  const s = classic();
  s.phase = 'reward';
  s.offers = [g.equipmentById('gear-cleaver')];
  const before = g.copy(s);
  assert.ok(g.chooseReward(s, 'gear-rune-sword').error);
  const r = g.chooseReward(s, 'gear-cleaver').state;
  assert.equal(r.phase, 'map');
  assert.equal(r.equipment.weapon, 'gear-cleaver');
  assert.equal(r.equipment.clothing, s.equipment.clothing);
  assert.equal(r.equipment.helmet, null);
  assert.deepEqual(s, before);
  assert.ok(g.chooseReward(r, 'gear-cleaver').error);
  r.phase = 'reward';
  r.offers = [g.equipmentById('gear-cutter')];
  assert.equal(g.chooseReward(r, 'gear-cutter').state, r);
  const skipped = g.chooseReward(r, null).state;
  assert.deepEqual(skipped.equipment, r.equipment);
});

test('classic saves: weapon and clothing bonuses change real match results, without changing the board rolls', () => {
  for (const [family, slot, id, field] of [
    ['blade', 'weapon', 'gear-cleaver', 'damage'],
    ['shield', 'clothing', 'gear-jacket', 'block'],
  ]) {
    const { s, m } = findState(family);
    classic(s);
    s.enemies[0].hp = s.enemies[0].maxHp = 10000;
    const enhanced = g.copy(s);
    enhanced.equipment[slot] = id;
    const base = applyMove(s, m),
      upgraded = applyMove(enhanced, m);
    const firstBase = base.frames[0].state,
      firstUpgraded = upgraded.frames[0].state;
    assert.equal(
      field === 'damage'
        ? firstUpgraded.stats.damage - firstBase.stats.damage
        : firstUpgraded.block - firstBase.block,
      2,
    );
    assert.equal(upgraded.state.rng, base.state.rng);
    assert.deepEqual(upgraded.state.board, base.state.board);
  }
});

test('helmets add only the difference in health and cannot be farmed by repeated purchase', () => {
  let s = g.startRun();
  s.hp = 20;
  s.phase = 'shop';
  s.gold = 200;
  for (const [id, maxHp, hp] of [
    ['gear-tin-helmet', 44, 24],
    ['gear-iron-helmet', 48, 28],
    ['gear-bronze-helmet', 52, 32],
  ]) {
    s.offers = [{ ...g.equipmentById(id), cost: 25 }];
    s = g.buy(s, id).state;
    assert.equal(s.maxHp, maxHp);
    assert.equal(s.hp, hp);
    assert.equal(g.buy(s, id).state, s);
    s.offers = [{ ...g.equipmentById(id), cost: 25 }];
    const gold = s.gold;
    assert.equal(g.buy(s, id).state, s);
    assert.equal(s.gold, gold);
  }
  s.phase = 'map';
  s.room = 1;
  s = g.enterRoom(s, g.nextRooms(s)[0].id).state;
  assert.equal(s.maxHp, 52);
  assert.equal(s.equipment.helmet, 'gear-bronze-helmet');
});

test('trousers expand focus capacity, and matches respect the new cap', () => {
  const { s, m } = findState('focus');
  s.equipment.trousers = 'gear-guard-trousers';
  s.upgrades.focus = 1;
  assert.equal(g.focusMax(s), 11);
  s.focus = 10;
  const r = applyMove(s, m).state;
  assert.equal(r.focus, 11);
});

test('shop stocks distinct affordable gear slots and rejects unavailable or unaffordable gear', () => {
  const s = g.startRun();
  s.phase = 'map';
  s.room = 4;
  const shop = g.enterRoom(s, '5-shop').state;
  const items = shop.offers.filter((o) => o.kind === 'equipment');
  assert.equal(items.length, 2);
  assert.equal(new Set(items.map((o) => o.slot)).size, 2);
  assert.ok(items.every((o) => [25, 40].includes(o.baseCost ?? o.cost)));
  shop.gold = 0;
  assert.equal(g.buy(shop, items[0].id).state, shop);
  shop.gold = items[0].cost;
  const after = g.buy(shop, items[0].id).state;
  assert.equal(after.gold, 0);
  assert.equal(after.equipment[items[0].slot], items[0].id);
  assert.equal(
    after.offers.some((o) => o.id === items[0].id),
    false,
  );
});

test('old local saves migrate without changing the run or future randomness', () => {
  const s = g.startRun(418);
  s.hp = 17;
  s.gold = 91;
  const old = g.copy(s);
  old.version = 1;
  delete old.equipment;
  const raw = JSON.stringify(old);
  const loaded = g.loadSave(old);
  assert.deepEqual(loaded, s);
  assert.equal(JSON.stringify(old), raw);
  const m = g.validMoves(s.board)[0];
  assert.deepEqual(applyMove(loaded, m), applyMove(s, m));
  loaded.equipment.weapon = 'gear-cleaver';
  assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(loaded))), loaded);
  assert.equal(g.loadSave(null), null);
});

test('save validation rejects missing, unknown or wrongly slotted equipment', () => {
  for (const gear of [
    null,
    {},
    { ...g.startingEquipment(), weapon: null },
    { ...g.startingEquipment(), helmet: 'gear-jacket' },
    { ...g.startingEquipment(), clothing: 'missing' },
    { ...g.startingEquipment(), extra: 'gear-cutter' },
  ]) {
    assert.equal(g.loadSave({ ...g.startRun(), equipment: gear }), null);
  }
  const s = g.startRun();
  s.offers = [{ id: 'missing', kind: 'equipment' }];
  assert.equal(g.loadSave(s), null);
});

test('complete routes also work when the player prefers equipment and resumes upgraded saves', () => {
  let upgrades = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = automatedRun(seed, true);
    assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(s))), s);
    upgrades += Object.values(s.equipment).filter(
      (id) => g.equipmentById(id)?.bonus > 0,
    ).length;
  }
  assert.ok(upgrades > 0);
});

test('classic saves: five weapons progress in order, including improvements within the same quality', () => {
  const ids = [
    'gear-cutter',
    'gear-rusty-dagger',
    'gear-cleaver',
    'gear-axe',
    'gear-rune-sword',
  ];
  assert.deepEqual(
    g.WEAPONS.map((weapon) => weapon.id),
    ids,
  );
  let s = classic();
  for (let i = 1; i < ids.length; i++) {
    s.room = i === 4 ? 6 : 2;
    const next = g.equipmentOptions(s).filter((item) => item.slot === 'weapon');
    assert.equal(next.length, 1);
    assert.equal(next[0].id, ids[i]);
    s.phase = 'reward';
    s.offers = next;
    const r = g.chooseReward(s, ids[i]);
    assert.equal(r.error, undefined);
    assert.equal(r.state.equipment.weapon, ids[i]);
    assert.equal(g.equipmentBonus(r.state, 'weapon'), i);
    assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(r.state))), r.state);
    s = r.state;
  }
  assert.equal(
    g.equipmentOptions(s).some((item) => item.slot === 'weapon'),
    false,
  );
});

test('classic saves: rare sword stays gated, and an existing cleaver save offers the new axe', () => {
  const old = classic();
  old.equipment.weapon = 'gear-cleaver';
  old.room = 4;
  const loaded = g.loadSave(JSON.parse(JSON.stringify(old)));
  assert.equal(
    g.equipmentOptions(loaded).find((item) => item.slot === 'weapon').id,
    'gear-axe',
  );
  loaded.equipment.weapon = 'gear-axe';
  loaded.room = 5;
  assert.equal(
    g.equipmentOptions(loaded).some((item) => item.slot === 'weapon'),
    false,
  );
  loaded.room = 6;
  assert.equal(
    g.equipmentOptions(loaded).find((item) => item.slot === 'weapon').id,
    'gear-rune-sword',
  );
});

test('classic saves: all five weapons use their own match damage bonus and do not amplify spells', () => {
  const { s, m } = findState('blade');
  classic(s);
  s.enemies[0].hp = s.enemies[0].maxHp = 10000;
  s.energy = 6;
  const baseline = applyMove(s, m).frames[0].state.stats.damage;
  for (const weapon of g.WEAPONS) {
    const equipped = g.copy(s);
    equipped.equipment.weapon = weapon.id;
    assert.equal(
      applyMove(equipped, m).frames[0].state.stats.damage - baseline,
      weapon.bonus,
    );
    assert.equal(g.castSkill(equipped, 'bolt').state.stats.damage, 12);
  }
});

test('alternate routes through new elite pairs and the archive can finish a full saved run', () => {
  let wins = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = automatedRun(seed, true, true);
    if (s.phase === 'victory') {
      wins++;
      assert.equal(s.enemies[0].kind, 'tide-keeper');
    }
    assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(s))), s);
  }
  assert.ok(wins > 0);
  console.log(
    'Alternate route simulation: ' + wins + '/12 wins with a look-ahead bot.',
  );
});

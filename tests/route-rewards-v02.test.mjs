import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage2-engine.mjs';
import { accept, at, clear, finish } from './helpers/stage2-fixtures.mjs';

test('seeded graphs contain exactly twenty-room paths, shared anchors, one treasure per biome and a route with no elites or timer', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const s = g.startRun(seed),
      j = s.journey;
    assert.equal(s.rulesVersion, 4);
    assert.ok(g.isSave(s));
    assert.equal(j.nodes.length, 32);
    assert.deepEqual(j, g.startRun(seed).journey);
    layouts.add(JSON.stringify(j.nodes));
    const paths = [];
    const walk = (id, path) => {
      const n = j.nodes.find((n) => n.id === id),
        next = [...path, n];
      if (!n.next.length) paths.push(next);
      else n.next.forEach((id) => walk(id, next));
    };
    walk('1-0', []);
    assert.equal(paths.length, 16);
    assert.ok(
      paths.some((p) => p.every((n) => !['elite', 'trial'].includes(n.kind))),
    );
    for (const path of paths) {
      assert.deepEqual(
        path.map((n) => n.depth),
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
      for (const offset of [0, 10]) {
        const biome = path.slice(offset, offset + 10);
        assert.equal(biome.filter((n) => n.kind === 'treasure').length, 1);
        assert.ok(biome.filter((n) => n.kind === 'elite').length <= 2);
        for (const [depth, kind] of [
          [1, 'battle'],
          [2, 'battle'],
          [5, 'shop'],
          [6, 'battle'],
          [9, 'rest'],
          [10, 'boss'],
        ])
          assert.equal(biome[depth - 1].kind, kind);
        const firstInk = biome.find((n) => n.roster?.includes('ink-scribe'));
        if (offset && firstInk?.depth === 12)
          assert.equal(firstInk.roster.length, 1);
      }
    }
  }
  assert.ok(layouts.size > 200);
});

test('branch choice fixes consecutive rooms, graph marks unreachable futures, and illegal hops are atomic', () => {
  for (const lane of [0, 1]) {
    let s = finish(g.startRun(70));
    s = accept(g.enterRoom(s, `2-${lane}`));
    assert.deepEqual(
      g.nextRooms(s).map((n) => n.id),
      [`3-${lane}`],
    );
    const map = g.routeMap(s).flat();
    assert.equal(map.find((n) => n.id === `3-${1 - lane}`).status, 'skipped');
    assert.equal(map.find((n) => n.id === `4-${1 - lane}`).status, 'skipped');
    assert.equal(map.find((n) => n.id === '5-0').status, 'future');
    s = finish(s);
    const before = g.copy(s);
    for (const id of [`3-${1 - lane}`, '5-0', '20-0']) {
      const r = g.enterRoom(s, id);
      assert.ok(r.error);
      assert.equal(r.state, s);
      assert.deepEqual(s, before);
    }
    s = accept(g.enterRoom(s, `3-${lane}`));
    s = finish(s);
    assert.deepEqual(
      g.nextRooms(s).map((n) => n.id),
      [`4-${lane}`],
    );
    s = accept(g.enterRoom(s, `4-${lane}`));
    s = finish(s);
    assert.deepEqual(
      g.nextRooms(s).map((n) => n.id),
      ['5-0'],
    );
  }
});

test('first fight, ordinary fights, elites, Censor and final boss have distinct deterministic payouts and rewards', () => {
  const normalPayouts = new Set(),
    elitePayouts = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const first = clear(g.startRun(seed));
    assert.deepEqual(
      first.offers.map((o) => o.kind),
      ['equipment', 'modifier', 'relic'],
    );
    for (const [depth, kind, min, max] of [
      [2, 'battle', 12, 18],
      [4, 'elite', 25, 35],
    ]) {
      const s = at(depth, kind, seed),
        r = clear(s),
        pay = r.gold - s.gold;
      assert.ok(pay >= min && pay <= max);
      (kind === 'elite' ? elitePayouts : normalPayouts).add(pay);
      assert.equal(r.offers.length, kind === 'elite' ? 3 : 2);
      if (kind === 'elite') {
        assert.ok(r.offers.some((o) => o.kind === 'relic'));
        assert.ok(
          r.offers.every((o) => ['relic', 'modifier'].includes(o.kind)),
        );
      } else {
        assert.ok(['equipment', 'upgrade'].includes(r.offers[0].kind));
        assert.ok(['skill', 'modifier'].includes(r.offers[1].kind));
      }
      assert.equal(new Set(r.offers.map((o) => o.id)).size, r.offers.length);
      const skipped = accept(g.chooseReward(r, null));
      assert.equal(skipped.gold, r.gold + (kind === 'battle' ? 8 : 0));
      assert.ok(g.chooseReward(skipped, null).error);
    }
  }
  assert.equal(normalPayouts.size, 7);
  assert.equal(elitePayouts.size, 11);
  const censor = at(10),
    r = clear(censor);
  assert.equal(r.gold - censor.gold, 40);
  assert.deepEqual(r.offers, g.SEALS);
  assert.equal(r.hp, censor.hp);
  const boss = at(20),
    streams = g.copy(boss.streams),
    rng = boss.rng,
    win = clear(boss);
  assert.equal(win.phase, 'victory');
  assert.equal(win.gold, boss.gold);
  assert.deepEqual(win.offers, []);
  assert.deepEqual(win.streams, streams);
  assert.equal(win.rng, rng);
  assert.equal(win.rewardSource, undefined);
  assert.ok(g.isSave(win));
});

test('treasure is one saved visible unowned relic, has one paid reroll with no duplicate, and no skip compensation', () => {
  let s = at(3);
  assert.equal(s.rewardSource, 'treasure');
  assert.equal(s.offers.length, 1);
  const original = s.offers[0],
    snapshot = g.copy(s);
  for (let i = 0; i < 3; i++) {
    g.routeMap(s);
    g.nextRooms(s);
    s = g.loadSave(JSON.parse(JSON.stringify(s)));
  }
  assert.deepEqual(s, snapshot);
  const noMoney = g.copy(s);
  noMoney.gold = 19;
  assert.equal(g.rerollTreasure(noMoney).state, noMoney);
  assert.deepEqual(s, snapshot);
  const r = accept(g.rerollTreasure(s));
  assert.equal(r.gold, s.gold - 20);
  assert.notEqual(r.offers[0].id, original.id);
  assert.equal(r.rng, s.rng);
  assert.equal(r.streams.encounters, s.streams.encounters);
  assert.ok(r.treasureRerolled);
  assert.equal(g.rerollTreasure(r).state, r);
  assert.deepEqual(g.loadSave(r), r);
  const taken = accept(g.chooseReward(r, r.offers[0].id));
  assert.ok(taken.relics.includes(r.offers[0].id));
  assert.equal(taken.gold, r.gold);
  assert.equal(g.chooseReward(taken, original.id).state, taken);
  const skipped = accept(g.chooseReward(s, null));
  assert.equal(skipped.gold, s.gold);
  assert.equal(skipped.relics.length, s.relics.length);
  const full = at(2);
  full.relics = g.RELICS.map((o) => o.id);
  const empty = accept(g.enterRoom(finish(full), g.nextRooms(full)[0].id));
  assert.deepEqual(empty.offers, []);
  assert.ok(!g.canRerollTreasure(empty));
  assert.equal(finish(empty).phase, 'map');
});

test('extra board RNG cannot change map, future enemies, payout, loot or shop prices; loot cannot change board', () => {
  for (const depth of [2, 4, 10]) {
    const a = at(depth),
      b = g.copy(a);
    for (let i = 0; i < 300; i++) g.random(b);
    assert.deepEqual(g.routeMap(a), g.routeMap(b));
    const ar = clear(a),
      br = clear(b);
    assert.deepEqual(ar.offers, br.offers);
    assert.equal(ar.gold, br.gold);
    assert.deepEqual(ar.streams, br.streams);
  }
  const a = finish(at(4)),
    b = g.copy(a);
  for (let i = 0; i < 50; i++) g.random(b);
  const shopA = accept(g.enterRoom(a, '5-0')),
    shopB = accept(g.enterRoom(b, '5-0'));
  assert.deepEqual(shopA.offers, shopB.offers);
  for (const o of shopA.offers.filter((o) => o.id.startsWith('up-')))
    assert.equal(o.baseCost ?? o.cost, 40);
  const saved = g.loadSave(shopA);
  assert.deepEqual(saved.offers, shopA.offers);
  shopA.gold = 999;
  const sale = shopA.offers.find((o) => o.discount),
    purchased = accept(g.buy(shopA, sale.id, 0));
  assert.equal(purchased.gold, 999 - sale.cost);
  assert.deepEqual(
    purchased.offers,
    shopA.offers.filter((o) => o.id !== sale.id),
  );
  assert.deepEqual(purchased.streams, shopA.streams);
  const t = at(3),
    r = accept(g.rerollTreasure(t));
  const enter = (s) => {
    s = finish(s);
    return accept(g.enterRoom(s, g.nextRooms(s)[0].id));
  };
  assert.deepEqual(enter(t).board, enter(r).board);
});

test('exhausted reward categories fall back to legal alternatives; event and trial rewards cannot be exchanged for gold', () => {
  let s = at(2);
  s.skills = g.SKILLS.map((o) => o.id);
  s.modifiers = g.MODIFIERS.map((o) => o.id);
  const reward = clear(s);
  assert.equal(reward.offers.length, 2);
  assert.ok(
    reward.offers.every((o) =>
      ['equipment', 'upgrade', 'relic'].includes(o.kind),
    ),
  );
  s = at(4, 'elite');
  s.relics = g.RELICS.map((o) => o.id);
  s.modifiers = g.MODIFIERS.map((o) => o.id);
  assert.deepEqual(clear(s).offers, []);
  assert.equal(finish(s).phase, 'map');
  const event = at(7, 'event');
  const offered = accept(g.eventChoice(event, 'relic'));
  assert.equal(offered.hp, event.hp - 5);
  assert.equal(offered.rewardSource, 'event');
  assert.deepEqual(g.loadSave(offered), offered);
  assert.equal(g.eventChoice(offered, 'relic').state, offered);
  assert.equal(accept(g.chooseReward(offered, null)).gold, offered.gold);
  let trial = at(7, 'trial');
  trial.trial.paused = false;
  trial.trial.energy = 18;
  trial.trial.damage = 30;
  trial.focus = 3;
  trial = accept(g.castSkill(trial, 'edit', 0, 'shield'));
  assert.equal(trial.rewardSource, 'trial');
  assert.ok(g.isSave(trial));
  assert.equal(accept(g.chooseReward(trial, null)).gold, trial.gold);
});

test('save validation rejects malformed route edges, skipped branches, streams, seal state and treasure data without throwing', () => {
  const samples = [g.startRun(0), at(3), clear(at(10)), at(11), clear(at(20))];
  for (const source of samples)
    assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(source))), source);
  for (const mutate of [
    (s) => (s.journey.nodes[0] = null),
    (s) => (s.journey.nodes[0].next = ['20-0']),
    (s) => (s.journey.nodes[0].next = ['1-0']),
    (s) => (s.journey.nodes[0].id = 'oops'),
    (s) => (s.journey.nodes[0].depth = 3),
    (s) => (s.journey.nodes[0].roster = ['unknown']),
    (s) => (s.journey.current = '2-1'),
    (s) => (s.journey.visited = []),
    (s) => (s.path = []),
    (s) => (s.streams.loot = -1),
    (s) => (s.streams.encounters = NaN),
    (s) => (s.streams = null),
    (s) => (s.seal = 'red-line'),
    (s) => (s.rewardSource = 'seal'),
  ]) {
    const bad = g.copy(samples[0]);
    mutate(bad);
    assert.equal(g.loadSave(bad), null);
  }
  let bad = g.copy(samples[1]);
  bad.offers.push(bad.offers[0]);
  assert.equal(g.loadSave(bad), null);
  bad = g.copy(samples[2]);
  bad.offers[0].id = 'unknown';
  assert.equal(g.loadSave(bad), null);
  bad = g.copy(samples[3]);
  bad.seal = 'unknown';
  assert.equal(g.loadSave(bad), null);
});

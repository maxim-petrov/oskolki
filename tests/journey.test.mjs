import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import { isValidSeed } from '../game/seed.ts';
import {
  MERCHANT_TOPICS,
  merchantGreeting,
  merchantPurchase,
} from '../game/merchant.ts';
import { ROOM_BACKGROUNDS, roomBackground } from '../game/visual-style.ts';

const save = (s) => g.loadSave(JSON.parse(JSON.stringify(s)));
function shopAt(seed) {
  const s = g.startRun(seed);
  s.phase = 'map';
  s.room = 4;
  s.path = [
    'Вход в крипту',
    'Бумажные норы',
    'Забытый алтарь',
    'Комната исправлений',
  ];
  return g.enterRoom(s, '5-shop').state;
}

test('each new shop rolls two unique partial discounts once and rounds the payable price up', () => {
  const rates = new Set(),
    assortments = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const s = shopAt(seed),
      sales = s.offers.filter((o) => o.discount);
    assert.equal(sales.length, 2);
    assert.ok(s.offers.length > sales.length);
    assert.equal(new Set(s.offers.map((o) => o.id)).size, s.offers.length);
    for (const o of sales) {
      assert.ok([20, 30, 40].includes(o.discount));
      assert.equal(o.cost, Math.ceil((o.baseCost * (100 - o.discount)) / 100));
      assert.ok(o.cost > 0 && o.cost < o.baseCost);
      rates.add(o.discount);
    }
    assert.deepEqual(s, shopAt(seed));
    assert.deepEqual(save(s), s);
    assortments.add(sales.map((o) => o.id + ':' + o.discount).join(','));
  }
  assert.equal(rates.size, 3);
  assert.ok(assortments.size > 10);
});

test('sale purchases charge the displayed price and cannot reroll, overspend or duplicate the item', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = shopAt(seed),
      offer = s.offers.find((o) => o.discount);
    s.gold = offer.cost - 1;
    const poor = g.buy(s, offer.id, 0);
    assert.equal(poor.state, s);
    assert.ok(poor.error);
    s.gold = offer.cost;
    const after = g.buy(s, offer.id, 0);
    assert.equal(after.error, undefined);
    assert.equal(after.state.gold, 0);
    assert.equal(after.state.rng, s.rng);
    assert.deepEqual(
      after.state.offers,
      s.offers.filter((o) => o.id !== offer.id),
    );
    assert.deepEqual(after, g.buy(save(s), offer.id, 0));
    assert.equal(g.buy(after.state, offer.id, 0).state, after.state);
    assert.deepEqual(g.leaveRoom(after.state), g.leaveRoom(save(after.state)));
  }
});

test('discounted skill replacement keeps the offer and price until a valid slot is chosen', () => {
  const s = Array.from({ length: 100 }, (_, i) => shopAt(i)).find((s) =>
    s.offers.some((o) => o.kind === 'skill' && o.discount),
  );
  assert.ok(s);
  const offer = s.offers.find((o) => o.kind === 'skill' && o.discount);
  s.gold = offer.cost;
  assert.equal(g.buy(s, offer.id).state, s);
  assert.ok(g.buy(s, offer.id).error);
  assert.equal(g.buy(s, offer.id, 8).state, s);
  const restored = save(s),
    after = g.buy(restored, offer.id, 1).state;
  assert.equal(after.skills[1], offer.id);
  assert.equal(after.gold, 0);
  assert.equal(after.rng, s.rng);
  assert.deepEqual(g.buy(s, offer.id, 1).state, after);
});

test('old saved shops keep their full prices without retroactively rolling discounts', () => {
  const s = shopAt(10);
  for (const o of s.offers) {
    o.cost = o.baseCost ?? o.cost;
    delete o.baseCost;
    delete o.discount;
  }
  const loaded = save(s);
  assert.deepEqual(loaded, s);
  assert.ok(!loaded.offers.some((o) => o.discount));
  assert.match(merchantGreeting(loaded.seed, false), /обычной цене/);
});

test('full map exposes exactly the legal next rooms and one boss per biome', () => {
  for (let depth = 1; depth <= 20; depth++) {
    const s = g.startRun(42);
    s.room = depth;
    s.phase = 'map';
    s.path = Array.from(
      { length: depth },
      (_, i) => g.roomsAtDepth(i + 1)[0].name,
    );
    const snapshot = JSON.stringify(s),
      nodes = g.routeMap(s).flat();
    assert.equal(g.routeMap(s).length, 20);
    assert.equal(nodes.filter((n) => n.status === 'current').length, 1);
    assert.equal(nodes.filter((n) => n.status === 'visited').length, depth - 1);
    assert.deepEqual(
      nodes.filter((n) => n.status === 'available').map((n) => n.id),
      g.nextRooms(s).map((n) => n.id),
    );
    assert.deepEqual(
      nodes.filter((n) => n.kind === 'boss').map((n) => [n.depth, n.id]),
      [
        [10, '10-boss'],
        [20, '20-boss'],
      ],
    );
    for (const node of nodes.filter((n) => n.status !== 'available'))
      assert.equal(g.enterRoom(s, node.id).state, s);
    assert.equal(JSON.stringify(s), snapshot);
    assert.deepEqual(g.routeMap(save(s)), g.routeMap(s));
  }
  assert.deepEqual(g.roomsAtDepth(0), []);
  assert.deepEqual(g.roomsAtDepth(21), []);
});

test('a won fight offers rewards first, then opens its real next map choices, with no repeat entry', () => {
  const battle = g.startRun(42);
  battle.enemies[0].hp = 1;
  battle.energy = 6;
  assert.ok(g.canCast(battle, 'bolt'));
  const reward = g.castSkill(battle, 'bolt').state;
  assert.equal(reward.phase, 'reward');
  assert.equal(
    g
      .routeMap(reward)
      .flat()
      .filter((n) => n.status === 'available').length,
    0,
  );
  assert.ok(g.enterRoom(reward, '2-battle').error);
  const map = g.chooseReward(reward, null).state;
  assert.equal(map.phase, 'map');
  const battle2 = g.enterRoom(map, '2-armored').state;
  assert.equal(battle2.phase, 'battle');
  assert.equal(battle2.room, 2);
  assert.equal(battle2.path[1], 'Скреплённый проход');
  assert.equal(g.enterRoom(battle2, '2-armored').state, battle2);
  const secondRow = g.routeMap(battle2)[1];
  assert.equal(secondRow.find((n) => n.id === '2-armored').status, 'current');
  assert.equal(secondRow.find((n) => n.id === '2-battle').status, 'skipped');
});

test('old named paths remain visible and cannot become extra enterable rooms', () => {
  const s = g.startRun(42);
  s.phase = 'map';
  s.room = 2;
  s.path.push('Старая галерея');
  const row = g.routeMap(s)[1];
  assert.equal(row.filter((n) => n.status === 'current').length, 1);
  assert.equal(row.find((n) => n.status === 'current').name, 'Старая галерея');
  assert.ok(g.enterRoom(s, '2-legacy').error);
  s.room = 10;
  s.phase = 'victory';
  s.path = Array.from({ length: 10 }, (_, i) => g.roomsAtDepth(i + 1)[0].name);
  assert.equal(
    g
      .routeMap(s)
      .flat()
      .filter((n) => n.status === 'available').length,
    0,
  );
  assert.equal(g.routeMap(s)[9][0].status, 'visited');
});

test('seed accepts zero and the full unsigned range; invalid input cannot silently wrap', () => {
  for (const input of ['0', '00042', '19062026', '4294967295'])
    assert.ok(isValidSeed(input));
  for (const input of [
    '',
    '-1',
    '1.2',
    '4294967296',
    '9999999999',
    'hello',
    '1e3',
    'Infinity',
    ' 42',
  ])
    assert.ok(!isValidSeed(input));
  for (const seed of [0, 42, 4294967295]) {
    const s = g.startRun(seed);
    assert.equal(s.seed, seed);
    assert.deepEqual(g.startRun(seed), save(s));
    const m = g.validMoves(s.board)[0];
    assert.deepEqual(
      g.move(s, m.axis, m.line, m.amount),
      g.move(save(s), m.axis, m.line, m.amount),
    );
    assert.deepEqual(shopAt(seed), save(shopAt(seed)));
  }
});

test('merchant conversations and purchases quote actual terms without consuming run randomness', () => {
  const s = shopAt(5),
    before = JSON.stringify(s);
  assert.equal(MERCHANT_TOPICS.length, 3);
  assert.equal(new Set(MERCHANT_TOPICS.map((x) => x.answer)).size, 3);
  for (let i = 0; i < 5; i++) {
    assert.equal(merchantGreeting(s.seed), merchantGreeting(save(s).seed));
    for (const o of s.offers) {
      const line = merchantPurchase(o);
      assert.ok(line.includes(o.name));
      assert.ok(line.includes(String(o.cost)));
      if (o.discount) assert.ok(line.includes(String(o.baseCost)));
    }
    g.routeMap(s);
  }
  assert.equal(JSON.stringify(s), before);
});

test('fifteen distinct locations are tied to room depth and survive alternate routes and save/resume', () => {
  assert.equal(ROOM_BACKGROUNDS.length, 20);
  assert.equal(new Set(ROOM_BACKGROUNDS.map((r) => r.src)).size, 15);
  assert.equal(roomBackground(1).id, 'entrance');
  assert.equal(roomBackground(5).id, 'market');
  assert.equal(roomBackground(9).id, 'campfire');
  assert.equal(roomBackground(10).id, 'throne');
  for (let depth = 2; depth <= 20; depth++) {
    const s = g.startRun(42);
    s.phase = 'map';
    s.room = depth - 1;
    for (const room of g.nextRooms(s)) {
      const after = g.enterRoom(s, room.id).state;
      assert.equal(roomBackground(after.room), ROOM_BACKGROUNDS[depth - 1]);
      assert.deepEqual(
        roomBackground(after.room),
        roomBackground(save(after).room),
      );
    }
  }
});

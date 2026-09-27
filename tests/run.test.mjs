import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newRun, saveRun, loadRun, PRICE_ACT, rerollPrice } from '../game/run.ts';
import { ITEMS } from '../game/content/items.ts';
import { armorCap, energyCap } from '../game/combat.ts';
import { GEAR_PRICE } from '../game/content/gear.ts';
import { reachable } from '../game/actmap.ts';
import { playRun } from '../game/bot.ts';
import { EVENTS } from '../game/content/events.ts';
import { ACTS } from '../game/content/acts.ts';

test('dev hero op keeps energy and armour within their caps', () => {
  const { run } = newRun({ seed: 3, customSeed: true });
  const r = dispatch(run, { type: 'dev', op: { op: 'hero', charge: 99, armor: 99 } }).run;
  assert.equal(r.hero.charge, energyCap(r));
  assert.equal(r.hero.armor, armorCap(r));
});

test('a new run: only the plain items, one per colour, map of the first act', () => {
  const { run } = newRun({ seed: 1 });
  assert.deepEqual(run.hero.gear, { blade: ['knife'], shield: ['shield'], ink: ['battery'], coin: ['penny'] });
  assert.deepEqual(run.hero.equip, { blade: 'knife', shield: 'shield', ink: 'battery', coin: 'penny' });
  assert.deepEqual([run.hero.ups, run.hero.tape], [[], 0]);
  assert.deepEqual(run.hero.relics, ['badge']);
  assert.ok(!run.gearPool.some((id) => ['knife', 'shield', 'battery', 'penny'].includes(id)), 'простые вещи в награды не попадают');
  assert.equal(run.hero.hp, 8, '4 сердца');
  assert.equal(run.phase, 'map');
  assert.ok(reachable(run.map, -1).length >= 2, 'several ways to start');
  const boss = run.map.nodes[run.map.boss];
  assert.equal(boss.kind, 'boss');
  assert.ok(run.map.nodes.filter((n) => n.row === 5).every((n) => n.kind === 'treasure'));
  assert.ok(run.map.nodes.filter((n) => n.row === 9).every((n) => n.kind === 'rest'));
  assert.ok(run.map.nodes.filter((n) => n.row === 0).every((n) => n.kind === 'fight'));
});

test('the intro run starts with the paper stack', () => {
  const { run } = newRun({ seed: 2, intro: true });
  assert.equal(run.phase, 'combat');
  assert.equal(run.combat.kind, 'intro');
  assert.equal(run.combat.enemies[0].def, 'kipa');
});

test('maps are deterministic per seed and every path reaches the boss', () => {
  const a = newRun({ seed: 7 }).run.map;
  const b = newRun({ seed: 7 }).run.map;
  assert.deepEqual(a, b);
  const seen = new Set();
  const stack = reachable(a, -1);
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...a.nodes[id].next);
  }
  assert.ok(seen.has(a.boss));
  for (const n of a.nodes) if (n.kind !== 'boss') assert.ok(n.next.length > 0, 'no dead ends');
});

test('travel goes only to reachable nodes and starts a fight', () => {
  const { run } = newRun({ seed: 3 });
  const far = run.map.nodes.find((n) => n.row === 3);
  assert.ok(dispatch(run, { type: 'travel', node: far.id }).events.some((e) => e.t === 'invalid'));
  const first = reachable(run.map, -1)[0];
  const res = dispatch(run, { type: 'travel', node: first });
  assert.equal(res.run.phase, 'combat');
  assert.equal(res.run.node, first);
  assert.ok(res.run.map.nodes[first].visited);
});

/** A plain fight of the first act won at once: its rewards. */
function fightRewards(seed) {
  const { run } = newRun({ seed });
  const r = dispatch(run, { type: 'travel', node: reachable(run.map, -1)[0] }).run;
  r.combat.enemies = r.combat.enemies.slice(0, 1);
  r.combat.enemies[0].hp = 1;
  return playUntilWon(r);
}

test('things are short: a plain fight pays coins half the time and offers gear now and then', () => {
  const all = Array.from({ length: 40 }, (_, k) => fightRewards(100 + k));
  const coins = all.map((r) => r.rewards.find((x) => x.kind === 'coins')).filter(Boolean);
  const gear = all.map((r) => r.rewards.find((x) => x.kind === 'gear')).filter(Boolean);
  assert.ok(coins.length >= 10 && coins.length <= 30, `монеты в ${coins.length} боях из 40`);
  assert.ok(coins.every((x) => x.amount >= 4 && x.amount <= 8), 'по 4–8 монет');
  assert.ok(gear.length >= 8 && gear.length <= 26, `вещи в ${gear.length} боях из 40`);
  assert.ok(gear.every((x) => x.gear.length === 2 && new Set(x.gear).size === 2), 'две разные вещи на выбор');
});

test('winning a fight: the chosen item of gear goes straight into hand, the old one stays a spare', () => {
  let res = fightRewards(4);
  for (let seed = 5; !res.rewards.some((x) => x.kind === 'gear'); seed++) res = fightRewards(seed);
  assert.equal(res.phase, 'reward');
  const row = res.rewards.find((x) => x.kind === 'gear');
  const id = row.gear[1];
  const fam = ITEMS[id].gear.fam;
  const took = dispatch(res, { type: 'reward', index: res.rewards.indexOf(row), pick: 1 }).run;
  assert.deepEqual(took.hero.gear[fam], [res.hero.gear[fam][0], id]);
  assert.equal(took.hero.equip[fam], id);
  assert.ok(!took.gearPool.includes(id), 'взятая вещь больше не выпадает');
  assert.equal(dispatch(took, { type: 'leave' }).run.phase, 'map');
});

test('an upgrade row is taken only when an item is chosen', () => {
  const { run } = newRun({ seed: 4 });
  run.phase = 'reward';
  run.rewards = [{ kind: 'upgrade' }];
  const pick = dispatch(run, { type: 'reward', index: 0 }).run;
  assert.equal(pick.phase, 'pick');
  const back = dispatch(pick, { type: 'leave' }).run;
  assert.deepEqual([back.phase, back.rewards[0].taken], ['reward', undefined], 'отмена оставляет награду');
  const done = dispatch(pick, { type: 'pick', id: 'knife' }).run;
  assert.deepEqual([done.phase, done.rewards[0].taken, done.hero.ups], ['reward', true, ['knife']]);
});

function playUntilWon(run) {
  let r = run;
  for (let k = 0; k < 200 && r.phase === 'combat'; k++) {
    const res = playRun(r, { policy: 'greedy', seed: 1 }, 1);
    void res;
    const moves = [];
    for (let i = 0; i < 36; i++) for (const j of [i + 1, i + 6]) if (j < 36 && (j !== i + 1 || i % 6 !== 5)) moves.push({ from: i, to: j });
    for (const m of moves) {
      const next = dispatch(r, { type: 'move', move: m });
      if (!next.events.some((e) => e.t === 'invalid')) {
        r = next.run;
        break;
      }
    }
  }
  return r;
}

test('the till sells gear, the workshop upgrades an item, the shredder takes red tape', () => {
  const s = newRun({ seed: 5 }).run;
  s.hero.coins = 500;
  s.hero.tape = 1;
  s.phase = 'shop';
  s.shop = { gear: [{ id: 'binder', price: 70, sold: false }], relics: [], pockets: [], upgrade: { price: 50, sold: false }, shred: { price: 40, used: false }, rerolls: 0 };
  const bought = dispatch(s, { type: 'buy', kind: 'gear', index: 0 }).run;
  assert.equal(bought.hero.coins, 430);
  assert.deepEqual([bought.hero.gear.shield, bought.hero.equip.shield], [['shield', 'binder'], 'binder']);
  const picking = dispatch(bought, { type: 'buy', kind: 'upgrade', index: 0 }).run;
  assert.equal(picking.phase, 'pick');
  assert.equal(picking.hero.coins, 430, 'платят, когда выбрали');
  const upgraded = dispatch(picking, { type: 'pick', id: 'binder' }).run;
  assert.deepEqual([upgraded.phase, upgraded.hero.ups, upgraded.hero.coins, upgraded.shop.upgrade.sold], ['shop', ['binder'], 380, true]);
  const shredded = dispatch(upgraded, { type: 'remove' }).run;
  assert.deepEqual([shredded.hero.tape, shredded.hero.coins, shredded.shreds], [0, 340, 1]);
  assert.ok(dispatch(shredded, { type: 'remove' }).events.some((e) => e.t === 'invalid'), 'шредер один раз');
});

test('a pick takes only gear that fits it: an upgraded item is not upgraded again', () => {
  const { run } = newRun({ seed: 6 });
  run.hero.ups = ['knife'];
  run.phase = 'pick';
  run.pick = { purpose: 'upgrade', count: 1, from: 'map' };
  assert.equal(dispatch(run, { type: 'pick', id: 'knife' }).events.find((e) => e.t === 'invalid')?.reason, 'Эту вещь нельзя');
  assert.equal(dispatch(run, { type: 'pick', id: 'scissors' }).events.find((e) => e.t === 'invalid')?.reason, 'Эту вещь нельзя', 'не своя вещь');
  // A trade: another item of the colour, held if the old one was.
  run.pick = { purpose: 'transform', count: 1, from: 'map' };
  const traded = dispatch(run, { type: 'pick', id: 'shield' }).run;
  assert.equal(traded.hero.gear.shield.length, 1);
  assert.notEqual(traded.hero.gear.shield[0], 'shield');
  assert.equal(traded.hero.equip.shield, traded.hero.gear.shield[0]);
  assert.equal(ITEMS[traded.hero.equip.shield].gear.fam, 'shield');
});

test('the cooler heals 30% or upgrades an item', () => {
  const { run } = newRun({ seed: 8 });
  run.phase = 'rest';
  run.hero.hp = 2;
  assert.equal(dispatch(run, { type: 'rest', choice: 'heal' }).run.hero.hp, 4, '30% от 4 сердец — сердце');
  const pick = dispatch(run, { type: 'rest', choice: 'upgrade' }).run;
  assert.equal(pick.phase, 'pick');
  const up = dispatch(pick, { type: 'pick', id: 'shield' }).run;
  assert.deepEqual(up.hero.ups, ['shield']);
  assert.equal(up.phase, 'map');
  assert.equal(dispatch(pick, { type: 'leave' }).run.phase, 'rest', 'cancel returns to the cooler');
});

test('every event option resolves without errors', () => {
  for (const def of EVENTS)
    def.options.forEach((_, k) => {
      const { run } = newRun({ seed: 11 });
      run.hero.coins = 100;
      run.hero.tape = 1;
      run.phase = 'event';
      run.event = { id: def.id };
      assert.equal(def.options[k].locked?.(run) ?? null, null, `${def.id}#${k} закрыт у нового героя`);
      const res = dispatch(run, { type: 'event', option: k });
      assert.ok(!res.events.some((e) => e.t === 'invalid'), `${def.id}#${k}`);
      assert.equal(typeof res.run.event.result, 'string');
      assert.ok(['event', 'pick', 'combat'].includes(res.run.phase), `${def.id}#${k} → ${res.run.phase}`);
      assert.ok(res.run.hero.hp >= 1);
    });
});

test('beating a boss offers a boss relic and opens the next act', () => {
  const { run } = newRun({ seed: 12 });
  const boss = run.map.nodes[run.map.boss];
  run.node = boss.id;
  run.phase = 'reward';
  run.rewards = [];
  const chooser = dispatch(run, { type: 'leave' }).run;
  assert.equal(chooser.phase, 'bossReward');
  assert.equal(chooser.bossRelics.length, 3);
  const next = dispatch(chooser, { type: 'bossRelic', index: 0 }).run;
  assert.equal(next.act, 1);
  assert.equal(next.phase, 'map');
  assert.ok(next.hero.relics.includes(chooser.bossRelics[0]));
  assert.equal(ACTS[next.act].id, 'archive');
});

test('save and load round-trip', () => {
  const { run } = newRun({ seed: 13, intro: true });
  assert.deepEqual(loadRun(saveRun(run)), run);
  assert.equal(loadRun('{"rules":"old","run":{}}'), null);
});

test('bots finish whole runs without errors', () => {
  for (const seed of [1, 2, 3]) {
    const res = playRun(newRun({ seed, intro: true }).run, { policy: 'greedy', seed });
    assert.ok(res.won || res.cause, 'the run ended');
    assert.ok(res.fights.length >= 3);
  }
});

test('the till can be reprinted: new stock, unsold items back to the pool, a rising price', () => {
  let { run } = newRun({ seed: 31, customSeed: true });
  run = dispatch(run, { type: 'dev', op: { op: 'hero', coins: 500 } }).run;
  run = dispatch(run, { type: 'dev', op: { op: 'enter', kind: 'shop' } }).run;
  const first = run.shop;
  const shown = first.relics.filter((r) => ITEMS[r.id].kind === 'passive').map((r) => r.id);
  for (const id of shown) assert.ok(!run.relicPool.includes(id), 'выставленный предмет вынут из пула');
  assert.equal(rerollPrice(run), 20);
  const res = dispatch(run, { type: 'reroll' });
  assert.ok(!res.events.some((e) => e.t === 'invalid'));
  assert.equal(res.run.hero.coins, 480);
  assert.equal(res.run.shop.rerolls, 1);
  assert.equal(rerollPrice(res.run), 40, 'каждый раз дороже');
  assert.deepEqual(res.run.shop.shred, first.shred, 'шредер тот же');
  for (const id of shown) assert.ok(res.run.relicPool.includes(id) || res.run.shop.relics.some((r) => r.id === id), 'непроданное вернулось в пул');
  assert.notDeepEqual(
    res.run.shop.gear.map((c) => c.id),
    first.gear.map((c) => c.id),
  );
  const broke = dispatch(dispatch(res.run, { type: 'dev', op: { op: 'hero', coins: 10 } }).run, { type: 'reroll' });
  assert.ok(broke.events.some((e) => e.t === 'invalid'), 'без денег не перепечатать');
});

test('prices at the till grow from act to act', () => {
  const shopAt = (act) => {
    let { run } = newRun({ seed: 32, customSeed: true });
    run = dispatch(run, { type: 'dev', op: { op: 'act', act } }).run;
    run = dispatch(run, { type: 'dev', op: { op: 'build', tape: 1 } }).run;
    return dispatch(run, { type: 'dev', op: { op: 'enter', kind: 'shop' } }).run;
  };
  const a0 = shopAt(0);
  const a2 = shopAt(2);
  assert.equal(a0.shop.shred.price, 40);
  assert.equal(a2.shop.shred.price, Math.round(40 * PRICE_ACT[2]));
  assert.equal(rerollPrice(a2), Math.round(20 * PRICE_ACT[2]));
  const lo = (run) => Math.min(...run.shop.gear.map((c) => c.price));
  assert.ok(lo(a2) >= Math.round(GEAR_PRICE.common * 0.5 * 0.9 * PRICE_ACT[2]) - 1, 'вещи дороже');
});

test('without red tape the till has no shredder', () => {
  let { run } = newRun({ seed: 33, customSeed: true });
  run = dispatch(run, { type: 'dev', op: { op: 'enter', kind: 'shop' } }).run;
  assert.equal(run.shop.shred, null);
  assert.equal(dispatch(run, { type: 'remove' }).events.find((e) => e.t === 'invalid')?.reason, 'Шредер уже занят');
});

test('gear: a new item goes into hand; a colour with three items is not sold a fourth', () => {
  const { run } = newRun({ seed: 5 });
  run.hero.coins = 500;
  run.phase = 'shop';
  run.shop = { gear: [{ id: 'scissors', price: 100, sold: false }, { id: 'awl', price: 100, sold: false }, { id: 'ruler', price: 100, sold: false }], relics: [], pockets: [], upgrade: null, shred: null, rerolls: 0 };
  let s = dispatch(run, { type: 'buy', kind: 'gear', index: 0 }).run;
  assert.deepEqual([s.hero.gear.blade, s.hero.equip.blade], [['knife', 'scissors'], 'scissors'], 'новая вещь — сразу в руке');
  s = dispatch(s, { type: 'buy', kind: 'gear', index: 1 }).run;
  const full = dispatch(s, { type: 'buy', kind: 'gear', index: 2 });
  assert.equal(full.events.find((e) => e.t === 'invalid')?.reason, 'Руки заняты: вещей цвета не больше 3');
  assert.equal(full.run.hero.coins, s.hero.coins, 'монеты не списаны');
});

test('rewards and the till never offer an item for a full colour, nor one already carried', () => {
  const { run } = newRun({ seed: 9, customSeed: true });
  run.hero.gear.blade = ['knife', 'scissors', 'awl'];
  let r = dispatch(run, { type: 'dev', op: { op: 'enter', kind: 'shop' } }).run;
  for (let k = 0; k < 10; k++) {
    assert.ok(r.shop.gear.every((g) => ITEMS[g.id].gear.fam !== 'blade'), 'красные руки полны');
    r = dispatch(dispatch(r, { type: 'dev', op: { op: 'hero', coins: 999 } }).run, { type: 'reroll' }).run;
  }
});

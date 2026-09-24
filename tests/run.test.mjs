import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newRun, saveRun, loadRun, MIN_DECK } from '../game/run.ts';
import { reachable } from '../game/actmap.ts';
import { playRun } from '../game/bot.ts';
import { EVENTS } from '../game/content/events.ts';
import { ACTS } from '../game/content/acts.ts';

test('a new run: starter deck, knife, map of the first act', () => {
  const { run } = newRun({ seed: 1 });
  assert.equal(run.hero.deck.length, 12);
  assert.deepEqual(run.hero.relics, ['knife']);
  assert.equal(run.hero.hp, 60);
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

test('winning a fight gives coins and a choice of three cards', () => {
  const { run } = newRun({ seed: 4 });
  const r = dispatch(run, { type: 'travel', node: reachable(run.map, -1)[0] }).run;
  for (const e of r.combat.enemies) e.hp = 1;
  r.combat.enemies[0].hp = 1;
  // Kill with a guaranteed hit: set a blade line ready to swap.
  r.combat.enemies = r.combat.enemies.slice(0, 1);
  r.combat.board.cells = r.combat.board.cells.map((t) => ({ ...t }));
  const res = playUntilWon(r);
  assert.equal(res.phase, 'reward');
  const coins = res.rewards.find((x) => x.kind === 'coins');
  const card = res.rewards.find((x) => x.kind === 'card');
  assert.ok(coins.amount >= 10);
  assert.equal(card.cards.length, 3);
  const before = res.hero.deck.length;
  const took = dispatch(res, { type: 'reward', index: res.rewards.indexOf(card), card: 1 }).run;
  assert.equal(took.hero.deck.length, before + 1);
  assert.equal(took.hero.deck.at(-1).id, card.cards[1]);
  assert.equal(dispatch(took, { type: 'leave' }).run.phase, 'map');
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

test('the till sells cards and removes one for a rising price', () => {
  const { run } = newRun({ seed: 5 });
  run.phase = 'shop';
  run.hero.coins = 500;
  // Open a shop through a node of that kind.
  const shopNode = run.map.nodes.find((n) => n.kind === 'shop');
  assert.ok(shopNode, 'the map has a till');
  run.node = shopNode.id;
  const opened = dispatch({ ...run, phase: 'map', node: -1 }, { type: 'travel', node: reachable(run.map, -1)[0] });
  void opened;
  // Direct shop test via a synthetic state.
  const s = newRun({ seed: 5 }).run;
  s.hero.coins = 500;
  s.phase = 'shop';
  s.shop = { cards: [{ id: 'scissors', up: false, price: 70, sold: false }], relics: [], pockets: [], finish: { kind: 'sharp', price: 60, sold: false }, removePrice: 50, removed: false };
  const bought = dispatch(s, { type: 'buy', kind: 'card', index: 0 }).run;
  assert.equal(bought.hero.coins, 430);
  assert.equal(bought.hero.deck.at(-1).id, 'scissors');
  const picking = dispatch(bought, { type: 'remove' }).run;
  assert.equal(picking.phase, 'pick');
  const victim = picking.hero.deck.find((c) => c.id === 'clip');
  const removed = dispatch(picking, { type: 'pick', uid: victim.uid }).run;
  assert.equal(removed.phase, 'shop');
  assert.equal(removed.hero.coins, 380);
  assert.equal(removed.hero.deck.length, bought.hero.deck.length - 1);
  assert.equal(removed.removals, 1);
  const finish = dispatch(removed, { type: 'buy', kind: 'finish', index: 0 }).run;
  const target = finish.hero.deck.find((c) => c.id === 'fist');
  const done = dispatch(finish, { type: 'pick', uid: target.uid }).run;
  assert.equal(done.hero.deck.find((c) => c.uid === target.uid).finish, 'sharp');
  assert.equal(done.hero.coins, 320);
});

test('the deck never gets thinner than the minimum', () => {
  const { run } = newRun({ seed: 6 });
  run.hero.deck = run.hero.deck.slice(0, MIN_DECK);
  run.phase = 'pick';
  run.pick = { purpose: 'remove', count: 1, from: 'map' };
  assert.ok(dispatch(run, { type: 'pick', uid: run.hero.deck[0].uid }).events.some((e) => e.t === 'invalid'));
});

test('the cooler heals 30% or upgrades a card', () => {
  const { run } = newRun({ seed: 8 });
  run.phase = 'rest';
  run.hero.hp = 20;
  assert.equal(dispatch(run, { type: 'rest', choice: 'heal' }).run.hero.hp, 38);
  const pick = dispatch(run, { type: 'rest', choice: 'upgrade' }).run;
  assert.equal(pick.phase, 'pick');
  const up = dispatch(pick, { type: 'pick', uid: pick.hero.deck[0].uid }).run;
  assert.equal(up.hero.deck[0].up, true);
  assert.equal(up.phase, 'map');
  assert.equal(dispatch(pick, { type: 'leave' }).run.phase, 'rest', 'cancel returns to the cooler');
});

test('every event option resolves without errors', () => {
  for (const def of EVENTS)
    def.options.forEach((_, k) => {
      const { run } = newRun({ seed: 11 });
      run.hero.coins = 100;
      run.phase = 'event';
      run.event = { id: def.id };
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

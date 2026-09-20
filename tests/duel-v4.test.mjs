import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDuel,
  dispatchDuel,
  saveDuel,
  loadDuel,
  manaCap,
  previewSwapItems,
} from '../game/duel/engine.ts';
import {
  ITEMS,
  COLORS,
  SPELLS,
  RARITIES,
  CLASSES,
} from '../game/duel/catalog.ts';
import {
  freshItems,
  spellPayment,
  itemConnections,
  itemWarnings,
} from '../game/duel/item-rules.ts';
import { findMatches, swapBoard, legalSwaps } from '../game/duel/board.ts';
import { createOffers, LOOT_WEIGHTS, SHOP_WEIGHTS } from '../game/duel/loot.ts';
import { ENCOUNTERS } from '../game/duel/campaign.ts';
import { chooseAction } from '../game/duel/ai.ts';
import * as v3 from '../game/duel/legacy-v3/engine.ts';
import * as oldAI from '../game/duel/legacy-v3/ai.ts';
import * as oldCatalog from '../game/duel/legacy-v3/catalog.ts';

const config = { seed: 707, classId: 'blade', mode: 'duel', foe: 0 };
const start = (patch = {}) => createDuel({ ...config, ...patch });
const step = (s, command) => {
  const result = dispatchDuel(s, command);
  assert.equal(result.error, undefined, JSON.stringify(command));
  return result.state;
};
const gear = (s, ...ids) => {
  s.hero.gear = Object.fromEntries(ids.map((id) => [ITEMS[id].slot, id]));
  return s;
};
const mana = (f, n = 0) => {
  for (const color of COLORS) f.mana[color] = n;
};
function loaded() {
  const s = start();
  for (const f of [s.hero, s.enemy]) {
    f.gear = {};
    f.items = freshItems();
    f.stats = {
      earth: 0,
      fire: 0,
      air: 0,
      water: 0,
      battle: 0,
      cunning: 0,
      morale: 0,
    };
    f.hp = f.maxHp = 1000;
    f.spells = Object.keys(SPELLS);
    mana(f);
  }
  s.rng.effect = 0; // First luck roll fails: the fixture measures the item, not luck.
  return s;
}
// Find a legal, isolated match on a real generated board. No random refill is mocked.
function fixture(kind, n = 3, { edge = false, vertical = false } = {}) {
  for (let seed = 0; seed < 400; seed++) {
    const s = loaded();
    s.board = start({ seed }).board;
    s.rng.board = seed;
    const cells = Array.from({ length: n }, (_, i) =>
      vertical ? (2 + i) * 8 + 3 : 24 + (edge ? 0 : 2) + i,
    );
    for (const i of cells) s.board[i] = { kind };
    const a = cells[Math.floor(n / 2)],
      b = a + (vertical ? 1 : 8);
    s.board[a] = { kind: kind === 'earth' ? 'water' : 'earth' };
    s.board[b] = { kind };
    const command = { type: 'swap', a, b };
    const groups = findMatches(swapBoard(s.board, command));
    if (
      findMatches(s.board).length ||
      groups.length !== 1 ||
      groups[0].cells.length !== n
    )
      continue;
    const r = dispatchDuel(s, command);
    if (r.frames.length === 1) return { s, command, cells };
  }
  throw Error(`No isolated fixture for ${kind}/${n}`);
}
function repeat(s, f, side = 'hero') {
  s.actor = side;
  s.board = structuredClone(f.s.board);
  s.rng.board = f.s.rng.board;
  s.rng.effect = 0;
  return step(s, f.command);
}
const prng = (seed) => () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

test('v4 catalog retains Common foundation and fits all new items into four legal slots', () => {
  assert.equal(start().version, 4);
  assert.equal(Object.keys(ITEMS).length, 60);
  assert.deepEqual(
    RARITIES.map(
      (r) => Object.values(ITEMS).filter((i) => i.rarity === r).length,
    ),
    [12, 16, 17, 9, 6],
  );
  assert.deepEqual(
    ['weapon', 'armor', 'charm', 'ring'].map(
      (slot) => Object.values(ITEMS).filter((i) => i.slot === slot).length,
    ),
    [14, 14, 16, 16],
  );
  for (const id of Object.keys(CLASSES))
    assert.deepEqual(
      start({ classId: id }).hero.gear,
      v3.createDuel({ ...config, classId: id }).hero.gear,
    );
  for (const id of Object.keys(ITEMS).filter((id) => !oldCatalog.ITEMS[id]))
    assert.equal(start({ testGear: [id] }).hero.gear[ITEMS[id].slot], id);
  assert.throws(() => start({ testGear: ['openRing', 'yieldRing'] }));
});

test('open ring is a real loss of capacity with no spell discount, and equipment changes do not simulate overflow', () => {
  const s = gear(loaded(), 'overflowRobe');
  mana(s.hero, 20);
  const before = spellPayment(s.hero, 'bolt');
  s.phase = 'camp';
  s.offers = ['openRing'];
  s.rewarded = false;
  const n = step(s, { type: 'reward', item: 'openRing' });
  for (const c of COLORS) {
    assert.equal(manaCap(n.hero, c), 14);
    assert.equal(n.hero.mana[c], 14);
  }
  assert.equal(n.hero.items.barrier, 0);
  assert.deepEqual(spellPayment(n.hero, 'bolt'), before);
  n.offers = ['fireSeal'];
  n.rewarded = false;
  const restored = step(n, { type: 'reward', item: 'fireSeal' });
  assert.equal(manaCap(restored.hero, 'water'), 20);
  assert.equal(restored.hero.mana.water, 14);
  gear(restored, 'openRing', 'reservoir');
  assert.equal(manaCap(restored.hero, 'water'), 22);
  for (const spell of Object.values(SPELLS))
    for (const c of COLORS) assert.ok((spell.cost[c] ?? 0) <= 14, spell.name);
});

test('open ring lowers real full-blade and overflow thresholds without granting either benefit on its own', () => {
  const skulls = fixture('skull');
  for (const [ids, damage, remaining] of [
    [['fullBlade'], 3, 14],
    [['fullBlade', 'openRing'], 7, 12],
  ]) {
    const s = gear(structuredClone(skulls.s), ...ids);
    s.hero.mana.water = 14;
    const n = step(s, skulls.command);
    assert.equal(1000 - n.enemy.hp, damage);
    assert.equal(n.hero.mana.water, remaining);
  }
  const water = fixture('water');
  for (const [ids, barrier, reserve] of [
    [['overflowRobe'], 0, 17],
    [['overflowRobe', 'openRing'], 3, 14],
    [['openRing'], 0, 14],
  ]) {
    const s = gear(structuredClone(water.s), ...ids);
    s.hero.mana.water = 14;
    const n = step(s, water.command);
    assert.equal(n.hero.items.barrier, barrier);
    assert.equal(n.hero.mana.water, reserve);
  }
});

test('dull punch exchanges only base triple damage and preserves physical, charged and retaliation bonuses', () => {
  const f = fixture('skull');
  const s = gear(f.s, 'dullPunch', 'answerCloak', 'ledger', 'fireSeal');
  s.hero.items.answer = true;
  s.hero.items.ledgerReady = true;
  s.hero.stats.battle = 4;
  const base = structuredClone(s);
  delete base.hero.gear.weapon;
  const plain = step(base, f.command),
    changed = step(s, f.command);
  assert.equal(plain.enemy.hp + 2, changed.enemy.hp);
  assert.equal(changed.hero.items.barrier, 2);
  assert.equal(changed.hero.mana.fire, 2);
  assert.equal(changed.hero.items.answer, false);
  assert.equal(changed.hero.items.ledgerReady, false);
  s.hero.items.barrier = 6;
  assert.equal(
    step(s, f.command).enemy.hp,
    step(
      {
        ...base,
        hero: { ...base.hero, items: { ...base.hero.items, barrier: 6 } },
      },
      f.command,
    ).enemy.hp,
  );
  const four = fixture('skull', 4);
  gear(four.s, 'dullPunch');
  assert.equal(step(four.s, four.command).enemy.hp, 996);
  assert.equal(step(four.s, four.command).hero.items.barrier, 0);
});

test('dull punch ignores directly collected skulls and explosive triples', () => {
  const f = fixture('skull');
  gear(f.s, 'dullPunch');
  mana(f.s.hero, 20);
  const ordinary = structuredClone(f.s);
  ordinary.hero.gear = {};
  const command = { type: 'cast', spell: 'slice', target: 26 };
  assert.equal(step(f.s, command).enemy.hp, step(ordinary, command).enemy.hp);
  f.s.board[f.cells[0]].power = 5;
  const noPunch = structuredClone(f.s);
  noPunch.hero.gear = {};
  const preview = previewSwapItems(f.s, f.command.a, f.command.b);
  const baseline = previewSwapItems(noPunch, f.command.a, f.command.b);
  assert.equal(preview.damage, baseline.damage);
  assert.equal(preview.barrier, 0);
});

test('audit pencil destroys enemy mana for one real mana, respects empty reserves and stun does not reset its series', () => {
  const f = fixture('water', 4),
    s = gear(f.s, 'auditPencil');
  s.enemy.mana.water = 5;
  const n = step(s, f.command);
  assert.equal(n.hero.mana.water, 3);
  assert.equal(n.enemy.mana.water, 3);
  const p = repeat(n, f);
  assert.equal(p.hero.mana.water, 7);
  assert.equal(p.enemy.mana.water, 3);
  const t = fixture('water');
  gear(t.s, 'auditPencil');
  t.s.enemy.stunned = 1;
  t.s.enemy.mana.water = 5;
  const u = step(t.s, t.command);
  assert.equal(u.actor, 'hero');
  const v = repeat(u, t);
  assert.equal(v.enemy.mana.water, 3);
  const empty = fixture('water');
  gear(empty.s, 'auditPencil');
  assert.equal(step(empty.s, empty.command).hero.mana.water, 3);
  assert.equal(
    step(empty.s, empty.command).hero.items.initiative.auditPencil,
    undefined,
  );
});

test('edge sleeves require visible edge geometry and full room for three barrier', () => {
  for (const [edge, shield, expectedMana, expectedShield] of [
    [true, 0, 2, 3],
    [false, 0, 3, 0],
    [true, 4, 3, 4],
    [true, 3, 2, 6],
  ]) {
    const f = fixture('water', 3, { edge });
    gear(f.s, 'edgeSleeves');
    f.s.hero.items.barrier = shield;
    const n = step(f.s, f.command);
    assert.equal(n.hero.mana.water, expectedMana);
    assert.equal(n.hero.items.barrier, expectedShield);
  }
});

test('agreement sheet pays for real water, retains a falling earth tile and rejects wild or long groups', () => {
  const f = fixture('water', 3, { vertical: true });
  gear(f.s, 'agreementSheet', 'cottonCuffs');
  f.s.hero.hp = 990;
  const r = dispatchDuel(f.s, f.command);
  assert.equal(r.state.hero.hp, 991);
  assert.equal(r.state.hero.items.initiative.agreementSheet, true);
  assert.equal(r.frames[0].after[f.cells[2]].kind, 'earth');
  assert.equal(r.state.hero.mana.water, 2);
  for (const n of [3, 4]) {
    const x = fixture('water', n);
    gear(x.s, 'agreementSheet');
    if (n === 3) x.s.board[x.cells[0]] = { kind: 'wild' };
    const after = step(x.s, x.command);
    assert.equal(after.hero.items.initiative.agreementSheet, undefined);
  }
});

test('four-slot redirects spend each mana once and leave physical water triggers separate', () => {
  const f = fixture('water', 3, { edge: true });
  gear(f.s, 'auditPencil', 'edgeSleeves', 'agreementSheet', 'shiftRing');
  f.s.hero.items.shiftColor = 'earth';
  f.s.enemy.mana.water = 10;
  const n = step(f.s, f.command);
  assert.equal(n.hero.mana.water, 0);
  assert.equal(n.hero.mana.earth, 0);
  assert.equal(n.enemy.mana.water, 8);
  assert.equal(n.hero.items.barrier, 3);
  assert.equal(n.hero.items.shiftColor, 'water');
});

test('exchange coupon moves existing mana without spending coins or inventing mana', () => {
  const f = fixture('gold');
  gear(f.s, 'exchangeCoupon');
  Object.assign(f.s.hero.mana, { earth: 0, fire: 10, air: 10, water: 18 });
  const n = step(f.s, f.command);
  assert.deepEqual(n.hero.mana, { earth: 2, fire: 10, air: 10, water: 16 });
  assert.equal(n.hero.gold, 3);
  mana(f.s.hero, 5);
  assert.deepEqual(step(f.s, f.command).hero.mana, f.s.hero.mana);
  Object.assign(f.s.hero.mana, { earth: 19, fire: 20, air: 20, water: 20 });
  assert.deepEqual(step(f.s, f.command).hero.mana, f.s.hero.mana);
});

test('shift ring remembers through enemy actions, clears on a cast and its gifted water is not physical healing', () => {
  const water = fixture('water'),
    air = fixture('air');
  gear(water.s, 'shiftRing', 'cottonCuffs');
  water.s.hero.hp = 990;
  const n = step(water.s, water.command);
  assert.equal(n.hero.items.shiftColor, 'water');
  mana(n.enemy, 20);
  n.enemy.hp = 990;
  const p = step(n, { type: 'cast', spell: 'mend' });
  assert.equal(p.hero.items.shiftColor, 'water');
  const q = repeat(p, air);
  assert.equal(q.hero.mana.water, 4);
  assert.equal(q.hero.mana.air, 2);
  assert.equal(q.hero.hp, 991);
  assert.equal(q.hero.items.shiftColor, 'air');
  q.actor = 'hero';
  mana(q.hero, 20);
  assert.equal(
    step(q, { type: 'cast', spell: 'mend' }).hero.items.shiftColor,
    null,
  );
  const bad = structuredClone(q);
  assert.ok(dispatchDuel(q, { type: 'swap', a: 0, b: 63 }).error);
  assert.deepEqual(q, bad);
});

test('safety magnet defuses the first surviving shared threat, including a wildcard-powered air match', () => {
  for (const wild of [false, true]) {
    const f = fixture('air');
    gear(f.s, 'safetyMagnet');
    f.s.board[62] = { kind: 'skull', power: 5 };
    f.s.board[63] = { kind: 'skull', power: 5 };
    if (wild) f.s.board[f.cells[0]] = { kind: 'wild' };
    const r = dispatchDuel(f.s, f.command);
    assert.equal(r.state.hero.items.initiative.safetyMagnet, true);
    assert.equal(r.frames[0].after[62].power, undefined);
    assert.equal(r.frames[0].after[63].power, 5);
  }
  const none = fixture('air');
  gear(none.s, 'safetyMagnet');
  assert.equal(
    step(none.s, none.command).hero.items.initiative.safetyMagnet,
    undefined,
  );
});

test('reserve lining pays once after barrier, before wall, from a sufficient reserve and open ring lowers its threshold', () => {
  for (const [ring, reserve, expectedHp, remaining] of [
    [false, 12, 990, 12],
    [false, 13, 994, 10],
    [true, 10, 994, 7],
  ]) {
    const s = gear(loaded(), 'reserveLining', ...(ring ? ['openRing'] : []));
    s.actor = 'enemy';
    mana(s.enemy, 20);
    s.hero.mana.earth = reserve;
    const n = step(s, { type: 'cast', spell: 'bolt' });
    assert.equal(n.hero.hp, expectedHp);
    assert.equal(n.hero.mana.earth, remaining);
  }
  const s = gear(loaded(), 'reserveLining');
  s.actor = 'enemy';
  mana(s.enemy, 20);
  s.hero.mana.earth = 13;
  s.hero.items.barrier = 6;
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 1000);
  assert.equal(n.hero.mana.earth, 10);
  s.hero.wall = 2;
  s.hero.items.barrier = 0;
  const wall = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(wall.hero.hp, 1000);
  assert.equal(wall.hero.mana.earth, 4);
});

test('reserve lining is once per enemy action, does not refund catalyst or charge capacitor', () => {
  const s = gear(loaded(), 'reserveLining', 'catalyst', 'capacitor');
  s.actor = 'enemy';
  mana(s.enemy, 20);
  mana(s.hero, 20);
  s.enemy.gear.charm = 'carbonPaper';
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 989); // 10 + 5 copied; one absorption of 4.
  assert.equal(
    COLORS.reduce((sum, c) => sum + n.hero.mana[c], 0),
    77,
  );
  assert.equal(n.hero.items.capacitorSpent, 0);
  assert.equal(n.hero.items.capacitorReadyAt, null);
});

test('waiting vest pays only for real earned enemy continuations and never restarts during that series', () => {
  const four = fixture('xp', 4);
  gear(four.s, 'waitingVest');
  four.s.actor = 'enemy';
  four.s.hero.mana.earth = 6;
  let n = step(four.s, four.command);
  assert.equal(n.actor, 'enemy');
  assert.equal(n.hero.items.barrier, 4);
  assert.equal(n.hero.mana.earth, 4);
  n = repeat(n, four, 'enemy');
  assert.equal(n.hero.items.barrier, 0);
  assert.equal(n.hero.mana.earth, 4);
  n = repeat(n, four, 'hero');
  n = repeat(n, four, 'enemy');
  assert.equal(n.hero.items.barrier, 4);
  assert.equal(n.hero.mana.earth, 2);
  const three = fixture('xp');
  gear(three.s, 'waitingVest');
  three.s.actor = 'enemy';
  three.s.hero.stunned = 1;
  three.s.hero.mana.earth = 6;
  const p = step(three.s, three.command);
  assert.equal(p.actor, 'enemy');
  assert.equal(p.hero.items.barrier, 0);
  assert.equal(p.hero.mana.earth, 6);
});

test('last pass needs the first visible ordinary triple and at most six mana after gifts', () => {
  const f = fixture('water');
  gear(f.s, 'lastPass');
  const n = step(f.s, f.command);
  assert.equal(n.actor, 'hero');
  assert.equal(n.hero.items.lastPassUsed, true);
  const p = repeat(n, f);
  assert.equal(p.actor, 'enemy');
  const fire = fixture('fire');
  gear(fire.s, 'lastPass', 'copperClip');
  fire.s.hero.mana.earth = 3;
  assert.equal(step(fire.s, fire.command).hero.items.lastPassUsed, false);
  const four = fixture('water', 4);
  gear(four.s, 'lastPass');
  assert.equal(step(four.s, four.command).hero.items.lastPassUsed, false);
  const stunned = fixture('water');
  gear(stunned.s, 'lastPass');
  stunned.s.enemy.stunned = 1;
  assert.equal(step(stunned.s, stunned.command).hero.items.lastPassUsed, false);
  f.s.hero.gear.charm = 'spinningTop';
  f.s.hero.items.topReady = true;
  const top = step(f.s, f.command);
  assert.equal(top.hero.items.lastPassUsed, false);
  assert.equal(top.hero.items.topReady, false);
});

test('yield choice can keep initiative without RNG/actions or sell it once without spending a ready top', () => {
  const f = fixture('water', 4);
  gear(f.s, 'yieldRing', 'spinningTop');
  f.s.hero.items.topReady = true;
  const n = step(f.s, f.command);
  assert.deepEqual(n.pendingYield, { side: 'hero', barrierGain: 5 });
  const kept = step(n, { type: 'yield', accept: false });
  assert.equal(kept.actor, 'hero');
  assert.equal(kept.pendingYield, undefined);
  assert.equal(kept.hero.items.yieldUses, 0);
  assert.deepEqual(kept.rng, n.rng);
  assert.equal(kept.hero.actions, n.hero.actions);
  assert.equal(kept.metrics.turns, n.metrics.turns);
  const sold = step(n, { type: 'yield', accept: true });
  assert.equal(sold.actor, 'enemy');
  assert.equal(sold.hero.items.barrier, 5);
  assert.equal(sold.hero.items.yieldUses, 1);
  assert.equal(sold.hero.items.topReady, true);
  assert.deepEqual(sold.rng, n.rng);
  assert.equal(sold.hero.actions, n.hero.actions);
  assert.ok(dispatchDuel(n, f.command).error);
  assert.ok(dispatchDuel(n, { type: 'yield', accept: 'yes' }).error);
  assert.ok(dispatchDuel(sold, { type: 'yield', accept: true }).error);
});

test('yield offer is capped, uses actual barrier gain, and cannot sell stun, spell or top continuations', () => {
  const f = fixture('water', 4);
  gear(f.s, 'yieldRing');
  f.s.hero.items.barrier = 4;
  const n = step(f.s, f.command);
  assert.equal(n.pendingYield.barrierGain, 2);
  assert.equal(step(n, { type: 'yield', accept: true }).hero.items.barrier, 6);
  for (const key of ['barrier', 'yieldUses', 'stun']) {
    const s = structuredClone(f.s);
    if (key === 'barrier') s.hero.items.barrier = 5;
    if (key === 'yieldUses') s.hero.items.yieldUses = 3;
    if (key === 'stun') s.enemy.stunned = 1;
    assert.equal(step(s, f.command).pendingYield, undefined, key);
  }
  const cast = gear(loaded(), 'yieldRing');
  mana(cast.hero, 20);
  assert.equal(
    step(cast, { type: 'cast', spell: 'trance' }).pendingYield,
    undefined,
  );
  const triple = fixture('water');
  gear(triple.s, 'yieldRing', 'spinningTop');
  triple.s.hero.items.topReady = true;
  assert.equal(step(triple.s, triple.command).pendingYield, undefined);
});

test('pending yield saves and restores through a real command journal, including both continuation choices', () => {
  let pending;
  for (let seed = 0; seed < 300 && !pending; seed++) {
    const s = start({ seed, testGear: ['yieldRing'] });
    for (const swap of legalSwaps(s.board)) {
      if (
        !findMatches(swapBoard(s.board, swap)).some((g) => g.cells.length >= 4)
      )
        continue;
      const n = step(s, { type: 'swap', ...swap });
      if (n.pendingYield) {
        pending = n;
        break;
      }
    }
  }
  assert.ok(pending);
  assert.deepEqual(loadDuel(saveDuel(pending)), pending);
  for (const accept of [true, false]) {
    const n = step(pending, { type: 'yield', accept });
    assert.deepEqual(loadDuel(saveDuel(n)), n);
    assert.deepEqual(
      step(loadDuel(saveDuel(pending)), { type: 'yield', accept }),
      n,
    );
  }
});

test('four representative builds cover all new items with deterministic journals and independent RNG streams', () => {
  const kits = [
    ['dullPunch', 'edgeSleeves', 'exchangeCoupon', 'shiftRing'],
    ['auditPencil', 'reserveLining', 'agreementSheet', 'openRing'],
    ['fullBlade', 'overflowRobe', 'safetyMagnet', 'lastPass'],
    ['glassNib', 'waitingVest', 'bluePass', 'yieldRing'],
  ];
  for (const testGear of kits) {
    let s = start({ testGear, classId: 'elementalist', foe: 8 });
    for (let i = 0; i < 18 && s.phase === 'battle'; i++) {
      const c = s.pendingYield
        ? { type: 'yield', accept: i % 2 === 0 }
        : chooseAction(s);
      const before = structuredClone(s);
      const a = step(s, c),
        b = step(s, c);
      assert.deepEqual(a, b);
      assert.deepEqual(s, before);
      assert.equal(a.rng.loot, s.rng.loot);
      s = a;
    }
    assert.deepEqual(loadDuel(saveDuel(s)), s, testGear.join('/'));
  }
});

test('v4 loot preserves biome gates and allows open ring without a partner rather than rescuing the build', () => {
  let solitaryRing = false,
    missedPartner = false,
    earlyCommon = 0,
    earlyTotal = 0;
  for (const classId of Object.keys(CLASSES)) {
    const s = start({ classId });
    for (let seed = 0; seed < 100; seed++)
      for (let room = 0; room < 20; room++) {
        const randomSeed = seed * 89 + room * 23,
          e = ENCOUNTERS[room];
        const loot = createOffers(s.hero, room, false, prng(randomSeed));
        assert.deepEqual(
          loot,
          createOffers(s.hero, room, false, prng(randomSeed)),
        );
        const all = [...loot.offers, ...loot.stock];
        assert.equal(new Set(all).size, 6);
        for (const id of all)
          assert.ok(!Object.values(s.hero.gear).includes(id));
        for (const id of loot.offers)
          assert.ok(
            LOOT_WEIGHTS[e.kind][e.biome][RARITIES.indexOf(ITEMS[id].rarity)] >
              0,
          );
        for (const id of loot.stock)
          assert.ok(
            SHOP_WEIGHTS[e.biome][RARITIES.indexOf(ITEMS[id].rarity)] > 0,
          );
        if (e.biome === 0 && e.kind === 'normal')
          for (const id of loot.offers) {
            earlyTotal++;
            earlyCommon += Number(ITEMS[id].rarity === 'common');
          }
        if (all.includes('openRing')) solitaryRing = true;
        if (classId === 'blade')
          assert.ok(
            all.every(
              (id) =>
                !['stylus', 'carbonPaper', 'metronome', 'glassNib'].includes(
                  id,
                ),
            ),
          );
        if (e.kind === 'boss')
          assert.ok(
            RARITIES.indexOf(ITEMS[loot.offers[0]].rarity) >=
              Math.min(3, e.biome + 1),
          );
      }
  }
  const s = gear(start(), 'openRing');
  for (let seed = 0; seed < 40; seed++) {
    const loot = createOffers(s.hero, 8, false, prng(seed));
    if (
      [...loot.offers, ...loot.stock].every(
        (id) => !['fullBlade', 'overflowRobe', 'reserveLining'].includes(id),
      )
    )
      missedPartner = true;
  }
  assert.ok(solitaryRing);
  assert.ok(missedPartner);
  assert.ok(earlyCommon / earlyTotal > 0.95);
});

test('frozen v3 journals keep their old catalog, exact commands and continuation through the current dispatcher', () => {
  let old = v3.createDuel({
    ...config,
    mode: 'route',
    classId: 'elementalist',
    seed: 3,
  });
  for (let i = 0; i < 20 && old.phase === 'battle'; i++)
    old = v3.dispatchDuel(old, oldAI.chooseAction(old)).state;
  const restored = loadDuel(v3.saveDuel(old));
  assert.deepEqual(restored, old);
  const command =
    old.phase === 'battle'
      ? oldAI.chooseAction(old)
      : { type: 'reward', item: old.offers[0] };
  const continued = dispatchDuel(restored, command);
  assert.equal(continued.error, undefined);
  assert.deepEqual(continued.state, v3.dispatchDuel(old, command).state);
  assert.equal(continued.state.version, 3);
  assert.ok(
    [...continued.state.offers, ...continued.state.stock].every(
      (id) => oldCatalog.ITEMS[id],
    ),
  );
  assert.deepEqual(loadDuel(saveDuel(continued.state)), continued.state);
});

function twoWaveFixture() {
  for (let seed = 0; seed < 400; seed++) {
    const s = loaded();
    s.board = start({ seed }).board;
    s.rng.board = seed;
    for (const i of [24, 26, 33]) s.board[i] = { kind: 'gold' };
    s.board[25] = { kind: 'earth' };
    for (const i of [16, 32, 40]) s.board[i] = { kind: 'water' };
    const command = { type: 'swap', a: 25, b: 33 };
    if (findMatches(s.board).length) continue;
    const first = findMatches(swapBoard(s.board, command));
    if (
      first.length !== 1 ||
      first[0].kind !== 'gold' ||
      first[0].cells.length !== 3
    )
      continue;
    const r = dispatchDuel(s, command);
    if (r.frames.length !== 2) continue;
    const second = findMatches(r.frames[1].board);
    if (
      second.length === 1 &&
      second[0].kind === 'water' &&
      second[0].cells.length === 3
    )
      return { s, command };
  }
  throw Error('No gold-to-water cascade fixture');
}

test('positional items ignore later cascades and last pass retains its first-wave low-mana snapshot', () => {
  const f = twoWaveFixture();
  for (const id of ['auditPencil', 'edgeSleeves', 'agreementSheet']) {
    const s = gear(structuredClone(f.s), id);
    s.enemy.mana.water = 20;
    const n = step(s, f.command);
    assert.equal(n.hero.mana.water, 3, id);
    assert.equal(n.enemy.mana.water, 20, id);
    assert.equal(n.hero.items.barrier, 0, id);
    assert.ok(!n.log.some((line) => line.includes(ITEMS[id].name)), id);
  }
  gear(f.s, 'lastPass');
  f.s.hero.mana.air = 4;
  const n = step(f.s, f.command);
  assert.equal(
    COLORS.reduce((sum, c) => sum + n.hero.mana[c], 0),
    7,
  );
  assert.equal(n.hero.items.lastPassUsed, true);
  assert.equal(n.actor, 'hero');
});

test('visible previews show the same first-wave costs and gains, never inspect hidden refills or mutate saves', () => {
  const f = fixture('water', 3, { edge: true });
  gear(f.s, 'auditPencil', 'edgeSleeves', 'agreementSheet', 'shiftRing');
  f.s.hero.items.shiftColor = 'earth';
  f.s.enemy.mana.water = 10;
  const before = structuredClone(f.s);
  const p = previewSwapItems(f.s, f.command.a, f.command.b);
  assert.deepEqual(f.s, before);
  assert.equal(p.mana.water, 0);
  assert.equal(p.mana.earth, 0);
  assert.equal(p.enemyMana.water, -2);
  assert.equal(p.barrier, 3);
  assert.ok(p.cells.length);
  const changed = structuredClone(f.s);
  changed.rng = { board: 999999, effect: 222222, loot: 333333 };
  assert.deepEqual(previewSwapItems(changed, f.command.a, f.command.b), p);
  assert.deepEqual(chooseAction(changed), chooseAction(f.s));
  assert.deepEqual(f.s, before);
  assert.equal(previewSwapItems(f.s, 0, 63), null);
  const cascade = twoWaveFixture();
  gear(cascade.s, 'lastPass');
  cascade.s.hero.mana.air = 4;
  const visible = previewSwapItems(
    cascade.s,
    cascade.command.a,
    cascade.command.b,
  );
  assert.equal(visible.mana.water, 0);
  assert.equal(visible.lastPassCandidate, true);
  assert.equal(step(cascade.s, cascade.command).hero.mana.water, 3);
});

test('new rules preserve existing-item battle outcomes against frozen v3 before intentional loot changes', () => {
  const kits = [
    [],
    ['fullBlade', 'overflowRobe', 'reservoir', 'mint'],
    ['glassNib', 'saltCoat', 'catalyst', 'bloodInkwell'],
    ['tideNeedle', 'cottonCuffs', 'prism', 'waterwheel'],
  ];
  const combatSnapshot = (s) => ({
    board: s.board,
    rng: s.rng,
    actor: s.actor,
    phase: s.phase,
    hero: {
      hp: s.hero.hp,
      mana: s.hero.mana,
      actions: s.hero.actions,
      barrier: s.hero.items.barrier,
    },
    enemy: {
      hp: s.enemy.hp,
      mana: s.enemy.mana,
      actions: s.enemy.actions,
      barrier: s.enemy.items.barrier,
    },
  });
  for (const testGear of kits) {
    const c = { ...config, classId: 'elementalist', foe: 9, testGear };
    let old = v3.createDuel(c),
      current = createDuel(c);
    for (let i = 0; i < 14 && old.phase === 'battle'; i++) {
      const command = oldAI.chooseAction(old);
      old = v3.dispatchDuel(old, command).state;
      current = step(current, command);
      assert.deepEqual(
        combatSnapshot(current),
        combatSnapshot(old),
        testGear.join('/'),
      );
    }
  }
});

test('new effects apply symmetrically to equipped enemies rather than being hero-only bonuses', () => {
  for (const [id, kind, length] of [
    ['dullPunch', 'skull', 3],
    ['auditPencil', 'water', 3],
    ['edgeSleeves', 'water', 3],
    ['exchangeCoupon', 'gold', 3],
    ['agreementSheet', 'water', 3],
    ['shiftRing', 'water', 3],
    ['openRing', 'water', 3],
    ['lastPass', 'water', 3],
    ['yieldRing', 'water', 4],
  ]) {
    const f = fixture(kind, length, { edge: true });
    gear(f.s, id);
    f.s.hero.items.shiftColor = 'fire';
    f.s.enemy.mana.water = 8;
    if (id === 'exchangeCoupon') f.s.hero.mana.water = 12;
    const mirrored = structuredClone(f.s);
    [mirrored.hero, mirrored.enemy] = [mirrored.enemy, mirrored.hero];
    mirrored.actor = 'enemy';
    const heroResult = step(f.s, f.command),
      enemyResult = step(mirrored, f.command);
    for (const property of ['hp', 'mana', 'items'])
      assert.deepEqual(
        heroResult.hero[property],
        enemyResult.enemy[property],
        `${id}/${property}`,
      );
    assert.equal(heroResult.enemy.hp, enemyResult.hero.hp, id);
    if (heroResult.pendingYield)
      assert.deepEqual(enemyResult.pendingYield, {
        ...heroResult.pendingYield,
        side: 'enemy',
      });
  }
});

test('victory cancels pending initiative rewards and defender self-costs cannot buy reserve protection', () => {
  for (const id of ['lastPass', 'yieldRing']) {
    const f = fixture('skull', id === 'yieldRing' ? 4 : 3);
    gear(f.s, id);
    f.s.enemy.hp = 1;
    const n = step(f.s, f.command);
    assert.equal(n.phase, 'won');
    assert.equal(n.pendingYield, undefined);
    assert.equal(n.hero.items.lastPassUsed, false);
    assert.equal(n.hero.items.yieldUses, 0);
  }
  const skulls = fixture('skull');
  gear(skulls.s, 'mortgage', 'reserveLining');
  skulls.s.hero.mana.earth = 13;
  const n = step(skulls.s, skulls.command);
  assert.equal(n.hero.hp, 998);
  assert.equal(n.hero.mana.earth, 13);
});

test('waiting vest is not paid on yield, charges only after continuation is accepted, and fails without spending its limit', () => {
  const f = fixture('water', 4);
  gear(f.s, 'yieldRing');
  f.s.enemy.gear.armor = 'waitingVest';
  f.s.enemy.mana.earth = 6;
  const choice = step(f.s, f.command);
  assert.equal(choice.enemy.mana.earth, 6);
  assert.equal(choice.enemy.items.barrier, 0);
  const sold = step(choice, { type: 'yield', accept: true });
  assert.equal(sold.enemy.mana.earth, 6);
  assert.equal(sold.enemy.items.barrier, 0);
  const kept = step(choice, { type: 'yield', accept: false });
  assert.equal(kept.enemy.mana.earth, 4);
  assert.equal(kept.enemy.items.barrier, 4);
  const poor = structuredClone(choice);
  poor.enemy.mana.earth = 1;
  const failed = step(poor, { type: 'yield', accept: false });
  assert.equal(failed.enemy.mana.earth, 1);
  assert.equal(failed.enemy.items.waitingSpent, false);
});

test('defensive item achievements belong to the defender and do not credit a bare attacker', () => {
  const s = loaded();
  mana(s.hero, 20);
  s.enemy.gear.armor = 'reserveLining';
  s.enemy.mana.earth = 20;
  const attack = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(attack.enemy.hp, 994);
  assert.ok(!attack.achievements.includes('synergy'));
  const defended = gear(loaded(), 'reserveLining');
  defended.actor = 'enemy';
  mana(defended.enemy, 20);
  defended.hero.mana.earth = 20;
  const defense = step(defended, { type: 'cast', spell: 'bolt' });
  assert.equal(defense.hero.hp, 994);
  assert.ok(defense.achievements.includes('synergy'));
});

test('item explanations evaluate the replacement loadout and describe open-ring risk without promising a partner', () => {
  const gear = { weapon: 'fullBlade', ring: 'openRing' };
  assert.ok(
    itemConnections(gear).some((line) => line.includes('Полного клинка')),
  );
  assert.deepEqual(itemConnections(gear, 'paperKnife'), []);
  assert.deepEqual(itemConnections(gear, 'yieldRing'), []);
  assert.ok(
    !itemWarnings(gear).some((line) =>
      line.includes('пока нет преобразователя'),
    ),
  );
  assert.ok(
    itemWarnings(gear, 'paperKnife').some((line) =>
      line.includes('пока нет преобразователя'),
    ),
  );
  assert.ok(
    itemWarnings({}, 'openRing').some((line) =>
      line.includes('Будущий партнёр не гарантирован'),
    ),
  );
  assert.ok(
    !itemWarnings(gear, 'yieldRing').some((line) =>
      line.includes('Разомкнутое кольцо'),
    ),
  );
  assert.deepEqual(
    itemConnections({ armor: 'cottonCuffs', charm: 'teaBag' }),
    [],
  );
});

test('a legal v4 route reaches all four bosses and wins, then replays the whole seeded journal', async () => {
  const { run } = await import('../scripts/duel-balance.mjs');
  const r = run(5, 'elementalist');
  assert.equal(r.phase, 'won');
  assert.equal(r.room, 20);
  assert.equal(r.checkpoints.length, 19);
  assert.ok(r.commands < 6000);
  assert.equal(r.state.version, 4);
  for (let i = 1; i <= 4; i++)
    assert.ok(r.state.achievements.includes(`biome-${i}`));
  assert.ok(r.state.achievements.includes('fourBiomes'));
  assert.deepEqual(loadDuel(saveDuel(r.state)), r.state);
});

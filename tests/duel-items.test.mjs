import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDuel,
  dispatchDuel,
  saveDuel,
  loadDuel,
  manaCap,
  fingerprint,
  spellError,
} from '../game/duel/engine.ts';
import * as v1 from '../game/duel/legacy-v1/engine.ts';
import {
  ITEMS,
  CLASSES,
  COLORS,
  KINDS,
  SPELLS,
  RARITIES,
} from '../game/duel/catalog.ts';
import { findMatches, swapBoard } from '../game/duel/board.ts';
import {
  freshItems,
  spellPayment,
  itemWarnings,
} from '../game/duel/item-rules.ts';
import { createOffers } from '../game/duel/loot.ts';
import { chooseAction } from '../game/duel/ai.ts';
const config = { seed: 707, classId: 'blade', mode: 'duel', foe: 0 };
const start = (patch = {}) => createDuel({ ...config, ...patch });
const step = (s, c) => {
  const r = dispatchDuel(s, c);
  assert.equal(r.error, undefined);
  return r.state;
};
const loaded = () => {
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
    for (const c of COLORS) f.mana[c] = 20;
  }
  s.rng.effect = 0;
  return s;
};
function fixture(kind, n = 3) {
  for (let seed = 0; seed < 300; seed++) {
    const s = loaded();
    s.rng.board = seed;
    s.board = start({ seed }).board;
    for (let x = 0; x < n; x++) s.board[24 + x] = { kind };
    const a = 24 + Math.floor(n / 2),
      b = a + 8;
    s.board[a] = { kind: kind === 'earth' ? 'water' : 'earth' };
    s.board[b] = { kind };
    const command = { type: 'swap', a, b };
    const groups = findMatches(swapBoard(s.board, command));
    if (
      !findMatches(s.board).length &&
      groups.length === 1 &&
      groups[0].cells.length === n
    ) {
      const r = dispatchDuel(s, command);
      if (r.frames.length === 1) return { s, command };
    }
  }
  throw Error(`fixture ${kind} ${n}`);
}
const gear = (s, ...ids) => {
  s.hero.gear = Object.fromEntries(ids.map((id) => [ITEMS[id].slot, id]));
  return s;
};
const prng = (seed) => () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

test('catalog: 32 unique items, 8/8/8/5/3 tiers, useful starts and valid four-slot configurations', () => {
  assert.equal(Object.keys(ITEMS).length, 32);
  assert.deepEqual(
    RARITIES.map(
      (r) => Object.values(ITEMS).filter((i) => i.rarity === r).length,
    ),
    [8, 8, 8, 5, 3],
  );
  for (const [id, c] of Object.entries(CLASSES)) {
    const s = start({ classId: id });
    assert.equal(Object.values(s.hero.gear).length, 2);
    assert.ok(c.gear.every((i) => ITEMS[i].rarity === 'common'));
  }
  assert.throws(() => start({ testGear: ['coat', 'veil'] }));
  assert.throws(() => start({ mode: 'route', testGear: ['coat'] }));
  assert.throws(() => start({ testGear: ['bogus'] }));
  assert.equal(start({ testGear: ['insurance'] }).hero.gear.charm, 'insurance');
});
test('start bonuses, reservoir and completed-encounter resets preserve consumed insurance', () => {
  const s = start({ testGear: ['bluePass', 'pocketVest'] });
  assert.equal(s.hero.items.barrier, 6);
  assert.equal(s.hero.mana.water, 2);
  assert.equal(s.hero.mana.earth, 3);
  const r = start({ testGear: ['reservoir'] });
  assert.equal(manaCap(r.hero, 'water'), 30);
  s.config.mode = 'route';
  s.config.testGear = undefined;
  s.phase = 'camp';
  s.rewarded = true;
  s.hero.items.insuranceUsed = true;
  s.hero.items.purseGold = 8;
  const n = step(s, { type: 'next' });
  assert.equal(n.hero.items.insuranceUsed, true);
  assert.equal(n.hero.items.purseGold, 0);
  assert.equal(n.hero.items.barrier, 6);
  assert.equal(n.hero.mana.water, 2);
});
test('all invalid actions preserve barrier, charges, health, RNG and initiative', () => {
  const s = gear(loaded(), 'mirrorVest', 'bloodInkwell');
  s.enemy.items.initiative.mint = true;
  const before = structuredClone(s);
  assert.ok(dispatchDuel(s, { type: 'swap', a: 0, b: 63 }).error);
  s.hero.mana.fire = 0;
  const noMana = structuredClone(s);
  assert.ok(dispatchDuel(s, { type: 'cast', spell: 'bolt' }).error);
  assert.deepEqual(s, noMana);
  const t = structuredClone(before);
  assert.ok(
    dispatchDuel(t, { type: 'cast', spell: 'forge', target: 99 }).error,
  );
  assert.deepEqual(t, before);
});
test('paper knife, long-match hammer and quarter cutter change skull choices', () => {
  for (const [id, n, expected] of [
    ['paperKnife', 3, 4],
    ['chargeSeal', 3, 3],
    ['chargeSeal', 4, 8],
    ['quarterCutter', 3, 0],
    ['quarterCutter', 4, 12],
  ]) {
    const { s, command } = fixture('skull', n);
    gear(s, id);
    const v = step(s, command);
    assert.equal(1000 - v.enemy.hp, expected, `${id}/${n}`);
  }
});
test('quarter cutter still permits collecting ordinary skulls with a spell', () => {
  const s = gear(loaded(), 'quarterCutter');
  s.board = Array.from({ length: 64 }, (_, i) => ({
    kind: KINDS[((i % 8) + Math.floor(i / 8) * 2) % 7],
  }));
  s.board[24] = { kind: 'skull' };
  s.board[25] = { kind: 'skull' };
  s.board[26] = { kind: 'skull' };
  const n = step(s, { type: 'cast', spell: 'slice', target: 25 });
  assert.ok(n.enemy.hp <= 997);
});
test('earth, gold and fire support items trigger from physical collections', () => {
  for (const [id, kind, field, expected] of [
    ['apron', 'earth', 'barrier', 2],
    ['abacus', 'gold', 'barrier', 2],
  ]) {
    const { s, command } = fixture(kind);
    gear(s, id);
    assert.equal(step(s, command).hero.items[field], expected);
  }
  const { s, command } = fixture('fire');
  gear(s, 'copperClip');
  s.hero.mana.air = 0;
  assert.equal(step(s, command).hero.mana.air, 1);
});
test('scholar and purse bonuses stop at their encounter budgets', () => {
  for (const [id, kind, counter, limit] of [
    ['scholar', 'xp', 'scholarXp', 6],
    ['tidePurse', 'water', 'purseGold', 8],
  ]) {
    const f = fixture(kind);
    gear(f.s, id);
    let s = f.s;
    for (let i = 0; i < 8; i++) {
      s.actor = 'hero';
      s.board = structuredClone(f.s.board);
      s.rng.board = f.s.rng.board;
      s = step(s, f.command);
    }
    assert.equal(s.hero.items[counter], limit);
  }
});
test('water chain remains functional and cannot create two presses in one initiative series', () => {
  const { s, command } = fixture('water', 4);
  gear(s, 'tideNeedle', 'tidePurse', 'mint');
  const n = step(s, command);
  assert.ok(n.enemy.hp <= 998);
  assert.equal(n.hero.items.purseGold, 2);
  assert.equal(n.hero.items.initiative.mint, true);
  n.board = structuredClone(s.board);
  n.rng.board = s.rng.board;
  n.actor = 'hero';
  const p = step(n, command);
  assert.equal(p.log.filter((x) => x.endsWith('Монетный пресс.')).length, 1);
  p.actor = 'enemy';
  const q = step(p, { type: 'cast', spell: 'mend' });
  assert.equal(q.hero.items.initiative.mint, undefined);
});
test('full blade consumes two mana from full pools after its first skull wave', () => {
  const { s, command } = fixture('skull');
  gear(s, 'fullBlade');
  const n = step(s, command);
  assert.equal(n.enemy.hp, 981);
  assert.ok(COLORS.every((c) => n.hero.mana[c] === 18));
});
test('risk blade checks half-health and retaliation requires enemy damage', () => {
  const { s, command } = fixture('skull');
  gear(s, 'contractBlade', 'answerCloak');
  s.hero.hp = 500;
  s.hero.items.answer = true;
  const n = step(s, command);
  assert.equal(n.enemy.hp, 989);
  assert.equal(n.hero.items.answer, false);
  const t = gear(loaded(), 'answerCloak', 'bloodInkwell');
  const p = step(t, { type: 'cast', spell: 'bolt' });
  assert.equal(p.hero.items.answer, false);
});
test('shadow multiplies a long skull wave and consumes its charge', () => {
  const { s, command } = fixture('skull', 4);
  gear(s, 'veil');
  const n = step(s, command);
  assert.equal(n.enemy.hp, 994);
  assert.equal(n.hero.stealthUntil, 0);
});
test('overflow is bounded and reservoir delays it', () => {
  const { s, command } = fixture('water');
  gear(s, 'overflowRobe');
  assert.equal(step(s, command).hero.items.barrier, 3);
  gear(s, 'overflowRobe', 'reservoir');
  assert.equal(step(s, command).hero.items.barrier, 0);
});
test('stylus and copier only enhance direct damage; copier cannot recur before an actual enemy action', () => {
  const s = gear(loaded(), 'stylus', 'carbonPaper');
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.enemy.hp, 983);
  n.actor = 'hero';
  n.hero.ready = {};
  const p = step(n, { type: 'cast', spell: 'bolt' });
  assert.equal(p.enemy.hp, 971);
  const t = gear(loaded(), 'stylus', 'carbonPaper');
  const q = step(t, {
    type: 'cast',
    spell: 'bomb',
    target: t.board.findIndex((x) => x.kind === 'skull'),
  });
  assert.equal(q.enemy.hp, 1000);
});
test('blood discount is visible, cannot kill, is paid only on accepted casts and resets after real enemy actions', () => {
  const s = gear(loaded(), 'bloodInkwell');
  assert.equal(spellPayment(s.hero, 'bolt').cost.fire, 4);
  s.hero.mana.fire = 4;
  assert.equal(spellError(s, 'bolt'), null);
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 998);
  assert.equal(n.hero.mana.fire, 0);
  assert.equal(n.hero.items.initiative.bloodInkwell, true);
  n.actor = 'hero';
  assert.equal(spellPayment(n.hero, 'bolt').health, 0);
  s.hero.hp = 2;
  assert.equal(spellPayment(s.hero, 'bolt').health, 0);
  assert.equal(spellError(s, 'bolt'), 'Недостаточно маны');
});
test('catalyst and capacitor count net paid mana, charge cannot pay for its own spell', () => {
  const s = gear(loaded(), 'catalyst', 'capacitor');
  let n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.mana.fire, 16);
  assert.equal(n.hero.items.capacitorSpent, 7);
  assert.equal(n.hero.items.capacitorReadyAt, null);
  n.actor = 'hero';
  n.hero.ready = {};
  n = step(n, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.items.capacitorSpent, 2);
  assert.equal(n.hero.items.capacitorReadyAt, 2);
  const f = fixture('water');
  n.board = f.s.board;
  n.rng.board = f.s.rng.board;
  n.actor = 'hero';
  n.hero.mana.water = 0;
  const p = step(n, f.command);
  assert.equal(p.hero.mana.water, 7);
  assert.equal(p.hero.items.capacitorReadyAt, null);
});
test('barrier absorbs, reflects without recursion, expires after actual opposing action', () => {
  const s = loaded();
  s.actor = 'enemy';
  s.hero.gear = { armor: 'mirrorVest' };
  s.hero.items.barrier = 6;
  s.enemy.gear = { armor: 'mirrorVest' };
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 996);
  assert.equal(n.hero.items.barrier, 0);
  assert.equal(n.enemy.hp, 999);
  assert.equal(n.enemy.items.barrier, 0);
});
test('coat applies once across all hits and mirror gives shield on its own action', () => {
  const s = gear(loaded(), 'mirrorVest');
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.items.barrier, 2);
  const a = gear(loaded(), 'coat');
  a.actor = 'enemy';
  const p = step(a, { type: 'cast', spell: 'bolt' });
  assert.equal(p.hero.hp, 992);
});
test('insurance survives lethal once, also on enemy, never revives twice after replacement', () => {
  const s = gear(loaded(), 'insurance');
  s.actor = 'enemy';
  s.hero.hp = 3;
  let n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 1);
  assert.equal(n.hero.items.insuranceUsed, true);
  assert.equal(n.hero.items.barrier, 0);
  n.actor = 'enemy';
  n.enemy.ready = {};
  n = step(n, { type: 'cast', spell: 'bolt' });
  assert.equal(n.phase, 'lost');
  const t = loaded();
  t.enemy.gear = { charm: 'insurance' };
  t.enemy.hp = 2;
  const p = step(t, { type: 'cast', spell: 'bolt' });
  assert.equal(p.enemy.hp, 1);
  assert.ok(p.enemy.items.insuranceUsed);
});
test('director seals collect over actions and only trigger once per initiative', () => {
  let s = gear(loaded(), 'directorPen');
  for (const c of COLORS) {
    const f = fixture(c);
    s.board = f.s.board;
    s.rng.board = f.s.rng.board;
    s.actor = 'hero';
    s = step(s, f.command);
  }
  assert.equal(s.enemy.hp, 992);
  assert.equal(s.hero.items.barrier, 4);
  assert.deepEqual(s.hero.items.seals, []);
  assert.ok(s.hero.items.initiative.directorPen);
});
test('diploma converts physical stars to four mana colors without XP', () => {
  const { s, command } = fixture('xp', 5);
  gear(s, 'infiniteDiploma');
  for (const c of COLORS) s.hero.mana[c] = 0;
  const n = step(s, command);
  assert.equal(n.hero.xp, 0);
  assert.ok(COLORS.every((c) => n.hero.mana[c] === 4));
});
test('spinning top provides one extra action per initiative and keeps a later charge', () => {
  let s = gear(loaded(), 'spinningTop');
  for (let i = 0; i < 3; i++) {
    s.actor = 'hero';
    s.hero.ready = {};
    for (const c of COLORS) s.hero.mana[c] = 20;
    s = step(s, { type: 'cast', spell: 'bolt' });
  }
  assert.equal(s.actor, 'hero');
  assert.equal(s.hero.items.topReady, false);
  assert.ok(s.hero.items.initiative.spinningTop);
  for (let i = 0; i < 3; i++) {
    s.actor = 'hero';
    s.hero.ready = {};
    for (const c of COLORS) s.hero.mana[c] = 20;
    s = step(s, { type: 'cast', spell: 'bolt' });
  }
  assert.equal(s.actor, 'enemy');
  assert.ok(s.hero.items.topReady);
  s.enemy.hp = 900;
  s = step(s, { type: 'cast', spell: 'mend' });
  assert.equal(s.hero.items.initiative.spinningTop, undefined);
});
test('fuse selects a visible ordinary skull and belongs to the common board', () => {
  const { s, command } = fixture('fire', 4);
  gear(s, 'wick');
  const n = step(s, command);
  assert.equal(n.hero.items.initiative.wick, true);
  assert.ok(n.board.some((t) => t.power) || n.achievements.includes('blast'));
});
test('conductor needs physically collected different colors, not gifted mana', () => {
  const { s, command } = fixture('fire');
  gear(s, 'copperClip', 'conductor');
  s.hero.mana.air = 0;
  const n = step(s, command);
  assert.equal(n.hero.mana.air, 1);
  assert.ok(!n.log.some((l) => l.includes('Кольцо проводника.')));
});
test('rarity progression: deterministic, no duplicates/equipped items, rare pity, no late XP, normal shop only', () => {
  let legendary = false;
  for (let seed = 0; seed < 300; seed++)
    for (let room = 0; room < 4; room++) {
      const s = start();
      const a = createOffers(s.hero, room, false, prng(seed)),
        b = createOffers(s.hero, room, false, prng(seed));
      assert.deepEqual(a, b);
      const all = [...a.offers, ...a.stock];
      assert.equal(new Set(all).size, 6);
      assert.ok(all.every((id) => !Object.values(s.hero.gear).includes(id)));
      assert.ok(a.stock.every((id) => RARITIES.indexOf(ITEMS[id].rarity) <= 2));
      if (room >= 2) {
        assert.ok(a.rareOffered);
        assert.ok(!all.includes('scholar'));
      }
      if (room === 0)
        assert.ok(
          a.offers.every((id) => RARITIES.indexOf(ITEMS[id].rarity) <= 2),
        );
      if (a.offers.some((id) => ITEMS[id].rarity === 'legendary'))
        legendary = true;
    }
  assert.ok(legendary);
});
test('old v1 journals replay and continue unchanged through the public dispatcher', () => {
  let s = v1.createDuel(config);
  s = v1.dispatchDuel(s, chooseAction(s)).state;
  const loaded = loadDuel(v1.saveDuel(s));
  assert.deepEqual(loaded, s);
  const c = chooseAction(s);
  assert.deepEqual(dispatchDuel(loaded, c), v1.dispatchDuel(s, c));
  assert.equal(saveDuel(loaded), v1.saveDuel(s));
});
test('v2 journals retain gear selection and charges with exact command replay', () => {
  let s = start({
    classId: 'elementalist',
    testGear: ['directorPen', 'mirrorVest', 'spinningTop', 'capacitor'],
  });
  for (let i = 0; i < 24 && s.phase === 'battle'; i++)
    s = step(s, chooseAction(s));
  assert.deepEqual(loadDuel(saveDuel(s)), s);
  const bad = JSON.parse(saveDuel(s));
  bad.fingerprint = 'bad';
  assert.equal(loadDuel(JSON.stringify(bad)), null);
});
test('complete routes use rarity rewards and shops; repeat seeds preserve results', () => {
  function run(seed) {
    let s = start({ mode: 'route', seed });
    for (let i = 0; i < 600 && ['battle', 'camp'].includes(s.phase); i++) {
      if (s.phase === 'battle') {
        const c = chooseAction(s);
        assert.ok(c);
        s = step(s, c);
      } else if (!s.rewarded)
        s = step(s, { type: 'reward', item: s.offers[0] });
      else s = step(s, { type: 'next' });
      for (const f of [s.hero, s.enemy]) {
        assert.ok(f.hp >= 0 && f.hp <= f.maxHp);
        assert.ok(f.items.barrier >= 0 && f.items.barrier <= 6);
        for (const c of COLORS)
          assert.ok(f.mana[c] >= 0 && f.mana[c] <= manaCap(f, c));
      }
    }
    assert.ok(['won', 'lost'].includes(s.phase));
    assert.deepEqual(loadDuel(saveDuel(s)), s);
    return fingerprint(s);
  }
  for (let seed = 0; seed < 8; seed++) assert.equal(run(seed), run(seed));
});
test('equipment warnings describe actual tradeoffs', () => {
  assert.equal(itemWarnings({ weapon: 'fullBlade' }, 'reservoir').length, 1);
  assert.ok(
    itemWarnings({ ring: 'infiniteDiploma' }).some((x) => x.includes('опыт')),
  );
});

test('skipping a stunned enemy does not reset initiative item limits', () => {
  const s = gear(loaded(), 'spinningTop', 'bloodInkwell');
  s.hero.items.initiative = { spinningTop: true, bloodInkwell: true };
  s.hero.items.topReady = true;
  s.enemy.stunned = 1;
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.actor, 'hero');
  assert.equal(n.enemy.stunned, 0);
  assert.equal(n.hero.items.initiative.spinningTop, true);
  assert.equal(n.hero.items.initiative.bloodInkwell, true);
  assert.equal(n.hero.items.topReady, true);
  assert.equal(n.hero.hp, 1000);
});
test('spell collection activates conductor for physical colors but not a wildcard or mastery payout', () => {
  const s = gear(loaded(), 'conductor');
  s.board = Array.from({ length: 64 }, (_, i) => ({
    kind: KINDS[((i % 8) + Math.floor(i / 8) * 2) % 7],
  }));
  for (const c of COLORS) s.hero.mana[c] = 6;
  const plain = structuredClone(s);
  plain.hero.gear = {};
  const n = step(s, { type: 'cast', spell: 'slice', target: 25 });
  const baseline = step(plain, { type: 'cast', spell: 'slice', target: 25 });
  assert.equal(
    COLORS.reduce((sum, c) => sum + n.hero.mana[c] - baseline.hero.mana[c], 0),
    2,
  );
  assert.ok(n.log.some((l) => l.includes('Кольцо проводника.')));
  const t = gear(loaded(), 'tideNeedle');
  t.board = structuredClone(s.board);
  t.board[24] = { kind: 'water' };
  t.board[25] = { kind: 'wild' };
  t.board[26] = { kind: 'water' };
  t.hero.stats.water = 30;
  t.hero.mana.air = 6;
  const p = step(t, { type: 'cast', spell: 'slice', target: 25 });
  assert.ok(!p.log.some((l) => l.includes('Игла прилива.')));
});
test('a resisted direct spell pays resources but does not spend the copier trigger', () => {
  const s = gear(loaded(), 'carbonPaper');
  s.enemy.stats.morale = 30;
  s.enemy.gear = { ring: 'ward' };
  s.rng.effect = 1;
  const n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.enemy.hp, 1000);
  assert.equal(n.hero.mana.fire, 14);
  assert.equal(n.hero.items.initiative.carbonPaper, undefined);
});
test('lethal reflection stops a draining spell before its mana-steal effects', () => {
  const s = loaded();
  s.hero.hp = 1;
  s.enemy.gear = { armor: 'mirrorVest' };
  s.enemy.items.barrier = 6;
  const n = step(s, { type: 'cast', spell: 'drain' });
  assert.equal(n.phase, 'lost');
  assert.equal(n.hero.hp, 0);
  assert.ok(COLORS.every((c) => n.enemy.mana[c] === 20));
});
test('lethal reflection also stops palm before applying stun', () => {
  const s = loaded();
  s.hero.hp = 1;
  s.hero.ki = 5;
  s.enemy.gear = { armor: 'mirrorVest' };
  s.enemy.items.barrier = 6;
  const n = step(s, { type: 'cast', spell: 'palm' });
  assert.equal(n.phase, 'lost');
  assert.equal(n.enemy.stunned, 0);
  assert.equal(n.enemy.immune, 0);
});
test('AI does not prioritize harmless skull triples with quarter cutter or inspect hidden refill RNG', () => {
  const { s } = fixture('skull');
  gear(s, 'quarterCutter');
  s.hero.spells = [];
  const a = chooseAction(s);
  const groups = findMatches(swapBoard(s.board, a));
  assert.ok(groups.some((g) => g.kind !== 'skull' || g.cells.length >= 4));
  const changed = structuredClone(s);
  changed.rng = { board: 999, effect: 88, loot: 11 };
  assert.deepEqual(chooseAction(changed), a);
});

test('classes without direct damage spells never receive dead stylus or copier offers', () => {
  for (const classId of Object.keys(CLASSES)) {
    const s = start({ classId });
    for (let room = 0; room < 4; room++)
      for (let seed = 0; seed < 80; seed++) {
        const loot = createOffers(s.hero, room, false, prng(seed));
        if (
          !s.hero.spells.some((id) => ['bolt', 'drain', 'palm'].includes(id))
        ) {
          assert.ok(
            [...loot.offers, ...loot.stock].every(
              (id) => !['stylus', 'carbonPaper'].includes(id),
            ),
          );
        }
      }
  }
});

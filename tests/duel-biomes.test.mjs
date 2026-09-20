import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDuel,
  dispatchDuel,
  saveDuel,
  loadDuel,
  spellError,
} from '../game/duel/legacy-v3/engine.ts';
import * as v1 from '../game/duel/legacy-v1/engine.ts';
import {
  ITEMS,
  CLASSES,
  COLORS,
  KINDS,
  SPELLS,
  RARITIES,
} from '../game/duel/legacy-v3/catalog.ts';
import { findMatches, swapBoard } from '../game/duel/board.ts';
import {
  freshItems,
  spellPayment,
  itemWarnings,
} from '../game/duel/legacy-v3/item-rules.ts';
import { createOffers } from '../game/duel/legacy-v3/loot.ts';
import { chooseAction } from '../game/duel/legacy-v3/ai.ts';
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

import * as v2 from '../game/duel/legacy-v2/engine.ts';
import {
  ENCOUNTERS,
  BIOMES,
  victoryReward,
  restHealing,
} from '../game/duel/legacy-v3/campaign.ts';
import { LOOT_WEIGHTS, SHOP_WEIGHTS } from '../game/duel/legacy-v3/loot.ts';
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

test('four biomes have readable escalating encounters, bosses, valid gear and 48 slotted items', () => {
  assert.equal(BIOMES.length, 4);
  assert.equal(ENCOUNTERS.length, 20);
  assert.equal(new Set(ENCOUNTERS.map((e) => e.name)).size, 20);
  assert.deepEqual(
    RARITIES.map(
      (r) => Object.values(ITEMS).filter((i) => i.rarity === r).length,
    ),
    [12, 12, 12, 7, 5],
  );
  for (let room = 0; room < 20; room++) {
    const e = ENCOUNTERS[room],
      s = start({ foe: room });
    assert.equal(e.biome, Math.floor(room / 5));
    assert.equal(
      e.kind,
      room % 5 === 4 ? 'boss' : room % 5 === 3 ? 'elite' : 'normal',
    );
    assert.equal(s.enemy.hp, e.hp);
    assert.equal(s.version, 3);
    assert.ok(e.gear.every((id) => ITEMS[id]));
    assert.equal(
      new Set(e.gear.map((id) => ITEMS[id].slot)).size,
      e.gear.length,
    );
    assert.ok(e.spells.every((id) => SPELLS[id]));
    assert.ok(s.enemy.stats.fire <= 9);
  }
  assert.throws(() => start({ foe: 20 }));
  assert.throws(() => start({ mode: 'route', testGear: ['ledger'] }));
});
test('loot depth is a hard gate across classes, equipped slots and seeds; boss upgrades and shop ceilings hold', () => {
  let earlyCommon = 0,
    earlyTotal = 0;
  for (const classId of Object.keys(CLASSES))
    for (let seed = 0; seed < 120; seed++) {
      const s = start({ classId });
      for (let room = 0; room < 20; room++) {
        const random = prng(seed * 89 + room * 23),
          e = ENCOUNTERS[room];
        const loot = createOffers(s.hero, room, false, random);
        assert.deepEqual(
          loot,
          createOffers(s.hero, room, false, prng(seed * 89 + room * 23)),
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
            if (ITEMS[id].rarity === 'common') earlyCommon++;
          }
        if (e.kind === 'boss')
          assert.ok(
            RARITIES.indexOf(ITEMS[loot.offers[0]].rarity) >=
              Math.min(3, e.biome + 1),
          );
        if (classId === 'blade')
          assert.ok(
            all.every(
              (id) =>
                !['stylus', 'carbonPaper', 'metronome', 'glassNib'].includes(
                  id,
                ),
            ),
          );
        s.hero.gear[ITEMS[loot.offers[0]].slot] = loot.offers[0];
      }
    }
  assert.ok(earlyCommon / earlyTotal > 0.95);
});
test('boss reward stays valid when all usable Very Rare are equipped and insurance is spent', () => {
  const s = gear(start(), 'quarterCutter', 'mirrorVest', 'ledger', 'capacitor');
  s.hero.items.insuranceUsed = true;
  for (let seed = 0; seed < 60; seed++) {
    const { offers, stock } = createOffers(s.hero, 14, false, prng(seed));
    assert.equal(new Set([...offers, ...stock]).size, 6);
    assert.ok(offers.every((id) => ITEMS[id].rarity === 'rare'));
    assert.ok(
      [...offers, ...stock].every(
        (id) => !Object.values(s.hero.gear).includes(id),
      ),
    );
    assert.ok(!offers.includes('insurance'));
  }
});
test('common support items use physical tiles, healing caps and do not substitute XP', () => {
  for (const [kind, id, color, bonus] of [
    ['earth', 'teaBag', 'water', 1],
    ['xp', 'lens', 'air', 2],
  ]) {
    const { s, command } = fixture(kind);
    gear(s, id);
    s.hero.mana[color] = 0;
    const n = step(s, command);
    assert.equal(n.hero.mana[color], bonus);
    if (kind === 'xp') assert.equal(n.hero.xp, 3);
  }
  const { s, command } = fixture('water');
  gear(s, 'cottonCuffs');
  s.hero.hp = 900;
  s.hero.items.healed = 5;
  const n = step(s, command);
  assert.equal(n.hero.hp, 901);
  assert.equal(n.hero.items.healed, 6);
  s.hero.items.healed = 6;
  assert.equal(step(s, command).hero.hp, 900);
});
test('archive vest, fire seal and waterwheel connect XP/skulls/water to distinct resources', () => {
  let f = fixture('xp');
  gear(f.s, 'archiveVest');
  assert.equal(step(f.s, f.command).hero.items.barrier, 3);
  f = fixture('skull');
  gear(f.s, 'fireSeal');
  f.s.hero.mana.fire = 0;
  assert.equal(step(f.s, f.command).hero.mana.fire, 2);
  f = fixture('water');
  gear(f.s, 'waterwheel');
  f.s.hero.mana.fire = 1;
  f.s.hero.mana.earth = 0;
  const n = step(f.s, f.command);
  assert.equal(n.hero.mana.fire, 0);
  assert.equal(n.hero.mana.earth, 3);
});
test('ember and ledger charges cross actions, consume once, cannot double count coins while charged', () => {
  let f = fixture('fire');
  gear(f.s, 'emberKnife');
  const charged = step(f.s, f.command);
  assert.equal(charged.hero.items.ember, true);
  const skull = fixture('skull');
  gear(skull.s, 'emberKnife');
  skull.s.hero.items = charged.hero.items;
  let n = step(skull.s, skull.command);
  assert.equal(n.enemy.hp, 994);
  assert.equal(n.hero.items.ember, false);
  f = fixture('gold');
  gear(f.s, 'ledger');
  f.s.hero.items.ledgerCoins = 3;
  n = step(f.s, f.command);
  assert.equal(n.hero.items.ledgerReady, true);
  f.s.hero.items.ledgerReady = true;
  f.s.hero.items.ledgerCoins = 1;
  assert.equal(step(f.s, f.command).hero.items.ledgerCoins, 1);
  gear(skull.s, 'ledger');
  skull.s.hero.items = freshItems();
  skull.s.hero.items.ledgerReady = true;
  n = step(skull.s, skull.command);
  assert.equal(n.enemy.hp, 991);
  assert.equal(n.hero.items.ledgerReady, false);
});
test('metronome primes a later direct spell, remains charged when resisted and cannot stack', () => {
  const f = fixture('air');
  gear(f.s, 'metronome');
  const charged = step(f.s, f.command);
  assert.equal(charged.hero.items.metronome, true);
  const s = gear(loaded(), 'metronome');
  s.hero.items = charged.hero.items;
  let n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.enemy.hp, 987);
  assert.equal(n.hero.items.metronome, false);
  s.enemy.stats.morale = 30;
  s.enemy.gear = { ring: 'ward' };
  s.rng.effect = 1;
  n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.items.metronome, true);
});
test('glass risk applies once before protection, reflected damage does not amplify itself', () => {
  const s = gear(loaded(), 'glassNib', 'carbonPaper');
  let n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.enemy.hp, 980);
  s.actor = 'enemy';
  s.hero.gear.armor = 'coat';
  n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 991); // 10 + 1 - 2
  s.hero.gear.armor = 'mirrorVest';
  s.hero.items.barrier = 6;
  s.enemy.gear = { weapon: 'glassNib', armor: 'mirrorVest' };
  s.enemy.items.barrier = 6;
  n = step(s, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.hp, 990);
  assert.ok(n.enemy.hp > 990);
});
test('salt coat trades healing for once-per-initiative protection, self costs do not trigger retaliation', () => {
  const s = gear(loaded(), 'saltCoat');
  s.hero.hp = 900;
  let n = step(s, { type: 'cast', spell: 'mend' });
  assert.equal(n.hero.hp, 907);
  assert.equal(n.hero.items.barrier, 3);
  n.actor = 'hero';
  n.hero.items.barrier = 0;
  n = step(n, { type: 'cast', spell: 'bolt' });
  assert.equal(n.hero.items.barrier, 0);
  const f = fixture('skull');
  gear(f.s, 'mortgage', 'answerCloak');
  f.s.hero.items.barrier = 6;
  n = step(f.s, f.command);
  assert.equal(n.hero.hp, 998);
  assert.equal(n.enemy.hp, 991);
  assert.equal(n.hero.items.answer, false);
  assert.equal(n.hero.items.barrier, 6);
  f.s.hero.hp = 2;
  n = step(f.s, f.command);
  assert.equal(n.hero.hp, 2);
  assert.equal(n.enemy.hp, 997);
});
test('gold lining has a real gold cost and bounded actual healing; long-match ring pays health once per initiative', () => {
  const f = fixture('gold');
  gear(f.s, 'goldenLining');
  f.s.hero.hp = 990;
  f.s.hero.items.healed = 11;
  const n = step(f.s, f.command);
  assert.equal(n.hero.hp, 991);
  assert.equal(n.hero.items.healed, 12);
  assert.equal(n.hero.gold, 1);
  f.s.hero.items.healed = 12;
  assert.equal(step(f.s, f.command).hero.gold, 3);
  const g = fixture('earth', 4);
  gear(g.s, 'eclipseRing');
  for (const c of COLORS) g.s.hero.mana[c] = 0;
  let p = step(g.s, g.command);
  assert.equal(p.hero.hp, 998);
  assert.equal(p.hero.mana.earth, 6);
  assert.equal(p.hero.mana.fire, 2);
  g.s.hero.items.initiative.eclipseRing = true;
  p = step(g.s, g.command);
  assert.equal(p.hero.hp, 1000);
  assert.equal(p.hero.mana.fire, 0);
  g.s.hero.items.initiative = {};
  g.s.hero.hp = 2;
  assert.equal(step(g.s, g.command).hero.hp, 2);
});
test('prism needs three physical colors; graphite needs air before a skull wave in the same action', () => {
  const s = gear(loaded(), 'prism', 'graphite');
  s.hero.mana.air = 6;
  s.board = Array.from({ length: 64 }, (_, i) => ({
    kind: KINDS[((i % 8) + Math.floor(i / 8) * 2) % 7],
  }));
  s.board[24] = { kind: 'air' };
  s.board[25] = { kind: 'earth' };
  s.board[26] = { kind: 'water' };
  let n = step(s, { type: 'cast', spell: 'slice', target: 25 });
  assert.ok(n.enemy.hp <= 997);
  assert.equal(n.hero.items.barrier, 2);
  const f = fixture('skull');
  gear(f.s, 'graphite');
  const baseline = step(f.s, f.command);
  assert.equal(baseline.enemy.hp, 997);
  // The spell physically collects 3 air and 2 skulls together; bonus air mana cannot substitute this.
  for (let i = 24; i <= 28; i++)
    s.board[i] = { kind: i <= 26 ? 'air' : 'skull' };
  s.hero.mana.air = 10;
  s.hero.gear = { weapon: 'graphite' };
  n = step(s, { type: 'cast', spell: 'slice', target: 26 });
  assert.ok(n.enemy.hp <= 996);
});
test('all 20 route transitions preserve gear, seed streams and insurance; only final boss ends run', () => {
  let s = start({ mode: 'route' });
  const seen = [];
  for (let room = 0; room < 20; room++) {
    assert.equal(s.room, room);
    assert.equal(s.enemy.name, ENCOUNTERS[room].name);
    s.hero.spells = ['bolt'];
    s.hero.mana.fire = 20;
    s.hero.mana.air = 20;
    s.hero.ready = {};
    s.actor = 'hero';
    s.enemy.hp = 1;
    s.enemy.gear = {};
    s.enemy.items = freshItems();
    s.enemy.wall = 0;
    s.enemy.stats.morale = 0;
    s.hero.hp = 20;
    const gold = s.hero.gold;
    s = step(s, { type: 'cast', spell: 'bolt' });
    assert.equal(s.hero.gold - gold, victoryReward(room));
    if (room === 19) {
      assert.equal(s.phase, 'won');
      break;
    }
    assert.equal(s.phase, 'camp');
    assert.ok(s.hero.hp >= Math.min(20 + restHealing(room), s.hero.maxHp));
    seen.push(s.offers);
    s = step(s, { type: 'reward', item: s.offers[0] });
    s.hero.items.insuranceUsed = true;
    s.hero.items.ember = true;
    s.hero.items.healed = 6;
    const equipment = structuredClone(s.hero.gear);
    s = step(s, { type: 'next' });
    assert.deepEqual(s.hero.gear, equipment);
    assert.equal(s.hero.items.insuranceUsed, true);
    assert.equal(s.hero.items.ember, false);
    assert.equal(s.hero.items.healed, 0);
  }
  assert.equal(seen.length, 19);
  for (let i = 1; i <= 4; i++) assert.ok(s.achievements.includes(`biome-${i}`));
  assert.ok(s.achievements.includes('fourBiomes'));
});
test('public loader preserves v1/v2 exact journals and continuation; v3 validates new item records', () => {
  for (const engine of [v1, v2]) {
    let old = engine.createDuel(config);
    const command = chooseAction(old);
    old = engine.dispatchDuel(old, command).state;
    const restored = loadDuel(engine.saveDuel(old));
    assert.deepEqual(restored, old);
    const next = chooseAction(restored);
    assert.deepEqual(
      dispatchDuel(restored, next).state,
      engine.dispatchDuel(old, next).state,
    );
  }
  let s = start({
    foe: 19,
    testGear: ['glassNib', 'goldenLining', 'metronome', 'eclipseRing'],
  });
  for (let i = 0; i < 12 && s.phase === 'battle'; i++)
    s = step(s, chooseAction(s));
  assert.deepEqual(loadDuel(saveDuel(s)), s);
  const tampered = JSON.parse(saveDuel(s));
  tampered.config.foe = 20;
  assert.equal(loadDuel(JSON.stringify(tampered)), null);
});

test('diploma feeds mana while archive vest still uses physical stars for defense', () => {
  const f = fixture('xp');
  gear(f.s, 'archiveVest', 'infiniteDiploma');
  for (const c of COLORS) f.s.hero.mana[c] = 0;
  const n = step(f.s, f.command);
  assert.equal(n.hero.xp, 0);
  assert.equal(n.hero.items.barrier, 3);
  for (const c of COLORS) assert.equal(n.hero.mana[c], 3);
});
test('coin build can heal, charge ledger and create a shared skull without synthetic coins retriggering', () => {
  const f = fixture('gold');
  gear(f.s, 'goldenLining', 'ledger', 'mint');
  f.s.hero.hp = 990;
  f.s.hero.items.ledgerCoins = 3;
  const n = step(f.s, f.command);
  assert.equal(n.hero.hp, 993);
  assert.equal(n.hero.gold, 1);
  assert.equal(n.hero.items.ledgerReady, true);
  assert.equal(n.hero.items.initiative.mint, true);
});
test('a complete legal four-biome run reaches all bosses and restores from its command journal', async () => {
  // Freeze the v3 visible policy together with its winning seed. New loot must not
  // reinterpret an old recorded route or require this old policy to win in v4.
  const { statPrice } = await import('../game/duel/legacy-v3/engine.ts');
  const value = {
    paperKnife: 3,
    stylus: 6,
    coat: 10,
    apron: 5,
    copperClip: 3,
    bluePass: 4,
    scholar: 5,
    abacus: 4,
    graphite: 2,
    cottonCuffs: 6,
    teaBag: 4,
    lens: 5,
    tideNeedle: 5,
    chargeSeal: 3,
    pocketVest: 3,
    answerCloak: 6,
    tidePurse: 4,
    reservoir: 4,
    wick: 3,
    conductor: 7,
    emberKnife: 7,
    archiveVest: 6,
    metronome: 8,
    fireSeal: 6,
    fullBlade: 5,
    contractBlade: 4,
    veil: 7,
    overflowRobe: 4,
    catalyst: 10,
    mint: 5,
    ward: 5,
    bloodInkwell: 6,
    mortgage: 3,
    saltCoat: 6,
    prism: 5,
    waterwheel: 5,
    quarterCutter: 2,
    mirrorVest: 14,
    insurance: 3,
    carbonPaper: 12,
    capacitor: 7,
    glassNib: 8,
    ledger: 6,
    directorPen: 9,
    spinningTop: 12,
    infiniteDiploma: 7,
    goldenLining: 10,
    eclipseRing: 9,
  };
  let s = start({ mode: 'route', seed: 3, classId: 'elementalist' }),
    camps = 0;
  for (let i = 0; i < 4000 && ['battle', 'camp'].includes(s.phase); i++) {
    if (s.phase === 'battle') s = step(s, chooseAction(s));
    else {
      camps++;
      const upgrade = (id) =>
        value[id] - (value[s.hero.gear[ITEMS[id].slot]] ?? 0);
      const best = s.offers.slice().sort((a, b) => upgrade(b) - upgrade(a))[0];
      s = step(s, {
        type: 'reward',
        item: best && upgrade(best) > 0 ? best : null,
      });
      const purchase = s.stock
        .slice()
        .sort((a, b) => upgrade(b) - upgrade(a))
        .find((id) => upgrade(id) > 1 && s.hero.gold >= ITEMS[id].price);
      if (purchase) s = step(s, { type: 'buy', item: purchase });
      for (let j = 0; j < 20; j++) {
        const primary =
          CLASSES.elementalist.cheap.find((k) => k !== 'cunning') ?? 'fire';
        const choices =
          s.hero.stats.morale < 9 ? ['morale', primary] : [primary, 'morale'];
        const stat = choices.find(
          (k) => s.hero.stats[k] < 18 && s.hero.points >= statPrice(s, k),
        );
        if (!stat) break;
        s = step(s, { type: 'train', stat });
      }
      s = step(s, { type: 'next' });
    }
  }
  assert.equal(s.phase, 'won');
  assert.equal(s.room, 19);
  assert.equal(camps, 19);
  assert.ok(s.commands.length < 6000);
  assert.deepEqual(loadDuel(saveDuel(s)), s);
  const current = await import('../game/duel/engine.ts');
  assert.deepEqual(current.loadDuel(current.saveDuel(s)), s);
});

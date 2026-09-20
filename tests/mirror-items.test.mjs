import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../game/duel/catalog.ts';
import { CHANNELS } from '../game/mirror/board.ts';
import * as items from '../game/mirror/items.ts';

// Hook fixtures control the visible group/resources. Whole swaps, RNG and save
// replay are exercised by the separate Mirror engine suite.
function fixture(...gear) {
  const hero = {
    hp: 90,
    maxHp: 120,
    barrier: 0,
    rage: 0,
    resonance: Object.fromEntries(CHANNELS.map((k) => [k, 0])),
    gear: Object.fromEntries(gear.map((id) => [ITEMS[id].slot, id])),
    physical: 8,
    magic: 8,
    healing: 5,
    gold: 0,
    xp: 0,
    level: 1,
    itemState: items.freshItemMemory(),
  };
  const enemy = {
    hp: 1000,
    maxHp: 1000,
    countdown: 2,
    delay: 0,
    weaken: 0,
    cycle: 0,
    intents: [{ kind: 'attack', damage: 10, hits: 1 }],
  };
  const state = {
    hero,
    enemy,
    action: 1,
    guard: false,
    board: Array.from({ length: 56 }, (_, i) => ({
      id: i + 1,
      kind: CHANNELS[i % 4],
      level: 1,
    })),
    log: [],
  };
  const ctx = {
    state,
    hero,
    enemy,
    damage: (n) => {
      enemy.hp = Math.max(0, enemy.hp - n);
    },
    heal: (n) => {
      const gained = Math.min(n, hero.maxHp - hero.hp);
      hero.hp += gained;
      return gained;
    },
    addBarrier: (n) => {
      const gained = Math.min(n, 12 - hero.barrier);
      hero.barrier += gained;
      return gained;
    },
    grantResonance: (kind, n) => {
      const gain = Math.min(n, items.resonanceCap(hero) - hero.resonance[kind]);
      hero.resonance[kind] += gain;
      if (n - gain > 0) items.onOverflow(ctx, n - gain);
      return n - gain;
    },
    addGold: (n) => {
      hero.gold += n;
    },
    addXp: (n) => {
      hero.xp += n;
    },
    delayEnemy: () => {
      if (enemy.delay || hero.itemState.cycle.delayUsed) return false;
      enemy.delay = 1;
      hero.itemState.cycle.delayUsed = 1;
      return true;
    },
    random: () => 0.5,
    log: (text) => state.log.push(text),
  };
  ctx.group = (kind, options = {}) => {
    const shape = options.shape ?? 'three';
    const count =
      options.count ?? (shape === 'three' ? 3 : shape === 'four' ? 4 : 5);
    const cells =
      options.cells ?? Array.from({ length: count }, (_, i) => i + 17);
    for (const i of cells)
      state.board[i] = {
        ...state.board[i],
        kind,
        level: options.special ? 2 : 1,
      };
    const event = {
      match: {
        kind,
        cells,
        longest: count,
        shape,
        casts: shape === 'three' ? 1 : shape === 'four' ? 2 : 4,
        bonus: 0,
        upgrade: shape === 'three' ? undefined : shape === 'four' ? 2 : 'super',
      },
      channel: kind === 'super' ? null : kind,
      firstWave: options.firstWave ?? true,
      special: options.special ?? kind === 'super',
      manual: options.manual ?? kind !== 'super',
      removed: new Set(cells),
      protectedTiles: new Map(),
      baseDamage:
        options.damage ??
        (kind === 'strike' || kind === 'arcane' || kind === 'super' ? 8 : 0),
      bonusDamage: 0,
      bonusScale: 1,
      income: kind === 'super' ? 0 : cells.length,
      cancelUpgrade: false,
    };
    items.beforeGroup(ctx, event);
    if (event.channel) ctx.grantResonance(event.channel, event.income);
    ctx.damage(
      event.baseDamage * event.bonusScale * event.match.casts +
        event.bonusDamage,
    );
    items.afterGroup(ctx, event);
    return event;
  };
  ctx.income = (kind, n) => {
    if (kind === 'gold') ctx.addGold(n);
    else if (!items.owns(hero, 'infiniteDiploma')) ctx.addXp(n);
    items.onIncome(ctx, kind, n);
  };
  ctx.next = () => {
    state.action++;
    items.startAction(ctx);
  };
  ctx.hit = (n, index = 0) => {
    let damage = items.beforeEnemyHit(ctx, n, index);
    const absorbed = Math.min(damage, hero.barrier);
    hero.barrier -= absorbed;
    damage -= absorbed;
    damage = items.afterBarrierDamage(ctx, damage);
    damage = items.preventDeath(ctx, damage);
    const lost = Math.min(hero.hp, damage);
    hero.hp -= lost;
    items.afterEnemyHit(ctx, lost, absorbed, index);
    return { lost, absorbed };
  };
  return ctx;
}

test('all 60 items retain identity/slot/rarity, with explicit Mirror descriptions', () => {
  assert.equal(Object.keys(items.MIRROR_ITEMS).length, 60);
  for (const [id, old] of Object.entries(ITEMS)) {
    const converted = items.MIRROR_ITEMS[id];
    assert.equal(converted.id, id);
    assert.equal(converted.slot, old.slot);
    assert.equal(converted.rarity, old.rarity);
    assert.ok(converted.description.length > 20);
    assert.notEqual(converted.description, old.description);
    assert.doesNotMatch(
      converted.description,
      /маны|звёзд|Передышка|ход переходит/i,
      id,
    );
  }
});

test('paper knife, stylus and glass nib bonuses are bounded per group/action, never multiplied by repeat hits', () => {
  const knife = fixture('paperKnife');
  knife.group('strike');
  knife.group('strike');
  assert.equal(knife.enemy.hp, 983);
  const pen = fixture('stylus');
  pen.group('arcane', { shape: 'four', special: true });
  assert.equal(pen.enemy.hp, 982);
  pen.group('arcane');
  assert.equal(pen.enemy.hp, 974);
  const glass = fixture('glassNib');
  glass.group('super');
  assert.equal(glass.enemy.hp, 987);
  assert.equal(glass.hit(10).lost, 11);
  assert.equal(glass.hit(10, 1).lost, 10);
});

test('common physical collection produces finite gifts without re-triggering collection', () => {
  const f = fixture('copperClip', 'fireSeal');
  f.group('strike');
  assert.equal(f.hero.resonance.arcane, 1);
  assert.equal(f.hero.resonance.strike, 5);
  assert.equal(f.hero.itemState.action['collected:strike'], 3);
  f.group('strike');
  assert.equal(f.hero.resonance.arcane, 1);
  assert.equal(f.hero.resonance.strike, 8);
  const earth = fixture('apron', 'teaBag');
  earth.group('rage');
  assert.equal(earth.hero.barrier, 2);
  assert.equal(earth.hero.resonance.mend, 1);
});

test('battle starts grant blue pass/pocket vest without erasing spent run insurance', () => {
  const f = fixture('bluePass', 'pocketVest');
  f.hero.itemState.run.insurance = 1;
  items.startBattle(f);
  assert.equal(f.hero.barrier, 6);
  assert.equal(f.hero.resonance.mend, 2);
  assert.equal(f.hero.resonance.rage, 2);
  assert.equal(f.hero.itemState.run.insurance, 1);
});

test('tide needle and cotton cuffs count physical healing stones and enforce encounter cap', () => {
  const f = fixture('tideNeedle', 'cottonCuffs');
  for (let i = 0; i < 10; i++) {
    f.group('mend');
    f.next();
  }
  assert.equal(f.enemy.hp, 980);
  assert.equal(f.hero.hp, 96);
});

test('long physical weapon bonuses, quarter-cutter drawback and later bonuses', () => {
  const hammer = fixture('chargeSeal');
  hammer.group('strike', { shape: 'four' });
  hammer.group('strike', { shape: 'four' });
  assert.equal(hammer.enemy.hp, 964);
  const cutter = fixture('quarterCutter');
  cutter.group('strike');
  cutter.group('strike', { special: true });
  assert.equal(cutter.enemy.hp, 1000);
  cutter.group('strike', { shape: 'four' });
  assert.equal(cutter.enemy.hp, 976);
});

test('resource capacity keeps risky Open Ring / Full Blade / Overflow / Reserve relationships', () => {
  const f = fixture('fullBlade', 'openRing');
  assert.equal(items.resonanceCap(f.hero), 6);
  for (const k of CHANNELS) f.hero.resonance[k] = 6;
  f.group('strike');
  assert.equal(f.enemy.hp, 976);
  assert.equal(f.hero.resonance.arcane, 4);
  const bigger = fixture('reservoir', 'openRing');
  assert.equal(items.resonanceCap(bigger.hero), 14);
  const overflow = fixture('overflowRobe', 'openRing');
  overflow.hero.resonance.arcane = 6;
  overflow.group('arcane');
  assert.equal(overflow.hero.barrier, 3);
  overflow.group('arcane');
  assert.equal(overflow.hero.barrier, 3);
  const reserve = fixture('reserveLining', 'openRing');
  reserve.hero.resonance.rage = 6;
  assert.equal(reserve.hit(10).lost, 6);
  assert.equal(reserve.hero.resonance.rage, 3);
});

test('contract blade / mortgage have real health conditions and self-cost bypasses defensive responses', () => {
  const contract = fixture('contractBlade');
  contract.hero.hp = 60;
  contract.group('strike');
  assert.equal(contract.enemy.hp, 987);
  contract.next();
  contract.hero.hp = 61;
  contract.group('strike');
  assert.equal(contract.enemy.hp, 979);
  const debt = fixture('mortgage', 'answerCloak');
  debt.hero.barrier = 12;
  debt.group('strike');
  assert.equal(debt.hero.hp, 88);
  assert.equal(debt.hero.barrier, 12);
  assert.equal(debt.hero.itemState.battle.answer, undefined);
  debt.next();
  debt.hero.hp = 2;
  debt.group('strike');
  assert.equal(debt.hero.hp, 2);
});

test('ember, graphite and metronome charges affect a later group, never the group that creates them', () => {
  const ember = fixture('emberKnife');
  ember.group('strike');
  assert.equal(ember.enemy.hp, 992);
  ember.next();
  ember.group('strike');
  assert.equal(ember.enemy.hp, 981);
  const graphite = fixture('graphite');
  graphite.group('arcane');
  graphite.group('strike');
  assert.equal(graphite.enemy.hp, 982);
  graphite.next();
  graphite.group('strike');
  assert.equal(graphite.enemy.hp, 974);
  const metronome = fixture('metronome');
  metronome.group('arcane', { special: true });
  assert.equal(metronome.enemy.hp, 992);
  metronome.group('super');
  assert.equal(metronome.enemy.hp, 981);
});

test('veil enhances the next strike and expires after three later actions', () => {
  const f = fixture('veil');
  f.group('arcane', { shape: 'four' });
  f.group('strike');
  assert.equal(f.enemy.hp, 972);
  f.group('arcane', { shape: 'four' });
  for (let i = 0; i < 4; i++) f.next();
  const before = f.enemy.hp;
  f.group('strike');
  assert.equal(before - f.enemy.hp, 8);
});

test('conductor, prism and director respond to distinct physical channels, not gifted resonance', () => {
  const f = fixture('directorPen', 'prism', 'conductor');
  f.grantResonance('mend', 12);
  assert.equal(f.enemy.hp, 1000);
  f.group('strike');
  f.group('arcane');
  assert.equal(f.hero.resonance.rage, 2);
  f.group('mend');
  assert.equal(f.hero.barrier, 2);
  f.group('rage');
  assert.equal(f.hero.barrier, 6);
  assert.equal(f.enemy.hp, 973);
  f.next();
  for (const k of CHANNELS) f.group(k);
  assert.equal(f.hero.itemState.cycle.directorPen, 1);
});

test('upgraded ability items activate once per group/cycle and have explicit health price', () => {
  const f = fixture('stylus', 'saltCoat', 'carbonPaper', 'bloodInkwell');
  f.group('arcane', { shape: 'four', special: true });
  assert.equal(f.enemy.hp, 975);
  assert.equal(f.hero.hp, 88);
  assert.equal(f.hero.barrier, 3);
  f.group('super');
  assert.equal(f.enemy.hp, 965);
  assert.equal(f.hero.hp, 88);
  assert.equal(f.hero.barrier, 3);
  items.afterEnemyAction(f);
  f.group('super');
  assert.equal(f.hero.hp, 86);
  const catalyst = fixture('catalyst');
  catalyst.group('arcane', { special: true });
  assert.equal(catalyst.hero.resonance.arcane, 5);
  catalyst.group('arcane', { special: true });
  assert.equal(catalyst.hero.resonance.arcane, 8);
});

test('capacitor is intentionally dormant alone, charges from actual item expenditure, pays only in later action', () => {
  const f = fixture('fullBlade', 'capacitor');
  for (const k of CHANNELS) f.hero.resonance[k] = 12;
  f.group('strike');
  assert.equal(f.hero.itemState.battle.capacitorSpent, 8);
  f.next();
  for (const k of CHANNELS) f.hero.resonance[k] = 12;
  f.group('strike');
  assert.ok(f.hero.itemState.battle.capacitorReady);
  assert.equal(f.hero.resonance.arcane, 10);
  f.next();
  f.hero.resonance.arcane = 0;
  f.group('arcane');
  assert.equal(f.hero.resonance.arcane, 7);
  assert.equal(f.hero.itemState.battle.capacitorReady, undefined);
  const alone = fixture('capacitor');
  for (let i = 0; i < 8; i++) {
    alone.group('arcane', { special: true });
    alone.next();
  }
  assert.equal(alone.hero.itemState.battle.capacitorReady, undefined);
});

test('XP income adapters remain live without star tiles, and Diploma cannot remove previous XP', () => {
  const f = fixture('scholar', 'archiveVest');
  for (let i = 0; i < 5; i++) {
    f.income('xp', 1);
    f.next();
  }
  assert.equal(f.hero.xp, 11);
  assert.equal(f.hero.barrier, 12);
  const lens = fixture('lens');
  lens.income('xp', 1);
  assert.equal(lens.hero.xp, 1);
  assert.equal(lens.hero.resonance.arcane, 2);
  const diploma = fixture('infiniteDiploma', 'archiveVest');
  diploma.hero.xp = 40;
  diploma.income('xp', 1);
  assert.equal(diploma.hero.xp, 40);
  assert.equal(diploma.hero.barrier, 3);
  for (const k of CHANNELS) assert.equal(diploma.hero.resonance[k], 1);
});

test('native combo gold triggers abacus and ledger, while tide purse is a bounded gift', () => {
  const f = fixture('ledger', 'abacus');
  f.income('gold', 3);
  assert.equal(f.hero.barrier, 2);
  f.next();
  f.income('gold', 3);
  assert.equal(f.hero.itemState.battle.ledgerReady, 1);
  f.group('strike');
  assert.equal(f.enemy.hp, 986);
  assert.equal(f.hero.itemState.battle.ledgerReady, undefined);
  const purse = fixture('tidePurse', 'abacus');
  for (let i = 0; i < 8; i++) {
    purse.group('mend');
    purse.next();
  }
  assert.equal(purse.hero.gold, 8);
  assert.equal(purse.hero.barrier, 0);
});

test('mint consumes native or purse gold events and upgrades surviving strikes without changing families', () => {
  const native = fixture('mint');
  const before = native.state.board.map((t) => t.kind);
  native.income('gold', 2);
  assert.deepEqual(
    native.state.board.map((t) => t.kind),
    before,
  );
  assert.equal(native.state.board.filter((t) => t.level === 2).length, 1);
  native.next();
  native.income('gold', 3);
  assert.equal(native.state.board.filter((t) => t.level === 2).length, 1);
  const purse = fixture('tidePurse', 'mint');
  purse.group('mend');
  assert.equal(purse.state.board.filter((t) => t.level === 2).length, 1);
});

test('golden lining pays shop currency only for real healing and enforces cycle/encounter caps', () => {
  const f = fixture('goldenLining');
  for (let i = 0; i < 6; i++) {
    f.income('gold', 3);
    f.next();
    items.afterEnemyAction(f);
  }
  assert.equal(f.hero.hp, 102);
  assert.equal(f.hero.gold, 10);
  assert.equal(f.hero.itemState.battle.goldenHealed, 12);
  const full = fixture('goldenLining');
  full.hero.hp = 120;
  full.income('gold', 3);
  assert.equal(full.hero.gold, 3);
});

test('waterwheel spends strike reserves; exchange coupon moves rather than creates reserves', () => {
  const wheel = fixture('waterwheel');
  wheel.hero.resonance.strike = 2;
  wheel.group('mend');
  assert.equal(wheel.hero.resonance.strike, 0);
  assert.equal(wheel.hero.resonance.rage, 3);
  const f = fixture('exchangeCoupon', 'capacitor');
  f.hero.resonance.strike = 12;
  f.income('gold', 3);
  assert.equal(f.hero.resonance.strike, 10);
  assert.equal(f.hero.resonance.arcane, 2);
  assert.equal(f.hero.itemState.battle.capacitorSpent, undefined);
  const equal = fixture('exchangeCoupon');
  equal.income('gold', 3);
  assert.equal(
    Object.values(equal.hero.resonance).reduce((a, b) => a + b),
    0,
  );
});

test('eclipse ring keeps its health price even on full reserves', () => {
  const f = fixture('eclipseRing');
  for (const k of CHANNELS) f.hero.resonance[k] = 12;
  f.group('arcane', { shape: 'four' });
  assert.equal(f.hero.hp, 88);
  f.next();
  f.group('arcane', { shape: 'four' });
  assert.equal(f.hero.hp, 88);
  items.afterEnemyAction(f);
  f.hero.hp = 2;
  f.group('arcane', { shape: 'four' });
  assert.equal(f.hero.hp, 2);
});

test('audit, edge and agreement share the same raw income budget and keep all physical stones', () => {
  const f = fixture('auditPencil', 'edgeSleeves', 'agreementSheet');
  const e = f.group('mend', { cells: [0, 1, 2] });
  assert.equal(e.income, 0);
  assert.equal(f.hero.resonance.mend, 0);
  assert.equal(f.hero.barrier, 3);
  assert.equal(f.enemy.weaken, 2);
  assert.equal(e.protectedTiles.get(1).kind, 'rage');
  assert.equal(f.hero.itemState.action['collected:mend'], 3);
  const middle = fixture('edgeSleeves');
  middle.group('mend', { cells: [17, 18, 19] });
  assert.equal(middle.hero.barrier, 0);
});

test('dull punch trades actual base damage, with no loss at full barrier', () => {
  const f = fixture('dullPunch');
  f.group('strike');
  assert.equal(f.enemy.hp, 994);
  assert.equal(f.hero.barrier, 2);
  const full = fixture('dullPunch');
  full.hero.barrier = 12;
  full.group('strike');
  assert.equal(full.enemy.hp, 992);
  const upgraded = fixture('dullPunch');
  upgraded.group('strike', { special: true });
  assert.equal(upgraded.hero.barrier, 0);
});

test('safety magnet disarms a remaining bomb or sacrifices a future upgraded strike, never a removed tile', () => {
  const bomb = fixture('safetyMagnet');
  bomb.state.board[3].bomb = 2;
  bomb.group('arcane');
  assert.equal(bomb.state.board[3].bomb, undefined);
  const risk = fixture('safetyMagnet');
  risk.state.board[4].level = 3;
  risk.group('arcane');
  assert.equal(risk.state.board[4].level, 2);
  const later = fixture('safetyMagnet');
  later.state.board[3].bomb = 2;
  later.group('arcane', { firstWave: false });
  assert.equal(later.state.board[3].bomb, 2);
});

test('wick promotes only a surviving normal strike, once per enemy cycle', () => {
  const f = fixture('wick');
  f.group('strike', { shape: 'four' });
  assert.equal(f.state.board.filter((t) => t.level === 2).length, 1);
  f.next();
  f.group('strike', { shape: 'four' });
  assert.equal(f.state.board.filter((t) => t.level === 2).length, 1);
});

test('shift ring remembers only accepted prior action and trades one native unit', () => {
  const f = fixture('shiftRing');
  f.group('strike');
  items.afterAction(f);
  f.next();
  const e = f.group('mend');
  assert.equal(e.income, 2);
  assert.equal(f.hero.resonance.strike, 4);
  assert.equal(f.hero.resonance.mend, 2);
  items.afterAction(f);
  f.next();
  f.group('super');
  items.afterAction(f);
  assert.equal(f.hero.itemState.previous, undefined);
});

test('yield ring sacrifices an upgrade only with deliberate guard mode, capacity and battle uses', () => {
  const f = fixture('yieldRing');
  assert.equal(f.group('arcane', { shape: 'four' }).cancelUpgrade, false);
  f.state.guard = true;
  f.next();
  assert.equal(f.group('arcane', { shape: 'four' }).cancelUpgrade, true);
  assert.equal(f.hero.barrier, 5);
  f.hero.barrier = 12;
  assert.equal(f.group('arcane', { shape: 'four' }).cancelUpgrade, false);
  for (let i = 0; i < 2; i++) {
    f.hero.barrier = 0;
    f.next();
    f.group('arcane', { shape: 'four' });
  }
  f.hero.barrier = 0;
  assert.equal(f.group('arcane', { shape: 'four' }).cancelUpgrade, false);
  assert.equal(f.hero.itemState.battle.yieldUses, 3);
});

test('last pass captures first-wave poverty, does not reward long groups and shares bounded delay with top', () => {
  const f = fixture('lastPass');
  f.group('strike');
  f.group('arcane', { firstWave: false });
  f.group('rage', { firstWave: false });
  items.afterAction(f);
  assert.equal(f.enemy.delay, 1);
  assert.equal(f.hero.itemState.battle.lastPassUsed, 1);
  const long = fixture('lastPass');
  long.group('strike');
  long.group('arcane', { shape: 'four', firstWave: false });
  items.afterAction(long);
  assert.equal(long.enemy.delay, 0);
  const top = fixture('spinningTop', 'lastPass');
  top.hero.itemState.battle.topCasts = 2;
  top.group('strike');
  top.group('super', { firstWave: false });
  items.afterAction(top);
  assert.equal(top.enemy.delay, 1);
  assert.equal(top.hero.itemState.battle.lastPassUsed, undefined);
});

test('defense applies coat, barrier, reserve, insurance and reflection at distinct stages', () => {
  const coat = fixture('coat', 'glassNib');
  assert.equal(coat.hit(10).lost, 9);
  assert.equal(coat.hit(10, 1).lost, 10);
  const reserve = fixture('reserveLining');
  reserve.hero.barrier = 3;
  reserve.hero.resonance.arcane = 9;
  assert.deepEqual(reserve.hit(10), { lost: 3, absorbed: 3 });
  assert.equal(reserve.hero.resonance.arcane, 6);
  assert.equal(reserve.hit(10, 1).lost, 10);
  const insurance = fixture('insurance');
  insurance.hero.hp = 3;
  assert.equal(insurance.hit(100).lost, 2);
  assert.equal(insurance.hero.hp, 1);
  assert.equal(insurance.hero.barrier, 6);
  assert.equal(insurance.hit(8, 1).lost, 1);
  assert.equal(insurance.hero.hp, 0);
  const reflect = fixture('mirrorVest');
  items.startAction(reflect);
  reflect.hit(1);
  reflect.hit(1, 1);
  assert.equal(reflect.enemy.hp, 999);
});

test('waiting vest answers only a second hit, with a real reserve payment; answer cloak needs HP loss', () => {
  const f = fixture('waitingVest', 'bluePass');
  items.startBattle(f);
  assert.equal(f.hit(10).lost, 10);
  assert.equal(f.hero.resonance.rage, 2);
  assert.equal(f.hit(10, 1).lost, 6);
  assert.equal(f.hero.resonance.rage, 0);
  assert.equal(f.hit(10, 2).lost, 10);
  const answer = fixture('answerCloak');
  answer.hero.barrier = 12;
  answer.hit(3);
  assert.equal(answer.hero.itemState.battle.answer, undefined);
  answer.hit(12, 1);
  assert.equal(answer.hero.itemState.battle.answer, 1);
  answer.group('strike');
  assert.equal(answer.enemy.hp, 989);
});

test('ward only cancels the first hit, never later hits or resource effects', () => {
  const f = fixture('ward');
  f.random = () => 0.1;
  assert.equal(f.hit(10).lost, 0);
  assert.equal(f.hit(10, 1).lost, 10);
});

test('magnet ignores bombs already removed by the matched groups adjacency', () => {
  const f = fixture('safetyMagnet');
  f.state.board[9].bomb = 2; // Adjacent to matched 17: cleared without Magnet.
  f.state.board[55].bomb = 2;
  f.group('arcane', { cells: [17, 18, 19] });
  assert.equal(f.state.board[9].bomb, 2); // The engine owns the adjacent clear.
  assert.equal(f.state.board[55].bomb, undefined);
});

test('shift ring evaluates the first ordinary group only, not a later group of another kind', () => {
  const f = fixture('shiftRing');
  f.hero.itemState.previous = 'strike';
  f.group('strike');
  const later = f.group('mend');
  assert.equal(later.income, 3);
  assert.equal(f.hero.resonance.strike, 3);
  assert.equal(f.hero.resonance.mend, 3);
});

test('replacement warnings consider resulting equipment, not the removed item', () => {
  const f = fixture('fullBlade', 'openRing');
  assert.ok(!items.itemWarnings(f.hero).some((s) => s.includes('пока нечем')));
  assert.ok(
    items
      .itemWarnings(f.hero, 'paperKnife')
      .some((s) => s.includes('пока нечем')),
  );
  const dormant = fixture('capacitor');
  assert.ok(
    items.itemWarnings(dormant.hero).some((s) => s.includes('нет предмета')),
  );
});

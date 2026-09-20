import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from '../game/mirror/engine.ts';
import { CHANNELS } from '../game/mirror/board.ts';

const config = (gear, seed = 71) => ({
  seed,
  classId: 'blade',
  mode: 'duel',
  foe: 0,
  testGear: gear,
});
function setGroup(s, kind, size = 3, level = 1) {
  const alternatives = CHANNELS.filter((k) => k !== kind);
  s.board = Array.from({ length: 56 }, (_, i) => ({
    id: ++s.nextId,
    kind: alternatives[((i % 8) + Math.floor(i / 8)) % alternatives.length],
    level: 1,
  }));
  for (let i = 0; i < size - 1; i++)
    s.board[8 + i] = { id: ++s.nextId, kind, level: i === 0 ? level : 1 };
  s.board[16 + size - 1] = { id: ++s.nextId, kind, level: 1 };
  return { type: 'swap', a: 8 + size - 1, b: 16 + size - 1 };
}
function single(
  gear,
  kind = 'strike',
  size = 3,
  level = 1,
  prepare = () => {},
) {
  // Select a seeded first wave with no incidental refill cascade. This isolates
  // the two-item integration contract without mocking the engine's refill.
  for (let seed = 1; seed <= 100; seed++) {
    const s = createGame(config(gear, seed));
    s.hero.hp = 60;
    s.enemy.hp = s.enemy.maxHp = 9999;
    const command = setGroup(s, kind, size, level);
    prepare(s);
    const result = dispatch(s, command);
    assert.equal(result.error, undefined);
    if (result.frames.filter((f) => f.kind === 'match').length === 1)
      return { before: s, ...result };
  }
  assert.fail('No isolated seeded wave fixture');
}

function freeSuper(previous, skill = 'nova') {
  for (let seed = 1; seed <= 100; seed++) {
    const s = structuredClone(previous);
    s.rng.board = seed;
    s.skills.super = skill;
    s.board = Array.from({ length: 56 }, (_, i) => ({
      id: ++s.nextId,
      kind: CHANNELS[((i % 8) + Math.floor(i / 8)) % 4],
      level: 1,
    }));
    s.board[55].kind = 'super';
    const result = dispatch(s, { type: 'super', cell: 55 });
    assert.equal(result.error, undefined);
    if (result.frames.length === 1) return { before: s, ...result };
  }
  assert.fail('No isolated seeded super fixture');
}

test('real swap: Open Ring / Full Blade spends the pre-group full reserve, not the incoming collection', () => {
  const full = single(['fullBlade', 'openRing'], 'strike', 3, 1, (s) => {
    for (const k of CHANNELS) s.hero.resonance[k] = 6;
  });
  assert.equal(full.state.last.damage, full.before.hero.physical + 16);
  assert.equal(full.state.hero.resonance.arcane, 4);
  const filling = single(['fullBlade', 'openRing'], 'strike', 3, 1, (s) => {
    s.hero.resonance.strike = 3;
  });
  assert.equal(filling.state.hero.resonance.strike, 6);
  assert.equal(filling.state.last.damage, filling.before.hero.physical);
});

test('real swap: Dull Punch and Mirror Vest turn lost attack into reflected defense', () => {
  const result = single(['dullPunch', 'mirrorVest'], 'strike', 3, 1, (s) => {
    s.enemy.countdown = 1;
    s.enemy.intents = [
      { kind: 'attack', name: 'Test hit', wait: 3, damage: 6, hits: 1 },
    ];
  });
  assert.equal(
    result.frames[0].enemyHp,
    9999 - (result.before.hero.physical - 2),
  );
  assert.equal(result.state.hero.hp, 58); // 6 incoming, 4 barrier, 2 HP.
  assert.equal(result.state.last.damage, result.before.hero.physical); // Two reflected damage restore the sacrificed damage.
  assert.equal(result.state.hero.barrier, 0);
});

test('real swap: native combo gold powers Ledger and Golden Lining without nonexistent gold tiles', () => {
  const result = single(['ledger', 'goldenLining'], 'strike', 5);
  assert.equal(result.state.last.casts, 4);
  assert.equal(result.state.hero.gold, 1); // 3 earned; 2 spent.
  assert.equal(result.state.hero.hp, 63);
  assert.equal(result.state.hero.itemState.battle.ledgerCoins, 3);
  assert.equal(result.state.hero.itemState.battle.goldenHealed, 3);
});

test('real upgraded group: Diploma converts only new XP while Archive Vest retains its physical trigger', () => {
  const result = single(
    ['infiniteDiploma', 'archiveVest'],
    'arcane',
    3,
    2,
    (s) => {
      s.hero.xp = 40;
    },
  );
  assert.equal(result.state.hero.xp, 40);
  assert.equal(result.state.hero.barrier, 3);
  assert.equal(result.state.hero.resonance.strike, 1);
  assert.equal(result.state.hero.resonance.arcane, 4);
  assert.equal(result.state.last.xp, 0);
});

test('real flurry: Waiting Vest pays Blue Pass reserve only between hits', () => {
  const result = single(['waitingVest', 'bluePass'], 'strike', 3, 1, (s) => {
    s.enemy.countdown = 1;
    s.enemy.intents = [
      { kind: 'flurry', name: 'Test series', wait: 3, damage: 6, hits: 3 },
    ];
  });
  assert.equal(result.state.hero.hp, 58); // Total 6 split as 2 + 2 + 2; 4 shield arrives after the first hit.
  assert.equal(result.state.hero.resonance.rage, 0);
  assert.equal(result.state.enemy.cycle, 1);
});

test('real flurry: Waiting Vest does not spend resonance for a hit fully covered by existing defense', () => {
  const result = single(['waitingVest', 'bluePass'], 'strike', 3, 1, (s) => {
    s.hero.barrier = 12;
    s.enemy.countdown = 1;
    s.enemy.intents = [
      { kind: 'flurry', name: 'Covered series', wait: 3, damage: 12, hits: 2 },
    ];
  });
  assert.equal(result.state.hero.hp, 60);
  assert.equal(result.state.hero.resonance.rage, 2);
  assert.equal(result.state.hero.barrier, 0);
  assert.equal(result.state.enemy.cycle, 1);
});

test('real guard exchange: Yield Ring cancels creation but keeps repeated attack and spends time', () => {
  const result = single(['yieldRing', 'mirrorVest'], 'strike', 4, 1, (s) => {
    s.guard = true;
  });
  assert.equal(result.state.last.casts, 2);
  assert.equal(result.state.last.created, 0);
  assert.equal(result.state.hero.barrier, 7);
  assert.equal(result.state.hero.itemState.battle.yieldUses, 1);
  assert.equal(result.state.enemy.countdown, result.before.enemy.countdown - 1);
});

test('real HP-priced items still pay through full barrier and never trigger enemy-damage responses', () => {
  for (const [weapon, ring, kind, size, level] of [
    ['mortgage', undefined, 'strike', 3, 1],
    [undefined, 'bloodInkwell', 'arcane', 3, 2],
    [undefined, 'eclipseRing', 'arcane', 4, 1],
  ]) {
    const gear = [weapon, ring, 'answerCloak', 'insurance'].filter(Boolean);
    const result = single(gear, kind, size, level, (s) => {
      s.hero.barrier = 12;
      for (const k of CHANNELS) s.hero.resonance[k] = 12;
    });
    assert.equal(result.state.hero.hp, 58, weapon ?? ring);
    assert.equal(result.state.hero.barrier, 12, weapon ?? ring);
    assert.equal(result.state.hero.itemState.battle.answer, undefined);
    assert.equal(result.state.hero.itemState.run.insurance, undefined);
    assert.equal(result.state.last.healing, 0);
  }
});

test('real Yield Ring never destroys an enhanced-stone reward when shared barrier is full', () => {
  const result = single(['yieldRing'], 'strike', 4, 1, (s) => {
    s.guard = true;
    s.hero.barrier = 12;
  });
  assert.equal(result.state.last.created, 1);
  assert.equal(result.state.hero.itemState.battle.yieldUses, undefined);
  assert.equal(result.state.hero.barrier, 12);
});

test('real defense groups avoid paying sleeves resonance or surrendering upgrades for redundant barrier', () => {
  const sleeves = single(['edgeSleeves'], 'mend', 3, 1, (s) => {
    s.hero.barrier = 9;
  });
  assert.equal(sleeves.state.hero.barrier, 12);
  assert.equal(sleeves.state.hero.resonance.mend, 3);
  assert.equal(sleeves.state.hero.itemState.action.edgeSleeves, undefined);
  const ring = single(['yieldRing'], 'mend', 4, 1, (s) => {
    s.guard = true;
    s.hero.barrier = 4;
  });
  assert.equal(ring.state.hero.barrier, 12);
  assert.equal(ring.state.last.created, 1);
  assert.equal(ring.state.hero.itemState.battle.yieldUses, undefined);
  const useful = single(['yieldRing'], 'mend', 4, 1, (s) => {
    s.guard = true;
  });
  assert.equal(useful.state.hero.barrier, 12);
  assert.equal(useful.state.last.created, 0);
  assert.equal(useful.state.hero.itemState.battle.yieldUses, 1);
});

test('Yield Ring checks actual protection after a defensive strike before sacrificing its upgrade', () => {
  const result = single(['yieldRing'], 'strike', 4, 2, (s) => {
    s.guard = true;
    s.hero.barrier = 10;
    s.skills.strike = 'leech';
  });
  assert.equal(result.state.hero.barrier, 12);
  assert.equal(result.state.last.created, 1);
  assert.equal(result.state.hero.itemState.battle.yieldUses, undefined);
  assert.equal(result.state.hero.hp, 60);
});

test('real defense groups: Salt Coat pays two barrier once per group, not per repeated cast', () => {
  for (const [size, level, expected, coated] of [
    [3, 1, 4, 2],
    [4, 1, 8, 6],
    [3, 2, 6, 7], // Six base, minus two cost, plus three for the first enhanced group.
    [3, 3, 8, 9],
  ]) {
    const baseline = single([], 'mend', size, level);
    const coat = single(['saltCoat'], 'mend', size, level);
    assert.equal(baseline.state.hero.barrier, expected);
    assert.equal(coat.state.hero.barrier, coated);
    assert.equal(baseline.state.hero.hp, 60);
    assert.equal(coat.state.hero.hp, 60);
    assert.equal(coat.state.last.healing, 0);
  }
});

test('lethal swap does not spend a Last Pass charge to delay a defeated enemy', () => {
  const s = createGame(config(['lastPass']));
  const command = setGroup(s, 'strike');
  s.enemy.hp = 1;
  const result = dispatch(s, command);
  assert.equal(result.state.phase, 'won');
  assert.equal(result.state.hero.itemState.battle.lastPassUsed, undefined);
  assert.equal(result.state.enemy.delay, 0);
});

test('Quarter Cutter suppresses defensive-strike protection when an enhanced triple deals no damage', () => {
  const result = single(['quarterCutter'], 'strike', 3, 2, (s) => {
    s.skills.strike = 'leech';
  });
  assert.equal(result.state.last.damage, 0);
  assert.equal(result.state.hero.hp, 60);
  assert.equal(result.state.hero.barrier, 0);
});

test('all former healing skills protect or prepare the board without restoring HP', () => {
  for (const skill of ['restore', 'cleanse', 'grow']) {
    const result = single([], 'mend', 3, 2, (s) => {
      s.skills.mend = skill;
      s.hero.rage = 60;
    });
    assert.equal(result.state.hero.hp, 60, skill);
    assert.equal(result.state.last.healing, 0, skill);
  }
  const strike = single([], 'strike', 3, 2, (s) => {
    s.skills.strike = 'leech';
  });
  assert.equal(strike.state.hero.hp, 60);
  assert.equal(strike.state.last.healing, 0);
  assert.ok(strike.state.hero.barrier > 0);
  for (const skill of ['renew', 'surge']) {
    const result = freeSuper(single([], 'strike').state, skill);
    assert.equal(result.state.hero.hp, result.before.hero.hp, skill);
    assert.equal(result.state.last.healing, 0, skill);
    assert.equal(result.state.action, result.before.action, skill);
    assert.equal(
      result.state.enemy.countdown,
      result.before.enemy.countdown,
      skill,
    );
    if (skill === 'renew') assert.equal(result.state.hero.barrier, 8);
    else assert.equal(result.state.hero.rage, result.before.hero.rage + 20);
  }
});

test('real free supers do not refresh Mirror Vest, native XP, combo-gold budget or swap counters', () => {
  const swap = single(['archiveVest', 'scholar'], 'arcane', 5, 2);
  const xp = swap.state.hero.xp;
  let s = swap.state;
  let newGold = 0;
  for (let i = 0; i < 10; i++) {
    const result = freeSuper(s);
    newGold += result.state.last.gold;
    assert.equal(result.state.hero.xp, xp);
    assert.equal(result.state.action, swap.state.action);
    assert.equal(result.state.turn, swap.state.turn);
    assert.equal(result.state.enemy.countdown, swap.state.enemy.countdown);
    s = result.state;
  }
  assert.equal(swap.state.last.gold + newGold, 6);
  const mirror = single(['mirrorVest'], 'strike');
  const following = freeSuper(mirror.state);
  assert.equal(following.state.hero.barrier, mirror.state.hero.barrier);
  const preSwap = createGame(config(['mirrorVest']));
  const first = freeSuper(preSwap);
  assert.equal(
    first.state.hero.barrier,
    0,
    'a found S before a swap cannot grant opening shield',
  );
});

test('real Cotton Cuffs preserve base defense but cannot exceed six healed HP in one battle', () => {
  let s = createGame(config(['cottonCuffs']));
  s.hero.hp = 40;
  s.enemy.hp = s.enemy.maxHp = 99999;
  for (let i = 0; i < 10; i++) {
    s.enemy.countdown = 1000;
    const command = setGroup(s, 'mend');
    const result = dispatch(s, command);
    assert.equal(result.error, undefined);
    assert.ok(result.state.last.healing <= 1);
    s = result.state;
  }
  assert.equal(s.hero.hp, 46);
  assert.equal(s.hero.itemState.battle.cuffs, 6);
  assert.equal(s.hero.barrier, 12);
});

test('real Golden Lining spends eight gold for at most twelve healing across enemy cycles', () => {
  let s = createGame(config(['goldenLining']));
  s.hero.hp = 40;
  s.hero.gold = 100;
  s.enemy.hp = s.enemy.maxHp = 99999;
  s.enemy.intents = [
    {
      kind: 'lock',
      name: 'No-damage cycle',
      wait: 1,
      damage: 0,
      hits: 0,
      count: 0,
    },
  ];
  let income = 0;
  for (let i = 0; i < 10; i++) {
    s.enemy.countdown = 1;
    const command = setGroup(s, 'strike', 5);
    const result = dispatch(s, command);
    assert.equal(result.error, undefined);
    income += result.state.last.gold;
    s = result.state;
  }
  assert.equal(s.hero.hp, 52);
  assert.equal(s.hero.itemState.battle.goldenHealed, 12);
  assert.equal(s.hero.gold, 100 + income - 8);
});

test('expired bombs do not restart first-hit Ward rolls or Glass Nib surcharges', () => {
  const result = single(['glassNib', 'ward'], 'strike', 3, 1, (s) => {
    s.enemy.countdown = 3; // No scheduled enemy skill during this action.
    s.board[54].bomb = 1;
    s.board[55].bomb = 1;
    // A first-hit Ward roll from this state would succeed. Bombs are hazards,
    // not the first hit of a new enemy skill, so they must consume no roll.
    s.rng.effect = 12345;
  });
  assert.equal(result.state.hero.hp, 40); // Two raw 10-damage hazards, no +1.
  assert.equal(result.state.rng.effect, 12345);
  assert.equal(result.state.enemy.cycle, 0);
  assert.equal(result.state.enemy.countdown, 2);
  assert.equal(
    result.state.board.find((t) => t.id === result.before.board[54].id)?.bomb,
    undefined,
  );
  assert.equal(
    result.state.board.find((t) => t.id === result.before.board[55].id)?.bomb,
    undefined,
  );
});

test('bombs share the current enemy cycle defense limits instead of resetting them', () => {
  const result = single(['reserveLining'], 'strike', 3, 1, (s) => {
    s.enemy.countdown = 3;
    s.board[54].bomb = 1;
    s.board[55].bomb = 1;
    s.hero.resonance.arcane = 12;
  });
  // Reserve Lining pays only once before the next actual enemy skill. Enough
  // resonance remains for a second payment, so this also proves the cycle cap.
  assert.equal(result.state.hero.hp, 44);
  assert.equal(result.state.hero.resonance.arcane, 9);
  assert.equal(result.state.hero.itemState.cycle.reserveLining, 1);
});

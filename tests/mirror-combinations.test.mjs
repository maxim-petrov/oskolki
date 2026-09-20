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
  assert.equal(result.state.hero.hp, 46); // 6 + (6 - 4) + 6.
  assert.equal(result.state.hero.resonance.rage, 0);
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
  assert.equal(result.state.enemy.countdown, 2);
});

test('real healing group: Salt Coat cuts group healing while generating shield from an enhanced group', () => {
  const baseline = single([], 'mend', 3, 2);
  const coat = single(['saltCoat'], 'mend', 3, 2);
  assert.equal(
    coat.state.hero.hp - 60,
    Math.floor((baseline.state.hero.hp - 60) * 0.6),
  );
  assert.equal(coat.state.hero.barrier, 3);
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

test('Quarter Cutter suppresses leech healing when an enhanced triple deals no damage', () => {
  const result = single(['quarterCutter'], 'strike', 3, 2, (s) => {
    s.skills.strike = 'leech';
  });
  assert.equal(result.state.last.damage, 0);
  assert.equal(result.state.hero.hp, 60);
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

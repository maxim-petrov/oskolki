import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as g from '../game/engine.ts';
import { findMatchGroups } from '../game/match-rules.ts';
import { matchFixture } from './helpers/stage2-fixtures.mjs';
const accept = (r) => {
  assert.equal(r.error, undefined);
  assert.ok(g.isSave(r.state), 'reloadable');
  return r.state;
};
function arena() {
  const s = g.startRun(42);
  s.hp = s.maxHp = 300;
  s.enemies[0].hp = s.enemies[0].maxHp = 300;
  return s;
}
function fixture(family, count = 3) {
  const s = arena(),
    { board, m } = matchFixture(family, count);
  s.board = board;
  s.serial = Math.max(s.serial, ...board.map((t) => t.id));
  return { s, m };
}

test('frozen rules-5 combat, frames, resource chains and RNG remain byte identical', () => {
  const fixtures = JSON.parse(
    readFileSync(new URL('./fixtures/rules5-replay.json', import.meta.url)),
  );
  for (const f of fixtures) {
    let s = g.loadSave(f.input);
    assert.ok(s);
    const results = [];
    for (const [fn, ...args] of f.actions) {
      const actions = {
        move: g.move,
        endTurn: g.endTurn,
        castSkill: g.castSkill,
      };
      const r = actions[fn](s, ...args);
      assert.equal(r.error, undefined);
      results.push(r);
      s = r.state;
    }
    assert.equal(
      createHash('sha256').update(JSON.stringify(results)).digest('hex'),
      f.sha256,
    );
  }
});
test('match metadata retains geometry, unique intersections and stable legacy cells', () => {
  const board = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    family: g.FAMILIES[(Math.floor(i / 6) + (i % 6)) % 4],
    variant: null,
  }));
  for (const i of [12, 13, 14, 8, 20]) board[i].family = 'blade';
  const groups = findMatchGroups(board, { minimum: 3 }, 2, 'edit');
  const cross = groups.find((g) => g.cells.includes(14));
  assert.equal(cross.orientation, 'cross');
  assert.equal(cross.cells.length, 5);
  assert.equal(cross.source, 'edit');
  assert.equal(cross.wave, 2);
  assert.deepEqual(
    groups.map((g) => g.cells),
    g.groups(board),
  );
});
test('backdraft accumulates actual energy payment, once per turn; rejects and health do not count', () => {
  let s = arena();
  s.relics = ['return'];
  s.skills = ['guard', 'seal'];
  s.energy = 12;
  const before = g.copy(s);
  assert.ok(g.castSkill(s, 'bolt').error);
  assert.deepEqual(s, before);
  s = accept(g.castSkill(s, 'guard'));
  assert.equal(s.effectState.energySpent, 4);
  assert.ok(!s.flags.includes('return:armed'));
  s = accept(g.castSkill(s, 'seal'));
  assert.equal(s.effectState.energySpent, 7);
  assert.ok(s.flags.includes('return:armed'));
  s = accept(g.endTurn(s));
  assert.equal(s.effectState.energySpent, 0);
  assert.ok(!s.flags.includes('return:armed'));
});
test('lamp uses actual overflow and preview stays pure; packet saved before enemy defense', () => {
  const { s, m } = fixture('spark');
  s.relics = ['lamp'];
  s.energy = 11;
  const before = g.copy(s),
    preview = g.previewMove(s, m.axis, m.line, m.amount);
  assert.deepEqual(s, before);
  assert.equal(preview.targets[0].damage, 6);
  const r = g.move(s, m.axis, m.line, m.amount);
  assert.equal(r.frames[0].state.stats.damage, 6);
  accept(r);
  const b = fixture('blade', 4);
  b.s.enemies[0].block = 100;
  const result = g.move(b.s, b.m.axis, b.m.line, b.m.amount);
  const next = accept(result);
  assert.equal(result.frames[0].state.effectState.lastAttack.profile.damage, 8);
  assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(next))), next);
  assert.ok(
    next.effectState.events.some(
      (e) => e.kind === 'match' && e.rootActionId === 1,
    ),
  );
  const broken = g.copy(next);
  broken.effectState.lastAttack.strikes[0].damage = -2;
  assert.equal(g.isSave(broken), false);
});

import { attackStrikes, scaledPacket } from '../game/combat-events.ts';
function board(size) {
  return Array.from({ length: size * size }, (_, i) => ({
    id: 100 + i,
    family: g.FAMILIES[(Math.floor(i / size) + (i % size)) % 4],
    variant: null,
  }));
}
function play(s, m) {
  return g.move(s, m.axis, m.line, m.amount);
}
function at(depth, kind) {
  let s = g.startRun(42);
  const goal = s.journey.nodes.find(
    (n) => n.depth === depth && (!kind || n.kind === kind),
  );
  assert.ok(goal);
  const reaches = (id) =>
    id === goal.id ||
    s.journey.nodes.find((n) => n.id === id).next.some(reaches);
  while (s.room < depth) {
    s.phase = 'map';
    s = accept(g.enterRoom(s, g.nextRooms(s).find((n) => reaches(n.id)).id));
  }
  return s;
}

test('ring groups wrap at sizes 5/6/7 with minimum 3/4, full lines count once', () => {
  for (const n of [5, 6, 7])
    for (const minimum of [3, 4]) {
      const b = board(n);
      b.forEach((t) => {
        if (t.family === 'blade') t.family = 'shield';
      });
      for (let i = 0; i < n; i++) b[i].family = i % 2 ? 'focus' : 'spark';
      for (const col of [
        n - 1,
        ...Array.from({ length: minimum - 1 }, (_, i) => i),
      ])
        b[col].family = 'blade';
      const groups = findMatchGroups(b, { minimum, ring: true });
      const line = groups.find(
        (g) => g.cells.includes(n - 1) && g.family === 'blade',
      );
      assert.ok(line?.wrapped);
      assert.equal(new Set(line.cells).size, minimum);
      assert.equal(
        findMatchGroups(b, { minimum }).some(
          (g) => g.cells.includes(n - 1) && g.family === 'blade',
        ),
        false,
      );
      const full = board(n);
      full.forEach((t) => {
        if (t.family === 'blade') t.family = 'shield';
      });
      for (let i = 0; i < n; i++) full[i].family = 'blade';
      const uniform = findMatchGroups(full, { minimum, ring: true }).filter(
        (g) => g.cells.includes(0),
      );
      assert.equal(uniform.length, 1);
      assert.equal(uniform[0].cells.length, n);
    }
});
test('ring generation, move search, preview and resolution share the same rules', () => {
  for (let seed = 1; seed <= 24; seed++) {
    let s = g.startRun(seed);
    s.relics = ['ring-clasp'];
    s.phase = 'map';
    const next = g
      .nextRooms(s)
      .find(
        (n) => s.journey.nodes.find((x) => x.id === n.id).kind === 'battle',
      );
    if (!next) continue;
    s = accept(g.enterRoom(s, next.id));
    s.enemies.forEach((e) => (e.hp = e.maxHp = 300));
    assert.equal(findMatchGroups(s.board, g.matchRules(s)).length, 0);
    const m = g.validMoves(s.board, g.minimumMatch(s), true)[0];
    assert.ok(m);
    s.actions = 3;
    const before = g.copy(s),
      p = g.previewMove(s, m.axis, m.line, m.amount),
      r = play(s, m);
    assert.deepEqual(s, before);
    assert.deepEqual(p.cells, r.frames[0].cells);
    accept(r);
  }
});
test('ruler geometry and copied packets preserve targeting, poison and piercing without double bonuses', () => {
  const s = arena();
  s.equipment.weapon = 'gear-ruler';
  const h = g.weaponProfile(s, 4, 2, 'horizontal'),
    v = g.weaponProfile(s, 4, 2, 'vertical'),
    c = g.weaponProfile(s, 5, 1, 'cross');
  assert.deepEqual(
    attackStrikes(h, [1, 2, 3]).map((s) => s.damage),
    [4, 4, 4],
  );
  assert.equal(attackStrikes(v, [1, 2])[0].piercing, 8);
  assert.deepEqual(
    attackStrikes(c, [1, 2, 3]).map((s) => s.damage),
    [10, 3, 3],
  );
  const context = {
    rootActionId: 1,
    effectId: 2,
    source: 'repeat',
    cause: 'test',
    wave: 0,
    scope: 'action',
    rulesVersion: 6,
  };
  const packet = { profile: v, strikes: attackStrikes(v, [1, 2]), context };
  const copy = scaledPacket(packet, 0.5, context, [3, 4]);
  assert.deepEqual(copy.strikes, [
    { target: 3, damage: 4, piercing: 4, poison: 2 },
  ]);
  assert.equal(packet.strikes[0].target, 1);
});
test('mirror triggers once and imprint retains original weapon profile after equipment changes', () => {
  const { s, m } = fixture('blade', 4);
  s.equipment.weapon = 'gear-rusty-dagger';
  s.relics = ['mirror-signature'];
  s.skills = ['imprint'];
  s.energy = 12;
  const r = play(s, m),
    first = r.frames[0].state;
  assert.equal(first.enemies[0].poison, 4);
  assert.equal(first.stats.matches, 1);
  assert.equal(first.stats.damage, 9);
  assert.equal(
    first.effectState.events.filter((e) => e.cause === 'mirror-signature')
      .length,
    1,
  );
  let n = accept(r);
  n.actions = 3;
  n.equipment.weapon = 'gear-axe';
  const packet = g.copy(n.effectState.lastAttack),
    damage = n.stats.damage,
    poison = n.enemies[0].poison,
    matches = n.stats.matches;
  n = accept(g.castSkill(n, 'imprint'));
  assert.equal(
    n.stats.damage - damage,
    Math.floor(packet.strikes[0].damage * 0.6),
  );
  assert.equal(n.enemies[0].poison - poison, packet.strikes[0].poison);
  assert.equal(n.stats.matches, matches);
  assert.deepEqual(n.effectState.lastAttack, packet);
  const rune = fixture('blade', 4);
  rune.s.equipment.weapon = 'gear-rune-sword';
  rune.s.relics = ['mirror-signature'];
  const rf = play(rune.s, rune.m).frames[0].state;
  assert.equal(rf.energy - rune.s.energy, 1);
});
test('companion counts manual first-wave groups only and does not overwrite a recorded attack', () => {
  const { s, m } = fixture('shield');
  s.relics = ['defective-copy'];
  s.effectState.companion = 2;
  const r = play(s, m);
  assert.equal(r.frames[0].state.effectState.companion, 0);
  assert.equal(r.frames[0].state.stats.damage, 2);
  assert.equal(r.frames[0].state.effectState.lastAttack, undefined);
  assert.equal(r.frames[0].state.stats.matches, 1);
  accept(r);
});
test('courier discount is previewed, rejected shifts are pure, and every move still costs AP', () => {
  let s = arena();
  s.equipment.clothing = 'gear-courier-jacket';
  assert.equal(g.shiftCost(s, 2, 'col'), 2);
  s = accept(g.move(s, 'row', 0, 1));
  assert.equal(g.shiftCost(s, 2, 'col'), 1);
  assert.equal(g.shiftCost(s, 1, 'col'), 1);
  assert.equal(g.previewMove(s, 'col', 0, 2).actionCost, 1);
  const before = g.copy(s);
  assert.ok(g.move(s, 'col', 99, 2).error);
  assert.deepEqual(s, before);
  s = accept(g.move(s, 'col', 0, 2));
  assert.ok(s.effectState.courierUsed);
  assert.equal(g.shiftCost(s, 2, 'row'), 2);
  s = accept(g.endTurn(s));
  assert.equal(s.effectState.lastAxis, undefined);
  assert.equal(s.effectState.courierUsed, false);
});
test('insurance pays only external damage after block, respects gold and turn cap; sacrifices stay costly', () => {
  let s = arena();
  s.equipment.trousers = 'gear-collateral-belt';
  s.gold = 7;
  s.block = 3;
  assert.deepEqual(g.insurancePreview(s, 10), {
    blocked: 3,
    prevented: 3,
    gold: 6,
    health: 4,
  });
  s.skills = ['blood'];
  const hp = s.hp;
  s = accept(g.castSkill(s, 'blood'));
  assert.equal(s.hp, hp - 2);
  assert.equal(s.gold, 7);
  const off = accept(g.toggleInsurance(s));
  assert.equal(g.insurancePreview(off, 10).gold, 0);
  s.effectState.insured = 3;
  s.gold = 100;
  assert.equal(g.insurancePreview(s, 20).prevented, 1);
  s.block = 0;
  s.heroPoison = 5;
  const before = s.gold;
  s = accept(g.endTurn(s));
  assert.equal(before - s.gold, 2);
  assert.equal(s.effectState.insured, 0);
});
test('defer preserves intent across reload, poison still ticks, once per enemy', () => {
  let s = arena();
  s.enemies[0].kind = 'raider';
  s.enemies[0].damage = 4;
  s.skills = ['defer'];
  s.energy = 12;
  s.enemies[0].poison = 2;
  const expected = g.intent(s, s.enemies[0]);
  const hp = s.hp;
  s = accept(g.castSkill(s, 'defer'));
  assert.equal(s.enemies[0].deferred.intent.text, expected.text);
  s = g.loadSave(JSON.parse(JSON.stringify(s)));
  s = accept(g.endTurn(s));
  assert.equal(s.hp, hp);
  assert.equal(s.enemies[0].hp, 298);
  assert.deepEqual(g.intent(s, s.enemies[0]), expected);
  const before = g.copy(s);
  assert.ok(g.castSkill(s, 'defer').error);
  assert.deepEqual(s, before);
  s = accept(g.endTurn(s));
  assert.equal(s.enemies[0].deferred, undefined);
  assert.ok(s.hp < hp);
});
test('rupture destroys unique cells, chains bombs once, does not count destroyed cells as matches', () => {
  const s = arena();
  s.skills = ['row-rupture'];
  s.focus = 6;
  s.relics = ['ash-register'];
  s.board = board(6);
  s.serial = 200;
  s.board[0].variant = 'bomb';
  s.board[1].variant = 'bomb';
  const r = g.castSkill(s, 'row-rupture', 0);
  const n = accept(r);
  assert.equal(n.focus <= g.focusMax(n), true);
  assert.equal(n.board.length, 36);
  assert.equal(new Set(n.board.map((t) => t.id)).size, 36);
  assert.ok(
    !n.board.some((t) =>
      [100, 101, 102, 103, 104, 105, 106, 107].includes(t.id),
    ),
  );
  assert.ok(n.log.some((x) => x.includes('8 фишек')));
  const before = g.copy(s);
  assert.ok(g.castSkill(s, 'row-rupture', 99).error);
  assert.deepEqual(s, before);
});
test('cash hammer counts post-defense excess only and pays nothing for summons', () => {
  for (const summoned of [false, true]) {
    const { s, m } = fixture('blade', 4);
    s.equipment.weapon = 'gear-cash-hammer';
    s.enemies.push({ ...s.enemies[0], id: 800, hp: 300, maxHp: 300 });
    s.enemies[0].hp = 1;
    s.enemies[0].block = 2;
    if (summoned) s.enemies[0].summoned = true;
    const gold = s.gold;
    const first = play(s, m).frames[0].state;
    assert.equal(first.gold - gold, summoned ? 0 : 3);
  }
});
test('workshop alternatives survive reload and keep current quality after sharpening', () => {
  let s = at(5, 'shop');
  assert.equal(s.workshop.length, 2);
  const ids = s.workshop.map((o) => o.id);
  s.weaponQuality = 2;
  assert.ok(g.isSave(s));
  s = g.loadSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(
    g.workshopOffers(s).map((o) => o.id),
    ids,
  );
  assert.ok(g.workshopOffers(s).every((o) => o.quality === 2));
  s.gold = 40;
  const streams = g.copy(s.streams);
  s = accept(g.buyWorkshop(s, ids[0]));
  assert.equal(s.equipment.weapon, ids[0]);
  assert.equal(s.weaponQuality, 2);
  assert.equal(s.gold, 12);
  assert.deepEqual(s.streams, streams);
  assert.equal(s.workshop.length, 0);
  assert.ok(g.buyWorkshop(s, ids[1]).error);
});
test('optional elite contract pays once, preserves ordinary reward RNG, cannot be accepted late', () => {
  const base = at(4, 'elite');
  assert.ok(g.canAcceptContract(base));
  const no = g.copy(base),
    yes = accept(g.acceptContract(base));
  for (const s of [no, yes]) s.enemies.forEach((e) => (e.hp = 0));
  const a = accept(g.endTurn(no)),
    b = accept(g.endTurn(yes));
  assert.equal(b.gold - a.gold, 15);
  assert.deepEqual(a.offers, b.offers);
  assert.deepEqual(a.streams, b.streams);
  assert.equal(b.eliteContract.completed, true);
  const late = accept(g.move(base, 'row', 0, 1));
  assert.ok(!g.canAcceptContract(late));
  assert.ok(g.acceptContract(late).error);
  const expired = accept(g.acceptContract(base));
  expired.eliteContract.responses = 4;
  expired.enemies.forEach((e) => (e.hp = 0));
  assert.equal(accept(g.endTurn(expired)).gold, a.gold);
});

test('deferred boss phase transition stays visible before poison and does not freeze the phase', () => {
  let s = at(10, 'boss');
  s.hp = s.maxHp = 300;
  s.enemies[0].hp = Math.floor(s.enemies[0].maxHp / 2) + 10;
  s.skills = ['defer'];
  s.energy = 12;
  s = accept(g.castSkill(s, 'defer'));
  s.enemies[0].poison = 12;
  assert.notEqual(g.intent(s, s.enemies[0]).type, 'prepare');
  s = accept(g.endTurn(s));
  assert.equal(g.bossPhase(s.enemies[0]), 2);
  assert.equal(s.enemies[0].deferred, undefined);
  assert.ok(s.board.some((t) => t.root));
});
test('end-turn insurance forecast is pure, exact and does not reveal a future board', () => {
  const s = arena();
  s.equipment.trousers = 'gear-collateral-belt';
  s.gold = 20;
  s.heroPoison = 3;
  const before = g.copy(s),
    forecast = g.previewEndTurn(s),
    next = g.endTurn(s).state;
  assert.deepEqual(s, before);
  assert.deepEqual(forecast, g.previewEndTurn(s));
  assert.equal(forecast.healthLoss, s.hp - next.hp);
  assert.equal(forecast.goldCost, s.gold - next.gold);
  assert.deepEqual(Object.keys(forecast).sort(), [
    'defeated',
    'goldCost',
    'healthLoss',
  ]);
});
test('prism grants 2/1/1 per paid shift, first wave and skill cascades never grant its bonus', () => {
  let example;
  for (let seed = 1; seed < 100 && !example; seed++) {
    const s = g.startRun(seed);
    s.enemies[0].hp = s.enemies[0].maxHp = 10000;
    s.relics = ['prism'];
    for (const m of g.validMoves(s.board)) {
      const r = play(s, m);
      const bonuses = r.state.effectState.events.filter(
        (e) => e.cause === 'prism',
      );
      if (bonuses.length >= 2) {
        example = { s, m, r, bonuses };
        break;
      }
    }
  }
  assert.ok(example);
  assert.deepEqual(
    example.bonuses.map((e) => e.amount),
    [2, 1, 1].slice(0, example.bonuses.length),
  );
  assert.ok(example.bonuses.every((e) => e.wave >= 1));
  const s = g.copy(example.s);
  s.skills = ['reshape'];
  s.focus = 6;
  const r = g.castSkill(s, 'reshape');
  assert.equal(
    r.state.effectState.events.filter((e) => e.cause === 'prism').length,
    0,
  );
});
test('rules-6 complete two-biome fixtures preserve state/RNG after every action with new builds', () => {
  // Deliberately strong fixtures exercise a full route; this is not a balance or retention estimate.
  for (const weapon of ['gear-ruler', 'gear-cash-hammer']) {
    let s = g.startRun(42, {
      ...g.DEFAULT_BALANCE,
      health: 500,
      blade: 12,
      enemyPower: 0.1,
    });
    s.equipment.weapon = weapon;
    s.equipment.clothing = 'gear-courier-jacket';
    s.equipment.trousers = 'gear-collateral-belt';
    s.relics = [...g.INTERACTION_RELIC_IDS, 'prism', 'lamp', 'return'];
    s.skills = ['row-rupture', 'imprint'];
    let steps = 0;
    while (!['victory', 'defeat'].includes(s.phase) && steps++ < 600) {
      let fn,
        args = [];
      if (s.phase === 'battle') {
        const moves = g
          .validMoves(s.board, g.minimumMatch(s), true)
          .filter((m) => g.shiftCost(s, m.amount, m.axis) <= g.actionLeft(s));
        if (g.canCast(s, 'imprint')) {
          fn = g.castSkill;
          args = ['imprint'];
        } else if (g.canCast(s, 'row-rupture')) {
          fn = g.castSkill;
          args = ['row-rupture', 0];
        } else if (moves.length) {
          const m = moves
            .map((m) => ({ m, p: g.previewMove(s, m.axis, m.line, m.amount) }))
            .sort(
              (a, b) =>
                b.p.targets.reduce((n, t) => n + t.damage, 0) -
                a.p.targets.reduce((n, t) => n + t.damage, 0),
            )[0].m;
          fn = g.move;
          args = [m.axis, m.line, m.amount];
        } else fn = g.endTurn;
      } else if (s.phase === 'map') {
        fn = g.enterRoom;
        args = [g.nextRooms(s)[0].id];
      } else if (s.phase === 'reward') {
        fn = g.chooseReward;
        args = [null];
      } else if (s.phase === 'shop') fn = g.leaveRoom;
      else if (s.phase === 'rest') {
        fn = g.rest;
        args = ['heal'];
      } else if (s.phase === 'event') {
        fn = g.eventChoice;
        args = ['supplies'];
      } else if (s.phase === 'trial') {
        s = accept(g.pauseTrial(s, false));
        fn = g.tickTrial;
        args = [46];
      }
      const restored = g.loadSave(JSON.parse(JSON.stringify(s)));
      assert.ok(restored);
      const result = fn(s, ...args);
      assert.deepEqual(fn(restored, ...args), result);
      s = accept(result);
      assert.ok(s.energy <= g.energyMax(s) && s.focus <= g.focusMax(s));
    }
    assert.equal(s.phase, 'victory', `${weapon} stopped at ${s.room}`);
    assert.equal(s.room, 20);
  }
});

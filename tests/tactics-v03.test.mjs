import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import { matchFixture } from './helpers/stage2-fixtures.mjs';
const accept = (r) => {
  assert.equal(r.error, undefined);
  return r.state;
};
const reload = (s) => {
  assert.ok(
    g.isSave(s),
    `save ${s.room}/${s.round}/${s.phase}/${s.board.length}`,
  );
  return g.loadSave(JSON.parse(JSON.stringify(s)));
};
function arena(kinds = ['raider']) {
  const s = g.startRun(42);
  s.hp = s.maxHp = 160;
  s.enemies = kinds.map((kind, n) => ({
    ...s.enemies[0],
    id: 800 + n,
    kind,
    name: g.ENEMY_CATALOG[kind].name,
    hp: 100,
    maxHp: 100,
    damage: 4,
    block: 0,
    poison: 0,
  }));
  s.serial = 1000;
  s.target = 800;
  return s;
}
function noMatch(s, amount = 1) {
  for (const axis of ['row', 'col'])
    for (let line = 0; line < g.boardSize(s.board); line++)
      if (
        !g.groups(g.shifted(s.board, axis, line, amount), g.minimumMatch(s))
          .length &&
        !g.lineLocked(s, axis, line)
      )
        return { axis, line, amount };
  throw Error('fixture has no setup move');
}
const play = (s, m) => g.move(s, m.axis, m.line, m.amount);
function fixture(family, count = 3, s = arena()) {
  const { board, m } = matchFixture(family, count);
  s.board = board;
  s.serial = Math.max(s.serial, ...board.map((t) => t.id));
  return { s, m };
}

test('three small actions or one large shift: paid setup, cyclic distance, preview, rejected actions and no automatic response', () => {
  let s = arena();
  const original = g.copy(s);
  for (let left = 2; left >= 0; left--) {
    const m = noMatch(s),
      p = g.previewMove(s, m.axis, m.line, m.amount);
    const hp = s.hp,
      rng = s.rng;
    assert.equal(p.actionCost, 1);
    assert.equal(p.actionsRemaining, left);
    s = accept(play(s, m));
    assert.equal(s.actions, left);
    assert.equal(s.round, 1);
    assert.equal(s.hp, hp);
    assert.equal(s.rng, rng);
    assert.deepEqual(s, reload(s));
  }
  assert.ok(!g.canShift(s));
  const exhausted = g.copy(s);
  assert.ok(play(s, { axis: 'row', line: 0, amount: 1 }).error);
  assert.deepEqual(s, exhausted);
  s = accept(g.endTurn(s));
  assert.equal(s.actions, 3);
  assert.equal(s.round, 2);
  assert.ok(s.hp < exhausted.hp);
  const big = accept(play(original, noMatch(original, 3)));
  assert.equal(big.actions, 0);
  assert.equal(big.round, 1);
  const wrap = accept(play(original, noMatch(original, 5)));
  assert.equal(wrap.actions, 2);
  assert.equal(g.shiftCost(original, -5), 1);
  const almost = { ...original, actions: 1 };
  assert.match(
    play(almost, { axis: 'row', line: 0, amount: 2 }).error,
    /Нужно 2/,
  );
  assert.deepEqual(almost.board, original.board);
  assert.equal(
    g.endTurn({ ...original, actions: 1 }).state.actions,
    3,
    'unused AP is not carried',
  );
});

test('skills and edit share the budget, resources are separate, potion remains once per turn and free', () => {
  let s = arena();
  s.energy = 12;
  s.focus = 6;
  s.hp -= 12;
  s = accept(g.castSkill(s, 'guard'));
  assert.equal(s.actions, 2);
  assert.equal(s.energy, 8);
  assert.equal(s.block, 8);
  s = accept(g.castSkill(s, 'guard'));
  assert.equal(s.actions, 1);
  assert.equal(s.energy, 4);
  assert.equal(s.block, 16);
  s = accept(g.castSkill(s, 'edit', 0, s.board[0].family));
  assert.equal(s.actions, 0);
  assert.equal(s.focus, 3);
  assert.ok(!g.canCast(s, 'guard'));
  assert.ok(g.castSkill(s, 'guard').error);
  s = accept(g.consumePotion(s));
  assert.equal(s.actions, 0);
  assert.ok(g.consumePotion(s).error);
  assert.deepEqual(s, reload(s));
  const poor = arena(),
    before = g.copy(poor);
  assert.ok(g.castSkill(poor, 'bolt').error);
  assert.deepEqual(poor, before);
});

test('Grand Design leaves triples intact, doubles each base match reward and weapon damage, not ability damage', () => {
  for (const family of g.FAMILIES) {
    const { s, m } = fixture(family);
    s.relics = ['grand-design'];
    const shifted = g.shifted(s.board, m.axis, m.line, m.amount),
      r = play(s, m);
    assert.equal(g.minimumMatch(s), 4);
    assert.equal(r.error, undefined);
    assert.equal(r.frames.length, 0);
    assert.deepEqual(r.state.board, shifted);
    assert.equal(r.state.stats.matches, 0);
    const four = fixture(family, 4);
    four.s.upgrades.focus = 1;
    const base = play(four.s, four.m).frames[0].state;
    four.s.relics = ['grand-design'];
    const strong = play(four.s, four.m).frames[0].state;
    if (family === 'blade')
      assert.equal(strong.stats.damage, base.stats.damage * 2);
    if (family === 'shield') assert.equal(strong.block, base.block * 2);
    if (family === 'spark')
      assert.equal(
        strong.energy - four.s.energy,
        (base.energy - four.s.energy) * 2,
      );
    if (family === 'focus') assert.equal(strong.focus, base.focus * 2);
    assert.deepEqual(reload(r.state), r.state);
  }
  const a = arena();
  a.energy = 12;
  const b = g.copy(a);
  b.relics = ['grand-design'];
  assert.equal(
    g.castSkill(a, 'bolt').state.stats.damage,
    g.castSkill(b, 'bolt').state.stats.damage,
  );
});

test('risk relics offer explicit benefits and costs; Borrowed Time can kill through block and Iron Agenda resets block', () => {
  let s = arena();
  s.relics = ['borrowed-time'];
  s.block = 100;
  const originalHp = s.hp;
  s = accept(g.endTurn(s));
  assert.equal(s.actions, 4);
  assert.equal(s.hp, originalHp - 2);
  s.hp = 2;
  s.block = 100;
  s = accept(g.endTurn(s));
  assert.equal(s.phase, 'defeat');
  assert.equal(s.hp, 0);
  assert.match(s.damageEvents.at(-1).source, /Заемное/);
  let iron = arena();
  iron.relics = ['iron-agenda'];
  iron.block = 100;
  iron = accept(g.endTurn(iron));
  assert.equal(iron.actions, 2);
  assert.equal(iron.block, 6);
  iron.relics.push('borrowed-time');
  iron = accept(g.endTurn(iron));
  assert.equal(iron.actions, 3);
  assert.equal(iron.block, 6);
  assert.deepEqual(reload(iron), iron);
  for (const id of g.TACTIC_RELIC_IDS) {
    assert.ok(g.availableRelics(g.EMPTY_META, 5).includes(id));
    assert.ok(!g.availableRelics(g.EMPTY_META, 4).includes(id));
  }
  assert.equal(g.CORE_RELIC_IDS.length, 12);
});

test('mixed enemies heal wounded allies without reviving; rally strengthens the next response once', () => {
  let s = arena(['candle', 'paper-rat']);
  s.enemies[1].hp = 50;
  const heal = g.intent(s, s.enemies[0]);
  assert.equal(heal.target, 801);
  assert.equal(heal.value, 6);
  s = accept(g.endTurn(s));
  assert.equal(s.enemies[1].hp, 56);
  assert.equal(s.hp, 156);
  const dead = arena(['candle', 'paper-rat']);
  dead.enemies[1].hp = 0;
  assert.notEqual(g.intent(dead, dead.enemies[0]).type, 'mend');
  assert.equal(g.endTurn(dead).state.enemies[1].hp, 0);
  let buff = arena(['mirror', 'paper-rat']);
  const first = g.intent(buff, buff.enemies[1]).value;
  buff = accept(g.endTurn(buff));
  assert.equal(buff.hp, 160 - first);
  assert.equal(buff.enemies[1].power, 2);
  const unbuffed = g.copy(buff);
  delete unbuffed.enemies[1].power;
  delete unbuffed.enemies[1].powerReady;
  assert.equal(
    g.intent(buff, buff.enemies[1]).value,
    g.intent(unbuffed, unbuffed.enemies[1]).value + 2,
  );
  const expected = buff.enemies.reduce(
      (n, e) => n + g.intent(buff, e).value,
      0,
    ),
    hp = buff.hp;
  const restored = reload(buff);
  buff = accept(g.endTurn(buff));
  assert.equal(buff.hp, hp - expected);
  assert.equal(buff.enemies[1].power, undefined);
  assert.deepEqual(buff, g.endTurn(restored).state);
});

test('summons are seeded, capped at four living enemies and two calls; newcomers wait and fallen slots are reusable', () => {
  let s = arena(['bell', 'paper-rat']);
  const firstDamage = g.intent(s, s.enemies[1]).value;
  const a = accept(g.endTurn(s)),
    b = accept(g.endTurn(reload(s)));
  assert.deepEqual(a, b);
  assert.equal(a.enemies.length, 3);
  assert.equal(a.hp, s.hp - firstDamage);
  assert.equal(a.enemies[2].summoned, true);
  assert.equal(a.enemies[0].summons, 1);
  s = a;
  s.round = 4;
  s.enemies[1].hp = 0;
  s = accept(g.endTurn(s));
  assert.equal(s.enemies.filter((e) => e.hp > 0).length, 3);
  assert.equal(s.enemies[0].summons, 2);
  assert.ok(!s.enemies.some((e) => e.id === 801));
  s.round = 7;
  assert.notEqual(g.intent(s, s.enemies[0]).type, 'summon');
  const full = arena(['bell', 'paper-rat', 'candle', 'mirror']);
  assert.notEqual(g.intent(full, full.enemies[0]).type, 'summon');
  assert.deepEqual(reload(s), s);
});

test('seals block both lines without spending AP or RNG; edit, focus, owner death and expiry provide counters', () => {
  const locked = accept(g.endTurn(arena(['librarian', 'paper-rat'])));
  assert.equal(locked.board.filter((t) => t.locked).length, 2);
  const i = locked.board.findIndex((t) => t.locked);
  for (const [axis, line] of [
    ['row', Math.floor(i / 6)],
    ['col', i % 6],
  ]) {
    const before = g.copy(locked),
      r = g.move(locked, axis, line, 1);
    assert.match(r.error, /запечатана/);
    assert.deepEqual(r.state, before);
    assert.deepEqual(locked, before);
  }
  const edit = g.copy(locked);
  edit.focus = 3;
  assert.equal(
    accept(g.castSkill(edit, 'edit', i, 'focus')).board.filter((t) => t.locked)
      .length,
    0,
  );
  const { s, m } = fixture('focus', 3, g.copy(locked));
  const safe = s.board.findIndex(
    (_, i) => (m.axis === 'row' ? Math.floor(i / 6) : i % 6) !== m.line,
  );
  s.board[safe].locked = { owner: 800, expires: s.round };
  assert.equal(accept(play(s, m)).board.filter((t) => t.locked).length, 0);
  const dying = g.copy(locked);
  dying.focus = 3;
  dying.skills.push('pierce');
  dying.enemies[0].hp = 1;
  assert.equal(
    accept(g.castSkill(dying, 'pierce')).board.filter((t) => t.locked).length,
    0,
  );
  const expired = accept(g.endTurn(locked));
  assert.equal(expired.board.filter((t) => t.locked).length, 0);
  assert.deepEqual(locked, reload(locked));
});

test('board warps preserve overlapping tiles, wrap all edges, expire after two player turns and survive reload', () => {
  for (const [kind, size] of [
    ['eraser', 5],
    ['safe', 7],
  ]) {
    const s = arena([kind]),
      resized = accept(g.endTurn(s));
    assert.equal(resized.board.length, size * size);
    assert.equal(resized.stats.matches, 0);
    for (let y = 0; y < Math.min(6, size); y++)
      for (let x = 0; x < Math.min(6, size); x++)
        assert.deepEqual(resized.board[y * size + x], s.board[y * 6 + x]);
    const shifted = g.shifted(resized.board, 'row', size - 1, 1);
    assert.equal(
      shifted[(size - 1) * size].id,
      resized.board[size * size - 1].id,
    );
    const col = g.shifted(resized.board, 'col', size - 1, -1);
    assert.equal(col[size * size - 1].id, resized.board[size - 1].id);
    assert.ok(g.move(resized, 'row', size, 1).error);
    assert.ok(
      g.castSkill({ ...resized, focus: 3 }, 'edit', size * size, 'focus').error,
    );
    let midway = accept(g.endTurn(resized));
    assert.equal(midway.board.length, size * size);
    assert.equal(midway.boardWarp.expires, 3);
    const restored = reload(midway);
    midway = accept(g.endTurn(midway));
    assert.equal(midway.board.length, 36);
    assert.equal(midway.boardWarp, undefined);
    assert.deepEqual(midway, g.endTurn(restored).state);
    assert.deepEqual(resized, reload(resized));
    const actions = g
      .validMoves(resized.board)
      .filter((m) => g.shiftCost(resized, m.amount) <= resized.actions);
    const played = accept(play(resized, actions[0]));
    assert.equal(played.board.length, size * size);
    assert.deepEqual(played, reload(played));
  }
  const competing = g.endTurn(arena(['eraser', 'safe'])).state;
  assert.equal(competing.board.length, 25);
});

test('match-four boards generate on 5/6/7 grids; poison, ink, locks and tidal rows remain valid', () => {
  for (let seed = 0; seed < 24; seed++)
    for (const kind of ['eraser', 'safe']) {
      const s = arena([kind, 'librarian', 'ink-scribe']);
      s.seed = s.rng = seed;
      s.relics = ['grand-design'];
      // Enter the archive through its saved route in the full-run test; here isolate geometry/status interaction.
      s.board = g.startRun(seed).board;
      s.serial = Math.max(s.serial, ...s.board.map((t) => t.id));
      const r = accept(g.endTurn(s));
      assert.ok(g.validMoves(r.board, 4).length);
      assert.ok(r.board.filter((t) => t.ink).length <= 6);
      assert.deepEqual(r, reload(r));
      const candidates = g
        .validMoves(r.board, 4)
        .filter(
          (m) =>
            !g.lineLocked(r, m.axis, m.line) &&
            g.shiftCost(r, m.amount) <= r.actions,
        );
      if (candidates.length)
        assert.deepEqual(
          reload(accept(play(r, candidates[0]))),
          play(r, candidates[0]).state,
        );
    }
});

test('hidden map masks type and roster, keeps landmarks/topology, and entering reveals the pre-saved room', () => {
  const sizes = new Set(),
    kinds = new Set();
  let hidden = 0,
    total = 0;
  for (let seed = 0; seed < 64; seed++) {
    const s = g.startRun(seed);
    assert.equal(s.rulesVersion, 5);
    assert.deepEqual(reload(s), s);
    const map = g.routeMap(s).flat();
    for (const node of s.journey.nodes) {
      if (node.roster) sizes.add(node.roster.length);
      if ([2, 3, 6].includes(node.depth)) kinds.add(node.kind);
      const publicNode = map.find((n) => n.id === node.id);
      if (node.depth > 1 && !['shop', 'rest', 'boss'].includes(node.kind))
        total++;
      if (publicNode.kind === 'unknown') {
        hidden++;
        assert.equal(publicNode.roster, undefined);
        assert.equal(publicNode.name, 'Неизвестная комната');
        assert.deepEqual(publicNode.next, node.next);
      }
      if (['shop', 'rest', 'boss'].includes(node.kind))
        assert.equal(publicNode.kind, node.kind);
    }
    const cleared = g.copy(s);
    cleared.enemies.forEach((e) => (e.hp = 0));
    const ready = accept(g.chooseReward(accept(g.endTurn(cleared)), null));
    for (const choice of g.nextRooms(ready)) {
      const raw = ready.journey.nodes.find((n) => n.id === choice.id);
      const entered = accept(g.enterRoom(ready, choice.id));
      assert.equal(entered.roomKind, raw.kind);
      assert.equal(entered.path.at(-1), raw.name);
      assert.deepEqual(entered, reload(entered));
      const visible = g
        .routeMap(entered)
        .flat()
        .find((n) => n.id === choice.id);
      assert.equal(visible.kind, raw.kind);
      assert.deepEqual(entered, g.enterRoom(reload(ready), choice.id).state);
    }
  }
  assert.deepEqual(
    [...sizes].sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    [...kinds].sort((a, b) => a.localeCompare(b)),
    ['battle', 'event', 'treasure'],
  );
  assert.ok(hidden / total > 0.8);
});

test('malformed tactics are rejected; historical saves keep their old move budget and matching rules', () => {
  const s = arena();
  for (const mutation of [
    { actions: -1 },
    { actions: 5 },
    { board: s.board.slice(0, 25) },
    { boardWarp: null },
    { boardWarp: { size: 7, expires: 2 } },
  ])
    assert.equal(g.loadSave({ ...s, ...mutation }), null);
  const malformed = g.copy(s);
  malformed.board[0].locked = { owner: 9999, expires: 1 };
  assert.equal(g.loadSave(malformed), null);
  for (const rv of [2, 3, 4]) {
    const old = g.startRun(42, g.DEFAULT_BALANCE, rv),
      m = noMatch(old),
      before = g.copy(old);
    assert.ok(play(old, m).error);
    assert.deepEqual(old, before);
    const match = g.validMoves(old.board)[0],
      moved = accept(play(old, match));
    assert.ok(moved.moved);
    assert.ok(play(moved, match).error);
    assert.deepEqual(moved, reload(moved));
  }
});

function completeRun(seed, relic, shouldReload) {
  let s = g.startAdventure(
    seed,
    { ...g.DEFAULT_BALANCE, health: 160, blade: 3, enemyPower: 0.2 },
    { ...g.EMPTY_META, wins: 1 },
    relic === 'iron-agenda' ? 'warden' : 'wanderer',
  );
  if (relic) {
    s.relics = [relic];
    s.actions = g.actionMax(s);
  }
  const trace = [];
  let steps = 0;
  while (!['victory', 'defeat'].includes(s.phase) && steps++ < 500) {
    if (s.phase === 'battle') {
      const targets = s.enemies
        .filter((e) => e.hp > 0)
        .sort((a, b) => a.hp - b.hp);
      s.target = targets[0].id;
      if (s.potions && !s.consumed && s.hp < s.maxHp - 10)
        s = accept(g.consumePotion(s));
      const moves = g
        .validMoves(s.board, g.minimumMatch(s))
        .filter(
          (m) =>
            !g.lineLocked(s, m.axis, m.line) &&
            g.shiftCost(s, m.amount) <= s.actions,
        );
      const best =
        s.actions &&
        moves
          .map((m) => {
            const p = g.previewMove(s, m.axis, m.line, m.amount);
            assert.equal(p.error, undefined);
            return {
              m,
              score:
                (p.targets.reduce(
                  (v, e) => v + e.damage + e.poison * 2 + (e.defeated ? 10 : 0),
                  0,
                ) +
                  p.block * 0.5 +
                  p.energy +
                  p.focus * 0.5 +
                  (p.tideCleared ? 10 : 0)) /
                g.shiftCost(s, m.amount),
            };
          })
          .sort((a, b) => b.score - a.score)[0];
      if (g.canCast(s, 'bolt') && (s.energy >= 10 || targets[0].hp <= 12))
        s = accept(g.castSkill(s, 'bolt'));
      else if (best) s = accept(play(s, best.m));
      else if (g.canCast(s, 'guard')) s = accept(g.castSkill(s, 'guard'));
      else s = accept(g.endTurn(s));
    } else if (s.phase === 'map')
      s = accept(
        g.enterRoom(s, g.nextRooms(s)[seed % g.nextRooms(s).length].id),
      );
    else if (s.phase === 'reward')
      s = accept(
        g.chooseReward(
          s,
          s.rewardSource === 'seal'
            ? 'enduring-record'
            : (s.offers.find((o) =>
                ['relic', 'upgrade', 'equipment'].includes(o.kind),
              )?.id ?? null),
        ),
      );
    else if (s.phase === 'shop') s = accept(g.leaveRoom(s));
    else if (s.phase === 'rest') s = accept(g.rest(s, 'heal'));
    else if (s.phase === 'event') s = accept(g.eventChoice(s, 'supplies'));
    else if (s.phase === 'trial')
      s = accept(g.tickTrial(accept(g.pauseTrial(s, false)), 46));
    else throw Error(s.phase);
    assert.ok(
      g.isSave(s),
      `${relic} seed ${seed}, step ${steps}, ${s.phase}, room ${s.room}, round ${s.round}, HP ${s.hp}, actions ${s.actions}, board ${s.board.length}`,
    );
    assert.ok(
      s.hp >= 0 &&
        s.hp <= s.maxHp &&
        s.energy <= g.energyMax(s) &&
        s.focus <= g.focusMax(s),
    );
    if (shouldReload) s = reload(s);
    trace.push([
      s.phase,
      s.room,
      s.round,
      s.actions,
      s.hp,
      s.board.length,
      s.stats.damage,
      s.rng,
      g.copy(s.streams),
    ]);
  }
  assert.equal(
    s.phase,
    'victory',
    `${relic} seed ${seed} ended ${s.phase} room ${s.room}, steps ${steps}`,
  );
  assert.equal(s.room, 20);
  assert.equal(s.journey.visited.length, 20);
  assert.equal(s.modified, true);
  return { s, trace };
}
test('complete two-biome runs with every risk relic, mixed squads and both heroes replay identically after every action', () => {
  for (const [seed, relic] of [
    [17, null],
    [22, 'grand-design'],
    [31, 'borrowed-time'],
    [44, 'iron-agenda'],
  ]) {
    assert.deepEqual(
      completeRun(seed, relic, false),
      completeRun(seed, relic, true),
    );
  }
});

test('timed trials retain match-only moves and one ability between moves without AP charges or relic end-turn costs', () => {
  const s = arena();
  s.phase = 'trial';
  s.enemies = [];
  s.trial = {
    remaining: 45,
    energy: 0,
    damage: 0,
    protection: 0,
    paused: false,
  };
  s.relics = ['borrowed-time', 'iron-agenda'];
  s.actions = 0;
  s.energy = 12;
  assert.ok(play(s, noMatch(s)).error);
  let next = accept(g.castSkill(s, 'guard'));
  assert.equal(next.actions, 0);
  assert.ok(g.castSkill(next, 'guard').error);
  assert.equal(next.hp, s.hp);
  next = accept(play(next, g.validMoves(next.board)[0]));
  assert.equal(next.actions, 0);
  assert.equal(next.cast, false);
  assert.deepEqual(g.endTurn(next).state, next);
});

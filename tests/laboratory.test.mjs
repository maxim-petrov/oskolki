import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const g = await import('../game/engine.ts');
const lab = await import('../game/lab.ts');
import {
  SCENARIOS,
  SPRINT_RELIC_IDS,
  SPRINT_SKILL_IDS,
} from '../game/scenarios.ts';
const { gameSnapshot } = await import('../game/webmcp.ts');

const clone = (s) => JSON.parse(JSON.stringify(s));
const start = (patch = {}) =>
  lab.createLabSession({ ...lab.defaultConfig(), ...patch });
const step = (session, command, ms = 1200) =>
  lab.executeLab(session, command, ms).session;
function visibleMove(s) {
  return g
    .validMoves(s.board, g.minimumMatch(s), g.matchRules(s).ring)
    .filter((m) => !g.previewMove(s, m.axis, m.line, m.amount).error)
    .map((m) => {
      const p = g.previewMove(s, m.axis, m.line, m.amount);
      return {
        m,
        score:
          p.targets.reduce(
            (v, t) => v + t.damage * 2 + t.poison + (t.defeated ? 10 : 0),
            0,
          ) +
          p.energy * 0.5 +
          p.block * 0.3 -
          (p.lethal ? 1000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)[0]?.m;
}
function battleStep(session) {
  const s = session.current;
  if (s.hp <= s.maxHp - 10 && s.potions && !s.consumed)
    return step(session, { action: 'potion' });
  if (g.canCast(s, 'bolt'))
    return step(session, { action: 'cast', id: 'bolt' });
  const m = visibleMove(s);
  if (m)
    return step(session, {
      action: 'shift',
      axis: m.axis,
      line: m.line,
      amount: m.amount,
    });
  return step(session, { action: 'end_turn' });
}
test('all laboratory starts are deterministic, loadable and use the same family layout across four builds', () => {
  for (const scenario of SCENARIOS)
    for (const seed of [0, 707, 4294967295]) {
      const baseline = start({ scenario: scenario.id, seed });
      for (const build of lab.BUILDS) {
        const s = start({ scenario: scenario.id, seed, build: build.id });
        assert.deepEqual(s, start(s.config));
        assert.deepEqual(g.loadSave(clone(s.current)), s.current);
        assert.deepEqual(
          s.current.board.map((t) => t.family),
          baseline.current.board.map((t) => t.family),
        );
        assert.equal(s.current.rng, baseline.current.rng);
        assert.equal(g.runLength(s.current), 1);
        assert.deepEqual(
          s.current.enemies.map((e) => e.kind),
          [...scenario.roster],
        );
        assert.equal(gameSnapshot(s.current, false).totalRooms, 1);
      }
    }
});
test('every offered custom relic, modifier, skill and weapon has a valid start', () => {
  for (const [key, pool] of Object.entries({
    relics: g.RELICS,
    modifiers: g.MODIFIERS,
    skills: g.SKILLS,
  })) {
    for (const item of pool) {
      const c = lab.defaultConfig();
      const session = start({
        custom: { ...lab.loadoutFor(c), [key]: [item.id] },
      });
      assert.ok(g.isSave(session.current));
    }
  }
  for (const weapon of g.WEAPONS)
    for (const quality of [0, 1, 2]) {
      const session = start({
        custom: {
          ...lab.loadoutFor(lab.defaultConfig()),
          weapon: weapon.id,
          quality,
        },
      });
      assert.equal(session.current.equipment.weapon, weapon.id);
      assert.equal(session.current.weaponQuality, quality);
    }
});
test('initial special tiles obey real family rules without moving the combat RNG', () => {
  const families = {
    venom: 'blade',
    bomb: 'spark',
    spiked: 'shield',
    marked: 'focus',
  };
  for (const [modifier, family] of Object.entries(families)) {
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const base = start({ seed });
      const custom = { ...lab.loadoutFor(base.config), modifiers: [modifier] };
      const s = start({ seed, custom }).current;
      assert.equal(s.rng, base.current.rng);
      assert.equal(s.serial, base.current.serial);
      for (const tile of s.board)
        if (tile.variant) {
          assert.equal(tile.variant, modifier);
          assert.equal(tile.family, family);
          seen++;
        }
    }
    assert.ok(seen > 0, modifier);
  }
});
test('comparison history validates summaries and retains only twelve entries', () => {
  const s = step(start(), { action: 'end_turn' }, 3000);
  s.note = 'Проверить подготовку защиты';
  const entry = lab.historyEntry(s);
  assert.equal(entry.outcome, 'stopped');
  assert.equal(entry.summary.unusedActions, 3);
  assert.equal(entry.summary.activeSeconds, 3);
  assert.equal(lab.readLabHistory(Array(15).fill(entry)).length, 12);
  assert.deepEqual(
    lab.readLabHistory([null, {}, { ...entry, room: 99 }, entry]),
    [entry],
  );
  assert.deepEqual(
    lab.readLabHistory([
      { ...entry, summary: { ...entry.summary, damage: -1 } },
    ]),
    [],
  );
});
test('normal saves, achievements, streak, unlocks and office are isolated from laboratory outcomes', () => {
  const original = g.copy(g.EMPTY_META);
  for (const phase of ['battle', 'victory', 'defeat']) {
    const s = start().current;
    s.phase = phase;
    assert.deepEqual(g.updateMeta(original, s), original);
    assert.deepEqual(g.abandonMeta(original, s), original);
    assert.deepEqual(original, g.EMPTY_META);
  }
  assert.equal(g.startRun(707).scenario, undefined);
  assert.equal(g.runLength(g.startRun(707)), 20);
  assert.ok(
    ![lab.LAB_SAVE_KEY, lab.LAB_PROFILE_KEY, lab.LAB_BUILDS_KEY].some((key) =>
      ['oskolki.run.v1', 'oskolki.meta.v1', 'oskolki.office.v1'].includes(key),
    ),
  );
});
test('single encounters reach a terminal state with no reward or map trap, and replay every accepted action', () => {
  for (const scenario of SCENARIOS) {
    let session = start({ scenario: scenario.id, build: 'runes' });
    for (let i = 0; i < 120 && session.current.phase === 'battle'; i++)
      session = battleStep(session);
    assert.ok(
      ['victory', 'defeat'].includes(session.current.phase),
      scenario.id,
    );
    assert.equal(session.current.offers.length, 0);
    assert.deepEqual(lab.replayLab(clone(session)).current, session.current);
    const imported = lab.replayLab(clone(session), true);
    assert.equal(imported.imported, true);
    assert.deepEqual(imported.entries, session.entries);
  }
});
test('short runs traverse both branch choices, keep rewards and shops valid, and terminate at their own boss', () => {
  for (const risk of [false, true]) {
    let session = start({
      scenario: 'sprint',
      balance: { ...g.DEFAULT_BALANCE, health: 100, blade: 5, enemyPower: 0.5 },
    });
    const visited = new Set();
    for (
      let i = 0;
      i < 250 && !['victory', 'defeat'].includes(session.current.phase);
      i++
    ) {
      const s = session.current;
      for (const offer of s.offers) {
        if (offer.kind === 'relic')
          assert.ok(SPRINT_RELIC_IDS.includes(offer.id));
        if (offer.kind === 'skill')
          assert.ok(SPRINT_SKILL_IDS.includes(offer.id));
      }
      visited.add(s.journey.current);
      if (s.phase === 'battle') session = battleStep(session);
      else if (s.phase === 'reward')
        session = step(session, {
          action: 'choose_reward',
          id: s.offers[0]?.id ?? null,
          slot: 0,
        });
      else if (s.phase === 'map') {
        const rooms = g.nextRooms(s);
        const n =
          rooms.find(
            (n) =>
              n.kind ===
              (s.room === 2
                ? risk
                  ? 'elite'
                  : 'battle'
                : risk
                  ? 'shop'
                  : 'rest'),
          ) ?? rooms[0];
        assert.ok(n);
        session = step(session, { action: 'enter_room', id: n.id });
      } else if (s.phase === 'shop') {
        const o = s.offers.find(
          (o) => (o.cost ?? 0) <= s.gold && o.kind === 'relic',
        );
        if (o) session = step(session, { action: 'buy', id: o.id });
        session = step(session, { action: 'leave_shop' });
      } else if (s.phase === 'rest')
        session = step(session, { action: 'rest', id: 'heal' });
      else assert.fail(`Unexpected ${s.phase}`);
      assert.ok(g.isSave(session.current), `${s.room}/${s.phase}`);
    }
    assert.equal(session.current.phase, 'victory');
    assert.equal(session.current.room, 6);
    assert.ok(visited.has(risk ? 'lab-3-risk' : 'lab-3-safe'));
    assert.ok(visited.has(risk ? 'lab-4-shop' : 'lab-4-rest'));
    assert.equal(session.current.journey.visited.length, 6);
    assert.deepEqual(lab.replayLab(clone(session)).current, session.current);
  }
});
test('repeat restores original conditions, rejected actions do not consume state, and metric time is explicit', () => {
  const original = start();
  const before = clone(original);
  assert.throws(() =>
    step(original, { action: 'shift', axis: 'row', line: 99, amount: 1 }),
  );
  assert.deepEqual(original, before);
  const played = step(original, { action: 'end_turn' }, 5100);
  assert.equal(lab.labSummary(played).activeSeconds, 5);
  assert.equal(lab.labSummary(played).unusedActions, 3);
  assert.deepEqual(lab.createLabSession(played.config), original);
  assert.deepEqual(lab.replayLab(clone(played)), played);
});
test('import rejects altered state, stale definitions, commands, checksums, config and excessive logs', () => {
  const original = step(start(), { action: 'end_turn' });
  for (const damage of [
    (s) => {
      s.version = 'old';
    },
    (s) => {
      s.initial.hp = 500;
    },
    (s) => {
      s.current.gold = 1000;
    },
    (s) => {
      s.entries[0].command.action = 'unknown';
    },
    (s) => {
      s.entries[0].checksum = 'wrong';
    },
    (s) => {
      s.entries[0].activeMs = -1;
    },
    (s) => {
      s.config.scored = true;
      s.config.seed = 42;
    },
    (s) => {
      s.config.balance.health = 500;
    },
    (s) => {
      s.entries = Array(1501).fill(s.entries[0]);
    },
    (s) => {
      s.note = 'x'.repeat(4001);
    },
  ]) {
    const damaged = clone(original);
    damage(damaged);
    assert.throws(() => lab.replayLab(damaged));
  }
  const forged = clone(original);
  forged.marks = ['reflection'];
  assert.deepEqual(
    lab.replayLab(forged).marks,
    [],
    'achievements must be reconstructed, never trusted',
  );
  for (const patch of [
    { seed: -1 },
    { build: 'nope' },
    { scenario: 'nope' },
    { scenario: 'sprint', build: 'poison' },
    {
      custom: {
        ...lab.loadoutFor(original.config),
        relics: ['thorns', 'thorns'],
      },
    },
  ])
    assert.throws(() => start(patch));
});
test('scenario saves reject noncanonical paths, missing streams, false victories and foreign phases', () => {
  for (const damage of [
    (s) => {
      s.scenario.id = 'anything';
    },
    (s) => {
      s.modified = false;
    },
    (s) => {
      delete s.streams.loot;
    },
    (s) => {
      s.journey.nodes[0].roster = ['censor'];
    },
    (s) => {
      s.journey.current = 'another';
    },
    (s) => {
      s.phase = 'victory';
    },
    (s) => {
      s.phase = 'shop';
    },
    (s) => {
      s.phase = 'event';
    },
    (s) => {
      s.phase = 'victory';
      s.enemies = undefined;
    },
    (s) => {
      s.phase = 'victory';
      s.enemies = [null];
    },
  ]) {
    const s = start().current;
    damage(s);
    assert.equal(g.isSave(s), false);
  }
});
test('mechanical achievements use actual reflection, poison, overflow and support-kill events', () => {
  const reflected = start({ build: 'shields', scored: true });
  reflected.current.enemies[0].hp = 1;
  reflected.current.block = 10;
  const r = step(reflected, { action: 'end_turn' });
  assert.ok(r.marks.includes('reflection'));
  const poisoned = start({ build: 'poison', scored: true });
  poisoned.current.enemies[0].hp = 1;
  poisoned.current.enemies[0].poison = 2;
  const p = step(poisoned, { action: 'end_turn' });
  assert.ok(p.marks.includes('poison'));
  assert.ok(!p.marks.includes('reflection'));
  const support = start({ scenario: 'support', scored: true });
  support.current.energy = 6;
  support.current.enemies[1].hp = 1;
  support.current.target = support.current.enemies[1].id;
  const k = step(support, { action: 'cast', id: 'bolt' });
  assert.ok(k.marks.includes('support'));
  assert.ok(k.current.enemies[0].hp > 0);
  const overflow = start({ build: 'runes', scenario: 'boss', scored: true });
  overflow.current.energy = g.energyMax(overflow.current);
  const m = g.validMoves(overflow.current.board).find((m) => {
    const b = g.shifted(overflow.current.board, m.axis, m.line, m.amount);
    return (
      !g.previewMove(overflow.current, m.axis, m.line, m.amount).error &&
      g
        .groups(b)
        .some((cells) => ['spark', 'blade'].includes(b[cells[0]].family))
    );
  });
  assert.ok(m);
  const o = step(overflow, {
    action: 'shift',
    axis: m.axis,
    line: m.line,
    amount: m.amount,
  });
  assert.ok(o.marks.includes('overflow'));
});
test('setup achievement requires a nonmatching shift followed by a match in the same round', () => {
  const session = start({ scenario: 'boss', scored: true });
  let prepared;
  for (const axis of ['row', 'col'])
    for (let line = 0; line < 6; line++) {
      if (g.groups(g.shifted(session.current.board, axis, line, 1)).length)
        continue;
      const p = step(session, { action: 'shift', axis, line, amount: 1 });
      const m = visibleMove(p.current);
      if (m) {
        prepared = { p, m };
        break;
      }
    }
  assert.ok(prepared);
  const { p, m } = prepared;
  assert.ok(!p.marks.includes('prepared'));
  assert.ok(
    step(p, {
      action: 'shift',
      axis: m.axis,
      line: m.line,
      amount: m.amount,
    }).marks.includes('prepared'),
  );
  const nextRound = step(p, { action: 'end_turn' });
  const n = visibleMove(nextRound.current);
  assert.ok(
    !step(nextRound, {
      action: 'shift',
      axis: n.axis,
      line: n.line,
      amount: n.amount,
    }).marks.includes('prepared'),
  );
});
test('scored achievements are idempotent; three different builds are required; experiments and imports never score', () => {
  let p = lab.emptyLabProfile();
  for (const build of ['normal', 'shields', 'poison']) {
    let session = start({ build, scored: true });
    for (let i = 0; session.current.phase === 'battle' && i < 100; i++)
      session = battleStep(session);
    assert.equal(session.current.phase, 'victory');
    assert.deepEqual(
      lab.updateLabProfile(p, { ...session, imported: true }),
      p,
    );
    assert.deepEqual(
      lab.updateLabProfile(p, {
        ...session,
        config: { ...session.config, scored: false },
      }),
      p,
    );
    p = lab.updateLabProfile(p, session);
    assert.deepEqual(lab.updateLabProfile(p, session), p);
  }
  assert.ok(p.marks.includes('three-builds'));
  assert.equal(p.wins.duel.length, 3);
});

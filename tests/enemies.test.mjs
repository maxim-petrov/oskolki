import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';

function fixture(kind, round = 1) {
  const s = g.startRun(42),
    d = g.ENEMY_CATALOG[kind];
  s.enemies = [
    {
      id: 1,
      kind,
      name: d.name,
      hp: d.hp,
      maxHp: d.hp,
      damage: d.damage,
      block: 0,
      poison: 0,
    },
  ];
  s.target = 1;
  s.round = round;
  return s;
}

test('all ten new enemies have reachable, accurately described routes; the boss is separate at room ten', () => {
  const found = new Set();
  for (let room = 1; room <= 9; room++) {
    const s = g.startRun(90);
    s.phase = 'map';
    s.room = room;
    const original = JSON.stringify(s);
    for (const route of g.nextRooms(s)) {
      const r = g.enterRoom(s, route.id);
      assert.equal(r.error, undefined);
      assert.deepEqual(
        r,
        g.enterRoom(g.loadSave(JSON.parse(original)), route.id),
      );
      for (const enemy of r.state.enemies) {
        found.add(enemy.kind);
        assert.ok(route.description.includes(enemy.name));
        assert.ok(
          route.description.includes(g.ENEMY_CATALOG[enemy.kind].tactic),
        );
        assert.ok(enemy.hp > 0);
      }
      if (room === 9) {
        assert.equal(route.kind, 'boss');
        assert.deepEqual(
          r.state.enemies.map((e) => e.kind),
          ['censor'],
        );
      } else assert.ok(!r.state.enemies.some((e) => e.kind === 'censor'));
    }
    assert.equal(
      JSON.stringify(s),
      original,
      'route previews and entry must not mutate their input',
    );
  }
  assert.equal(g.NEW_ENEMY_KINDS.length, 10);
  assert.deepEqual(
    [...found].sort((a, b) => a.localeCompare(b)),
    [...g.NEW_ENEMY_KINDS, 'censor'].sort((a, b) => a.localeCompare(b)),
  );
  const early = g.startRun();
  early.phase = 'map';
  assert.ok(g.enterRoom(early, '10-boss').error);
});

test('every new enemy resolves the exact visible intent, including blocks, healing, energy and piercing', () => {
  for (const kind of [...g.NEW_ENEMY_KINDS, 'censor'])
    for (let round = 1; round <= 6; round++) {
      const s = fixture(kind, round);
      s.block = 3;
      s.energy = 1;
      s.enemies[0].hp -= 5;
      const before = JSON.stringify(s),
        e = s.enemies[0],
        action = g.intent(s, e);
      const r = g.endTurn(s),
        after = r.state,
        enemy = after.enemies[0];
      const damage =
        action.type === 'pierce'
          ? action.value
          : action.type === 'attack'
            ? Math.max(0, action.value - s.block)
            : 0;
      assert.equal(
        after.hp,
        s.hp - damage,
        `${kind} round ${round}: ${action.text}`,
      );
      assert.equal(enemy.block, action.type === 'block' ? action.value : 0);
      assert.equal(
        enemy.hp,
        e.hp + (action.type === 'heal' ? action.value : 0),
      );
      assert.equal(
        after.energy,
        s.energy - (action.type === 'drain' ? action.value : 0),
      );
      assert.equal(
        after.heroPoison,
        action.type === 'poison' ? action.value : 0,
      );
      assert.equal(
        after.board.filter((t) => t.root).length,
        action.type === 'roots' ? action.value : 0,
      );
      assert.equal(after.round, round + 1);
      assert.ok(g.isSave(after));
      assert.equal(JSON.stringify(s), before);
      assert.deepEqual(g.endTurn(g.loadSave(JSON.parse(before))), r);
    }
});

test('energy theft stops at zero, healing stops at max health, and dead healers cannot act', () => {
  const moth = fixture('moth');
  moth.energy = 0;
  assert.equal(g.endTurn(moth).state.energy, 0);
  const candle = fixture('candle', 3);
  candle.enemies[0].hp--;
  assert.equal(g.endTurn(candle).state.enemies[0].hp, candle.enemies[0].maxHp);
  candle.enemies[0].hp = 1;
  candle.enemies[0].poison = 2;
  const result = g.endTurn(candle);
  assert.equal(result.state.enemies[0].hp, 0);
  assert.equal(result.state.phase, 'reward');
  assert.ok(!result.frames.some((f) => f.cue?.type === 'heal'));
});

test('armor-piercing mirror hits ignore block and receive an attack animation', () => {
  const s = fixture('mirror', 2);
  s.block = 20;
  const r = g.endTurn(s);
  assert.equal(r.state.hp, s.hp - 6);
  assert.equal(r.state.stats.blocked, 0);
  assert.equal(r.frames[0].cue.type, 'attack');
  assert.equal(r.frames[0].state.block, 20);
});

test('heavy attacks are announced one turn early and respect the live enemy strength setting', () => {
  for (const [kind, round] of [
    ['eraser', 1],
    ['bell', 1],
    ['censor', 2],
  ])
    for (const power of [0.5, 1, 2]) {
      const s = fixture(kind, round);
      s.balance.enemyPower = power;
      const warning = g.intent(s, s.enemies[0]);
      assert.equal(warning.type, 'prepare');
      const r = g.endTurn(s).state;
      assert.equal(r.hp, s.hp);
      assert.equal(g.intent(r, r.enemies[0]).value, warning.value);
      assert.equal(g.endTurn(r).state.hp, s.hp - warning.value);
    }
});

test('censor switches phases at half health, binds three tiles and restores the same second phase', () => {
  const s = fixture('censor');
  s.room = 10;
  s.roomKind = 'boss';
  assert.equal(g.bossPhase(s.enemies[0]), 1);
  s.enemies[0].hp = 39;
  assert.equal(g.bossPhase(s.enemies[0]), 2);
  assert.equal(g.intent(s, s.enemies[0]).type, 'roots');
  let r = g.endTurn(s).state;
  const roots = r.board.filter((t) => t.root);
  assert.equal(roots.length, 3);
  assert.ok(roots.every((t) => t.root.owner === 1 && t.root.expires === 2));
  assert.deepEqual(g.loadSave(JSON.parse(JSON.stringify(r))), r);
  const warning = g.intent(r, r.enemies[0]);
  assert.equal(warning.value, 16);
  r = g.endTurn(r).state;
  assert.equal(
    r.hp,
    34,
    'three uncollected bound tiles deal 6 damage during preparation',
  );
  assert.equal(r.board.filter((t) => t.root).length, 0);
  assert.equal(g.intent(r, r.enemies[0]).value, 16);
  assert.equal(g.endTurn(r).state.hp, 18);
});

test('killing the final boss clears its board threats and finishes the run exactly once', () => {
  const s = fixture('tide-keeper');
  s.room = 20;
  s.tide = { row: 0, turns: 3, cleared: false };
  s.roomKind = 'boss';
  s.energy = 12;
  s.enemies[0].hp = 10;
  s.board[0].root = { owner: 1, expires: 1 };
  const r = g.castSkill(s, 'bolt').state;
  assert.equal(r.phase, 'victory');
  assert.equal(r.gold, s.gold + 40);
  assert.equal(r.board[0].root, undefined);
  assert.equal(g.endTurn(r).state, r);
  assert.equal(g.enterRoom(r, '20-boss').state, r);
  assert.ok(r.log.some((line) => line.includes('Хранитель прилива повержен')));
  const meta = g.updateMeta(g.EMPTY_META, r);
  assert.deepEqual(g.updateMeta(meta, r), meta);
});

test('legacy enemies still load but unknown or invalid enemy saves are rejected', () => {
  for (const kind of Object.keys(g.ENEMY_CATALOG)) {
    const s = fixture(kind);
    assert.deepEqual(g.loadSave(s), s);
  }
  for (const changes of [
    { kind: 'missing' },
    { hp: Infinity },
    { maxHp: 0 },
    { damage: -1 },
    { kind: 'toString' },
  ]) {
    const s = fixture('paper-rat');
    Object.assign(s.enemies[0], changes);
    assert.equal(g.loadSave(s), null);
  }
});

test('boss poison crossing the phase threshold cannot hide a stronger incoming hit', () => {
  const s = fixture('censor', 3);
  s.room = 10;
  s.roomKind = 'boss';
  s.enemies[0].hp = 40;
  s.enemies[0].poison = 2;
  const visible = g.intent(s, s.enemies[0]);
  assert.equal(visible.value, 16);
  assert.equal(g.endTurn(s).state.hp, s.hp - visible.value);
});

test('announced heavy damage includes next-round rage, while poison is predicted only once', () => {
  for (const [kind, round] of [
    ['eraser', 10],
    ['bell', 9],
    ['censor', 17],
  ]) {
    const s = fixture(kind, round);
    s.hp = s.maxHp = 200;
    if (kind === 'censor') s.roomKind = 'boss';
    const warning = g.intent(s, s.enemies[0]);
    assert.equal(warning.type, 'prepare');
    const next = g.endTurn(s).state;
    assert.equal(warning.value, g.intent(next, next.enemies[0]).value);
  }
  const s = fixture('censor', 3);
  s.enemies[0].hp = 42;
  s.enemies[0].poison = 2;
  const visible = g.intent(s, s.enemies[0]);
  assert.equal(visible.value, 12);
  assert.equal(g.endTurn(s).state.hp, s.hp - visible.value);
});

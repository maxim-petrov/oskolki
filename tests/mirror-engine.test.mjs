import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  dispatch,
  saveGame,
  loadGame,
  previewSwap,
  TURN_LIMIT,
  enemyFor,
} from '../game/mirror/engine.ts';
import { CHANNELS, legalSwaps, findMatches } from '../game/mirror/board.ts';
import { ITEMS } from '../game/duel/catalog.ts';
const config = (extra = {}) => ({
  seed: 71,
  classId: 'blade',
  mode: 'duel',
  foe: 0,
  ...extra,
});
const quiet = (exclude = 'strike') =>
  Array.from({ length: 56 }, (_, i) => ({
    id: 100 + i,
    kind: CHANNELS.filter((c) => c !== exclude)[
      ((i % 8) + Math.floor(i / 8)) % 3
    ],
    level: 1,
  }));
function triple(s, kind = 'strike', count = 3, level = 1) {
  s.board = quiet(kind);
  for (let i = 0; i < count - 1; i++)
    s.board[8 + i] = { id: 200 + i, kind, level: i === 0 ? level : 1 };
  s.board[16 + count - 1] = { id: 220, kind, level: 1 };
  s.nextId = 300;
  return { type: 'swap', a: 8 + count - 1, b: 16 + count - 1 };
}
const run = (s, n = 10) => {
  for (let i = 0; i < n && s.phase === 'battle'; i++) {
    const cell = s.board.findIndex((t) => t.kind === 'super' && !t.locked);
    const move =
      cell >= 0
        ? { type: 'super', cell }
        : { type: 'swap', ...legalSwaps(s.board)[0] };
    const r = dispatch(s, move);
    assert.equal(r.error, undefined);
    s = r.state;
  }
  return s;
};

test('new Mirror state isolates 8x7 and its journal from frozen duels', () => {
  const s = createGame(config());
  assert.equal(s.board.length, 56);
  assert.equal(findMatches(s.board).length, 0);
  assert.ok(legalSwaps(s.board).length);
  assert.equal(s.enemy.countdown, 3);
  assert.equal(s.hero.hp, 120);
  assert.deepEqual(loadGame(saveGame(s)), s);
  assert.equal(loadGame('{"schema":"oskolki-shared-board-4"}'), null);
});
test('invalid swap, wrapped adjacency, pinned and malformed commands leave every field untouched', () => {
  const s = createGame(config()),
    before = structuredClone(s);
  for (const command of [
    { type: 'swap', a: 7, b: 8 },
    { type: 'super', cell: 0 },
    { type: 'swap', a: 0, b: 55 },
    { type: 'reward', item: null },
    { type: 'guard', value: true },
    { type: 'next' },
    { type: 'nope' },
  ]) {
    const r = dispatch(s, command);
    assert.ok(r.error);
    assert.strictEqual(r.state, s);
    assert.deepEqual(s, before);
  }
  s.board[0].locked = 3;
  assert.ok(dispatch(s, { type: 'swap', a: 0, b: 1 }).error);
});
test('a successful swap resolves all waves before a single countdown step, without enemy swaps', () => {
  const s = createGame(config());
  s.enemy.hp = s.enemy.maxHp = 9999;
  const cmd = triple(s);
  const before = structuredClone(s),
    r = dispatch(s, cmd);
  assert.equal(r.error, undefined);
  assert.deepEqual(s, before);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.enemy.countdown, 2);
  assert.equal(r.state.enemy.cycle, 0);
  assert.ok(r.state.last.damage >= 10);
  assert.ok(r.frames.length >= 1);
  assert.ok(r.frames.every((f) => f.kind !== 'enemy'));
  assert.equal(r.state.board.length, 56);
});
test('four and five reward upgraded stones and repeated attacks, not natural bonus turns', () => {
  for (const [size, level] of [
    [4, 2],
    [5, 'super'],
  ]) {
    const s = createGame(config());
    s.enemy.hp = s.enemy.maxHp = 9999;
    const cmd = triple(s, 'strike', size);
    const r = dispatch(s, cmd);
    assert.equal(r.error, undefined);
    assert.equal(r.state.enemy.countdown, 2);
    assert.equal(r.state.turn, 1);
    assert.ok(r.state.last.casts >= size - 2);
    assert.ok(r.state.last.created >= 1);
    assert.ok(
      r.frames[0].after.some((t) =>
        level === 'super' ? t.kind === 'super' : t.level === level,
      ),
    );
  }
});
test('enhanced tiles select stronger automatic skills; bonuses add to the coefficient', () => {
  const normal = createGame(config({ testGear: [] }));
  normal.enemy.hp = normal.enemy.maxHp = 9999;
  const a = triple(normal);
  const enhanced = structuredClone(normal);
  enhanced.board[8].level = 2;
  const r1 = dispatch(normal, a),
    r2 = dispatch(enhanced, a);
  assert.ok(r2.frames[0].enemyHp < r1.frames[0].enemyHp);
  assert.equal(r2.state.enemy.countdown, 2);
  assert.ok(r2.state.last.xp >= 1);
});
test('S activates on click for free; cascades never advance enemy or hazard timers', () => {
  const s = createGame(config({ testGear: [] }));
  s.enemy.hp = s.enemy.maxHp = 9999;
  s.board[9] = { id: 500, kind: 'super', level: 1 };
  s.board[55].bomb = 3;
  const r = dispatch(s, { type: 'super', cell: 9 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.turn, 0);
  assert.equal(r.state.enemy.countdown, 3);
  assert.equal(r.state.metrics.supers, 1);
  assert.ok(r.state.last.damage >= 45);
  const bomb = r.state.board.find((t) => t.id === s.board[55].id);
  if (bomb) assert.equal(bomb.bomb, 3);
});
test('ordinary healing and rage immediately act rather than waiting for a manual cast', () => {
  for (const kind of ['mend', 'rage']) {
    const s = createGame(config({ testGear: [] }));
    s.hero.hp = 50;
    s.enemy.hp = 9999;
    const r = dispatch(s, triple(s, kind));
    if (kind === 'mend') assert.ok(r.state.hero.hp > 50);
    else assert.ok(r.state.hero.rage >= 4);
    assert.ok(r.state.hero.resonance[kind] >= 3);
  }
});
test('enemy attack occurs on zero, resets to the next telegraphed intent and first biome stays gentle', () => {
  const s = createGame(config({ testGear: [] }));
  s.enemy.hp = s.enemy.maxHp = 9999;
  s.enemy.countdown = 1;
  const r = dispatch(s, triple(s));
  assert.equal(r.error, undefined);
  assert.equal(r.state.enemy.cycle, 1);
  assert.equal(r.state.enemy.countdown, 3);
  assert.equal(r.state.hero.hp, 114);
  assert.ok(r.frames.some((f) => f.kind === 'enemy'));
  assert.ok(enemyFor(19).maxHp > enemyFor(0).maxHp);
  assert.ok(enemyFor(19).intents[0].damage > enemyFor(1).intents[0].damage);
});
test('newly spawned bombs retain full timer, existing bombs tick once per successful swap', () => {
  const s = createGame(config({ foe: 10, testGear: [] }));
  s.enemy.hp = s.enemy.maxHp = 9999;
  s.enemy.cycle = 1;
  s.enemy.countdown = 1;
  const r = dispatch(s, triple(s));
  assert.equal(r.error, undefined);
  const bombs = r.state.board.filter((t) => t.bomb);
  assert.equal(bombs.length, 2);
  assert.ok(bombs.every((t) => t.bomb === 3));
  const next = r.state;
  next.board[55].bomb = 1;
  const id = next.board[55].id;
  const move = legalSwaps(next.board).find(({ a, b }) => {
    const changed = next.board.slice();
    [changed[a], changed[b]] = [changed[b], changed[a]];
    return findMatches(changed).every((g) => g.cells.every((i) => i < 40));
  });
  if (move) {
    const n = dispatch(next, { type: 'swap', ...move });
    const tile = n.state.board.find((t) => t.id === id);
    if (tile) assert.equal(tile.bomb, undefined);
  }
});
test('final allowed exchange can win, but a living foe at the limit ends the run', () => {
  const s = createGame(config({ testGear: [] }));
  s.turn = TURN_LIMIT - 1;
  s.enemy.hp = s.enemy.maxHp = 9999;
  const cmd = triple(s);
  const lose = dispatch(s, cmd);
  assert.equal(lose.state.phase, 'lost');
  s.enemy.hp = 1;
  const win = dispatch(s, cmd);
  assert.equal(win.state.phase, 'won');
});
test('preview uses only visible geometry and changes neither resources nor RNG', () => {
  const s = createGame(config());
  const move = legalSwaps(s.board)[0],
    before = structuredClone(s);
  assert.ok(previewSwap(s, move.a, move.b));
  assert.deepEqual(s, before);
  const altered = structuredClone(s);
  altered.rng.board = 123;
  assert.deepEqual(
    previewSwap(altered, move.a, move.b),
    previewSwap(s, move.a, move.b),
  );
});
test('journal reproduces complete actions and rejects corruption and invalid loadouts', () => {
  const s = run(createGame(config({ seed: 99 })), 30);
  assert.deepEqual(loadGame(saveGame(s)), s);
  const raw = JSON.parse(saveGame(s));
  raw.fingerprint = 'broken';
  assert.equal(loadGame(JSON.stringify(raw)), null);
  raw.schema = 'unknown';
  assert.equal(loadGame(JSON.stringify(raw)), null);
  assert.throws(() => createGame(config({ testGear: ['coat', 'apron'] })));
  assert.throws(() =>
    createGame(config({ mode: 'route', testGear: ['coat'] })),
  );
  assert.throws(() => createGame(config({ seed: -1 })));
  assert.throws(() => createGame(config({ foe: 20 })));
});
test('route rewards maintain biome rarity gates, spending and one-item selection', () => {
  for (let room = 0; room < 20; room++) {
    const s = createGame(config({ mode: 'route' }));
    s.room = room;
    s.enemy = enemyFor(room);
    s.enemy.hp = 1;
    const r = dispatch(s, triple(s));
    if (room === 19) {
      assert.equal(r.state.phase, 'won');
      continue;
    }
    assert.equal(r.state.phase, 'camp');
    assert.equal(new Set([...r.state.offers, ...r.state.stock]).size, 6);
    if (room < 3)
      assert.ok(
        r.state.offers.every((id) =>
          ['common', 'uncommon'].includes(ITEMS[id].rarity),
        ),
      );
    if (room < 5)
      assert.ok(r.state.stock.every((id) => ITEMS[id].rarity === 'common'));
    assert.ok(dispatch(r.state, { type: 'next' }).error);
    const accepted = dispatch(r.state, {
      type: 'reward',
      item: r.state.offers[0],
    });
    assert.equal(accepted.error, undefined);
    assert.ok(dispatch(accepted.state, { type: 'reward', item: null }).error);
    const advanced = dispatch(accepted.state, { type: 'next' });
    assert.equal(advanced.state.room, room + 1);
    assert.equal(advanced.state.phase, 'battle');
    assert.equal(advanced.state.turn, 0);
  }
});
test('all 60 identities can equip in test mode and resolve a reproducible fight without NaNs', () => {
  assert.equal(Object.keys(ITEMS).length, 60);
  for (const id of Object.keys(ITEMS)) {
    const s = run(createGame(config({ seed: 41, testGear: [id] })), 12);
    assert.equal(
      Number.isFinite(s.hero.hp + s.enemy.hp + s.hero.barrier + s.hero.rage),
      true,
      id,
    );
    assert.ok(s.hero.barrier >= 0 && s.hero.barrier <= 12, id);
    assert.deepEqual(loadGame(saveGame(s)), s, id);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newRun } from '../game/run.ts';

const dev = (run, op) => dispatch(run, { type: 'dev', op });

test('dev commands only work in a custom (test) run', () => {
  const { run } = newRun({ seed: 5 });
  const r = dev(run, { op: 'hero', coins: 500 });
  assert.equal(r.events[0]?.t, 'invalid');
  assert.equal(r.run.hero.coins, run.hero.coins);
});

test('a test run takes a build, a place and cheats', () => {
  let { run } = newRun({ seed: 7, char: 'janitor', customSeed: true });
  run = dev(run, { op: 'set', dev: { god: true, ink: true, enemyHp: 2 } }).run;
  run = dev(run, { op: 'act', act: 2 }).run;
  assert.equal(run.act, 2);
  run = dev(run, { op: 'build', deck: [{ id: 'fist' }, { id: 'fist', up: true }, { id: 'nope' }], relics: ['mop', 'mop'], active: 'corrector', pockets: ['bomb'] }).run;
  assert.deepEqual(
    run.hero.deck.map((c) => [c.id, c.up]),
    [
      ['fist', false],
      ['fist', true],
    ],
  );
  assert.deepEqual(run.hero.relics, ['mop']);
  assert.equal(run.hero.pockets[0], 'bomb');
  run = dev(run, { op: 'enter', kind: 'boss' }).run;
  assert.equal(run.phase, 'combat');
  assert.equal(run.combat.kind, 'boss');
  assert.equal(run.hero.charge > 0, true, 'the skill is charged');
  // The run ends after the third act here (lastAct 2): beating its boss wins the shift.
  const win = dev(run, { op: 'win' });
  assert.equal(win.run.phase, 'won');
  assert.ok(win.events.some((e) => e.t === 'combatWon'));
  // An earlier boss gives the rewards.
  const early = dev(dev(dev(run, { op: 'act', act: 0 }).run, { op: 'enter', kind: 'boss' }).run, { op: 'win' });
  assert.equal(early.run.phase, 'reward');
});

test('god mode: enemies hit for nothing', () => {
  let { run } = newRun({ seed: 11, customSeed: true });
  run = dev(run, { op: 'set', dev: { god: true } }).run;
  run = dev(run, { op: 'enter', kind: 'fight', enemies: ['rat'] }).run;
  const hp = run.hero.hp;
  // Let the enemy act a few times: wait out its timer with moves.
  for (let k = 0; k < 12 && run.phase === 'combat'; k++) {
    const cells = run.combat.board.cells;
    let moved = false;
    for (let i = 0; i < cells.length && !moved; i++)
      for (const j of [i + 1, i + 6]) {
        if (j >= cells.length || (j === i + 1 && j % 6 === 0)) continue;
        const r = dispatch(run, { type: 'move', move: { from: i, to: j } });
        if (r.events.some((e) => e.t === 'invalid')) continue;
        run = r.run;
        moved = true;
        break;
      }
    if (!moved) break;
  }
  assert.equal(run.hero.hp, hp);
});

test('every ready-made dev test uses real content and starts', async () => {
  const { DEV_SUITES } = await import('../render/dev-presets.ts');
  const { CARDS } = await import('../game/content/cards.ts');
  const { ITEMS, POCKETS } = await import('../game/content/items.ts');
  const { ENEMIES } = await import('../game/content/enemies.ts');
  let n = 0;
  for (const suite of DEV_SUITES)
    for (const item of suite.items) {
      const c = item.cfg;
      for (const e of c.enemies ?? []) assert.ok(ENEMIES[e], `${item.id}: enemy ${e}`);
      if (c.build) {
        for (const card of c.build.deck) assert.ok(CARDS[card.id], `${item.id}: card ${card.id}`);
        for (const r of c.build.relics) assert.equal(ITEMS[r]?.kind, 'passive', `${item.id}: relic ${r}`);
        if (c.build.active) assert.equal(ITEMS[c.build.active]?.kind, 'active', `${item.id}: active ${c.build.active}`);
        for (const p of c.build.pockets) if (p) assert.ok(POCKETS[p], `${item.id}: pocket ${p}`);
      }
      // The same steps as DevApi.start.
      let { run } = newRun({ seed: 3, char: c.char, lastAct: 3, customSeed: true });
      const step = (op) => {
        const r = dev(run, op);
        assert.ok(!r.events.some((e) => e.t === 'invalid'), `${item.id}: ${op.op}`);
        run = r.run;
      };
      step({ op: 'set', dev: { ...c.cheats } });
      if (c.act > 0) step({ op: 'act', act: c.act });
      if (c.build) step({ op: 'build', ...c.build });
      if (c.hero) step({ op: 'hero', ...c.hero });
      if (c.place !== 'map') step({ op: 'enter', kind: c.place, enemies: c.enemies, event: c.event });
      if (c.enemies?.length) assert.deepEqual(run.combat.enemies.map((e) => e.def).slice(0, c.enemies.length), c.enemies, item.id);
      n++;
    }
  assert.ok(n >= 40, `${n} tests`);
});

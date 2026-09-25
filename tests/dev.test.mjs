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

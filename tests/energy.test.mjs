// Energy is spent four ways: the skill, a gear swap (gear.test.mjs), «Заряд» (every group of the
// next move's first wave is a super) and «Вне очереди» (the enemies wait out the next move). The
// meter holds 10 and keeps its charge between fights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARGE_COST, ENERGY_MAX, RUSH_COST, energyCap, previewMove } from '../game/combat.ts';
import { computeMods } from '../game/content/items.ts';
import { dispatch, newRun } from '../game/run.ts';
import { decide } from '../game/bot.ts';
import { BLUE3, RED3, act, foe, line, play, put, queue, ready, scene } from './scene.mjs';

const arm = (run, what) => act(run, { type: 'arm', what });

test('the meter holds 10 and keeps its charge between fights', () => {
  assert.equal(ENERGY_MAX, 10);
  assert.equal(energyCap(scene({})), 10, 'и без навыка, и без запасных вещей');
  const run = scene({ charge: 6, enemies: ['drop'], enemyHp: 1 });
  const won = play(run, line(run, RED3)).run;
  assert.equal(won.phase, 'reward');
  assert.equal(won.hero.charge, 6, 'заряд остаётся после боя');
});

test('«Заряд»: 4 energy, every group of the next move is a super — the preview shows it', () => {
  const run = scene({ charge: 5, enemies: ['anchor', 'drop'], enemyHp: 999 });
  const move = line(run, RED3);
  const plain = previewMove(run, computeMods(run.hero.relics), move);
  assert.equal(plain.aoe, 0, 'тройка — обычный удар');
  const armed = arm(run, 'charge');
  assert.equal(armed.run.hero.charge, 5 - CHARGE_COST, 'энергия списана сразу');
  assert.ok(armed.events.some((e) => e.t === 'armed' && e.what === 'charge' && e.on));
  assert.equal(previewMove(armed.run, computeMods(run.hero.relics), move).aoe, 6, 'предпросмотр: длинный разрез ножа');
  const res = play(armed.run, move);
  assert.equal(res.strike.aoe, 6, 'тройка сработала как супер');
  assert.ok(res.strike.notes.includes('Заряд: все группы — супер'));
  assert.equal(res.run.combat.armed, undefined, 'и только на один ход');
  assert.equal(play(res.run, line(res.run, RED3, { row: 4 })).strike.aoe, 0);
  // Blue too: half a heart more.
  const blue = arm(scene({ charge: 4, enemyHp: 999 }), 'charge').run;
  assert.equal(play(blue, line(blue, BLUE3)).strike.armor, 2);
});

test('«Заряд» works on the first wave only (the preview stays exact)', () => {
  const run = scene({ charge: 4, enemyHp: 999, enemies: ['anchor', 'drop'] });
  const move = line(run, RED3, { row: 5 });
  for (let c = 0; c < 3; c++) queue(run, c, ['blade', 'tape', 'tape']);
  const res = play(arm(run, 'charge').run, move);
  assert.ok(res.waves.filter((w) => w.groups.length).length >= 2, 'есть каскад');
  assert.equal(res.strike.aoe, 6, 'длинный разрез только у первой волны');
});

test('cancelling gives the energy back; not enough energy, nothing readied', () => {
  const run = scene({ charge: 4 });
  const on = arm(run, 'charge').run;
  const off = arm(on, 'charge');
  assert.equal(off.run.hero.charge, 4);
  assert.ok(off.events.some((e) => e.t === 'armed' && !e.on));
  assert.equal(off.run.combat.armed?.charge, false);
  assert.equal(arm(scene({ charge: 3 }), 'charge').invalid?.reason, 'Нужно 4 энергии');
  assert.equal(arm(scene({ charge: 6 }), 'rush').invalid?.reason, 'Нужно 7 энергии');
});

test('«Вне очереди»: 7 energy, the enemies wait out the next move; never two in a row', () => {
  const run = scene({ charge: 14, enemies: ['rat'], enemyHp: 999 });
  ready(run, 'attack');
  const before = foe(run).countdown;
  const armed = arm(run, 'rush');
  assert.equal(armed.run.hero.charge, 14 - RUSH_COST);
  const res = play(armed.run, line(armed.run, RED3));
  assert.equal(res.acts.length, 0, 'враг не сходил');
  assert.equal(foe(res.run).countdown, before, 'таймер стоит');
  assert.ok(res.procs.some((p) => p.text === 'Вне очереди: враги ждут'));
  assert.equal(arm(res.run, 'rush').invalid?.reason, 'Вне очереди — не два хода подряд');
  // The next move is a plain one: the enemy acts; then it can be readied again.
  const next = play(res.run, line(res.run, RED3, { row: 4 }));
  assert.equal(next.acts.length, 1);
  assert.ok(!arm(next.run, 'rush').invalid);
});

test('«Вне очереди» stops the clock, not the damage over time', () => {
  const run = scene({ charge: 7, gear: ['scissors'], enemyHp: 999 });
  const armed = arm(run, 'rush').run;
  const res = play(armed, line(armed, RED3));
  assert.equal(foe(res.run).hp, 999 - 6 - 1, 'кровотечение тикает');
  // With the coffee's quiet ticks on, a move out of turn is pointless.
  const coffee = act(scene({ active: 'coffeeToGo', charge: 13 }), { type: 'active' }).run;
  assert.equal(arm(coffee, 'rush').invalid?.reason, 'Враги и так ждут');
});

test('energy readied for a move that never came goes back when the fight ends', () => {
  const run = scene({ charge: 10, pockets: ['bomb'], enemies: ['drop'], enemyHp: 1 });
  put(run, 0, 1, 'blade');
  const armed = arm(run, 'rush').run;
  assert.equal(armed.hero.charge, 3);
  // A bomb from the pocket ends the fight without a move.
  const res = act(armed, { type: 'pocket', slot: 0, cell: 0 });
  assert.equal(res.run.phase, 'reward');
  assert.equal(res.run.hero.charge, 10, 'энергия вернулась');
});

test('the greedy bot spends energy all four ways over whole runs', () => {
  const seen = { active: 0, charge: 0, rush: 0, gear: 0 };
  for (let seed = 1; seed <= 8; seed++) {
    let run = newRun({ seed, intro: true }).run;
    const r = { s: seed * 7919 };
    for (let step = 0; step < 20000 && run.phase !== 'dead' && run.phase !== 'won'; step++) {
      const a = decide(run, { policy: 'greedy', seed }, r);
      if (!a) break;
      const res = dispatch(run, a);
      if (res.events.some((e) => e.t === 'invalid')) {
        run = dispatch(res.run, { type: 'leave' }).run;
        continue;
      }
      if (a.type === 'active') seen.active++;
      if (a.type === 'arm') seen[a.what]++;
      if (a.type === 'gear' && run.phase === 'combat') seen.gear++;
      run = res.run;
    }
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `бот не тратит энергию на ${k}: ${JSON.stringify(seen)}`);
});

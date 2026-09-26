// Every enemy action does what its intent says, bosses change phase, splitters split, long fights
// get harder. A new kind of action needs its check here: the registry test fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../game/content/enemies.ts';
import { OVERTIME_AFTER, intentDamage } from '../game/combat.ts';
import { playFight } from '../game/balance/lab.ts';
import { CLIPS, FISTS, foe, idx, line, moves, play, put, ready, scene } from './scene.mjs';

/** The enemy (first in `enemies`) does `kind` on the next tick; returns the move's result. */
function doing(kind, opts = {}) {
  const run = scene({ real: true, enemyHp: 999, ...opts });
  ready(run, kind);
  const [res] = moves(run, 1);
  const a = res.acts.find((x) => x.intent.kind === kind);
  assert.ok(a, `${opts.enemies?.[0]} сделал «${kind}»`);
  return { res, a, run: res.run };
}

const INTENT_CHECKS = {
  attack() {
    const { a } = doing('attack', { enemies: ['rat'] });
    assert.equal(a.hurt.amount, 14);
    assert.equal(doing('attack', { enemies: ['rat'], act: 1 }).a.hurt.amount, 28, 'во 2-м отделе урон ×2');
  },
  heavy: () => assert.equal(doing('heavy', { enemies: ['eraser'] }).a.hurt.amount, 29),
  block() {
    const { run } = doing('block', { enemies: ['safe'] });
    assert.equal(foe(run).block, 10);
  },
  heal() {
    const run = scene({ real: true, enemies: ['candle', 'drop'] });
    foe(run, 1).hp = 10;
    ready(run, 'heal');
    const a = moves(run, 1)[0].acts.find((x) => x.intent.kind === 'heal');
    assert.deepEqual(a.healed, { uid: foe(run, 1).uid, amount: 6 }, 'лечит самого раненого');
  },
  summon() {
    const { run } = doing('summon', { enemies: ['supervisor'] });
    assert.equal(run.combat.enemies.filter((e) => e.hp > 0).length, 2);
  },
  ink() {
    const { a } = doing('ink', { enemies: ['blot'] });
    assert.equal(a.cells.length, 2);
    for (const i of a.cells) assert.equal(a.board[i].kind, 'junk');
  },
  pin() {
    const { a } = doing('pin', { enemies: ['stapler'] });
    assert.equal(a.cells.length, 1);
    assert.equal(a.board[a.cells[0]].pin, true);
  },
  ember() {
    const { a } = doing('ember', { enemies: ['stoker'] });
    assert.equal(a.cells.length, 2);
    for (const i of a.cells) assert.equal(a.board[i].fuse, 3);
  },
  censor() {
    const { a } = doing('censor', { enemies: ['archivist'] });
    assert.equal(a.cells.length, 4);
    for (const i of a.cells) assert.equal(a.board[i].hidden, 4);
  },
  stealCharge: () => assert.equal(doing('stealCharge', { enemies: ['moth'], active: 'stapler', charge: 5 }).a.stolen, 3),
  stealCoins() {
    const { run, a } = doing('stealCoins', { enemies: ['angler'], coins: 50 });
    assert.equal(a.stolen, 8);
    assert.equal(foe(run).stolen, 8);
    // Killing the thief returns the coins.
    foe(run).hp = 1;
    const coins = run.hero.coins;
    const back = play(run, line(run, FISTS)).run;
    assert.equal(back.hero.coins - coins >= 8, true);
  },
  pinch() {
    const { a } = doing('pinch', { enemies: ['crab'] });
    if (a.cells) assert.equal(a.cells.length, 6, 'сдвинут целый ряд');
    else assert.equal(a.hurt.amount, 4, 'сдвигать нечего — щиплет на 4');
  },
  tide: () => assert.equal(doing('tide', { enemies: ['tide'] }).run.combat.board.flood, 1),
  submerge() {
    const { run } = doing('submerge', { enemies: ['eel'] });
    assert.equal(foe(run).submerged, true);
    const hp = foe(run).hp;
    const res = play(run, line(run, FISTS, { row: 4 }));
    assert.equal(foe(res.run).hp, hp, 'под водой удар не достаёт');
  },
  shine() {
    const { run } = doing('shine', { enemies: ['mirror'] });
    assert.equal(foe(run).shining, true);
    const hp = run.hero.hp;
    const res = play(run, line(run, FISTS, { row: 4 }));
    assert.ok(res.run.hero.hp < hp, 'блеск отражает часть удара');
  },
  anchor() {
    const { run } = doing('anchor', { enemies: ['anchor'] });
    assert.ok(run.combat.board.colLock.some((k) => k === 3));
  },
  strike() {
    const { a } = doing('strike', { enemies: ['censor'] });
    assert.equal(a.hurt.amount, 26);
    assert.equal(a.cells.length, 1);
    assert.equal(a.board[a.cells[0]].pin, true);
  },
  erase() {
    // The test board keeps one special: the bomb in the far corner.
    const run = scene({ enemies: ['eraser'], enemyHp: 999 });
    ready(run, 'erase');
    const a = play(run, line(run, FISTS)).acts[0];
    assert.deepEqual(a.cells, [idx(5, 5)]);
    assert.equal(a.board[idx(5, 5)].special, undefined, 'стёр особую фишку');
    const bare = scene({ enemies: ['eraser'], enemyHp: 999 });
    put(bare, 5, 5, 'redtape');
    ready(bare, 'erase');
    assert.equal(play(bare, line(bare, FISTS)).acts[0].hurt.amount, 4, 'особых нет — бьёт на 4');
  },
  tape() {
    const { a, run } = doing('tape', { enemies: ['kipa'] });
    assert.equal(a.cells.length, 2);
    for (const i of a.cells) assert.equal(a.board[i].card, 'redtape');
    assert.ok(
      run.combat.board.source.some((t) => t.card === 'redtape'),
      'волокита легла в мешок',
    );
  },
  hurry() {
    const run = scene({ real: true, enemies: ['phone', 'rat'], enemyHp: 999 });
    ready(run, 'hurry');
    foe(run, 1).countdown = 3;
    const [res] = moves(run, 1);
    assert.equal(foe(res.run, 1).countdown, 1, 'таймер соседа −1 после тика');
  },
};

test('every kind of enemy action has a check', () => {
  const kinds = new Set();
  for (const e of Object.values(ENEMIES)) for (const i of [...e.intents, ...(e.phases ?? []).flatMap((p) => p.intents)]) kinds.add(i.kind);
  for (const k of kinds) assert.ok(INTENT_CHECKS[k], `нет проверки для действия «${k}»`);
});

for (const [kind, check] of Object.entries(INTENT_CHECKS)) test(`действие врага «${kind}»`, check);

test('bosses and the cabinet change phase at their thresholds', () => {
  for (const e of Object.values(ENEMIES).filter((x) => x.phases))
    e.phases.forEach((p, k) => {
      const run = scene({ enemies: [e.id], enemyHp: 1000 });
      const boss = foe(run);
      boss.hp = Math.floor(p.at * boss.maxHp) + 3;
      for (let j = 0; j < k; j++) boss.phase = j + 1;
      const res = play(run, line(run, FISTS));
      assert.ok(
        res.events.some((x) => x.t === 'phase' && x.phase === k + 1),
        `${e.name}: фаза ${k + 2} на ${Math.round(p.at * 100)}%`,
      );
    });
});

test('a splitting enemy falls apart into two on death', () => {
  for (const e of Object.values(ENEMIES).filter((x) => x.splitInto)) {
    const run = scene({ enemies: [e.id], enemyHp: 1 });
    const res = play(run, line(run, FISTS));
    const alive = res.run.combat?.enemies.filter((x) => x.hp > 0) ?? [];
    assert.equal(alive.length, 2, `${e.name} → 2 × ${ENEMIES[e.splitInto].name}`);
    assert.ok(alive.every((x) => x.def === e.splitInto));
  }
});

test('a dive ends on time even when the timer is pushed back (no endless fight under water)', () => {
  let run = scene({ enemies: ['eel'], enemyHp: 999 });
  ready(run, 'submerge');
  run = play(run, line(run, CLIPS)).run;
  assert.equal(foe(run).submerged, true, 'угорь нырнул');
  const ticks = foe(run).countdown;
  for (let k = 0; k < ticks; k++) {
    foe(run).countdown += 5; // urgent stamps, ice, the megaphone…
    run = play(run, line(run, CLIPS)).run;
  }
  assert.equal(foe(run).submerged, false, 'вынырнул через столько же ходов, сколько длится нырок');
  assert.ok(foe(run).countdown > 1, 'но ударит позже — задержка таймера работает');
});

test('long fights get harder: +2 damage every 5 moves after the 20th', () => {
  const run = scene({ enemies: ['rat'] });
  const c = run.combat;
  const e = foe(run);
  const base = intentDamage(c, e);
  c.moves = OVERTIME_AFTER;
  assert.equal(intentDamage(c, e), base);
  c.moves = OVERTIME_AFTER + 1;
  assert.equal(intentDamage(c, e), base + 2);
  c.moves = OVERTIME_AFTER + 6;
  assert.equal(intentDamage(c, e), base + 4);
});

test('armor soaks one enemy action and burns out', () => {
  const run = scene({ enemies: ['rat'] });
  run.hero.armor = 20;
  ready(run, 'attack');
  const res = play(run, line(run, CLIPS));
  assert.equal(res.acts[0].hurt.armor, 14);
  assert.equal(res.run.hero.armor, 0, 'остаток брони сгорает');
});

test('the mirror sends back a quarter of a blow, at most a heavy hit of its act', () => {
  const blow = (heroDmg) => {
    const run = scene({
      enemies: ['mirror'],
      enemyHp: 99999,
      act: 2,
      hp: 500,
      maxHp: 500,
    });
    run.dev = { heroDmg };
    foe(run).shining = true;
    const res = play(run, line(run, FISTS));
    return { dealt: res.strike.damage, back: 500 - res.run.hero.hp };
  };
  const small = blow(10);
  assert.equal(small.back, Math.round(small.dealt * 0.25));
  assert.equal(blow(1000).back, Math.round(18 * 3), 'потолок — тяжёлый удар 3-го отдела');
});

test('every enemy of the game can be fought to the end with a starter deck (no stalls, no broken states)', () => {
  for (const id of Object.keys(ENEMIES)) {
    const run = scene({ real: true, enemies: [id], hp: 999, maxHp: 999 });
    const res = playFight(run, { seed: 1, check: true });
    assert.deepEqual(res.violations, [], id);
    assert.equal(res.stuck, false, `${id}: бой завис`);
    assert.ok(res.won || res.dead, `${ENEMIES[id].name}: бой закончился (${res.moves} ходов)`);
  }
});

// Every enemy action does what its intent says, bosses change phase, splitters split, long fights
// get harder. A new kind of action needs its check here: the registry test fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../game/content/enemies.ts';
import { ACTS } from '../game/content/acts.ts';
import { MAX_HOLD, OVERTIME_AFTER, intentDamage } from '../game/combat.ts';
import { playFight } from '../game/balance/lab.ts';
import { checkRun } from '../game/balance/invariants.ts';
import { validMoves } from '../game/board.ts';
import { CLIPS, FISTS, act, blowOf, byBlows, foe, idx, line, moves, play, put, ready, scene } from './scene.mjs';

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
    assert.equal(a.hurt.amount, blowOf('rat', 'attack'));
    assert.equal(doing('attack', { enemies: ['rat'], act: 1 }).a.hurt.amount, blowOf('rat', 'attack', 1), 'во 2-м отделе удар сильнее');
  },
  heavy: () => assert.equal(doing('heavy', { enemies: ['eraser'] }).a.hurt.amount, blowOf('eraser', 'heavy')),
  block() {
    const { run } = doing('block', { enemies: ['safe'] });
    assert.equal(foe(run).block, 10);
  },
  heal() {
    // A move of coins: nobody is hit, the drop stays the most wounded.
    const run = scene({ enemies: ['candle', 'drop'] });
    foe(run, 1).hp = 10;
    ready(run, 'heal');
    const a = play(run, line(run, CLIPS)).acts.find((x) => x.intent.kind === 'heal');
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
    assert.equal(a.stolen, byBlows(8));
    assert.equal(foe(run).stolen, byBlows(8));
    // Killing the thief returns the coins.
    foe(run).hp = 1;
    const coins = run.hero.coins;
    const back = play(run, line(run, FISTS)).run;
    assert.equal(back.hero.coins - coins >= byBlows(8), true);
  },
  pinch() {
    const { a } = doing('pinch', { enemies: ['crab'] });
    if (a.cells) assert.equal(a.cells.length, 6, 'сдвинут целый ряд');
    else assert.equal(a.hurt.amount, byBlows(4), 'сдвигать нечего — щиплет');
  },
  tide: () => assert.equal(doing('tide', { enemies: ['tide'] }).run.combat.board.flood, 1),
  submerge() {
    const { run } = doing('submerge', { enemies: ['eel'] });
    assert.equal(foe(run).submerged, true);
    const hp = foe(run).hp;
    const res = play(run, line(run, FISTS, { row: 4 }));
    assert.equal(foe(res.run).hp, hp - res.strike.aoe, 'под водой удар не достаёт (урон всем — достаёт)');
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
    assert.equal(a.hurt.amount, blowOf('censor', 'strike'));
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
    assert.equal(play(bare, line(bare, FISTS)).acts[0].hurt.amount, byBlows(4), 'особых нет — бьёт');
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

// Traits that change the rules of the fight (the others are labels for the view).
const TRAIT_CHECKS = {
  turnstile() {
    const sideways = (enemies, hp = 999) => {
      const run = scene({ enemies, enemyHp: hp });
      put(run, 2, 0, 'fist');
      put(run, 2, 1, 'fist');
      put(run, 2, 3, 'fist');
      return { run, move: { from: idx(2, 3), to: idx(2, 2) } };
    };
    const held = sideways(['turnstile']);
    assert.equal(play(held.run, held.move).invalid?.reason, 'Турникет: только вверх и вниз');
    assert.ok(!play(held.run, line(held.run, FISTS, { row: 4 })).invalid, 'вверх и вниз можно');
    assert.ok(validMoves(held.run.combat.board, { wrap: false, vertical: true }).every((m) => m.to - m.from !== 1), 'бот видит только вертикальные ходы');
    // With the turnstile down, tiles move sideways again.
    const free = sideways(['turnstile', 'rat']);
    foe(free.run).hp = 0;
    assert.equal(play(free.run, free.move).strike.tally.dmg, 6);
  },
  cramped() {
    const run = scene({ real: true, enemies: ['storekeeper', 'rat'], hp: 999, maxHp: 999 });
    assert.equal(run.combat.board.w, 5, 'пока она в бою, поле на столбец уже');
    const before = run.combat.board.cells.map((t) => t.id);
    foe(run).hp = 1;
    const kill = validMoves(run.combat.board, { wrap: false })[0];
    const res = play(run, kill);
    const grown = res.events.find((e) => e.t === 'resize');
    assert.ok(grown, 'упала — поле растёт');
    assert.deepEqual([res.run.combat.board.w, res.run.combat.board.cells.length], [6, 36]);
    assert.deepEqual(checkRun(res.run), [], 'поле цело');
    assert.ok(res.run.combat.board.cells.filter((t) => before.includes(t.id)).length > 0, 'старые фишки на месте');
  },
};

test('every trait that changes the rules has a check', () => {
  const traits = new Set(Object.values(ENEMIES).flatMap((e) => e.traits ?? []));
  for (const t of ['turnstile', 'cramped']) assert.ok(traits.has(t) && TRAIT_CHECKS[t], `нет проверки для свойства «${t}»`);
});

for (const [trait, check] of Object.entries(TRAIT_CHECKS)) test(`свойство врага «${trait}»`, check);

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

test('long fights get harder: +½ heart every 5 moves after the 20th', () => {
  const run = scene({ enemies: ['rat'] });
  const c = run.combat;
  const e = foe(run);
  const base = intentDamage(c, e);
  c.moves = OVERTIME_AFTER;
  assert.equal(intentDamage(c, e), base);
  c.moves = OVERTIME_AFTER + 1;
  assert.equal(intentDamage(c, e), base + 1);
  c.moves = OVERTIME_AFTER + 6;
  assert.equal(intentDamage(c, e), base + 2);
});

test('armor soaks one enemy action and burns out', () => {
  const run = scene({ enemies: ['rat'] });
  run.hero.armor = 20;
  ready(run, 'attack');
  const res = play(run, line(run, CLIPS));
  assert.equal(res.acts[0].hurt.armor, blowOf('rat', 'attack'));
  assert.equal(res.run.hero.armor, 0, 'остаток брони сгорает');
});

test('every blow at a shining mirror costs the hero half its blow scale (a heart in the boiler room)', () => {
  const back = (heroDmg, act = 2) => {
    const run = scene({ enemies: ['mirror'], enemyHp: 99999, act, hp: 500, maxHp: 500 });
    run.dev = { heroDmg };
    foe(run).shining = true;
    return 500 - play(run, line(run, FISTS)).run.hero.hp;
  };
  assert.equal(back(1), back(1000), 'не зависит от силы удара');
  assert.equal(back(1), Math.max(1, Math.round(ACTS[2].dmgMul / 2)), 'половина масштаба ударов отдела');
  assert.equal(back(1, 0), 1, 'в 1-м отделе — половинка сердца');
});

test('a blow the mirror sends back can kill a hero on half a heart', () => {
  // A move without armour: the reflection lands in full.
  const run = scene({ enemies: ['mirror'], enemyHp: 99999, act: 2, hp: 1, maxHp: 50 });
  foe(run).shining = true;
  const res = play(run, line(run, FISTS));
  assert.equal(res.run.phase, 'dead');
  assert.equal(res.run.hero.hp, 0);
  // With armour from the same move the half heart is blocked.
  const safe = scene({ enemies: ['mirror'], enemyHp: 99999, act: 2, hp: 1, maxHp: 50 });
  foe(safe).shining = true;
  for (const c of [0, 1]) put(safe, 2, c, 'fist');
  put(safe, 1, 2, 'fist');
  put(safe, 2, 2, 'folder');
  for (const c of [0, 1]) put(safe, 1, c, 'folder');
  assert.equal(play(safe, { from: idx(1, 2), to: idx(2, 2) }).run.phase, 'combat');
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

test('enemy armour, shields and heals grow with enemy health from act to act', () => {
  const HP = ACTS[2].hpMul;
  assert.equal(foe(scene({ act: 2, enemies: ['eraser'] })).armor, 2 * HP, 'броня');
  const safe = scene({ act: 2, real: true, enemies: ['safe'], enemyHp: 99999 });
  ready(safe, 'block');
  assert.equal(foe(moves(safe, 1)[0].run).block, 10 * HP, 'щит');
  const heal = scene({ act: 2, enemies: ['candle', 'drop'] });
  foe(heal, 1).hp = 10;
  ready(heal, 'heal');
  const a = play(heal, line(heal, CLIPS)).acts.find((x) => x.intent.kind === 'heal');
  assert.equal(a.healed.amount, Math.min(6 * HP, foe(heal, 1).maxHp - 10), 'лечение');
});

test('armour holds for one tick: it burns out even when no enemy acts', () => {
  const run = scene({ enemies: ['anchor'], enemyHp: 999 });
  const res = play(run, line(run, ['folder', 'folder', 'folder']));
  assert.equal(res.strike.armor, 1);
  assert.equal(res.acts.length, 0, 'враг в этот тик не действует');
  assert.equal(res.run.hero.armor, 0, 'а броня всё равно сгорела');
});

test(`an enemy can be held back at most ${MAX_HOLD} ticks between its actions`, () => {
  const run = scene({ enemies: ['rat'], enemyHp: 999, pockets: ['sticker'], active: 'megaphone', charge: 8 });
  const start = foe(run).countdown;
  const held = act(act(run, { type: 'pocket', slot: 0 }).run, { type: 'active' }).run;
  assert.equal(foe(held).countdown, start + MAX_HOLD, 'стикер +2 и мегафон +2 — но не больше предела');
  // After it acts, it can be held again.
  foe(held).countdown = 1;
  const after = play(held, line(held, CLIPS)).run;
  assert.equal(foe(after).held, 0);
});

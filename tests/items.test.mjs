// Every item, skill and pocket does what its tooltip says (gear is checked in gear.test.mjs). A new
// item needs its check here: the registry test fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gainRelic, newRun } from '../game/run.ts';
import { ITEMS, POCKETS, computeMods } from '../game/content/items.ts';
import { ARMOR_CAP, activeCost, swapCost } from '../game/combat.ts';
import { QUEUE_LEN } from '../game/types.ts';
import { ACTS } from '../game/content/acts.ts';
import { playFight } from '../game/balance/lab.ts';
import { BLUE3, GOLD3, RED3, VIOLET3, act, blowOf, byBlows, cascade, foe, hit, idx, line, moves, play, put, queue, ready, scene, tile } from './scene.mjs';

/**
 * Removes the tile under a lifted red tile: it drops into a ready pair and completes a line.
 * `action` makes the action for the erased cell.
 */
function erasedLine(opts, action) {
  const run = scene({ enemyHp: 999, ...opts });
  put(run, 4, 0, 'blade');
  put(run, 4, 1, 'blade');
  put(run, 3, 2, 'blade');
  return act(run, action(run, idx(4, 2)));
}

/** The armour a move left the hero with: it burns out at the end of the tick (the expiry says how much). */
function armorOfMove(res) {
  return -(res.effects.find((f) => f.kind === 'armor' && f.source === 'expire')?.amount ?? 0) || res.run.hero.armor;
}

/** How often a note shows up on the strike over many seeds, with the percent it names (+30% → 0.3). */
function noteRate(relic, prefix, n = 300) {
  const values = [];
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = hit({ seed, relics: [relic] }).strike;
    const note = s.notes.find((x) => x.startsWith(prefix));
    if (note) {
      hits++;
      const m = note.match(/([+−])(\d+)%/);
      if (m) values.push(((m[1] === '−' ? -1 : 1) * Number(m[2])) / 100);
    }
  }
  return { rate: hits / n, values };
}

/** Row 2 with two red tiles and a gap; `far` is where the third waits (a move must bring it in). */
function gapRow(relics, far) {
  const run = scene({ relics, enemyHp: 999 });
  put(run, 2, 0, 'blade');
  put(run, 2, 1, 'blade');
  put(run, far[0], far[1], 'blade');
  return run;
}

/** A real fight on the item's board to the end, invariants on after every move. */
function fightsThrough(relics) {
  const res = playFight(scene({ relics, real: true, enemies: ['rat', 'drop'], hp: 999, maxHp: 999 }), { seed: 3, check: true });
  assert.deepEqual(res.violations, [], 'движок держит правила на таком поле');
  assert.ok(res.won, 'бой выигран');
}

const ITEM_CHECKS = {
  extension() {
    const b = scene({ relics: ['extension'] }).combat.board;
    assert.deepEqual([b.w, b.h, b.cells.length, b.queue.length], [7, 6, 42, 7], 'поле 7×6, очередь над каждым столбцом');
    fightsThrough(['extension']);
  },
  foldtable() {
    const b = scene({ relics: ['foldtable'] }).combat.board;
    assert.deepEqual([b.w, b.h], [7, 7]);
    fightsThrough(['foldtable']);
  },
  closet() {
    const b = scene({ relics: ['closet'] }).combat.board;
    assert.deepEqual([b.w, b.h], [5, 6]);
    assert.equal(hit({ relics: ['closet'] }).strike.damage, 12, 'урон +100%');
    const both = scene({ relics: ['closet', 'extension'] }).combat.board;
    assert.deepEqual([both.w, both.h], [6, 6], 'размеры складываются');
    fightsThrough(['closet']);
  },
  tapemeasure() {
    // The red tile from column 4 is dragged to column 2: the two tiles between step right.
    const move = { from: idx(2, 4), to: idx(2, 2) };
    assert.equal(play(gapRow([], [2, 4]), move).invalid?.reason, 'Только с соседней фишкой');
    const res = play(gapRow(['tapemeasure'], [2, 4]), move);
    assert.equal(res.strike.tally.dmg, 6, 'три красные в ряд');
    assert.ok(res.events.find((e) => e.t === 'swap').slide);
    // Tiles between do not jump over a staple.
    const pinned = gapRow(['tapemeasure'], [2, 4]);
    put(pinned, 2, 3, 'tape', { pin: true });
    assert.equal(play(pinned, move).invalid?.reason, 'Фишка прибита скобой');
    fightsThrough(['tapemeasure']);
  },
  setsquare() {
    const move = { from: idx(1, 3), to: idx(2, 2) };
    assert.ok(play(gapRow([], [1, 3]), move).invalid, 'без угольника по диагонали нельзя');
    assert.equal(play(gapRow(['setsquare'], [1, 3]), move).strike.tally.dmg, 6);
    fightsThrough(['setsquare']);
  },
  clipholder() {
    const rockets = (relics) => scene({ relics, real: true, seed: 5 }).combat.board.cells.filter((t) => t.special === 'rocketH' || t.special === 'rocketV').length;
    assert.equal(rockets([]), 0);
    assert.equal(rockets(['clipholder']), 2);
  },
  destapler() {
    const stapled = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      const move = line(run, RED3);
      run.combat.board.cells[move.from].pin = true;
      return play(run, move);
    };
    assert.equal(stapled([]).invalid?.reason, 'Фишка прибита скобой');
    assert.equal(stapled(['destapler']).strike.tally.dmg, 6);
  },
  calendar() {
    const win = (wins, grown = 0) => {
      const run = scene({ relics: ['calendar'], enemies: ['rat'], enemyHp: 1, hp: 4, maxHp: 8 });
      run.hero.wins = wins;
      run.hero.grown = grown;
      return play(run, line(run, RED3)).run.hero;
    };
    assert.equal(win(0).maxHp, 8, 'первый бой — ещё нет');
    const third = win(2);
    assert.deepEqual([third.maxHp, third.hp, third.grown], [10, 6, 1], 'третий выигранный бой: +1 сердце');
    assert.equal(win(2, 3).maxHp, 8, 'не больше трёх сердец за смену');
  },
  abacus() {
    // Gold tiles put a damage bonus aside; the next strike that deals damage takes it all.
    let run = scene({ relics: ['abacus'], enemyHp: 999 });
    run = play(run, line(run, GOLD3, { row: 2 })).run;
    assert.equal(Math.round(run.combat.bank * 100), 30, '+10% за каждую золотую фишку');
    run = play(run, line(run, GOLD3, { row: 4 })).run;
    assert.equal(run.combat.bank, 0.5, 'не больше +50%');
    const res = play(run, line(run, RED3));
    assert.equal(res.strike.damage, 9, '6 урона +50%');
    assert.ok(res.strike.notes.includes('Счёты +50%'));
    assert.equal(res.run.combat.bank, 0);
    assert.equal(hit({}, GOLD3).run.combat.bank ?? 0, 0, 'без счётов золото ничего не откладывает');
  },
  binding() {
    const five = ['blade', 'blade', 'blade', 'blade', 'blade'];
    // The staple gun has no super strike damage: the group's own numbers are plain.
    assert.equal(hit({ relics: ['binding'], gear: ['staplegun'] }, five).strike.damage, 15, '10 урона +50%');
    assert.equal(hit({ relics: ['binding'], gear: ['staplegun'] }, [...RED3, 'blade']).strike.damage, 8, 'группа из 4 — без бонуса');
  },
  badge() {
    const run = scene({ gear: ['knife', 'scissors'], charge: 1 });
    assert.equal(swapCost(run), 2);
    assert.equal(act(run, { type: 'gear', id: 'scissors' }).invalid?.reason, 'Нужно 2 энергии');
    const pass = scene({ relics: ['badge'], gear: ['knife', 'scissors'], charge: 1 });
    assert.equal(swapCost(pass), 1, 'с пропуском — на 1 дешевле');
    const swapped = act(pass, { type: 'gear', id: 'scissors' }).run;
    assert.deepEqual([swapped.hero.equip.blade, swapped.hero.charge], ['scissors', 0]);
  },
  calculator() {
    assert.equal(hit({ relics: ['calculator'] }, GOLD3).strike.tally.dmg, 3, '+3 урона за золотую группу');
    assert.equal(hit({ relics: ['calculator'] }).strike.tally.dmg, 6, 'без золота — без бонуса');
  },
  mop() {
    const res = hit({ relics: ['mop'] });
    const junk = res.waves.flatMap((w) => w.cleared).filter((x) => x.kind === 'junk').length;
    assert.ok(junk >= 2);
    assert.equal(armorOfMove(res), Math.floor(junk / 2), 'половинка сердца за каждые 2 убранные кляксы');
  },
  coffee: () => assert.equal(hit({ relics: ['coffee'] }).strike.tally.dmg, 9),
  binderclip: () => assert.equal(hit({ relics: ['binderclip'] }, BLUE3).strike.armor, 2, 'синяя группа: ещё половинка сердца'),
  inkpot: () => assert.equal(hit({ relics: ['inkpot'] }, VIOLET3).strike.tally.charge, 6),
  wallet: () => assert.equal(hit({ relics: ['wallet'] }, GOLD3).strike.tally.coins, 2, 'монета группы и ещё одна'),
  vestrelic() {
    let run = scene({ relics: ['vestrelic'], enemies: ['neighbor'], enemyHp: 999 });
    ready(run, 'attack');
    let res = play(run, line(run, GOLD3));
    const full = blowOf('neighbor', 'attack');
    assert.equal(res.acts[0].hurt.red, full - Math.ceil(full / 2), 'первый удар боя — вдвое слабее');
    run = res.run;
    ready(run, 'attack');
    res = play(run, line(run, GOLD3, { row: 4 }));
    assert.equal(res.acts[0].hurt.red, full, 'второй — как обычно');
  },
  sandwich() {
    const { run } = newRun({ seed: 1 });
    run.hero.hp = 4;
    gainRelic(run, 'sandwich', 'test', []);
    assert.equal(run.hero.maxHp, 10, '+1 сердце к максимуму');
    assert.equal(run.hero.hp, 6);
  },
  bowl() {
    const run = scene({
      relics: ['bowl'],
      hp: 30,
      enemies: ['drop'],
      enemyHp: 1,
    });
    const res = play(run, line(run, RED3));
    assert.equal(res.run.phase, 'reward');
    assert.equal(res.run.hero.hp, 31);
  },
  gum() {
    const clean = scene({
      relics: ['gum'],
      hp: 30,
      enemies: ['drop'],
      enemyHp: 1,
    });
    assert.equal(play(clean, line(clean, RED3)).run.hero.hp, 32, 'бой без урона лечит сердце');
    const hurt = scene({
      relics: ['gum'],
      hp: 30,
      enemies: ['drop'],
      enemyHp: 1,
    });
    hurt.combat.damageTaken = 5;
    assert.equal(play(hurt, line(hurt, RED3)).run.hero.hp, 30, 'после урона — нет');
  },
  ledger() {
    const run = scene({ relics: ['ledger'], coins: 55 });
    assert.equal(run.hero.coins, 60);
    assert.ok(run.startEvents.some((e) => e.t === 'message'));
  },
  loupe() {
    assert.equal(computeMods(['loupe']).preview, 3);
    assert.equal(computeMods([]).preview, 1);
    assert.ok(QUEUE_LEN >= 3, 'в очереди есть что показать');
  },
  gloves() {
    const burn = (relics) => {
      const run = scene({ relics });
      tile(run, 4, 4, 'shield', { fuse: 1 });
      return play(run, line(run, RED3)).run.hero.hp;
    };
    assert.equal(burn([]), 60 - byBlows(1), 'уголёк ранит');
    assert.equal(burn(['gloves']), 60);
  },
  powerbank: () => assert.equal(hit({ relics: ['powerbank'], active: 'stapler' }, BLUE3).run.hero.charge, 1),
  spider() {
    const run = scene({ relics: ['spider'], enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, BLUE3));
    assert.equal(foe(res.run, 1).hp, 21, 'кусает самого слабого на 3');
    assert.equal(foe(res.run, 0).hp, 64);
  },
  cactus() {
    const run = scene({ relics: ['cactus'], enemies: ['rat'], enemyHp: 999 });
    ready(run, 'attack');
    const res = play(run, line(run, GOLD3));
    assert.equal(res.acts[0].intent.kind, 'attack');
    assert.equal(foe(res.run).hp, 999 - 5, 'кактус колет ударившего на 5');
  },
  // A big skill takes the whole charge: no ink turns into multiplier here.
  inkwell: () => assert.equal(hit({ relics: ['inkwell'], active: 'giftbox' }, VIOLET3).strike.damage, 6),
  register: () => assert.equal(hit({ relics: ['register'] }, GOLD3).strike.damage, 6),
  tape() {
    const res = hit({ relics: ['tape'] }, BLUE3);
    assert.equal(res.strike.armor, 1);
    assert.equal(res.strike.damage, 4, 'броня хода бьёт цель: 4 за половинку сердца');
  },
  rustyblade() {
    const res = hit({ relics: ['rustyblade'] });
    assert.equal(foe(res.run).hp, 999 - 6 - 2, 'удар и кровотечение 2 в конце хода');
    assert.equal(foe(res.run).bleed, 1);
  },
  match() {
    const res = hit({ relics: ['match'], gear: ['staplegun'] }, [...RED3, 'blade']);
    assert.equal(foe(res.run).burnTurns, 2, 'горит ещё два хода после первого');
    assert.equal(foe(res.run).hp, 999 - 8 - 4);
    assert.equal(foe(hit({ relics: ['match'] }).run).burnTurns, 0, 'группа из трёх не поджигает');
    // Any blast (a swapped rocket) sets the target on fire as well.
    const run = scene({ relics: ['match'], enemyHp: 999 });
    put(run, 2, 2, 'blade', { special: 'rocketH' });
    assert.equal(foe(play(run, { from: idx(2, 2), to: idx(2, 3) }).run).burnTurns, 2);
  },
  ice() {
    const start = foe(scene({})).countdown;
    assert.equal(foe(hit({ relics: ['ice'] }, [...BLUE3, 'shield']).run).countdown, start + 1 - 1, 'таймер +1 перед тиком');
    assert.equal(foe(hit({ relics: [] }, [...BLUE3, 'shield']).run).countdown, start - 1);
  },
  plane() {
    const run = scene({ relics: ['plane'], gear: ['staplegun'], enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, [...RED3, 'blade']));
    assert.equal(foe(res.run, 1).hp, 18, '6 урона каждому врагу');
  },
  lucky() {
    const { rate } = noteRate('lucky', 'Удача');
    assert.ok(rate > 0.13 && rate < 0.27, `удвоение в ${(rate * 100).toFixed(0)}% ходов, ждём 20%`);
  },
  dynamite() {
    const blast = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      put(run, 2, 2, 'blade', { special: 'bomb' });
      return play(run, { from: idx(2, 2), to: idx(2, 3) }).waves[0].blasts[0].cells.length;
    };
    assert.equal(blast([]), 9);
    assert.equal(blast(['dynamite']), 25);
  },
  garland() {
    const res = moves(scene({ relics: ['garland'], real: true, enemyHp: 9999 }), 5);
    const lit = res.map((r) => r.procs.some((p) => p.source === 'garland'));
    assert.deepEqual(lit, [false, false, false, false, true]);
  },
  timesheet() {
    const first = hit({ relics: ['timesheet'] });
    assert.equal(first.strike.damage, 12);
    const again = play(first.run, line(first.run, RED3));
    assert.equal(again.strike.damage, 6, 'только первый удар по врагу');
  },
  calc2() {
    const { rate, values } = noteRate('calc2', 'Калькулятор');
    assert.equal(rate, 1);
    assert.equal(values.length, 300);
    assert.ok(Math.min(...values) >= -0.5 && Math.max(...values) <= 1);
    const avg = values.reduce((s, x) => s + x, 0) / values.length;
    assert.ok(avg > 0.15 && avg < 0.35, `в среднем +${Math.round(avg * 100)}%, ждём +25%`);
  },
  lamp() {
    assert.equal(hit({ relics: ['lamp'], active: 'giftbox' }, VIOLET3).strike.tally.dmg, 3, '+3 урона за фиолетовую группу');
    const run = scene({ relics: ['lamp'], enemies: ['archivist'] });
    ready(run, 'censor');
    const res = play(run, line(run, RED3));
    assert.equal(res.acts[0].skipped, true);
    assert.ok(!res.run.combat.board.cells.some((t) => t.hidden));
  },
  ring() {
    const edge = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      put(run, 2, 4, 'blade');
      put(run, 2, 5, 'blade');
      put(run, 1, 0, 'blade');
      return play(run, { from: idx(1, 0), to: idx(2, 0) });
    };
    assert.ok(edge([]).invalid, 'без скобы края не соединены');
    assert.equal(edge(['ring']).strike.tally.dmg, 6);
  },
  pen() {
    const rocket = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      put(run, 2, 2, 'blade', { special: 'rocketH' });
      return play(run, { from: idx(2, 2), to: idx(2, 3) }).waves[0].blasts[0].cells.length;
    };
    assert.equal(rocket([]), 6);
    assert.equal(rocket(['pen']), 11, 'строка и столбец');
  },
  clock() {
    const res = moves(scene({ relics: ['clock'], real: true, enemyHp: 9999 }), 4);
    const stopped = res.map((r) => r.effects.some((f) => f.source === 'time'));
    assert.deepEqual(stopped, [false, false, false, true]);
    assert.equal(res[3].run.combat.ticks, 3);
  },
  puncher() {
    const dealt = (relics) => 999 - foe(hit({ relics, enemies: ['eraser'] }).run).hp;
    assert.equal(dealt([]), 4, 'резина: броня 2');
    assert.equal(dealt(['puncher']), 6);
  },
  poster() {
    const res = cascade({ relics: ['poster'] }, RED3, BLUE3);
    assert.equal(res.waves.length >= 2, true, 'есть каскад');
    assert.equal(res.strike.tally.bonus, 0.15, '+15% за вторую волну');
    assert.equal(cascade({}, RED3, BLUE3).strike.tally.bonus, 0, 'без плаката волны бонуса не дают');
  },
  coffeemachine() {
    const first = hit({ relics: ['coffeemachine'] });
    assert.equal(first.strike.damage, 12);
    assert.equal(play(first.run, line(first.run, RED3)).strike.damage, 6);
  },
  carbonpack: () => assert.equal(hit({ relics: ['carbonpack'] }).strike.tally.dmg, 12),
  flash() {
    const run = scene({ relics: ['flash'], hp: 1, enemies: ['rat'] });
    ready(run, 'attack');
    const saved = play(run, line(run, GOLD3)).run;
    assert.equal(saved.phase, 'combat');
    assert.equal(saved.hero.hp, 1);
    ready(saved, 'attack');
    assert.equal(play(saved, line(saved, GOLD3, { row: 4 })).run.phase, 'dead', 'второй раз за отдел — нет');
  },
  award: () => assert.equal(hit({ relics: ['award'] }).strike.damage, 8, '6 урона +25% (7,5 → 8)'),
  nightshift: () => assert.equal(foe(scene({ relics: ['nightshift'] })).countdown, foe(scene({})).countdown + 1),
  espresso: () => assert.equal(hit({ relics: ['espresso'] }).strike.tally.dmg, 12),
  pocketbag() {
    const { run } = newRun({ seed: 1 });
    gainRelic(run, 'pocketbag', 'test', []);
    assert.equal(run.hero.pockets.length, 5);
    assert.equal(run.hero.maxHp, 12, '+2 сердца');
  },
  stamprelic() {
    const run = scene({ relics: ['stamprelic'], real: true });
    assert.equal(run.combat.board.cells.filter((t) => t.seal).length, 3);
  },
  vault() {
    assert.equal(hit({ relics: ['vault'], coins: 250 }).strike.damage, 9, '250 монет — +50%');
    assert.equal(hit({ relics: ['vault'], coins: 49 }).strike.damage, 6);
  },
  hotkey() {
    // After a skill, the next move strikes +50%.
    const after = act(scene({ active: 'stapler', relics: ['hotkey'], charge: 4, enemies: ['rat'], enemyHp: 999 }), { type: 'active', uid: 1 }).run;
    assert.equal(after.hero.charge, 0, 'степлер за 4 вместо 6');
    assert.equal(play(after, line(after, RED3)).strike.damage, 15, '6 урона: +50% после навыка и +100% ножом по бумажной крысе');
    assert.equal(activeCost(scene({ active: 'eraser' })), 8);
    assert.equal(activeCost(scene({ active: 'eraser', relics: ['hotkey'] })), 6);
    assert.equal(activeCost(scene({ active: 'stapler', relics: ['hotkey'] })), 4);
  },
  steeldoor() {
    const left = (relics) => {
      const run = scene({ relics, enemies: ['rat'], enemyHp: 999 });
      run.hero.armor = 20;
      ready(run, 'attack');
      return play(run, line(run, GOLD3)).run.hero.armor;
    };
    assert.equal(left([]), 0, 'обычно остаток брони сгорает');
    assert.equal(left(['steeldoor']), Math.round((20 - blowOf('rat', 'attack')) / 2), 'удар гасится бронёй, половина остатка остаётся');
  },
  prismpact() {
    const made = (relics) => hit({ relics }, [...RED3, 'blade']).waves[0].created[0].tile;
    assert.equal(made([]).special, 'rocketH');
    assert.equal(made(['prismpact']).kind, 'prism');
    // Only the first line of four of a move: a second one in the cascade is a rocket again.
    const cascade4 = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      const move = line(run, ['blade', 'blade', 'blade', 'blade'], { row: 5 });
      // The first line clears row 5 and splashes row 4: two tiles fall in columns 0–2 and the queued
      // folders land in row 1. Column 3 keeps the new special, so one tile falls there: a folder
      // put on top of it slides into row 1 as well — a second line of four.
      for (let c = 0; c < 3; c++) queue(run, c, ['shield', 'tape', 'tape']);
      put(run, 0, 3, 'shield');
      return play(run, move).waves.flatMap((w) => w.created.map((x) => x.tile));
    };
    const made2 = cascade4(['prismpact']);
    assert.equal(made2.length, 2, 'две группы из 4 за ход');
    assert.equal(made2[0].kind, 'prism');
    assert.equal(made2[1].special, 'rocketH', 'вторая — ракета');
  },

  // ── Red items ──────────────────────────────────────────────────
  redpen() {
    const run = scene({ relics: ['redpen'], enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, RED3));
    assert.equal(res.strike.aoe, 6, 'первая красная группа хода — супер: нож бьёт всех по 2 за фишку');
    assert.equal(hit({}, RED3).strike.aoe, 0, 'без ручки тройка бьёт обычным ударом');
  },
  alarm() {
    assert.equal(hit({ relics: ['alarm'] }).strike.tally.dmg, 6 + 3, 'одна красная группа — +3');
    assert.equal(cascade({ relics: ['alarm'] }, RED3, RED3).strike.tally.dmg, 6 + 3 + 6 + 3, 'каждая красная группа хода — +3');
  },

  // ── Skills ─────────────────────────────────────────────────────────
  eraser() {
    const run = scene({ active: 'eraser', charge: 8, enemyHp: 999 });
    for (const [r, c] of [
      [0, 0],
      [2, 3],
      [4, 1],
    ])
      put(run, r, c, 'blade');
    const before = foe(run).countdown;
    const res = act(run, { type: 'active', cell: idx(2, 3) });
    assert.equal(res.waves[0].blasts[0].kind, 'prism');
    assert.equal(res.waves[0].cleared.filter((x) => x.kind === 'blade').length, 3, 'все красные стёрты');
    assert.equal(res.strike.tally.dmg, 6, 'и сработали: по 2 за фишку');
    assert.equal(res.run.hero.charge, 0);
    assert.equal(foe(res.run).countdown, before, 'время не тратит');
    assert.ok(res.waves.slice(1).every((w) => w.idle), 'сложившееся следом сгорает впустую');
    const junk = act(scene({ active: 'eraser', charge: 8 }), { type: 'active', cell: idx(0, 0) });
    assert.equal(junk.invalid?.reason, 'Выбери цветную фишку');
    assert.equal(junk.run.hero.charge, 8, 'энергия не потрачена');
  },
  doubleentry() {
    const run = scene({ active: 'doubleentry', charge: 14, enemyHp: 999 });
    const ready = act(run, { type: 'active' });
    assert.ok(ready.events.some((e) => e.t === 'armed' && e.what === 'double' && e.on));
    assert.equal(ready.run.hero.charge, 7);
    assert.equal(act(ready.run, { type: 'active' }).invalid?.reason, 'Уже готово');
    const res = play(ready.run, line(ready.run, RED3));
    assert.equal(res.strike.tally.dmg, 12, 'группа первой волны — дважды');
    assert.equal(res.run.combat.armed, undefined, 'и только этот ход');
    assert.equal(play(res.run, line(res.run, RED3, { row: 4 })).strike.tally.dmg, 6);
  },
  stapler() {
    const run = scene({ active: 'stapler', charge: 6, enemies: ['rat'] });
    const stunned = act(run, { type: 'active', uid: foe(run).uid }).run;
    ready(stunned, 'attack');
    const after = play(stunned, line(stunned, GOLD3));
    assert.equal(after.acts[0].skipped, true);
    // No stun lock: the enemy just out of a stun (or still stunned) cannot be stapled; no energy spent.
    const again = after.run;
    again.hero.charge = 6;
    const res = act(again, { type: 'active', uid: foe(again).uid });
    assert.equal(res.invalid?.reason, 'Недавно оглушён');
    assert.equal(res.run.hero.charge, 6);
    const twice = act(scene({ active: 'stapler', charge: 12, enemies: ['rat'] }), { type: 'active', uid: 1 }).run;
    assert.equal(act(twice, { type: 'active', uid: 1 }).invalid?.reason, 'Недавно оглушён', 'уже оглушённого не степлерят');
  },
  coffeeToGo() {
    // Two uses do not stack: the quiet lasts two ticks.
    const twice = act(act(scene({ active: 'coffeeToGo', charge: 12, enemyHp: 9999 }), { type: 'active' }).run, { type: 'active' }).run;
    assert.equal(twice.combat.freeTicks, 2);
    const run = act(scene({ active: 'coffeeToGo', charge: 6, real: true, enemyHp: 9999 }), { type: 'active' }).run;
    const start = foe(run).countdown;
    const res = moves(run, 3);
    assert.deepEqual(
      res.map((r) => foe(r.run).countdown),
      [start, start, start - 1],
    );
  },
  corrector() {
    const run = scene({ active: 'corrector', charge: 6, real: true, enemies: ['anchor', 'drop'], enemyHp: 99 });
    const cells = run.combat.board.cells;
    cells[0] = { id: 90001, kind: 'junk' };
    cells[1] = { id: 90002, kind: 'junk', tape: true };
    cells[7] = { ...cells[7], pin: true };
    cells[8] = { ...cells[8], fuse: 2 };
    cells[9] = { ...cells[9], hidden: 3 };
    run.combat.board.colLock[5] = 2;
    run.combat.board.flood = 2;
    const res = act(run, { type: 'active' });
    const after = res.run.combat.board;
    assert.ok(!after.cells.some((t) => t.kind === 'junk' || t.pin || t.fuse || t.hidden));
    assert.deepEqual([after.colLock[5], after.flood], [0, 0], 'якоря и вода ушли');
    assert.deepEqual(res.run.combat.enemies.map((e) => e.hp), [99 - 6, 99 - 6], 'по 3 урона каждому за каждую кляксу');
    assert.equal(res.strike, undefined, 'новые фишки, сложившиеся в ряд, сгорают впустую');
  },
  shredder() {
    const run = scene({ active: 'shredder', charge: 8, enemyHp: 999 });
    for (let r = 0; r < 6; r++) put(run, r, 0, r % 2 ? 'shield' : 'blade');
    const res = act(run, { type: 'active', col: 0 });
    assert.equal(res.waves[0].blasts[0].cells.length, 6);
    assert.equal(res.strike.damage, 6, 'три удара срабатывают');
    assert.equal(res.strike.armor, 1, 'три синие во взрыве — половинка сердца');
  },
  megaphone() {
    const run = scene({ active: 'megaphone', charge: 8 });
    assert.equal(foe(act(run, { type: 'active' }).run).countdown, foe(run).countdown + 2);
  },
  giftbox() {
    const run = scene({ active: 'giftbox', charge: 10, real: true });
    const count = (r, f) => r.combat.board.cells.filter(f).length;
    const after = act(run, { type: 'active' }).run;
    assert.equal(count(after, (t) => t.special === 'bomb') - count(run, (t) => t.special === 'bomb'), 2);
    assert.equal(count(after, (t) => t.kind === 'prism') - count(run, (t) => t.kind === 'prism'), 1);
  },
};

const POCKET_CHECKS = {
  bomb() {
    const run = scene({ pockets: ['bomb'] });
    const res = act(run, { type: 'pocket', slot: 0, cell: idx(2, 2) });
    assert.equal(res.waves[0].blasts[0].cells.length, 9);
    assert.equal(foe(res.run).countdown, foe(run).countdown);
  },
  coffee: () => assert.equal(act(scene({ pockets: ['coffee'], hp: 30 }), { type: 'pocket', slot: 0 }).run.hero.hp, 32),
  eraser() {
    const run = scene({ pockets: ['eraser'] });
    const res = act(run, { type: 'pocket', slot: 0, cell: idx(3, 3) });
    assert.equal(res.waves[0].cleared[0].i, idx(3, 3));
    assert.equal(foe(res.run).countdown, foe(run).countdown);
    const drop = erasedLine({ pockets: ['eraser'] }, (run, cell) => ({ type: 'pocket', slot: 0, cell }));
    assert.ok(drop.waves.some((w) => w.idle && w.groups.length));
    assert.equal(drop.strike, undefined, 'сложившийся ряд сгорает впустую');
    // The mop pays for junk a board tool washed away.
    const mop = erasedLine({ pockets: ['eraser'], relics: ['mop'] }, (run, cell) => ({ type: 'pocket', slot: 0, cell }));
    const washed = mop.waves.flatMap((w) => w.cleared).filter((x) => x.kind === 'junk').length;
    assert.ok(washed >= 2);
    assert.equal(mop.run.hero.armor, Math.min(ARMOR_CAP, Math.floor(washed / 2)), 'швабра платит и за ластик');
  },
  sticker() {
    const run = scene({ pockets: ['sticker'] });
    assert.equal(foe(act(run, { type: 'pocket', slot: 0 }).run).countdown, foe(run).countdown + 2);
  },
  choco() {
    const run = act(scene({ pockets: ['choco'], enemyHp: 999 }), {
      type: 'pocket',
      slot: 0,
    }).run;
    assert.equal(play(run, line(run, RED3)).strike.damage, 12, 'урон +100%');
  },
};

test('every item and pocket has a check', () => {
  for (const [id, def] of Object.entries(ITEMS)) if (def.kind !== 'gear') assert.ok(ITEM_CHECKS[id], `нет проверки для предмета «${def.name}» (${id})`);
  for (const id of Object.keys(POCKETS)) assert.ok(POCKET_CHECKS[id], `нет проверки для кармана «${POCKETS[id].name}» (${id})`);
});

for (const [id, check] of Object.entries(ITEM_CHECKS)) test(`${ITEMS[id]?.name ?? id}: ${ITEMS[id]?.desc ?? ''}`, check);
for (const [id, check] of Object.entries(POCKET_CHECKS)) test(`карман «${POCKETS[id].name}»: ${POCKETS[id].desc}`, check);

test('effects outside the strike grow with the act: damage with enemy health, armour with enemy blows', () => {
  const act = 2;
  const HP = ACTS[act].hpMul;
  const DMG = ACTS[act].dmgMul;
  const hurt = (relics, tiles, k = 1) => {
    const run = scene({ act, relics, gear: ['staplegun'], enemies: ['anchor', 'drop'] });
    const before = foe(run, k).hp;
    return before - foe(play(run, line(run, tiles)).run, k).hp;
  };
  assert.equal(hurt(['spider'], BLUE3), Math.round(3 * HP), 'паук');
  assert.equal(hurt(['plane'], [...RED3, 'blade']), Math.round(6 * HP), 'самолётик');
  // Burn and bleed tick on the target at the end of the move (the strike itself lands on armour 0).
  const run = scene({ act, relics: ['match', 'rustyblade'], enemies: ['anchor'], enemyHp: 99999 });
  const res = play(run, line(run, [...RED3, 'blade']));
  const ticks = res.effects.filter((f) => f.source === 'burn' || f.source === 'bleed').map((f) => [f.source, f.amount]);
  assert.deepEqual(ticks.sort(), [
    ['bleed', 2 * HP],
    ['burn', Math.round(4 * HP)],
  ]);
  // A tough hero: a rat of the boiler room hits hard, and thorns only answer a blow that was survived.
  const cactus = scene({ act, relics: ['cactus'], enemies: ['rat'], enemyHp: 99999, hp: 9999, maxHp: 9999 });
  ready(cactus, 'attack');
  assert.equal(99999 - foe(play(cactus, line(cactus, GOLD3)).run).hp, Math.round(5 * HP), 'кактус');
  const mop = hit({ act, relics: ['mop'] });
  const junk = mop.waves.flatMap((w) => w.cleared).filter((x) => x.kind === 'junk').length;
  assert.equal(armorOfMove(mop), Math.min(ARMOR_CAP, Math.round(Math.floor(junk / 2) * DMG)), 'швабра (не больше потолка брони)');
});

test('energy beyond a full meter burns: 1 damage per extra point', () => {
  const dmg = (opts, tiles = VIOLET3) => hit(opts, tiles).strike.tally.dmg;
  assert.equal(dmg({}), 0, 'шкала не полна — энергия копится');
  assert.equal(hit({}, VIOLET3).run.hero.charge, 3);
  assert.equal(dmg({ charge: 7 }), 0, 'ровно до края — без остатка');
  assert.equal(dmg({ charge: 10 }), 3, 'шкала полна: 3 лишних → 3 урона');
  const s = hit({ charge: 9 }, VIOLET3);
  assert.equal(s.strike.tally.dmg, 2, 'одно деление в шкалу, два — в урон');
  assert.ok(s.strike.notes.includes('Лишняя энергия +2 урона'));
});

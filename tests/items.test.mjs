// Every item, skill, pocket and finish does what its tooltip says. A new item needs its check here:
// the registry test fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gainRelic, newRun } from '../game/run.ts';
import { validMoves } from '../game/board.ts';
import { ITEMS, POCKETS, computeMods } from '../game/content/items.ts';
import { activeCost } from '../game/combat.ts';
import { FINISH_TEXT } from '../game/content/cards.ts';
import { QUEUE_LEN } from '../game/types.ts';
import { ACTS } from '../game/content/acts.ts';
import { playFight } from '../game/balance/lab.ts';
import { CLIPS, FISTS, FOLDERS, INKS, act, blowOf, byBlows, cascade, foe, hit, idx, line, moves, play, put, queue, ready, scene, tile } from './scene.mjs';

/**
 * Removes the tile under a lifted fist: the fist drops into a ready pair and completes a line.
 * `action` makes the action for the erased cell.
 */
function erasedLine(opts, action) {
  const run = scene({ enemyHp: 999, ...opts });
  put(run, 4, 0, 'fist');
  put(run, 4, 1, 'fist');
  put(run, 3, 2, 'fist');
  return act(run, action(run, idx(4, 2)));
}

/** The armour a move left the hero with: it burns out at the end of the tick (the expiry says how much). */
function armorOfMove(res) {
  return -(res.effects.find((f) => f.kind === 'armor' && f.source === 'expire')?.amount ?? 0) || res.run.hero.armor;
}

/** How often a note shows up on the strike over many seeds. */
function noteRate(relic, prefix, n = 300) {
  const values = [];
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = hit({ seed, relics: [relic] }).strike;
    const note = s.notes.find((x) => x.startsWith(prefix));
    if (note) {
      hits++;
      values.push(Number(note.slice(prefix.length).replace(',', '.')));
    }
  }
  return { rate: hits / n, values };
}

/** Row 2 with two fists and a gap; `far` is where the third fist waits (a move must bring it in). */
function gapRow(relics, far) {
  const run = scene({ relics, enemyHp: 999 });
  put(run, 2, 0, 'fist');
  put(run, 2, 1, 'fist');
  put(run, far[0], far[1], 'fist');
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
    assert.deepEqual([b.w, b.h], [5, 5]);
    assert.equal(hit({ relics: ['closet'] }).strike.tally.mult, 4, 'каждый удар +3 множ');
    const both = scene({ relics: ['closet', 'extension'] }).combat.board;
    assert.deepEqual([both.w, both.h], [6, 5], 'размеры складываются');
    fightsThrough(['closet']);
  },
  tapemeasure() {
    // The fist from column 4 is dragged to column 2: the two tiles between step right.
    const move = { from: idx(2, 4), to: idx(2, 2) };
    assert.equal(play(gapRow([], [2, 4]), move).invalid?.reason, 'Только с соседней фишкой');
    const res = play(gapRow(['tapemeasure'], [2, 4]), move);
    assert.equal(res.strike.tally.dmg, 6, 'три кулака в ряд');
    assert.ok(res.events.find((e) => e.t === 'swap').slide);
    // Tiles between do not jump over a staple.
    const pinned = gapRow(['tapemeasure'], [2, 4]);
    put(pinned, 2, 3, 'redtape', { pin: true });
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
      const move = line(run, FISTS);
      run.combat.board.cells[move.from].pin = true;
      return play(run, move);
    };
    assert.equal(stapled([]).invalid?.reason, 'Фишка прибита скобой');
    assert.equal(stapled(['destapler']).strike.tally.dmg, 6);
  },
  calendar() {
    const win = (grown) => {
      const run = scene({ relics: ['calendar'], enemies: ['rat'], enemyHp: 1, hp: 30, maxHp: 60 });
      run.hero.grown = grown;
      return play(run, line(run, FISTS)).run.hero;
    };
    const hero = win(0);
    assert.deepEqual([hero.maxHp, hero.grown], [61, 1], 'выигранный бой: +1 к максимуму');
    assert.equal(win(8).maxHp, 60, 'не больше +8 за смену');
  },
  abacus() {
    assert.equal(hit({ relics: ['abacus'] }, CLIPS).strike.tally.mult, 2);
    assert.equal(hit({ relics: ['abacus'] }).strike.tally.mult, 1, 'без золота — без бонуса');
  },
  binding() {
    const five = ['fist', 'fist', 'fist', 'fist', 'fist'];
    assert.equal(hit({ relics: ['binding'] }, five).strike.tally.mult, 3);
    assert.equal(hit({ relics: ['binding'] }, [...FISTS, 'fist']).strike.tally.mult, 1, 'группа из 4 — без бонуса');
  },
  knife() {
    assert.equal(hit({ relics: ['knife'], enemies: ['rat'] }).strike.damage, 12, 'бумажная крыса: удар ×2');
    assert.equal(hit({ relics: ['knife'], enemies: ['anchor'] }).strike.damage, 6, 'металл — без бонуса');
  },
  calculator() {
    assert.equal(hit({ relics: ['calculator'] }, CLIPS).strike.tally.mult, 2);
    assert.equal(hit({ relics: ['calculator'] }).strike.tally.mult, 1, 'без золота — без бонуса');
  },
  mop() {
    const res = hit({ relics: ['mop'] });
    const junk = res.waves.flatMap((w) => w.cleared).filter((x) => x.kind === 'junk').length;
    assert.ok(junk > 0);
    assert.equal(armorOfMove(res), byBlows(junk), '1 броня за каждую убранную кляксу');
  },
  coffee: () => assert.equal(hit({ relics: ['coffee'] }).strike.tally.dmg, 9),
  binderclip: () => assert.equal(hit({ relics: ['binderclip'] }, FOLDERS).strike.armor, 6),
  inkpot: () => assert.equal(hit({ relics: ['inkpot'] }, INKS).strike.tally.charge, 6),
  wallet: () => assert.equal(hit({ relics: ['wallet'] }, CLIPS).strike.tally.coins, 6),
  vestrelic: () => assert.equal(scene({ relics: ['vestrelic'] }).hero.armor, byBlows(6)),
  sandwich() {
    const { run } = newRun({ seed: 1 });
    run.hero.hp = 30;
    gainRelic(run, 'sandwich', 'test', []);
    assert.equal(run.hero.maxHp, 68);
    assert.equal(run.hero.hp, 38);
  },
  bowl() {
    const run = scene({
      relics: ['bowl'],
      hp: 30,
      enemies: ['drop'],
      enemyHp: 1,
    });
    const res = play(run, line(run, FISTS));
    assert.equal(res.run.phase, 'reward');
    assert.equal(res.run.hero.hp, 35);
  },
  gum() {
    const clean = scene({
      relics: ['gum'],
      hp: 30,
      enemies: ['drop'],
      enemyHp: 1,
    });
    assert.equal(play(clean, line(clean, FISTS)).run.hero.hp, 38, 'бой без урона лечит 8');
    const hurt = scene({
      relics: ['gum'],
      hp: 30,
      enemies: ['drop'],
      enemyHp: 1,
    });
    hurt.combat.damageTaken = 5;
    assert.equal(play(hurt, line(hurt, FISTS)).run.hero.hp, 30, 'после урона — нет');
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
      return play(run, line(run, FISTS)).run.hero.hp;
    };
    assert.equal(burn([]), 60 - byBlows(4), 'уголёк ранит');
    assert.equal(burn(['gloves']), 60);
  },
  battery: () => assert.equal(hit({ relics: ['battery'], active: 'stapler' }, FOLDERS).run.hero.charge, 1),
  spider() {
    const run = scene({ relics: ['spider'], enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, FOLDERS));
    assert.equal(foe(res.run, 1).hp, 21, 'кусает самого слабого на 3');
    assert.equal(foe(res.run, 0).hp, 64);
  },
  cactus() {
    const run = scene({ relics: ['cactus'], enemies: ['rat'], enemyHp: 999 });
    ready(run, 'attack');
    const res = play(run, line(run, CLIPS));
    assert.equal(res.acts[0].intent.kind, 'attack');
    assert.equal(foe(res.run).hp, 999 - 5, 'кактус колет ударившего на 5');
  },
  // A big skill takes the whole charge: no ink turns into multiplier here.
  inkwell: () => assert.equal(hit({ relics: ['inkwell'], active: 'giftbox' }, INKS).strike.damage, 6),
  register: () => assert.equal(hit({ relics: ['register'] }, CLIPS).strike.damage, 6),
  tape() {
    const res = hit({ relics: ['tape'] }, FOLDERS);
    assert.equal(res.strike.armor, 3);
    assert.equal(res.strike.damage, 3, 'броня хода бьёт цель');
  },
  rustyblade() {
    const res = hit({ relics: ['rustyblade'] });
    assert.equal(foe(res.run).hp, 999 - 6 - 2, 'удар и кровотечение 2 в конце хода');
    assert.equal(foe(res.run).bleed, 1);
  },
  match() {
    const res = hit({ relics: ['match'] }, [...FISTS, 'fist']);
    assert.equal(foe(res.run).burnTurns, 2, 'горит ещё два хода после первого');
    assert.equal(foe(res.run).hp, 999 - 8 - 4);
    assert.equal(foe(hit({ relics: ['match'] }).run).burnTurns, 0, 'группа из трёх не поджигает');
    // Any blast (a swapped rocket) sets the target on fire as well.
    const run = scene({ relics: ['match'], enemyHp: 999 });
    put(run, 2, 2, 'fist', { special: 'rocketH' });
    assert.equal(foe(play(run, { from: idx(2, 2), to: idx(2, 3) }).run).burnTurns, 2);
  },
  ice() {
    assert.equal(foe(hit({ relics: ['ice'] }, [...FOLDERS, 'folder']).run).countdown, 3, 'таймер +1 перед тиком');
    assert.equal(foe(hit({ relics: [] }, [...FOLDERS, 'folder']).run).countdown, 2);
  },
  plane() {
    const run = scene({ relics: ['plane'], enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, [...FISTS, 'fist']));
    assert.equal(foe(res.run, 1).hp, 18, '6 урона каждому врагу');
  },
  lucky() {
    const { rate } = noteRate('lucky', 'Удача ×');
    assert.ok(rate > 0.13 && rate < 0.27, `удвоение в ${(rate * 100).toFixed(0)}% ходов, ждём 20%`);
  },
  dynamite() {
    const blast = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      put(run, 2, 2, 'fist', { special: 'bomb' });
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
    const again = play(first.run, line(first.run, FISTS));
    assert.equal(again.strike.damage, 6, 'только первый удар по врагу');
  },
  calc2() {
    const { rate, values } = noteRate('calc2', 'Калькулятор ×');
    assert.equal(rate, 1);
    assert.ok(Math.min(...values) >= 0.5 && Math.max(...values) <= 2.5);
    const avg = values.reduce((s, x) => s + x, 0) / values.length;
    assert.ok(avg > 1.35 && avg < 1.65, `в среднем ×${avg.toFixed(2)}, ждём 1,5`);
  },
  lamp() {
    assert.equal(hit({ relics: ['lamp'], active: 'giftbox' }, INKS).strike.tally.mult, 2);
    const run = scene({ relics: ['lamp'], enemies: ['archivist'] });
    ready(run, 'censor');
    const res = play(run, line(run, FISTS));
    assert.equal(res.acts[0].skipped, true);
    assert.ok(!res.run.combat.board.cells.some((t) => t.hidden));
  },
  ring() {
    const edge = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      put(run, 2, 4, 'fist');
      put(run, 2, 5, 'fist');
      put(run, 1, 0, 'fist');
      return play(run, { from: idx(1, 0), to: idx(2, 0) });
    };
    assert.ok(edge([]).invalid, 'без скобы края не соединены');
    assert.equal(edge(['ring']).strike.tally.dmg, 6);
  },
  pen() {
    const rocket = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      put(run, 2, 2, 'fist', { special: 'rocketH' });
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
    const res = cascade({ relics: ['poster'] }, FISTS, FOLDERS);
    assert.equal(res.waves.length >= 2, true, 'есть каскад');
    assert.equal(res.strike.tally.mult, 2);
    assert.equal(cascade({}, FISTS, FOLDERS).strike.tally.mult, 1, 'без плаката волны множ не дают');
  },
  coffeemachine() {
    const first = hit({ relics: ['coffeemachine'] });
    assert.equal(first.strike.damage, 12);
    assert.equal(play(first.run, line(first.run, FISTS)).strike.damage, 6);
  },
  carbonpack: () => assert.equal(hit({ relics: ['carbonpack'] }).strike.tally.dmg, 12),
  flash() {
    const run = scene({ relics: ['flash'], hp: 5, enemies: ['rat'] });
    ready(run, 'attack');
    const saved = play(run, line(run, CLIPS)).run;
    assert.equal(saved.phase, 'combat');
    assert.equal(saved.hero.hp, 1);
    ready(saved, 'attack');
    assert.equal(play(saved, line(saved, CLIPS, { row: 4 })).run.phase, 'dead', 'второй раз за отдел — нет');
  },
  award: () => assert.equal(hit({ relics: ['award'] }).strike.damage, 12),
  nightshift: () => assert.equal(foe(scene({ relics: ['nightshift'] })).countdown, 4),
  espresso: () => assert.equal(hit({ relics: ['espresso'] }).strike.tally.dmg, 12),
  pocketbag() {
    const { run } = newRun({ seed: 1 });
    gainRelic(run, 'pocketbag', 'test', []);
    assert.equal(run.hero.pockets.length, 5);
    assert.equal(run.hero.maxHp, 75);
  },
  stamprelic() {
    const run = scene({ relics: ['stamprelic'], real: true });
    assert.equal(run.combat.board.cells.filter((t) => t.finish === 'seal').length, 3);
  },
  vault() {
    assert.equal(hit({ relics: ['vault'], coins: 250 }).strike.tally.mult, 3, '250 монет — +2 множ');
    assert.equal(hit({ relics: ['vault'], coins: 99 }).strike.tally.mult, 1);
  },
  hotkey() {
    assert.equal(activeCost(scene({ active: 'eraser' })), 3);
    assert.equal(activeCost(scene({ active: 'eraser', relics: ['hotkey'] })), 2);
    assert.equal(activeCost(scene({ active: 'stapler', relics: ['hotkey'] })), 4);
    const { run } = newRun({ seed: 1 });
    run.hero.charge = 3;
    gainRelic(run, 'hotkey', 'test', []);
    assert.equal(run.hero.charge, 2, 'заряд не больше новой цены');
  },
  steeldoor() {
    const left = (relics) => {
      const run = scene({ relics, enemies: ['rat'], enemyHp: 999 });
      run.hero.armor = 20;
      ready(run, 'attack');
      return play(run, line(run, CLIPS)).run.hero.armor;
    };
    assert.equal(left([]), 0, 'обычно остаток брони сгорает');
    assert.equal(left(['steeldoor']), Math.floor((20 - blowOf('rat', 'attack')) / 2), 'удар гасится бронёй, половина остатка остаётся');
  },
  prismpact() {
    const made = (relics) => hit({ relics }, [...FISTS, 'fist']).waves[0].created[0].tile;
    assert.equal(made([]).special, 'rocketH');
    assert.equal(made(['prismpact']).kind, 'prism');
    // Only the first line of four of a move: a second one in the cascade is a rocket again.
    const cascade4 = (relics) => {
      const run = scene({ relics, enemyHp: 999 });
      const move = line(run, ['fist', 'fist', 'fist', 'fist'], { row: 5 });
      // The first line clears row 5 and splashes row 4: two tiles fall in columns 0–2 and the queued
      // folders land in row 1. Column 3 keeps the new special, so one tile falls there: a folder
      // put on top of it slides into row 1 as well — a second line of four.
      for (let c = 0; c < 3; c++) queue(run, c, ['folder', 'redtape', 'redtape']);
      put(run, 0, 3, 'folder');
      return play(run, move).waves.flatMap((w) => w.created.map((x) => x.tile));
    };
    const made2 = cascade4(['prismpact']);
    assert.equal(made2.length, 2, 'две группы из 4 за ход');
    assert.equal(made2[0].kind, 'prism');
    assert.equal(made2[1].special, 'rocketH', 'вторая — ракета');
  },

  // ── Skills ─────────────────────────────────────────────────────────
  eraser() {
    const run = scene({ active: 'eraser', charge: 3 });
    const before = foe(run).countdown;
    const res = act(run, { type: 'active', cell: idx(0, 0) });
    assert.equal(res.waves[0].cleared[0].i, idx(0, 0));
    assert.equal(res.run.hero.charge, 0);
    assert.equal(foe(res.run).countdown, before, 'время не тратит');
    const drop = erasedLine({ active: 'eraser', charge: 3 }, (run, cell) => ({ type: 'active', cell }));
    assert.ok(drop.waves.some((w) => w.idle && w.groups.length), 'ряд сложился');
    assert.equal(drop.strike, undefined, 'и сгорел впустую: ластик — не ход');
    assert.equal(foe(drop.run).hp, 999);
  },
  stapler() {
    const run = scene({ active: 'stapler', charge: 6, enemies: ['rat'] });
    const stunned = act(run, { type: 'active', uid: foe(run).uid }).run;
    ready(stunned, 'attack');
    assert.equal(play(stunned, line(stunned, CLIPS)).acts[0].skipped, true);
  },
  coffeeToGo() {
    const run = act(scene({ active: 'coffeeToGo', charge: 6, real: true, enemyHp: 9999 }), { type: 'active' }).run;
    const start = foe(run).countdown;
    const res = moves(run, 3);
    assert.deepEqual(
      res.map((r) => foe(r.run).countdown),
      [start, start, start - 1],
    );
  },
  corrector() {
    const run = scene({ active: 'corrector', charge: 5, real: true });
    const cells = run.combat.board.cells;
    cells[0] = { id: 90001, kind: 'junk' };
    cells[7] = { ...cells[7], pin: true };
    cells[8] = { ...cells[8], fuse: 2 };
    cells[9] = { ...cells[9], hidden: 3 };
    run.combat.board.colLock[5] = 2;
    const res = act(run, { type: 'active' });
    const after = res.run.combat.board;
    assert.ok(!after.cells.some((t) => t.kind === 'junk' || t.pin || t.fuse || t.hidden));
    assert.equal(after.colLock[5], 0);
    assert.equal(res.strike, undefined, 'новые фишки, сложившиеся в ряд, сгорают впустую');
  },
  shredder() {
    const run = scene({ active: 'shredder', charge: 8, enemyHp: 999 });
    for (let r = 0; r < 6; r++) put(run, r, 0, r % 2 ? 'folder' : 'fist');
    const res = act(run, { type: 'active', col: 0 });
    assert.equal(res.waves[0].blasts[0].cells.length, 6);
    assert.equal(res.strike.damage, 6, 'три кулака срабатывают');
    assert.equal(res.strike.armor, 3);
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
  coffee: () => assert.equal(act(scene({ pockets: ['coffee'], hp: 30 }), { type: 'pocket', slot: 0 }).run.hero.hp, 42),
  eraser() {
    const run = scene({ pockets: ['eraser'] });
    const res = act(run, { type: 'pocket', slot: 0, cell: idx(3, 3) });
    assert.equal(res.waves[0].cleared[0].i, idx(3, 3));
    assert.equal(foe(res.run).countdown, foe(run).countdown);
    const drop = erasedLine({ pockets: ['eraser'] }, (run, cell) => ({ type: 'pocket', slot: 0, cell }));
    assert.ok(drop.waves.some((w) => w.idle && w.groups.length));
    assert.equal(drop.strike, undefined, 'сложившийся ряд сгорает впустую');
  },
  sticker() {
    const run = scene({ pockets: ['sticker'] });
    assert.equal(foe(act(run, { type: 'pocket', slot: 0 }).run).countdown, foe(run).countdown + 2);
  },
  energy() {
    const run = act(scene({ pockets: ['energy'], enemyHp: 999 }), {
      type: 'pocket',
      slot: 0,
    }).run;
    assert.equal(play(run, line(run, FISTS)).strike.tally.mult, 3);
  },
};

const FINISH_CHECKS = {
  sharp: () => assert.equal(hit({}, ['fist', { card: 'fist', finish: 'sharp' }, 'fist']).strike.tally.dmg, 7),
  gild: () => assert.equal(hit({}, ['fist', { card: 'fist', finish: 'gild' }, 'fist']).strike.tally.coins, 1),
  seal: () => assert.equal(hit({}, ['fist', { card: 'fist', finish: 'seal' }, 'fist']).strike.tally.mult, 2),
  copy: () => assert.equal(hit({}, ['fist', { card: 'fist', finish: 'copy' }, 'fist']).strike.tally.dmg, 8),
  laminate() {
    const run = scene({ enemies: ['blot'], real: true });
    // Everything on the board, in the queues and in the bag is laminated.
    const b = run.combat.board;
    for (const t of [...b.cells, ...b.queue.flat(), ...b.bag, ...b.source]) t.finish = 'laminate';
    ready(run, 'ink');
    const [m] = validMoves(run.combat.board, false);
    assert.equal(play(run, m).acts[0].cells.length, 0, 'кляксы не ложатся на ламинат');
  },
};

test('every item, pocket and finish has a check', () => {
  for (const id of Object.keys(ITEMS)) assert.ok(ITEM_CHECKS[id], `нет проверки для предмета «${ITEMS[id].name}» (${id})`);
  for (const id of Object.keys(POCKETS)) assert.ok(POCKET_CHECKS[id], `нет проверки для кармана «${POCKETS[id].name}» (${id})`);
  for (const id of Object.keys(FINISH_TEXT)) assert.ok(FINISH_CHECKS[id], `нет проверки для отделки «${FINISH_TEXT[id].name}»`);
});

for (const [id, check] of Object.entries(ITEM_CHECKS)) test(`${ITEMS[id]?.name ?? id}: ${ITEMS[id]?.desc ?? ''}`, check);
for (const [id, check] of Object.entries(POCKET_CHECKS)) test(`карман «${POCKETS[id].name}»: ${POCKETS[id].desc}`, check);
for (const [id, check] of Object.entries(FINISH_CHECKS)) test(`отделка «${FINISH_TEXT[id].name}»: ${FINISH_TEXT[id].text}`, check);

test('effects outside the strike grow with the act: damage with enemy health, armour with enemy blows', () => {
  const act = 2;
  const HP = ACTS[act].hpMul;
  const DMG = ACTS[act].dmgMul;
  const hurt = (relics, cards, k = 1) => {
    const run = scene({ act, relics, enemies: ['anchor', 'drop'] });
    const before = foe(run, k).hp;
    return before - foe(play(run, line(run, cards)).run, k).hp;
  };
  assert.equal(hurt(['spider'], FOLDERS), Math.round(3 * HP), 'паук');
  assert.equal(hurt(['plane'], [...FISTS, 'fist']), Math.round(6 * HP), 'самолётик');
  // Burn and bleed tick on the target at the end of the move (the strike itself lands on armour 0).
  const run = scene({ act, relics: ['match', 'rustyblade'], enemies: ['anchor'], enemyHp: 99999 });
  const res = play(run, line(run, [...FISTS, 'fist']));
  const ticks = res.effects.filter((f) => f.source === 'burn' || f.source === 'bleed').map((f) => [f.source, f.amount]);
  assert.deepEqual(ticks.sort(), [
    ['bleed', 2 * HP],
    ['burn', Math.round(4 * HP)],
  ]);
  // A tough hero: a rat of the boiler room hits hard, and thorns only answer a blow that was survived.
  const cactus = scene({ act, relics: ['cactus'], enemies: ['rat'], enemyHp: 99999, hp: 9999, maxHp: 9999 });
  ready(cactus, 'attack');
  assert.equal(99999 - foe(play(cactus, line(cactus, CLIPS)).run).hp, 5 * HP, 'кактус');
  assert.equal(scene({ act, relics: ['vestrelic'] }).hero.armor, Math.round(6 * DMG), 'жилет');
  const mop = hit({ act, relics: ['mop'] });
  const junk = mop.waves.flatMap((w) => w.cleared).filter((x) => x.kind === 'junk').length;
  assert.equal(armorOfMove(mop), Math.round(junk * DMG), 'швабра');
});

test('ink beyond a full skill burns: 1 damage per extra charge', () => {
  const dmg = (opts, cards = INKS) => hit(opts, cards).strike.tally.dmg;
  assert.equal(dmg({ active: 'giftbox' }), 0, 'навык берёт весь заряд');
  assert.equal(dmg({ active: 'eraser' }), 0, 'ровно на навык — без остатка');
  assert.equal(dmg({ active: 'eraser', charge: 3 }), 3, 'навык полон: 3 лишних → 3 урона');
  assert.equal(dmg({}), 3, 'без навыка весь заряд бьёт');
  const s = hit({ active: 'eraser', charge: 2 }, INKS);
  assert.equal(s.strike.tally.dmg, 2, 'одно деление на навык, два — в урон');
  assert.ok(s.strike.notes.includes('Лишний заряд +2 урона'));
  assert.equal(hit({}, INKS).run.hero.charge, 0, 'без навыка заряд не копится');
});

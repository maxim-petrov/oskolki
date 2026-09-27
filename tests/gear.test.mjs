// Every item of gear does what its text says: every colour of the board is the item held for it. A
// new item needs its check here: the registry test fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../game/run.ts';
import { GEAR } from '../game/content/gear.ts';
import { REFLECT_PER_HALF } from '../game/combat.ts';
import { BLUE3, GOLD3, RED3, VIOLET3, blowOf, cascade, double, foe, hit, idx, line, play, put, ready, scene } from './scene.mjs';
import { FIND_METER } from '../game/content/finds.ts';

/** Finds-meter points a move of these tiles gave (the meter was empty and stays under full). */
const findPts = (opts, tiles) => hit(opts, tiles).run.hero.finds;

const three = (t) => [t, t, t];
const four = (t) => [t, t, t, t];

const GEAR_CHECKS = {
  // ── Red: weapons (damage per tile; a group of 4+ is the super strike) ──
  knife() {
    assert.equal(hit({ enemies: ['rat'] }).strike.damage, 12, 'бумажная крыса: +100%');
    assert.equal(hit({ enemies: ['anchor'] }).strike.damage, 6, 'металл — без бонуса');
    assert.equal(hit({ ups: ['knife'] }).strike.tally.dmg, 9, 'нож+: 3 за фишку');
    const run = scene({ enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, four('blade')));
    assert.equal(res.strike.aoe, 8, 'супер: 2 за фишку каждому');
    assert.equal(foe(res.run, 1).hp, 24 - 8);
  },
  staplegun() {
    const res = hit({ gear: ['staplegun'] });
    assert.equal(res.strike.damage, 6);
    assert.equal(foe(res.run).countdown, foe(scene({})).countdown + 1 - 1, 'таймер +1 перед тиком');
    assert.equal(foe(hit({ gear: ['staplegun'] }, four('blade')).run).stunned, true, 'супер: цель пропускает действие');
  },
  scissors() {
    const res = hit({ gear: ['scissors'] });
    assert.equal(foe(res.run).hp, 999 - 6 - 1, 'удар и кровотечение 1 в конце хода');
    const big = hit({ gear: ['scissors'] }, four('blade'));
    assert.equal(foe(big.run).hp, 999 - 8 - 4, 'супер: ещё 3 кровотечения');
    assert.equal(foe(big.run).bleed, 3);
  },
  punch() {
    const dealt = (gear, tiles = RED3) => 999 - foe(hit({ gear, enemies: ['eraser'] }, tiles).run).hp;
    assert.equal(dealt(['knife']), 4, 'резиновый ластик: броня 2');
    assert.equal(dealt(['punch']), 6, 'дырокол пробивает');
    assert.equal(foe(hit({ gear: ['punch'] }, four('blade')).run).stunned, true, 'супер: цель пропускает действие');
  },
  ruler() {
    const run = scene({ gear: ['ruler'], enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, RED3));
    assert.deepEqual([res.strike.damage, res.strike.aoe], [6, 9], '2 за фишку цели и 3 — каждому');
    assert.equal(foe(res.run, 1).hp, 24 - 9);
    assert.equal(hit({ gear: ['ruler'] }, four('blade')).strike.aoe, 12 + 12, 'супер: ещё 3 за фишку всем');
  },
  sharpener() {
    assert.equal(hit({ gear: ['sharpener'] }).strike.tally.dmg, 6);
    assert.equal(cascade({ gear: ['sharpener'] }, BLUE3, RED3).strike.tally.dmg, 18, 'в каскаде — 6 за фишку');
    assert.equal(hit({ gear: ['sharpener'] }, four('blade')).strike.tally.dmg, 20, 'супер: ещё 3 за фишку');
  },
  awl() {
    assert.equal(999 - foe(hit({ gear: ['awl'], enemies: ['eraser'] }).run).hp, 12, 'насквозь: броня ластика не спасает');
    assert.equal(hit({ gear: ['awl'] }, four('blade')).strike.tally.dmg, 32, 'супер: ещё 4 за фишку');
    assert.equal(hit({ gear: ['awl'], act: 2 }).strike.tally.dmg, 3 * (4 + 2 * 2), 'в 3-м отделе: 8 за фишку');
  },
  cutter() {
    assert.equal(hit({ gear: ['cutter'], enemies: ['rat'] }).strike.damage, 18, 'по бумаге +200%');
    assert.equal(hit({ gear: ['cutter'], enemies: ['anchor'] }).strike.damage, 6);
    const big = hit({ gear: ['cutter'], enemies: ['anchor'] }, four('blade'));
    assert.equal(999 - foe(big.run).hp, 8 + 100, 'гильотина: 10% максимума здоровья цели');
  },

  // ── Blue: shields (a group blocks once, in half-hearts) ──
  shield() {
    assert.equal(hit({}, BLUE3).strike.armor, 1, 'половинка сердца');
    assert.equal(hit({}, four('shield')).strike.armor, 2, 'группа из 4 — ещё половинка');
    assert.equal(hit({}, [...BLUE3, 'shield', 'shield']).strike.armor, 2, 'и из 5 — тоже одна');
    assert.equal(hit({ ups: ['shield'] }, BLUE3).strike.armor, 2, 'щит+: сердце');
  },
  binder() {
    assert.equal(hit({}, three('binder')).strike.armor, 2, 'сердце');
    assert.equal(hit({}, four('binder')).strike.armor, 3, 'супер: ещё половинка');
  },
  sleeve() {
    const run = scene({ enemyHp: 999 });
    run.combat.board.source = [{ kind: 'blade' }];
    const res = play(run, line(run, three('sleeve')));
    const junk = (cells) => cells.filter((t) => t.kind === 'junk').length;
    const cleaned = res.events.find((e) => e.t === 'board' && e.reason === 'active');
    assert.ok(cleaned, 'поле почищено после удара');
    assert.ok(junk(cleaned.board) < junk(res.waves.at(-1).board), 'кляксы рядом убраны');
    assert.equal(res.strike.armor, 1);
  },
  umbrella() {
    const res = hit({ enemies: ['neighbor'] }, three('umbrella'));
    assert.equal(res.run.hero.ward, 1, 'половинка сердца на группу, не на фишку');
    const next = res.run;
    ready(next, 'attack');
    const blow = play(next, line(next, GOLD3, { row: 4 })).acts[0].hurt;
    const full = blowOf('neighbor', 'attack');
    assert.equal(blow.amount, full);
    assert.equal(blow.armor + blow.red, full - 1, 'зонтик гасит половинку сердца');
    assert.equal(hit({}, four('umbrella')).run.hero.ward, 2, 'раскрыт целиком: сердце');
  },
  drawer() {
    const s = hit({}, three('drawer')).strike;
    assert.equal(s.armor, 2);
    assert.equal(s.tally.dmg, 0, 'без красных — без урона');
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'blade', 'drawer')).strike.tally.dmg, 6 + 3, 'красные и синие в одном ходу: +3');
  },
  laminator() {
    assert.equal(hit({}, three('laminator')).strike.armor, 1);
    assert.equal(hit({}, four('laminator')).strike.armor, 4, 'группа из 4: (½ + ½) × 2');
  },
  archivebox() {
    assert.equal(hit({ hp: 30 }, three('archivebox')).run.hero.hp, 30);
    assert.equal(hit({ hp: 30 }, four('archivebox')).run.hero.hp, 31, 'группа из 4 лечит ½ сердца');
    assert.equal(hit({}, three('archivebox')).strike.armor, 2);
  },
  foldervest: () => assert.equal(hit({}, three('foldervest')).strike.armor, 4, 'сердце, и броня хода вдвое'),
  clipboard() {
    const res = hit({ enemies: ['neighbor'] }, three('clipboard'));
    assert.equal(res.run.hero.reflect, REFLECT_PER_HALF);
    const next = res.run;
    ready(next, 'attack');
    const hp = foe(next).hp;
    const after = play(next, line(next, GOLD3, { row: 4 })).run;
    assert.equal(hp - foe(after).hp, blowOf('neighbor', 'attack') * REFLECT_PER_HALF, '4 урона за каждую половинку сердца удара');
  },

  // ── Violet: energy (per tile) ──
  battery() {
    assert.equal(hit({}, VIOLET3).strike.tally.charge, 3);
    assert.equal(hit({}, four('ink')).strike.tally.charge, 8, 'полный заряд: ещё 1 за фишку');
    assert.equal(hit({ ups: ['battery'] }, VIOLET3).strike.tally.charge, 6, 'батарейка+: 2 за фишку');
  },
  whiteout() {
    const run = scene({ enemyHp: 999 });
    put(run, 3, 0, 'blade', { pin: true });
    const pinned = run.combat.board.cells[idx(3, 0)].id;
    const res = play(run, line(run, three('whiteout')));
    assert.equal(res.strike.tally.charge, 3);
    const cleaned = res.events.find((e) => e.t === 'board' && e.reason === 'active');
    assert.equal(cleaned.board.find((t) => t.id === pinned).pin, undefined, 'скоба снята');
  },
  urgent() {
    const start = foe(scene({})).countdown;
    assert.equal(foe(hit({}, three('urgent')).run).countdown, start + 1 - 1, 'таймер цели +1, но не больше раза за ход');
  },
  blotcurse() {
    const run = scene({ enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, three('blotcurse')));
    assert.equal(res.strike.aoe, 6);
    assert.equal(res.strike.tally.charge, 0, 'вместо энергии');
    assert.equal(foe(res.run, 1).hp, 18);
  },
  quill() {
    assert.equal(hit({ charge: 4 }, three('quill')).strike.tally.dmg, 3, 'шкала заполнилась — +3 урона');
    assert.equal(hit({}, three('quill')).strike.tally.dmg, 0, 'не хватило энергии');
    assert.equal(hit({}, three('quill')).strike.tally.charge, 6, '2 энергии за фишку');
  },
  copystamp() {
    const run = scene({ enemyHp: 999 });
    for (const c of [0, 2, 4]) put(run, 4, c, 'coin');
    put(run, 0, 5, 'coin');
    const res = play(run, line(run, three('copystamp')));
    const stamped = res.events.find((e) => e.t === 'board' && e.reason === 'active').board;
    assert.equal(stamped.filter((t) => t.kind === 'blade').length, 2, '2 фишки поля стали красными');
    assert.equal(stamped.filter((t) => t.kind === 'coin').length, 2);
  },
  carbon() {
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'coin', 'carbon')).run.hero.finds, 6, 'жёлтая группа после копирки копит находки дважды');
    // The carbon's group scores first, so the next group is copied whatever its colour.
    // (A big skill takes the carbon's charge, so no spare energy adds damage here.)
    const red = scene({ enemyHp: 999, active: 'giftbox' });
    assert.equal(play(red, double(red, 'blade', 'carbon')).strike.tally.dmg, 12, 'и красная тоже');
  },
  weight() {
    assert.equal(foe(hit({}, three('weight')).run).stunned, false);
    assert.equal(foe(hit({}, four('weight')).run).stunned, true, 'группа из 4 оглушает');
  },

  // ── Yellow: coins (per group) ──
  penny() {
    assert.equal(findPts({}, GOLD3), 3, 'деление шкалы находок за фишку');
    assert.ok(3 < FIND_METER);
    assert.equal(hit({}, GOLD3).strike.tally.coins, 0, 'монет за тройку нет');
    assert.equal(hit({}, four('coin')).strike.tally.coins, 1, 'супер: монета');
    assert.equal(hit({ ups: ['penny'] }, GOLD3).strike.tally.coins, 1, 'монетка+: монета за группу');
  },
  receipt() {
    assert.equal(findPts({}, three('receipt')), 6, 'находки вдвое');
    assert.equal(hit({}, four('receipt')).strike.tally.coins, 1, 'супер: монета');
  },
  bonus() {
    const s = hit({}, three('bonus')).strike;
    assert.equal(s.tally.dmg, 9, '+3 урона с фишки');
    assert.equal(s.tally.coins, 0);
  },
  creditcard() {
    const paid = hit({ coins: 10 }, three('creditcard'));
    assert.equal(paid.strike.tally.dmg, 18);
    assert.equal(paid.run.hero.coins, 9, 'группа стоит монету');
    assert.equal(hit({ coins: 0 }, three('creditcard')).strike.tally.dmg, 0, 'без денег не работает');
  },
  piggy() {
    const res = hit({}, three('piggy'));
    assert.equal(res.strike.tally.coins, 0);
    assert.equal(res.run.combat.bonusCoins, 1, 'после боя монета с каждой группы');
    assert.equal(hit({}, four('piggy')).strike.tally.coins, 1, 'супер: и монета сразу');
  },
  report() {
    assert.equal(hit({}, three('report')).strike.tally.dmg, 2, 'один цвет — +2');
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'blade', 'report')).strike.tally.dmg, 6 + 4, 'красные до отчёта — +4');
  },
  goldclip() {
    const s = hit({}, three('goldclip')).strike;
    assert.equal(s.tally.coins, 0);
    assert.equal(s.tally.bonus, 0.3, 'раз за ход +30%');
    assert.equal(hit({ ups: ['goldclip'] }, three('goldclip')).strike.tally.bonus, 0.5);
  },
};

test('every item of gear has a check', () => {
  for (const id of Object.keys(GEAR)) assert.ok(GEAR_CHECKS[id], `нет проверки для вещи «${GEAR[id].name}» (${id})`);
});

for (const [id, check] of Object.entries(GEAR_CHECKS)) test(`${GEAR[id]?.name ?? id}: ${GEAR[id]?.desc ?? ''}`, check);

test('a stamped tile makes its group a super', () => {
  assert.equal(hit({}, ['shield', { tile: 'shield', seal: true }, 'shield']).strike.armor, 2, 'синяя тройка с печатью: ещё половинка');
  const run = scene({ enemies: ['anchor', 'drop'] });
  assert.equal(play(run, line(run, ['blade', { tile: 'blade', seal: true }, 'blade'])).strike.aoe, 6, 'красная тройка с печатью: длинный разрез');
});

test('red tape is junk: it clears next to a group', () => {
  const run = scene({ enemyHp: 999 });
  put(run, 3, 1, 'tape');
  const res = play(run, line(run, RED3));
  assert.ok(
    res.waves[0].cleared.some((x) => x.i === idx(3, 1) && x.cause === 'splash'),
    'исчезает рядом с группой',
  );
});

test('gear swaps: energy in a fight, free between fights; any colour', () => {
  const run = scene({ gear: ['knife', 'scissors'], charge: 2 });
  const swapped = dispatch(run, { type: 'gear', id: 'scissors' });
  assert.deepEqual([swapped.run.hero.equip.blade, swapped.run.hero.charge], ['scissors', 0], '2 энергии');
  assert.ok(swapped.events.some((e) => e.t === 'gear' && e.id === 'scissors' && e.fam === 'blade'));
  assert.equal(swapped.run.combat.moves, 0, 'смена не тратит ход');
  const broke = dispatch(swapped.run, { type: 'gear', id: 'knife' });
  assert.equal(broke.events.find((e) => e.t === 'invalid')?.reason, 'Нужно 2 энергии');
  const calm = { ...swapped.run, combat: null, phase: 'map' };
  assert.equal(dispatch(calm, { type: 'gear', id: 'knife' }).run.hero.equip.blade, 'knife', 'вне боя — бесплатно');
  // The tiles of the colour work as the new item at once.
  const cut = scene({ gear: ['knife', 'awl'], charge: 2, enemyHp: 999 });
  const awl = dispatch(cut, { type: 'gear', id: 'awl' }).run;
  assert.equal(play(awl, line(awl, RED3)).strike.tally.dmg, 12, 'шило: 4 за фишку');
  const blue = scene({ gear: ['shield', 'binder'], charge: 2, enemyHp: 999 });
  const binder = dispatch(blue, { type: 'gear', id: 'binder' }).run;
  assert.equal(play(binder, line(binder, BLUE3)).strike.armor, 2, 'синие — скоросшиватель');
});

test('putting gear down: only between fights, never the last of a colour', () => {
  const run = { ...scene({ gear: ['knife', 'scissors'] }), combat: null, phase: 'map' };
  const dropped = dispatch(run, { type: 'dropGear', id: 'knife' }).run;
  assert.deepEqual([dropped.hero.gear.blade, dropped.hero.equip.blade], [['scissors'], 'scissors']);
  assert.ok(dropped.gearPool.every((id) => id !== 'knife'), 'простая вещь не уходит в награды');
  assert.equal(dispatch(dropped, { type: 'dropGear', id: 'scissors' }).events.find((e) => e.t === 'invalid')?.reason, 'Без вещи цвета нельзя');
  assert.equal(dispatch(scene({ gear: ['knife', 'scissors'] }), { type: 'dropGear', id: 'knife' }).events.find((e) => e.t === 'invalid')?.reason, 'Не в бою');
});


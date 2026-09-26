// Every card's rule does what its text says. A new card needs its check here: the registry test
// fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, cardText } from '../game/content/cards.ts';
import { REFLECT_PER_HALF } from '../game/combat.ts';
import { CLIPS, FISTS, FOLDERS, blowOf, cascade, double, foe, hit, idx, line, play, put, ready, scene } from './scene.mjs';

const three = (card) => [card, card, card];
const four = (card) => [card, card, card, card];

const CARD_CHECKS = {
  // ── Red: the weapon in hand strikes (weapons are checked with the items) ──
  fist() {
    assert.equal(hit({}, three('fist')).strike.tally.dmg, 6, 'нож: 2 за фишку');
    assert.equal(hit({}, three({ card: 'fist', up: true })).strike.tally.dmg, 9, 'улучшенный удар: +1 к оружию');
    assert.equal(hit({ weapon: 'awl' }, three('fist')).strike.tally.dmg, 9, 'шило: 3 за фишку');
  },
  pins: () => assert.equal(hit({}, three('pins')).strike.tally.dmg, 9, 'нож 2 + 1 за фишку'),
  redpen() {
    const run = scene({ enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, ['fist', 'redpen', 'fist']));
    assert.equal(res.strike.aoe, 6, 'супер-удар ножа из трёх: 2 за фишку всем');
    assert.equal(hit({}, FISTS).strike.aoe, 0, 'без ручки тройка бьёт обычным ударом');
  },
  alarm() {
    assert.equal(hit({}, three('alarm')).strike.tally.dmg, 6 + 3, 'одна красная группа — +3');
    assert.equal(cascade({}, three('alarm'), three('alarm')).strike.tally.dmg, 6 + 3 + 6 + 6, 'вторая красная группа хода — +6');
  },

  // ── Blue: a group blocks once, by its best card (half-hearts), +½ heart per tile past three ──
  folder() {
    assert.equal(hit({}, FOLDERS).strike.armor, 1, 'половинка сердца');
    assert.equal(hit({}, four('folder')).strike.armor, 2, 'четвёртая фишка — ещё половинка');
    assert.equal(hit({}, three({ card: 'folder', up: true })).strike.armor, 2);
  },
  binder() {
    assert.equal(hit({}, three('binder')).strike.armor, 2, 'сердце');
    assert.equal(hit({}, ['folder', 'binder', 'folder']).strike.armor, 2, 'группа берёт лучшую карту');
  },
  sleeve() {
    const run = scene({ enemyHp: 999 });
    run.combat.board.source = [{ card: 'fist', up: false }];
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
    const blow = play(next, line(next, CLIPS, { row: 4 })).acts[0].hurt;
    const full = blowOf('neighbor', 'attack');
    assert.equal(blow.amount, full);
    assert.equal(blow.armor + blow.red, full - 1, 'зонтик гасит половинку сердца');
  },
  drawer() {
    const s = hit({}, three('drawer')).strike;
    assert.equal(s.armor, 2);
    assert.equal(s.tally.dmg, 0, 'без красных — без урона');
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'fist', 'drawer')).strike.tally.dmg, 6 + 3, 'красные и синие в одном ходу: +3');
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
  vest: () => assert.equal(hit({}, three('vest')).strike.armor, 4, 'сердце, и броня хода вдвое'),
  clipboard() {
    const res = hit({ enemies: ['neighbor'] }, three('clipboard'));
    assert.equal(res.run.hero.reflect, REFLECT_PER_HALF);
    const next = res.run;
    ready(next, 'attack');
    const hp = foe(next).hp;
    const after = play(next, line(next, CLIPS, { row: 4 })).run;
    assert.equal(hp - foe(after).hp, blowOf('neighbor', 'attack') * REFLECT_PER_HALF, '4 урона за каждую половинку сердца удара');
  },

  // ── Violet ─────────────────────────────────────────────────────────
  ink: () => assert.equal(hit({}, three('ink')).strike.tally.charge, 3),
  corrector() {
    const run = scene({ enemyHp: 999 });
    put(run, 3, 0, 'fist', { pin: true });
    const pinned = run.combat.board.cells[idx(3, 0)].id;
    const res = play(run, line(run, three('corrector')));
    assert.equal(res.strike.tally.charge, 3);
    const cleaned = res.events.find((e) => e.t === 'board' && e.reason === 'active');
    assert.equal(cleaned.board.find((t) => t.id === pinned).pin, undefined, 'скоба снята');
  },
  urgent: () => assert.equal(foe(hit({}, three('urgent')).run).countdown, 3 + 1 - 1, 'таймер цели +1, но не больше раза за ход'),
  blotcurse() {
    const run = scene({ enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, three('blotcurse')));
    assert.equal(res.strike.aoe, 6);
    assert.equal(foe(res.run, 1).hp, 18);
  },
  quill() {
    assert.equal(hit({ active: 'stapler' }, three('quill')).strike.tally.dmg, 3, 'навык зарядился — +3 урона');
    assert.equal(hit({ active: 'giftbox' }, three('quill')).strike.tally.dmg, 0, 'не хватило энергии');
  },
  copystamp() {
    const run = scene({ enemyHp: 999, deck: ['fist', 'binder'] });
    const res = play(run, line(run, three('copystamp')));
    const copied = res.events.find((e) => e.t === 'board' && e.reason === 'active').board;
    assert.equal(copied.filter((t) => t.card === 'binder').length, 6, 'по 2 копии лучшей карты с фишки');
  },
  carbon() {
    const run = scene({ enemyHp: 999 });
    const res = play(run, double(run, 'clip', 'carbon'));
    assert.equal(res.strike.tally.coins, 6, 'группа после копирки срабатывает дважды');
    // The carbon's group scores first, so the next group is copied whatever its family.
    // (A big skill takes the carbon's charge, so no spare ink adds damage here.)
    const red = scene({ enemyHp: 999, active: 'giftbox' });
    assert.equal(play(red, double(red, 'fist', 'carbon')).strike.tally.dmg, 12, 'и красная тоже');
  },
  weight() {
    assert.equal(foe(hit({}, three('weight')).run).stunned, false);
    assert.equal(foe(hit({}, four('weight')).run).stunned, true, 'группа из 4 оглушает');
  },

  // ── Gold ───────────────────────────────────────────────────────────
  clip: () => assert.equal(hit({}, CLIPS).strike.tally.coins, 3),
  coin: () => assert.equal(hit({}, three('coin')).strike.tally.coins, 6),
  receipt: () => assert.equal(hit({}, three('receipt')).strike.tally.coins, 9),
  bonus() {
    const s = hit({}, three('bonus')).strike;
    assert.equal(s.tally.dmg, 9, '+3 урона с фишки');
    assert.equal(s.tally.coins, 3);
  },
  card() {
    const paid = hit({ coins: 10 }, three('card'));
    assert.equal(paid.strike.tally.dmg, 18);
    assert.equal(paid.run.hero.coins, 4, 'по 2 монеты за фишку');
    assert.equal(hit({ coins: 0 }, three('card')).strike.tally.dmg, 0, 'без денег не работает');
  },
  piggy() {
    const res = hit({}, three('piggy'));
    assert.equal(res.strike.tally.coins, 3);
    assert.equal(res.run.combat.bonusCoins, 9, 'после боя +3 с каждой');
  },
  report() {
    assert.equal(hit({}, three('report')).strike.tally.dmg, 2, 'одно семейство — +2');
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'fist', 'report')).strike.tally.dmg, 6 + 4, 'красные до отчёта — +4');
  },
  goldclip() {
    const s = hit({}, three('goldclip')).strike;
    assert.equal(s.tally.coins, 9);
    assert.equal(s.tally.bonus, 0.3, 'раз за ход +30%');
    assert.equal(hit({}, three({ card: 'goldclip', up: true })).strike.tally.bonus, 0.5);
  },

  // ── Status ─────────────────────────────────────────────────────────
  redtape() {
    const run = scene({ enemyHp: 999 });
    put(run, 3, 1, 'redtape');
    const res = play(run, line(run, FISTS));
    assert.ok(
      res.waves[0].cleared.some((x) => x.i === idx(3, 1) && x.cause === 'splash'),
      'исчезает рядом с группой',
    );
  },
};

test('every card has a check', () => {
  for (const id of Object.keys(CARDS)) assert.ok(CARD_CHECKS[id], `нет проверки для фишки «${CARDS[id].name}» (${id})`);
});

for (const [id, check] of Object.entries(CARD_CHECKS)) test(`${CARDS[id]?.name ?? id}: ${CARDS[id] ? cardText(id, false) : ''}`, check);

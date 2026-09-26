// Every card's rule does what its text says. A new card needs its check here: the registry test
// fails until it has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, cardText } from '../game/content/cards.ts';
import { CLIPS, FISTS, FOLDERS, cascade, double, foe, hit, idx, line, play, put, ready, scene } from './scene.mjs';

const three = (card) => [card, card, card];
const four = (card) => [card, card, card, card];

const CARD_CHECKS = {
  // ── Red ────────────────────────────────────────────────────────────
  fist: () => assert.equal(hit({}, three('fist')).strike.tally.dmg, 6),
  punch() {
    const dealt = (card) => 999 - foe(hit({ enemies: ['eraser'] }, three(card)).run).hp;
    assert.equal(dealt('fist'), 4, 'резиновый ластик: броня 2');
    assert.equal(dealt('punch'), 6, 'дырокол пробивает');
  },
  redpen() {
    const res = hit({}, three('redpen'));
    assert.equal(res.strike.tally.dmg, 3);
    assert.equal(foe(res.run).hp, 999 - 3 - 6, 'кровотечение 2 с каждой фишки');
    assert.equal(foe(res.run).bleed, 5);
  },
  sharpener() {
    assert.equal(hit({}, three('sharpener')).strike.tally.dmg, 3);
    assert.equal(cascade({}, FOLDERS, three('sharpener')).strike.tally.dmg, 15, 'в каскаде — впятеро');
  },
  pins() {
    const run = scene({ enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, three('pins')));
    assert.equal(res.strike.aoe, 3);
    assert.equal(foe(res.run, 1).hp, 21, 'каждому врагу');
    assert.equal(foe(res.run, 0).hp, 64 - 6, 'цели — и удар, и общий урон');
  },
  scissors() {
    const s3 = hit({}, three('scissors')).strike;
    assert.equal(s3.tally.dmg, 9);
    assert.equal(s3.tally.mult, 1);
    const s4 = hit({}, four('scissors')).strike;
    assert.equal(s4.tally.dmg, 12);
    assert.equal(s4.tally.mult, 2, 'группа из 4 — +1 множ один раз');
  },
  ruler() {
    assert.equal(hit({}, three('ruler')).strike.tally.dmg, 9);
    assert.equal(hit({}, four('ruler')).strike.tally.dmg, 16);
  },
  stapler: () => assert.equal(hit({}, three('stapler')).strike.tally.dmg, 2 + 3 + 4),
  awl() {
    const res = hit({}, three('awl'));
    assert.equal(res.strike.tally.dmg, 24);
    assert.equal(res.run.hero.hp, 54, 'минус 2 здоровья за фишку');
  },
  cutter() {
    assert.equal(hit({ enemies: ['rat'] }, three('cutter')).strike.tally.dmg, 36);
    assert.equal(hit({ enemies: ['anchor'] }, three('cutter')).strike.tally.dmg, 12);
  },
  alarm() {
    assert.equal(hit({}, three('alarm')).strike.tally.mult, 2, 'одна красная группа — +1');
    assert.equal(cascade({}, three('alarm'), three('alarm')).strike.tally.mult, 1 + 1 + 2, 'вторая красная группа хода — +2');
  },

  // ── Blue ───────────────────────────────────────────────────────────
  folder: () => assert.equal(hit({}, FOLDERS).strike.armor, 3),
  binder: () => assert.equal(hit({}, three('binder')).strike.armor, 6),
  sleeve() {
    const run = scene({ enemyHp: 999 });
    run.combat.board.source = [{ card: 'fist', up: false }];
    const res = play(run, line(run, three('sleeve')));
    const junk = (cells) => cells.filter((t) => t.kind === 'junk').length;
    const cleaned = res.events.find((e) => e.t === 'board' && e.reason === 'active');
    assert.ok(cleaned, 'поле почищено после удара');
    assert.ok(junk(cleaned.board) < junk(res.waves.at(-1).board), 'кляксы рядом убраны');
  },
  umbrella() {
    const res = hit({ enemies: ['rat'] }, three('umbrella'));
    assert.equal(res.run.hero.ward, 12);
    const next = res.run;
    ready(next, 'attack');
    const blow = play(next, line(next, CLIPS, { row: 4 })).acts[0].hurt;
    assert.equal(blow.amount, 14);
    assert.equal(blow.armor + blow.red, 14 - 12, 'зонтик гасит 12 из удара (остаток — броне и здоровью)');
  },
  drawer() {
    assert.equal(hit({}, three('drawer')).strike.tally.mult, 1);
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'fist', 'drawer')).strike.tally.mult, 2, 'красные и синие в одном ходу');
  },
  laminator() {
    assert.equal(hit({}, three('laminator')).strike.armor, 3);
    assert.equal(hit({}, four('laminator')).strike.armor, 8);
  },
  archivebox() {
    assert.equal(hit({ hp: 30 }, three('archivebox')).run.hero.hp, 30);
    assert.equal(hit({ hp: 30 }, four('archivebox')).run.hero.hp, 34, 'группа из 4 лечит 4');
  },
  vest: () => assert.equal(hit({}, three('vest')).strike.armor, 12),
  clipboard() {
    const res = hit({ enemies: ['rat'] }, three('clipboard'));
    assert.equal(res.run.hero.reflect, 0.5);
    const next = res.run;
    ready(next, 'attack');
    const hp = foe(next).hp;
    const after = play(next, line(next, CLIPS, { row: 4 })).run;
    assert.equal(hp - foe(after).hp, 7, 'половина удара 14 летит обратно');
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
  urgent: () => assert.equal(foe(hit({}, three('urgent')).run).countdown, 3 + 3 - 1, 'таймер цели +1 за фишку'),
  blotcurse() {
    const run = scene({ enemies: ['anchor', 'drop'] });
    const res = play(run, line(run, three('blotcurse')));
    assert.equal(res.strike.aoe, 6);
    assert.equal(foe(res.run, 1).hp, 18);
  },
  quill() {
    assert.equal(hit({ active: 'eraser' }, three('quill')).strike.tally.mult, 2, 'навык зарядился — +1 множ');
    assert.equal(hit({ active: 'giftbox' }, three('quill')).strike.tally.mult, 1, 'не хватило заряда');
  },
  copystamp() {
    const run = scene({ enemyHp: 999, deck: ['fist', 'cutter'] });
    const res = play(run, line(run, three('copystamp')));
    const copied = res.events.find((e) => e.t === 'board' && e.reason === 'active').board;
    assert.equal(copied.filter((t) => t.card === 'cutter').length, 6, 'по 2 копии лучшей карты с фишки');
  },
  carbon() {
    const run = scene({ enemyHp: 999 });
    const res = play(run, double(run, 'clip', 'carbon'));
    assert.equal(res.strike.tally.coins, 6, 'группа после копирки срабатывает дважды');
    // Groups score in family order: red, blue, violet, gold. A red group is scored before the
    // carbon, so it is not copied — the carbon only helps gold groups and later cascade waves.
    const red = scene({ enemyHp: 999 });
    assert.equal(play(red, double(red, 'fist', 'carbon')).strike.tally.dmg, 6);
  },
  weight() {
    assert.equal(foe(hit({}, three('weight')).run).stunned, false);
    assert.equal(foe(hit({}, four('weight')).run).stunned, true, 'группа из 4 оглушает');
  },

  // ── Gold ───────────────────────────────────────────────────────────
  clip: () => assert.equal(hit({}, CLIPS).strike.tally.coins, 3),
  coin: () => assert.equal(hit({}, three('coin')).strike.tally.coins, 6),
  receipt: () => assert.equal(hit({}, three('receipt')).strike.tally.coins, 9),
  bonus: () => assert.equal(hit({}, three('bonus')).strike.tally.mult, 4),
  card() {
    const paid = hit({ coins: 10 }, three('card'));
    assert.equal(paid.strike.tally.mult, 7);
    assert.equal(paid.run.hero.coins, 4, 'по 2 монеты за фишку');
    assert.equal(hit({ coins: 0 }, three('card')).strike.tally.mult, 1, 'без денег не работает');
  },
  piggy() {
    const res = hit({}, three('piggy'));
    assert.equal(res.strike.tally.coins, 3);
    assert.equal(res.run.combat.bonusCoins, 9, 'после боя +3 с каждой');
  },
  report() {
    assert.equal(hit({}, three('report')).strike.tally.mult, 2, 'одно семейство — +1');
    const run = scene({ enemyHp: 999 });
    assert.equal(play(run, double(run, 'fist', 'report')).strike.tally.mult, 3, 'красные до отчёта — +2');
  },
  goldclip() {
    const s = hit({}, three('goldclip')).strike;
    assert.equal(s.tally.coins, 9);
    assert.equal(s.tally.mult, 1.5, 'раз за ход ×1,5');
    assert.equal(hit({}, three({ card: 'goldclip', up: true })).strike.tally.mult, 2);
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

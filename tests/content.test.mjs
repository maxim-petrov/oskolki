// Content integrity: every item, card, enemy, event and hero is complete and wired up — names,
// texts, art, prices, unlocks, references between them and the simulation bots that play them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTS, CHARACTERS } from '../game/content/acts.ts';
import { CARDS, RARITY_PRICE, STARTER_DECKS, cardText, rewardPool } from '../game/content/cards.ts';
import { ENEMIES, INTENT_TEXT, MATERIAL_NAME } from '../game/content/enemies.ts';
import { EVENTS } from '../game/content/events.ts';
import { ITEMS, POCKETS, RELIC_PRICE, relicPool } from '../game/content/items.ts';
import { MAX_ENEMIES, activeCost } from '../game/combat.ts';
import { CARD_SCORE, decide } from '../game/bot.ts';
import { dispatch } from '../game/run.ts';
import { REQUESTS } from '../render/profile.ts';
import { scene } from './scene.mjs';

/** Sprite ids defined in render/art (object keys, `const x: SpriteDef` and shorthand entries). */
const ART = (() => {
  const dir = fileURLToPath(new URL('../render/art/', import.meta.url));
  const keys = new Set();
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(dir + f, 'utf8');
    for (const m of src.matchAll(/^\s+['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*(?::|,$)/gm)) keys.add(m[1]);
    for (const m of src.matchAll(/const ([A-Za-z_][A-Za-z0-9_]*): SpriteDef/g)) keys.add(m[1]);
  }
  return keys;
})();
const UNLOCKS = new Set(REQUESTS.map((r) => r.id));
const text = (s) => typeof s === 'string' && s.trim().length > 0;

test('items: names, texts, icons, pools, prices, unlocks', () => {
  for (const [key, d] of Object.entries(ITEMS)) {
    assert.equal(d.id, key);
    assert.ok(text(d.name) && text(d.desc), `${key}: имя и описание`);
    assert.ok(ART.has(d.icon), `${d.name}: нет иконки ${d.icon}`);
    assert.ok(d.pool in RELIC_PRICE, `${d.name}: пул ${d.pool}`);
    if (d.unlock) assert.ok(UNLOCKS.has(d.unlock), `${d.name}: открытие ${d.unlock}`);
    if (d.kind === 'active') {
      assert.ok(Number.isInteger(d.charge) && d.charge > 0, `${d.name}: цена заряда`);
      assert.ok(!d.apply, `${d.name}: у навыка нет пассивного эффекта`);
    } else assert.ok(d.apply || d.maxHp || d.heal || d.coins, `${d.name}: предмет ничего не делает`);
  }
  for (const [key, p] of Object.entries(POCKETS)) {
    assert.equal(p.id, key);
    assert.ok(text(p.name) && text(p.desc) && p.price > 0, key);
    assert.ok(ART.has(p.icon), `${p.name}: нет иконки ${p.icon}`);
  }
});

test('items: every pool that drops has something in it', () => {
  const all = relicPool(
    REQUESTS.map((r) => r.id),
    [],
  );
  for (const pool of ['common', 'uncommon', 'rare', 'boss'])
    assert.ok(
      all.some((id) => ITEMS[id].pool === pool),
      `пул ${pool} пуст`,
    );
});

// Every boss but the last offers three items, and the offered ones leave the pool.
const bossItems = relicPool([], []).filter((id) => ITEMS[id].pool === 'boss').length;
test('boss rewards: three items after each of the first two bosses (3-act shift)', () => {
  assert.ok(bossItems >= 3 * 2, `предметов босса ${bossItems}`);
});
test(
  'boss rewards: three items after each of the first three bosses (4-act shift)',
  {
    todo: 'предметов босса 6: после Кривого зеркала выбирать не из чего, экран награды пропускается',
  },
  () => assert.ok(bossItems >= 3 * 3, `предметов босса ${bossItems}, нужно 9`),
);

test('cards: families, values, texts, prices, unlocks, art', () => {
  for (const [key, d] of Object.entries(CARDS)) {
    assert.equal(d.id, key);
    assert.ok(text(d.name) && text(d.text), key);
    assert.ok(['blade', 'shield', 'ink', 'coin', 'status'].includes(d.fam), `${key}: семейство`);
    assert.ok(d.rarity in RARITY_PRICE, `${key}: редкость`);
    assert.ok(d.vUp >= d.v, `${d.name}: улучшенная не слабее`);
    if (d.unlock) assert.ok(UNLOCKS.has(d.unlock), `${d.name}: открытие ${d.unlock}`);
    for (const up of [false, true]) assert.ok(!cardText(key, up).includes('{'), `${d.name}: текст с подстановкой`);
    if (d.fam !== 'status') {
      assert.ok(d.text.includes('{v}') || key === 'report', `${d.name}: значение в тексте`);
      assert.ok(ART.has(`card_${key}`), `${d.name}: нет картинки card_${key}`);
    }
  }
  for (const fam of ['blade', 'shield', 'ink', 'coin'])
    assert.ok(rewardPool([]).filter((id) => CARDS[id].fam === fam).length >= 3, `в наградах мало фишек семейства ${fam}`);
});

test('heroes: starting decks, items and pockets exist', () => {
  for (const [key, ch] of Object.entries(CHARACTERS)) {
    assert.equal(ch.id, key);
    assert.ok(text(ch.name) && text(ch.desc) && ch.maxHp > 0, key);
    assert.equal(ITEMS[ch.relic]?.pool, 'starter', `${ch.name}: стартовый предмет`);
    if (ch.active) assert.equal(ITEMS[ch.active]?.kind, 'active', `${ch.name}: навык`);
    for (const p of ch.pockets) assert.ok(POCKETS[p], `${ch.name}: карман ${p}`);
    if (ch.unlock) assert.ok(UNLOCKS.has(ch.unlock), `${ch.name}: открытие`);
    const deck = STARTER_DECKS[key];
    assert.equal(deck?.length, 12, `${ch.name}: 12 карт`);
    for (const id of deck) assert.ok(CARDS[id], `${ch.name}: карта ${id}`);
  }
  for (const r of Object.values(ITEMS).filter((d) => d.pool === 'starter'))
    assert.ok(
      Object.values(CHARACTERS).some((c) => c.relic === r.id),
      `стартовый предмет ${r.name} ничей`,
    );
});

test('enemies: stats, actions, art, materials, summons and splits', () => {
  for (const [key, e] of Object.entries(ENEMIES)) {
    assert.equal(e.id, key);
    assert.ok(text(e.name) && text(e.blurb) && e.hp > 0, key);
    assert.ok(e.material in MATERIAL_NAME, `${e.name}: материал`);
    assert.ok(ART.has(key), `${e.name}: нет спрайта`);
    const intents = [...e.intents, ...(e.phases ?? []).flatMap((p) => p.intents)];
    assert.ok(e.intents.length > 0, `${e.name}: нет действий`);
    for (const i of intents) {
      assert.ok(i.kind in INTENT_TEXT, `${e.name}: действие ${i.kind} без названия`);
      assert.ok(Number.isInteger(i.timer) && i.timer >= 1, `${e.name}: таймер ${i.timer}`);
      assert.ok(i.value >= 0, `${e.name}: ${i.kind} ${i.value}`);
      if (i.kind === 'summon') assert.ok(ENEMIES[i.summon ?? 'rat'], `${e.name}: призывает ${i.summon}`);
    }
    if (e.splitInto) assert.ok(ENEMIES[e.splitInto], `${e.name}: распадается на ${e.splitInto}`);
    if (e.phases) {
      const at = e.phases.map((p) => p.at);
      assert.ok(
        at.every((x, k) => x > 0 && x < 1 && (k === 0 || x < at[k - 1])),
        `${e.name}: пороги фаз по убыванию`,
      );
    }
  }
});

test('acts: encounters exist and fit the stage, every boss has phases, every enemy is met', () => {
  const met = new Set(['kipa']);
  let prev = { hpMul: 0, dmgMul: 0 };
  for (const act of ACTS) {
    for (const group of [...act.weak, ...act.strong, ...act.elites, [act.boss]]) {
      assert.ok(group.length >= 1 && group.length <= MAX_ENEMIES, `${act.name}: ${group.join('+')}`);
      for (const id of group) {
        assert.ok(ENEMIES[id], `${act.name}: нет врага ${id}`);
        met.add(id);
      }
    }
    assert.ok(act.weak.length && act.strong.length && act.elites.length, `${act.name}: встречи`);
    assert.equal(ENEMIES[act.boss].size, 'boss', `${act.name}: босс`);
    assert.ok(ENEMIES[act.boss].phases?.length, `${act.name}: у босса нет второй фазы (GDD §8)`);
    assert.ok(act.hpMul > prev.hpMul && act.dmgMul > prev.dmgMul, `${act.name}: сложность растёт`);
    prev = act;
  }
  for (const e of Object.values(ENEMIES)) {
    for (const i of [...e.intents, ...(e.phases ?? []).flatMap((p) => p.intents)]) if (i.kind === 'summon') met.add(i.summon ?? 'rat');
    if (e.splitInto) met.add(e.splitInto);
  }
  for (const id of Object.keys(ENEMIES)) assert.ok(met.has(id), `враг ${ENEMIES[id].name} нигде не встречается`);
});

test('events: 2–3 choices, texts, art', () => {
  const ids = new Set();
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id), `событие ${e.id} дважды`);
    ids.add(e.id);
    assert.ok(text(e.title) && text(e.text), e.id);
    assert.ok(ART.has(e.art), `${e.title}: нет картинки ${e.art}`);
    assert.ok(e.options.length >= 2 && e.options.length <= 3, `${e.title}: ${e.options.length} выбора`);
    for (const o of e.options) assert.ok(text(o.label) && text(o.hint), `${e.title}: подпись выбора`);
  }
});

test('meta: every request unlocks something that exists', () => {
  const used = new Set([
    ...Object.values(CARDS).map((c) => c.unlock),
    ...Object.values(ITEMS).map((i) => i.unlock),
    ...Object.values(CHARACTERS).map((c) => c.unlock),
  ]);
  const ids = REQUESTS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'заявки не повторяются');
  for (const r of REQUESTS) {
    assert.ok(text(r.title) && text(r.text) && r.cost > 0, r.id);
    // Requests that change the start of a shift or open the 4th act are applied by the app.
    if (r.id.startsWith('bundle_') || r.id.startsWith('char_')) assert.ok(used.has(r.id), `заявка «${r.title}» ничего не открывает`);
  }
});

test('bots know every card and can use every skill', () => {
  for (const id of Object.keys(CARDS)) assert.ok(id in CARD_SCORE, `бот не знает цену фишки «${CARDS[id].name}» (game/bot.ts, CARD_SCORE)`);
  for (const d of Object.values(ITEMS).filter((x) => x.kind === 'active')) {
    const run = scene({
      real: true,
      active: d.id,
      enemies: ['rat', 'drop'],
      enemyHp: 999,
    });
    // A board that needs every skill: junk to erase, pins and embers to clean, danger to delay.
    const cells = run.combat.board.cells;
    for (const i of [3, 9, 15]) cells[i] = { id: 90000 + i, kind: 'junk' };
    cells[20] = { ...cells[20], pin: true };
    run.combat.enemies[0].countdown = 1;
    run.hero.charge = activeCost(run);
    const r = { s: 7 };
    let used = false;
    for (let k = 0; k < 4 && !used; k++) {
      const action = decide(run, { policy: 'greedy', seed: 1 }, r);
      if (action?.type !== 'active') {
        if (action?.type === 'target') {
          run.combat.target = action.uid;
          continue;
        }
        break;
      }
      const res = dispatch(run, action);
      assert.ok(!res.events.some((e) => e.t === 'invalid'), `${d.name}: бот зовёт навык с неверной целью`);
      used = true;
    }
    assert.ok(used, `бот не пользуется навыком «${d.name}»`);
  }
});

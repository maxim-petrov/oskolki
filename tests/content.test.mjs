// Content integrity: every item, piece of gear, enemy, event and hero is complete and wired up — names,
// texts, art, prices, unlocks, references between them and the simulation bots that play them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTS, CHARACTERS } from '../game/content/acts.ts';
import { BASE_GEAR, FAM_ROLE, GEAR, GEAR_PRICE, MAX_GEAR, gearPoolOf } from '../game/content/gear.ts';
import { ENEMIES, INTENT_TEXT, MATERIAL_NAME } from '../game/content/enemies.ts';
import { EVENTS } from '../game/content/events.ts';
import { ITEMS, POCKETS, RELIC_PRICE, relicPool } from '../game/content/items.ts';
import { MAX_ENEMIES, WEIGHT_MAX, WEIGHT_MIN, activeCost } from '../game/combat.ts';
import { GEAR_SCORE, decide } from '../game/bot.ts';
import { FAMS } from '../game/types.ts';
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
      assert.ok(Number.isInteger(d.charge) && d.charge > 0, `${d.name}: цена энергии`);
      assert.ok(!d.apply, `${d.name}: у навыка нет пассивного эффекта`);
    } else if (d.kind === 'gear') {
      // Gear: what a group of its colour does, its super and upgrade, and what they say.
      const g = d.gear;
      assert.ok(g && FAMS.includes(g.fam), `${d.name}: цвет`);
      assert.ok(g.value >= 0, `${d.name}: значение`);
      assert.ok(text(g.strikeText) && text(g.superText) && text(g.upText), `${d.name}: тексты группы, супера и улучшения`);
      assert.ok(Object.keys(g.super).length > 0, `${d.name}: супер что-то делает`);
      assert.ok(g.up.value || g.up.strike || g.up.super, `${d.name}: улучшение что-то делает`);
      assert.ok(!d.apply, `${d.name}: у вещи нет пассивного эффекта`);
    } else assert.ok(d.apply || d.maxHp || d.heal || d.coins || d.skillCost, `${d.name}: предмет ничего не делает`);
  }
  for (const [key, p] of Object.entries(POCKETS)) {
    assert.equal(p.id, key);
    assert.ok(text(p.name) && text(p.desc) && p.price > 0, key);
    assert.ok(ART.has(p.icon), `${p.name}: нет иконки ${p.icon}`);
  }
});

test('items: every pool that drops has something in it (gear is not among the items)', () => {
  assert.ok(relicPool([], []).every((id) => ITEMS[id].kind === 'passive'), 'в пуле предметов только предметы');
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
test('boss rewards: three items after each of the first three bosses (4-act shift)', () => {
  assert.ok(bossItems >= 3 * 3, `предметов босса ${bossItems}, нужно 9`);
});

test('gear: a plain item per colour, prices, art, and enough of every colour to find', () => {
  for (const [key, d] of Object.entries(GEAR)) {
    assert.equal(d.id, key);
    assert.ok(d.pool in GEAR_PRICE, `${d.name}: редкость`);
    assert.ok(ART.has(d.icon), `${d.name}: нет картинки ${d.icon}`);
    if (d.unlock) assert.ok(UNLOCKS.has(d.unlock), `${d.name}: открытие ${d.unlock}`);
  }
  for (const fam of FAMS) {
    assert.equal(GEAR[BASE_GEAR[fam]]?.gear.fam, fam, `простая вещь цвета ${fam}`);
    assert.equal(GEAR[BASE_GEAR[fam]].pool, 'starter');
    assert.ok(text(FAM_ROLE[fam]));
    assert.ok(gearPoolOf([]).filter((id) => GEAR[id].gear.fam === fam).length >= MAX_GEAR, `в наградах мало вещей цвета ${fam}`);
  }
  assert.ok(Object.values(GEAR).filter((d) => d.pool === 'starter').every((d) => Object.values(BASE_GEAR).includes(d.id) || Object.values(CHARACTERS).some((c) => Object.values(c.gear ?? {}).includes(d.id))), 'простые вещи — у героев');
});

test('heroes: starting gear, colour weights, items and pockets exist', () => {
  for (const [key, ch] of Object.entries(CHARACTERS)) {
    assert.equal(ch.id, key);
    assert.ok(text(ch.name) && text(ch.desc) && ch.maxHp > 0, key);
    assert.equal(ITEMS[ch.relic]?.pool, 'starter', `${ch.name}: стартовый предмет`);
    if (ch.active) assert.equal(ITEMS[ch.active]?.kind, 'active', `${ch.name}: навык`);
    for (const p of ch.pockets) assert.ok(POCKETS[p], `${ch.name}: карман ${p}`);
    if (ch.unlock) assert.ok(UNLOCKS.has(ch.unlock), `${ch.name}: открытие`);
    for (const [fam, id] of Object.entries(ch.gear ?? {})) assert.equal(GEAR[id]?.gear.fam, fam, `${ch.name}: вещь ${id} цвета ${fam}`);
    for (const [fam, w] of Object.entries(ch.weights ?? {})) assert.ok(FAMS.includes(fam) && w >= WEIGHT_MIN && w <= WEIGHT_MAX, `${ch.name}: вес ${fam} ${w}`);
  }
  // Starting items belong to a hero; the plain gear is in every hero's hands.
  for (const r of Object.values(ITEMS).filter((d) => d.pool === 'starter'))
    assert.ok(
      r.kind === 'gear' || Object.values(CHARACTERS).some((c) => c.relic === r.id),
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

test('bots know every item of gear and can use every skill', () => {
  for (const id of Object.keys(GEAR)) assert.ok(id in GEAR_SCORE, `бот не знает цену вещи «${GEAR[id].name}» (game/bot.ts, GEAR_SCORE)`);
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

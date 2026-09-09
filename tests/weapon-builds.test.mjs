import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage1-engine.mjs';

const cache = new Map();
function fixture(family = 'blade', count = 3) {
  const key = `${family}:${count}`;
  if (!cache.has(key)) {
    outer: for (let seed = 1; seed < 1500; seed++) {
      const s = g.startRun(seed);
      for (const m of g.validMoves(s.board)) {
        const board = g.shifted(s.board, m.axis, m.line, m.amount),
          groups = g.groups(board);
        if (
          groups.length === 1 &&
          groups[0].length === count &&
          board[groups[0][0]].family === family
        ) {
          s.enemies[0].hp = s.enemies[0].maxHp = 10000;
          s.enemies[0].block = 0;
          cache.set(key, { s, m });
          break outer;
        }
      }
    }
  }
  assert.ok(cache.has(key), `Fixture ${key}`);
  return g.copy(cache.get(key));
}
const move = (s, m) => g.move(s, m.axis, m.line, m.amount);
const preview = (s, m) => g.previewMove(s, m.axis, m.line, m.amount);
const first = (s, m) => move(s, m).frames[0].state;
const enemy = (s, id) => ({ ...g.copy(s.enemies[0]), id, name: `Цель ${id}` });

test('v0.2: all five weapons implement their formulas at all qualities and match lengths', () => {
  for (const weapon of g.WEAPONS)
    for (const quality of [0, 1, 2])
      for (const count of [3, 4, 5]) {
        const { s, m } = fixture('blade', count);
        s.equipment.weapon = weapon.id;
        s.weaponQuality = quality;
        s.upgrades.blade = 1;
        const d = 2 * count + 2 + quality;
        const expected =
          weapon.id === 'gear-axe'
            ? d + (count >= 4 ? 4 : -2)
            : ['gear-rusty-dagger', 'gear-rune-sword'].includes(weapon.id)
              ? d - 2
              : d;
        const r = first(s, m);
        assert.equal(
          r.stats.damage,
          expected,
          `${weapon.id}, q${quality}, match${count}`,
        );
        assert.equal(
          r.enemies[0].poison,
          weapon.id === 'gear-rusty-dagger' ? 2 : 0,
        );
        assert.equal(
          r.energy - s.energy,
          weapon.id === 'gear-rune-sword' ? 1 : 0,
        );
      }
});
test('cutter bypasses only two points of each hit, and consumes only the block for the remainder', () => {
  for (const block of [0, 1, 4, 20]) {
    const { s, m } = fixture();
    s.enemies[0].block = block;
    const r = first(s, m);
    assert.equal(r.stats.damage, 6 - Math.min(4, block));
    assert.equal(r.enemies[0].block, Math.max(0, block - 4));
  }
});
test('dagger poisons survivors after damage; toxin cannot proc on the same first infection', () => {
  const { s, m } = fixture();
  s.equipment.weapon = 'gear-rusty-dagger';
  s.relics = ['toxin', 'heart'];
  s.hp = 30;
  const a = first(s, m);
  assert.equal(a.enemies[0].poison, 2);
  assert.ok(!a.flags.includes('turn:toxin'));
  s.enemies[0].poison = 3;
  const b = first(s, m);
  assert.equal(b.enemies[0].poison, 7);
  assert.ok(b.flags.includes('turn:toxin'));
  s.enemies[0].hp = 4;
  const c = first(s, m);
  assert.equal(c.enemies[0].hp, 0);
  assert.equal(c.hp, 33);
  assert.ok(c.flags.includes('battle:heart'));
  s.enemies[0].poison = 0;
  const d = first(s, m);
  assert.equal(d.enemies[0].poison, 0);
  assert.equal(d.hp, 30);
});
test('cleaver preselects its second target; venom and toxin apply to the actual hits without spill damage', () => {
  const { s, m } = fixture();
  s.equipment.weapon = 'gear-cleaver';
  s.enemies.push(enemy(s, 20), enemy(s, 30));
  s.target = 20;
  const shifted = g.shifted(s.board, m.axis, m.line, m.amount);
  g.groups(shifted)[0].forEach((i) => {
    shifted[i].variant = 'venom';
  });
  s.enemies[0].poison = 1;
  s.relics = ['toxin'];
  const r = first(s, m);
  assert.equal(r.enemies[1].hp, 9996);
  assert.equal(r.enemies[0].hp, 9998);
  assert.equal(r.enemies[2].hp, 10000);
  assert.equal(r.enemies[1].poison, 3);
  assert.equal(r.enemies[0].poison, 6);
  assert.equal(r.enemies[2].poison, 0);
  s.enemies[1].hp = 1;
  const killed = first(s, m);
  assert.equal(killed.enemies[1].hp, 0);
  assert.equal(killed.enemies[0].hp, 9998);
  assert.equal(killed.enemies[2].hp, 10000);
});
test('rune charge powers bolt and energy sacrifice, respects the one-charge-per-turn cap and survives saving', () => {
  const { s, m } = fixture();
  s.equipment.weapon = 'gear-rune-sword';
  s.energy = 5;
  let armed = first(s, m);
  armed.moved = true;
  assert.equal(armed.energy, 6);
  assert.ok(armed.flags.includes('turn:rune-armed'));
  armed = g.loadSave(JSON.parse(JSON.stringify(armed)));
  assert.ok(armed);
  const bolt = g.castSkill(armed, 'bolt');
  assert.equal(bolt.frames[0].state.stats.damage - armed.stats.damage, 14);
  assert.ok(!bolt.state.flags.includes('turn:rune-armed'));
  armed.skills = ['seal', 'guard'];
  const seal = g.castSkill(armed, 'seal');
  assert.equal(seal.frames[0].state.stats.damage - armed.stats.damage, 18);
  armed.skills = ['blood', 'guard'];
  const blood = g.castSkill(armed, 'blood');
  assert.equal(blood.frames[0].state.stats.damage - armed.stats.damage, 8);
  assert.ok(blood.state.flags.includes('turn:rune-armed'));
  const reset = g.endTurn(armed).state;
  assert.ok(!reset.flags.some((f) => f.startsWith('turn:rune')));
  s.flags = ['turn:rune-trigger'];
  assert.ok(!first(s, m).flags.includes('turn:rune-armed'));
});
test('rune energy obeys capacity and overflow triggers lamp once without recursively firing the weapon', () => {
  const { s, m } = fixture();
  s.equipment.weapon = 'gear-rune-sword';
  s.energy = 12;
  s.relics = ['lamp'];
  const r = first(s, m);
  assert.equal(r.energy, 12);
  assert.equal(r.stats.damage, 8);
  assert.ok(r.flags.includes('turn:lamp'));
  s.flags = ['turn:lamp'];
  assert.equal(first(s, m).stats.damage, 4);
});
test('new reward choices vary by seed, expose every weapon early and all twelve relics without unlock grinding', () => {
  const types = new Set(),
    relics = new Set(),
    choices = new Set();
  for (let seed = 1; seed <= 150; seed++) {
    const s = g.withUnlocks(g.startRun(seed), g.EMPTY_META);
    assert.equal(
      s.flags.filter((f) => f.startsWith('run:available:')).length,
      12,
    );
    const a = g.copy(s),
      b = g.copy(s);
    const offers = g.rewardOffers(a);
    assert.deepEqual(offers, g.rewardOffers(b));
    assert.deepEqual(
      offers.map((o) => o.kind),
      ['equipment', 'modifier', 'relic'],
    );
    assert.equal(offers[0].quality, 0);
    types.add(offers[0].id);
    choices.add(offers.map((o) => o.id).join(','));
    for (let depth = 2; depth <= 20; depth++) {
      s.room = depth;
      g.rewardOffers(s)
        .filter((o) => o.kind === 'relic')
        .forEach((o) => relics.add(o.id));
    }
  }
  assert.equal(types.size, 4);
  assert.ok(types.has('gear-rune-sword'));
  assert.ok(choices.size > 10);
  assert.equal(relics.size, 12);
});
test('weapon identity and quality are independent; optional downgrades replace just that slot atomically', () => {
  for (const old of g.WEAPONS)
    for (const next of g.WEAPONS)
      for (const quality of [0, 1, 2]) {
        const s = g.startRun(3);
        s.phase = 'reward';
        s.equipment.weapon = old.id;
        s.weaponQuality = 2;
        s.offers = [g.weaponOffer(next.id, quality)];
        const before = g.copy(s),
          r = g.chooseReward(s, next.id);
        if (old.id === next.id && quality === 2) {
          assert.ok(r.error);
          assert.equal(r.state, s);
          continue;
        }
        assert.equal(r.error, undefined);
        assert.equal(r.state.weaponQuality, quality);
        assert.equal(r.state.equipment.weapon, next.id);
        assert.equal(r.state.equipment.clothing, s.equipment.clothing);
        assert.deepEqual(s, before);
        assert.equal(g.chooseReward(r.state, next.id).state, r.state);
        assert.deepEqual(g.loadSave(r.state), r.state);
      }
});
test('sharpening keeps weapon identity, costs one rest or the shown shop price, caps at quality two and persists', () => {
  let s = g.startRun();
  s.equipment.weapon = 'gear-rusty-dagger';
  for (const quality of [1, 2]) {
    s.phase = 'rest';
    const r = g.rest(s, 'sharpen');
    assert.equal(r.error, undefined);
    s = r.state;
    assert.equal(s.phase, 'map');
    assert.equal(s.weaponQuality, quality);
    assert.equal(s.equipment.weapon, 'gear-rusty-dagger');
  }
  s.phase = 'rest';
  assert.ok(g.rest(s, 'sharpen').error);
  assert.ok(!g.restOptions(s).some((o) => o.id === 'sharpen'));
  s = g.startRun(55);
  s.phase = 'map';
  s.room = 4;
  s = g.enterRoom(s, g.nextRooms(s).find((r) => r.kind === 'shop').id).state;
  const offer = s.offers.find((o) => o.id === 'sharpen');
  assert.ok(offer);
  s.gold = offer.cost;
  const bought = g.buy(s, 'sharpen');
  assert.equal(bought.error, undefined);
  assert.equal(bought.state.gold, 0);
  assert.equal(bought.state.weaponQuality, 1);
  assert.ok(g.buy(bought.state, 'sharpen').error);
  assert.deepEqual(g.loadSave(bought.state), bought.state);
});
test('invalid qualities, unknown rule versions and malformed weapon offers are rejected without touching valid classic saves', () => {
  const s = g.startRun();
  for (const quality of [-1, 3, 0.5, NaN, undefined]) {
    const bad = g.copy(s);
    bad.weaponQuality = quality;
    assert.equal(g.loadSave(bad), null);
  }
  const bad = g.copy(s);
  bad.rulesVersion = 99;
  assert.equal(g.loadSave(bad), null);
  const legacy = g.copy(s);
  delete legacy.rulesVersion;
  delete legacy.weaponQuality;
  legacy.offers = [g.equipmentById('gear-cleaver')];
  assert.deepEqual(g.loadSave(legacy), legacy);
  s.offers = [g.equipmentById('gear-cleaver')];
  assert.equal(g.loadSave(s), null);
});
test('preview matches real first-wave effects, is deterministic and cannot inspect or consume the future RNG', () => {
  for (let seed = 1; seed <= 25; seed++)
    for (const w of g.WEAPONS) {
      const s = g.startRun(seed);
      s.equipment.weapon = w.id;
      s.relics = [
        'coil',
        'toxin',
        'heart',
        'lamp',
        'order',
        'thread',
        'thorns',
        'conductor',
      ];
      s.hp = 25;
      s.energy = 11;
      s.enemies[0].hp = s.enemies[0].maxHp = 10000;
      s.enemies[0].block = 4;
      s.modifiers = ['bomb', 'venom'];
      s.board.forEach((t, i) => {
        if (t.family === 'spark' && i % 3 === 0) t.variant = 'bomb';
        if (t.family === 'blade' && i % 2 === 0) t.variant = 'venom';
      });
      const m = g.validMoves(s.board)[0],
        before = g.copy(s),
        p = preview(s, m),
        actual = first(s, m);
      assert.equal(p.error, undefined);
      assert.deepEqual(s, before);
      assert.equal(p.energy, actual.energy - s.energy);
      assert.equal(p.block, actual.block - s.block);
      assert.equal(p.focus, actual.focus - s.focus);
      assert.equal(p.health, actual.hp - s.hp);
      assert.equal(
        p.targets.reduce((sum, e) => sum + e.damage, 0),
        actual.stats.damage - s.stats.damage,
      );
      const other = g.copy(s);
      other.rng = 987654321;
      assert.deepEqual(preview(other, m), p);
    }
});
test('preview shows lethal ink, focus cleansing, a cancelled tide and boss phase changes honestly', () => {
  const { s, m } = fixture();
  s.room = 11;
  s.tide = { row: 0, turns: 1, cleared: false };
  s.hp = 1;
  const b = g.shifted(s.board, m.axis, m.line, m.amount),
    cell = g.groups(b)[0][0];
  b[cell].ink = true;
  s.tide.row = Math.floor(cell / 6);
  const before = g.copy(s),
    p = preview(s, m);
  assert.equal(p.lethal, true);
  assert.equal(p.health, -1);
  assert.equal(p.tideCleared, true);
  assert.deepEqual(s, before);
  const { s: f, m: fm } = fixture('focus');
  f.board[0].ink = true;
  assert.equal(preview(f, fm).inkCleared, 1);
  assert.equal(preview(f, fm).health, 0);
  const { s: boss, m: bm } = fixture();
  boss.enemies[0] = {
    ...boss.enemies[0],
    kind: 'censor',
    name: 'Цензор',
    maxHp: 100,
    hp: 51,
  };
  assert.equal(preview(boss, bm).targets[0].phaseChanged, true);
});
test('the three ready-made builds stay experimental, retain artwork IDs and survive save/resume', () => {
  for (const [preset, weapon] of [
    ['poison', 'gear-rusty-dagger'],
    ['editor', 'gear-axe'],
    ['runes', 'gear-rune-sword'],
  ]) {
    const s = g.configureRun(g.startRun(92), preset);
    assert.equal(s.equipment.weapon, weapon);
    assert.ok(s.modified);
    assert.deepEqual(g.loadSave(s), s);
    assert.equal(
      g.updateMeta(g.EMPTY_META, { ...s, phase: 'victory' }).wins,
      0,
    );
  }
});

test('editor build converts a single gap into a long axe match, earns order block and heals from thread', () => {
  const s = g.configureRun(g.startRun(9), 'editor');
  s.hp = 25;
  s.enemies[0].hp = s.enemies[0].maxHp = 1000;
  s.board.forEach((tile, i) => {
    tile.family = g.FAMILIES[(Math.floor(i / 6) + (i % 6)) % 4];
    tile.variant = null;
  });
  ['blade', 'blade', 'focus', 'blade', 'blade', 'spark'].forEach(
    (family, i) => (s.board[i].family = family),
  );
  assert.equal(g.groups(s.board).length, 0);
  const r = g.castSkill(s, 'edit', 2, 'blade');
  assert.equal(r.error, undefined);
  assert.equal(r.frames[0].state.focus, 0);
  assert.equal(r.frames[0].state.block, 3);
  assert.equal(r.frames[1].state.stats.damage, 14);
  assert.equal(r.frames[1].state.hp, 28);
  assert.ok(r.state.flags.includes('battle:thread'));
  assert.equal(
    r.state.moved,
    false,
    'Editing uses the skill, leaving the manual shift available',
  );
  assert.ok(g.castSkill(r.state, 'edit', 2, 'blade').error);
});

test('dagger infection creates a poison kill before the next intent and heart heals only once per fight', () => {
  const { s, m } = fixture();
  s.equipment.weapon = 'gear-rusty-dagger';
  s.relics = ['toxin', 'heart'];
  s.hp = 20;
  s.enemies[0].hp = 6;
  s.enemies.push({ ...enemy(s, 20), hp: 6 });
  const infected = first(s, m);
  assert.equal(infected.enemies[0].hp, 2);
  assert.equal(infected.enemies[0].poison, 2);
  infected.enemies[1].poison = 6;
  const r = g.endTurn(infected);
  assert.equal(r.state.phase, 'reward');
  assert.equal(r.state.hp, 23);
  assert.equal(r.frames.filter((f) => f.cue?.type === 'attack').length, 0);
  assert.equal(r.state.stats.kills, 2);
});

import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { EnemyArt } = await import('../components/enemy-art.tsx');
const { CombatSprite } = await import('../components/combat-sprite.tsx');
const { EnemyIntentLabel } = await import('../components/enemy-intent.tsx');
const g = await import('./helpers/stage1-engine.mjs');
const art = JSON.parse(
  readFileSync(new URL('../game/enemy-art.json', import.meta.url)),
);
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const kinds = [
  ...g.NEW_ENEMY_KINDS,
  'censor',
  ...g.ARCHIVE_ENEMY_KINDS,
  'tide-keeper',
  'redactor',
];
const compare = (a, b) => a.localeCompare(b);
function enemy(kind) {
  const d = g.ENEMY_CATALOG[kind];
  return {
    id: 1,
    kind,
    name: d.name,
    hp: d.hp,
    maxHp: d.hp,
    damage: d.damage,
    block: 0,
    poison: 0,
  };
}

test('sixteen enemies and three bosses each own a distinct transparent native PNG', () => {
  assert.deepEqual(Object.keys(art).sort(compare), [...kinds].sort(compare));
  const hashes = new Set();
  for (const key of kinds) {
    const a = art[key],
      data = readFileSync(new URL('../public' + a.src, import.meta.url));
    assert.equal(a.src, '/art/pronoun-palace/enemies/' + key + '.png');
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(data[25], 6, 'native RGBA required');
    assert.equal(data.readUInt32BE(16), a.width);
    assert.equal(data.readUInt32BE(20), a.height);
    const [x, y, w, h] = a.bounds;
    assert.ok(
      x >= 0 &&
        y >= 0 &&
        w > 0 &&
        h > 0 &&
        x + w <= a.width &&
        y + h <= a.height,
    );
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  assert.equal(hashes.size, kinds.length);
});

test('all enemy combat poses use their own artwork, while old saved enemies keep their atlas', () => {
  for (const key of kinds)
    for (const pose of ['idle', 'windup', 'strike', 'guard', 'hurt', 'death']) {
      const html = render(EnemyArt, { enemy: enemy(key), pose });
      assert.ok(html.includes(art[key].src));
      assert.ok(html.includes('data-enemy-kind="' + key + '"'));
      assert.ok(!html.includes('/weapons/'));
      assert.ok(!html.includes('NaN'));
    }
  assert.ok(
    render(EnemyArt, { enemy: enemy('raider'), pose: 'idle' }).includes(
      '/actors.png',
    ),
  );
});

test('live enemy identity, second boss phase and displayed intentions survive save/resume', () => {
  for (const key of kinds) {
    let state = g.startRun();
    state.enemies = [enemy(key)];
    if (['censor', 'tide-keeper'].includes(key))
      state.enemies[0].hp = state.enemies[0].maxHp / 2;
    state = g.loadSave(JSON.parse(JSON.stringify(state)));
    const snapshot = JSON.stringify(state);
    const html = render(CombatSprite, { state, actor: 1, motion: null });
    assert.ok(html.includes(art[key].src));
    assert.equal(
      html.includes('boss-enraged'),
      ['censor', 'tide-keeper'].includes(key),
    );
    for (const round of [1, 2, 3]) {
      state.round = round;
      const action = g.intent(state, state.enemies[0]);
      const label = render(EnemyIntentLabel, {
        state,
        enemy: state.enemies[0],
      });
      assert.ok(label.includes(action.text));
      assert.ok(label.includes('intent-' + action.type));
    }
    state.round = 1;
    assert.equal(JSON.stringify(state), snapshot);
  }
});

test('the Warden holds all five equipped weapons in six measured poses without replacing the original hero', async () => {
  const { WardenArt, WARDEN_FRAMES } =
    await import('../components/warden-art.tsx');
  // Use the real equipment catalog rather than assuming historical item IDs.
  const ids = g.EQUIPMENT.filter((e) => e.slot === 'weapon').map((e) => e.id);
  assert.equal(ids.length, 5);
  for (const pose of Object.keys(WARDEN_FRAMES)) {
    const pictures = ids.map((weaponId) =>
      render(WardenArt, { pose, weaponId }),
    );
    assert.equal(
      new Set(pictures.map((s) => s.match(/data-weapon-id="([^"]+)/)?.[1]))
        .size,
      5,
    );
    for (const s of pictures) {
      assert.match(s, /warden-poses\.png/);
      assert.doesNotMatch(s, /undefined|NaN/);
    }
  }
});

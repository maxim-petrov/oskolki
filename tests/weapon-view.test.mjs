import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { CombatSprite } = await import('../components/combat-sprite.tsx');
const { PalaceActorArt } = await import('../components/palace-actor-art.tsx');
const { BoardTileArt } = await import('../components/board-tile-art.tsx');
const { WeaponGallery } = await import('../components/equipment.tsx');
const { weaponArtById, heldWeaponTransform } =
  await import('../game/weapon-art.ts');
const g = await import('./helpers/stage1-engine.mjs');
const rig = JSON.parse(
  readFileSync(new URL('../game/hero-art.json', import.meta.url)),
);
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));

test('rewarded, purchased and restored weapons appear on both the hero and board', () => {
  let state = g.startRun(212);
  for (const [i, weapon] of g.WEAPONS.entries()) {
    if (i) {
      state.room = 6;
      state.phase = i % 2 ? 'reward' : 'shop';
      state.gold = 100;
      state.offers = [{ ...g.weaponOffer(weapon.id, i % 3), cost: 25 }];
      const result =
        i % 2 ? g.chooseReward(state, weapon.id) : g.buy(state, weapon.id);
      assert.equal(result.error, undefined);
      state = g.loadSave(JSON.parse(JSON.stringify(result.state)));
    }
    const snapshot = JSON.stringify(state);
    const actor = render(CombatSprite, { state, actor: 'hero', motion: null });
    const tile = render(BoardTileArt, {
      family: 'blade',
      weaponId: state.equipment.weapon,
    });
    for (const html of [actor, tile]) {
      assert.ok(html.includes(`data-weapon-id="${weapon.id}"`));
      assert.ok(html.includes(`/weapons/${weapon.id}.png`));
      for (const other of g.WEAPONS.filter((item) => item.id !== weapon.id))
        assert.ok(!html.includes(`/weapons/${other.id}.png`));
    }
    assert.equal(
      JSON.stringify(state),
      snapshot,
      'Rendering must not alter a saved run',
    );
  }
});

test('every battle pose holds the selected weapon while enemies keep their own art', () => {
  for (const pose of ['idle', 'windup', 'strike', 'guard', 'hurt', 'death']) {
    for (const weapon of g.WEAPONS) {
      const hero = render(PalaceActorArt, {
        hero: true,
        pose,
        weaponId: weapon.id,
      });
      assert.ok(hero.includes('actors-weaponless.png'));
      assert.ok(hero.includes(`data-weapon-id="${weapon.id}"`));
      assert.ok(hero.includes('palace-body-mask-'));
      assert.ok(hero.includes('palace-hand-'));
      assert.ok(!hero.includes('NaN'));
    }
    const enemy = render(PalaceActorArt, {
      hero: false,
      pose,
      weaponId: 'gear-rune-sword',
    });
    assert.ok(enemy.includes('/actors.png'));
    assert.ok(!enemy.includes('held-weapon'));
    assert.ok(!enemy.includes('actors-weaponless.png'));
  }
});

test('special blade tiles show equipped weapon and effect, other tile families stay intact', () => {
  for (const variant of ['venom', 'bomb']) {
    const html = render(BoardTileArt, {
      family: 'blade',
      variant,
      weaponId: 'gear-axe',
    });
    assert.ok(html.includes('/weapons/gear-axe.png'));
    assert.ok(html.includes(`weapon-variant variant-${variant}`));
  }
  for (const family of ['shield', 'spark', 'focus']) {
    const html = render(BoardTileArt, { family, weaponId: 'gear-axe' });
    assert.ok(html.includes('/icons.png'));
    assert.ok(!html.includes('/weapons/'));
  }
});

test('gallery previews leave equipped weapon unchanged, and grips land at the pose hands', () => {
  const state = g.startRun();
  const snapshot = JSON.stringify(state);
  render(WeaponGallery, {
    selectedId: 'gear-rune-sword',
    equippedId: state.equipment.weapon,
    onSelect() {},
  });
  assert.equal(JSON.stringify(state), snapshot);
  assert.ok(
    render(CombatSprite, { state, actor: 'hero', motion: null }).includes(
      '/weapons/gear-cutter.png',
    ),
  );
  for (const item of g.WEAPONS) {
    const weapon = weaponArtById(item.id);
    assert.ok(weapon.heldLength > 0);
    for (const frame of Object.values(rig.frames)) {
      const transform = heldWeaponTransform(weapon, frame.hand, frame.angle);
      const values = [...transform.matchAll(/-?\d+(?:\.\d+)?/g)].map(
        ([value]) => Number(value),
      );
      const [x, y, degrees, scale, ox, oy] = values;
      const radians = (degrees * Math.PI) / 180;
      const map = ([px, py]) => [
        x +
          scale *
            ((px + ox) * Math.cos(radians) - (py + oy) * Math.sin(radians)),
        y +
          scale *
            ((px + ox) * Math.sin(radians) + (py + oy) * Math.cos(radians)),
      ];
      assert.deepEqual(map(weapon.grip), frame.hand);
      const tip = map(weapon.tip);
      assert.ok(
        Math.abs(Math.hypot(tip[0] - x, tip[1] - y) - weapon.heldLength) <
          0.001,
      );
      assert.ok(
        Math.abs(
          (Math.atan2(tip[1] - y, tip[0] - x) * 180) / Math.PI - frame.angle,
        ) < 0.001,
      );
    }
  }
});

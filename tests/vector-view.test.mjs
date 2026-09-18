import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { VectorEnemy, VectorIcon, VectorPerson, VectorWeapon, enemyShapes } =
  await import('../components/vector-art.tsx');
const { ICON_NAMES } = await import('../game/icon-names.ts');
const { ROOM_BACKGROUNDS } = await import('../game/visual-style.ts');
const { ENEMY_CATALOG, WEAPONS } = await import('./helpers/stage1-engine.mjs');
const render = (c, p) => renderToStaticMarkup(createElement(c, p));
const geometry = (html) => html.replace(/data-[\w-]+="[^"]*"/g, '');
const noRaster = (html) =>
  assert.doesNotMatch(html, /<image|data:image|\.(?:png|jpe?g|webp|gif)\b/i);
test('every enemy, including all legacy save kinds, has its own vector geometry', () => {
  assert.deepEqual(
    Object.keys(enemyShapes).sort(),
    Object.keys(ENEMY_CATALOG).sort(),
  );
  const shapes = Object.keys(ENEMY_CATALOG).map((kind) =>
    render(VectorEnemy, { kind, pose: 'idle' }),
  );
  shapes.forEach(noRaster);
  assert.equal(new Set(shapes.map(geometry)).size, shapes.length);
});
test('held and board weapon share a silhouette but the miniature has fewer drawing elements', () => {
  const shapes = [];
  for (const weapon of WEAPONS) {
    const full = render(VectorWeapon, { id: weapon.id });
    const mini = render(VectorWeapon, { id: weapon.id, mini: true });
    noRaster(full);
    noRaster(mini);
    assert.ok(full.includes(`data-weapon-id="${weapon.id}"`));
    assert.ok(mini.includes(`data-weapon-id="${weapon.id}"`));
    assert.ok(
      (full.match(/<path/g) || []).length > (mini.match(/<path/g) || []).length,
    );
    for (const [, path] of mini.matchAll(/<path d="([^"]+)"/g))
      assert.ok(full.includes(`d="${path}"`));
    shapes.push(geometry(mini));
  }
  assert.equal(new Set(shapes).size, WEAPONS.length);
});
test('all UI symbols and both heroes render without bitmaps and unknown weapon IDs are safe', () => {
  ICON_NAMES.forEach((name) => noRaster(render(VectorIcon, { name })));
  for (const kind of ['wanderer', 'warden', 'vera', 'lev', 'merchant'])
    noRaster(render(VectorPerson, { kind }));
  for (const id of ['toString', '__proto__', 'missing', null]) {
    const svg = render(VectorWeapon, { id });
    assert.match(svg, /data-weapon-id="gear-cutter"/);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});
test('every campaign scene and the office are local, standalone vector documents', () => {
  for (const src of new Set([
    ...ROOM_BACKGROUNDS.map((r) => r.src),
    '/art/vector/office.svg',
  ])) {
    assert.match(src, /^\/art\/vector\/[\w-]+\.svg$/);
    const svg = readFileSync(
      new URL('../public' + src, import.meta.url),
      'utf8',
    );
    assert.match(svg, /<svg[^>]+viewBox="0 0 1000 600"/);
    noRaster(svg);
    assert.doesNotMatch(svg, /<script|<foreignObject|href=/);
  }
});

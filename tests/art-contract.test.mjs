import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EQUIPMENT } from '../game/engine.ts';
const { EquipmentIcon } = await import('../components/equipment.tsx');
const read = (path) => readFileSync(new URL('../' + path, import.meta.url));

test('original visual anchors retain their approved source pixels', () => {
  const { anchors } = JSON.parse(read('docs/visual-assets.json'));
  assert.equal(anchors.length, 4);
  for (const anchor of anchors) {
    const hash = createHash('sha256')
      .update(read(anchor.saved_path))
      .digest('hex');
    assert.equal(
      hash,
      anchor.sha256,
      `Visual anchor changed: ${anchor.saved_path}`,
    );
  }
});

test('every non-weapon item has its own complete, non-overlapping atlas crop', () => {
  const art = JSON.parse(read('game/equipment-art.json'));
  const png = read('public' + art.src);
  assert.equal(png[25], 6, 'Equipment requires native RGBA');
  assert.equal(png.readUInt32BE(16), art.width);
  assert.equal(png.readUInt32BE(20), art.height);
  assert.equal(art.regions.length, 12);
  for (const [i, [x, y, w, h]] of art.regions.entries()) {
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
    assert.ok(x + w <= art.width && y + h <= art.height);
    for (const [a, b, c, d] of art.regions.slice(i + 1))
      assert.ok(
        x + w <= a || a + c <= x || y + h <= b || b + d <= y,
        'Two icons would include pixels from one another',
      );
  }
  const items = EQUIPMENT.filter((item) => item.slot !== 'weapon');
  assert.equal(new Set(items.map((item) => item.icon)).size, items.length);
  for (const item of items) {
    const html = renderToStaticMarkup(
      createElement(EquipmentIcon, { id: item.id }),
    );
    assert.ok(html.includes(art.src));
    assert.ok(!html.includes('NaN') && !html.includes('undefined'));
    const [x, y, w, h] = art.regions[item.icon];
    assert.ok(html.includes(`x="${x}" y="${y}" width="${w}" height="${h}"`));
  }
});

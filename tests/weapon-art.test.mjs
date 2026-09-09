import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WEAPONS } from '../game/engine.ts';

test('each of the five weapons has a distinct transparent PNG and valid measured crop', () => {
  const art = JSON.parse(
    readFileSync(new URL('../game/weapon-art.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    Object.keys(art).sort(),
    WEAPONS.map((weapon) => weapon.id).sort(),
  );
  const hashes = new Set(),
    paths = new Set();
  for (const weapon of WEAPONS) {
    const asset = art[weapon.id];
    paths.add(asset.src);
    assert.equal(asset.src, `/art/pronoun-palace/weapons/${weapon.id}.png`);
    const file = readFileSync(
      new URL(`../public${asset.src}`, import.meta.url),
    );
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(file.readUInt32BE(16), asset.width);
    assert.equal(file.readUInt32BE(20), asset.height);
    assert.equal(
      file[25],
      6,
      'PNG should have native RGBA, not a painted checkerboard',
    );
    const [x, y, width, height] = asset.bounds;
    assert.ok([x, y, width, height].every(Number.isInteger));
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= asset.width && y + height <= asset.height);
    hashes.add(createHash('sha256').update(file).digest('hex'));
  }
  assert.equal(paths.size, 5);
  assert.equal(
    hashes.size,
    5,
    'Different file names must not conceal a reused weapon image',
  );
});

test('each equipped weapon has a distinct miniature with a valid transparent crop', () => {
  const art = JSON.parse(
    readFileSync(new URL('../game/weapon-art.json', import.meta.url), 'utf8'),
  );
  const hashes = new Set();
  for (const weapon of WEAPONS) {
    const full = art[weapon.id];
    const mini = full.miniature;
    assert.equal(
      mini.src,
      `/art/pronoun-palace/weapon-miniatures/${weapon.id}.png`,
    );
    assert.notEqual(mini.src, full.src);
    const file = readFileSync(new URL(`../public${mini.src}`, import.meta.url));
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(file.readUInt32BE(16), mini.width);
    assert.equal(file.readUInt32BE(20), mini.height);
    assert.equal(file[25], 6, 'Miniature must have native RGBA transparency');
    const [x, y, w, h] = mini.bounds;
    assert.ok([x, y, w, h].every(Number.isInteger));
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
    assert.ok(x + w <= mini.width && y + h <= mini.height);
    const hash = createHash('sha256').update(file).digest('hex');
    hashes.add(hash);
    assert.notEqual(
      hash,
      createHash('sha256')
        .update(readFileSync(new URL(`../public${full.src}`, import.meta.url)))
        .digest('hex'),
      'Miniature must be a separate drawing',
    );
  }
  assert.equal(hashes.size, WEAPONS.length);
});

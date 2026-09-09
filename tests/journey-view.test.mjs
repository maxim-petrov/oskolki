import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { Merchant, MerchantArt, ShopPrice } =
  await import('../components/merchant.tsx');
const { JourneyMap, NextStops } = await import('../components/journey-map.tsx');
const { RunSeed } = await import('../components/run-seed.tsx');
const g = await import('./helpers/stage1-engine.mjs');
const { gameSnapshot } = await import('../game/webmcp.ts');
const { merchantGreeting } = await import('../game/merchant.ts');
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));

test('all eleven native images exist, remain unchanged and have the required formats', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../docs/journey-art-prompts.json', import.meta.url)),
  );
  assert.equal(manifest.assets.length, 11);
  const hashes = new Set();
  for (const asset of manifest.assets) {
    const data = readFileSync(
      new URL('../' + asset.saved_path, import.meta.url),
    );
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(data[25], asset.kind === 'sprite' ? 6 : 2);
    assert.deepEqual(
      [data.readUInt32BE(16), data.readUInt32BE(20)],
      asset.dimensions,
    );
    const hash = createHash('sha256').update(data).digest('hex');
    assert.equal(hash, asset.sha256);
    hashes.add(hash);
  }
  assert.equal(hashes.size, 11);
});

test('merchant renders his transparent sprite, dialogue and all conversation choices', () => {
  const text = merchantGreeting(0),
    html = render(Merchant, { text, onTalk() {}, busy: false });
  assert.match(html, /\/art\/pronoun-palace\/merchant.png/);
  assert.ok(html.includes(text));
  assert.match(html, /aria-live="polite"/);
  for (const label of ['Савва', 'Кто ты?', 'Что впереди?', 'Почему скидки?'])
    assert.ok(html.includes(label));
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.equal(
    (
      render(Merchant, { text, onTalk() {}, busy: true }).match(
        /disabled=""/g,
      ) ?? []
    ).length,
    3,
  );
  const sprite = JSON.parse(
    readFileSync(new URL('../game/merchant-art.json', import.meta.url)),
  );
  assert.ok(
    render(MerchantArt).includes(`viewBox="${sprite.bounds.join(' ')}"`),
  );
});

test('sale price renders the base price crossed out and exactly the amount buy charges', () => {
  const s = g.startRun(42);
  s.room = 4;
  s.phase = 'map';
  const shop = g.enterRoom(s, '5-shop').state;
  for (const offer of shop.offers) {
    const html = render(ShopPrice, { offer });
    assert.ok(html.includes(`<b>${offer.cost}</b>`));
    if (offer.discount) {
      assert.ok(html.includes(`−${offer.discount}%`));
      assert.ok(html.includes(`>${offer.baseCost}</s>`));
    } else assert.ok(!html.includes('<s '));
    shop.gold = offer.cost;
    assert.equal(g.buy(shop, offer.id, 0).state.gold, 0);
  }
});

test('rendered map only enables the next rooms and its selected destination button', () => {
  const s = g.startRun(42);
  s.phase = 'map';
  const html = render(JourneyMap, { game: s, busy: false, onEnter() {} });
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(
    buttons.filter((tag) => !/\sdisabled(?:=|\s|>)/.test(tag)).length,
    g.nextRooms(s).length + 1,
  );
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.ok(html.includes('Зал Главного цензора'));
  assert.ok(html.includes('2 · I · Можно идти'));
  assert.ok(html.includes('Ты здесь'));
  assert.ok(html.includes('Идти сюда'));
  assert.ok(html.includes('paper-tunnels.png'));
  assert.ok(html.includes('left:25%') && html.includes('left:75%'));
  const locked = render(JourneyMap, { game: s, busy: true, onEnter() {} });
  assert.equal(
    [...locked.matchAll(/<button\b[^>]*>/g)].filter(
      (m) => !/\sdisabled(?:=|\s|>)/.test(m[0]),
    ).length,
    0,
  );
  const before = JSON.stringify(s);
  render(JourneyMap, {
    game: s,
    busy: false,
    onEnter() {
      throw Error('Render must not enter a room');
    },
  });
  assert.equal(JSON.stringify(s), before);
});

test('reward preview names both next alternatives but cannot skip the reward or enter a room', () => {
  const s = g.startRun();
  s.phase = 'reward';
  const html = render(NextStops, { game: s });
  for (const room of g.nextRooms(s)) assert.ok(html.includes(room.name));
  assert.ok(!html.includes('<button'));
});

test('visible run seed and structured snapshot match the saved unsigned seed including zero', () => {
  for (const seed of [0, 42, 4294967295]) {
    const s = g.startRun(seed),
      html = render(RunSeed, { seed: s.seed });
    assert.ok(html.includes(`<b>${seed}</b>`));
    assert.ok(html.includes('Скопировать seed'));
    assert.equal(gameSnapshot(s, false).seed, seed);
    assert.match(html, /<output/);
  }
});

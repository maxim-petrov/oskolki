import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { ArchiveMechanics, ArchiveEntrance } =
  await import('../components/archive-mechanics.tsx');
const { JourneyMap } = await import('../components/journey-map.tsx');
const { gameSnapshot, gameAction } = await import('../game/webmcp.ts');
const { merchantGreeting } = await import('../game/merchant.ts');
const g = await import('../game/engine.ts');
const render = (C, props) => renderToStaticMarkup(createElement(C, props));
const enter = (room, kind = 'battle') =>
  g.enterRoom(
    {
      ...g.startRun(42),
      phase: 'map',
      room: room - 1,
      path: Array.from(
        { length: room - 1 },
        (_, i) => g.roomsAtDepth(i + 1)[0].name,
      ),
    },
    `${room}-${kind}`,
  ).state;

test('all twelve native archive PNGs have unique, unchanged bytes and mapped sprite silhouettes', () => {
  const m = JSON.parse(
    readFileSync(new URL('../docs/archive-art-prompts.json', import.meta.url)),
  );
  assert.equal(m.assets.length, 12);
  const hashes = new Set();
  for (const a of m.assets) {
    const b = readFileSync(new URL('../' + a.saved_path, import.meta.url));
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(b[25], a.type === 'sprite' ? 6 : 2);
    assert.equal(b.readUInt32BE(16), a.width);
    assert.equal(b.readUInt32BE(20), a.height);
    const hash = createHash('sha256').update(b).digest('hex');
    assert.equal(hash, a.sha256);
    hashes.add(hash);
    assert.ok(a.prompt.length > 100);
    if (a.type === 'sprite') assert.equal(a.display_alpha_threshold, 128);
  }
  assert.equal(hashes.size, 12);
});

test('tide and ink instructions show the real row, deadline, damage and repaired-pump state', () => {
  const s = enter(20, 'boss');
  s.tide.row = 4;
  s.tide.turns = 1;
  s.board[3].ink = true;
  let html = render(ArchiveMechanics, { game: s });
  assert.ok(html.includes('через 1 ход'));
  assert.ok(html.includes('4 урона'));
  assert.ok(html.includes('строкой 5'));
  assert.ok(html.includes('−1 здоровья'));
  assert.ok(html.includes('1/6'));
  s.enemies[0].hp = 54;
  s.flags.push('run:sluice');
  html = render(ArchiveMechanics, { game: s });
  assert.ok(html.includes('4 урона'));
  assert.ok(html.includes('Насос работает'));
  s.tide.cleared = true;
  html = render(ArchiveMechanics, { game: s });
  assert.ok(html.includes('этот прилив безопасен'));
  assert.ok(!html.includes('через 1 ход'));
  assert.equal(render(ArchiveMechanics, { game: g.startRun() }), '');
  assert.equal(render(ArchiveMechanics, { game: enter(17, 'trial') }), '');
  const snapshot = gameSnapshot(s, false);
  assert.equal(snapshot.biome.id, 'archive');
  assert.equal(snapshot.totalRooms, 20);
  assert.equal(snapshot.tide.damage, 4);
  assert.deepEqual(snapshot.tide, { ...s.tide, damage: 4 });
});

test('first boss reward announces the next biome and recovery without restarting or rendering on ordinary rewards', () => {
  const s = enter(10, 'boss');
  s.enemies[0].hp = 1;
  s.energy = 12;
  const won = g.castSkill(s, 'bolt').state,
    before = JSON.stringify(won);
  const html = render(ArchiveEntrance, { game: won });
  assert.ok(html.includes('Затопленный архив'));
  assert.ok(html.includes('ещё 10 комнат'));
  assert.ok(html.includes('снаряжение сохранено'));
  assert.ok(!html.includes('<button'));
  assert.equal(JSON.stringify(won), before);
  assert.equal(render(ArchiveEntrance, { game: { ...won, room: 9 } }), '');
  const old = { ...won, phase: 'victory' };
  assert.equal(render(ArchiveEntrance, { game: old }), '');
});

test('archive map exposes both bosses but enables only the immediate destinations, including crossing the biome boundary', () => {
  for (const room of [10, 11, 16, 19]) {
    const s = {
      ...enter(room, room === 10 ? 'boss' : room === 19 ? 'rest' : 'battle'),
      phase: 'map',
    };
    const html = render(JourneyMap, {
      game: s,
      busy: false,
      onEnter() {
        throw Error('No navigation on render');
      },
    });
    assert.ok(html.includes('Зал Главного цензора'));
    assert.ok(html.includes('Сердце затопленного архива'));
    assert.ok(html.includes('height:1680px'));
    assert.ok(html.includes('Затопленный архив'));
    const tags = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(
      tags.filter((tag) => !/\sdisabled(?:=|\s|>)/.test(tag)).length,
      g.nextRooms(s).length + 1,
    );
  }
});

test('archive shop dialogue and structured pump action use actual new-biome rules', () => {
  assert.match(merchantGreeting(42, true, true), /насосной/);
  assert.match(merchantGreeting(42, true, true), /30 монет/);
  const s = enter(17, 'event');
  s.gold = 30;
  const r = gameAction(s, { action: 'event', id: 'repair' });
  assert.equal(r.state.gold, 0);
  assert.equal(r.state.phase, 'map');
  assert.ok(r.state.flags.includes('run:sluice'));
});

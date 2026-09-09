import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Children, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as g from './helpers/stage2-engine.mjs';
const { JourneyMap } = await import('../components/journey-map.tsx');
const { RewardActions, SealConfirmation, ActiveSeal } =
  await import('../components/journey-rewards.tsx');
const { ArchiveEntrance } = await import('../components/archive-mechanics.tsx');
const { actionSchema, gameAction, gameSnapshot } =
  await import('../game/webmcp.ts');
import { at, clear, finish, sealed } from './helpers/stage2-fixtures.mjs';
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const elements = (node) =>
  !isValidElement(node)
    ? []
    : [node, ...Children.toArray(node.props.children).flatMap(elements)];

test('rendered new map draws exactly saved connections and shows the consequences of a branch without exposing treasure loot', () => {
  for (const s of [
    finish(g.startRun(32)),
    finish(at(2)),
    finish(at(6)),
    finish(at(10)),
  ]) {
    const before = g.copy(s),
      html = render(JourneyMap, {
        game: s,
        busy: false,
        onEnter() {
          throw Error('not during render');
        },
      });
    const edges = [...html.matchAll(/data-from="([^"]+)" data-to="([^"]+)"/g)]
      .map((m) => `${m[1]}:${m[2]}`)
      .sort();
    const expected = s.journey.nodes
      .flatMap((n) => n.next.map((id) => `${n.id}:${id}`))
      .sort();
    assert.deepEqual(edges, expected);
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(
      buttons.filter((tag) => !/\sdisabled(?:=|\s|>)/.test(tag)).length,
      g.nextRooms(s).length + 1,
    );
    if (s.room === 1) assert.match(html, /Затем кладовая/);
    if (s.room === 2) assert.match(html, /Другой путь/);
    assert.deepEqual(s, before);
    for (const n of s.journey.nodes) assert.equal(n.offers, undefined);
  }
});

test('treasure and battle reward controls show prices and invoke the real atomic reward action', () => {
  let s = at(3),
    r;
  const html = render(RewardActions, {
    game: s,
    busy: false,
    act: (x) => (r = x),
  });
  assert.match(html, /20 золота/);
  assert.match(html, /один раз/);
  assert.ok(!html.includes('8 золота'));
  let tree = RewardActions({ game: s, busy: false, act: (x) => (r = x) });
  const reroll = elements(tree).find(
    (n) => n.props.onClick && String(n.props.children).includes('20 золота'),
  );
  reroll.props.onClick();
  assert.equal(r.state.gold, s.gold - 20);
  assert.ok(r.state.treasureRerolled);
  s = clear(g.startRun(8));
  tree = RewardActions({ game: s, busy: false, act: (x) => (r = x) });
  elements(tree)
    .find((n) => n.props.onClick)
    .props.onClick();
  assert.equal(r.state.gold, s.gold + 8);
  assert.equal(r.state.phase, 'map');
  const locked = render(RewardActions, { game: at(3), busy: true, act() {} });
  assert.equal((locked.match(/\sdisabled=""/g) ?? []).length, 2);
});

test('Censor preview explains health cost before healing and an accepted seal remains visible with its drawback', () => {
  const s = clear(at(10));
  s.hp = 5;
  const entrance = render(ArchiveEntrance, { game: s });
  assert.match(entrance, /Сначала выбери печать/);
  assert.ok(!entrance.includes('уже восстановила'));
  for (const offer of g.SEALS) {
    const html = render(SealConfirmation, {
      game: s,
      offer,
      busy: false,
      confirm() {},
    });
    assert.ok(html.includes('Принять печать и её цену'));
    assert.ok(html.includes('до конца спуска'));
    if (offer.id === 'red-line') assert.match(html, /21\/32/);
    const active = render(ActiveSeal, { seal: offer, onDetail() {} });
    assert.ok(active.includes(offer.name));
    assert.ok(active.includes('Цена:'));
  }
  const bad = { ...s, maxHp: 8, hp: 5 };
  assert.match(
    render(SealConfirmation, {
      game: bad,
      offer: g.SEALS[0],
      busy: false,
      confirm() {},
    }),
    /disabled=""/,
  );
  const decline = render(RewardActions, { game: s, busy: false, act() {} });
  assert.match(decline, /Отказаться от печати/);
  assert.ok(!decline.includes('8 золота'));
});

test('structured controls expose connected routes, saved seal, paid reroll, and both indices for atomic Double Edit', () => {
  const s = sealed('double-edit');
  s.focus = 3;
  assert.ok(actionSchema.properties.secondIndex);
  let r = gameAction(s, {
    action: 'cast',
    id: 'edit',
    index: 0,
    secondIndex: 1,
    family: 'shield',
  });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.frames[0].cells, [0, 1]);
  assert.ok(
    gameAction(s, { action: 'cast', id: 'edit', index: 0, family: 'shield' })
      .error,
  );
  assert.ok(
    gameAction(s, {
      action: 'cast',
      id: 'edit',
      index: 0,
      secondIndex: 0,
      family: 'shield',
    }).error,
  );
  assert.throws(() =>
    gameAction(s, { action: 'cast', id: 'edit', index: 0, secondIndex: 40 }),
  );
  const t = at(3);
  r = gameAction(t, { action: 'reroll_treasure' });
  assert.equal(r.state.gold, t.gold - 20);
  const before = g.copy(t),
    snap = gameSnapshot(t, false);
  assert.equal(snap.rulesVersion, 'v0.2-stage3');
  assert.equal(snap.rewardSource, 'treasure');
  assert.equal(snap.canRerollTreasure, true);
  assert.equal(gameSnapshot(s, false).seal, 'double-edit');
  assert.deepEqual(snap.map, g.routeMap(t));
  assert.deepEqual(t, before);
});

test('offers explain missing build dependencies and show permanent skill damage costs without a charge from the finished battle', () => {
  const s = g.startRun(5);
  assert.match(
    g.offerForRun(s, g.itemById('lens')).description,
    /Нужен приём с ценой в здоровье/,
  );
  assert.match(
    g.offerForRun(s, g.itemById('toxin')).description,
    /Нужен источник яда/,
  );
  assert.match(
    g.offerForRun(s, g.itemById('conductor')).description,
    /Нужна пороховая искра/,
  );
  s.skills = ['blood', 'bolt'];
  s.equipment.weapon = 'gear-rusty-dagger';
  s.modifiers = ['bomb'];
  for (const id of ['lens', 'toxin', 'conductor'])
    assert.equal(
      g.offerForRun(s, g.itemById(id)).description,
      g.itemById(id).description,
    );
  const t = sealed('double-edit');
  t.flags.push('turn:rune-armed');
  assert.match(g.itemForRun(t, 'bolt').description, /11 урона/);
  assert.match(g.offerForRun(t, g.itemById('bolt')).description, /9 урона/);
});

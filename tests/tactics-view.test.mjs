import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as g from '../game/engine.ts';
const { TurnBudget } = await import('../components/turn-budget.tsx');
const { MovePreview } = await import('../components/move-preview.tsx');
const { EnemyIntentLabel } = await import('../components/enemy-intent.tsx');
const { JourneyMap } = await import('../components/journey-map.tsx');
const { ItemIcon } = await import('../components/game-panels.tsx');
const { gameSnapshot, gameAction } = await import('../game/webmcp.ts');
const render = (C, props) => renderToStaticMarkup(createElement(C, props));

test('turn UI explains costs, risk relics, locks, warped size and old-save compatibility without changing the run', () => {
  const s = g.startRun(42);
  s.actions = 2;
  let html = render(TurnBudget, { game: s });
  assert.match(html, /Действия: 2 \/ 3/);
  assert.match(html, /Враги отвечают после/);
  assert.match(html, /без совпадения/);
  s.relics = [...g.TACTIC_RELIC_IDS];
  s.boardWarp = { size: 5, expires: 3 };
  s.board = s.board.slice(0, 25);
  s.board[0].locked = { owner: s.enemies[0].id, expires: 2 };
  const before = g.copy(s);
  html = render(TurnBudget, { game: s });
  for (const text of [
    '4+ фишки',
    'Тройки остаются',
    'Заемное время',
    'Железный распорядок',
    'Печати: 1',
    'Поле 5×5',
  ])
    assert.ok(html.includes(text), text);
  assert.deepEqual(s, before);
  assert.match(
    render(TurnBudget, { game: g.startRun(42, g.DEFAULT_BALANCE, 4) }),
    /прежние правила/,
  );
});

test('move preview shows paid setup and remaining budget with no confirmation action', () => {
  const s = g.startRun(42),
    move = { axis: 'row', line: 0, amount: 1 };
  const html = render(MovePreview, { game: s, move });
  assert.match(html, /1 действия · останется 2/);
  assert.doesNotMatch(html, /<button|Сделать сдвиг/);
  assert.match(
    render(MovePreview, { game: s, move: null }),
    /Сдвиги без совпадения тоже платные/,
  );
});

test('all support and board-control intentions have icons and readable explanations', () => {
  for (const kind of [
    'bell',
    'candle',
    'lantern-fish',
    'mirror',
    'librarian',
    'eraser',
    'safe',
  ]) {
    const s = g.startRun(42);
    s.enemies = [
      { ...s.enemies[0], kind, name: g.ENEMY_CATALOG[kind].name },
      { ...s.enemies[0], id: 999, hp: 1, name: 'Раненый союзник' },
    ];
    const html = render(EnemyIntentLabel, { state: s, enemy: s.enemies[0] });
    assert.match(html, /<svg/);
    assert.ok(html.includes(g.intent(s, s.enemies[0]).text));
  }
  const icons = g.TACTIC_RELIC_IDS.map((id) => render(ItemIcon, { id }));
  assert.equal(new Set(icons).size, 3);
  icons.forEach((html) => assert.match(html, /shape-rendering="crispEdges"/));
});

test('public game controls expose AP, match threshold and real hidden routes; unknown doors resolve through normal entry', () => {
  let s = g.startRun(42);
  const first = gameSnapshot(s, false);
  assert.equal(first.rulesVersion, 'v0.3-tactics');
  assert.deepEqual(first.actions, { left: 3, max: 3 });
  assert.equal(first.boardSize, 6);
  assert.equal(first.minimumMatch, 3);
  assert.equal(first.actionRules.setupShiftsAllowed, true);
  s.actions = 1;
  for (const m of gameSnapshot(s, false).validMoves)
    assert.equal(g.shiftCost(s, m.amount), 1);
  const acted = gameAction(s, {
    action: 'shift',
    axis: 'row',
    line: 0,
    amount: 1,
  });
  assert.equal(acted.state.actions, 0);
  assert.equal(acted.state.round, 1);
  s.enemies[0].hp = 0;
  s = g.chooseReward(g.endTurn(s).state, null).state;
  const snapshot = gameSnapshot(s, false);
  assert.ok(snapshot.routes.some((n) => n.kind === 'unknown'));
  for (const n of snapshot.map.flat().filter((n) => n.kind === 'unknown'))
    assert.equal(n.roster, undefined);
  const html = render(JourneyMap, {
    game: s,
    busy: false,
    onEnter() {
      throw Error('no effects while rendering');
    },
  });
  assert.match(html, /Неизвестная комната/);
  assert.match(html, /скрывает содержимое комнаты/);
  const id = snapshot.routes[0].id,
    raw = s.journey.nodes.find((n) => n.id === id);
  const entered = gameAction(s, { action: 'enter_room', id });
  assert.equal(entered.error, undefined);
  assert.equal(entered.state.roomKind, raw.kind);
});

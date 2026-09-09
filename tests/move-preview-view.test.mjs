import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as g from './helpers/stage1-engine.mjs';
const { MovePreview } = await import('../components/move-preview.tsx');
const { EquipmentComparison, EquipmentPanel } =
  await import('../components/equipment.tsx');
const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props));
function bladeMove(s) {
  return g.validMoves(s.board).find((m) => {
    const b = g.shifted(s.board, m.axis, m.line, m.amount);
    return g.groups(b).some((indices) => b[indices[0]].family === 'blade');
  });
}
test('preview UI explains affected targets, consumed block, poison, rune energy and unknown cascades', () => {
  const s = g.startRun(71),
    m = bladeMove(s);
  s.equipment.weapon = 'gear-rusty-dagger';
  s.enemies[0].hp = s.enemies[0].maxHp = 1000;
  s.enemies[0].block = 2;
  const before = g.copy(s),
    p = g.previewMove(s, m.axis, m.line, m.amount);
  const html = render(MovePreview, {
    game: s,
    move: m,
    onConfirm() {},
    onCancel() {},
  });
  assert.ok(html.includes(s.enemies[0].name));
  assert.ok(html.includes(`−${p.targets[0].damage} здоровья`));
  assert.ok(html.includes('−2 блока'));
  assert.ok(html.includes('+2 яда'));
  assert.ok(html.includes('Сделать сдвиг'));
  assert.ok(html.includes('Отмена'));
  assert.ok(html.includes('случайные каскады не показаны'));
  assert.deepEqual(s, before);
  s.equipment.weapon = 'gear-rune-sword';
  const runes = render(MovePreview, {
    game: s,
    move: m,
    onConfirm() {},
    onCancel() {},
  });
  assert.ok(runes.includes('Рунный заряд готов'));
  assert.ok(
    runes.includes(
      `Энергия +${g.previewMove(s, m.axis, m.line, m.amount).energy}`,
    ),
  );
  s.flags.push('turn:rune-armed');
  assert.ok(g.itemForRun(s, 'bolt').description.includes('14 урона'));
});
test('illegal previews cannot confirm; idle and already-used turns show truthful guidance', () => {
  const s = g.startRun();
  const html = render(MovePreview, {
    game: s,
    move: { axis: 'row', line: 0, amount: 0 },
    onConfirm() {},
    onCancel() {},
  });
  assert.match(html, /Выбери сдвиг от 1 до 5/);
  assert.match(html, /<button[^>]*disabled[^>]*>Сделать сдвиг/);
  assert.ok(!html.includes('случайные каскады'));
  s.moved = true;
  const used = render(MovePreview, {
    game: s,
    move: null,
    onConfirm() {},
    onCancel() {},
  });
  assert.ok(used.includes('Сдвиг использован'));
});
test('gear comparison shows offered and current quality independently, including an intentional downgrade', () => {
  const s = g.startRun();
  s.weaponQuality = 2;
  s.offers = [g.weaponOffer('gear-rune-sword', 0)];
  const html = render(EquipmentComparison, { game: s, id: 'gear-rune-sword' });
  assert.ok(html.includes('Качество 2/2'));
  assert.ok(html.includes('Качество 0/2'));
  assert.ok(html.includes('−2 урона, +1 энергия'));
  s.equipment.weapon = 'gear-rune-sword';
  assert.ok(
    render(EquipmentPanel, { game: s, onDetail() {} }).includes('Качество 2/2'),
  );
});

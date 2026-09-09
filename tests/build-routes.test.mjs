import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage1-engine.mjs';

// This policy scores visible first-wave information only. It never executes
// candidate moves or consults RNG. Scores are test heuristics, not player balance.
function chooseVisibleMove(s) {
  const incoming = s.enemies
    .filter((e) => e.hp > 0)
    .reduce((n, e) => {
      const i = g.intent(s, e);
      return n + (['attack', 'pierce'].includes(i.type) ? i.value : 0);
    }, 0);
  return g
    .validMoves(s.board)
    .map((m) => {
      const p = g.previewMove(s, m.axis, m.line, m.amount);
      const damage = p.targets.reduce(
        (sum, e) => sum + e.damage + e.poison * 1.5 + (e.defeated ? 8 : 0),
        0,
      );
      const score =
        damage * 1.4 +
        Math.min(incoming, p.block) * 1.9 +
        p.energy +
        p.focus * 0.3 +
        p.health * 3 +
        (p.tideCleared ? 5 : 0) -
        (p.lethal ? 10000 : 0);
      return { m, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.m;
}
function run(seed, preset, archive = false) {
  let s = g.configureRun(g.startRun(seed), preset);
  const initialWeapon = s.equipment.weapon;
  if (archive) {
    s.phase = 'map';
    s.room = 10;
    s = g.enterRoom(s, '11-battle').state;
  }
  let actions = 0,
    saved = 0;
  const trace = [];
  const accept = (result) => {
    assert.equal(result.error, undefined);
    s = result.state;
  };
  while (!['victory', 'defeat'].includes(s.phase) && actions++ < 400) {
    if (s.phase === 'battle') {
      if (s.potions && s.hp <= s.maxHp - 8) accept(g.consumePotion(s));
      if (!s.moved) {
        const m = chooseVisibleMove(s);
        if (m) accept(g.move(s, m.axis, m.line, m.amount));
      }
      if (s.phase === 'battle' && !s.cast) {
        if (g.canCast(s, 'bolt')) accept(g.castSkill(s, 'bolt'));
        else if (g.canCast(s, 'guard')) accept(g.castSkill(s, 'guard'));
      }
      if (s.phase === 'battle') accept(g.endTurn(s));
    } else if (s.phase === 'reward') {
      const o =
        s.offers.find(
          (o) => o.id === initialWeapon && o.quality > s.weaponQuality,
        ) ??
        s.offers.find((o) =>
          ['relic', 'modifier', 'upgrade'].includes(o.kind),
        ) ??
        s.offers.find((o) => g.equipmentById(o.id)?.slot !== 'weapon');
      accept(g.chooseReward(s, o?.id ?? null, 0));
    } else if (s.phase === 'map') {
      const routes = g.nextRooms(s);
      const next =
        routes.find((r) => r.kind === 'event') ??
        routes.find((r) => r.kind === 'battle') ??
        routes[0];
      assert.ok(next);
      accept(g.enterRoom(s, next.id));
    } else if (s.phase === 'shop') {
      const sharp = s.offers.find(
        (o) => o.id === 'sharpen' && o.cost <= s.gold,
      );
      if (sharp) accept(g.buy(s, sharp.id));
      accept(g.leaveRoom(s));
    } else if (s.phase === 'event') accept(g.eventChoice(s, 'supplies'));
    else if (s.phase === 'rest')
      accept(
        g.rest(
          s,
          s.hp > s.maxHp * 0.75 && g.sharpeningOffer(s) ? 'sharpen' : 'heal',
        ),
      );
    else if (s.phase === 'trial')
      accept(g.tickTrial(g.pauseTrial(s, false).state, 46));
    assert.equal(s.equipment.weapon, initialWeapon);
    assert.ok(g.isSave(s), `${preset}, room ${s.room}, ${s.phase}`);
    assert.ok(s.energy <= g.energyMax(s) && s.focus <= g.focusMax(s));
    trace.push([
      s.room,
      s.round,
      s.phase,
      s.hp,
      s.energy,
      s.focus,
      s.stats.damage,
    ]);
    if (actions % 7 === 0) {
      s = g.loadSave(JSON.parse(JSON.stringify(s)));
      assert.ok(s);
      saved++;
    }
  }
  assert.ok(['victory', 'defeat'].includes(s.phase));
  assert.ok(saved > 0);
  return trace;
}
test('three builds complete deterministic routes from both biome entries with visible-only decisions and save/resume', () => {
  for (const preset of ['poison', 'editor', 'runes'])
    for (const seed of [11, 27])
      for (const archive of [false, true])
        assert.deepEqual(
          run(seed, preset, archive),
          run(seed, preset, archive),
        );
});

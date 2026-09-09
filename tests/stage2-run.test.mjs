import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import { accept, reaches } from './helpers/stage2-fixtures.mjs';

function visibleMove(s) {
  const incoming = s.enemies
    .filter((e) => e.hp > 0)
    .reduce((sum, e) => sum + g.intent(s, e).value, 0);
  return g
    .validMoves(s.board)
    .map((m) => {
      const p = g.previewMove(s, m.axis, m.line, m.amount);
      return {
        m,
        score:
          p.targets.reduce(
            (n, e) => n + e.damage + e.poison + (e.defeated ? 10 : 0),
            0,
          ) +
          Math.min(incoming, p.block) +
          p.energy +
          0.5 * p.focus +
          p.health * 2 +
          (p.tideCleared ? 8 : 0) -
          (p.lethal ? 10000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)[0]?.m;
}
function run(seed, seal, reload) {
  // Deliberately forgiving exposed settings: verifies full flow, not normal balance.
  let s = g.startRun(seed, {
    ...g.DEFAULT_BALANCE,
    health: 160,
    blade: 3,
    enemyPower: 0.2,
  });
  const trace = [],
    rooms = new Set([1]);
  let steps = 0,
    edited = false;
  while (!['victory', 'defeat'].includes(s.phase) && steps++ < 700) {
    if (s.phase === 'battle') {
      if (s.potions && s.hp <= s.maxHp - 8) s = accept(g.consumePotion(s));
      if (!s.moved) {
        const m = visibleMove(s);
        assert.ok(m);
        s = accept(g.move(s, m.axis, m.line, m.amount));
      }
      if (s.phase === 'battle' && !s.cast) {
        if (
          seal === 'double-edit' &&
          s.seal &&
          g.canCast(s, 'edit') &&
          !edited
        ) {
          s = accept(g.castSkill(s, 'edit', 0, 'shield', 35));
          edited = true;
        } else if (g.canCast(s, 'bolt')) s = accept(g.castSkill(s, 'bolt'));
        else if (g.canCast(s, 'guard')) s = accept(g.castSkill(s, 'guard'));
      }
      if (s.phase === 'battle') s = accept(g.endTurn(s));
    } else if (s.phase === 'reward') {
      const offer =
        s.rewardSource === 'seal'
          ? seal
          : (s.offers.find((o) =>
              ['relic', 'upgrade', 'modifier'].includes(o.kind),
            )?.id ??
            s.offers[0]?.id ??
            null);
      s = accept(g.chooseReward(s, offer, 0));
    } else if (s.phase === 'map') {
      let options = g.nextRooms(s);
      if (options.length > 1) {
        // Read only saved visible topology to choose the lane without an elite or timer.
        const stop = s.room + 3;
        const safe = s.journey.nodes.find(
          (n) => n.depth === stop && n.kind === 'battle',
        );
        options = options.filter((n) => reaches(s, n.id, safe.id));
      }
      s = accept(g.enterRoom(s, options[0].id));
      rooms.add(s.room);
    } else if (s.phase === 'shop') {
      const sharp = s.offers.find(
        (o) => o.id === 'sharpen' && o.cost <= s.gold,
      );
      if (sharp) s = accept(g.buy(s, sharp.id));
      s = accept(g.leaveRoom(s));
    } else if (s.phase === 'event') s = accept(g.eventChoice(s, 'supplies'));
    else if (s.phase === 'rest') s = accept(g.rest(s, 'heal'));
    else throw Error(`Unexpected ${s.phase}`);
    assert.ok(g.isSave(s), `room ${s.room}/${s.phase}/${seal}`);
    assert.ok(
      s.hp >= 0 &&
        s.hp <= s.maxHp &&
        s.energy <= g.energyMax(s) &&
        s.focus <= g.focusMax(s),
    );
    if (reload) s = g.loadSave(JSON.parse(JSON.stringify(s)));
    trace.push([
      s.room,
      s.round,
      s.phase,
      s.hp,
      s.gold,
      s.stats.damage,
      s.rng,
      g.copy(s.streams),
    ]);
  }
  assert.equal(
    s.phase,
    'victory',
    `${seal} seed${seed}, room${s.room}, hp${s.hp}`,
  );
  assert.equal(rooms.size, 20);
  assert.ok(s.modified);
  assert.equal(s.seal, seal);
  if (seal === 'double-edit') assert.ok(edited);
  const meta = g.updateMeta(g.copy(g.EMPTY_META), s);
  assert.equal(meta.streak, 0);
  return { s, trace };
}
test('full twenty-room runs reach both bosses with every seal and save/reload reproduces every step', () => {
  for (const seal of g.SEALS.map((o) => o.id)) {
    const uninterrupted = run(17, seal, false),
      resumed = run(17, seal, true);
    assert.deepEqual(resumed, uninterrupted);
  }
});

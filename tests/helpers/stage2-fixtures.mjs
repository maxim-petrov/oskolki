import assert from 'node:assert/strict';
import * as g from '../../game/engine.ts';
export const accept = (r) => {
  assert.equal(r.error, undefined);
  return r.state;
};
export function clear(s) {
  s = g.copy(s);
  s.enemies.forEach((e) => {
    e.hp = 0;
  });
  return accept(g.endTurn(s));
}
export function finish(s) {
  if (s.phase === 'battle') s = clear(s);
  if (s.phase === 'reward') return accept(g.chooseReward(s, null));
  if (s.phase === 'shop') return accept(g.leaveRoom(s));
  if (s.phase === 'rest') return accept(g.rest(s, 'heal'));
  if (s.phase === 'event') return accept(g.eventChoice(s, 'supplies'));
  if (s.phase === 'trial')
    return accept(g.tickTrial(g.pauseTrial(s, false).state, 46));
  return s;
}
export function reaches(s, start, target) {
  if (start === target) return true;
  return s.journey.nodes
    .find((n) => n.id === start)
    .next.some((n) => reaches(s, n, target));
}
// Setup uses resolved battles, not a balance simulation. All navigation/rewards
// still pass through production actions and every room must remain reloadable.
export function at(depth, kind, seed = 42) {
  let s = g.startRun(seed);
  const goal = s.journey.nodes.find(
    (n) => n.depth === depth && (!kind || n.kind === kind),
  );
  assert.ok(goal);
  while (s.room < depth) {
    s = finish(s);
    assert.ok(g.isSave(s), `save after ${s.room}/${s.phase}`);
    s = accept(
      g.enterRoom(s, g.nextRooms(s).find((n) => reaches(s, n.id, goal.id)).id),
    );
    assert.ok(g.isSave(s), `save at ${s.room}/${s.phase}`);
  }
  return s;
}
export function sealed(id) {
  const reward = clear(at(10));
  const selected = accept(g.chooseReward(reward, id));
  return accept(g.enterRoom(selected, g.nextRooms(selected)[0].id));
}
const fixtures = new Map();
export function matchFixture(family = 'blade', count = 3) {
  const key = `${family}:${count}`;
  if (!fixtures.has(key)) {
    outer: for (let seed = 1; seed < 1000; seed++) {
      const s = g.startRun(seed);
      for (const m of g.validMoves(s.board)) {
        const board = g.shifted(s.board, m.axis, m.line, m.amount),
          groups = g.groups(board);
        if (
          groups.length === 1 &&
          groups[0].length === count &&
          board[groups[0][0]].family === family
        ) {
          fixtures.set(key, { board: s.board, m });
          break outer;
        }
      }
    }
  }
  assert.ok(fixtures.has(key));
  return g.copy(fixtures.get(key));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../game/engine.ts';
import { motionFor, poseFor, impactFor } from '../game/motion.ts';

test('attack anticipation keeps the target alive, impact shows damage and death', () => {
  const s = g.startRun();
  s.energy = 6;
  s.skills = ['pierce'];
  s.focus = 3;
  s.enemies[0].hp = 8;
  const r = g.castSkill(s, 'pierce');
  const f = r.frames[0],
    enemy = s.enemies[0].id;
  assert.equal(f.cue.actor, 'hero');
  assert.equal(f.cue.type, 'attack');
  const windup = motionFor(s, f, 1, 600);
  assert.equal(poseFor(s, windup, 'hero'), 'windup');
  assert.equal(poseFor(s, windup, enemy), 'idle');
  assert.equal(impactFor(windup, enemy).damage, 0);
  const impact = { ...windup, stage: 'impact' };
  assert.equal(poseFor(f.state, impact, 'hero'), 'strike');
  assert.equal(poseFor(f.state, impact, enemy), 'death');
  assert.equal(impactFor(impact, enemy).damage, 8);
  assert.equal(r.state.phase, 'reward');
});
test('a fully blocked enemy strike produces a guard reaction and no damage number', () => {
  const s = g.startRun();
  s.block = 10;
  const r = g.endTurn(s),
    f = r.frames[0];
  assert.equal(f.cue.actor, s.enemies[0].id);
  assert.equal(f.cue.target, 'hero');
  const impact = { ...motionFor(s, f, 1, 600), stage: 'impact' };
  assert.equal(impactFor(impact, 'hero').damage, 0);
  assert.equal(impactFor(impact, 'hero').blocked, 6);
  assert.equal(poseFor(f.state, impact, 'hero'), 'guard');
});
test('healing and lethal poison produce explicit playback events', () => {
  const s = g.startRun();
  s.hp = 30;
  const potion = g.consumePotion(s);
  assert.equal(potion.frames[0].cue.type, 'heal');
  const poison = g.startRun();
  poison.hp = 1;
  poison.heroPoison = 2;
  const r = g.endTurn(poison);
  assert.equal(r.state.phase, 'defeat');
  assert.equal(r.frames.length, 1);
  assert.equal(r.frames[0].cue.type, 'poison');
  assert.equal(poison.hp, 1);
});

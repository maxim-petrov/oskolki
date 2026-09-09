import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './helpers/stage1-engine.mjs';
import { motionFor, poseFor, impactFor, bossShakeFor } from '../game/motion.ts';
import { startRun } from '../game/engine.ts';

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

function bossResponse(
  kind = 'censor',
  { damage = 8, block = 0, hp = 80, round = 3, poison = 0 } = {},
) {
  const s = startRun(42);
  s.maxHp = 80;
  s.hp = hp;
  s.block = block;
  s.round = round;
  Object.assign(s.enemies[0], { kind, damage, hp: 80, maxHp: 80, poison });
  const untouched = g.copy(s);
  const response = g.endTurn(s);
  let previous = s;
  const beats = response.frames.map((frame, i) => {
    const beat = motionFor(previous, frame, i + 1, 600);
    previous = frame.state;
    return beat;
  });
  assert.deepEqual(s, untouched);
  return { s, response, beats };
}

test('all bosses shake on strong impacts, with a heavier tier and no extra combat changes', () => {
  for (const kind of ['boss', 'censor', 'tide-keeper', 'redactor']) {
    const { beats } = bossResponse(kind);
    const beat = beats.find((b) => b.cue.type === 'attack');
    assert.ok(beat, kind);
    const untouched = structuredClone(beat);
    assert.equal(bossShakeFor(beat), null, 'no shake during anticipation');
    assert.deepEqual(bossShakeFor({ ...beat, stage: 'impact' }), {
      pixels: 8,
      duration: 320,
    });
    assert.deepEqual(bossShakeFor({ ...beat, stage: 'recovery' }), {
      pixels: 8,
      duration: 320,
    });
    assert.deepEqual(
      beat,
      untouched,
      'feedback does not change frames, resources or RNG',
    );
  }
  const strong = bossResponse('censor', { damage: 16 }).beats[0];
  assert.equal(bossShakeFor({ ...strong, stage: 'impact' }).pixels, 12);
  assert.equal(
    bossShakeFor({ ...strong, stage: 'impact', duration: 220 }).duration,
    143,
  );
});

test('fully blocked and lethal boss strikes still shake; weak hits and poison kills do not', () => {
  const guarded = bossResponse('censor', { block: 99 }).beats[0];
  const impact = { ...guarded, stage: 'impact' };
  assert.equal(impactFor(impact, 'hero').damage, 0);
  assert.equal(bossShakeFor(impact).pixels, 8);
  const lethal = bossResponse('censor', { hp: 1 });
  assert.equal(lethal.response.state.phase, 'defeat');
  assert.equal(bossShakeFor({ ...lethal.beats[0], stage: 'impact' }).pixels, 8);
  const weak = bossResponse('censor', { damage: 3 }).beats[0];
  assert.equal(bossShakeFor({ ...weak, stage: 'impact' }), null);
  const cancelled = bossResponse('censor', { poison: 100 });
  assert.ok(cancelled.beats.length);
  assert.ok(
    cancelled.beats.every(
      (b) => bossShakeFor({ ...b, stage: 'impact' }) === null,
    ),
  );
});

test('ordinary enemies, preparation and status effects cannot trigger whole-screen shake', () => {
  for (const [kind, options] of [
    ['raider', { damage: 30 }],
    ['censor', { round: 2 }],
    ['tide-keeper', { round: 1 }],
  ]) {
    for (const beat of bossResponse(kind, options).beats)
      assert.equal(bossShakeFor({ ...beat, stage: 'impact' }), null);
  }
  assert.equal(bossShakeFor(null), null);
});

test('boss shake uses strike strength, not an earlier relic payment or the remaining health', () => {
  const s = startRun(42);
  s.relics = ['borrowed-time'];
  s.round = 3;
  Object.assign(s.enemies[0], { kind: 'censor', hp: 80, maxHp: 80, damage: 3 });
  const frame = g.endTurn(s).frames.find((f) => f.cue.type === 'attack');
  const impact = { ...motionFor(s, frame, 1, 600), stage: 'impact' };
  assert.equal(impactFor(impact, 'hero').damage, 11);
  assert.equal(impact.cue.strength, 9);
  assert.equal(bossShakeFor(impact), null);
});

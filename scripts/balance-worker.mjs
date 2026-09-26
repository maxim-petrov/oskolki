// Worker for scripts/balance.mjs: plays batches of runs and lab fights.
import { parentPort, workerData } from 'node:worker_threads';
import { labFight, simRun } from '../game/balance/lab.ts';
import { eventTrial } from '../game/balance/trials.ts';

// A what-if patch edits the content before anything is played.
if (workerData?.patch) await import(workerData.patch);

/** Runs keep only what the report reads; snapshots only when asked. */
function run(spec) {
  const r = simRun(spec);
  if (!spec.snapshots) delete r.snapshots;
  if (spec.lite) {
    delete r.fights;
    delete r.shops;
    delete r.events;
  }
  return r;
}

function fight(spec) {
  const f = labFight(spec);
  return {
    won: f.won,
    dead: f.dead,
    moves: f.moves,
    enemyActs: f.enemyActs,
    hpBefore: f.hpBefore,
    hpLost: f.hpLost,
    damage: f.damage,
    maxHit: f.maxHit,
    maxMult: f.maxMult,
    hurtBy: f.hurtBy,
    stuck: f.stuck,
    timeout: f.timeout,
    violations: f.violations,
  };
}

const FNS = { run, fight, event: eventTrial };

parentPort.on('message', ({ id, fn, specs }) => {
  try {
    parentPort.postMessage({ id, out: specs.map((s) => FNS[fn](s)) });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err?.stack ?? err) });
  }
});

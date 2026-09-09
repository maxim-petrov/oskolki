// Freeze the v0.2 behaviour exercised by the historical regression suites.
export * from '../../game/engine.ts';
import { startRun as start } from '../../game/engine.ts';
export const startRun = (seed, balance, version = 4) =>
  start(seed, balance, version);

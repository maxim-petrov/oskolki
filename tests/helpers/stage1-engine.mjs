export * from '../../game/engine.ts';
import { startRun as start } from '../../game/engine.ts';
export const startRun = (seed, balance) => start(seed, balance, 2);

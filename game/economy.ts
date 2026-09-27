import type { RunState } from './types.ts';

/**
 * Coins are short and the wallet is small, as in Isaac: it holds at most MAX_COINS, and coins beyond
 * it are lost. Every coin the hero gains or loses goes through here.
 */
export const MAX_COINS = 99;

/** Adds coins up to the wallet's top; returns what fit (only that counts as earned). */
export function gainCoins(run: RunState, n: number): number {
  const want = Math.max(0, Math.round(n));
  const got = Math.min(want, Math.max(0, MAX_COINS - run.hero.coins));
  run.hero.coins += got;
  run.stats.coinsEarned += got;
  run.stats.coinsLost = (run.stats.coinsLost ?? 0) + (want - got);
  return got;
}

/** Takes coins (a thief, a cost): never below zero; returns what was taken. */
export function loseCoins(run: RunState, n: number): number {
  const lost = Math.min(run.hero.coins, Math.max(0, Math.round(n)));
  run.hero.coins -= lost;
  return lost;
}

/** Prices at the till grow from act to act, so coins keep their weight to the end of a shift. */
export const PRICE_ACT = [1, 1.15, 1.3, 1.45];

export function priceScale(run: RunState): number {
  return PRICE_ACT[Math.min(run.act, PRICE_ACT.length - 1)];
}

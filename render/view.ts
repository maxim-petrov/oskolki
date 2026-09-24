/**
 * Viewport and layout. The picture is always drawn at an internal resolution and scaled by a
 * whole number, so pixels stay square. The internal size follows the screen:
 *
 * - wide (landscape): ~640×360 on 16:9 (×3 at 1080p, ×4 at 1440p), ~512×384 on an iPad;
 *   stage on top, board under it in the middle, panels on both sides.
 * - tall (portrait): ~270–300 wide on phones, ~512 on tablets; stage on top, tally strip,
 *   board the full width, then a bar with the skill and pockets.
 *
 * Every screen reads positions from `L` (recomputed on resize) instead of constants.
 */

export type Mode = 'wide' | 'tall';

/** Stage geometry is the same everywhere: a low room with the feet line 172 px from its top. */
export const STAGE_FEET = 172;
export const STAGE_CEIL = 22;
/** Full stage height: ceiling strip, 150 px of wall, a floor strip. */
export const STAGE_H = 196;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  mode: Mode;
  w: number;
  h: number;
  /** Device pixels per internal pixel. */
  scale: number;
  /** Touch screen (bigger targets, long-press tips). */
  touch: boolean;
  /** Top bar with health, coins, act, buttons. */
  top: Rect;
  /** Where the stage buffer is drawn on screen (its height may be cropped from the top). */
  stage: Rect;
  /** Rows of the stage buffer cut from its top on short screens. */
  stageCrop: number;
  /** Board tiles: size and the top-left corner of the 6×6 grid. */
  tile: number;
  board: Rect;
  /** The move's tally (damage × mult). */
  tally: Rect;
  /** Skill, pockets, relics. */
  side: Rect;
  /** Second side panel (wide mode only; empty rect otherwise). */
  side2: Rect;
  /** Bottom bar (tall mode). */
  bottom: Rect;
}

export const L: Layout = {
  mode: 'wide',
  w: 640,
  h: 360,
  scale: 1,
  touch: false,
  top: { x: 0, y: 0, w: 640, h: 18 },
  stage: { x: 0, y: 0, w: 640, h: STAGE_H },
  stageCrop: 0,
  tile: 26,
  board: { x: 242, y: 190, w: 156, h: 156 },
  tally: { x: 8, y: 200, w: 220, h: 60 },
  side: { x: 412, y: 200, w: 220, h: 150 },
  side2: { x: 8, y: 270, w: 220, h: 80 },
  bottom: { x: 0, y: 360, w: 640, h: 0 },
};

/** Live internal size (kept as plain exports for older modules). */
export let VW = 640;
export let VH = 360;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Picks the internal resolution for a screen of devW×devH device pixels. */
export function pickResolution(devW: number, devH: number): { w: number; h: number; scale: number; mode: Mode } {
  if (devW >= devH) {
    const scale = Math.max(1, Math.min(Math.floor(devH / 340), Math.floor(devW / 500)));
    return { mode: 'wide', scale, w: clamp(Math.floor(devW / scale), 480, 800), h: clamp(Math.floor(devH / scale), 320, 450) };
  }
  const scale = Math.max(1, Math.min(Math.round(devW / 280), Math.floor(devH / 560)));
  return { mode: 'tall', scale, w: clamp(Math.floor(devW / scale), 216, 520), h: clamp(Math.floor(devH / scale), 400, 760) };
}

/** Recomputes the layout for an internal size. */
export function applyLayout(w: number, h: number, scale: number, mode: Mode, touch: boolean) {
  VW = w;
  VH = h;
  L.w = w;
  L.h = h;
  L.scale = scale;
  L.mode = mode;
  L.touch = touch;
  if (mode === 'wide') wide(w, h);
  else tall(w, h);
}

function wide(w: number, h: number) {
  L.top = { x: 0, y: 0, w, h: 18 };
  // The board sits under the stage, overlapping its floor strip like a desk in front of the room.
  const boardTop = 188;
  const frame = 7;
  const tile = clamp(Math.floor((h - boardTop - frame * 2 - 12) / 6), 22, 32);
  const bw = tile * 6;
  const bx = Math.round((w - bw) / 2);
  const by = h - frame - bw - 4;
  L.tile = tile;
  L.board = { x: bx, y: by, w: bw, h: bw };
  L.stageCrop = 0;
  L.stage = { x: 0, y: 0, w, h: STAGE_H };
  const sideW = bx - frame - 12;
  L.tally = { x: 6, y: by - 2, w: sideW, h: 64 };
  L.side2 = { x: 6, y: by + 66, w: sideW, h: h - by - 70 };
  L.side = { x: bx + bw + frame + 6, y: by - 2, w: w - (bx + bw + frame + 6) - 6, h: h - by - 2 };
  L.bottom = { x: 0, y: h, w, h: 0 };
}

function tall(w: number, h: number) {
  const topH = 18;
  const tallyH = 26;
  const bottomH = clamp(Math.round(h * 0.1), 44, 64);
  const queue = 11;
  const frame = 7;
  let tile = clamp(Math.floor((w - frame * 2 - 4) / 6), 26, 52);
  // Keep at least 140 px of stage (the hero is 96 px tall): shrink the tiles if the screen is short.
  const stageMin = 140;
  const fits = (t: number) => h - (topH + tallyH + queue + t * 6 + frame * 2 + bottomH) >= stageMin;
  while (tile > 22 && !fits(tile)) tile--;
  const bw = tile * 6;
  const stageH = clamp(h - (topH + tallyH + queue + bw + frame * 2 + bottomH), stageMin, STAGE_H);
  const spare = h - (topH + stageH + tallyH + queue + bw + frame * 2 + bottomH);
  L.top = { x: 0, y: 0, w, h: topH };
  L.stageCrop = STAGE_H - stageH;
  L.stage = { x: 0, y: topH, w, h: stageH };
  const tallyY = topH + stageH + Math.floor(spare / 3);
  L.tally = { x: 4, y: tallyY, w: w - 8, h: tallyH };
  const by = tallyY + tallyH + queue + frame;
  L.tile = tile;
  L.board = { x: Math.round((w - bw) / 2), y: by, w: bw, h: bw };
  const bottomY = by + bw + frame + Math.floor(spare / 3);
  L.bottom = { x: 0, y: bottomY, w, h: h - bottomY };
  L.side = L.bottom;
  L.side2 = { x: 0, y: h, w: 0, h: 0 };
}

applyLayout(640, 360, 1, 'wide', false);

'use client';
import { useEffect, useRef } from 'react';
import type { Finish } from '@/game/types';
import { CARD_H, CARD_W, drawCard } from '@/render/cardview';
import { Particles } from '@/render/particles';
import { frameNames, getFrame, hasSprite, type Canvas, type Frame } from '@/render/sprite';
import { Stage, type RoomId } from '@/render/stage';
import { StageRenderer } from '@/render/stagedraw';

/**
 * Previews for the dev panel, drawn by the game itself: sprites from the registry (trimmed to
 * their opaque pixels, integer-scaled), real card badges, and rooms rendered through the stage
 * renderer with their lights.
 */

export interface Box {
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const trims = new WeakMap<Frame, Rect>();

/** The frame's opaque bounds (sprites carry padding around the figure). */
function trim(f: Frame): Rect {
  let r = trims.get(f);
  if (r) return r;
  r = { x: 0, y: 0, w: f.w, h: f.h };
  try {
    const ctx = (f.canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D | null;
    const data = ctx?.getImageData(0, 0, f.w, f.h).data;
    if (data) {
      let x0 = f.w;
      let y0 = f.h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (data[(y * f.w + x) * 4 + 3] > 0) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (x1 >= x0) r = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  } catch {
    /* unreadable canvas: keep the whole frame */
  }
  trims.set(f, r);
  return r;
}

/** Whole pixels when the sprite fits (up to `max`), a smooth shrink when it does not. */
function fit(w: number, h: number, box: Box, max: number) {
  const s = Math.min(box.w / w, box.h / h);
  return s >= 1 ? Math.min(max, Math.floor(s)) : s;
}

export function Sprite({
  id,
  frame,
  box,
  scale,
  max = 3,
  crop,
  dim,
}: {
  id: string;
  frame?: string;
  /** Fit into this box (CSS px) at the largest whole scale. */
  box?: Box;
  scale?: number;
  max?: number;
  /** Keep only the top part of the figure (a portrait), in sprite pixels from the top of the trim. */
  crop?: number;
  dim?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const names = hasSprite(id) ? frameNames(id) : [];
  const name = frame && names.includes(frame) ? frame : names[0];
  const f = name ? getFrame(id, name) : null;
  const t = f ? trim(f) : { x: 0, y: 0, w: 16, h: 16 };
  const src = crop ? { ...t, h: Math.min(t.h, crop) } : t;
  const k = scale ?? (box ? fit(src.w, src.h, box, max) : 2);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!f) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(f.canvas as CanvasImageSource, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);
  }, [f, src.x, src.y, src.w, src.h]);
  return (
    <canvas
      ref={ref}
      width={src.w}
      height={src.h}
      className={`px${k < 1 ? ' soft' : ''}${dim ? ' dim' : ''}`}
      style={{ width: Math.max(1, Math.round(src.w * k)), height: Math.max(1, Math.round(src.h * k)) }}
    />
  );
}

/** A deck card exactly as the game draws it (the laminated badge). */
export function CardBadge({ card, scale = 2 }: { card: { id: string; up?: boolean; finish?: Finish }; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = CARD_W + 3;
  const h = CARD_H + 4;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    drawCard(ctx, { id: card.id, up: !!card.up, finish: card.finish }, 0, 0, { t: 0 });
  }, [card.id, card.up, card.finish]);
  return <canvas ref={ref} width={w} height={h} className="px" style={{ width: w * scale, height: h * scale }} />;
}

const rooms = new Map<string, Canvas>();

/** A room rendered once through the stage renderer (lit), then cached. */
function roomCanvas(room: string, dark: boolean): Canvas | null {
  const key = `${room}:${dark}`;
  const hit = rooms.get(key);
  if (hit) return hit;
  try {
    const stage = new Stage(room as RoomId, dark, 640, 7);
    stage.cam = 0;
    const r = new StageRenderer(640);
    r.render(stage, 0.6, new Particles(), () => {}, [], 0.5);
    rooms.set(key, r.canvas);
    return r.canvas;
  } catch {
    return null;
  }
}

export function RoomThumb({ room, dark = true, width = 200 }: { room: string; dark?: boolean; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    const src = roomCanvas(room, dark);
    if (!c || !ctx || !src) return;
    ctx.drawImage(src as CanvasImageSource, 0, 0);
  }, [room, dark]);
  return <canvas ref={ref} width={640} height={196} className="px soft" style={{ width, height: Math.round((width * 196) / 640) }} />;
}

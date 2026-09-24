import { drawVignette } from './fx.ts';
import { LIGHT_STYLE, Lighting, type Light } from './lighting.ts';
import type { Particles } from './particles.ts';
import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';
import type { Stage } from './stage.ts';
import { STAGE_H } from './view.ts';

/**
 * Draws a stage through its own buffer: room, particles, actors, the stepped light map,
 * glows and the vignette. Used by the office, the title and the intro (a shift has its own copy
 * with fight lights).
 */
export class StageRenderer {
  canvas: Canvas;
  ctx: Ctx2D;
  lighting: Lighting;
  w: number;
  h: number;

  constructor(w: number, h = STAGE_H) {
    this.w = w;
    this.h = h;
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas);
    this.lighting = new Lighting(w, h);
  }

  render(stage: Stage, t: number, ps: Particles, actors: (ctx: Ctx2D) => void, extra: Light[] = [], vignette = 0.8) {
    const b = this.ctx;
    stage.drawBack(b, this.w);
    ps.draw(b, 'back', false);
    actors(b);
    ps.draw(b, 'mid', false);
    stage.drawFront(b, this.w);
    ps.draw(b, 'front', false);
    this.lighting.ambient = stage.ambient;
    const lights = stage.viewLights();
    this.lighting.lights = lights;
    this.lighting.compose(t, extra.map((l) => ({ ...l, x: l.x - stage.cam, intensity: l.intensity * (1 - stage.blackout * 0.9) })));
    stage.syncLights(lights);
    this.lighting.apply(b, LIGHT_STYLE.bloom);
    ps.draw(b, 'back', true);
    ps.draw(b, 'mid', true);
    for (const g of stage.glows()) {
      if (g.k < 0.05) continue;
      b.globalCompositeOperation = 'lighter';
      b.globalAlpha = Math.min(1, g.k);
      b.fillStyle = g.color;
      b.fillRect(g.x - 1, g.y - 1, 3, 3);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
    }
    if (vignette > 0) drawVignette(b, 0, 0, this.w, this.h, vignette * LIGHT_STYLE.vignette);
  }

  /** Blit to the screen; `crop` rows are cut from the top of the buffer. */
  blit(ctx: Ctx2D, x: number, y: number, h = this.h, crop = 0) {
    ctx.drawImage(this.canvas as CanvasImageSource, 0, crop, this.w, h, x, y, this.w, h);
  }
}

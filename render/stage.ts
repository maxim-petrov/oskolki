import type { Light } from './lighting.ts';
import { hex } from './palette.ts';
import { Particles, rand } from './particles.ts';
import { ctx2d, draw, flipped, getFrame, hasSprite, makeCanvas, type Canvas, type Ctx2D } from './sprite.ts';
import { STAGE_CEIL, STAGE_FEET, STAGE_H } from './view.ts';

/**
 * The stage: a low office room built from the open-space kit (render/art/env-openspace.ts).
 * Feet stand on y = 172, the suspended ceiling hangs 150 px above them. The room is composed
 * for a canonical 640 px width and centred in wider worlds; narrow screens see its middle.
 * The first act is the same office on its dark side: most panels off, some flickering,
 * red emergency lamps, dead monitors, paper everywhere. No windows anywhere in it.
 */

export type RoomId =
  | 'openspace'
  | 'copyroom'
  | 'storage'
  | 'breakroom'
  | 'corridor'
  | 'glass'
  | 'archive'
  | 'hub'
  | 'flooded'
  | 'boiler'
  | 'directorate'
  | 'ar_hall'
  | 'ar_reading'
  | 'ar_pump'
  | 'ar_vault'
  | 'di_reception'
  | 'di_meeting'
  | 'di_library'
  | 'di_boss'
  | 'bo_furnace'
  | 'bo_lockers'
  | 'bo_valves'
  | 'bo_mirrors';

/** Where things stand in the office hub (world x). */
export const HUB_W = 1920;
export const HUB_SPOTS = {
  elevator: 80,
  board: 236,
  desk: 440,
  /** Two rows of cubicles: four next to the intern, two past the kitchen corner. */
  cubicles: 600,
  cubiclesB: 1200,
  cooler: 980,
  copier: 1090,
  glass: 1470,
  vending: 1660,
  archive: 1820,
};

/** Locations of the first act, in the order the map looks index them. */
export const ACT1_ROOMS: RoomId[] = ['openspace', 'copyroom', 'storage', 'breakroom', 'corridor'];

interface Prop {
  id: string;
  x: number;
  y: number;
  frame?: string;
  flip?: boolean;
  /** Drawn in front of the actors. */
  front?: boolean;
  /** Animated: frames cycle at fps, or follow a light's flicker (on / flicker / off). */
  frames?: string[];
  fps?: number;
  light?: number;
}

type EmitterKind = 'dust' | 'paper' | 'drip' | 'steam' | 'embers' | 'smoke' | 'mist';

interface Emitter {
  kind: EmitterKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rate: number;
  acc: number;
}

interface RoomDef {
  wall: string;
  /** Ceiling strip and floor tiles (the open-space ones unless a kit brings its own). */
  ceil?: string;
  floor?: string;
  ambient: string;
  props: Prop[];
  lights: Light[];
  emitters: Omit<Emitter, 'acc'>[];
  /** Water surface (y on the stage) for the flooded archive. */
  water?: number;
}

const F = STAGE_FEET;
const light = (x: number, y: number, r: number, color: string, intensity: number, flicker: Light['flicker'] = 'none', squash = 1): Light => ({
  x,
  y,
  r,
  color,
  intensity,
  flicker,
  squash,
  seed: x * 0.37 + y,
});

/** Ceiling panels every 224 px: lit in the office, mostly dead on the dark side. */
function ceiling(props: Prop[], lights: Light[], worldW: number, dark: boolean, seed: number) {
  const n = Math.max(1, Math.round(worldW / 224));
  const step = worldW / n;
  for (let k = 0; k < n; k++) {
    const x = Math.round((step * k + step / 2) / 32) * 32;
    if (!dark) {
      lights.push(light(x, 14, 170, '#dde6f2', 0.62, 'none', 0.7));
      props.push({ id: 'os_ceiling_light', x, y: 6, frame: 'on' });
      continue;
    }
    // Dark side: one panel in three flickers, the rest are dead (a dead panel keeps no light).
    const roll = (seed * 7 + k * 13) % 5;
    if (roll === 0 || roll === 3) {
      lights.push(light(x, 14, 150, '#b9c8ff', 0.58, 'fluor', 0.7));
      props.push({ id: 'os_ceiling_light', x, y: 6, frames: ['on', 'flicker', 'off'], light: lights.length - 1 });
    } else props.push({ id: 'os_ceiling_light', x, y: 6, frame: 'off' });
  }
}

function emergency(props: Prop[], lights: Light[], x: number) {
  props.push({ id: 'os_emergency', x, y: 36, frame: 'on' });
  lights.push(light(x, 40, 120, '#ff3b3b', 0.5, 'pulse', 0.9));
}

function crt(lights: Light[], x: number, y: number, dark: boolean) {
  lights.push(light(x, y, dark ? 46 : 30, '#6cf08a', dark ? 0.55 : 0.35, 'none'));
}

function room(id: RoomId, dark: boolean, worldW: number, seed: number): RoomDef {
  const props: Prop[] = [];
  const lights: Light[] = [];
  const emitters: Omit<Emitter, 'acc'>[] = [];
  const o = Math.round((worldW - 640) / 2);
  const P = (p: Prop) => props.push({ ...p, x: p.x + o });
  const dust = () => emitters.push({ kind: 'dust', x: 0, y: 60, w: worldW, h: 100, rate: dark ? 2.5 : 1.5 });
  const paper = (rate = 0.8) => emitters.push({ kind: 'paper', x: 0, y: STAGE_CEIL + 2, w: worldW, h: 4, rate });
  let wall = 'os_wall';
  let ceil: string | undefined;
  let floor: string | undefined;
  let water: number | undefined;
  let ambient = dark ? '#262c3a' : '#8e98a6';
  const kit = id.startsWith('ar_') || id.startsWith('di_') || id.startsWith('bo_');
  if (!kit) ceiling(props, lights, worldW, dark, seed);
  /** A lamp prop whose frames follow its light (on / flicker / off). */
  const lamp = (sprite: string, x: number, y: number, lx: number, ly: number, r: number, color: string, k: number, flicker: Light['flicker'], frames = ['on', 'flicker', 'off']) => {
    lights.push(light(x + o + lx, ly, r, color, k, flicker));
    props.push({ id: sprite, x: x + o, y, frames, light: lights.length - 1 });
  };
  const glow = (x: number, y: number, r: number, color: string, k: number, flicker: Light['flicker'] = 'none') => lights.push(light(x + o, y, r, color, k, flicker));
  switch (id) {
    // ── Act 2 · the flooded archive (env-archive2.ts) ──
    case 'ar_hall':
    case 'ar_reading':
    case 'ar_pump':
    case 'ar_vault': {
      ceil = 'ar2_ceiling';
      floor = 'ar2_floor';
      wall = id === 'ar_pump' || id === 'ar_vault' ? 'ar2_wall_b' : 'ar2_wall';
      ambient = '#15262c';
      water = F + 4;
      const hang = (x: number, off = false) => lamp('ar2_lamp_hang', x, 20, 0, 50, 140, '#ffc47a', off ? 0 : 0.85, off ? 'none' : 'candle', off ? ['off', 'off', 'off'] : ['on', 'on', 'off']);
      const drip = (x: number) => {
        P({ id: 'ar2_drip', x, y: 8, frames: ['drip0', 'drip1', 'drip2'], fps: 3 });
        emitters.push({ kind: 'drip', x: x + o - 2, y: 40, w: 4, h: 1, rate: 1.4 });
      };
      if (id === 'ar_hall') {
        P({ id: 'ar2_shelf_tall', x: 36, y: F });
        P({ id: 'ar2_shelf', x: 128, y: F });
        hang(240);
        P({ id: 'ar2_boxes', x: 250, y: F });
        drip(320);
        P({ id: 'ar2_bucket', x: 320, y: F, frames: ['idle0', 'idle1', 'idle2'], fps: 4 });
        P({ id: 'ar2_boat', x: 340, y: F + 13, frames: ['idle0', 'idle1'], fps: 1.2 });
        P({ id: 'ar2_cage', x: 430, y: F });
        P({ id: 'ar2_papers', x: 470, y: F + 18 });
        P({ id: 'ar2_shelf', x: 574, y: F, flip: true });
      } else if (id === 'ar_reading') {
        P({ id: 'ar2_cardindex', x: 46, y: F, frames: ['idle0', 'idle1'], fps: 3 });
        P({ id: 'ar2_clock', x: 124, y: 64 });
        hang(150, true);
        P({ id: 'ar2_papers', x: 150, y: F + 18 });
        P({ id: 'ar2_desk', x: 300, y: F });
        lamp('ar2_lamp', 264, F - 41, 0, F - 54, 90, '#d8ff9a', 0.8, 'lantern', ['on', 'on', 'off']);
        P({ id: 'ar2_tube', x: 420, y: F });
        glow(433, F - 43, 20, '#ff4a4a', 0.5, 'pulse');
        P({ id: 'ar2_shelf_tall', x: 486, y: F });
        P({ id: 'ar2_shelf', x: 586, y: F, flip: true });
      } else if (id === 'ar_pump') {
        P({ id: 'ar2_pipes', x: 44, y: F, frames: ['idle0', 'idle1'], fps: 3 });
        P({ id: 'ar2_motor', x: 150, y: F });
        hang(232);
        P({ id: 'ar2_pump', x: 262, y: F, frames: ['idle0', 'idle1'], fps: 2 });
        P({ id: 'ar2_sandbags', x: 352, y: F });
        drip(416);
        P({ id: 'ar2_bucket', x: 416, y: F, frames: ['idle0', 'idle1', 'idle2'], fps: 4 });
        P({ id: 'ar2_boxes', x: 500, y: F });
        P({ id: 'ar2_pipes', x: 596, y: F, flip: true, frames: ['idle1', 'idle0'], fps: 3 });
      } else {
        P({ id: 'ar2_pipes', x: 40, y: F, frames: ['idle0', 'idle1'], fps: 3 });
        P({ id: 'ar2_sandbags', x: 146, y: F });
        hang(150);
        hang(400);
        P({ id: 'ar2_gauge', x: 318, y: F });
        drip(380);
        P({ id: 'ar2_vault', x: 528, y: F });
        glow(528, 100, 170, '#3fb8b0', 0.45, 'pulse');
      }
      emitters.push({ kind: 'mist', x: 0, y: F - 20, w: worldW, h: 24, rate: 1 });
      glow(320, F + 8, 240, '#3fb8b0', 0.35, 'pulse');
      break;
    }
    // ── Act 3 · the boiler room (env-boiler2.ts) ──
    case 'bo_furnace':
    case 'bo_lockers':
    case 'bo_valves':
    case 'bo_mirrors': {
      ceil = 'bo2_ceiling';
      floor = 'bo2_floor';
      wall = id === 'bo_lockers' || id === 'bo_mirrors' ? 'bo2_wall_b' : 'bo2_wall';
      ambient = id === 'bo_mirrors' ? '#23121a' : '#2e1612';
      const cage = (x: number) => lamp('bo2_lamp', x, 22, 0, 49, 120, '#ffb45a', 0.7, 'candle', ['on', 'on', 'off']);
      const vent = (x: number) => {
        P({ id: 'bo2_vent', x, y: F, frames: ['idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'puff0', 'puff1', 'puff2', 'puff3'], fps: 5 });
        emitters.push({ kind: 'steam', x: x + o - 6, y: 40, w: 12, h: 4, rate: 1.2 });
      };
      if (id === 'bo_furnace') {
        cage(32);
        cage(452);
        P({ id: 'bo2_coal', x: 34, y: F });
        P({ id: 'bo2_furnace', x: 128, y: F, frames: ['fire0', 'fire1', 'fire2', 'fire3'], fps: 6 });
        glow(128, F - 50, 170, '#ff7a2a', 1.05, 'fire');
        P({ id: 'bo2_pipe', x: 200, y: F });
        P({ id: 'bo2_gauges', x: 238, y: 64 });
        P({ id: 'bo2_incinerator', x: 350, y: F, frames: ['run0', 'run1', 'run2', 'run3'], fps: 6 });
        glow(304, F - 32, 90, '#ff8a3a', 0.9, 'fire');
        vent(458);
        P({ id: 'bo2_furnace', x: 556, y: F, flip: true, frames: ['fire2', 'fire3', 'fire0', 'fire1'], fps: 6 });
        glow(556, F - 50, 170, '#ff7a2a', 1.05, 'fire');
        P({ id: 'bo2_coal', x: 628, y: F, flip: true });
        emitters.push({ kind: 'embers', x: 0, y: F - 6, w: worldW, h: 6, rate: 4 });
      } else if (id === 'bo_lockers') {
        cage(150);
        cage(470);
        P({ id: 'bo2_door', x: 38, y: F, frame: 'closed' });
        P({ id: 'bo2_lockers', x: 124, y: F });
        P({ id: 'bo2_calendar', x: 204, y: 84 });
        P({ id: 'bo2_bench', x: 270, y: F });
        P({ id: 'bo2_intercom', x: 334, y: 92, frames: ['idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'call'], fps: 2 });
        P({ id: 'bo2_kettle', x: 380, y: F, frames: ['idle0', 'boil0', 'boil1'], fps: 4 });
        glow(380, F - 30, 40, '#ff5a2a', 0.7, 'pulse');
        P({ id: 'bo2_pipe', x: 416, y: F });
        P({ id: 'bo2_lockers', x: 478, y: F, flip: true });
        P({ id: 'bo2_gauges', x: 566, y: 64 });
        vent(614);
      } else if (id === 'bo_valves') {
        cage(190);
        cage(536);
        P({ id: 'bo2_pipe', x: 16, y: F });
        P({ id: 'bo2_switchboard', x: 98, y: F, frames: ['idle0', 'idle0', 'idle0', 'idle0', 'spark0', 'spark1', 'spark2'], fps: 8 });
        glow(96, F - 60, 50, '#8aff7a', 0.6, 'fluor');
        glow(132, F - 78, 40, '#fff0a0', 0.6, 'fluor');
        P({ id: 'bo2_manifold', x: 290, y: F, frames: ['turn0', 'turn1', 'turn2', 'turn3'], fps: 4 });
        P({ id: 'bo2_intercom', x: 384, y: 92 });
        P({ id: 'bo2_gauges', x: 420, y: 60 });
        P({ id: 'bo2_door', x: 472, y: F, frame: 'open' });
        vent(548);
        P({ id: 'bo2_pipe', x: 590, y: F });
        P({ id: 'bo2_coal', x: 630, y: F, flip: true });
      } else {
        cage(250);
        P({ id: 'bo2_curtain', x: 34, y: F });
        P({ id: 'bo2_mirror_tall', x: 100, y: F });
        P({ id: 'bo2_mirror_draped', x: 162, y: F });
        P({ id: 'bo2_chandelier', x: 268, y: F });
        P({ id: 'bo2_mirror_oval', x: 340, y: F });
        P({ id: 'bo2_mirror_tall', x: 420, y: F, flip: true });
        P({ id: 'bo2_mirror_draped', x: 486, y: F, flip: true });
        P({ id: 'bo2_curtain', x: 606, y: F, flip: true });
        glow(528, 90, 160, '#b8c8ff', 0.45, 'pulse');
      }
      emitters.push({ kind: 'smoke', x: 0, y: 34, w: worldW, h: 30, rate: 0.8 });
      break;
    }
    // ── Act 4 · the directorate (env-directorate2.ts) ──
    case 'di_reception':
    case 'di_meeting':
    case 'di_library':
    case 'di_boss': {
      ceil = 'di2_ceiling';
      floor = 'di2_floor';
      wall = id === 'di_meeting' ? 'di2_wall_b' : 'di2_wall';
      ambient = '#221a1e';
      const brass = (x: number, flick = false) => lamp('di2_lamp', x, 4, 0, 40, 150, '#ffd08a', 0.72, flick ? 'fluor' : 'lantern');
      const clock = (x: number) => P({ id: 'di2_clock', x, y: F, frames: ['swing0', 'swing1', 'swing2', 'swing3'], fps: 2 });
      if (id === 'di_reception') {
        [145, 337, 561].forEach((x, k) => brass(x, k === 2));
        P({ id: 'di2_door', x: 44, y: F, frame: 'closed' });
        P({ id: 'di2_palm', x: 112, y: F });
        P({ id: 'di2_emblem', x: 236, y: 62 });
        P({ id: 'di2_reception', x: 236, y: F });
        glow(182, 108, 50, '#e6ff9a', 0.55, 'lantern');
        P({ id: 'di2_rope', x: 344, y: F });
        P({ id: 'di2_portrait', x: 396, y: 66, frame: 'a' });
        P({ id: 'di2_portrait', x: 452, y: 66, frame: 'b' });
        glow(424, 40, 60, '#ffc27a', 0.4);
        P({ id: 'di2_sofa', x: 424, y: F });
        P({ id: 'di2_window', x: 520, y: 76, frames: ['idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'flash'], fps: 1.5 });
        clock(604);
      } else if (id === 'di_meeting') {
        [177, 433].forEach((x) => brass(x));
        P({ id: 'di2_window', x: 52, y: 76, frames: ['idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'flash'], fps: 1.2 });
        P({ id: 'di2_portrait', x: 136, y: 66, frame: 'b' });
        P({ id: 'di2_projector', x: 306, y: 22, frames: ['on0', 'on1'], fps: 6 });
        glow(307, 57, 90, '#cfe3ff', 0.55, 'fluor');
        P({ id: 'di2_emblem', x: 480, y: 60 });
        for (const x of [242, 278, 314, 350, 386]) P({ id: 'di2_chair', x, y: F });
        P({ id: 'di2_table', x: 314, y: F });
        P({ id: 'di2_decanter', x: 262, y: 131 });
        clock(530);
        P({ id: 'di2_door', x: 596, y: F, frame: 'closed' });
      } else if (id === 'di_library') {
        [209, 401].forEach((x) => brass(x));
        P({ id: 'di2_bookcase', x: 40, y: F });
        P({ id: 'di2_bookcase', x: 110, y: F });
        P({ id: 'di2_globe', x: 226, y: F, frame: 'open' });
        P({ id: 'di2_portrait', x: 344, y: 64, frame: 'a' });
        P({ id: 'di2_chair', x: 344, y: F });
        P({ id: 'di2_desk', x: 344, y: F });
        glow(409, 115, 60, '#e6ff9a', 0.55, 'lantern');
        P({ id: 'di2_window', x: 484, y: 76 });
        clock(540);
        P({ id: 'di2_bookcase', x: 604, y: F });
      } else {
        [241, 401].forEach((x, k) => brass(x, k === 1));
        P({ id: 'di2_door', x: 44, y: F, frame: 'closed' });
        P({ id: 'di2_drawers', x: 112, y: F });
        P({ id: 'di2_drawers', x: 176, y: F });
        P({ id: 'di2_seal', x: 322, y: 76 });
        glow(322, 76, 110, '#ff4a4a', 0.4, 'pulse');
        P({ id: 'di2_throne', x: 322, y: F });
        P({ id: 'di2_desk', x: 322, y: F });
        P({ id: 'di2_rope', x: 440, y: F });
        P({ id: 'di2_drawers', x: 544, y: F });
        P({ id: 'di2_drawers', x: 608, y: F });
      }
      dust();
      break;
    }
    case 'hub': {
      // The office between shifts: one long bright floor, the archive door at the far right end.
      // Positions are absolute (HUB_SPOTS), not centred.
      props.length = 0;
      lights.length = 0;
      ceiling(props, lights, worldW, false, seed);
      props.push({ id: 'os_elevator', x: HUB_SPOTS.elevator, y: F, frame: 'closed' });
      props.push({ id: 'os_plant', x: 160, y: F, frame: 'alive' });
      props.push({ id: 'os_board', x: HUB_SPOTS.board, y: 88 });
      props.push({ id: 'os_poster_a', x: 330, y: 84 });
      props.push({ id: 'os_chair', x: HUB_SPOTS.desk - 64, y: F });
      props.push({ id: 'os_desk', x: HUB_SPOTS.desk, y: F, frames: ['idle0', 'idle0', 'idle0', 'ring0', 'ring1', 'idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'idle0', 'idle0'], fps: 4 });
      crt(lights, HUB_SPOTS.desk - 16, 110, false);
      const row = (x0: number, n: number) => {
        for (let k = 0; k < n; k++) {
          const x = x0 + k * 96;
          props.push({ id: 'os_cubicle', x, y: F, frames: ['idle0', 'idle1'], fps: 1 + k * 0.3 });
          crt(lights, x, 106, false);
        }
      };
      row(HUB_SPOTS.cubicles, 4);
      props.push({ id: 'os_poster_b', x: 640, y: 84 });
      props.push({ id: 'os_clock', x: 820, y: 60 });
      props.push({ id: 'os_cooler', x: HUB_SPOTS.cooler, y: F, frames: ['idle0', 'idle1'], fps: 0.7 });
      props.push({ id: 'os_copier', x: HUB_SPOTS.copier, y: F, frames: ['idle0', 'busy0', 'busy1'], fps: 2 });
      props.push({ id: 'os_poster_c', x: 1150, y: 84 });
      row(HUB_SPOTS.cubiclesB, 2);
      props.push({ id: 'os_glass', x: HUB_SPOTS.glass, y: F });
      props.push({ id: 'os_clock', x: 1600, y: 60 });
      props.push({ id: 'os_vending', x: HUB_SPOTS.vending, y: F });
      lights.push(light(HUB_SPOTS.vending, 110, 70, '#9ad6ff', 0.4));
      props.push({ id: 'os_extinguisher', x: 1750, y: F - 18 });
      props.push({ id: 'os_archive_door', x: HUB_SPOTS.archive, y: F, frame: 'closed' });
      props.push({ id: 'os_exit', x: HUB_SPOTS.archive, y: 40 });
      lights.push(light(HUB_SPOTS.archive, 42, 60, '#58f07a', 0.5));
      props.push({ id: 'os_plant', x: 1886, y: F, frame: 'dead' });
      emitters.push({ kind: 'dust', x: 0, y: 60, w: worldW, h: 100, rate: 3 });
      ambient = '#8e98a6';
      break;
    }
    case 'openspace': {
      P({ id: 'os_desk', x: 86, y: F, frames: dark ? ['idle0'] : ['idle0', 'ring0', 'ring1'], fps: 3 });
      P({ id: 'os_chair', x: 22, y: F });
      crt(lights, 70 + o, 110, dark);
      for (let k = 0; k < 4; k++) {
        P({ id: 'os_cubicle', x: 240 + k * 96, y: F, frames: ['idle0', 'idle1'], fps: 1 + k * 0.3 });
        crt(lights, 240 + k * 96 + o, 106, dark);
      }
      P({ id: 'os_poster_a', x: 250, y: 90 });
      P({ id: 'os_clock', x: 330, y: 66 });
      P({ id: 'os_poster_b', x: 440, y: 90 });
      P({ id: 'os_cooler', x: 588, y: F, frames: ['idle0', 'idle1'], fps: 0.7 });
      P({ id: 'os_plant', x: 622, y: F, frame: dark ? 'dead' : 'alive' });
      if (dark) {
        emergency(props, lights, 150 + o);
        paper(0.6);
      }
      dust();
      break;
    }
    case 'copyroom': {
      wall = 'os_wall_b';
      P({ id: 'os_shelf_tall', x: 40, y: F });
      P({ id: 'os_board', x: 176, y: 88 });
      P({ id: 'os_reams', x: 300, y: F });
      P({ id: 'os_copier_big', x: 420, y: F, frames: ['idle0', 'busy0', 'busy1'], fps: dark ? 5 : 2 });
      lights.push(light(420 + o, 118, 60, '#b6ffcf', dark ? 0.6 : 0.3, dark ? 'fluor' : 'none'));
      P({ id: 'os_copier', x: 536, y: F, frames: ['idle0'], fps: 1 });
      P({ id: 'os_shredder', x: 606, y: F });
      P({ id: 'os_poster_c', x: 536, y: 80 });
      if (dark) {
        emergency(props, lights, 300 + o);
        paper(1.4);
      }
      dust();
      break;
    }
    case 'storage': {
      wall = 'os_wall_c';
      ambient = dark ? '#1f2330' : ambient;
      P({ id: 'os_shelf_tall', x: 36, y: F });
      P({ id: 'os_shelf_tall', x: 104, y: F });
      P({ id: 'os_boxes', x: 250, y: F });
      P({ id: 'os_bulb', x: 330, y: STAGE_CEIL, frames: dark ? ['on', 'on', 'on', 'off'] : ['on'], fps: 1.3 });
      lights.push(light(330 + o, 56, 150, '#ffc978', dark ? 0.85 : 0.7, dark ? 'candle' : 'none'));
      P({ id: 'os_reams', x: 420, y: F });
      P({ id: 'os_boxes', x: 500, y: F });
      P({ id: 'os_shelf_tall', x: 600, y: F });
      P({ id: 'os_papers', x: 330, y: F + 18 });
      paper(dark ? 1.1 : 0.3);
      dust();
      break;
    }
    case 'breakroom': {
      wall = 'os_wall_b';
      P({ id: 'os_fridge', x: 40, y: F });
      P({ id: 'os_coffee', x: 96, y: F });
      lights.push(light(96 + o, 120, 40, '#ff8a4a', 0.5, 'pulse'));
      P({ id: 'os_poster_a', x: 200, y: 82 });
      P({ id: 'os_table', x: 330, y: F });
      P({ id: 'os_clock', x: 330, y: 62 });
      P({ id: 'os_cooler', x: 470, y: F, frames: ['idle0', 'idle1'], fps: 0.7 });
      P({ id: 'os_vending', x: 560, y: F });
      lights.push(light(560 + o, 110, 70, '#9ad6ff', dark ? 0.7 : 0.4, dark ? 'fluor' : 'none'));
      P({ id: 'os_plant', x: 622, y: F, frame: dark ? 'dead' : 'alive' });
      if (dark) {
        emergency(props, lights, 420 + o);
        paper(0.5);
      }
      dust();
      break;
    }
    case 'corridor': {
      P({ id: 'os_plant', x: 24, y: F, frame: dark ? 'dead' : 'alive' });
      P({ id: 'os_door', x: 100, y: F, frame: 'closed' });
      P({ id: 'os_extinguisher', x: 196, y: F - 18 });
      P({ id: 'os_poster_c', x: 270, y: 86 });
      P({ id: 'os_firehose', x: 372, y: F - 24 });
      P({ id: 'os_door', x: 500, y: F, frame: 'closed' });
      P({ id: 'os_exit', x: 500, y: 42 });
      lights.push(light(500 + o, 44, 60, '#58f07a', 0.6, 'none'));
      P({ id: 'os_stand', x: 606, y: F });
      if (dark) {
        emergency(props, lights, 270 + o);
        paper(0.4);
      }
      dust();
      break;
    }
    case 'glass': {
      P({ id: 'os_cabinet', x: 40, y: F });
      P({ id: 'os_cabinet', x: 80, y: F });
      P({ id: 'os_poster_b', x: 190, y: 86 });
      P({ id: 'os_glass', x: 420, y: F });
      P({ id: 'os_clock', x: 300, y: 60 });
      lights.push(light(420 + o, 96, 120, dark ? '#ff4a4a' : '#e9f0ff', dark ? 0.55 : 0.5, dark ? 'pulse' : 'none'));
      P({ id: 'os_plant', x: 600, y: F, frame: dark ? 'dead' : 'alive' });
      if (dark) {
        emergency(props, lights, 190 + o);
        paper(1);
      }
      dust();
      break;
    }
    case 'archive': {
      wall = 'os_wall_c';
      ambient = dark ? '#1b1f2a' : '#6a7280';
      P({ id: 'os_archive_door', x: 70, y: F, frame: 'closed' });
      P({ id: 'os_shelf', x: 190, y: F });
      P({ id: 'os_switch', x: 128, y: 104, frame: 'up' });
      P({ id: 'os_bulb', x: 330, y: STAGE_CEIL, frames: ['on'], fps: 1 });
      lights.push(light(330 + o, 56, 170, '#ffcf8a', 0.9, dark ? 'candle' : 'none'));
      P({ id: 'os_shelf', x: 470, y: F });
      P({ id: 'os_archive_desk', x: 560, y: F });
      P({ id: 'os_shelf', x: 640, y: F });
      P({ id: 'os_papers', x: 330, y: F + 18 });
      paper(0.5);
      dust();
      break;
    }
    case 'flooded': {
      wall = 'os_wall_c';
      ambient = '#16323a';
      P({ id: 'os_shelf', x: 60, y: F });
      P({ id: 'os_shelf_tall', x: 150, y: F });
      P({ id: 'os_boxes', x: 330, y: F });
      P({ id: 'os_shelf', x: 500, y: F });
      P({ id: 'os_shelf_tall', x: 600, y: F });
      P({ id: 'os_bulb', x: 260, y: STAGE_CEIL, frames: ['on', 'on', 'off'], fps: 1.1 });
      lights.push(light(260 + o, 56, 140, '#ffb86a', 0.8, 'candle'));
      lights.push(light(320 + o, F + 8, 220, '#3fb8b0', 0.45, 'pulse', 0.3));
      emitters.push({ kind: 'drip', x: 0, y: STAGE_CEIL + 4, w: worldW, h: 1, rate: 1.6 });
      emitters.push({ kind: 'mist', x: 0, y: F - 20, w: worldW, h: 24, rate: 1.2 });
      break;
    }
    case 'boiler': {
      wall = 'os_wall_c';
      ambient = '#2e1612';
      P({ id: 'os_cabinet', x: 40, y: F });
      P({ id: 'os_boxes', x: 150, y: F });
      P({ id: 'os_stand', x: 320, y: F });
      P({ id: 'os_boxes', x: 520, y: F });
      P({ id: 'os_cabinet', x: 610, y: F });
      emergency(props, lights, 320 + o);
      lights.push(light(120 + o, F - 20, 170, '#ff7a2a', 1.05, 'fire'));
      lights.push(light(560 + o, F - 20, 170, '#ff7a2a', 1.05, 'fire'));
      emitters.push({ kind: 'embers', x: 0, y: F - 4, w: worldW, h: 4, rate: 4 });
      emitters.push({ kind: 'smoke', x: 0, y: 40, w: worldW, h: 40, rate: 1 });
      break;
    }
    case 'directorate': {
      wall = 'os_wall_b';
      ambient = '#3a3346';
      P({ id: 'os_plant', x: 30, y: F, frame: 'alive' });
      P({ id: 'os_elevator', x: 120, y: F, frame: 'closed' });
      P({ id: 'os_poster_a', x: 230, y: 84 });
      P({ id: 'os_glass', x: 420, y: F });
      P({ id: 'os_clock', x: 300, y: 60 });
      P({ id: 'os_plant', x: 610, y: F, frame: 'alive' });
      lights.push(light(420 + o, 90, 150, '#ffd08a', 0.7, 'lantern'));
      dust();
      break;
    }
  }
  // Wider worlds get a couple of edge props so the room does not end in bare wall.
  if (o > 40 && id !== 'hub') {
    if (id.startsWith('ar_')) {
      props.push({ id: 'ar2_boxes', x: o - 36, y: F });
      props.push({ id: 'ar2_sandbags', x: worldW - o + 38, y: F });
    } else if (id.startsWith('bo_')) {
      props.push({ id: 'bo2_coal', x: o - 40, y: F });
      props.push({ id: 'bo2_pipe', x: worldW - o + 14, y: F });
    } else if (id.startsWith('di_')) {
      props.push({ id: 'di2_palm', x: o - 34, y: F });
      props.push({ id: 'di2_palm', x: worldW - o + 34, y: F });
    } else {
      props.push({ id: 'os_cabinet', x: o - 30, y: F });
      props.push({ id: 'os_plant', x: worldW - o + 26, y: F, frame: dark ? 'dead' : 'alive' });
    }
  }
  return { wall, ceil, floor, ambient, props, lights, emitters, water: water ?? (id === 'flooded' ? F + 6 : undefined) };
}

/** A pre-rendered room with animated props, lights and ambient particles. */
export class Stage {
  id: RoomId;
  dark: boolean;
  worldW: number;
  layer: Canvas;
  front: Canvas;
  lights: Light[];
  ambient: string;
  animated: Prop[] = [];
  emitters: Emitter[];
  water?: number;
  /** Camera: world x at the left edge of the view. */
  cam = 0;
  time = 0;
  /** Extra darkness for scripted moments (the light goes out): 0..1. */
  blackout = 0;

  constructor(id: RoomId, dark: boolean, worldW: number, seed = 0, extra: Prop[] = []) {
    this.id = id;
    this.dark = dark;
    this.worldW = worldW;
    const def = room(id, dark, worldW, seed);
    this.ambient = def.ambient;
    this.lights = def.lights;
    this.emitters = def.emitters.map((e) => ({ ...e, acc: Math.random() }));
    this.water = def.water;
    this.layer = makeCanvas(worldW, STAGE_H);
    this.front = makeCanvas(worldW, STAGE_H);
    this.build(def, [...def.props, ...extra]);
  }

  private build(def: RoomDef, props: Prop[]) {
    const ctx = ctx2d(this.layer);
    const fctx = ctx2d(this.front);
    const tile = (id: string, y: number, h: number, fallback: string) => {
      if (!hasSprite(id)) {
        ctx.fillStyle = hex(fallback);
        ctx.fillRect(0, y, this.worldW, h);
        return;
      }
      const f = getFrame(id);
      for (let x = 0; x < this.worldW; x += f.w) ctx.drawImage(f.canvas as CanvasImageSource, x, y);
    };
    tile(def.wall, STAGE_CEIL, STAGE_FEET - STAGE_CEIL, 'drab2');
    tile(def.floor ?? 'os_floor', STAGE_FEET, STAGE_H - STAGE_FEET, 'slate1');
    tile(def.ceil ?? 'os_ceiling', 0, STAGE_CEIL + 2, 'drab3');
    for (const p of props) {
      if (p.frames && p.frames.length > 1) {
        this.animated.push(p);
        continue;
      }
      let f = getFrame(p.id, p.frames?.[0] ?? p.frame ?? 'idle0');
      if (p.flip) f = flipped(f);
      draw(p.front ? fctx : ctx, f, p.x, p.y);
    }
  }

  update(dt: number, ps: Particles) {
    this.time += dt;
    for (const e of this.emitters) {
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.emit(e, ps);
      }
    }
  }

  private emit(e: Emitter, ps: Particles) {
    const x = e.x + Math.random() * e.w;
    const y = e.y + Math.random() * e.h;
    switch (e.kind) {
      case 'dust':
        ps.spawn({ x, y, vx: rand(-3, 3), vy: rand(-2, 2), wobble: 2, max: rand(3, 6), ramp: ['cream', 'paper'], add: true, alpha: 0.5, layer: 'mid' });
        break;
      case 'paper':
        // A scrap of paper drifting down from the ceiling, flickering as it turns.
        ps.spawn({
          x,
          y,
          vx: rand(-6, 6),
          vy: rand(8, 16),
          wobble: rand(8, 16),
          max: rand(9, 14),
          ramp: ['paper', 'cream', 'paper2', 'cream'],
          size: Math.random() < 0.3 ? 2 : 1,
          kind: 'shard',
          layer: Math.random() < 0.5 ? 'back' : 'mid',
          floorY: STAGE_FEET + rand(2, 20),
        });
        break;
      case 'drip':
        ps.spawn({
          x,
          y,
          vy: 20,
          ay: 420,
          max: 3,
          ramp: ['teal5'],
          layer: 'mid',
          floorY: this.water ?? STAGE_FEET,
          onFloor: (p) => ps.spawn({ x: p.x, y: p.y + 1, len: 1, grow: 10, max: 0.5, kind: 'ring', ramp: ['teal5', 'teal4', 'teal3'], layer: 'mid' }),
        });
        break;
      case 'mist':
        ps.spawn({ x: rand(-30, this.worldW), y, vx: rand(4, 10), max: rand(5, 9), kind: 'smoke', len: rand(10, 18), grow: 1, ramp: ['teal2', 'teal1', 'teal0'], alpha: 0.28, layer: 'back' });
        break;
      case 'steam':
        ps.spawn({ x, y, vx: rand(-4, 4), vy: rand(-26, -14), max: rand(1, 2), kind: 'smoke', len: 3, grow: 6, ramp: ['grey4', 'grey3', 'grey2'], alpha: 0.35, layer: 'back' });
        break;
      case 'embers':
        ps.spawn({ x, y, vx: rand(-6, 6), vy: rand(-18, -6), wobble: 6, max: rand(1, 2.5), ramp: ['orange3', 'orange2', 'red2', 'red1'], add: true, layer: 'mid' });
        break;
      case 'smoke':
        ps.spawn({ x, y, vx: rand(-4, 10), vy: rand(-6, -2), wobble: 4, max: rand(3, 6), kind: 'smoke', len: rand(6, 12), grow: rand(2, 5), ramp: ['grey1', 'grey0', 'ink3'], alpha: 0.3, layer: 'back' });
        break;
    }
  }

  /** Lights in view coordinates (camera applied), dimmed by a blackout. */
  viewLights(): Light[] {
    const k = 1 - this.blackout;
    return this.lights.map((l) => ({ ...l, x: l.x - this.cam, intensity: l.intensity * k }));
  }

  /** Keeps the lights' flicker state so props can follow it. */
  syncLights(view: Light[]) {
    view.forEach((l, i) => (this.lights[i].current = l.current));
  }

  /** `behind`: drawn after the static room but before the animated props (cubicles, cooler, lamps), so walkers pass behind the partitions. */
  drawBack(ctx: Ctx2D, viewW: number, behind?: (ctx: Ctx2D) => void) {
    const cam = Math.round(this.cam);
    ctx.drawImage(this.layer as CanvasImageSource, cam, 0, viewW, STAGE_H, 0, 0, viewW, STAGE_H);
    behind?.(ctx);
    for (const p of this.animated) {
      if (p.x - cam < -120 || p.x - cam > viewW + 120) continue;
      const frames = p.frames!;
      let name = frames[Math.floor(this.time * (p.fps ?? 4) + p.x * 0.01) % frames.length];
      if (p.light !== undefined) {
        const k = (this.lights[p.light]?.current ?? 1) * (1 - this.blackout);
        name = k < 0.3 ? frames[2] : k < 0.85 ? frames[1] : frames[0];
      }
      if (this.blackout > 0.6 && p.id === 'os_ceiling_light') name = 'off';
      let f = getFrame(p.id, name);
      if (p.flip) f = flipped(f);
      draw(ctx, f, p.x - cam, p.y);
    }
    if (this.water !== undefined) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = hex('teal1');
      ctx.fillRect(0, this.water, viewW, STAGE_H - this.water);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hex('teal4');
      for (let x = 0; x < viewW; x += 3) ctx.fillRect(x, this.water + Math.round(Math.sin((x + cam) * 0.12 + this.time * 2.4)), 2, 1);
    }
  }

  drawFront(ctx: Ctx2D, viewW: number) {
    const cam = Math.round(this.cam);
    ctx.drawImage(this.front as CanvasImageSource, cam, 0, viewW, STAGE_H, 0, 0, viewW, STAGE_H);
  }

  /** Small bright cores on lamps, added after the lighting pass. */
  glows(): { x: number; y: number; color: string; k: number }[] {
    return this.lights.filter((l) => l.r <= 80).map((l) => ({ x: l.x - this.cam, y: l.y, color: l.color, k: (l.current ?? l.intensity) * 0.4 * (1 - this.blackout) }));
  }
}

/** The room a map node shows: act, location index and node kind decide it. */
export function roomFor(act: number, look: number, kind: string): { id: RoomId; dark: boolean } {
  if (act === 0) {
    if (kind === 'boss') return { id: 'glass', dark: true };
    // The till and the cooler live in the break room, the safe in the storage.
    if (kind === 'shop' || kind === 'rest') return { id: 'breakroom', dark: true };
    if (kind === 'treasure') return { id: 'storage', dark: true };
    return { id: ACT1_ROOMS[look % ACT1_ROOMS.length], dark: true };
  }
  if (act === 1) {
    if (!hasSprite('ar2_wall')) return { id: 'flooded', dark: true };
    if (kind === 'boss') return { id: 'ar_vault', dark: true };
    if (kind === 'shop' || kind === 'rest') return { id: 'ar_reading', dark: true };
    if (kind === 'treasure') return { id: 'ar_hall', dark: true };
    return { id: (['ar_hall', 'ar_reading', 'ar_pump'] as const)[look % 3], dark: true };
  }
  if (act === 2) {
    if (!hasSprite('bo2_wall')) return { id: 'boiler', dark: true };
    if (kind === 'boss') return { id: 'bo_mirrors', dark: true };
    if (kind === 'shop' || kind === 'rest') return { id: 'bo_lockers', dark: true };
    return { id: (['bo_furnace', 'bo_lockers', 'bo_valves'] as const)[look % 3], dark: true };
  }
  if (!hasSprite('di2_wall')) return { id: 'directorate', dark: false };
  if (kind === 'boss') return { id: 'di_boss', dark: true };
  if (kind === 'shop' || kind === 'rest') return { id: 'di_reception', dark: true };
  if (kind === 'treasure') return { id: 'di_library', dark: true };
  return { id: (['di_reception', 'di_meeting', 'di_library'] as const)[look % 3], dark: true };
}

export function stageBuffer(w: number): { canvas: Canvas; ctx: Ctx2D } {
  const canvas = makeCanvas(w, STAGE_H);
  return { canvas, ctx: ctx2d(canvas) };
}

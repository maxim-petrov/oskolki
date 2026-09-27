// Fight scenes for the mechanic tests: a board of junk (it never matches), so only the tiles a test
// places can score, and refills that stay junk (no surprise cascades) unless the test asks.
import { dispatch, newRun } from '../game/run.ts';
import { idx as cellIdx, validMoves } from '../game/board.ts';
import { bagTokens, boardDims, intentsOf, makeEnemy, startCombat } from '../game/combat.ts';
import { createBoard } from '../game/board.ts';
import { ACTS } from '../game/content/acts.ts';
import { ENEMIES } from '../game/content/enemies.ts';
import { GEAR } from '../game/content/gear.ts';
import { computeMods } from '../game/content/items.ts';
import { FAMS, W } from '../game/types.ts';

/** Cell of the scene's board (6×6 unless the scene changes it). */
export const idx = (r, c, dims = { w: W, h: W }) => cellIdx(dims, r, c);

let nextTile = 100000;
const junk = () => ({ id: nextTile++, kind: 'junk' });
const TAPE = { kind: 'junk', tape: true };
const COLOURS = new Set([...FAMS, 'prism', 'junk']);

/** Carries an item of gear and holds it (every tile of its colour is it now). */
export function hold(run, id) {
  const fam = GEAR[id]?.gear.fam;
  if (!fam) throw new Error(`нет вещи ${id}`);
  if (!run.hero.gear[fam].includes(id)) run.hero.gear[fam] = [...run.hero.gear[fam], id].slice(-3);
  run.hero.equip[fam] = id;
}

/**
 * A run standing in a fight. Options: relics (replace the hero's), gear carried (a colour left out
 * keeps its plain item; the first listed of a colour is held) and upgraded, red tape, enemies, act,
 * hero numbers, active, pockets, enemy hp override, and `real: true` for a real board dealt from the
 * hero's bag.
 */
export function scene({
  seed = 1,
  act = 0,
  char,
  relics = [],
  gear,
  ups = [],
  tape = 0,
  enemies = ['anchor'],
  enemyHp,
  hp,
  maxHp,
  coins,
  charge = 0,
  active = null,
  pockets,
  real = false,
  kind = 'fight',
} = {}) {
  const { run } = newRun({ seed, char, lastAct: 3 });
  run.act = act;
  run.hero.relics = [...relics];
  if (gear)
    for (const fam of FAMS) {
      const list = gear.filter((id) => GEAR[id]?.gear.fam === fam);
      if (!list.length) continue;
      run.hero.gear[fam] = list.slice(0, 3);
      run.hero.equip[fam] = list[0];
    }
  run.hero.ups = [...ups];
  run.hero.tape = tape;
  run.hero.active = active;
  // Mechanics tests use a roomy hero (60 half-hearts) unless they set health: the numbers under
  // test are not clipped by the armour cap or a death.
  run.hero.maxHp = maxHp ?? 60;
  run.hero.hp = hp ?? run.hero.maxHp;
  if (coins !== undefined) run.hero.coins = coins;
  const mods = computeMods(run.hero.relics);
  run.hero.pockets = Array(mods.pockets).fill(null);
  (pockets ?? []).forEach((p, k) => (run.hero.pockets[k] = p));
  const events = [];
  run.combat = startCombat(run, kind, [], mods, events);
  // Enemies that cramp the board shrink it from the start (startCombat was given none).
  const dims = boardDims(run, mods, enemies);
  if (dims.w !== run.combat.board.w || dims.h !== run.combat.board.h)
    run.combat.board = createBoard(run.rng.board, bagTokens(run), mods.wrap, 6, run.nextId, dims);
  run.phase = 'combat';
  run.hero.charge = charge;
  const c = run.combat;
  c.enemies = [];
  c.nextUid = 1;
  for (const id of enemies) {
    const e = makeEnemy(run, c, id, mods);
    if (enemyHp !== undefined) e.hp = e.maxHp = enemyHp;
    c.enemies.push(e);
  }
  c.target = c.enemies[0].uid;
  if (!real) {
    const n = c.board.w * c.board.h;
    c.board.cells = Array.from({ length: n }, junk);
    // A bomb in the far corner keeps a legal swap on the board: the engine never has to reshuffle
    // (and scatter) the tiles a test placed.
    c.board.cells[n - 1] = {
      id: nextTile++,
      kind: 'shield',
      special: 'bomb',
    };
    c.board.source = [TAPE];
    c.board.bag = [];
    c.board.queue = c.board.queue.map((q) => q.map(() => ({ ...junk(), tape: true })));
  }
  run.startEvents = events;
  return run;
}

/**
 * A tile for a name: a colour (blade, shield, ink, coin), prism, junk, tape (red tape junk), or an
 * item of gear — a tile of its colour, and the item goes in hand (all tiles of a colour are one item).
 */
function tileOf(run, what, extra = {}) {
  if (what === 'tape') return { id: nextTile++, kind: 'junk', tape: true, ...extra };
  if (COLOURS.has(what)) return { id: nextTile++, kind: what, ...extra };
  hold(run, what);
  return { id: nextTile++, kind: GEAR[what].gear.fam, ...extra };
}

/** Puts a tile on a cell: put(run, r, c, 'blade'), put(run, r, c, 'punch'), put(run, r, c, 'shield', { seal: true }). */
export function put(run, r, c, what, extra = {}) {
  run.combat.board.cells[idx(r, c, run.combat.board)] = tileOf(run, what, extra);
}

/** Puts a bare tile of a kind (prism, junk, a colour). */
export function tile(run, r, c, kind, extra = {}) {
  run.combat.board.cells[idx(r, c, run.combat.board)] = { id: nextTile++, kind, ...extra };
}

/**
 * A line of tiles in row `row` from column `col`, with its last tile lifted one row up: the
 * returned move drops it into place. line(run, RED3) → three red tiles in row 2. An entry is a
 * name (see put) or { tile: name, ...extra }.
 */
export function line(run, tiles, { row = 2, col = 0, extra = {} } = {}) {
  const n = tiles.length;
  tiles.forEach((t, k) => {
    const [r, c] = k === n - 1 ? [row - 1, col + k] : [row, col + k];
    if (typeof t === 'string') put(run, r, c, t, extra);
    else {
      const { tile: what, ...rest } = t;
      put(run, r, c, what, { ...extra, ...rest });
    }
  });
  const d = run.combat.board;
  return { from: idx(row - 1, col + n - 1, d), to: idx(row, col + n - 1, d) };
}

/** Sets the upcoming tiles of a column (the head falls first). */
export function queue(run, col, tiles) {
  const q = run.combat.board.queue[col];
  tiles.forEach((t, k) => {
    q[k] = tileOf(run, t);
  });
}

/** Plays a move and returns the new run with the move's key events. */
export function play(run, move) {
  const res = dispatch(run, { type: 'move', move });
  return withEvents(res);
}

export function act(run, action) {
  return withEvents(dispatch(run, action));
}

function withEvents(res) {
  const ev = res.events;
  return {
    run: res.run,
    events: ev,
    invalid: ev.find((e) => e.t === 'invalid'),
    strike: ev.find((e) => e.t === 'strike'),
    waves: ev.filter((e) => e.t === 'wave'),
    acts: ev.filter((e) => e.t === 'enemyAct'),
    effects: ev.flatMap((e) => (e.t === 'effects' || e.t === 'wave' ? e.effects : [])),
    procs: ev.flatMap((e) => (e.t === 'effects' || e.t === 'wave' ? e.effects : [])).filter((f) => f.kind === 'proc'),
  };
}

/** The first enemy (the default target). */
export const foe = (run, k = 0) => run.combat.enemies[k];

/** Makes enemy k do its action of this kind on the next tick. */
export function ready(run, kind, k = 0) {
  const e = run.combat.enemies[k];
  const at = intentsOf(e).findIndex((i) => i.kind === kind);
  if (at < 0) throw new Error(`${e.def} не умеет ${kind}`);
  e.cycle = at;
  e.countdown = 1;
  return e;
}

export const row = (r) => Array.from({ length: W }, (_, c) => idx(r, c));

export const RED3 = ['blade', 'blade', 'blade'];
export const BLUE3 = ['shield', 'shield', 'shield'];
export const VIOLET3 = ['ink', 'ink', 'ink'];
export const GOLD3 = ['coin', 'coin', 'coin'];

/** Three red tiles dropped into row 2: the plain move most checks compare against. */
export function hit(opts, tiles = RED3) {
  const run = scene({ enemyHp: 999, ...opts });
  return play(run, line(run, tiles));
}

/** A move with lines in two families: `a` completes row 2, `b` completes row 1. */
export function double(run, a, b) {
  put(run, 2, 0, a);
  put(run, 2, 1, a);
  put(run, 1, 2, a);
  put(run, 1, 0, b);
  put(run, 1, 1, b);
  put(run, 2, 2, b);
  return { from: idx(1, 2), to: idx(2, 2) };
}

/**
 * A cascade: `first` completes the bottom row, the column queues drop `second` into row 1 — the
 * second wave. The splash of the first line clears row 4 above it, so two tiles fall per column.
 */
export function cascade(opts, first, second) {
  const run = scene({ enemyHp: 999, ...opts });
  const move = line(run, first, { row: 5 });
  for (let c = 0; c < 3; c++) queue(run, c, [second[c], 'tape', 'tape']);
  return play(run, move);
}

/** Plays n legal moves on a real board (the first legal swap each time). */
export function moves(run, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const [m] = validMoves(run.combat.board, computeMods(run.hero.relics).wrap);
    const res = play(run, m);
    out.push(res);
    run = res.run;
  }
  return out;
}

/** An enemy's blow of this kind in an act, as the engine rolls it (value × the act's damage scale). */
export function blowOf(enemy, kind, act = 0) {
  const i = [...ENEMIES[enemy].intents, ...(ENEMIES[enemy].phases ?? []).flatMap((p) => p.intents)].find((x) => x.kind === kind);
  return Math.round(i.value * ACTS[act].dmgMul);
}

/** A flat number of the first act scaled like enemy blows (armour effects, fallback pinches). */
export const byBlows = (n, act = 0) => Math.round(n * ACTS[act].dmgMul);

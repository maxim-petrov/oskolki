// Fight scenes for the mechanic tests: a board of junk (it never matches), so only the tiles a test
// places can score, and refills that stay junk (no surprise cascades) unless the test asks.
import { dispatch, newRun } from '../game/run.ts';
import { idx, validMoves } from '../game/board.ts';
import { intentsOf, makeEnemy, startCombat } from '../game/combat.ts';
import { CARDS } from '../game/content/cards.ts';
import { computeMods } from '../game/content/items.ts';
import { CELLS, W } from '../game/types.ts';

export { idx };

let nextTile = 100000;
const junk = () => ({ id: nextTile++, kind: 'junk' });

/**
 * A run standing in a fight. Options: relics (replace the hero's), enemies, act, hero numbers,
 * active, pockets, enemy hp override, and `deck: true` for a real board dealt from the hero's deck.
 */
export function scene({
  seed = 1,
  act = 0,
  char,
  relics = [],
  enemies = ['anchor'],
  enemyHp,
  hp,
  maxHp,
  coins,
  charge = 0,
  active = null,
  pockets,
  deck,
  real = false,
  kind = 'fight',
} = {}) {
  const { run } = newRun({ seed, char, lastAct: 3 });
  run.act = act;
  run.hero.relics = [...relics];
  run.hero.active = active;
  if (deck)
    run.hero.deck = deck.map((c, k) => ({
      uid: k + 1,
      ...(typeof c === 'string' ? { id: c, up: false } : { up: false, ...c }),
    }));
  if (maxHp !== undefined) run.hero.maxHp = maxHp;
  if (hp !== undefined) run.hero.hp = hp;
  if (coins !== undefined) run.hero.coins = coins;
  const mods = computeMods(run.hero.relics);
  run.hero.pockets = Array(mods.pockets).fill(null);
  (pockets ?? []).forEach((p, k) => (run.hero.pockets[k] = p));
  const events = [];
  run.combat = startCombat(run, kind, [], mods, events);
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
    c.board.cells = Array.from({ length: CELLS }, junk);
    // A bomb in the far corner keeps a legal swap on the board: the engine never has to reshuffle
    // (and scatter) the tiles a test placed.
    c.board.cells[CELLS - 1] = {
      id: nextTile++,
      kind: 'shield',
      special: 'bomb',
    };
    c.board.source = [{ card: 'redtape', up: false }];
    c.board.bag = [];
    c.board.queue = c.board.queue.map((q) => q.map(() => ({ ...junk(), card: 'redtape' })));
  }
  run.startEvents = events;
  return run;
}

/** Puts a card (or a bare tile) on a cell: put(run, r, c, 'punch', { up: true }). */
export function put(run, r, c, card, extra = {}) {
  const fam = CARDS[card]?.fam;
  const kind = extra.kind ?? (fam === 'status' ? 'junk' : fam);
  run.combat.board.cells[idx(r, c)] = { id: nextTile++, kind, card, ...extra };
}

/** Puts a bare tile of a kind (prism, junk, a family without a card). */
export function tile(run, r, c, kind, extra = {}) {
  run.combat.board.cells[idx(r, c)] = { id: nextTile++, kind, ...extra };
}

/**
 * A line of `cards` in row `row` from column `col`, with its last tile lifted one row up: the
 * returned move drops it into place. line(run, ['fist', 'fist', 'fist']) → three fists in row 2.
 */
export function line(run, cards, { row = 2, col = 0, extra = {} } = {}) {
  const n = cards.length;
  cards.forEach((card, k) => {
    const [r, c] = k === n - 1 ? [row - 1, col + k] : [row, col + k];
    if (typeof card === 'string') put(run, r, c, card, extra);
    else put(run, r, c, card.card, { ...extra, ...card });
  });
  return { from: idx(row - 1, col + n - 1), to: idx(row, col + n - 1) };
}

/** Sets the upcoming tiles of a column (the head falls first). */
export function queue(run, col, cards) {
  const q = run.combat.board.queue[col];
  cards.forEach((card, k) => {
    const fam = CARDS[card].fam;
    q[k] = { id: nextTile++, kind: fam === 'status' ? 'junk' : fam, card };
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

export const FISTS = ['fist', 'fist', 'fist'];
export const FOLDERS = ['folder', 'folder', 'folder'];
export const INKS = ['ink', 'ink', 'ink'];
export const CLIPS = ['clip', 'clip', 'clip'];

/** Three fists dropped into row 2: the plain move most checks compare against. */
export function hit(opts, cards = FISTS) {
  const run = scene({ enemyHp: 999, ...opts });
  return play(run, line(run, cards));
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
  for (let c = 0; c < 3; c++) queue(run, c, [second[c], 'redtape', 'redtape']);
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

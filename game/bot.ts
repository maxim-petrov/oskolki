/**
 * Simple players for balance simulation and smoke tests. They only read what a human sees:
 * the board (censored tiles unknown), the visible queue, intents and timers, the map and the
 * offers. They never inspect hidden refills or RNG state.
 */
import { colOf, validMoves } from './board.ts';
import { activeCost, alive, currentIntent, intentDamage, previewMove } from './combat.ts';
import { CARDS } from './content/cards.ts';
import { EVENT_BY_ID } from './content/events.ts';
import { ITEMS } from './content/items.ts';
import { reachable } from './actmap.ts';
import { int, next, type Rng } from './rng.ts';
import { clone, dispatch, modsOf, pickable } from './run.ts';
import type { Action, DeckCard, Move, RunState } from './types.ts';

export type Policy = 'greedy' | 'randomCards' | 'noCards' | 'random';

export interface BotOptions {
  policy: Policy;
  seed: number;
}

/** How much a card is worth to the greedy bot (rough, by feel). */
const CARD_SCORE: Record<string, number> = {
  fist: 2,
  folder: 1.5,
  ink: 1,
  clip: 0.5,
  punch: 5,
  redpen: 5,
  sharpener: 5,
  pins: 5,
  scissors: 7,
  ruler: 6,
  stapler: 6,
  awl: 6,
  cutter: 8,
  alarm: 8,
  binder: 4,
  sleeve: 4,
  umbrella: 3,
  drawer: 5,
  laminator: 5,
  archivebox: 6,
  vest: 7,
  clipboard: 6,
  corrector: 3,
  urgent: 4,
  blotcurse: 6,
  quill: 5,
  copystamp: 7,
  carbon: 7,
  weight: 6,
  coin: 3,
  receipt: 4,
  bonus: 8,
  card: 6,
  piggy: 4,
  report: 9,
  goldclip: 10,
  redtape: -10,
};

const cardScore = (c: { id: string; up?: boolean }) => (CARD_SCORE[c.id] ?? 3) + (c.up ? 1.5 : 0);

function threat(run: RunState): number {
  const c = run.combat!;
  let t = 0;
  for (const e of alive(c)) if (e.countdown <= 1) t += intentDamage(c, e);
  return t;
}

function scoreMove(run: RunState, m: Move): number {
  const mods = modsOf(run);
  const p = previewMove(run, mods, m);
  if (!p.valid) return -1;
  const c = run.combat!;
  const target = alive(c).find((e) => e.uid === c.target) ?? alive(c)[0];
  const need = Math.max(0, threat(run) - run.hero.armor);
  const low = run.hero.hp < run.hero.maxHp * 0.35 ? 1.5 : 1;
  const dmg = target ? Math.min(p.damage, target.hp + target.block + 4) : p.damage;
  const kill = target && p.damage >= target.hp + target.block ? 8 : 0;
  const armor = Math.min(p.armor, need) * 1.4 * low + Math.max(0, p.armor - need) * 0.1;
  const cost = run.hero.active ? activeCost(run) : 0;
  const charge = run.hero.charge < cost ? p.charge * 1.1 : p.charge * 0.1;
  return dmg + kill + armor + charge + p.coins * 0.6 + p.specials * 6 + (p.blast ? 5 : 0);
}

function pickTarget(run: RunState): number | null {
  const c = run.combat!;
  const list = alive(c).filter((e) => !e.submerged);
  if (!list.length) return null;
  const rank = (e: (typeof list)[number]) => {
    const i = currentIntent(e);
    const dmg = intentDamage(c, e);
    const support = i.kind === 'heal' || i.kind === 'summon' || i.kind === 'hurry' ? 4 : 0;
    return (dmg + support) / Math.max(1, e.countdown) + 30 / Math.max(1, e.hp);
  };
  return list.sort((a, b) => rank(b) - rank(a))[0].uid;
}

function combatAction(run: RunState, policy: Policy, r: Rng): Action | null {
  const c = run.combat!;
  const mods = modsOf(run);
  const hero = run.hero;
  const moves = validMoves(c.board, mods.wrap);
  if (policy === 'random') return moves.length ? { type: 'move', move: moves[int(r, moves.length)] } : null;
  const t = pickTarget(run);
  if (t !== null && t !== c.target) return { type: 'target', uid: t };
  const danger = threat(run) - hero.armor;
  // Pockets.
  for (let slot = 0; slot < hero.pockets.length; slot++) {
    const p = hero.pockets[slot];
    if (!p) continue;
    if (p === 'coffee' && hero.hp < hero.maxHp * 0.4) return { type: 'pocket', slot };
    if (p === 'sticker' && danger >= hero.hp * 0.4) return { type: 'pocket', slot };
    if (p === 'energy' && alive(c).some((e) => e.hp > 40)) return { type: 'pocket', slot };
    if ((p === 'bomb' || p === 'eraser') && danger >= hero.hp * 0.5) return { type: 'pocket', slot, cell: 14 };
  }
  // Active skill.
  const id = hero.active;
  if (id && hero.charge >= activeCost(run)) {
    const cells = c.board.cells;
    const junk = cells.findIndex((x) => x.kind === 'junk' || x.pin);
    switch (id) {
      case 'eraser':
        if (junk >= 0) return { type: 'active', cell: junk };
        break;
      case 'corrector':
        if (cells.filter((x) => x.kind === 'junk' || x.pin || x.fuse).length >= 3) return { type: 'active' };
        break;
      case 'stapler': {
        const e = alive(c).sort((a, b) => intentDamage(c, b) / Math.max(1, b.countdown) - intentDamage(c, a) / Math.max(1, a.countdown))[0];
        if (e) return { type: 'active', uid: e.uid };
        break;
      }
      case 'shredder': {
        const reds = Array.from({ length: 6 }, (_, col) => cells.filter((x, i) => colOf(i) === col && x.kind === 'blade').length);
        return { type: 'active', col: reds.indexOf(Math.max(...reds)) };
      }
      case 'coffeeToGo':
      case 'megaphone':
        if (danger > 0) return { type: 'active' };
        break;
      default:
        return { type: 'active' };
    }
  }
  if (!moves.length) return null;
  if (policy === 'greedy' || policy === 'randomCards' || policy === 'noCards') {
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const s = scoreMove(run, m) + next(r) * 0.01;
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    return { type: 'move', move: best };
  }
  return { type: 'move', move: moves[int(r, moves.length)] };
}

function mapAction(run: RunState, r: Rng): Action {
  const options = reachable(run.map, run.node).map((id) => run.map.nodes[id]);
  const ratio = run.hero.hp / run.hero.maxHp;
  const value = (kind: string) => {
    switch (kind) {
      case 'elite':
        return ratio > 0.75 ? 6 : ratio > 0.55 ? 1 : -6;
      case 'rest':
        return ratio < 0.5 ? 8 : 1;
      case 'shop':
        return run.hero.coins >= 100 ? 6 : 0;
      case 'treasure':
        return 7;
      case 'event':
        return 3;
      default:
        return 3;
    }
  };
  // One step of lookahead: the node plus its best child.
  const score = (id: number) => {
    const n = run.map.nodes[id];
    const kids = n.next.map((k) => value(run.map.nodes[k].kind));
    return value(n.kind) + (kids.length ? Math.max(...kids) * 0.5 : 0) + next(r) * 0.5;
  };
  options.sort((a, b) => score(b.id) - score(a.id));
  return { type: 'travel', node: options[0].id };
}

/** Value of a run state for choosing event options. */
function worth(run: RunState): number {
  const h = run.hero;
  const deck = h.deck.reduce((s, c) => s + cardScore(c), 0);
  let v = h.hp + h.maxHp * 1.5 + h.coins * 0.25 + h.relics.length * 25 + deck + run.stats.shards * 4;
  if (run.phase === 'pick' && run.pick) v += { remove: 8, upgrade: 6, finish: 5, transform: 3, copy: 6 }[run.pick.purpose] * run.pick.count;
  if (run.phase === 'combat') v += h.hp / h.maxHp > 0.7 ? 10 : -40;
  return v;
}

function removeOrder(deck: DeckCard[]) {
  return [...deck].sort((a, b) => cardScore(a) - cardScore(b));
}

function pickAction(run: RunState): Action {
  const p = run.pick!;
  const list = run.hero.deck.filter((c) => pickable(run, p, c));
  if (!list.length) return { type: 'leave' };
  let card: DeckCard;
  if (p.purpose === 'remove' || p.purpose === 'transform') card = removeOrder(list)[0];
  else card = [...list].sort((a, b) => cardScore(b) - cardScore(a))[0];
  if (p.purpose === 'remove' && cardScore(card) >= 4) return { type: 'leave' };
  return { type: 'pick', uid: card.uid };
}

function wantCard(run: RunState, c: { id: string; up?: boolean }) {
  const n = run.hero.deck.length;
  const bar = n <= 14 ? 4 : n <= 20 ? 6 : 8;
  return cardScore(c) >= bar;
}

export function decide(run: RunState, opts: BotOptions, r: Rng): Action | null {
  const policy = opts.policy;
  switch (run.phase) {
    case 'combat':
      return combatAction(run, policy, r);
    case 'map':
      if (policy === 'random') {
        const opts2 = reachable(run.map, run.node);
        return { type: 'travel', node: opts2[int(r, opts2.length)] };
      }
      return mapAction(run, r);
    case 'reward': {
      // Rows the bot still wants: pockets only with a free slot, cards only when worth it.
      const free = run.hero.pockets.includes(null);
      const open = run.rewards.map((x, k) => ({ x, k })).filter(({ x }) => !x.taken && (x.kind !== 'pocket' || free));
      for (const { x, k } of open) {
        if (x.kind !== 'card') return { type: 'reward', index: k };
        const cards = (x.cards ?? []).map((id, c) => ({ id, up: !!x.ups?.[c], c }));
        if (policy === 'noCards' || !cards.length) continue;
        if (policy === 'random' || policy === 'randomCards') return { type: 'reward', index: k, card: int(r, cards.length) };
        const best = cards.sort((a, b) => cardScore(b) - cardScore(a))[0];
        if (best && wantCard(run, best)) return { type: 'reward', index: k, card: best.c };
      }
      return { type: 'leave' };
    }
    case 'shop': {
      const s = run.shop!;
      const coins = run.hero.coins;
      if (policy !== 'random') {
        const worst = removeOrder(run.hero.deck)[0];
        if (!s.removed && coins >= s.removePrice && worst && cardScore(worst) < 2 && run.hero.deck.length > 8) return { type: 'remove' };
        const relic = s.relics.findIndex((x) => !x.sold && x.price <= coins && ITEMS[x.id].kind === 'passive');
        if (relic >= 0) return { type: 'buy', kind: 'relic', index: relic };
        if (policy === 'greedy') {
          const card = s.cards.findIndex((x) => !x.sold && x.price <= coins && wantCard(run, x) && cardScore(x) >= 6);
          if (card >= 0) return { type: 'buy', kind: 'card', index: card };
        }
        if (s.finish && !s.finish.sold && coins >= s.finish.price + 40) return { type: 'buy', kind: 'finish', index: 0 };
        const pocket = s.pockets.findIndex((x) => !x.sold && x.price <= coins - 40);
        if (pocket >= 0 && run.hero.pockets.includes(null)) return { type: 'buy', kind: 'pocket', index: pocket };
      }
      return { type: 'leave' };
    }
    case 'rest':
      if (run.hero.hp < run.hero.maxHp * 0.55 || policy === 'random') return { type: 'rest', choice: 'heal' };
      return run.hero.deck.some((c) => !c.up && CARDS[c.id].rarity !== 'status') ? { type: 'rest', choice: 'upgrade' } : { type: 'rest', choice: 'heal' };
    case 'pick':
      return pickAction(run);
    case 'treasure':
      return run.treasure && !run.treasure.opened ? { type: 'open' } : { type: 'leave' };
    case 'event': {
      const e = run.event!;
      if (e.result !== undefined) return { type: 'leave' };
      const def = EVENT_BY_ID[e.id];
      const open = def.options.map((o, k) => ({ o, k })).filter(({ o }) => !o.locked?.(run));
      if (policy === 'random') return { type: 'event', option: open[int(r, open.length)].k };
      let best = open[open.length - 1].k;
      let bestV = -Infinity;
      for (const { k } of open) {
        // Try the option on a copy: the bot only sees the outcome text, not future rolls.
        const trial = dispatch(clone(run), { type: 'event', option: k }).run;
        const v = worth(trial) + next(r) * 0.1;
        if (v > bestV) {
          bestV = v;
          best = k;
        }
      }
      return { type: 'event', option: best };
    }
    case 'bossReward':
      return policy === 'random' ? { type: 'bossRelic', index: int(r, run.bossRelics.length) } : { type: 'bossRelic', index: 0 };
    default:
      return null;
  }
}

export interface FightLog {
  act: number;
  kind: string;
  moves: number;
  enemyActs: number;
  damageTaken: number;
  won: boolean;
}

export interface SimResult {
  won: boolean;
  act: number;
  cause: string;
  moves: number;
  steps: number;
  fights: FightLog[];
  stats: RunState['stats'];
  deck: number;
  relics: number;
}

export function playRun(start: RunState, opts: BotOptions, maxSteps = 20000): SimResult {
  let run = start;
  const r = { s: (opts.seed * 2654435761) >>> 0 || 1 };
  const fights: FightLog[] = [];
  let cur: FightLog | null = run.combat ? { act: run.act, kind: run.combat.kind, moves: 0, enemyActs: 0, damageTaken: 0, won: false } : null;
  let steps = 0;
  let stuck = 0;
  while (steps < maxSteps && run.phase !== 'dead' && run.phase !== 'won') {
    const action = decide(run, opts, r);
    if (!action) break;
    const res = dispatch(run, action);
    steps++;
    if (res.events.some((e) => e.t === 'invalid')) {
      stuck++;
      if (stuck > 20) {
        // Fall back to leaving whatever screen we are stuck on.
        const leave = dispatch(res.run, { type: 'leave' });
        run = leave.run;
        stuck = 0;
        continue;
      }
    } else stuck = 0;
    for (const e of res.events) {
      if (e.t === 'combatStart') cur = { act: res.run.act, kind: e.kind, moves: 0, enemyActs: 0, damageTaken: 0, won: false };
      if (e.t === 'swap' && cur) cur.moves++;
      if (e.t === 'enemyAct' && cur) {
        cur.enemyActs++;
        cur.damageTaken += e.hurt?.red ?? 0;
      }
      if ((e.t === 'combatWon' || e.t === 'dead') && cur) {
        cur.won = e.t === 'combatWon';
        fights.push(cur);
        cur = null;
      }
    }
    run = res.run;
  }
  return {
    won: run.phase === 'won',
    act: run.act,
    cause: run.stats.deathCause,
    moves: run.stats.moves,
    steps,
    fights,
    stats: run.stats,
    deck: run.hero.deck.length,
    relics: run.hero.relics.length,
  };
}

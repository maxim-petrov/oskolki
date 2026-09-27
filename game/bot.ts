/**
 * Simple players for balance simulation and smoke tests. They only read what a human sees:
 * the board (censored tiles unknown), the visible queue, intents and timers, the map and the
 * offers. They never inspect hidden refills or RNG state.
 */
import { colOf, findGroups, idx, rowOf, validMoves } from './board.ts';
import { BANK_MAX, actScale, activeCost, alive, currentIntent, energyCap, intentDamage, mirrorBack, moveRules, previewMove, swapCost, weaponTile, type MovePreview } from './combat.ts';
import { CARDS } from './content/cards.ts';
import { EVENT_BY_ID } from './content/events.ts';
import { ITEMS, MAX_WEAPONS, type Mods } from './content/items.ts';
import { reachable } from './actmap.ts';
import { int, next, type Rng } from './rng.ts';
import { clone, dispatch, modsOf, pickable, rerollPrice } from './run.ts';
import type { Action, DeckCard, RunState } from './types.ts';

/**
 * greedy: best move, best cards; focus: greedy play, but builds one family (red) — takes only red
 * cards, cuts the others at the till; randomCards / noCards: control bots for card choice; random.
 */
export type Policy = 'greedy' | 'focus' | 'randomCards' | 'noCards' | 'random';

/** The family the focus bot builds. */
const FOCUS = 'blade';
const inFocus = (id: string) => CARDS[id]?.fam === FOCUS;

export interface BotOptions {
  policy: Policy;
  seed: number;
  /**
   * How the eraser (skill and pocket) is used: on junk only, or to drop a line into place — the
   * matches it sets off are resolved and scored without spending time.
   */
  erase?: 'junk' | 'match';
}

/**
 * How much a card is worth to the greedy bot. Calibrated on the balance lab (docs/balance): the hp a
 * card saves in real fights plus what one copy does to a whole run; recalibrate after big changes.
 */
export const CARD_SCORE: Record<string, number> = {
  fist: 2,
  pins: 5,
  redpen: 7,
  alarm: 7,
  folder: 1.5,
  ink: 1,
  clip: 0.5,
  binder: 5,
  sleeve: 4.5,
  umbrella: 5,
  drawer: 6,
  laminator: 4,
  archivebox: 6,
  vest: 4.5,
  clipboard: 5,
  corrector: 3.3,
  urgent: 4.9,
  blotcurse: 4.7,
  quill: 6,
  copystamp: 9.5,
  carbon: 5.7,
  weight: 7.2,
  coin: 1,
  receipt: 1,
  bonus: 1,
  card: 1,
  piggy: 1,
  report: 1,
  goldclip: 1,
  redtape: -10,
};

const cardScore = (c: { id: string; up?: boolean }) => (CARD_SCORE[c.id] ?? 3) + (c.up ? 1.5 : 0);

function threat(run: RunState): number {
  const c = run.combat!;
  let t = 0;
  for (const e of alive(c)) if (e.countdown <= 1) t += intentDamage(c, e);
  return t;
}

/** What the bot's move scores are measured against, read once per decision from the board. */
interface Worth {
  /** A damage bonus put aside by the abacus: +100% is worth most of the best attack now. */
  bank: number;
  /** Half a heart kept (health is counted in half-hearts): a good part of a move's damage. */
  half: number;
}

function worthOf(previews: MovePreview[]): Worth {
  let best = 0;
  for (const p of previews) if (p.valid) best = Math.max(best, p.tally.dmg);
  return { bank: best * 0.6, half: Math.max(10, best * 0.6) };
}

function scoreMove(run: RunState, p: MovePreview, w: Worth): number {
  if (!p.valid) return -1;
  const c = run.combat!;
  // A dived enemy cannot be hit: the strike goes to one above water, or nowhere.
  const aimed = alive(c).find((e) => e.uid === c.target) ?? alive(c)[0];
  const target = aimed?.submerged ? alive(c).find((e) => !e.submerged) : aimed;
  const need = Math.max(0, threat(run) - run.hero.armor);
  const low = run.hero.hp < run.hero.maxHp * 0.35 ? 1.5 : 1;
  // Armour and shields of the target eat the strike, unless it pierces.
  const soak = target && !p.pierce ? target.armor + target.block : 0;
  const landed = Math.max(0, p.damage - soak);
  const dmg = target ? Math.min(landed, target.hp + 4) : 0;
  const kill = target && landed >= target.hp ? 8 : 0;
  const armor = Math.min(p.armor, need) * w.half * low + Math.max(0, p.armor - need) * 0.5;
  const cap = energyCap(run);
  const charge = run.hero.charge < cap ? p.charge * 1.1 : p.charge * 0.1;
  // Damage to all: every enemy but the target counts (the target's share is in its own hp).
  let aoe = 0;
  for (const e of alive(c)) aoe += Math.min(p.aoe, e.hp) * (e === target ? 0.3 : 0.8);
  // What the strike leaves behind: bleed ticks (b + (b−1) + …), a skipped or delayed blow.
  let after = 0;
  if (target) {
    const b = p.bleed + target.bleed;
    after += ((b * (b + 1)) / 2 - (target.bleed * (target.bleed + 1)) / 2) * actScale(run).hp * 0.8;
    if (p.hpPct) after += Math.min(target.hp, target.maxHp * p.hpPct);
    const blow = intentDamage(c, target);
    if (p.stun && !target.stunned && !target.stunImmune) after += blow > 0 && target.countdown <= 2 ? blow * w.half : 2;
    if (p.delay) after += blow > 0 && target.countdown <= 1 ? blow * w.half * 0.5 : 1;
  }
  // A shining mirror costs half a heart (more in later acts) per blow: never hit it for a lethal one.
  let shine = 0;
  if (target?.shining && p.damage > 0) {
    const back = mirrorBack(target);
    shine = back >= run.hero.hp + run.hero.armor ? 1e6 : back * w.half * low;
  }
  const saved = p.bank ? Math.min(p.bank, Math.max(0, BANK_MAX - (c.bank ?? 0))) * w.bank : 0;
  return dmg + kill + armor + charge + aoe + after + saved + p.coins * 0.6 + p.specials * 6 + (p.blast ? 5 : 0) - shine;
}

/** The best move's score with the weapon in hand (moves and previews for this weapon). */
function bestScore(run: RunState, mods: Mods, moves: ReturnType<typeof validMoves>, w: Worth): number {
  let best = 0;
  for (const m of moves) best = Math.max(best, scoreMove(run, previewMove(run, mods, m), w));
  return best;
}

/**
 * Another weapon for this board: the bot tries each in its hands on the same moves and swaps when
 * one strikes clearly better, worth the energy. Returns the weapon to swap to, or null.
 */
function weaponSwap(run: RunState, mods: Mods, moves: ReturnType<typeof validMoves>, previews: MovePreview[], current: number, w: Worth): string | null {
  const hero = run.hero;
  const cost = swapCost(run);
  if (hero.weapons.length < 2 || hero.charge < cost) return null;
  // Only moves with a red group change with the weapon.
  const red = moves.filter((_, k) => previews[k].groups.some((g) => g.fam === 'blade'));
  if (!red.length) return null;
  let best: { id: string; s: number } | null = null;
  for (const id of hero.weapons) {
    if (id === hero.weapon) continue;
    const trial = { ...run, hero: { ...hero, weapon: id } };
    const s = bestScore(trial, mods, red, w);
    if (s > current * 1.25 + cost * 4 && (!best || s > best.s)) best = { id, s };
  }
  return best?.id ?? null;
}

/** Between fights the bot holds the weapon that strikes best on an average board. */
function mainWeapon(run: RunState): string {
  // A group of three: its tiles, damage to all (about 1,3 enemies), bleed, paper half the time,
  // cascades a third of the time; the super strike about a third of the red groups.
  const rate = (id: string) => {
    const w = ITEMS[id]?.weapon;
    if (!w) return 0;
    const s = w.strike;
    const u = w.super;
    const strike =
      weaponTile(w, run) * 3 +
      (s.allPerTile ?? 0) * 3 * 1.3 +
      (s.bleed ?? 0) * 3 +
      (s.paper ?? 0) * w.tile * 3 * 0.5 +
      (s.cascadeTile ? (s.cascadeTile - w.tile) * 3 * 0.35 : 0) +
      (s.pierce ? 2 : 0) +
      (s.delay ? 3 : 0);
    const sup = (u.perTile ?? 0) * 4 + (u.allPerTile ?? 0) * 4 * 1.3 + (u.bleed ?? 0) * 3 + (u.stun ? 6 : 0) + (u.pierce ? 2 : 0);
    return strike + sup * 0.3;
  };
  return [...run.hero.weapons].sort((a, b) => rate(b) - rate(a))[0] ?? run.hero.weapon;
}

const FAM_WEIGHT: Record<string, number> = { blade: 2, shield: 1.5, ink: 1, coin: 1 };

/**
 * The eraser's cell, as a player sees it: removing a tile drops its column by one and lets the
 * visible queue head in at the top; whatever lines up is resolved for free (no time passes).
 * Returns the best cell and the value of what falls into place (junk and staples are worth a bit).
 */
function eraseTarget(run: RunState): { cell: number; value: number } | null {
  const c = run.combat!;
  const wrap = modsOf(run).wrap;
  const cells = c.board.cells;
  let best: { cell: number; value: number } | null = null;
  const b = c.board;
  for (let i = 0; i < cells.length; i++) {
    const col = colOf(b, i);
    const head = b.queue[col][0];
    if (!head) continue;
    const next = cells.slice();
    for (let r = rowOf(b, i); r > 0; r--) next[idx(b, r, col)] = cells[idx(b, r - 1, col)];
    next[idx(b, 0, col)] = head;
    let value = cells[i].kind === 'junk' || cells[i].pin ? 1 : 0;
    for (const g of findGroups(b, next, wrap)) value += g.size * (FAM_WEIGHT[g.fam] ?? 1) + (g.make ? 4 : 0);
    if (!best || value > best.value) best = { cell: i, value };
  }
  return best && best.value > 0 ? best : null;
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

function combatAction(run: RunState, policy: Policy, r: Rng, erase: BotOptions['erase'] = 'junk'): Action | null {
  const c = run.combat!;
  const mods = modsOf(run);
  const hero = run.hero;
  const moves = validMoves(c.board, moveRules(run, mods));
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
    if (p === 'choco' && alive(c).some((e) => e.hp > 40)) return { type: 'pocket', slot };
    if ((p === 'bomb' || (p === 'eraser' && erase === 'junk')) && danger >= hero.hp * 0.5) return { type: 'pocket', slot, cell: 14 };
    if (p === 'eraser' && erase === 'match') {
      const t = eraseTarget(run);
      if (t && (t.value >= 8 || (danger >= hero.hp * 0.5 && t.value >= 3))) return { type: 'pocket', slot, cell: t.cell };
    }
  }
  // Active skill.
  const id = hero.active;
  if (id && hero.charge >= activeCost(run)) {
    const cells = c.board.cells;
    const junk = cells.findIndex((x) => x.kind === 'junk' || x.pin);
    // The hot key pays for every skill used: then the board tools are worth pressing anyway.
    const eager = mods.skillBonus > 0 && !(c.skillBonus ?? 0);
    switch (id) {
      case 'eraser': {
        const t = erase === 'match' || eager ? eraseTarget(run) : null;
        if (t) return { type: 'active', cell: t.cell };
        if (erase === 'junk' && junk >= 0) return { type: 'active', cell: junk };
        if (eager) return { type: 'active', cell: cells.findIndex((x) => x.kind !== 'junk' && !x.special && x.kind !== 'prism') };
        break;
      }
      case 'corrector':
        if (eager || cells.filter((x) => x.kind === 'junk' || x.pin || x.fuse).length >= 3) return { type: 'active' };
        break;
      case 'stapler': {
        // Only an enemy that can be stunned now (not stunned, not just out of a stun).
        const e = alive(c)
          .filter((x) => !x.stunned && !x.stunImmune)
          .sort((a, b) => intentDamage(c, b) / Math.max(1, b.countdown) - intentDamage(c, a) / Math.max(1, a.countdown))[0];
        if (e) return { type: 'active', uid: e.uid };
        break;
      }
      case 'shredder': {
        const reds = Array.from({ length: c.board.w }, (_, col) => cells.filter((x, i) => colOf(c.board, i) === col && x.kind === 'blade').length);
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
  if (policy === 'greedy' || policy === 'focus' || policy === 'randomCards' || policy === 'noCards') {
    let best = moves[0];
    let top = -Infinity;
    const previews = moves.map((m) => previewMove(run, mods, m));
    const w = worthOf(previews);
    if (!mods.bankPer) w.bank = 0;
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      const s = scoreMove(run, previews[k], w) + next(r) * 0.01;
      if (s > top) {
        top = s;
        best = m;
      }
    }
    const swap = weaponSwap(run, mods, moves, previews, top, w);
    if (swap) return { type: 'weapon', id: swap };
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
  // Health in half-hearts: half a heart is dear (about 8 hp of the old 60).
  let v = h.hp * 8 + h.maxHp * 12 + h.coins * 0.25 + (h.relics.length + h.weapons.length) * 25 + deck + run.stats.shards * 4;
  if (run.phase === 'pick' && run.pick) v += { remove: 8, upgrade: 6, finish: 5, transform: 3, copy: 6 }[run.pick.purpose] * run.pick.count;
  if (run.phase === 'combat') v += h.hp / h.maxHp > 0.7 ? 10 : -40;
  return v;
}

function removeOrder(deck: DeckCard[]) {
  return [...deck].sort((a, b) => cardScore(a) - cardScore(b));
}

function pickAction(run: RunState, policy: Policy): Action {
  const p = run.pick!;
  const list = run.hero.deck.filter((c) => pickable(run, p, c));
  if (!list.length) return { type: 'leave' };
  const focus = policy === 'focus';
  let card: DeckCard;
  if (p.purpose === 'remove' || p.purpose === 'transform') {
    const off = focus ? list.filter((c) => !inFocus(c.id)) : [];
    card = removeOrder(off.length ? off : list)[0];
    if (focus && off.length) return { type: 'pick', uid: card.uid };
  } else {
    const on = focus ? list.filter((c) => inFocus(c.id)) : [];
    card = [...(on.length ? on : list)].sort((a, b) => cardScore(b) - cardScore(a))[0];
  }
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
      return combatAction(run, policy, r, opts.erase);
    case 'map':
      // Between fights a swap is free: the bot takes its best weapon into the next fight.
      if (policy !== 'random' && run.hero.weapons.length > 1) {
        const main = mainWeapon(run);
        if (main !== run.hero.weapon) return { type: 'weapon', id: main };
      }
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
        if (policy === 'focus') {
          const red = cards.filter((c) => inFocus(c.id)).sort((a, b) => cardScore(b) - cardScore(a))[0];
          if (red) return { type: 'reward', index: k, card: red.c };
          continue;
        }
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
        const offFocus = policy === 'focus' && run.hero.deck.some((c) => !inFocus(c.id));
        if (!s.removed && coins >= s.removePrice && worst && (offFocus || (cardScore(worst) < 2 && run.hero.deck.length > 8)) && run.hero.deck.length > 5)
          return { type: 'remove' };
        const relic = s.relics.findIndex(
          (x) => !x.sold && x.price <= coins && (ITEMS[x.id].kind === 'passive' || (ITEMS[x.id].kind === 'weapon' && run.hero.weapons.length < MAX_WEAPONS)),
        );
        if (relic >= 0) return { type: 'buy', kind: 'relic', index: relic };
        if (policy === 'greedy') {
          const card = s.cards.findIndex((x) => !x.sold && x.price <= coins && wantCard(run, x) && cardScore(x) >= 6);
          if (card >= 0) return { type: 'buy', kind: 'card', index: card };
        }
        if (policy === 'focus') {
          const card = s.cards.findIndex((x) => !x.sold && x.price <= coins && inFocus(x.id));
          if (card >= 0) return { type: 'buy', kind: 'card', index: card };
        }
        if (s.finish && !s.finish.sold && coins >= s.finish.price + 40) return { type: 'buy', kind: 'finish', index: 0 };
        const pocket = s.pockets.findIndex((x) => !x.sold && x.price <= coins - 40);
        if (pocket >= 0 && run.hero.pockets.includes(null)) return { type: 'buy', kind: 'pocket', index: pocket };
        // Plenty left: reprint the till for another look.
        if (coins >= rerollPrice(run) + 150) return { type: 'reroll' };
      }
      return { type: 'leave' };
    }
    case 'rest':
      if (run.hero.hp < run.hero.maxHp * 0.55 || policy === 'random') return { type: 'rest', choice: 'heal' };
      return run.hero.deck.some((c) => !c.up && CARDS[c.id].rarity !== 'status') ? { type: 'rest', choice: 'upgrade' } : { type: 'rest', choice: 'heal' };
    case 'pick':
      return pickAction(run, policy);
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

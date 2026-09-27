/**
 * Simple players for balance simulation and smoke tests. They only read what a human sees:
 * the board (censored tiles unknown), the visible queue, intents and timers, the map and the
 * offers. They never inspect hidden refills or RNG state.
 */
import { colOf, findGroups, idx, rowOf, validMoves } from './board.ts';
import { BANK_MAX, RUSH_COST, actScale, activeCost, alive, armBlock, currentIntent, energyCap, intentDamage, mirrorBack, moveRules, previewMove, swapCost, type MovePreview } from './combat.ts';
import { EVENT_BY_ID } from './content/events.ts';
import { MAX_GEAR } from './content/gear.ts';
import { ITEMS, type Mods } from './content/items.ts';
import { reachable } from './actmap.ts';
import { int, next, type Rng } from './rng.ts';
import { clone, dispatch, famOf, modsOf, pickable, rerollPrice, upgradable } from './run.ts';
import { FAMS } from './types.ts';
import type { Action, Fam, RunState } from './types.ts';

/** greedy: best move, best gear; randomGear / noGear: control bots for the gear choice; random. */
export type Policy = 'greedy' | 'randomGear' | 'noGear' | 'random';

export interface BotOptions {
  policy: Policy;
  seed: number;
  /**
   * How the eraser (skill and pocket) is used: on junk only, or to drop a line into place — the
   * matches it sets off are resolved and scored without spending time.
   */
  erase?: 'junk' | 'match';
  /** Energy spends the bot leaves alone (the balance report measures what each one is worth). */
  skip?: ('rush' | 'charge' | 'skill' | 'swap')[];
}

/**
 * How much an item of gear is worth to the greedy bot over the plain item of its colour (0).
 * Calibrated on the balance lab (docs/balance): what holding it does to real fights and whole runs;
 * recalibrate after big changes.
 */
export const GEAR_SCORE: Record<string, number> = {
  knife: 0,
  staplegun: 7,
  scissors: 3,
  punch: 4,
  ruler: 5,
  sharpener: 2,
  awl: 7,
  cutter: 5,
  shield: 0,
  binder: 2,
  sleeve: 1,
  umbrella: 7,
  drawer: 2,
  laminator: 1,
  archivebox: 7,
  foldervest: 4,
  clipboard: 1,
  battery: 0,
  whiteout: 1,
  urgent: 4,
  blotcurse: 3,
  quill: 5,
  copystamp: 3,
  carbon: 2,
  weight: 4,
  penny: 0,
  receipt: 2,
  bonus: 2,
  creditcard: 2,
  piggy: 2,
  report: 1,
  goldclip: 2,
};

/** An upgrade adds about this much to an item. */
const UP_SCORE = 3;

export const gearScore = (run: RunState, id: string) => (GEAR_SCORE[id] ?? 3) + (run.hero.ups.includes(id) ? UP_SCORE : 0);

/** The best item the hero carries in a colour, by the bot's scores. */
function bestOf(run: RunState, fam: Fam): string {
  return [...run.hero.gear[fam]].sort((a, b) => gearScore(run, b) - gearScore(run, a))[0] ?? run.hero.equip[fam];
}

/** What a new item adds: how much better than the best one of its colour (a spare to swap to is worth a little). */
function gearGain(run: RunState, id: string): number {
  const fam = famOf(id);
  if (!fam || run.hero.gear[fam].includes(id) || run.hero.gear[fam].length >= MAX_GEAR) return -Infinity;
  const gain = (GEAR_SCORE[id] ?? 3) - gearScore(run, bestOf(run, fam));
  return gain > 0 ? gain : gain * 0.25 + 0.5;
}

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
  // Energy is worth most while the meter has room (it pays for the skill, «Заряд», «Вне очереди»).
  const cap = energyCap(run);
  const charge = run.hero.charge < cap ? p.charge * 1.3 : p.charge * 0.1;
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
  return dmg + kill + armor + charge + aoe + after + saved + p.coins * 0.6 + p.finds * 8 + p.specials * 6 + (p.blast ? 5 : 0) - shine;
}

/** The best move's score with the gear in hand (moves and previews for this kit). */
function bestScore(run: RunState, mods: Mods, moves: ReturnType<typeof validMoves>, w: Worth): number {
  let best = 0;
  for (const m of moves) best = Math.max(best, scoreMove(run, previewMove(run, mods, m, undefined, true), w));
  return best;
}

/**
 * Another item for this board: the bot tries each spare item of a colour on the same moves (those
 * with a group of that colour) and swaps when one scores clearly better, worth the energy. Returns
 * the item to swap to, or null.
 */
function gearSwap(run: RunState, mods: Mods, moves: ReturnType<typeof validMoves>, previews: MovePreview[], order: number[], current: number, w: Worth): string | null {
  const hero = run.hero;
  const cost = swapCost(run);
  if (hero.charge < cost) return null;
  let best: { id: string; s: number } | null = null;
  for (const fam of FAMS) {
    if (hero.gear[fam].length < 2) continue;
    // The best moves with a group of the colour (the rest would not win with any item).
    const touched = order
      .filter((k) => previews[k].groups.some((g) => g.fam === fam))
      .slice(0, 8)
      .map((k) => moves[k]);
    if (!touched.length) continue;
    for (const id of hero.gear[fam]) {
      if (id === hero.equip[fam]) continue;
      const trial = { ...run, hero: { ...hero, equip: { ...hero.equip, [fam]: id } } };
      const s = bestScore(trial, mods, touched, w);
      if (s > current * 1.25 + cost * 4 && (!best || s > best.s)) best = { id, s };
    }
  }
  return best?.id ?? null;
}

const FAM_WEIGHT: Record<string, number> = { blade: 2, shield: 1.5, ink: 1, coin: 1 };

/**
 * The intern's eraser wipes a whole colour and fires it: the colour worth most on this board (red
 * strikes, blue blocks when a blow is coming, violet refills the meter). A cell of that colour, or null.
 */
function wipeTarget(run: RunState, danger: number): number | null {
  const c = run.combat!;
  const cells = c.board.cells;
  // A shining mirror sends every blow back: then only blue (armour, no damage) is worth wiping.
  const shining = alive(c).some((e) => e.shining && !e.submerged);
  const worth: Record<string, number> = shining ? { shield: danger > 0 ? 2.5 : 0 } : { blade: 3, shield: danger > 0 ? 2.5 : 0.3, ink: 0.8, coin: 0.5 };
  const count: Record<string, number> = {};
  for (const t of cells) if (t.kind in worth && !t.hidden) count[t.kind] = (count[t.kind] ?? 0) + 1;
  const best = Object.keys(count).sort((a, b) => count[b] * worth[b] - count[a] * worth[a])[0];
  if (!best || count[best] * worth[best] < 12) return null;
  return cells.findIndex((t) => t.kind === best && !t.hidden);
}

/** The best move's score with energy readied (a sample of the best plain moves: the charged ones differ little). */
function armedBest(run: RunState, mods: Mods, moves: ReturnType<typeof validMoves>, order: number[], w: Worth, armed: { charge?: boolean; double?: boolean }): number {
  let best = 0;
  for (const k of order.slice(0, 6)) best = Math.max(best, scoreMove(run, previewMove(run, mods, moves[k], armed, true), w));
  return best;
}

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

function combatAction(run: RunState, policy: Policy, r: Rng, erase: BotOptions['erase'] = 'junk', skip: BotOptions['skip'] = []): Action | null {
  const c = run.combat!;
  const mods = modsOf(run);
  const hero = run.hero;
  const moves = validMoves(c.board, moveRules(run, mods));
  if (policy === 'random') return moves.length ? { type: 'move', move: moves[int(r, moves.length)] } : null;
  const t = pickTarget(run);
  if (t !== null && t !== c.target) return { type: 'target', uid: t };
  const danger = threat(run) - hero.armor;
  const armed = c.armed ?? {};
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
  // «Вне очереди» before a heavy blow the move cannot block: the enemies wait one move.
  if (!skip.includes('rush') && !armed.rush && !armBlock(run, 'rush') && hero.charge >= RUSH_COST) {
    const heavy = danger >= Math.max(3, Math.ceil(hero.hp / 2)) || danger >= hero.hp;
    if (heavy) return { type: 'arm', what: 'rush' };
  }
  // Active skill.
  const id = skip.includes('skill') ? null : hero.active;
  if (id && hero.charge >= activeCost(run)) {
    const cells = c.board.cells;
    // The hot key pays for every skill used: then the board tools are worth pressing anyway.
    const eager = mods.skillBonus > 0 && !(c.skillBonus ?? 0);
    switch (id) {
      case 'eraser': {
        const cell = wipeTarget(run, danger);
        if (cell !== null && cell >= 0) return { type: 'active', cell };
        break;
      }
      case 'doubleentry':
        if (!armed.double) return { type: 'active' };
        break;
      case 'corrector': {
        // The clean-up hurts every enemy anyway; with a blow coming the energy waits for «Вне
        // очереди», unless the board is dirty or the skill is paid for twice (the hot key).
        const dirty = c.board.flood > 0 || cells.filter((x) => x.kind === 'junk' || x.pin || x.fuse).length >= 3;
        if (eager || dirty) return { type: 'active' };
        break;
      }
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
  if (policy === 'greedy' || policy === 'randomGear' || policy === 'noGear') {
    let best = moves[0];
    let top = -Infinity;
    const previews = moves.map((m) => previewMove(run, mods, m, undefined, true));
    const w = worthOf(previews);
    if (!mods.bankPer) w.bank = 0;
    // «Заряд»: every group of the move a super, when that is clearly worth 4 energy.
    const scores = previews.map((p) => scoreMove(run, p, w));
    const order = moves.map((_, k) => k).sort((a, b) => scores[b] - scores[a]);
    if (policy === 'greedy' && !skip.includes('charge') && !armed.charge && !armBlock(run, 'charge')) {
      const plain = scores[order[0]] ?? 0;
      if (armedBest(run, mods, moves, order, w, { charge: true }) - plain >= 10) return { type: 'arm', what: 'charge' };
    }
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      const s = scores[k] + next(r) * 0.01;
      if (s > top) {
        top = s;
        best = m;
      }
    }
    const swap = skip.includes('swap') ? null : gearSwap(run, mods, moves, previews, order, top, w);
    if (swap) return { type: 'gear', id: swap };
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
        // The wallet holds 99: a full one wants a till.
        return run.hero.coins >= 60 ? 10 : run.hero.coins >= 20 ? 6 : 0;
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
  // The items held count in full, the spares a little; red tape is junk in every fight.
  let gear = -h.tape * 10 + h.keys * 6 + (h.findNext ? 4 : 0);
  for (const f of FAMS) for (const id of h.gear[f]) gear += gearScore(run, id) * (id === bestOf(run, f) ? 1 : 0.2) + 4;
  // Health in half-hearts: half a heart is dear (about 8 hp of the old 60).
  let v = h.hp * 8 + h.maxHp * 12 + h.coins * 0.25 + h.relics.length * 25 + gear + run.stats.shards * 4;
  if (run.phase === 'pick' && run.pick) v += { upgrade: UP_SCORE * 2, transform: 3 }[run.pick.purpose] * run.pick.count;
  if (run.phase === 'combat') v += h.hp / h.maxHp > 0.7 ? 10 : -40;
  return v;
}

function pickAction(run: RunState): Action {
  const p = run.pick!;
  const list = FAMS.flatMap((f) => run.hero.gear[f]).filter((id) => pickable(run, p, id));
  if (!list.length) return { type: 'leave' };
  if (p.purpose === 'upgrade') {
    // The items held first (what the board is made of), the best of them.
    const held = list.filter((id) => FAMS.some((f) => bestOf(run, f) === id));
    const pool = held.length ? held : list;
    return { type: 'pick', id: [...pool].sort((a, b) => gearScore(run, b) - gearScore(run, a))[0] };
  }
  // A trade: the weakest item goes (a plain one is worth changing, a good one is not).
  const worst = [...list].sort((a, b) => gearScore(run, a) - gearScore(run, b))[0];
  return gearScore(run, worst) <= 3 ? { type: 'pick', id: worst } : { type: 'leave' };
}

export function decide(run: RunState, opts: BotOptions, r: Rng): Action | null {
  const policy = opts.policy;
  switch (run.phase) {
    case 'combat':
      return combatAction(run, policy, r, opts.erase, opts.skip);
    case 'map':
      // Between fights a swap is free: the bot takes its best item of every colour into the next fight.
      if (policy !== 'random')
        for (const f of FAMS) {
          const main = bestOf(run, f);
          if (main !== run.hero.equip[f]) return { type: 'gear', id: main };
        }
      if (policy === 'random') {
        const opts2 = reachable(run.map, run.node);
        return { type: 'travel', node: opts2[int(r, opts2.length)] };
      }
      return mapAction(run, r);
    case 'reward': {
      // Rows the bot still wants: pockets only with a free slot, gear only when worth it.
      const free = run.hero.pockets.includes(null);
      const open = run.rewards.map((x, k) => ({ x, k })).filter(({ x }) => !x.taken && (x.kind !== 'pocket' || free));
      for (const { x, k } of open) {
        if (x.kind === 'upgrade' && !upgradable(run).length) continue;
        if (x.kind !== 'gear') return { type: 'reward', index: k };
        const gear = (x.gear ?? []).map((id, n) => ({ id, n, gain: gearGain(run, id) })).filter((g) => g.gain > -Infinity);
        if (policy === 'noGear' || !gear.length) continue;
        if (policy === 'random' || policy === 'randomGear') return { type: 'reward', index: k, pick: gear[int(r, gear.length)].n };
        const best = gear.sort((a, b) => b.gain - a.gain)[0];
        if (best.gain >= 1) return { type: 'reward', index: k, pick: best.n };
      }
      return { type: 'leave' };
    }
    case 'shop': {
      const s = run.shop!;
      const coins = run.hero.coins;
      if (policy !== 'random') {
        if (s.shred && !s.shred.used && run.hero.tape > 0 && coins >= s.shred.price) return { type: 'remove' };
        const relic = s.relics.findIndex((x) => !x.sold && x.price <= coins && ITEMS[x.id].kind === 'passive');
        if (relic >= 0) return { type: 'buy', kind: 'relic', index: relic };
        // A nearly full wallet (it holds 99) is spent rather than wasted: the bar for gear drops.
        const rich = coins >= 70;
        if (policy === 'greedy') {
          const gear = s.gear.findIndex((x) => !x.sold && x.price <= coins && gearGain(run, x.id) >= (rich ? 0.5 : 3));
          if (gear >= 0) return { type: 'buy', kind: 'gear', index: gear };
        }
        if (s.upgrade && !s.upgrade.sold && coins >= s.upgrade.price + 3 && upgradable(run).length) return { type: 'buy', kind: 'upgrade', index: 0 };
        const pocket = s.pockets.findIndex((x) => !x.sold && x.price <= coins - (rich ? 0 : 6));
        if (pocket >= 0 && run.hero.pockets.includes(null)) return { type: 'buy', kind: 'pocket', index: pocket };
        // Plenty left: reprint the till for another look.
        if (coins >= rerollPrice(run) + 20) return { type: 'reroll' };
      }
      return { type: 'leave' };
    }
    case 'rest':
      if (run.hero.hp < run.hero.maxHp * 0.55 || policy === 'random') return { type: 'rest', choice: 'heal' };
      return upgradable(run).length ? { type: 'rest', choice: 'upgrade' } : { type: 'rest', choice: 'heal' };
    case 'pick':
      return pickAction(run);
    case 'treasure': {
      const t = run.treasure;
      if (!t || t.opened) return { type: 'leave' };
      // With a key the upper shelf: the first passive item (a skill only for a hero without one).
      if (t.choices) {
        const k = t.choices.findIndex((id) => ITEMS[id]?.kind === 'passive' || (ITEMS[id]?.kind === 'active' && !run.hero.active));
        return { type: 'open', index: Math.max(0, k) };
      }
      return policy !== 'random' && run.hero.keys > 0 ? { type: 'open', key: true } : { type: 'open' };
    }
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
  /** Items of gear carried at the end, and how many of them upgraded. */
  gear: number;
  ups: number;
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
    gear: FAMS.reduce((n, f) => n + run.hero.gear[f].length, 0),
    ups: run.hero.ups.length,
    relics: run.hero.relics.length,
  };
}

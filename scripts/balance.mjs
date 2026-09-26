// Balance report: plays thousands of runs and lab fights with the simulation bots, checks the
// balance contract (game/balance/targets.ts) and writes docs/balance/REPORT.md + baseline.json.
//
//   npm run balance                 full report (several minutes on all cores)
//   npm run balance -- --quick      smaller samples (about a minute), same sections
//   npm run balance -- --no-write   print the verdict only
//
// Everything new in the content (items, cards, enemies, events) is picked up automatically.
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTS, CHARACTERS } from '../game/content/acts.ts';
import { CARDS, rewardPool } from '../game/content/cards.ts';
import { ENEMIES } from '../game/content/enemies.ts';
import { EVENTS } from '../game/content/events.ts';
import { ITEMS, POCKETS } from '../game/content/items.ts';
import { REQUESTS } from '../render/profile.ts';
import { TARGETS } from '../game/balance/targets.ts';
import { mean, median, paired, quantile, stderr } from '../game/balance/lab.ts';
import { rng, shuffle, int, derive } from '../game/rng.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const WRITE = !argv.includes('--no-write');
const OUT = argv.find((a) => a.startsWith('--out='))?.slice(6);
const N = QUICK
  ? {
      runs: 160,
      others: 80,
      heroes: 80,
      items: 80,
      cards: 60,
      snaps: 14,
      enc: 14,
      bench: 8,
      events: 6,
      chaos: 200,
      pairs: 10,
    }
  : {
      runs: 400,
      others: 200,
      heroes: 200,
      items: 200,
      cards: 160,
      snaps: 40,
      enc: 36,
      bench: 16,
      events: 16,
      chaos: 800,
      pairs: 24,
    };

const FAMS = ['blade', 'shield', 'ink', 'coin'];
const PLAIN = { blade: 'fist', shield: 'folder', ink: 'ink', coin: 'clip' };
const PASSIVES = Object.values(ITEMS)
  .filter((d) => d.kind === 'passive')
  .map((d) => d.id);
const ACTIVES = Object.values(ITEMS)
  .filter((d) => d.kind === 'active')
  .map((d) => d.id);
const POCKET_IDS = Object.keys(POCKETS);
const FINISH_IDS = ['sharp', 'gild', 'seal', 'copy', 'laminate'];
const ALL_UNLOCKS = REQUESTS.map((r) => r.id);
const CARD_IDS = rewardPool(ALL_UNLOCKS);
const STARTER_RELICS = new Set(Object.values(CHARACTERS).map((c) => c.relic));

// ── Worker pool ──────────────────────────────────────────────────────

class Pool {
  constructor(size) {
    this.idle = [];
    this.jobs = [];
    this.pending = new Map();
    this.seq = 0;
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./balance-worker.mjs', import.meta.url));
      w.on('message', (m) => this.done(w, m));
      w.on('error', (err) => {
        console.error('worker failed:', err);
        process.exit(2);
      });
      this.idle.push(w);
      return w;
    });
  }
  map(fn, specs, chunk = 8) {
    if (!specs.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const out = Array.from({ length: specs.length });
      let left = Math.ceil(specs.length / chunk);
      for (let i = 0; i < specs.length; i += chunk) {
        const id = this.seq++;
        const at = i;
        this.pending.set(id, {
          ok: (res) => {
            res.forEach((r, k) => (out[at + k] = r));
            if (--left === 0) resolve(out);
          },
          fail: reject,
        });
        this.jobs.push({ id, fn, specs: specs.slice(i, i + chunk) });
      }
      this.pump();
    });
  }
  pump() {
    while (this.idle.length && this.jobs.length) this.idle.pop().postMessage(this.jobs.shift());
  }
  done(w, m) {
    const p = this.pending.get(m.id);
    this.pending.delete(m.id);
    this.idle.push(w);
    if (m.error) p.fail(new Error(m.error));
    else p.ok(m.out);
    this.pump();
  }
  close() {
    for (const w of this.workers) w.terminate();
  }
}

const pool = new Pool(Math.max(1, os.availableParallelism() - 1));
const T0 = Date.now();
const stage = async (name, body) => {
  const t = Date.now();
  process.stdout.write(`… ${name}`);
  const res = await body();
  process.stdout.write(` — ${((Date.now() - t) / 1000).toFixed(1)} с\n`);
  return res;
};

// ── Helpers ──────────────────────────────────────────────────────────

const seeds = (n, from = 1) => Array.from({ length: n }, (_, k) => from + k);
const pctx = (x, d = 0) => `${(x * 100).toFixed(d).replace('.', ',')}%`;
const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const signed = (x, d = 1, unit = '') => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d).replace('.', ',')}${unit}` : '—');
const pp = (x) => signed(x * 100, 1, ' п.п.');
const cardName = (id) => CARDS[id]?.name ?? id;
const FAM_NAME = {
  blade: 'удар',
  shield: 'защита',
  ink: 'чернила',
  coin: 'бухгалтерия',
};
const itemName = (id) => ITEMS[id]?.name ?? POCKETS[id]?.name ?? id;
const enemyName = (id) => ENEMIES[id]?.name ?? id;
const encName = (list) => list.map(enemyName).join(' + ');
const geo = (xs) => (xs.length ? Math.exp(mean(xs.map((x) => Math.log(Math.max(1e-6, x))))) : NaN);
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

/** Deterministic sample of up to k items. */
function sample(list, k, salt) {
  const r = rng(derive(1234, salt));
  return shuffle(r, [...list]).slice(0, k);
}

// ── A. Whole runs ────────────────────────────────────────────────────

const VETERAN = { unlocked: ALL_UNLOCKS, pockets: ['coffee'], coins: 25 };
const RUN_CONFIGS = {
  greedy: {
    title: 'Жадный бот (стажёр, без открытий)',
    spec: { policy: 'greedy', snapshots: true },
    n: N.runs,
  },
  randomCards: {
    title: 'Случайные фишки',
    spec: { policy: 'randomCards' },
    n: N.others,
  },
  noCards: {
    title: 'Без новых фишек',
    spec: { policy: 'noCards' },
    n: N.others,
  },
  random: { title: 'Случайные ходы', spec: { policy: 'random' }, n: N.others },
  eraserMatch: {
    title: 'Стажёр ловит ластиком совпадения',
    spec: { policy: 'greedy', erase: 'match' },
    n: N.others,
  },
  accountant: {
    title: 'Бухгалтер (без открытий)',
    spec: { policy: 'greedy', char: 'accountant' },
    n: N.heroes,
  },
  janitor: {
    title: 'Уборщик (без открытий)',
    spec: { policy: 'greedy', char: 'janitor' },
    n: N.heroes,
  },
  vetIntern: {
    title: 'Стажёр, всё открыто',
    spec: { policy: 'greedy', ...VETERAN },
    n: N.heroes,
  },
  vetAccountant: {
    title: 'Бухгалтер, всё открыто',
    spec: { policy: 'greedy', char: 'accountant', ...VETERAN },
    n: N.heroes,
  },
  vetJanitor: {
    title: 'Уборщик, всё открыто',
    spec: { policy: 'greedy', char: 'janitor', ...VETERAN },
    n: N.heroes,
  },
  full4: {
    title: '4 отдела, всё открыто (стажёр)',
    spec: { policy: 'greedy', lastAct: 3, snapshots: true, ...VETERAN },
    n: N.heroes,
  },
};

function summarize(results, lastAct = 2) {
  const n = results.length;
  const won = results.filter((r) => r.won).length;
  const acts = Array.from({ length: lastAct + 1 }, (_, a) => a);
  const reached = (a) => results.filter((r) => r.won || r.act >= a).length;
  const cleared = (a) => results.filter((r) => r.won || r.act > a).length;
  const fights = results.flatMap((r) => r.fights ?? []);
  const by = (a, kind) => fights.filter((f) => f.act === a && f.kind === kind);
  const hurt = (f) => (f.hpBefore - f.hpAfter) / f.maxHp;
  const s = {
    n,
    win: won / n,
    clear: acts.map((a) => cleared(a) / n),
    deathRate: acts.map((a) => (reached(a) ? (reached(a) - cleared(a)) / reached(a) : 0)),
    floors: mean(results.map((r) => r.floors)),
    stuck: results.filter((r) => r.stuck).length,
    stuckSeeds: results.filter((r) => r.stuck).map((r) => r.seed),
    violations: results.flatMap((r) => r.violations.map((v) => `сид ${r.seed}: ${v}`)),
    kinds: {},
    causes: {},
    diedIn: {},
    deck: mean(results.map((r) => r.deck)),
    relics: mean(results.map((r) => r.relics.length)),
    maxMult: results.map((r) => r.maxMult),
    maxHit: results.map((r) => r.maxHit),
    shards: mean(results.map((r) => r.shards)),
    freeShare: (() => {
      const free = results.reduce((s, r) => s + r.dmgFree, 0);
      const all = free + results.reduce((s, r) => s + r.dmgMoves, 0);
      return all ? free / all : 0;
    })(),
    freePerMove:
      results.reduce((s, r) => s + r.freeActions, 0) /
      Math.max(
        1,
        results.reduce((s, r) => s + r.moves, 0),
      ),
    coinsEnd: mean(results.map((r) => r.coinsEnd)),
    bossHp: acts.map((a) => mean(results.map((r) => r.bossHp[a]).filter((x) => x !== undefined))),
  };
  for (const a of acts)
    for (const kind of ['fight', 'elite', 'boss']) {
      const f = by(a, kind);
      s.kinds[`${a}.${kind}`] = {
        n: f.length,
        moves: mean(f.map((x) => x.moves)),
        acts: mean(f.map((x) => x.enemyActs)),
        hurt: mean(f.map(hurt)),
        loss: f.length ? f.filter((x) => !x.won).length / f.length : 0,
        fast: f.length ? f.filter((x) => x.won && x.moves <= 5).length / f.length : 0,
        zeroActs: f.length ? f.filter((x) => x.won && x.enemyActs === 0).length / f.length : 0,
        maxHitRatio: quantile(
          f.map((x) => x.maxHit / Math.max(1, x.enemyHp)),
          0.9,
        ),
      };
    }
  for (const r of results)
    if (!r.won) {
      const k = `${r.act}|${r.cause || '?'}`;
      s.causes[k] = (s.causes[k] ?? 0) + 1;
      const d = `${r.act}|${r.diedIn || '?'}`;
      s.diedIn[d] = (s.diedIn[d] ?? 0) + 1;
    }
  // Shops and map.
  const shops = results.flatMap((r) => r.shops ?? []);
  s.shops = acts.map((a) => {
    const list = shops.filter((x) => x.act === a);
    const bought = {};
    for (const x of list) for (const b of x.bought) bought[b] = (bought[b] ?? 0) + 1;
    return {
      n: list.length,
      coins: mean(list.map((x) => x.coins)),
      coinsMed: median(list.map((x) => x.coins)),
      buy: list.length ? list.filter((x) => x.bought.length).length / list.length : 0,
      bought,
    };
  });
  s.shopBuy = shops.length ? shops.filter((x) => x.bought.length).length / shops.length : 0;
  s.nodes = acts.map((a) => {
    const out = {};
    const inAct = results.filter((r) => r.won || r.act >= a);
    for (const r of inAct) for (const [k, v] of Object.entries(r.nodes ?? {})) if (k.startsWith(`${a}:`)) out[k.slice(2)] = (out[k.slice(2)] ?? 0) + v;
    for (const k of Object.keys(out)) out[k] /= Math.max(1, inAct.length);
    return out;
  });
  s.rests = {
    heal: mean(results.map((r) => r.rests.heal)),
    upgrade: mean(results.map((r) => r.rests.upgrade)),
  };
  return s;
}

const runs = {};
const runSummary = {};
await stage('забеги (политики, герои, 4 отдела)', async () => {
  const jobs = [];
  for (const [key, cfg] of Object.entries(RUN_CONFIGS)) for (const seed of seeds(cfg.n)) jobs.push({ key, spec: { seed, check: true, ...cfg.spec } });
  const out = await pool.map(
    'run',
    jobs.map((j) => j.spec),
    4,
  );
  for (const key of Object.keys(RUN_CONFIGS)) runs[key] = [];
  jobs.forEach((j, k) => runs[j.key].push(out[k]));
  for (const [key, cfg] of Object.entries(RUN_CONFIGS)) runSummary[key] = summarize(runs[key], cfg.spec.lastAct ?? 2);
});

// ── Snapshot pools: the builds heroes really bring to each fight ─────

const POOLS = [0, 1, 2, 3].map(() => ({
  weak: [],
  strong: [],
  elite: [],
  boss: [],
  all: [],
}));
for (const [key, act] of [
  ['greedy', [0, 1, 2]],
  ['full4', [3]],
])
  for (const r of runs[key])
    for (const s of r.snapshots ?? []) {
      if (!act.includes(s.act)) continue;
      const p = POOLS[s.act];
      p.all.push(s);
      if (s.kind === 'fight') (s.index < 2 ? p.weak : p.strong).push(s);
      else p[s.kind].push(s);
    }
const LAB_ACTS = [0, 1, 2, 3].filter((a) => POOLS[a].all.length);

/** Snapshots of an act mixed like a run: half fights, a quarter elites, a quarter bosses. */
function mixed(a, k, salt) {
  const p = POOLS[a];
  const elites = sample(p.elite, Math.round(k / 4), `${salt}:e${a}`);
  const bosses = sample(p.boss, Math.round(k / 4), `${salt}:b${a}`);
  const fights = sample([...p.weak, ...p.strong], k - elites.length - bosses.length, `${salt}:f${a}`);
  return [...fights, ...elites, ...bosses];
}

// ── B. Encounters: every enemy group of every act, with builds of that point of the act ──

const encounters = [];
await stage('встречи отделов', async () => {
  const specs = [];
  for (const a of LAB_ACTS) {
    const act = ACTS[a];
    const groups = [
      ...act.weak.map((e) => ({ stage: 'weak', kind: 'fight', enemies: e })),
      ...act.strong.map((e) => ({
        stage: 'strong',
        kind: 'fight',
        enemies: e,
      })),
      ...act.elites.map((e) => ({ stage: 'elite', kind: 'elite', enemies: e })),
      { stage: 'boss', kind: 'boss', enemies: [act.boss] },
    ];
    for (const g of groups) {
      const src = POOLS[a][g.stage].length ? POOLS[a][g.stage] : POOLS[a].all;
      const snaps = sample(src, N.enc, `enc:${a}:${g.enemies.join('+')}`);
      const enc = { act: a, ...g, results: [], from: specs.length };
      encounters.push(enc);
      snaps.forEach((s, k) =>
        specs.push({
          act: a,
          kind: g.kind,
          enemies: g.enemies,
          build: s.build,
          seed: 7000 + k,
          check: true,
        }),
      );
      enc.to = specs.length;
    }
  }
  const out = await pool.map('fight', specs, 6);
  for (const e of encounters) {
    const res = out.slice(e.from, e.to);
    const maxHp = specs.slice(e.from, e.to).map((s) => s.build.maxHp);
    e.n = res.length;
    e.loss = mean(res.map((r) => (r.won ? 0 : 1)));
    e.hurt = mean(res.map((r, k) => r.hpLost / maxHp[k]));
    e.moves = mean(res.map((r) => r.moves));
    e.acts = mean(res.map((r) => r.enemyActs));
    e.stuck = res.filter((r) => r.stuck).length;
    e.timeout = res.filter((r) => r.timeout).length;
    e.violations = res.flatMap((r) => r.violations);
    e.hurtBy = {};
    for (const r of res) for (const [k, v] of Object.entries(r.hurtBy)) e.hurtBy[k] = (e.hurtBy[k] ?? 0) + v / res.length;
  }
  for (const a of LAB_ACTS) {
    const normal = encounters.filter((e) => e.act === a && (e.stage === 'weak' || e.stage === 'strong'));
    const med = median(normal.map((e) => e.hurt));
    for (const e of encounters.filter((x) => x.act === a)) {
      const ref = e.stage === 'elite' ? median(encounters.filter((x) => x.act === a && x.stage === 'elite').map((x) => x.hurt)) : med;
      e.spike = e.stage !== 'boss' && e.hurt > 3 * ref && e.hurt > 0.15;
      e.free = e.hurt < 0.01 && e.loss === 0;
    }
    const weak = normal.filter((e) => e.stage === 'weak');
    const strong = normal.filter((e) => e.stage === 'strong');
    if (weak.length && strong.length) encounters.find((e) => e.act === a).weakVsStrong = [mean(weak.map((e) => e.hurt)), mean(strong.map((e) => e.hurt))];
  }
});

// ── C. Variant lab: every item, skill, pocket, finish and card added to real builds ──

function bestCardIndex(deck, finish) {
  const rank = { starter: 0, common: 1, uncommon: 2, rare: 3, status: -1 };
  let best = -1;
  for (let k = 0; k < deck.length; k++) {
    const d = CARDS[deck[k].id];
    if (!d || d.rarity === 'status' || deck[k].finish === finish) continue;
    if (best < 0) {
      best = k;
      continue;
    }
    const b = CARDS[deck[best].id];
    const val = (c) => (c.up ? CARDS[c.id].vUp : CARDS[c.id].v);
    if (rank[d.rarity] > rank[b.rarity] || (rank[d.rarity] === rank[b.rarity] && val(deck[k]) > val(deck[best]))) best = k;
  }
  return best;
}

function variantsOf(b) {
  const v = new Map();
  v.set('base', b);
  v.set('noPockets', { ...b, pockets: b.pockets.map(() => null) });
  v.set('noActive', { ...b, active: null });
  for (const fam of FAMS)
    v.set(`plain:${fam}`, {
      ...b,
      deck: [...b.deck, { id: PLAIN[fam] }, { id: PLAIN[fam] }],
    });
  for (const id of PASSIVES)
    if (b.relics.includes(id)) v.set(`minus:${id}`, { ...b, relics: b.relics.filter((x) => x !== id) });
    else v.set(`item:${id}`, { ...b, relics: [...b.relics, id] });
  for (const id of ACTIVES) v.set(`active:${id}`, { ...b, active: id });
  for (const id of POCKET_IDS)
    v.set(`pocket:${id}`, {
      ...b,
      pockets: b.pockets.map((_, k) => (k === 0 ? id : null)),
    });
  for (const f of FINISH_IDS) {
    const k = bestCardIndex(b.deck, f);
    if (k >= 0)
      v.set(`finish:${f}`, {
        ...b,
        deck: b.deck.map((c, i) => (i === k ? { ...c, finish: f } : c)),
      });
  }
  for (const id of CARD_IDS) {
    v.set(`card:${id}`, { ...b, deck: [...b.deck, { id }, { id }] });
    v.set(`cardUp:${id}`, {
      ...b,
      deck: [...b.deck, { id, up: true }, { id, up: true }],
    });
  }
  return v;
}

/** Pairs (a → b) the variant lab compares, per snapshot. */
function comparisons(b) {
  const out = [];
  for (const id of PASSIVES)
    out.push(b.relics.includes(id) ? { group: 'item', id, a: `minus:${id}`, b: 'base' } : { group: 'item', id, a: 'base', b: `item:${id}` });
  for (const id of ACTIVES) out.push({ group: 'active', id, a: 'noActive', b: `active:${id}` });
  for (const id of POCKET_IDS) out.push({ group: 'pocket', id, a: 'noPockets', b: `pocket:${id}` });
  for (const f of FINISH_IDS) out.push({ group: 'finish', id: f, a: 'base', b: `finish:${f}` });
  for (const id of CARD_IDS) {
    out.push({
      group: 'cardRule',
      id,
      a: `plain:${CARDS[id].fam}`,
      b: `card:${id}`,
    });
    out.push({ group: 'cardTake', id, a: 'base', b: `card:${id}` });
    out.push({ group: 'cardUp', id, a: `card:${id}`, b: `cardUp:${id}` });
  }
  return out;
}

const lab = {}; // `${group}:${id}` → { act → { hp: [], dead: [], moves: [] } }
const labSnaps = [];
await stage('лаборатория предметов, навыков, карманов, отделки и фишек', async () => {
  const specs = [];
  const index = [];
  for (const a of LAB_ACTS)
    for (const s of mixed(a, N.snaps, 'lab')) {
      const j = labSnaps.length;
      labSnaps.push(s);
      const keys = new Map();
      for (const [key, build] of variantsOf(s.build)) {
        keys.set(key, specs.length);
        specs.push({
          act: s.act,
          kind: s.kind,
          enemies: s.enemies,
          build,
          seed: 50000 + j,
        });
      }
      index.push(keys);
    }
  const out = await pool.map('fight', specs, 12);
  labSnaps.forEach((s, j) => {
    const keys = index[j];
    const get = (k) => out[keys.get(k)];
    for (const c of comparisons(s.build)) {
      const A = get(c.a);
      const B = get(c.b);
      if (!A || !B) continue;
      const slot = ((lab[`${c.group}:${c.id}`] ??= {})[s.act] ??= {
        hp: [],
        dead: [],
        moves: [],
        kind: [],
      });
      slot.hp.push((A.hpLost - B.hpLost) / s.build.maxHp);
      slot.dead.push((A.dead ? 1 : 0) - (B.dead ? 1 : 0));
      slot.moves.push(A.moves - B.moves);
      slot.kind.push(s.kind);
    }
  });
});

/** Mean saving over all lab acts (hp share, deaths, moves) with standard errors. */
function labStat(key) {
  const acts = lab[key] ?? {};
  const all = { hp: [], dead: [], moves: [] };
  const per = {};
  for (const [a, v] of Object.entries(acts)) {
    all.hp.push(...v.hp);
    all.dead.push(...v.dead);
    all.moves.push(...v.moves);
    per[a] = { hp: mean(v.hp), dead: mean(v.dead), moves: mean(v.moves) };
  }
  return {
    hp: mean(all.hp),
    hpSe: stderr(all.hp),
    dead: mean(all.dead),
    moves: mean(all.moves),
    per,
    n: all.hp.length,
  };
}

// ── D. Whole runs with one item or card from the start (paired with the plain runs) ──

const runAB = {};
await stage('забеги с предметом или фишкой со старта', async () => {
  const jobs = [];
  const add = (key, spec, n) => {
    for (const seed of seeds(n)) jobs.push({ key, spec: { seed, policy: 'greedy', lite: true, ...spec } });
  };
  for (const id of PASSIVES) if (!STARTER_RELICS.has(id)) add(`item:${id}`, { relics: [id] }, N.items);
  for (const id of ACTIVES) if (id !== CHARACTERS.intern.active) add(`active:${id}`, { relics: [id] }, N.items);
  for (const fam of FAMS) add(`plain:${fam}`, { cards: [{ id: PLAIN[fam] }] }, N.cards);
  for (const fam of FAMS) add(`minus:${fam}`, { without: [PLAIN[fam]] }, N.cards);
  for (const id of CARD_IDS) add(`card:${id}`, { cards: [{ id }] }, N.cards);
  const out = await pool.map(
    'run',
    jobs.map((j) => j.spec),
    4,
  );
  jobs.forEach((j, k) => (runAB[j.key] ??= []).push(out[k]));
});

function runDelta(key, baseKey) {
  const v = runAB[key];
  const base = baseKey ? runAB[baseKey] : runs.greedy.slice(0, v?.length ?? 0);
  if (!v || !base) return null;
  const n = Math.min(v.length, base.length);
  const w = paired(
    base.slice(0, n).map((r) => (r.won ? 1 : 0)),
    v.slice(0, n).map((r) => (r.won ? 1 : 0)),
  );
  const f = paired(
    base.slice(0, n).map((r) => r.floors),
    v.slice(0, n).map((r) => r.floors),
  );
  return {
    win: w.diff,
    winSe: w.se,
    floors: f.diff,
    floorsSe: f.se,
    n,
    rate: mean(v.slice(0, n).map((r) => (r.won ? 1 : 0))),
  };
}

// ── E. Damage benchmark: 10 moves against the act's boss that cannot die or act ──

const bench = {}; // key → act → [ratios]; 'base' → act → [dps]
const pairsDps = {};
await stage('урон за ход и связки предметов', async () => {
  const specs = [];
  const meta = [];
  const passives = PASSIVES.filter((id) => !STARTER_RELICS.has(id));
  for (const a of LAB_ACTS) {
    const snaps = sample(POOLS[a].all, N.bench, `bench:${a}`);
    snaps.forEach((s, j) => {
      const push = (key, build) => {
        meta.push({ key, act: a, j });
        specs.push({
          act: a,
          kind: 'boss',
          enemies: [ACTS[a].boss],
          build,
          seed: 90000 + j,
          dev: { freeze: true, enemyHp: 1000 },
          moves: 10,
        });
      };
      const b = s.build;
      push('base', b);
      for (const id of passives) if (!b.relics.includes(id)) push(`item:${id}`, { ...b, relics: [...b.relics, id] });
      for (const id of CARD_IDS) push(`card:${id}`, { ...b, deck: [...b.deck, { id }, { id }] });
      if (j < N.pairs)
        for (let x = 0; x < passives.length; x++)
          for (let y = x + 1; y < passives.length; y++) {
            const A = passives[x];
            const B = passives[y];
            if (b.relics.includes(A) || b.relics.includes(B)) continue;
            push(`pair:${A}+${B}`, { ...b, relics: [...b.relics, A, B] });
          }
    });
  }
  const out = await pool.map('fight', specs, 16);
  // bench[key][act][snapshot] = damage per move (base) or its ratio to the base (variants).
  meta.forEach((m, k) => {
    if (m.key === 'base') ((bench.base ??= {})[m.act] ??= {})[m.j] = out[k].damage / 10;
  });
  meta.forEach((m, k) => {
    const b0 = bench.base[m.act]?.[m.j];
    if (m.key !== 'base' && b0 > 0) ((bench[m.key] ??= {})[m.act] ??= {})[m.j] = out[k].damage / 10 / b0;
  });
  // Pair synergy: the pair's gain over the product of the single gains, snapshot by snapshot.
  for (const key of Object.keys(bench).filter((k) => k.startsWith('pair:'))) {
    const [A, B] = key.slice(5).split('+');
    const ratios = [];
    const syn = [];
    for (const [a, byJ] of Object.entries(bench[key]))
      for (const [j, x] of Object.entries(byJ)) {
        ratios.push(x);
        const ra = bench[`item:${A}`]?.[a]?.[j];
        const rb = bench[`item:${B}`]?.[a]?.[j];
        if (ra && rb) syn.push(x / (ra * rb));
      }
    pairsDps[key] = { A, B, ratio: geo(ratios), syn: geo(syn) };
  }
});

const dpsOf = (key) => {
  const all = Object.values(bench[key] ?? {}).flatMap((byJ) => Object.values(byJ));
  return all.length ? geo(all) : NaN;
};

// ── F. Events: every option for heroes of acts 1–3 ──────────────────

const eventStats = [];
await stage('события', async () => {
  const specs = [];
  const meta = [];
  for (const a of [0, 1, 2].filter((x) => POOLS[x].all.length)) {
    const snaps = sample(POOLS[a].all, N.events, `events:${a}`);
    for (const ev of EVENTS)
      ev.options.forEach((_, k) =>
        snaps.forEach((s, j) => {
          meta.push({ id: ev.id, k });
          specs.push({
            act: a,
            build: s.build,
            seed: 30000 + j,
            event: ev.id,
            option: k,
          });
        }),
      );
  }
  const out = await pool.map('event', specs, 12);
  for (const ev of EVENTS)
    ev.options.forEach((o, k) => {
      const res = out.filter((_, i) => meta[i].id === ev.id && meta[i].k === k);
      const open = res.filter((r) => !r.locked);
      const avg = (f) => mean(open.map(f));
      eventStats.push({
        id: ev.id,
        title: ev.title,
        k,
        label: o.label,
        hint: o.hint,
        locked: res.length ? 1 - open.length / res.length : 0,
        hp: avg((r) => r.hp),
        maxHp: avg((r) => r.maxHp),
        coins: avg((r) => r.coins),
        deck: avg((r) => r.deck),
        ups: avg((r) => r.ups),
        finishes: avg((r) => r.finishes),
        curses: avg((r) => r.curses),
        relics: avg((r) => r.relics),
        pockets: avg((r) => r.pockets),
        shards: avg((r) => r.shards),
        fight: avg((r) => (r.fight ? 1 : 0)),
        died: avg((r) => (r.died ? 1 : 0)),
      });
    });
});

// ── G. Chaos: random builds, random places, both bots, invariants on ──

let chaos = { n: 0, violations: [], stuck: 0 };
await stage('хаос-сборки (инварианты)', async () => {
  const r = rng(derive(99, 'chaos'));
  const allCards = Object.keys(CARDS);
  const enemyIds = Object.keys(ENEMIES);
  const specs = [];
  for (let k = 0; k < N.chaos; k++) {
    const deck = Array.from({ length: 5 + int(r, 30) }, () => {
      const id = allCards[int(r, allCards.length)];
      return {
        id,
        ...(int(r, 3) === 0 ? { up: true } : {}),
        ...(int(r, 5) === 0 ? { finish: FINISH_IDS[int(r, FINISH_IDS.length)] } : {}),
      };
    });
    const relics = shuffle(r, [...PASSIVES]).slice(0, int(r, 12));
    const act = int(r, ACTS.length);
    const kind = ['fight', 'elite', 'boss'][int(r, 3)];
    const enemies = int(r, 2) ? Array.from({ length: 1 + int(r, 3) }, () => enemyIds[int(r, enemyIds.length)]) : [];
    const maxHp = 20 + int(r, 120);
    specs.push({
      act,
      kind,
      enemies,
      build: {
        char: ['intern', 'accountant', 'janitor'][int(r, 3)],
        deck,
        relics,
        active: int(r, 4) ? ACTIVES[int(r, ACTIVES.length)] : null,
        pockets: Array.from({ length: 5 }, () => (int(r, 2) ? POCKET_IDS[int(r, POCKET_IDS.length)] : null)),
        hp: 1 + int(r, maxHp),
        maxHp,
        coins: int(r, 400),
      },
      seed: 200000 + k,
      policy: int(r, 3) ? 'greedy' : 'random',
      check: true,
    });
  }
  const out = await pool.map('fight', specs, 8);
  chaos = {
    n: out.length,
    violations: out.flatMap((f, k) => f.violations.map((v) => `хаос #${k} (${specs[k].enemies.join('+') || specs[k].kind}, отдел ${specs[k].act + 1}): ${v}`)),
    stuck: out.filter((f) => f.stuck).length,
    timeout: out.filter((f) => f.timeout).length,
    stuckCases: out
      .map((f, k) => (f.stuck || f.timeout ? k : -1))
      .filter((k) => k >= 0)
      .slice(0, 5)
      .map((k) => ({ k, spec: specs[k], timeout: out[k].timeout })),
  };
});
pool.close();

// ── Metrics and verdict ──────────────────────────────────────────────

const G = runSummary.greedy;
const metrics = {};
const allViolations = [
  ...Object.values(runSummary).flatMap((s) => s.violations),
  ...encounters.flatMap((e) => e.violations.map((v) => `${encName(e.enemies)}: ${v}`)),
  ...chaos.violations,
];
metrics['engine.violations'] = allViolations.length;
metrics['engine.stuck'] = Object.values(runSummary).reduce((s, x) => s + x.stuck, 0) + encounters.reduce((s, e) => s + e.stuck, 0) + chaos.stuck;
metrics['engine.stalls'] = encounters.reduce((s, e) => s + e.timeout, 0);
metrics['greedy.win'] = G.win;
G.clear.forEach((x, a) => (metrics[`greedy.clear.${a}`] = x));
G.deathRate.forEach((x, a) => (metrics[`greedy.deathRate.${a}`] = x));
metrics['randomCards.gap'] = G.win - runSummary.randomCards.win;
metrics['noCards.win'] = runSummary.noCards.win;
for (const a of [0, 1, 2]) {
  metrics[`greedy.fight.moves.${a}`] = G.kinds[`${a}.fight`].moves;
  metrics[`greedy.fight.acts.${a}`] = G.kinds[`${a}.fight`].acts;
  metrics[`greedy.boss.moves.${a}`] = G.kinds[`${a}.boss`].moves;
  metrics[`greedy.boss.hurt.${a}`] = G.kinds[`${a}.boss`].hurt;
  metrics[`greedy.elite.hurt.${a}`] = G.kinds[`${a}.elite`].hurt;
  metrics[`greedy.boss.fast.${a}`] = G.kinds[`${a}.boss`].fast;
}
metrics['encounters.spikes'] = encounters.filter((e) => e.spike).length;
metrics['encounters.free'] = encounters.filter((e) => e.free).length;

// Items: run delta from the start + fight-lab saving.
const itemRows = PASSIVES.map((id) => {
  const run = STARTER_RELICS.has(id) ? null : runDelta(`item:${id}`);
  const fight = labStat(`item:${id}`);
  const dps = dpsOf(`item:${id}`);
  let verdict = 'ok';
  if (run && run.win - 2 * run.winSe > 0.2) verdict = 'op';
  else if (run && run.win + 2 * run.winSe < -0.03 && fight.hp + 2 * fight.hpSe < 0) verdict = 'harmful';
  else if (run && Math.abs(run.win) < 0.03 && Math.abs(run.floors) < 0.5 && Math.abs(fight.hp) < 0.01 && !(dps > 1.05)) verdict = 'weak';
  return { id, run, fight, dps, verdict };
});
metrics['items.op'] = itemRows.filter((r) => r.verdict === 'op').length;
metrics['items.harmful'] = itemRows.filter((r) => r.verdict === 'harmful').length;
metrics['items.weak'] = itemRows.filter((r) => r.verdict === 'weak').length;

const cardRows = CARD_IDS.map((id) => {
  const fam = CARDS[id].fam;
  const run = runDelta(`card:${id}`);
  const rule = labStat(`cardRule:${id}`);
  const take = labStat(`cardTake:${id}`);
  const up = labStat(`cardUp:${id}`);
  const dps = dpsOf(`card:${id}`);
  let verdict = 'ok';
  if (run && run.win - 2 * run.winSe > 0.15) verdict = 'op';
  else if (rule.hp + 2 * rule.hpSe < 0 && (!run || run.win < 0)) verdict = 'worse';
  return { id, fam, run, rule, take, up, dps, verdict };
});
metrics['cards.op'] = cardRows.filter((r) => r.verdict === 'op').length;
metrics['cards.worse'] = cardRows.filter((r) => r.verdict === 'worse').length;

const heroWins = ['vetIntern', 'vetAccountant', 'vetJanitor'].map((k) => runSummary[k].win);
metrics['heroes.spread'] = Math.max(...heroWins) - Math.min(...heroWins);
metrics['eraser.gain'] = runSummary.eraserMatch.win - G.win;
metrics['eraser.freeShare'] = runSummary.eraserMatch.freeShare;
metrics['greedy.shops.buy'] = G.shopBuy;
metrics['full4.deathRate.3'] = runSummary.full4.deathRate[3];

const verdicts = TARGETS.map((t) => {
  const v = metrics[t.metric];
  const ok = v !== undefined && Number.isFinite(v) && (t.min === undefined || v >= t.min) && (t.max === undefined || v <= t.max);
  return { ...t, value: v, ok };
});
const failedHard = verdicts.filter((v) => !v.ok && v.hard);

// ── Report ───────────────────────────────────────────────────────────

const show = (t, v) => (v === undefined || !Number.isFinite(v) ? '—' : t.pct ? pctx(v, 1) : num(v, v % 1 ? 1 : 0));
const range = (t) =>
  t.min !== undefined && t.max !== undefined ? `${show(t, t.min)} – ${show(t, t.max)}` : t.min !== undefined ? `≥ ${show(t, t.min)}` : `≤ ${show(t, t.max)}`;
const L = [];
const date = new Date().toISOString().slice(0, 10);
L.push(`# Баланс «Осколков»: отчёт симуляции`);
L.push('');
L.push(
  `${date} · ${QUICK ? 'быстрый прогон (--quick)' : 'полный прогон'} · ${Object.values(RUN_CONFIGS).reduce((s, c) => s + c.n, 0)} забегов + ${Object.values(runAB).reduce((s, x) => s + x.length, 0)} забегов с вариантами + лабораторные бои · ${((Date.now() - T0) / 1000).toFixed(0)} с`,
);
L.push('');
L.push('Сгенерировано `npm run balance`; цели — `game/balance/targets.ts` (по GDD §13), методика — в конце отчёта.');
L.push('');
L.push('## Итог');
L.push('');
L.push(
  table(
    ['', 'Цель', 'Сейчас', 'Норма', 'Откуда'],
    verdicts.map((v) => [v.ok ? '✅' : v.hard ? '❌' : '⚠️', v.title, show(v, v.value), range(v), v.why]),
  ),
);
L.push('');

L.push('## Забеги');
L.push('');
const confRows = Object.entries(RUN_CONFIGS).map(([k, c]) => {
  const s = runSummary[k];
  return [
    c.title,
    String(s.n),
    pctx(s.win, 1),
    s.clear.map((x) => pctx(x)).join(' / '),
    num(s.floors),
    num(s.deck),
    num(s.relics),
    num(median(s.maxMult)),
    num(median(s.maxHit), 0),
  ];
});
L.push(
  table(['Конфигурация', 'Забегов', 'Победы', 'Прошли отделы', 'Этажей', 'Колода', 'Предметов', 'Макс. множ (медиана)', 'Макс. удар (медиана)'], confRows),
);
L.push('');
const EM = runSummary.eraserMatch;
L.push(
  `Ластик как бесплатный ход: если убирать фишку так, чтобы сверху упало совпадение (очередь видна), совпадение срабатывает без траты времени. Стажёр, играющий так, выигрывает ${pctx(EM.win, 1)} против ${pctx(G.win, 1)}; бесплатных действий — ${num(EM.freePerMove, 2)} на ход, они дают ${pctx(EM.freeShare)} всего урона. Остальные разделы считаются с ластиком только на кляксы — как будто бесплатные совпадения закрыты.`,
);
L.push('');
L.push('Состав стартовой колоды (стажёр, забег, разница побед с обычной колодой):');
L.push('');
L.push(
  table(
    ['Семейство', 'Стартовая фишка', '+1 такая же', '−1 из колоды'],
    FAMS.map((fam) => {
      const plus = runDelta(`plain:${fam}`);
      const minus = runDelta(`minus:${fam}`);
      return [
        FAM_NAME[fam],
        cardName(PLAIN[fam]),
        plus ? `${pp(plus.win)} ± ${num(plus.winSe * 100, 1)}` : '—',
        minus ? `${pp(minus.win)} ± ${num(minus.winSe * 100, 1)}` : '—',
      ];
    }),
  ),
);
L.push('');
L.push('Смерти по отделам (доля погибших среди дошедших), жадный бот:');
L.push('');
L.push(
  table(
    ['Отдел', 'Дошли', 'Погибли', 'Чаще всего убивает'],
    G.deathRate.map((d, a) => {
      const top = Object.entries(G.causes)
        .filter(([k]) => k.startsWith(`${a}|`))
        .sort((x, y) => y[1] - x[1])
        .slice(0, 4)
        .map(([k, n]) => `${k.split('|')[1]} (${n})`)
        .join(', ');
      const reached = runs.greedy.filter((r) => r.won || r.act >= a).length;
      return [ACTS[a].name, String(reached), pctx(d, 1), top || '—'];
    }),
  ),
);
L.push('');

L.push('## Темп боёв (жадный бот)');
L.push('');
const paceRows = [];
for (const [key, s, acts] of [
  ['greedy', G, [0, 1, 2]],
  ['full4', runSummary.full4, [0, 1, 2, 3]],
])
  for (const a of acts)
    for (const kind of ['fight', 'elite', 'boss']) {
      const k = s.kinds[`${a}.${kind}`];
      if (!k?.n) continue;
      paceRows.push([
        key === 'greedy' ? ACTS[a].name : `${ACTS[a].name} (всё открыто)`,
        { fight: 'бой', elite: 'начальство', boss: 'босс' }[kind],
        String(k.n),
        num(k.moves),
        num(k.acts),
        pctx(k.zeroActs),
        pctx(k.hurt, 1),
        pctx(k.loss, 1),
        pctx(k.fast),
        num(k.maxHitRatio, 1),
      ]);
    }
L.push(
  table(
    [
      'Отдел',
      'Бой',
      'Боёв',
      'Ходов',
      'Действий врагов',
      'Враг не успел сходить',
      'Потеря здоровья',
      'Поражений',
      'За ≤5 ходов',
      'Макс. удар / здоровье врагов (p90)',
    ],
    paceRows,
  ),
);
L.push('');

L.push('## Урон за ход против здоровья врагов');
L.push('');
L.push('Урон сборок героя за ход (10 ходов по неподвижному боссу отдела) и сколько ходов нужно на врагов отдела при медианном уроне.');
L.push('');
L.push(
  table(
    ['Отдел', 'Урон за ход: p25 / медиана / p75', 'Слабые (ходов)', 'Сильные (ходов)', 'Начальство (ходов)', 'Босс (ходов)'],
    LAB_ACTS.map((a) => {
      const d = Object.values(bench.base?.[a] ?? {});
      const med = median(d);
      const act = ACTS[a];
      const hpOf = (list) => mean(list.map((g) => g.reduce((s, id) => s + ENEMIES[id].hp * act.hpMul, 0)));
      const movesTo = (hp) => (med > 0 ? num(hp / med) : '—');
      return [
        act.name,
        `${num(quantile(d, 0.25), 0)} / ${num(med, 0)} / ${num(quantile(d, 0.75), 0)}`,
        movesTo(hpOf(act.weak)),
        movesTo(hpOf(act.strong)),
        movesTo(hpOf(act.elites)),
        movesTo(ENEMIES[act.boss].hp * act.hpMul),
      ];
    }),
  ),
);
L.push('');

L.push('## Встречи');
L.push('');
L.push(
  `Каждая группа врагов отдела против ${N.enc} реальных сборок из того же места отдела (первые бои — сборки первых боёв и т.д.). Флаги: 🔺 выброс (опаснее тройной медианы), 💤 ничего не стоит.`,
);
L.push('');
L.push(
  table(
    ['Отдел', 'Встреча', 'Где', 'Поражений', 'Потеря здоровья', 'Ходов', 'Действий врагов', 'Кто ранит', ''],
    encounters.map((e) => [
      ACTS[e.act].name,
      encName(e.enemies),
      { weak: 'первые бои', strong: 'бои', elite: 'начальство', boss: 'босс' }[e.stage],
      pctx(e.loss, 1),
      pctx(e.hurt, 1),
      num(e.moves),
      num(e.acts),
      Object.entries(e.hurtBy)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([k, v]) => `${ENEMIES[k] ? enemyName(k) : k === 'ember' ? 'угольки' : k === 'mirror' ? 'отражение' : k} ${num(v, 0)}`)
        .join(', ') || '—',
      e.spike ? '🔺' : e.free ? '💤' : '',
    ]),
  ),
);
L.push('');

const itemVerdict = {
  op: '🔥 имба',
  harmful: '⛔ мешает',
  weak: '💤 слабый',
  ok: '',
};
L.push('## Предметы');
L.push('');
L.push(
  '**Забег** — предмет со старта, та же тысяча решений бота на тех же сидах: разница побед и пройденных этажей. **Бой** — предмет добавлен к реальной сборке в реальном бою: сколько здоровья сберёг (в % от максимума, плюс — лучше), по отделам. **Урон** — во сколько раз вырос урон за ход.',
);
L.push('');
L.push(
  table(
    ['Предмет', 'Редкость', 'Победы', 'Этажи', 'Бой: здоровье', 'по отделам', 'Ходов', 'Урон ×', ''],
    [...itemRows]
      .sort((x, y) => (y.run?.win ?? -9) - (x.run?.win ?? -9))
      .map((r) => [
        itemName(r.id),
        ITEMS[r.id].pool,
        r.run ? `${pp(r.run.win)} ± ${num(r.run.winSe * 100, 1)}` : 'стартовый',
        r.run ? signed(r.run.floors, 1) : '—',
        `${signed(r.fight.hp * 100, 1, '%')} ± ${num(r.fight.hpSe * 100, 1)}`,
        Object.values(r.fight.per)
          .map((v) => signed(v.hp * 100, 0))
          .join(' / '),
        signed(-r.fight.moves, 1),
        num(r.dps, 2),
        itemVerdict[r.verdict],
      ]),
  ),
);
L.push('');
L.push('### Навыки, карманы, отделка');
L.push('');
const activeRows = ACTIVES.map((id) => {
  const s = labStat(`active:${id}`);
  const run = id === CHARACTERS.intern.active ? null : runDelta(`active:${id}`);
  return [
    `${itemName(id)} (навык, ${ITEMS[id].charge})`,
    `${signed(s.hp * 100, 1, '%')} ± ${num(s.hpSe * 100, 1)}`,
    signed(-s.moves, 1),
    run ? `${pp(run.win)} ± ${num(run.winSe * 100, 1)} к ластику` : 'стартовый',
  ];
});
const pocketRows = POCKET_IDS.map((id) => {
  const s = labStat(`pocket:${id}`);
  return [`${itemName(id)} (карман, ${POCKETS[id].price} мон.)`, `${signed(s.hp * 100, 1, '%')} ± ${num(s.hpSe * 100, 1)}`, signed(-s.moves, 1), '—'];
});
const FINISH_NAME = {
  sharp: 'Заточка',
  gild: 'Позолота',
  seal: 'Печать',
  copy: 'Копия',
  laminate: 'Ламинат',
};
const finishRows = FINISH_IDS.map((f) => {
  const s = labStat(`finish:${f}`);
  return [`${FINISH_NAME[f]} (на лучшую карту)`, `${signed(s.hp * 100, 1, '%')} ± ${num(s.hpSe * 100, 1)}`, signed(-s.moves, 1), '—'];
});
L.push(table(['Что', 'Бой: здоровье', 'Ходов', 'Забег'], [...activeRows, ...pocketRows, ...finishRows]));
L.push('');

L.push('## Фишки');
L.push('');
L.push(
  '**Правило** — две копии фишки против двух простых фишек того же семейства (сколько даёт само правило). **Взять** — две копии против пропуска награды. **Повышение** — улучшенная против обычной. **Забег** — одна копия со старта против обычной стартовой колоды. Плюс — лучше.',
);
L.push('');
L.push(
  table(
    ['Фишка', 'Семейство', 'Редкость', 'Правило', 'Взять', 'Повышение', 'Забег', 'Урон ×', ''],
    [...cardRows]
      .sort((x, y) => y.rule.hp - x.rule.hp)
      .map((r) => [
        cardName(r.id),
        FAM_NAME[r.fam],
        CARDS[r.id].rarity,
        `${signed(r.rule.hp * 100, 1, '%')} ± ${num(r.rule.hpSe * 100, 1)}`,
        signed(r.take.hp * 100, 1, '%'),
        signed(r.up.hp * 100, 1, '%'),
        r.run ? `${pp(r.run.win)} ± ${num(r.run.winSe * 100, 1)}` : '—',
        num(r.dps, 2),
        r.verdict === 'op' ? '🔥 имба' : r.verdict === 'worse' ? '⬇️ хуже простой' : '',
      ]),
  ),
);
L.push('');

L.push('## Связки предметов (урон)');
L.push('');
const pairList = Object.values(pairsDps).filter((p) => Number.isFinite(p.syn));
L.push('Сильнее суммы: пара даёт больше, чем произведение её предметов по отдельности (множитель связки > 1).');
L.push('');
L.push(
  table(
    ['Пара', 'Урон ×', 'Связка ×'],
    [...pairList]
      .sort((a, b) => b.syn - a.syn)
      .slice(0, 15)
      .map((p) => [`${itemName(p.A)} + ${itemName(p.B)}`, num(p.ratio, 2), num(p.syn, 2)]),
  ),
);
L.push('');
L.push('Мешают друг другу (связка < 1):');
L.push('');
L.push(
  table(
    ['Пара', 'Урон ×', 'Связка ×'],
    [...pairList]
      .sort((a, b) => a.syn - b.syn)
      .slice(0, 10)
      .map((p) => [`${itemName(p.A)} + ${itemName(p.B)}`, num(p.ratio, 2), num(p.syn, 2)]),
  ),
);
L.push('');
L.push('Самые взрывные пары по урону за ход:');
L.push('');
L.push(
  table(
    ['Пара', 'Урон ×'],
    [...pairList]
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10)
      .map((p) => [`${itemName(p.A)} + ${itemName(p.B)}`, num(p.ratio, 2)]),
  ),
);
L.push('');

L.push('## События');
L.push('');
L.push('Средний итог выбора для героев 1–3-го отделов (выбор доигран: карта выбрана, бой сыгран).');
L.push('');
const d = (x, dd = 1) => (Math.abs(x) < 0.05 ? '' : signed(x, dd));
L.push(
  table(
    ['Событие', 'Выбор', 'Здоровье', 'Макс.', 'Монеты', 'Карты', 'Повыш.', 'Отделка', 'Волокита', 'Предметы', 'Карманы', 'Осколки', 'Бой', 'Закрыт'],
    eventStats.map((e) => [
      e.title,
      e.label,
      d(e.hp),
      d(e.maxHp),
      d(e.coins, 0),
      d(e.deck),
      d(e.ups),
      d(e.finishes),
      d(e.curses),
      d(e.relics, 2),
      d(e.pockets),
      d(e.shards),
      e.fight ? pctx(e.fight) : '',
      e.locked ? pctx(e.locked) : '',
    ]),
  ),
);
L.push('');

L.push('## Экономика и карта (жадный бот)');
L.push('');
L.push(
  table(
    ['Отдел', 'Касс', 'Монет на входе (ср. / медиана)', 'Купили хоть что-то', 'Что покупали'],
    G.shops.map((s, a) => [
      ACTS[a].name,
      String(s.n),
      `${num(s.coins, 0)} / ${num(s.coinsMed, 0)}`,
      pctx(s.buy),
      Object.entries(s.bought)
        .map(([k, v]) => `${{ card: 'фишки', relic: 'предметы', pocket: 'карманы', finish: 'отделка', remove: 'утилизация' }[k] ?? k} ${v}`)
        .join(', ') || '—',
    ]),
  ),
);
L.push('');
L.push(`Монет в конце забега: ${num(G.coinsEnd, 0)} в среднем. Кулер: лечение ${num(G.rests.heal)} / повышение ${num(G.rests.upgrade)} раз за забег.`);
L.push('');
const NODE = {
  fight: 'бои',
  elite: 'начальство',
  event: 'события',
  shop: 'касса',
  rest: 'кулер',
  treasure: 'сейф',
  boss: 'босс',
};
L.push(
  table(
    ['Отдел', 'Узлы за отдел (в среднем)'],
    G.nodes.map((n, a) => [
      ACTS[a].name,
      Object.entries(n)
        .map(([k, v]) => `${NODE[k] ?? k} ${num(v)}`)
        .join(', '),
    ]),
  ),
);
L.push('');

L.push('## Движок');
L.push('');
L.push(
  `Проверено инвариантов: после каждого действия всех забегов, боёв встреч и ${chaos.n} хаос-боёв (случайные колоды 5–35 карт, до 11 предметов, любые враги любого отдела, жадный и случайный бот). Нарушений: ${allViolations.length}, зависаний: ${metrics['engine.stuck']}, бесконечных боёв (800 действий без исхода): ${metrics['engine.stalls']} в реальных сборках, ${chaos.timeout} в хаос-сборках.`,
);
L.push('');
for (const v of allViolations.slice(0, 20)) L.push(`- ${v}`);
for (const [key, s] of Object.entries(runSummary))
  if (s.stuckSeeds.length) L.push(`- зависли забеги «${RUN_CONFIGS[key].title}»: сиды ${s.stuckSeeds.join(', ')}`);
for (const e of encounters) if (e.stuck) L.push(`- зависли бои встречи ${encName(e.enemies)} (${ACTS[e.act].name}): ${e.stuck}`);
for (const e of encounters)
  if (e.timeout) L.push(`- бесконечные бои встречи ${encName(e.enemies)} (${ACTS[e.act].name}): ${e.timeout} — сборка не может ни победить, ни проиграть`);
for (const c of chaos.stuckCases ?? [])
  L.push(
    `- ${c.timeout ? 'бесконечный' : 'зависший'} хаос-бой #${c.k}: ${JSON.stringify({ act: c.spec.act, kind: c.spec.kind, enemies: c.spec.enemies, deck: c.spec.build.deck.map((x) => x.id), relics: c.spec.build.relics, active: c.spec.build.active })}`,
  );
L.push('');
L.push('## Методика');
L.push('');
L.push(
  `- Боты (\`game/bot.ts\`): жадный выбирает ход по оценке первой волны, берёт фишки по таблице ценности, ходит по карте с оглядкой на здоровье. Это нижняя граница умения игрока: живой игрок сильнее.`,
);
L.push(`- Забеги: сиды 1…N, одинаковые для всех вариантов — сравнения парные (одни и те же карты, одни и те же развилки, пока решения не разойдутся).`);
L.push(
  `- Лаборатория: из забегов жадного бота берутся реальные сборки перед каждым боем (колода, предметы, здоровье) — ${LAB_ACTS.map((a) => `${ACTS[a].name}: ${POOLS[a].all.length}`).join(', ')}. В лаборатории бой переигрывается с изменением сборки и тем же сидом.`,
);
L.push('- «± N» — стандартная ошибка; разница меньше двух ошибок — шум.');
L.push(
  `- Размеры выборок: забеги ${N.runs}, другие политики ${N.others}, герои ${N.heroes}, предметы ${N.items}, фишки ${N.cards}, сборок на отдел в лаборатории ${N.snaps}, на встречу ${N.enc}.`,
);
L.push('');

// ── Baseline and diff ────────────────────────────────────────────────

const baseline = {
  date,
  quick: QUICK,
  metrics,
  items: Object.fromEntries(itemRows.map((r) => [r.id, { win: r.run?.win ?? null, fight: r.fight.hp, dps: r.dps }])),
  cards: Object.fromEntries(cardRows.map((r) => [r.id, { rule: r.rule.hp, take: r.take.hp, win: r.run?.win ?? null, dps: r.dps }])),
  encounters: Object.fromEntries(encounters.map((e) => [`${e.act}:${e.enemies.join('+')}`, { loss: e.loss, hurt: e.hurt, moves: e.moves }])),
};
const outDir = OUT ? path.resolve(OUT) : path.join(ROOT, 'docs', 'balance');
const prevPath = path.join(outDir, 'baseline.json');
let prev = null;
try {
  prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
} catch {
  /* first run */
}
if (prev) {
  const changes = [];
  for (const t of TARGETS) {
    const a = prev.metrics?.[t.metric];
    const b = metrics[t.metric];
    if (a === undefined || b === undefined) continue;
    const eps = t.pct ? 0.03 : Math.max(0.5, Math.abs(a) * 0.1);
    if (Math.abs(b - a) > eps) changes.push(`- ${t.title}: ${show(t, a)} → ${show(t, b)}`);
  }
  for (const [id, v] of Object.entries(baseline.items)) {
    const p = prev.items?.[id];
    if (!p) changes.push(`- новый предмет: ${itemName(id)}`);
    else if (p.win !== null && v.win !== null && Math.abs(v.win - p.win) > 0.08) changes.push(`- ${itemName(id)}: победы ${pp(p.win)} → ${pp(v.win)}`);
  }
  for (const [id, v] of Object.entries(baseline.cards)) {
    const p = prev.cards?.[id];
    if (!p) changes.push(`- новая фишка: ${cardName(id)}`);
    else if (Math.abs(v.rule - p.rule) > 0.03) changes.push(`- ${cardName(id)}: правило ${signed(p.rule * 100, 1, '%')} → ${signed(v.rule * 100, 1, '%')}`);
  }
  L.splice(
    L.indexOf('## Забеги'),
    0,
    `## Изменения с прошлого прогона (${prev.date}${prev.quick ? ', быстрый' : ''})`,
    '',
    ...(changes.length ? changes : ['Заметных изменений нет.']),
    '',
  );
}

if (WRITE) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'REPORT.md'), L.join('\n'));
  fs.writeFileSync(prevPath, `${JSON.stringify(baseline, null, 1)}\n`);
}

console.log('');
for (const v of verdicts) console.log(`${v.ok ? 'ok  ' : v.hard ? 'FAIL' : 'warn'} ${v.title}: ${show(v, v.value)} (норма ${range(v)})`);
console.log(`\n${((Date.now() - T0) / 1000).toFixed(0)} с${WRITE ? ' · docs/balance/REPORT.md' : ''}`);
process.exit(failedHard.length ? 1 : 0);

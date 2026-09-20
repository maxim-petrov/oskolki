/**
 * Visible-policy diagnostic, not a forecast of human win rates.
 * node scripts/mirror-defense-audit.mjs --count 100 --class-count 25 \
 *   --output docs/data/mirror-defense-v2.json
 * No shops, build search, future-refill simulation or changes to engine rules.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createGame,
  currentIntent,
  dispatch,
  enemyHitDamage,
  loadGame,
  saveGame,
} from '../game/mirror/engine.ts';
import { legalSwaps } from '../game/mirror/board.ts';
import { ITEMS, RARITIES } from '../game/duel/catalog.ts';
import { chooseMove, rankMoves } from './mirror-balance.mjs';

const HEALING_ITEMS = new Set(['cottonCuffs', 'goldenLining']);
const SOURCE_FILES = [
  'scripts/mirror-defense-audit.mjs',
  'scripts/mirror-balance.mjs',
  'game/mirror/engine.ts',
  'game/mirror/board.ts',
  'game/mirror/items.ts',
  'game/mirror/types.ts',
  'game/duel/catalog.ts',
  'game/duel/campaign.ts',
  'game/duel/loot.ts',
];
const METRICS = [
  'swaps',
  'supers',
  'replies',
  'waves',
  'damage',
  'hpSpent',
  'healing',
  'barrierGranted',
  'levelHealing',
  'roomHealing',
  'defensiveSwaps',
  'freeDamage',
];
const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const round = (n) => Math.round(n * 100) / 100;
const total = (xs, key) => xs.reduce((sum, x) => sum + x[key], 0);
const hashes = () =>
  Object.fromEntries(
    SOURCE_FILES.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(new URL(`../${file}`, import.meta.url)))
        .digest('hex'),
    ]),
  );

function randomPolicy(seed) {
  let value = (seed ^ 0x72ef4913) >>> 0;
  return (s) => {
    const cell = s.board.findIndex((t) => t.kind === 'super' && !t.locked);
    if (cell >= 0) return { type: 'super', cell };
    const moves = legalSwaps(s.board);
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return moves.length
      ? {
          type: 'swap',
          ...moves[Math.floor((value / 4294967296) * moves.length)],
        }
      : null;
  };
}

function reward(s, condition) {
  const item = s.offers
    .filter((id) => condition !== 'avoid-healing' || !HEALING_ITEMS.has(id))
    .sort(
      (a, b) =>
        RARITIES.indexOf(ITEMS[b].rarity) - RARITIES.indexOf(ITEMS[a].rarity),
    )[0];
  const previous = item ? s.hero.gear[ITEMS[item].slot] : null;
  return {
    type: 'reward',
    item:
      item &&
      (!previous ||
        RARITIES.indexOf(ITEMS[item].rarity) >
          RARITIES.indexOf(ITEMS[previous].rarity))
        ? item
        : null,
  };
}

function room(s) {
  return {
    room: s.room + 1,
    startHp: s.hero.hp,
    maxHp: s.hero.maxHp,
    endHp: s.hero.hp,
    won: false,
    flurries: 0,
    maxFlurryRaw: 0,
    maxFlurryHpLoss: 0,
    maxReplyHpLoss: 0,
    ...Object.fromEntries(METRICS.map((key) => [key, 0])),
  };
}

function runRoute(seed, classId, policy, condition, verifyReplay) {
  let s = createGame({ seed, classId, mode: 'route', foe: 0 });
  const choose = policy === 'random' ? randomPolicy(seed) : chooseMove;
  const rooms = [];
  let row = room(s);
  for (
    let step = 0;
    step < 1500 && ['battle', 'camp'].includes(s.phase);
    step++
  ) {
    if (s.phase === 'camp') {
      const hp = s.hero.hp;
      const command = s.rewarded ? { type: 'next' } : reward(s, condition);
      const result = dispatch(s, command);
      assert.equal(result.error, undefined);
      s = result.state;
      if (command.type === 'next') {
        row = room(s);
        row.roomHealing = s.hero.hp - hp;
      }
      continue;
    }
    const before = s,
      command = choose(s);
    assert.ok(command, `No legal action: seed ${seed}, room ${s.room + 1}`);
    if (command.type === 'swap') {
      const ranked = rankMoves(s).find(
        (m) => m.a === command.a && m.b === command.b,
      );
      row.defensiveSwaps += Number(ranked?.prevented > 0);
    }
    const result = dispatch(s, command);
    assert.equal(result.error, undefined);
    s = result.state;
    const levelHealing = (s.hero.level - before.hero.level) * 8;
    row.swaps += Number(command.type === 'swap');
    row.supers += Number(command.type === 'super');
    row.waves += s.last.waves;
    row.damage += s.last.damage;
    row.healing += s.last.healing;
    row.barrierGranted += s.last.barrier;
    row.levelHealing += levelHealing;
    row.hpSpent += before.hero.hp + s.last.healing + levelHealing - s.hero.hp;
    row.endHp = s.hero.hp;
    if (command.type === 'super') row.freeDamage += s.last.damage;
    result.frames.forEach((frame, index) => {
      if (frame.kind !== 'enemy') return;
      row.replies++;
      const previousHp = index
        ? result.frames[index - 1].heroHp
        : before.hero.hp;
      const loss = previousHp - frame.heroHp;
      row.maxReplyHpLoss = Math.max(row.maxReplyHpLoss, loss);
      if (currentIntent(before).kind === 'flurry') {
        row.flurries++;
        row.maxFlurryHpLoss = Math.max(row.maxFlurryHpLoss, loss);
        row.maxFlurryRaw = Math.max(
          row.maxFlurryRaw,
          enemyHitDamage(before).reduce((sum, n) => sum + n, 0),
        );
      }
    });
    if (s.phase !== 'battle') {
      row.won = s.phase !== 'lost';
      rooms.push(row);
    }
  }
  assert.ok(['won', 'lost'].includes(s.phase), `Unfinished route: ${seed}`);
  if (verifyReplay)
    assert.deepEqual(
      loadGame(saveGame(s)),
      s,
      `Replay mismatch: ${seed}/${classId}/${policy}/${condition}`,
    );
  return { phase: s.phase, room: s.room + 1, hp: s.hero.hp, rooms };
}

function summarize(runs) {
  const rooms = runs.flatMap((r) => r.rooms),
    deaths = {};
  for (const r of runs)
    if (r.phase === 'lost') deaths[r.room] = (deaths[r.room] ?? 0) + 1;
  return {
    runs: runs.length,
    wins: runs.filter((r) => r.phase === 'won').length,
    firstDeath: Object.keys(deaths).length
      ? Math.min(...Object.keys(deaths).map(Number))
      : null,
    deaths,
    meanFinalHp: round(mean(runs.map((r) => r.hp))),
    perStartedRun: Object.fromEntries(
      METRICS.map((key) => [key, round(total(rooms, key) / runs.length)]),
    ),
    rooms: Array.from({ length: 20 }, (_, i) => {
      const rows = rooms.filter((r) => r.room === i + 1);
      return {
        room: i + 1,
        entered: rows.length,
        survived: rows.filter((r) => r.won).length,
        zeroReplies: rows.filter((r) => r.replies === 0).length,
        sawFlurry: rows.filter((r) => r.flurries > 0).length,
        mean: Object.fromEntries(
          [
            'startHp',
            'maxHp',
            'endHp',
            'swaps',
            'replies',
            'hpSpent',
            'healing',
          ].map((key) => [key, round(mean(rows.map((r) => r[key])))]),
        ),
        maxFlurryRaw: rows.length
          ? Math.max(...rows.map((r) => r.maxFlurryRaw))
          : null,
        maxFlurryHpLoss: rows.length
          ? Math.max(...rows.map((r) => r.maxFlurryHpLoss))
          : null,
        maxReplyHpLoss: rows.length
          ? Math.max(...rows.map((r) => r.maxReplyHpLoss))
          : null,
      };
    }),
    biomes: Array.from({ length: 4 }, (_, i) => {
      const entered = runs.filter((r) => r.room > i * 5).length;
      const rows = rooms.filter((r) => r.room > i * 5 && r.room <= i * 5 + 5);
      return {
        biome: i + 1,
        entered,
        perEnteredRun: Object.fromEntries(
          METRICS.map((key) => [
            key,
            entered ? round(total(rows, key) / entered) : null,
          ]),
        ),
      };
    }),
  };
}

export function audit({
  count = 100,
  classCount = 25,
  onCohort = () => {},
} = {}) {
  for (const n of [count, classCount])
    assert.ok(
      Number.isInteger(n) && n > 0 && n <= 10000,
      'Counts must be integers from 1 to 10000',
    );
  const sourceHashes = hashes(),
    cohorts = [];
  const setups = ['blade', 'elementalist', 'warlock', 'monk'].flatMap(
    (classId) =>
      ['default', 'avoid-healing'].map((condition) => ({
        classId,
        condition,
        policy: 'visible',
        count: classId === 'blade' ? count : classCount,
      })),
  );
  setups.push({
    classId: 'blade',
    condition: 'default',
    policy: 'random',
    count,
  });
  for (const setup of setups) {
    const runs = Array.from({ length: setup.count }, (_, i) =>
      runRoute(
        i + 1,
        setup.classId,
        setup.policy,
        setup.condition,
        i === 0 || i === setup.count - 1,
      ),
    );
    const cohort = {
      classId: setup.classId,
      policy: setup.policy,
      condition: setup.condition,
      seeds: [1, setup.count],
      ...summarize(runs),
    };
    cohorts.push(cohort);
    onCohort(cohort);
  }
  assert.deepEqual(
    hashes(),
    sourceHashes,
    'Sources changed during audit; repeat on stable rules',
  );
  return {
    schema: 'oskolki-mirror-defense-audit-1',
    rules: 2,
    count,
    classCount,
    totalRuns: count * 3 + classCount * 6,
    sourceHashes,
    method: {
      policy:
        'Visible first-wave heuristic or uniform legal swap; both use the first unlocked S. Neither simulates future refills.',
      randomPolicy:
        'Independent LCG (1664525*x+1013904223) modulo 2^32, initialized with seed XOR 0x72ef4913; one draw per swap choice.',
      rewards:
        'Highest offered rarity, replace only an empty slot or lower rarity. No purchases, build optimization or skill changes.',
      avoidHealing:
        'Reject cottonCuffs and goldenLining rewards; keep insurance. This changes gear and later offers, not just healing amounts.',
      hpSpent:
        'Actual HP removed including enemy hits, bombs and item payments, reconstructed as beforeHp + combatHealing + 8*levelDelta - afterHp.',
      barrierGranted:
        'Actual barrier added, not a claim about damage absorbed.',
      defensiveSwaps:
        'Chosen exchanges with positive estimated protection from visible first-wave defense groups.',
      rawFlurry:
        'Declared damage before the action. Same-action weaken procs can lower the eventual hit; HP-loss maxima use actual enemy frames.',
      denominators:
        'Run means include deaths. Room means condition on entering that room. Biome means condition on entering that biome and include interrupted routes.',
      replay:
        'First and last seed of each cohort replayed through saveGame/loadGame.',
      limitation:
        'Automated policy comparison, not human win rates, fun or a balance target.',
    },
    cohorts,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const options = { count: 100, classCount: 25, output: null };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = {
      '--count': 'count',
      '--class-count': 'classCount',
      '--output': 'output',
    }[args[i]];
    if (!key || args[i + 1] === undefined)
      throw new Error(
        'Usage: node scripts/mirror-defense-audit.mjs --count 100 --class-count 25 [--output file.json]',
      );
    options[key] = key === 'output' ? args[i + 1] : Number(args[i + 1]);
  }
  const report = audit({
    ...options,
    onCohort: (c) =>
      console.error(
        JSON.stringify({
          classId: c.classId,
          policy: c.policy,
          condition: c.condition,
          runs: c.runs,
          wins: c.wins,
          firstDeath: c.firstDeath,
          deaths: c.deaths,
        }),
      ),
  });
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.output) {
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, json);
  } else process.stdout.write(json);
}

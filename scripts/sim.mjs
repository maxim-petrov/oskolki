// Balance simulation: node scripts/sim.mjs [runs=40] [policy=all]
import { newRun } from '../game/run.ts';
import { playRun } from '../game/bot.ts';
import { ITEMS } from '../game/content/items.ts';

const N = Number(process.argv[2] ?? 40);
const only = process.argv[3];
const allUnlocked = [...new Set(Object.values(ITEMS).map((i) => i.unlock).filter(Boolean))];
const configs = [
  { name: 'random', policy: 'random', items: true },
  { name: 'first', policy: 'first', items: true },
  { name: 'greedy', policy: 'greedy', items: true },
  { name: 'greedy-noitems', policy: 'greedy', items: false },
].filter((c) => !only || c.name === only);

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : 0);
for (const cfg of configs) {
  const t0 = Date.now();
  const results = [];
  for (let seed = 1; seed <= N; seed++) {
    const { run } = newRun({ seed, unlocked: allUnlocked });
    results.push(playRun(run, { policy: cfg.policy, items: cfg.items, seed }));
  }
  const wins = results.filter((r) => r.won).length;
  const reached = (f) => results.filter((r) => r.won || r.floor >= f).length;
  const bossKills = (id) => results.filter((r) => r.stats.bossesKilled.includes(id)).length;
  const fights = results.flatMap((r) => r.fights);
  const normal = fights.filter((f) => !f.boss);
  const bosses = fights.filter((f) => f.boss);
  const byFloor = [0, 1, 2].map((fl) => normal.filter((f) => f.floor === fl));
  const cascade = results.reduce((s, r) => s + r.stats.cascadeDamage, 0);
  const matchDmg = results.reduce((s, r) => s + r.stats.matchDamage, 0);
  const causes = {};
  for (const r of results) if (!r.won) causes[r.cause || '?'] = (causes[r.cause || '?'] ?? 0) + 1;
  console.log(`\n== ${cfg.name} (${N} runs, ${Date.now() - t0} ms)`);
  console.log(`win ${pct(wins, N)}% | reach floor2 ${pct(reached(1), N)}% floor3 ${pct(reached(2), N)}% | boss kills cabinet ${bossKills('cabinet')} tide ${bossKills('tide')} mirror ${bossKills('mirror')}`);
  console.log(`fight moves (normal) f1 ${avg(byFloor[0].map((f) => f.moves))} f2 ${avg(byFloor[1].map((f) => f.moves))} f3 ${avg(byFloor[2].map((f) => f.moves))} | boss ${avg(bosses.map((f) => f.moves))}`);
  console.log(`enemy acts (normal) f1 ${avg(byFloor[0].map((f) => f.enemyActs))} f2 ${avg(byFloor[1].map((f) => f.enemyActs))} f3 ${avg(byFloor[2].map((f) => f.enemyActs))} | boss ${avg(bosses.map((f) => f.enemyActs))}`);
  console.log(`dmg taken per fight f1 ${avg(byFloor[0].map((f) => f.damageTaken))} f2 ${avg(byFloor[1].map((f) => f.damageTaken))} f3 ${avg(byFloor[2].map((f) => f.damageTaken))} | boss ${avg(bosses.map((f) => f.damageTaken))}`);
  console.log(`cascade share of damage ${pct(cascade, cascade + matchDmg)}% | moves/run ${avg(results.map((r) => r.moves))} | items/run ${avg(results.map((r) => r.stats.itemsTaken))}`);
  console.log('death causes', JSON.stringify(Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 8)));
}

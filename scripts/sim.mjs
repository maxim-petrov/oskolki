// Balance simulation: node scripts/sim.mjs [runs=40] [policy]
import { newRun } from '../game/run.ts';
import { playRun } from '../game/bot.ts';
import { ACTS } from '../game/content/acts.ts';

const N = Number(process.argv[2] ?? 40);
const only = process.argv[3];
const policies = ['greedy', 'randomCards', 'noCards', 'random'].filter((p) => !only || p === only);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : 0);

for (const policy of policies) {
  const t0 = Date.now();
  const results = [];
  for (let seed = 1; seed <= N; seed++) {
    const { run } = newRun({ seed, intro: true });
    results.push(playRun(run, { policy, seed }));
  }
  const wins = results.filter((r) => r.won).length;
  const cleared = (act) => results.filter((r) => r.won || r.act > act).length;
  const fights = results.flatMap((r) => r.fights);
  const by = (act, kind) => fights.filter((f) => f.act === act && f.kind === kind);
  const causes = {};
  for (const r of results) if (!r.won) causes[r.cause || '?'] = (causes[r.cause || '?'] ?? 0) + 1;
  console.log(`\n== ${policy} (${N} runs, ${Date.now() - t0} ms)`);
  console.log(`win ${pct(wins, N)}% | cleared act1 ${pct(cleared(0), N)}% act2 ${pct(cleared(1), N)}% act3 ${pct(cleared(2), N)}%`);
  for (let a = 0; a < 3; a++) {
    const f = by(a, 'fight');
    const e = by(a, 'elite');
    const b = by(a, 'boss');
    console.log(
      `${ACTS[a].name}: fight moves ${avg(f.map((x) => x.moves))} acts ${avg(f.map((x) => x.enemyActs))} dmg ${avg(f.map((x) => x.damageTaken))}` +
        ` | elite moves ${avg(e.map((x) => x.moves))} dmg ${avg(e.map((x) => x.damageTaken))} win ${pct(e.filter((x) => x.won).length, e.length)}%` +
        ` | boss moves ${avg(b.map((x) => x.moves))} dmg ${avg(b.map((x) => x.damageTaken))} win ${pct(b.filter((x) => x.won).length, b.length)}%`,
    );
  }
  const intro = fights.filter((f) => f.kind === 'intro');
  console.log(`intro moves ${avg(intro.map((x) => x.moves))} dmg ${avg(intro.map((x) => x.damageTaken))} | deck ${avg(results.map((r) => r.deck))} relics ${avg(results.map((r) => r.relics))} | max mult ${avg(results.map((r) => r.stats.maxMult))} max hit ${avg(results.map((r) => r.stats.maxHit))} | shards ${avg(results.map((r) => r.stats.shards))}`);
  console.log('death causes', JSON.stringify(Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 8)));
}

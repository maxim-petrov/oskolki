// Balance smoke test: a few dozen runs on fixed seeds with wide bands — it catches a change that
// breaks the game (unwinnable, trivial, stuck), not fine balance. The full check with the targets of
// GDD §13 is `npm run balance` (report in docs/balance/REPORT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, simRun } from '../game/balance/lab.ts';

const runs = (n, spec) => Array.from({ length: n }, (_, k) => simRun({ seed: 1 + k, ...spec }));
const rate = (list, f) => mean(list.map((r) => (f(r) ? 1 : 0)));
const pct = (x) => `${Math.round(x * 100)}%`;

const greedy = runs(24, { policy: 'greedy' });

test('the greedy bot clears the first act most of the time and wins some shifts', () => {
  const act1 = rate(greedy, (r) => r.won || r.act > 0);
  const win = rate(greedy, (r) => r.won);
  assert.ok(act1 >= 0.55, `1-й отдел: ${pct(act1)}`);
  assert.ok(win >= 0.1 && win <= 0.8, `победы: ${pct(win)}`);
  assert.equal(greedy.filter((r) => r.stuck).length, 0);
});

test('fights of the first act take a few moves, its boss a dozen or more', () => {
  const fights = greedy.flatMap((r) => r.fights).filter((f) => f.act === 0);
  const moves = (kind) => mean(fights.filter((f) => f.kind === kind).map((f) => f.moves));
  assert.ok(moves('fight') >= 3 && moves('fight') <= 12, `обычный бой: ${moves('fight').toFixed(1)} хода`);
  assert.ok(moves('boss') >= 8 && moves('boss') <= 30, `босс: ${moves('boss').toFixed(1)} хода`);
});

test('taking no cards is much worse than taking good ones', () => {
  const none = rate(runs(12, { policy: 'noCards' }), (r) => r.won);
  assert.ok(none < rate(greedy, (r) => r.won), `без фишек ${pct(none)}`);
});

test('every hero can clear the first act', () => {
  for (const char of ['accountant', 'janitor']) {
    const act1 = rate(runs(6, { policy: 'greedy', char }), (r) => r.won || r.act > 0);
    assert.ok(act1 >= 0.4, `${char}: 1-й отдел ${pct(act1)}`);
  }
});

test(
  'free actions do not carry the fight',
  {
    todo: 'ластик на совпадения: бесплатные действия дают основную часть урона (см. docs/balance/REPORT.md)',
  },
  () => {
    const list = runs(6, { policy: 'greedy', erase: 'match' });
    const free = list.reduce((s, r) => s + r.dmgFree, 0);
    const all = free + list.reduce((s, r) => s + r.dmgMoves, 0);
    assert.ok(free / all <= 0.35, `бесплатный урон: ${pct(free / all)}`);
  },
);

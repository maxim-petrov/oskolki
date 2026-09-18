// Diagnostic only: a player who makes one visible match then ends the turn.
// No future cascade/RNG search, no automatic skills or puzzle editing.
import * as g from '../game/engine.ts';
import { writeFileSync } from 'node:fs';
export function openingRun(seed, rules) {
  let s = g.startRun(seed, g.DEFAULT_BALANCE, rules);
  const combats = [];
  const take = (r) => {
    if (r.error) throw Error(r.error);
    s = r.state;
    if (!g.isSave(s)) throw Error(`Invalid save ${s.room}/${s.phase}`);
  };
  let steps = 0;
  while (s.room < 5 && s.phase !== 'defeat' && steps++ < 120) {
    if (s.phase === 'battle') {
      if (s.potions && !s.consumed && s.hp <= s.maxHp - 8)
        take(g.consumePotion(s));
      const incoming = s.enemies
        .filter((e) => e.hp > 0)
        .reduce((n, e) => {
          const i = g.intent(s, e);
          return n + (['attack', 'pierce'].includes(i.type) ? i.value : 0);
        }, 0);
      const choices = g
        .validMoves(s.board, g.minimumMatch(s), g.matchRules(s).ring)
        .map((m) => {
          const p = g.previewMove(s, m.axis, m.line, m.amount);
          if (p.error) return null;
          return {
            m,
            score:
              p.targets.reduce(
                (n, e) => n + e.damage + e.poison + (e.defeated ? 6 : 0),
                0,
              ) +
              Math.min(incoming, p.block) * 1.2 +
              p.health * 2,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      if (choices.length) {
        const m = choices[0].m;
        take(g.move(s, m.axis, m.line, m.amount));
      }
      if (s.phase === 'battle') take(g.endTurn(s));
      if (s.phase !== 'battle')
        combats.push({
          room: s.room,
          hp: s.hp,
          rounds: s.round,
          outcome: s.phase,
        });
    } else if (s.phase === 'reward')
      take(g.chooseReward(s, s.offers[0]?.id ?? null, 0));
    else if (s.phase === 'map') {
      const rooms = g.nextRooms(s);
      // Avoid a visible elite, but do not inspect hidden node contents.
      take(
        g.enterRoom(s, (rooms.find((r) => r.kind === 'battle') ?? rooms[0]).id),
      );
    } else if (s.phase === 'event') take(g.eventChoice(s, 'supplies'));
    else throw Error(`Unexpected phase ${s.phase}`);
  }
  if (steps >= 120) throw Error('Opening stalled');
  return { seed, rules, depth: s.room, hp: s.hp, outcome: s.phase, combats };
}
const count = Number(process.argv[2] ?? 32);
const runs = [6, 7].flatMap((rules) =>
  Array.from({ length: count }, (_, i) => openingRun(i + 1, rules)),
);
const summary = [6, 7].map((rules) => {
  const xs = runs.filter((r) => r.rules === rules);
  return {
    rules,
    runs: xs.length,
    deathsByRoom2: xs.filter((r) => r.outcome === 'defeat' && r.depth <= 2)
      .length,
    reachedShop: xs.filter((r) => r.depth === 5).length,
    meanHpAtShop:
      xs.filter((r) => r.depth === 5).reduce((n, r) => n + r.hp, 0) /
      Math.max(1, xs.filter((r) => r.depth === 5).length),
  };
});
const report = {
  policy:
    'One visible match then end turn; potion when 8 HP missing; no skills/edit, first reward, avoid visible elite. Diagnostic sensitivity test, not a human win-rate estimate.',
  summary,
  runs,
};
writeFileSync(
  process.argv[3] ?? '/tmp/oskolki-opening-audit.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(summary, null, 2));

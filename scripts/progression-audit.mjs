// Repeatable ordinary-stat audit of the post-victory slice. No forced enemy deaths.
import * as g from '../game/engine.ts';
import { simulate } from './balance-audit.mjs';
import { writeFileSync } from 'node:fs';
const count = Number(process.argv[2] ?? 4);
if (!Number.isInteger(count) || count < 1 || count > 256)
  throw Error('Seed count must be 1–256.');
const meta = {
  ...g.EMPTY_META,
  wins: 1,
  marks: ['warden:tide-keeper', 'wanderer:redactor'],
};
const modes = [];
for (const hero of ['wanderer', 'warden'])
  for (const difficulty of [0, 1])
    for (const forbidden of [false, true])
      modes.push({ hero, difficulty, forbidden });
for (const { id } of g.CHALLENGES)
  modes.push({
    hero: 'wanderer',
    difficulty: 0,
    forbidden: false,
    challenge: id,
  });
const runs = [];
for (const mode of modes)
  for (let seed = 1; seed <= count; seed++) {
    const r = simulate(
      seed,
      mode.challenge === 'precision'
        ? 'editor'
        : mode.challenge === 'short-circuit'
          ? 'runes'
          : 'balanced',
      {
        start: g.startAdventure(
          seed,
          g.DEFAULT_BALANCE,
          meta,
          mode.hero,
          mode.difficulty,
          mode.challenge,
        ),
        forbidden: mode.forbidden,
      },
    );
    runs.push({
      ...mode,
      seed,
      outcome: r.outcome,
      room: r.depth,
      boss: r.final.enemies[0]?.kind,
      turns: r.turns,
      rooms: r.rooms,
      weapon: r.weapon,
      relics: r.relics,
    });
  }
writeFileSync(
  process.argv[3] ?? '/tmp/oskolki-post-victory-audit.json',
  JSON.stringify(
    {
      policy:
        'Visible first-wave heuristic; ordinary stats. Pre-existing meta unlocks, no forced combat results. Not a human win rate or evidence of fun.',
      runs,
    },
    null,
    2,
  ) + '\n',
);
for (const mode of modes) {
  const rs = runs.filter(
    (r) =>
      r.hero === mode.hero &&
      r.difficulty === mode.difficulty &&
      r.forbidden === mode.forbidden &&
      r.challenge === mode.challenge,
  );
  console.log(
    mode.challenge ??
      `${mode.hero}/${mode.difficulty}/${mode.forbidden ? 'redactor' : 'tide-keeper'}`,
    JSON.stringify({
      wins: rs.filter((r) => r.outcome === 'victory').length,
      runs: rs.length,
      depth: rs.map((r) => r.room),
      maxBattle: Math.max(...rs.flatMap((r) => r.rooms.map((x) => x.turns))),
    }),
  );
}

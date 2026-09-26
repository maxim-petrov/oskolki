// What-if, second try (npm run balance -- --quick --patch=docs/balance/patches/curve2.mjs).
// curve.mjs made the bosses of acts 2–4 long (24–27 moves) and still harmless: they get more
// threat instead of more health; elites a bit softer than in curve.mjs.
import { ACTS } from '../../../game/content/acts.ts';
import { ENEMIES } from '../../../game/content/enemies.ts';

ACTS[2].hpMul = 70;
ACTS[3].hpMul = 100;

const HITS = new Set(['attack', 'heavy', 'strike']);
for (const id of ['tide', 'mirror', 'censor']) {
  const boss = ENEMIES[id];
  boss.hp *= 2;
  for (const list of [boss.intents, ...(boss.phases ?? []).map((p) => p.intents)])
    for (const i of list) if (HITS.has(i.kind)) i.value = Math.round(i.value * 1.4);
}

for (const act of ACTS.slice(1)) {
  act.elites = act.elites.map((group) =>
    group.map((id) => {
      const elite = `${id}_elite`;
      ENEMIES[elite] ??= { ...ENEMIES[id], id: elite, hp: ENEMIES[id].hp * 2 };
      return elite;
    }),
  );
}

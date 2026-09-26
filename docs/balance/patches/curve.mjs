// What-if: a steeper difficulty curve for acts 2–4 (npm run balance -- --quick --patch=docs/balance/patches/curve.mjs).
// The sim shows the boiler room and the directorate barely hurt, the bosses after the first one die in
// a few moves and the elites of acts 2–4 are just two regular enemies.
import { ACTS } from '../../../game/content/acts.ts';
import { ENEMIES } from '../../../game/content/enemies.ts';

// Enemy health grows like the hero's damage: the boiler room and the directorate get tougher.
ACTS[2].hpMul = 110;
ACTS[3].hpMul = 170;

// Bosses of acts 2–4 twice as tough (the first boss is 22 regular enemies, these were 7).
for (const id of ['tide', 'mirror', 'censor']) ENEMIES[id].hp *= 2;

// Elites of acts 2–4: the same enemies with double health.
for (const act of ACTS.slice(1)) {
  act.elites = act.elites.map((group) =>
    group.map((id) => {
      const elite = `${id}_elite`;
      ENEMIES[elite] ??= { ...ENEMIES[id], id: elite, hp: ENEMIES[id].hp * 2 };
      return elite;
    }),
  );
}

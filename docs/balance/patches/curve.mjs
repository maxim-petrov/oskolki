// What-if: a difficulty curve that keeps biting after the first act
// (npm run balance -- --quick --patch=docs/balance/patches/curve.mjs).
//
// The sim (docs/balance/REPORT.md, «Урон за ход»): at the median damage of its act the first boss
// takes 32 moves, the bosses of acts 2–4 only 7–9; elites 9 against 2–3. Regular fights keep the
// same length, but the boiler room and the directorate barely hurt.
import { ACTS } from '../../../game/content/acts.ts';
import { ENEMIES } from '../../../game/content/enemies.ts';

// Tougher regular enemies in the boiler room and the directorate.
ACTS[2].hpMul = 70;
ACTS[3].hpMul = 100;

// Bosses of acts 2–4 as long as the first one.
for (const id of ['tide', 'mirror', 'censor']) ENEMIES[id].hp *= 3;

// Elites of acts 2–4: the same enemies with 2.5× health (the first act has real elites).
for (const act of ACTS.slice(1)) {
  act.elites = act.elites.map((group) =>
    group.map((id) => {
      const elite = `${id}_elite`;
      ENEMIES[elite] ??= { ...ENEMIES[id], id: elite, hp: Math.round(ENEMIES[id].hp * 2.5) };
      return elite;
    }),
  );
}

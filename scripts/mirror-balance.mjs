/** Visible-board policy, never samples future refills while choosing a swap. */
import { pathToFileURL } from 'node:url';
import {
  createGame,
  dispatch,
  saveGame,
  loadGame,
  BARRIER_CAP,
  defenseForGroup,
  enemyHitDamage,
} from '../game/mirror/engine.ts';
import { legalSwaps, findMatches, swapBoard } from '../game/mirror/board.ts';
import { ITEMS, RARITIES } from '../game/duel/catalog.ts';

/** Known next-hit budget; never peek at ward luck, cascades or future refills. */
export function visibleThreat(s) {
  let damage = enemyHitDamage(s).reduce((sum, n) => sum + n, 0);
  if (s.hero.gear.weapon === 'glassNib') damage++;
  if (s.hero.gear.armor === 'coat')
    damage -= Math.min(
      damage,
      Math.max(0, 2 - (s.hero.itemState.cycle.coatAbsorbed ?? 0)),
    );
  return Math.max(0, damage - s.hero.barrier);
}

export function rankMoves(s) {
  const threat = visibleThreat(s),
    ticks = Math.max(1, s.enemy.countdown + s.enemy.delay);
  return legalSwaps(s.board)
    .map((m) => {
      const next = swapBoard(s.board, m);
      let defense = 0;
      let score = findMatches(next).reduce((sum, g) => {
        const enhanced = g.cells.some((i) => next[i].level > 1),
          k = enhanced ? 2.5 : 1;
        let n =
          g.kind === 'strike' || g.kind === 'arcane'
            ? g.casts * (k + g.bonus) * 10
            : g.kind === 'mend'
              ? 0
              : g.casts * (s.hero.rage >= 60 ? 10 : 5);
        if (g.kind === 'mend') defense += defenseForGroup(s, g, next);
        if (
          s.hero.gear.weapon === 'quarterCutter' &&
          g.kind === 'strike' &&
          g.shape === 'three'
        )
          n = 0;
        return sum + n + (g.upgrade === 'super' ? 25 : g.upgrade ? 10 : 0);
      }, 0);
      // Barrier is shared by all groups, persists until the reply and cannot heal.
      const prevented = Math.min(
        threat,
        Math.max(0, BARRIER_CAP - s.hero.barrier),
        defense,
      );
      score +=
        (prevented * (1 + threat / Math.max(1, s.hero.hp))) / Math.sqrt(ticks);
      // Prefer surviving a known imminent hit; no claim about unknown cascades.
      if (ticks === 1 && threat >= s.hero.hp && threat - prevented < s.hero.hp)
        score += 1000;
      return { ...m, score, prevented };
    })
    .sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
}

export function chooseMove(s) {
  const cell = s.board.findIndex((t) => t.kind === 'super' && !t.locked);
  if (cell >= 0) return { type: 'super', cell };
  const ranked = rankMoves(s);
  return ranked[0] ? { type: 'swap', a: ranked[0].a, b: ranked[0].b } : null;
}
export function run(seed = 1, classId = 'blade', gear) {
  let s = createGame({
    seed,
    classId,
    mode: gear ? 'duel' : 'route',
    foe: gear ? 19 : 0,
    ...(gear ? { testGear: gear } : {}),
  });
  let swaps = 0;
  for (
    let count = 0;
    count < 1500 && !['won', 'lost'].includes(s.phase);
    count++
  ) {
    let command;
    if (s.phase === 'camp') {
      if (!s.rewarded) {
        const item = [...s.offers].sort(
          (a, b) =>
            RARITIES.indexOf(ITEMS[b].rarity) -
            RARITIES.indexOf(ITEMS[a].rarity),
        )[0];
        const previous = s.hero.gear[ITEMS[item].slot];
        command = {
          type: 'reward',
          item:
            !previous ||
            RARITIES.indexOf(ITEMS[item].rarity) >
              RARITIES.indexOf(ITEMS[previous].rarity)
              ? item
              : null,
        };
      } else command = { type: 'next' };
    } else command = chooseMove(s);
    if (!command) throw new Error(`No move in seed ${seed} room ${s.room}`);
    const result = dispatch(s, command);
    if (result.error) throw new Error(result.error);
    s = result.state;
    if (command.type === 'swap') swaps++;
  }
  return {
    state: s,
    report: {
      seed,
      classId,
      phase: s.phase,
      room: s.room + 1,
      hp: s.hero.hp,
      swaps,
      super: s.metrics.supers,
      combo: s.metrics.maxCombo,
      commands: s.commands.length,
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const start = Number(process.argv[2] ?? 1),
    count = Number(process.argv[3] ?? 4);
  for (let seed = start; seed < start + count; seed++) {
    const { state, report } = run(seed);
    const replay = loadGame(saveGame(state));
    if (JSON.stringify(replay) !== JSON.stringify(state))
      throw new Error('Replay mismatch');
    console.log(JSON.stringify(report));
  }
}

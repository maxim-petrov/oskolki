import { COLORS, SPELLS, type SpellId } from './catalog.ts';
import {
  blastCells,
  findMatches,
  isColor,
  legalSwaps,
  swapBoard,
  type Match,
  type Tile,
} from '../board.ts';
import {
  manaCap,
  spellError,
  type Command,
  type Duel,
  type Side,
} from './engine.ts';
import { owns, spellPayment } from './item-rules.ts';
// Deliberately receives no refill generator and never calls the dispatcher.
// Exactly the same visible information is available to a human and this policy.
export function chooseAction(s: Duel, side: Side = s.actor): Command | null {
  if (s.phase !== 'battle') return null;
  const me = s[side],
    enemy = s[side === 'hero' ? 'enemy' : 'hero'];
  const candidates: { command: Command; score: number }[] = [];
  const modern = s.version === 2;
  const manaWeight = (color: (typeof COLORS)[number]) => {
    const need = Math.max(
      0,
      ...me.spells.map(
        (id) =>
          ((modern ? spellPayment(me, id).cost : SPELLS[id].cost)[color] ?? 0) -
          me.mana[color],
      ),
    );
    return me.mana[color] >= (modern ? manaCap(me, color) - 2 : 18)
      ? 0.5
      : need > 0
        ? 1.7
        : 1;
  };
  const cellsValue = (
    board: Tile[],
    cells: Iterable<number>,
    groups: Match[] = [],
  ) => {
    let score = 0,
      damage = 0;
    const counts: Record<string, number> = {};
    const suppressed = new Set(
      modern && owns(me, 'quarterCutter')
        ? groups
            .filter((g) => g.kind === 'skull' && g.cells.length === 3)
            .flatMap((g) => g.cells)
        : [],
    );
    for (const i of cells) {
      const t = board[i];
      counts[t.kind] = (counts[t.kind] ?? 0) + 1;
      if (isColor(t.kind)) score += manaWeight(t.kind);
      else if (t.kind === 'skull')
        damage += (suppressed.has(i) ? 0 : 1) + (t.power ?? 0);
      else if (t.kind === 'wild') score += 5;
      else score += side === 'hero' ? 0.6 : 0.2;
    }
    if (damage) damage += Math.floor(me.stats.battle / 3);
    if (modern) {
      const long = groups.some(
        (g) => g.kind === 'skull' && g.cells.length >= 4,
      );
      if (damage) {
        if (owns(me, 'paperKnife')) damage++;
        if (long && owns(me, 'chargeSeal')) damage += 4;
        if (long && owns(me, 'quarterCutter')) damage += 8;
        if (owns(me, 'contractBlade') && me.hp <= me.maxHp / 2) damage += 5;
        if (owns(me, 'fullBlade'))
          damage +=
            4 * COLORS.filter((c) => me.mana[c] === manaCap(me, c)).length;
        if (owns(me, 'answerCloak') && me.items?.answer) damage += 3;
        if (
          me.stealthUntil > me.actions ||
          (owns(me, 'veil') && groups.some((g) => g.cells.length >= 4))
        )
          damage = Math.ceil(damage * 1.5);
      }
      if (counts.water >= 3 && owns(me, 'tideNeedle')) damage += 2;
      if (
        counts.water >= 3 &&
        owns(me, 'tidePurse') &&
        (me.items?.purseGold ?? 0) < 8
      )
        score += 3;
      if (counts.earth >= 3 && owns(me, 'apron'))
        score += Math.min(2, 6 - (me.items?.barrier ?? 0)) * 2;
      if (counts.gold >= 3 && owns(me, 'abacus'))
        score += Math.min(2, 6 - (me.items?.barrier ?? 0)) * 2;
      if (owns(me, 'directorPen') && !me.items?.initiative.directorPen) {
        const seals = COLORS.filter(
          (c) => counts[c] >= 3 && !me.items?.seals.includes(c),
        );
        score += seals.length * 4;
        if (seals.length + (me.items?.seals.length ?? 0) === 4) damage += 8;
      }
      if (owns(me, 'infiniteDiploma') && counts.xp)
        score +=
          Math.min(4, counts.xp) *
          COLORS.reduce((n, c) => n + manaWeight(c), 0);
      // Visible protection only: no simulated refills, proc RNG or hidden future waves.
      damage = Math.max(
        0,
        damage - (owns(enemy, 'coat') ? 2 : 0) - (enemy.items?.barrier ?? 0),
      );
      if (enemy.wall)
        damage = Math.max(
          0,
          damage - COLORS.reduce((n, c) => n + enemy.mana[c], 0),
        );
    }
    return score + damage * 3 + (damage >= enemy.hp ? 500 : 0);
  };
  const boardValue = (board: Tile[]) => {
    const groups = findMatches(board);
    return (
      cellsValue(
        board,
        blastCells(
          board,
          groups.flatMap((m) => m.cells),
        ),
        groups,
      ) +
      (groups.some((m) => m.cells.length >= 4) ? 18 : 0) +
      (groups.some((m) => m.longest >= 5) ? 8 : 0)
    );
  };
  for (const move of legalSwaps(s.board))
    candidates.push({
      command: { type: 'swap', ...move },
      score: boardValue(swapBoard(s.board, move)),
    });
  for (const id of me.spells) {
    if (spellError(s, id, side)) continue;
    const add = (score: number, target?: number) =>
      candidates.push({
        command: {
          type: 'cast',
          spell: id,
          ...(target === undefined ? {} : { target }),
        },
        score,
      });
    const spellDamage = (n: number) => {
      if (modern) {
        if (owns(me, 'carbonPaper') && !me.items?.initiative.carbonPaper)
          n += Math.min(6, Math.floor(n / 2));
        if (owns(me, 'stylus')) n += 2;
        n = Math.max(
          0,
          n - (owns(enemy, 'coat') ? 2 : 0) - (enemy.items?.barrier ?? 0),
        );
        if (enemy.wall)
          n = Math.max(
            0,
            n - COLORS.reduce((sum, c) => sum + enemy.mana[c], 0),
          );
      }
      return n * 2.4 + (n >= enemy.hp ? 500 : 0);
    };
    switch (id as SpellId) {
      case 'bolt':
        add(spellDamage(10 + Math.floor(me.stats.fire / 5)));
        break;
      case 'drain':
        add(
          spellDamage(6) +
            COLORS.reduce((n, c) => n + Math.min(3, enemy.mana[c]), 0),
        );
        break;
      case 'mend':
        add(Math.min(11, me.maxHp - me.hp) * (me.hp < 18 ? 5 : 1.7));
        break;
      case 'wall':
        if (!me.wall)
          add(COLORS.reduce((n, c) => n + me.mana[c], 0) >= 15 ? 15 : 3);
        break;
      case 'trance':
        add(me.ki < 5 ? 24 : 5);
        break;
      case 'palm':
        add(spellDamage(me.ki * 2) + (me.ki >= 5 && !enemy.immune ? 10 : 0));
        break;
      case 'transmute':
        add(
          boardValue(
            s.board.map((t) => (t.kind === 'earth' ? { kind: 'water' } : t)),
          ) - 3,
        );
        break;
      case 'slice':
        for (let target = 0; target < 64; target++) {
          const radius = me.mana.air >= 10 ? 2 : 1;
          const cells = Array.from(
            { length: radius * 2 + 1 },
            (_, n) => (target % 8) - radius + n,
          )
            .filter((x) => x >= 0 && x < 8)
            .map((x) => Math.floor(target / 8) * 8 + x);
          add(cellsValue(s.board, blastCells(s.board, cells)) - 3, target);
        }
        break;
      case 'forge':
        for (let target = 0; target < 64; target++)
          if (s.board[target].kind !== 'skull') {
            const board = s.board.slice();
            board[target] = { kind: 'skull' };
            const score = boardValue(board);
            if (score > 0) add(score - 3, target);
          }
        break;
      case 'bomb':
        for (let target = 0; target < 64; target++)
          if (s.board[target].kind === 'skull' && !s.board[target].power) {
            const board = s.board.slice();
            board[target] = { kind: 'skull', power: 5 };
            // A setup has no immediate damage and costs tempo; prefer it on quiet boards.
            add(8, target);
          }
        break;
      case 'erase':
        break; // The bot has no information about replacement tiles: don't gamble blindly.
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.command ?? null;
}

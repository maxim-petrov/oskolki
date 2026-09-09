// Visible-information policy, never executes candidate moves or reads future RNG.
import * as g from '../game/engine.ts';
import { writeFileSync } from 'node:fs';
export function simulate(seed, style = 'balanced', options = {}) {
  let s = options.start ?? g.startRun(seed);
  const rooms = [],
    decisions = [];
  let turns = 0,
    actions = 0;
  const take = (r) => {
    if (r.error) throw Error(r.error);
    s = r.state;
  };
  const threat = () =>
    s.enemies
      .filter((e) => e.hp > 0)
      .reduce((n, e) => {
        const i = g.intent(s, e);
        return n + (['attack', 'pierce'].includes(i.type) ? i.value : 0);
      }, 0);
  const value = (o) => {
    if (o.kind === 'seal')
      return o.id === 'red-line' ? 20 : o.id === 'enduring-record' ? 10 : 0;
    if (o.id === 'potion') return s.hp < s.maxHp - 8 ? 24 : 2;
    if (o.id === 'sharpen') return 30;
    if (o.slot === 'weapon')
      return o.id ===
        {
          poison: 'gear-rusty-dagger',
          editor: 'gear-axe',
          runes: 'gear-rune-sword',
          balanced: 'gear-cutter',
        }[style]
        ? 25
        : 0;
    if (o.slot === 'clothing') return 20;
    if (o.slot === 'helmet') return 10;
    if (o.slot === 'trousers') return style === 'editor' ? 16 : 6;
    if (o.kind === 'relic')
      return g.itemRequirement(s, o.id)
        ? 2
        : 18 +
            (['coil', 'lamp', 'thread', 'heart', 'carbon'].includes(o.id)
              ? 5
              : 0);
    if (o.kind === 'modifier') return 14;
    if (o.kind === 'upgrade') return 16;
    if (o.id === 'pierce') return 24;
    if (o.id === 'blood' || o.id === 'seal') return 8;
    if (o.id === 'reshape') return style === 'editor' ? 20 : 8;
    return 1;
  };
  while (!['victory', 'defeat'].includes(s.phase) && actions++ < 500) {
    if (s.phase === 'battle') {
      const before = {
        room: s.room,
        hp: s.hp,
        round: s.round,
        weapon: s.equipment.weapon,
      };
      if (s.potions && !s.consumed && s.hp <= s.maxHp - 8)
        take(g.consumePotion(s));
      const targets = s.enemies
        .filter((e) => e.hp > 0)
        .sort((a, b) => a.hp + a.block * 0.5 - (b.hp + b.block * 0.5));
      s = { ...s, target: targets[0]?.id ?? s.target };
      if (!s.moved) {
        const m = g
          .validMoves(s.board)
          .map((m) => {
            const p = g.previewMove(s, m.axis, m.line, m.amount);
            const dmg = p.targets.reduce(
              (n, e) => n + e.damage + e.poison * 1.5 + (e.defeated ? 7 : 0),
              0,
            );
            return {
              m,
              score:
                dmg * 1.4 +
                Math.min(Math.max(0, threat() - s.block), p.block) * 1.8 +
                p.energy * 1.2 +
                p.focus * 0.6 +
                p.health * 3 +
                (p.tideCleared ? 5 : 0) -
                (p.lethal ? 10000 : 0),
            };
          })
          .sort((a, b) => b.score - a.score)[0]?.m;
        if (m) take(g.move(s, m.axis, m.line, m.amount));
      }
      if (s.phase === 'battle' && !s.cast) {
        if (g.canCast(s, 'pierce')) take(g.castSkill(s, 'pierce'));
        else if (g.canCast(s, 'bolt')) take(g.castSkill(s, 'bolt'));
        else if (g.canCast(s, 'guard') && threat() > s.block)
          take(g.castSkill(s, 'guard'));
        else if (g.canCast(s, 'edit')) {
          // Score the visible groups a cell replacement would create, no refill.
          let choice = null;
          for (let i = 0; i < 36; i++)
            for (const family of g.FAMILIES) {
              if (s.board[i].family === family) continue;
              const b = s.board.map((t, j) => (j === i ? { ...t, family } : t));
              const gs = g.groups(b);
              const score = gs.reduce(
                (n, is) =>
                  n +
                  is.length *
                    (family === 'blade'
                      ? 2
                      : family === 'shield' && threat() > s.block
                        ? 1.5
                        : 0.7),
                0,
              );
              if (!choice || score > choice.score)
                choice = { i, family, score };
            }
          if (choice?.score >= 5 && !g.hasSeal(s, 'double-edit'))
            take(g.castSkill(s, 'edit', choice.i, choice.family));
        } else if (
          g.canCast(s, 'blood') &&
          s.enemies.some((e) => e.hp > 0 && e.hp <= 8 && e.block === 0)
        )
          take(g.castSkill(s, 'blood'));
      }
      if (s.phase === 'battle') {
        take(g.endTurn(s));
        turns++;
      }
      decisions.push({ ...before, after: s.hp });
      if (s.phase !== 'battle')
        rooms.push({ room: s.room, turns: s.round, hp: s.hp, phase: s.phase });
    } else if (s.phase === 'reward') {
      const o = [...s.offers].sort((a, b) => value(b) - value(a))[0];
      take(g.chooseReward(s, o?.id ?? null, 0));
    } else if (s.phase === 'map') {
      const routes = g.nextRooms(s);
      const node =
        routes.find((n) => n.description.includes('событие → обычный')) ??
        routes.find((n) => n.description.includes('обычный бой → магазин')) ??
        routes[0];
      take(g.enterRoom(s, node.id));
    } else if (s.phase === 'shop') {
      const offers = [...s.offers].sort((a, b) => value(b) - value(a));
      for (const o of offers)
        if (
          (o.cost ?? Infinity) <= s.gold &&
          value(o) >= 14 &&
          (!o.slot || s.equipment[o.slot] !== o.id)
        )
          take(g.buy(s, o.id, 0));
      take(g.leaveRoom(s));
    } else if (s.phase === 'rest')
      take(
        g.rest(
          s,
          s.hp <= s.maxHp * 0.75
            ? 'heal'
            : g.sharpeningOffer(s)
              ? 'sharpen'
              : 'heal',
        ),
      );
    else if (s.phase === 'event')
      take(
        g.eventChoice(s, s.room > 10 && s.gold >= 30 ? 'repair' : 'supplies'),
      );
    else if (s.phase === 'trial')
      take(g.tickTrial(g.pauseTrial(s, false).state, 46));
    if (!g.isSave(s)) throw Error(`Invalid save ${s.room}/${s.phase}`);
  }
  if (actions >= 500) throw Error('Run stalled');
  return {
    seed,
    style,
    outcome: s.phase,
    depth: s.room,
    hp: s.hp,
    turns,
    relics: s.relics,
    weapon: s.equipment.weapon,
    quality: s.weaponQuality,
    rooms,
    decisions,
    final: s,
  };
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const count = Number(process.argv[2] ?? 16),
    data = [];
  for (const style of ['balanced', 'poison', 'editor', 'runes'])
    for (let seed = 1; seed <= count; seed++) {
      const { final: _final, decisions: _decisions, ...r } = simulate(seed, style);
      data.push(r);
    }
  const report = {
    policy:
      'Visible first-wave heuristic, regular stats, 12 starting relics. Deterministic bot; not evidence of fun or a human win rate.',
    runs: data,
  };
  writeFileSync(
    process.argv[3] ?? '/tmp/oskolki-balance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  for (const style of ['balanced', 'poison', 'editor', 'runes']) {
    const xs = data.filter((r) => r.style === style);
    console.log(
      style,
      JSON.stringify({
        runs: xs.length,
        wins: xs.filter((x) => x.outcome === 'victory').length,
        meanDepth: xs.reduce((n, x) => n + x.depth, 0) / xs.length,
        meanTurns: xs.reduce((n, x) => n + x.turns, 0) / xs.length,
        maxCombatTurns: Math.max(
          ...xs.flatMap((x) => x.rooms.map((r) => r.turns)),
        ),
      }),
    );
  }
}

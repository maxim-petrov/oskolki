// Visible-board policy only. Diagnostic pacing sample, never a proxy for human win rate.
import {
  createDuel,
  dispatchDuel,
  saveDuel,
  loadDuel,
  statPrice,
} from '../game/duel/engine.ts';
import { chooseAction } from '../game/duel/ai.ts';
import { ITEMS, CLASSES } from '../game/duel/catalog.ts';
import fs from 'node:fs';
const score = (id, s) => {
  if (!id) return 0;
  const direct = s.hero.spells.some((x) =>
    ['bolt', 'drain', 'palm'].includes(x),
  );
  const values = {
    paperKnife: 3,
    stylus: direct ? 6 : 0,
    coat: 10,
    apron: 5,
    copperClip: 3,
    bluePass: 4,
    scholar: 5,
    abacus: 4,
    graphite: 2,
    cottonCuffs: 6,
    teaBag: 4,
    lens: 5,
    tideNeedle: 5,
    chargeSeal: 3,
    pocketVest: 3,
    answerCloak: 6,
    tidePurse: 4,
    reservoir: 4,
    wick: 3,
    conductor: 7,
    emberKnife: 7,
    archiveVest: 6,
    metronome: direct ? 8 : 0,
    fireSeal: 6,
    fullBlade: 5,
    contractBlade: 4,
    veil: 7,
    overflowRobe: 4,
    catalyst: 10,
    mint: 5,
    ward: 5,
    bloodInkwell: 6,
    mortgage: 3,
    saltCoat: 6,
    prism: 5,
    waterwheel: 5,
    quarterCutter: 2,
    mirrorVest: 14,
    insurance: 3,
    carbonPaper: direct ? 12 : 0,
    capacitor: 7,
    glassNib: direct ? 8 : 0,
    ledger: 6,
    directorPen: 9,
    spinningTop: 12,
    infiniteDiploma: 7,
    goldenLining: 10,
    eclipseRing: 9,
  };
  return values[id] ?? 1;
};
export function run(seed, classId, exportDir) {
  let s = createDuel({ seed, classId, mode: 'route', foe: 0 });
  const checkpoints = [];
  const step = (c) => {
    const r = dispatchDuel(s, c);
    if (r.error) throw Error(r.error);
    s = r.state;
  };
  for (let i = 0; i < 4000 && ['battle', 'camp'].includes(s.phase); i++) {
    if (s.phase === 'battle') step(chooseAction(s));
    else {
      checkpoints.push({
        room: s.room + 1,
        hp: s.hero.hp,
        max: s.hero.maxHp,
        actions: s.hero.actions,
        level: s.hero.level,
      });
      if (exportDir && s.room % 5 === 4)
        fs.writeFileSync(
          `${exportDir}/biome-${Math.floor(s.room / 5) + 1}-camp.json`,
          saveDuel(s),
        );
      const upgrade = (id) =>
        score(id, s) - score(s.hero.gear[ITEMS[id].slot], s);
      const best = s.offers.slice().sort((a, b) => upgrade(b) - upgrade(a))[0];
      step({ type: 'reward', item: best && upgrade(best) > 0 ? best : null });
      const purchase = s.stock
        .slice()
        .sort((a, b) => upgrade(b) - upgrade(a))
        .find((id) => upgrade(id) > 1 && s.hero.gold >= ITEMS[id].price);
      if (purchase) step({ type: 'buy', item: purchase });
      for (let j = 0; j < 20; j++) {
        const primary =
          CLASSES[classId].cheap.find((k) => k !== 'cunning') ?? 'fire';
        const choices =
          s.hero.stats.morale < 9 ? ['morale', primary] : [primary, 'morale'];
        const stat = choices.find(
          (k) => s.hero.stats[k] < 18 && s.hero.points >= statPrice(s, k),
        );
        if (!stat) break;
        step({ type: 'train', stat });
      }
      step({ type: 'next' });
    }
  }
  if (!['won', 'lost'].includes(s.phase))
    throw Error('Route did not terminate');
  if (exportDir)
    fs.writeFileSync(`${exportDir}/route-${classId}-${seed}.json`, saveDuel(s));
  return {
    seed,
    classId,
    phase: s.phase,
    room: s.room + 1,
    commands: s.commands.length,
    hp: s.hero.hp,
    gear: s.hero.gear,
    checkpoints,
    state: s,
  };
}
if (process.argv[1]?.endsWith('duel-balance.mjs')) {
  const n = Number(process.argv[2] ?? 4);
  const result = [];
  for (const classId of Object.keys(CLASSES))
    for (let seed = 0; seed < n; seed++) {
      const r = run(seed, classId, process.argv[3]);
      if (
        JSON.stringify(loadDuel(saveDuel(r.state))) !== JSON.stringify(r.state)
      )
        throw Error('Replay mismatch');
      const { state: _state, ...publicResult } = r;
      result.push(publicResult);
      console.log(JSON.stringify(publicResult));
    }
  console.log(
    JSON.stringify({
      runs: result.length,
      wins: result.filter((r) => r.phase === 'won').length,
      reached: [1, 6, 11, 16, 20].map((room) => ({
        room,
        count: result.filter((r) => r.room >= room).length,
      })),
    }),
  );
}

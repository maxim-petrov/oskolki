/**
 * Engine invariants: what must hold after every action, whatever the build, the policy or the
 * seed. The fuzz tests and the balance runner check them after each dispatch; a violation is a bug
 * in the engine or the content, never a balance question.
 */
import { MAX_SIDE, MIN_SIDE, validMoves } from '../board.ts';
import { MAX_ENEMIES, REFLECT_PER_HALF, alive, armorCap, energyCap, moveRules } from '../combat.ts';
import { ACTS } from '../content/acts.ts';
import { ENEMIES } from '../content/enemies.ts';
import { EVENT_BY_ID } from '../content/events.ts';
import { FINDS, FIND_METER } from '../content/finds.ts';
import { MAX_COINS } from '../economy.ts';
import { MAX_GEAR } from '../content/gear.ts';
import { ITEMS, POCKETS, computeMods } from '../content/items.ts';
import { FAMS, QUEUE_LEN, type RunState, type Tile } from '../types.ts';

const KINDS = new Set<string>([...FAMS, 'prism', 'junk']);
const COLOURS = new Set<string>(FAMS);
const SPECIALS = new Set(['rocketH', 'rocketV', 'bomb']);

/** Every number in the state is finite (no NaN or Infinity sneaking in through a multiplier). */
function scanNumbers(v: unknown, path: string, out: string[], depth = 0) {
  if (out.length > 20 || depth > 12) return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} = ${v}`);
    return;
  }
  if (Array.isArray(v)) v.forEach((x, k) => scanNumbers(x, `${path}[${k}]`, out, depth + 1));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scanNumbers(x, `${path}.${k}`, out, depth + 1);
}

function checkTile(t: Tile, where: string, bad: (msg: string) => void) {
  if (!t || typeof t !== 'object') return bad(`${where}: пустая клетка`);
  if (!Number.isInteger(t.id)) bad(`${where}: id ${t.id}`);
  if (!KINDS.has(t.kind)) bad(`${where}: вид ${t.kind}`);
  if (t.tape && t.kind !== 'junk') bad(`${where}: волокита на фишке ${t.kind}`);
  if (t.special !== undefined && (!SPECIALS.has(t.special) || t.kind === 'junk' || t.kind === 'prism')) bad(`${where}: особая ${t.special} на ${t.kind}`);
  if (t.seal && !COLOURS.has(t.kind)) bad(`${where}: печать на фишке ${t.kind}`);
  if (t.find !== undefined && (!FINDS[t.find] || !COLOURS.has(t.kind))) bad(`${where}: находка ${t.find} на фишке ${t.kind}`);
  if (t.fuse !== undefined && !(t.fuse >= 1)) bad(`${where}: фитиль ${t.fuse}`);
  if (t.hidden !== undefined && !(t.hidden >= 1)) bad(`${where}: цензура ${t.hidden}`);
}

/**
 * Violations of the engine's rules in this state; `prev` (the state before the action) adds the
 * checks that compare two steps. An empty list means the state is sound.
 */
export function checkRun(run: RunState, prev?: RunState): string[] {
  const out: string[] = [];
  const bad = (msg: string) => out.push(msg);
  scanNumbers(run, 'run', out);
  const h = run.hero;
  const mods = computeMods(h.relics);

  // Hero.
  if (!Number.isInteger(h.maxHp) || h.maxHp < 1) bad(`максимум здоровья ${h.maxHp}`);
  if (!Number.isInteger(h.hp) || h.hp < 0 || h.hp > h.maxHp) bad(`здоровье ${h.hp}/${h.maxHp}`);
  if (run.phase === 'dead' ? h.hp !== 0 : h.hp <= 0) bad(`здоровье ${h.hp} в фазе ${run.phase}`);
  if (!Number.isInteger(h.coins) || h.coins < 0 || h.coins > MAX_COINS) bad(`монеты ${h.coins}`);
  if (!Number.isInteger(h.armor) || h.armor < 0 || h.armor > armorCap(run)) bad(`броня ${h.armor}/${armorCap(run)}`);
  if (h.ward < 0) bad(`зонтик ${h.ward}`);
  if (h.reflect !== 0 && h.reflect !== REFLECT_PER_HALF) bad(`отражение ${h.reflect}`);
  if (!Number.isInteger(h.charge) || h.charge < 0 || h.charge > energyCap(run)) bad(`энергия ${h.charge}/${energyCap(run)}`);
  for (const f of FAMS) {
    const list = h.gear[f] ?? [];
    if (!list.length || list.length > MAX_GEAR || new Set(list).size !== list.length) bad(`вещи цвета ${f}: ${list.join(', ')}`);
    for (const id of list) if (ITEMS[id]?.kind !== 'gear' || ITEMS[id].gear?.fam !== f) bad(`вещь ${id} в цвете ${f}`);
    if (!list.includes(h.equip[f])) bad(`в руке ${h.equip[f]}, а есть ${list.join(', ')}`);
  }
  for (const id of h.ups) if (!FAMS.some((f) => h.gear[f].includes(id))) bad(`улучшена вещь, которой нет: ${id}`);
  if (new Set(h.ups).size !== h.ups.length) bad(`улучшение дважды: ${h.ups.join(', ')}`);
  if (!Number.isInteger(h.tape) || h.tape < 0 || h.tape > 9) bad(`волокита ${h.tape}`);
  if (!Number.isInteger(h.keys) || h.keys < 0 || h.keys > 9) bad(`ключи ${h.keys}`);
  if (!Number.isInteger(h.finds) || h.finds < 0 || h.finds > FIND_METER) bad(`шкала находок ${h.finds}`);
  if (h.findNext !== undefined && !FINDS[h.findNext]) bad(`находка на следующий бой ${h.findNext}`);
  if (h.active !== null && ITEMS[h.active]?.kind !== 'active') bad(`навык ${h.active}`);
  if (new Set(h.relics).size !== h.relics.length) bad(`предмет дважды: ${h.relics.join(', ')}`);
  for (const id of h.relics) if (ITEMS[id]?.kind !== 'passive') bad(`предмет ${id}`);
  if (h.pockets.length !== mods.pockets) bad(`карманов ${h.pockets.length}, а положено ${mods.pockets}`);
  for (const p of h.pockets) if (p !== null && !POCKETS[p]) bad(`карман ${p}`);

  // Run and phase.
  if (run.act < 0 || run.act > run.lastAct || run.lastAct >= ACTS.length) bad(`отдел ${run.act} из ${run.lastAct}`);
  if (run.node < -1 || run.node >= run.map.nodes.length) bad(`узел ${run.node}`);
  const c = run.combat;
  switch (run.phase) {
    case 'combat':
      if (!c) bad('бой без состояния боя');
      break;
    case 'reward':
      if (!Array.isArray(run.rewards)) bad('награды не список');
      break;
    case 'shop':
      if (!run.shop) bad('касса без товара');
      break;
    case 'event':
      if (!run.event || !EVENT_BY_ID[run.event.id]) bad(`событие ${run.event?.id}`);
      break;
    case 'pick':
      if (!run.pick || run.pick.count < 1) bad('выбор вещи без выбора');
      break;
    case 'treasure':
      if (!run.treasure) bad('сейф без содержимого');
      break;
    case 'bossReward':
      if (!run.bossRelics.length) bad('награда босса пустая');
      break;
  }
  if (c && run.phase !== 'combat' && run.phase !== 'dead') bad(`остался бой в фазе ${run.phase}`);

  // Combat.
  if (c && run.phase === 'combat') {
    const b = c.board;
    for (const [side, n] of [
      ['ширина', b.w],
      ['высота', b.h],
    ] as const)
      if (!Number.isInteger(n) || n < MIN_SIDE || n > MAX_SIDE) bad(`${side} поля ${n}`);
    if (b.cells.length !== b.w * b.h) bad(`клеток ${b.cells.length} на поле ${b.w}×${b.h}`);
    b.cells.forEach((t, i) => checkTile(t, `клетка ${i}`, bad));
    if (b.queue.length !== b.w) bad(`очередей ${b.queue.length}`);
    b.queue.forEach((q, col) => {
      if (q.length !== QUEUE_LEN) bad(`очередь ${col}: ${q.length}`);
      q.forEach((t, k) => checkTile(t, `очередь ${col}/${k}`, bad));
    });
    if (b.cells.filter((t) => t?.find).length > 1) bad('на поле больше одной находки');
    const ids = [...b.cells, ...b.queue.flat()].map((t) => t?.id);
    if (new Set(ids).size !== ids.length) bad('id фишек повторяются');
    if (b.flood < 0 || b.flood > 3) bad(`вода ${b.flood}`);
    if (b.colLock.length !== b.w || b.rowLock.length !== b.h || [...b.colLock, ...b.rowLock].some((x) => !Number.isInteger(x) || x < 0))
      bad('замки строк/столбцов');
    for (const t of b.source) if (!(COLOURS.has(t.kind) || (t.kind === 'junk' && t.tape))) bad(`в мешке жетон ${JSON.stringify(t)}`);
    if (!FAMS.every((f) => b.source.some((t) => t.kind === f))) bad('в мешке нет какого-то цвета');
    const living = alive(c);
    if (!living.length) bad('бой идёт, а врагов нет');
    if (living.length > MAX_ENEMIES + 1) bad(`врагов ${living.length}`);
    for (const e of c.enemies) {
      if (!ENEMIES[e.def]) bad(`враг ${e.def}`);
      if (e.hp > e.maxHp) bad(`${e.def}: здоровье ${e.hp}/${e.maxHp}`);
      if (e.block < 0 || e.armor < 0 || e.bleed < 0 || e.burnTurns < 0) bad(`${e.def}: отрицательный статус`);
      if (e.hp > 0 && e.countdown < 1) bad(`${e.def}: таймер ${e.countdown}`);
    }
    if (!validMoves(b, moveRules(run, mods)).length) bad('на поле нет ходов');
  }

  // Monotonic counters.
  if (prev) {
    const s = run.stats;
    const p = prev.stats;
    for (const k of ['moves', 'kills', 'floors', 'fights', 'elites', 'shards', 'damageDealt', 'damageTaken', 'coinsEarned'] as const)
      if (s[k] < p[k]) bad(`счётчик ${k} уменьшился: ${p[k]} → ${s[k]}`);
    if (run.act < prev.act) bad(`отдел уменьшился: ${prev.act} → ${run.act}`);
  }
  return out;
}

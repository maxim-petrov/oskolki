/**
 * Engine invariants: what must hold after every action, whatever the build, the policy or the
 * seed. The fuzz tests and the balance runner check them after each dispatch; a violation is a bug
 * in the engine or the content, never a balance question.
 */
import { validMoves } from '../board.ts';
import { MAX_ENEMIES, activeCost, alive } from '../combat.ts';
import { ACTS } from '../content/acts.ts';
import { CARDS } from '../content/cards.ts';
import { ENEMIES } from '../content/enemies.ts';
import { EVENT_BY_ID } from '../content/events.ts';
import { ITEMS, POCKETS, computeMods } from '../content/items.ts';
import { CELLS, FAMS, H, QUEUE_LEN, W, type RunState, type Tile } from '../types.ts';

const KINDS = new Set<string>([...FAMS, 'prism', 'junk']);
const SPECIALS = new Set(['rocketH', 'rocketV', 'bomb']);
const FINISHES = new Set(['sharp', 'gild', 'seal', 'copy', 'laminate']);

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
  if (t.card !== undefined) {
    const def = CARDS[t.card];
    if (!def) bad(`${where}: неизвестная карта ${t.card}`);
    else if (t.kind === 'junk' ? def.fam !== 'status' : t.kind !== 'prism' && def.fam !== t.kind) bad(`${where}: карта ${t.card} на фишке ${t.kind}`);
  }
  if (t.special !== undefined && (!SPECIALS.has(t.special) || t.kind === 'junk' || t.kind === 'prism')) bad(`${where}: особая ${t.special} на ${t.kind}`);
  if (t.finish !== undefined && !FINISHES.has(t.finish)) bad(`${where}: отделка ${t.finish}`);
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
  if (!Number.isInteger(h.coins) || h.coins < 0 || h.coins > 999) bad(`монеты ${h.coins}`);
  if (!Number.isInteger(h.armor) || h.armor < 0) bad(`броня ${h.armor}`);
  if (h.ward < 0) bad(`зонтик ${h.ward}`);
  if (h.reflect < 0 || h.reflect > 1) bad(`отражение ${h.reflect}`);
  if (!Number.isInteger(h.charge) || h.charge < 0 || h.charge > activeCost(run)) bad(`заряд ${h.charge}/${activeCost(run)}`);
  if (h.active !== null && ITEMS[h.active]?.kind !== 'active') bad(`навык ${h.active}`);
  if (new Set(h.relics).size !== h.relics.length) bad(`предмет дважды: ${h.relics.join(', ')}`);
  for (const id of h.relics) if (ITEMS[id]?.kind !== 'passive') bad(`предмет ${id}`);
  if (h.pockets.length !== mods.pockets) bad(`карманов ${h.pockets.length}, а положено ${mods.pockets}`);
  for (const p of h.pockets) if (p !== null && !POCKETS[p]) bad(`карман ${p}`);
  const uids = new Set(h.deck.map((c) => c.uid));
  if (uids.size !== h.deck.length) bad('в колоде повторяются uid');
  for (const c of h.deck) {
    if (!CARDS[c.id]) bad(`карта ${c.id}`);
    if (c.finish !== undefined && !FINISHES.has(c.finish)) bad(`отделка ${c.finish} у ${c.id}`);
  }
  if (!h.deck.length) bad('пустая колода');

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
      if (!run.pick || run.pick.count < 1) bad('выбор карты без выбора');
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
    if (b.cells.length !== CELLS) bad(`клеток ${b.cells.length}`);
    b.cells.forEach((t, i) => checkTile(t, `клетка ${i}`, bad));
    if (b.queue.length !== W) bad(`очередей ${b.queue.length}`);
    b.queue.forEach((q, col) => {
      if (q.length !== QUEUE_LEN) bad(`очередь ${col}: ${q.length}`);
      q.forEach((t, k) => checkTile(t, `очередь ${col}/${k}`, bad));
    });
    const ids = [...b.cells, ...b.queue.flat()].map((t) => t?.id);
    if (new Set(ids).size !== ids.length) bad('id фишек повторяются');
    if (b.flood < 0 || b.flood > 3) bad(`вода ${b.flood}`);
    if (b.colLock.length !== W || b.rowLock.length !== H || [...b.colLock, ...b.rowLock].some((x) => !Number.isInteger(x) || x < 0))
      bad('замки строк/столбцов');
    for (const t of b.source) if (!CARDS[t.card]) bad(`в мешке карта ${t.card}`);
    const living = alive(c);
    if (!living.length) bad('бой идёт, а врагов нет');
    if (living.length > MAX_ENEMIES + 1) bad(`врагов ${living.length}`);
    for (const e of c.enemies) {
      if (!ENEMIES[e.def]) bad(`враг ${e.def}`);
      if (e.hp > e.maxHp) bad(`${e.def}: здоровье ${e.hp}/${e.maxHp}`);
      if (e.block < 0 || e.armor < 0 || e.bleed < 0 || e.burnTurns < 0) bad(`${e.def}: отрицательный статус`);
      if (e.hp > 0 && e.countdown < 1) bad(`${e.def}: таймер ${e.countdown}`);
    }
    if (!validMoves(b, mods.wrap).length) bad('на поле нет ходов');
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

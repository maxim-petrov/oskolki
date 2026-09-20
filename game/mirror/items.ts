import { ITEMS, type Item, type ItemId } from '../duel/catalog.ts';
import {
  CHANNELS,
  WIDTH as COLS,
  HEIGHT as ROWS,
  adjacent,
  type Channel,
  type Tile,
} from './board.ts';
import type { GroupEvent, Hero, ItemContext, ItemMemory } from './types.ts';

// Item identities/rarities belong to the route catalog. Their combat contracts
// belong to this experiment; no shared-board mana or enemy swaps are implied.
const descriptions: Record<ItemId, string> = {
  paperKnife: 'Первая группа удара за действие: +1 урона.',
  stylus:
    'Усиленный атакующий приём или S: +2 урона на группу, не на каждое попадание.',
  coat: 'Каждое действие врага: поглотить первые 2 урона до барьера.',
  apron: 'Собрать 3 камня ярости за действие → 2 барьера.',
  copperClip: 'Собрать 3 камня удара за действие → 1 резонанс магии.',
  bluePass: 'В начале боя: по 2 резонанса лечения и ярости.',
  scholar:
    'Первый опыт за усиленные камни в действии: ещё +2 опыта. Не более 6 за бой.',
  abacus:
    'Заработать серией 3 золота за действие → 2 барьера. Подаренное золото не считается.',
  tideNeedle: 'Собрать 3 камня лечения за действие → 2 урона врагу.',
  chargeSeal: 'Первая естественная группа 4+ ударов за действие: +4 урона.',
  pocketVest: 'Начать каждый бой с 6 барьера.',
  answerCloak:
    'Потеря HP от врага заряжает следующую группу удара: +3 урона. Один заряд.',
  tidePurse:
    'Собрать 3 камня лечения за действие → 2 золота. Не более 8 за бой.',
  reservoir:
    '+8 к вместимости каждого резонанса. Пустое место не заполняется бесплатно.',
  wick: 'Естественная группа 4+ ударов улучшает оставшийся обычный камень удара до II. Раз до действия врага.',
  conductor:
    'Собрать два разных вида камней за действие → 2 резонанса в самый пустой по доле запас.',
  fullBlade:
    'Перед первой группой удара за действие: +4 урона за каждый полный резонанс; потратить по 2 из этих запасов.',
  contractBlade:
    'При HP не выше половины: первая группа удара за действие получает +5 урона.',
  veil: 'Группа 4+ заряжает следующий удар: ×1,5 базового урона. Заряд живёт 3 следующих действия.',
  overflowRobe:
    'Потерять 3 резонанса из-за полной вместимости за действие → 3 барьера.',
  catalyst:
    'Первый усиленный приём за действие: +2 резонанса его вида. S выбирает самый пустой запас.',
  mint: 'Получить 2 золота серией или Кошельком → улучшить обычный камень удара до II. Раз до действия врага.',
  ward: '20% шанс отменить первое попадание действия врага. Не отменяет его изменения поля.',
  bloodInkwell:
    'Первый усиленный атакующий приём до действия врага: +3 урона за 2 HP. При HP ≤2 выключен.',
  quarterCutter:
    'Тройки удара теряют базовый урон. Первая естественная группа 4+ ударов за действие: +8 урона.',
  mirrorVest:
    'В начале действия: 2 барьера. Каждые 2 поглощённого урона отражают 1; до 3 за действие врага.',
  insurance:
    'Один раз за забег пережить смертельное попадание с 1 HP и получить 6 барьера для следующих попаданий.',
  carbonPaper:
    'Первый усиленный атакующий приём до действия врага: ещё половина его базового урона, не более 6.',
  capacitor:
    'Потратить предметами 12 резонанса → заряд. Первый сбор вида в следующем действии: +4 этого резонанса. Один заряд.',
  directorPen:
    'Сбор 3 камней вида ставит его печать. Четыре разные печати → 8 урона и 4 барьера; раз до действия врага.',
  spinningTop:
    'Каждый третий усиленный приём заряжает задержку врага на 1 обмен. Раз за цикл врага; заряд не складывается.',
  infiniteDiploma:
    'Опыт за усиленные камни превращается в резонанс: по 1 каждого вида вместо 1 опыта. Опыт за победу сохраняется.',
  graphite:
    'После сбора 3 магических камней следующая группа удара этого действия получает +2 урона.',
  cottonCuffs:
    'Собрать 3 камня лечения за действие → восстановить 1 HP. До 6 HP за бой.',
  teaBag: 'Собрать 3 камня ярости за действие → 1 резонанс лечения.',
  lens: 'Первый опыт за усиленные камни в действии → 2 резонанса магии. Опыт сохраняется.',
  emberKnife:
    'После сбора 3 камней удара зарядить следующую группу удара: +3 урона. Один заряд.',
  archiveVest:
    'Первый опыт за усиленные камни в действии → 3 барьера. Опыт сохраняется.',
  metronome:
    'После сбора 3 магических камней зарядить следующий усиленный атакующий приём: +3 урона. Один заряд.',
  fireSeal: 'Собрать 3 камня удара за действие → 2 резонанса удара.',
  mortgage:
    'Первая группа удара за действие: +6 урона за 2 HP. При HP ≤2 выключен. Самооплата обходит защиту.',
  saltCoat:
    'Первый усиленный приём до действия врага: 3 барьера. Группы лечения восстанавливают на 40% меньше HP.',
  prism:
    'Собрать три разных вида камней за действие → 3 урона и 2 барьера. Только собранные камни.',
  waterwheel:
    'Собрать 3 камня лечения за действие → 3 резонанса ярости, но потерять до 2 резонанса удара.',
  glassNib:
    'Усиленные атакующие приёмы: +5 урона на группу. Первое попадание врага за действие сильнее на 1.',
  ledger:
    '6 золота, заработанного сериями за бой, заряжают следующий удар: +6 урона. Подарки не считаются; один заряд.',
  goldenLining:
    'Заработать серией 3 золота за действие → потратить 2 золота и вылечить до 3 HP. Раз до действия врага, до 12 HP за бой.',
  eclipseRing:
    'Первая группа 4+ до действия врага: по 2 каждого резонанса за 2 HP. При HP ≤2 выключено.',
  dullPunch:
    'Первая обычная тройка удара за действие превращает до 2 базового урона в барьер. При полном барьере урон не теряется.',
  auditPencil:
    'Первая обычная группа вида в начальной волне отдаёт 1 добытый резонанс, чтобы ослабить первое попадание следующего действия врага на 2. Раз за цикл.',
  edgeSleeves:
    'Обычная группа у края в начальной волне: −1 добытый резонанс, +3 барьера. Раз за действие; требуется место для всех 3.',
  reserveLining:
    'После барьера осталось 4+ урона: потратить 3 резонанса и поглотить 4. После оплаты должно остаться ползапаса; раз за действие врага.',
  waitingVest:
    'Перед вторым попаданием серии врага: потратить 2 резонанса ярости и получить 4 барьера. Раз за действие врага.',
  exchangeCoupon:
    'Заработать серией 3 золота за действие → перенести 2 резонанса из самого полного по доле запаса в самый пустой. Только целиком.',
  safetyMagnet:
    '3 магических камня начальной волны снимают таймер с оставшейся бомбы. Если бомб нет — понижают оставшийся улучшенный удар на один уровень. Раз за цикл врага.',
  agreementSheet:
    'Обычная тройка лечения в начальной волне отдаёт 1 резонанс и оставляет средний камень ярости. Он падает вместе с полем. Раз за цикл врага.',
  shiftRing:
    'При смене вида первой обычной группы обмена перенаправить 1 добытый резонанс в вид предыдущего обмена, если там есть место. S очищает память.',
  openRing:
    'Вместимость каждого резонанса −6, минимум 6. Нет бесплатного усиления или компенсации.',
  yieldRing:
    'В режиме «В защиту» длинные группы отдают создаваемый улучшенный или S-камень за до 5 барьера. До 3 раз за бой.',
  lastPass:
    'Обычная тройка начальной волны при сумме резонанса ≤6 может задержать врага на 1 обмен. Нужен обмен без 4+; один раз за бой.',
};
const risks: Partial<Record<ItemId, string>> = {
  reservoir: 'Большая вместимость отдаляет полный запас и переполнение.',
  fullBlade:
    'Удар расходует резерв для других предметов и сбивает полный запас.',
  contractBlade: 'Лечение выше половины HP отключает оружие.',
  bloodInkwell: 'Самооплата не поглощается барьером и не заряжает Плащ ответа.',
  quarterCutter:
    'Обычные и улучшенные тройки удара теряют базовый урон. Длинная группа может не найтись.',
  capacitor:
    'Само кольцо резонанс не тратит. Без подходящего партнёра оно не заряжается.',
  infiniteDiploma:
    'Вы теряете опыт за улучшенные камни, поэтому уровень растёт медленнее.',
  mortgage: 'Каждая оплаченная прибавка стоит 2 HP даже при большом барьере.',
  saltCoat: 'Все лечебные группы восстанавливают на 40% меньше.',
  waterwheel: 'Расход удара может сбить полный запас Полного клинка.',
  glassNib: 'Входящий урон растёт и в обменах без усиленных приёмов.',
  goldenLining: 'Лечение автоматически тратит деньги для магазина.',
  eclipseRing: '2 HP платятся даже при полных запасах.',
  dullPunch: 'Защита уменьшает удар; мирное действие врага может сжечь барьер.',
  auditPencil:
    'Меньше собственного резонанса. Против мирного действия врага ослабление может пропасть впустую.',
  edgeSleeves: 'Собственный резонанс меняется на временную защиту.',
  reserveLining:
    'Защита автоматически расходует запас и может отключить бонус Полного клинка.',
  waitingVest:
    'Не защищает от первого попадания и ничего не даёт против одиночных атак.',
  exchangeCoupon:
    'Перенос может разрушить полный запас, подготовленный для оружия.',
  safetyMagnet: 'Без бомбы теряется уровень вашего ударного камня.',
  agreementSheet:
    'Лечение приносит меньше резонанса и меняет подготовленную раскладку.',
  shiftRing: 'Текущий вид приносит на 1 меньше резонанса.',
  openRing:
    'Само по себе уменьшает резерв. Будущий подходящий партнёр не гарантирован.',
  yieldRing:
    'Защита уничтожает будущий усиленный приём или S. Таймер врага всё равно продвигается.',
  lastPass:
    'Малый запас несовместим с обычным накоплением на полный цвет; не помогает при уже отложенном действии.',
};
export const MIRROR_ITEMS = Object.fromEntries(
  Object.entries(ITEMS).map(([id, item]) => [
    id,
    {
      ...item,
      description: descriptions[id as ItemId],
      risk: risks[id as ItemId],
    },
  ]),
) as Record<ItemId, Item>;

export const owns = (hero: Hero, id: ItemId) =>
  Object.values(hero.gear).includes(id);
export const resonanceCap = (hero: Hero) =>
  Math.max(
    6,
    12 + (owns(hero, 'reservoir') ? 8 : 0) - (owns(hero, 'openRing') ? 6 : 0),
  );
export const freshItemMemory = (
  run: Record<string, number> = {},
): ItemMemory => ({ action: {}, cycle: {}, battle: {}, run: { ...run } });
const mem = (c: ItemContext) => c.hero.itemState;
const inc = (bag: Record<string, number>, key: string, n = 1) =>
  (bag[key] = (bag[key] ?? 0) + n);
const first = (bag: Record<string, number>, key: string) =>
  !bag[key] && !!(bag[key] = 1);
const sumResonance = (hero: Hero) =>
  CHANNELS.reduce((sum, channel) => sum + hero.resonance[channel], 0);
const has = (c: ItemContext, id: ItemId) => owns(c.hero, id);
const cap = (c: ItemContext) => resonanceCap(c.hero);
const lowest = (c: ItemContext) =>
  [...CHANNELS].sort((a, b) => c.hero.resonance[a] - c.hero.resonance[b])[0];
const spend = (c: ItemContext, channel: Channel, amount: number) => {
  const actual = Math.min(c.hero.resonance[channel], amount);
  c.hero.resonance[channel] -= actual;
  if (actual && has(c, 'capacitor') && !mem(c).battle.capacitorReady) {
    inc(mem(c).battle, 'capacitorSpent', actual);
    if (mem(c).battle.capacitorSpent >= 12) {
      mem(c).battle.capacitorSpent -= 12;
      mem(c).battle.capacitorReady = c.state.action + 1;
    }
  }
  return actual;
};
const note = (c: ItemContext, id: ItemId, text: string) =>
  c.log(`${MIRROR_ITEMS[id].name}: ${text}`);
function surviving(c: ItemContext, e?: GroupEvent): number[] {
  return c.state.board.flatMap((tile, i) =>
    !e?.removed.has(i) &&
    !e?.protectedTiles.has(i) &&
    !tile.locked &&
    !tile.bomb
      ? [i]
      : [],
  );
}
function improveStrike(c: ItemContext, e?: GroupEvent): boolean {
  const choices = surviving(c, e).filter(
    (i) => c.state.board[i].kind === 'strike' && c.state.board[i].level === 1,
  );
  if (!choices.length) return false;
  const i = choices[Math.floor(c.random() * choices.length)];
  c.state.board[i] = { ...c.state.board[i], level: 2 };
  return true;
}
function minted(c: ItemContext, amount: number, e?: GroupEvent) {
  if (!has(c, 'mint') || mem(c).cycle.mint) return;
  inc(mem(c).cycle, 'mintIncome', amount);
  if (mem(c).cycle.mintIncome >= 2 && improveStrike(c, e)) {
    mem(c).cycle.mint = 1;
    note(c, 'mint', 'камень удара улучшен до II.');
  }
}

export function startBattle(c: ItemContext) {
  c.hero.itemState = freshItemMemory(c.hero.itemState?.run);
  if (has(c, 'pocketVest')) c.addBarrier(6);
  if (has(c, 'bluePass')) {
    c.grantResonance('mend', 2);
    c.grantResonance('rage', 2);
  }
}
export function startAction(c: ItemContext) {
  mem(c).action = {};
  if (has(c, 'mirrorVest')) c.addBarrier(2);
  if (mem(c).battle.veilUntil && c.state.action > mem(c).battle.veilUntil)
    delete mem(c).battle.veilUntil;
}
export function onOverflow(c: ItemContext, lost: number) {
  if (lost <= 0 || !has(c, 'overflowRobe')) return;
  inc(mem(c).action, 'overflow', lost);
  if (mem(c).action.overflow >= 3 && first(mem(c).action, 'overflowRobe'))
    c.addBarrier(3);
}

export function beforeGroup(c: ItemContext, e: GroupEvent) {
  const { action, cycle, battle } = mem(c);
  const ch = e.channel;
  const ordinary = !!ch && !e.special;
  const triple = e.match.shape === 'three';
  const long = e.match.shape !== 'three';
  if (long) action.anyLong = 1;
  if (e.manual && e.firstWave && ordinary) {
    if (triple) action.firstTriple = 1;
    const primaryGroup = !action.primary;
    if (primaryGroup) {
      action.primary = CHANNELS.indexOf(ch!) + 1;
    }
    if (
      has(c, 'auditPencil') &&
      e.income >= 1 &&
      !cycle.auditPencil &&
      c.enemy.weaken < 2
    ) {
      e.income--;
      c.enemy.weaken = 2;
      cycle.auditPencil = 1;
      note(c, 'auditPencil', '−1 резонанс; ближайшее попадание −2.');
    }
    const edge = e.match.cells.some(
      (i) =>
        i < COLS ||
        i >= COLS * (ROWS - 1) ||
        i % COLS === 0 ||
        i % COLS === COLS - 1,
    );
    if (
      has(c, 'edgeSleeves') &&
      edge &&
      e.income >= 1 &&
      c.hero.barrier <= 9 &&
      !action.edgeSleeves
    ) {
      e.income--;
      c.addBarrier(3);
      action.edgeSleeves = 1;
    }
    if (
      has(c, 'agreementSheet') &&
      ch === 'mend' &&
      triple &&
      e.income >= 1 &&
      !cycle.agreementSheet
    ) {
      const i = e.match.cells[Math.floor(e.match.cells.length / 2)];
      e.protectedTiles.set(i, {
        ...c.state.board[i],
        kind: 'rage',
        level: 1,
        locked: undefined,
        bomb: undefined,
      });
      e.income--;
      cycle.agreementSheet = 1;
    }
    if (
      has(c, 'shiftRing') &&
      primaryGroup &&
      !action.shiftRing &&
      e.income >= 1 &&
      mem(c).previous &&
      mem(c).previous !== ch &&
      c.hero.resonance[mem(c).previous!] < cap(c)
    ) {
      e.income--;
      c.grantResonance(mem(c).previous!, 1);
      action.shiftRing = 1;
    }
  }
  if (
    e.match.upgrade &&
    has(c, 'yieldRing') &&
    c.state.guard &&
    (battle.yieldUses ?? 0) < 3 &&
    c.hero.barrier < 12
  ) {
    const gained = c.addBarrier(5);
    if (gained) {
      e.cancelUpgrade = true;
      inc(battle, 'yieldUses');
      note(c, 'yieldRing', `камень отдан за ${gained} барьера.`);
    }
  }
  if (ch === 'strike') {
    if (has(c, 'quarterCutter')) {
      if (triple) e.baseDamage = 0;
      else if (first(action, 'quarterCutter')) e.bonusDamage += 8;
    }
    if (has(c, 'dullPunch') && ordinary && triple && !action.dullPunch) {
      const diverted = Math.min(2, e.baseDamage, 12 - c.hero.barrier);
      if (diverted > 0) {
        e.baseDamage -= diverted;
        c.addBarrier(diverted);
        action.dullPunch = 1;
      }
    }
    if (has(c, 'paperKnife') && first(action, 'paperKnife')) e.bonusDamage++;
    if (has(c, 'chargeSeal') && long && first(action, 'chargeSeal'))
      e.bonusDamage += 4;
    if (has(c, 'fullBlade') && first(action, 'fullBlade')) {
      const full = CHANNELS.filter((k) => c.hero.resonance[k] === cap(c));
      for (const k of full) spend(c, k, 2);
      e.bonusDamage += full.length * 4;
    }
    if (
      has(c, 'contractBlade') &&
      c.hero.hp <= c.hero.maxHp / 2 &&
      first(action, 'contractBlade')
    )
      e.bonusDamage += 5;
    if (has(c, 'mortgage') && c.hero.hp > 2 && first(action, 'mortgage')) {
      c.hero.hp -= 2;
      e.bonusDamage += 6;
    }
    if (has(c, 'answerCloak') && battle.answer) {
      e.bonusDamage += 3;
      delete battle.answer;
    }
    if (has(c, 'emberKnife') && battle.ember) {
      e.bonusDamage += 3;
      delete battle.ember;
    }
    if (has(c, 'graphite') && action.graphiteReady) {
      e.bonusDamage += 2;
      delete action.graphiteReady;
    }
    if (has(c, 'ledger') && battle.ledgerReady) {
      e.bonusDamage += 6;
      delete battle.ledgerReady;
    }
    if (has(c, 'veil') && battle.veilUntil) {
      e.bonusScale *= 1.5;
      delete battle.veilUntil;
    }
  }
  const attacking = e.baseDamage > 0 || (ch === 'strike' && e.bonusDamage > 0);
  if (e.special && attacking) {
    if (has(c, 'stylus')) e.bonusDamage += 2;
    if (has(c, 'glassNib')) e.bonusDamage += 5;
    if (
      has(c, 'bloodInkwell') &&
      c.hero.hp > 2 &&
      first(cycle, 'bloodInkwell')
    ) {
      c.hero.hp -= 2;
      e.bonusDamage += 3;
    }
    if (has(c, 'carbonPaper') && first(cycle, 'carbonPaper'))
      e.bonusDamage += Math.min(6, Math.floor(e.baseDamage / 2));
    if (has(c, 'metronome') && battle.metronome) {
      e.bonusDamage += 3;
      delete battle.metronome;
    }
  }
}

export function afterGroup(c: ItemContext, e: GroupEvent) {
  const { action, cycle, battle } = mem(c);
  const ch = e.channel;
  if (ch) {
    const count = inc(action, `collected:${ch}`, e.match.cells.length);
    if (
      has(c, 'capacitor') &&
      battle.capacitorReady &&
      c.state.action >= battle.capacitorReady
    ) {
      delete battle.capacitorReady;
      c.grantResonance(ch, 4);
    }
    if (count >= 3) {
      if (ch === 'strike') {
        if (has(c, 'copperClip') && first(action, 'copperClip'))
          c.grantResonance('arcane', 1);
        if (has(c, 'fireSeal') && first(action, 'fireSeal'))
          c.grantResonance('strike', 2);
        if (has(c, 'emberKnife') && first(action, 'emberKnife'))
          battle.ember = 1;
      }
      if (ch === 'mend') {
        if (has(c, 'tideNeedle') && first(action, 'tideNeedle')) c.damage(2);
        if (
          has(c, 'cottonCuffs') &&
          (battle.cuffs ?? 0) < 6 &&
          first(action, 'cottonCuffs')
        )
          inc(battle, 'cuffs', c.heal(1));
        if (
          has(c, 'tidePurse') &&
          (battle.purse ?? 0) < 8 &&
          first(action, 'tidePurse')
        ) {
          const n = Math.min(2, 8 - (battle.purse ?? 0));
          inc(battle, 'purse', n);
          c.addGold(n);
          minted(c, n, e);
        }
        if (has(c, 'waterwheel') && first(action, 'waterwheel')) {
          spend(c, 'strike', 2);
          c.grantResonance('rage', 3);
        }
      }
      if (ch === 'rage') {
        if (has(c, 'apron') && first(action, 'apron')) c.addBarrier(2);
        if (has(c, 'teaBag') && first(action, 'teaBag'))
          c.grantResonance('mend', 1);
      }
      if (ch === 'arcane') {
        if (has(c, 'graphite') && first(action, 'graphite'))
          action.graphiteReady = 1;
        if (has(c, 'metronome') && first(action, 'metronome'))
          battle.metronome = 1;
        if (
          has(c, 'safetyMagnet') &&
          e.manual &&
          e.firstWave &&
          !cycle.safetyMagnet
        ) {
          const eligible = c.state.board.flatMap((tile, i) =>
            !e.removed.has(i) && !e.protectedTiles.has(i) ? [i] : [],
          );
          const bomb = eligible.find(
            (i) =>
              (c.state.board[i].bomb ?? 0) > 0 &&
              ![...e.removed].some((cell) => adjacent(cell, i)),
          );
          const upgrade = eligible.find(
            (i) =>
              c.state.board[i].kind === 'strike' && c.state.board[i].level > 1,
          );
          const i = bomb ?? upgrade;
          if (i !== undefined) {
            c.state.board[i] =
              bomb !== undefined
                ? { ...c.state.board[i], bomb: undefined }
                : {
                    ...c.state.board[i],
                    level: (c.state.board[i].level - 1) as Tile['level'],
                  };
            cycle.safetyMagnet = 1;
            note(
              c,
              'safetyMagnet',
              bomb !== undefined
                ? 'бомба обезврежена.'
                : 'уровень ударного камня потерян.',
            );
          }
        }
      }
      if (has(c, 'directorPen')) battle[`seal:${ch}`] = 1;
    }
    const kinds = CHANNELS.filter(
      (k) => (action[`collected:${k}`] ?? 0) > 0,
    ).length;
    if (has(c, 'conductor') && kinds >= 2 && first(action, 'conductor'))
      c.grantResonance(lowest(c), 2);
    if (has(c, 'prism') && kinds >= 3 && first(action, 'prism')) {
      c.damage(3);
      c.addBarrier(2);
    }
    if (
      has(c, 'directorPen') &&
      !cycle.directorPen &&
      CHANNELS.every((k) => battle[`seal:${k}`])
    ) {
      for (const k of CHANNELS) delete battle[`seal:${k}`];
      cycle.directorPen = 1;
      c.damage(8);
      c.addBarrier(4);
    }
  }
  if (e.match.shape !== 'three') {
    if (has(c, 'veil')) battle.veilUntil = c.state.action + 3;
    if (has(c, 'wick') && ch === 'strike' && !cycle.wick && improveStrike(c, e))
      cycle.wick = 1;
    if (has(c, 'eclipseRing') && c.hero.hp > 2 && first(cycle, 'eclipseRing')) {
      c.hero.hp -= 2;
      for (const k of CHANNELS) c.grantResonance(k, 2);
    }
  }
  if (e.special) {
    if (has(c, 'saltCoat') && first(cycle, 'saltCoat')) c.addBarrier(3);
    if (has(c, 'catalyst') && first(action, 'catalyst'))
      c.grantResonance(ch ?? lowest(c), 2);
    if (
      has(c, 'spinningTop') &&
      !battle.topReady &&
      inc(battle, 'topCasts') >= 3
    ) {
      battle.topCasts = 0;
      battle.topReady = 1;
    }
  }
  if (e.firstWave)
    action.lastPassCandidate =
      action.firstTriple && !action.anyLong && sumResonance(c.hero) <= 6
        ? 1
        : 0;
}

// Only the engine's native combo income enters this hook. Item gifts cannot
// recursively count as collected coins/experience; Mint is the explicit exception.
export function onIncome(c: ItemContext, kind: 'gold' | 'xp', amount: number) {
  if (amount <= 0) return;
  const { action, cycle, battle } = mem(c);
  if (kind === 'xp') {
    if (has(c, 'infiniteDiploma')) {
      const converted = Math.min(
        amount,
        Math.max(0, 4 - (action.diploma ?? 0)),
      );
      inc(action, 'diploma', converted);
      for (const k of CHANNELS) c.grantResonance(k, converted);
    } else {
      if (
        has(c, 'scholar') &&
        (battle.scholar ?? 0) < 6 &&
        first(action, 'scholar')
      ) {
        const n = Math.min(2, 6 - (battle.scholar ?? 0));
        inc(battle, 'scholar', n);
        c.addXp(n);
      }
      if (has(c, 'lens') && first(action, 'lens'))
        c.grantResonance('arcane', 2);
    }
    if (has(c, 'archiveVest') && first(action, 'archiveVest')) c.addBarrier(3);
    return;
  }
  minted(c, amount);
  const coins = inc(action, 'nativeGold', amount);
  if (has(c, 'ledger') && !battle.ledgerReady) {
    inc(battle, 'ledgerCoins', amount);
    if (battle.ledgerCoins >= 6) {
      battle.ledgerCoins -= 6;
      battle.ledgerReady = 1;
    }
  }
  if (coins < 3) return;
  if (has(c, 'abacus') && first(action, 'abacus')) c.addBarrier(2);
  if (has(c, 'exchangeCoupon') && !action.exchangeCoupon) {
    const ordered = [...CHANNELS].sort(
      (a, b) => c.hero.resonance[a] - c.hero.resonance[b],
    );
    const low = ordered[0],
      high = [...CHANNELS].sort(
        (a, b) => c.hero.resonance[b] - c.hero.resonance[a],
      )[0];
    if (
      high !== low &&
      c.hero.resonance[high] > c.hero.resonance[low] &&
      c.hero.resonance[high] >= 2 &&
      c.hero.resonance[low] <= cap(c) - 2
    ) {
      // Moving the same resource is not expenditure and cannot charge Capacitor.
      c.hero.resonance[high] -= 2;
      c.grantResonance(low, 2);
      action.exchangeCoupon = 1;
    }
  }
  if (
    has(c, 'goldenLining') &&
    !cycle.goldenLining &&
    (battle.goldenHealed ?? 0) < 12 &&
    c.hero.gold >= 2 &&
    c.hero.hp < c.hero.maxHp
  ) {
    c.hero.gold -= 2;
    inc(
      battle,
      'goldenHealed',
      c.heal(Math.min(3, 12 - (battle.goldenHealed ?? 0))),
    );
    cycle.goldenLining = 1;
  }
}

export function beforeEnemyHit(
  c: ItemContext,
  damage: number,
  hitIndex: number,
): number {
  const cycle = mem(c).cycle;
  let next = Math.max(0, damage);
  if (
    hitIndex > 0 &&
    has(c, 'waitingVest') &&
    !cycle.waitingVest &&
    c.hero.resonance.rage >= 2 &&
    c.hero.barrier <= 8
  ) {
    spend(c, 'rage', 2);
    c.addBarrier(4);
    cycle.waitingVest = 1;
  }
  if (has(c, 'glassNib') && hitIndex === 0) next++;
  if (has(c, 'coat')) {
    const absorb = Math.min(next, Math.max(0, 2 - (cycle.coatAbsorbed ?? 0)));
    next -= absorb;
    inc(cycle, 'coatAbsorbed', absorb);
  }
  if (has(c, 'ward') && hitIndex === 0 && c.random() < 0.2) {
    note(c, 'ward', 'первое попадание отменено.');
    return 0;
  }
  return next;
}
export function afterBarrierDamage(c: ItemContext, damage: number): number {
  if (damage < 4 || !has(c, 'reserveLining') || mem(c).cycle.reserveLining)
    return damage;
  const suitable = [...CHANNELS]
    .filter((k) => c.hero.resonance[k] - 3 >= Math.ceil(cap(c) / 2))
    .sort((a, b) => c.hero.resonance[b] - c.hero.resonance[a]);
  if (!suitable.length) return damage;
  spend(c, suitable[0], 3);
  mem(c).cycle.reserveLining = 1;
  return damage - 4;
}
export function preventDeath(c: ItemContext, damage: number): number {
  if (damage < c.hero.hp || !has(c, 'insurance') || mem(c).run.insurance)
    return damage;
  mem(c).run.insurance = 1;
  c.addBarrier(6);
  note(c, 'insurance', 'смертельное попадание оставило 1 HP.');
  return Math.max(0, c.hero.hp - 1);
}
export function afterEnemyHit(
  c: ItemContext,
  hpLost: number,
  absorbed: number,
  _hitIndex: number,
) {
  if (hpLost > 0 && has(c, 'answerCloak')) mem(c).battle.answer = 1;
  if (absorbed > 0 && has(c, 'mirrorVest')) {
    const total = inc(mem(c).cycle, 'mirrorAbsorbed', absorbed);
    const reflected = Math.min(3, Math.floor(total / 2));
    const owed = reflected - (mem(c).cycle.mirrorReflected ?? 0);
    if (owed > 0) {
      mem(c).cycle.mirrorReflected = reflected;
      c.damage(owed);
    }
  }
}
export function afterEnemyAction(c: ItemContext) {
  mem(c).cycle = {};
}
export function afterAction(c: ItemContext) {
  const { action, cycle, battle } = mem(c);
  mem(c).previous = action.primary ? CHANNELS[action.primary - 1] : undefined;
  if (c.hero.hp <= 0 || c.enemy.hp <= 0) return;
  if (
    has(c, 'spinningTop') &&
    battle.topReady &&
    !cycle.spinningTop &&
    c.delayEnemy()
  ) {
    delete battle.topReady;
    cycle.spinningTop = 1;
    note(c, 'spinningTop', 'враг задержан на обмен.');
  }
  if (
    has(c, 'lastPass') &&
    !battle.lastPassUsed &&
    action.lastPassCandidate &&
    !action.anyLong &&
    c.delayEnemy()
  ) {
    battle.lastPassUsed = 1;
    note(c, 'lastPass', 'враг задержан на обмен.');
  }
}

export function itemWarnings(hero: Hero, replacement?: ItemId): string[] {
  const equipped = {
    ...hero.gear,
    ...(replacement ? { [ITEMS[replacement].slot]: replacement } : {}),
  };
  const ids = Object.values(equipped);
  const warnings = ids.flatMap((id) =>
    MIRROR_ITEMS[id!].risk
      ? [`${MIRROR_ITEMS[id!].name}: ${MIRROR_ITEMS[id!].risk}`]
      : [],
  );
  if (
    ids.includes('openRing') &&
    !ids.some((id) =>
      ['fullBlade', 'overflowRobe', 'reserveLining'].includes(id!),
    )
  )
    warnings.push(
      'Малые запасы пока нечем преобразовать в преимущество. Партнёр может не выпасть.',
    );
  if (
    ids.includes('reservoir') &&
    ids.some((id) => ['fullBlade', 'overflowRobe'].includes(id!))
  )
    warnings.push('Резервуар отдаляет срабатывание предметов полного запаса.');
  if (
    ids.includes('capacitor') &&
    !ids.some((id) =>
      ['fullBlade', 'reserveLining', 'waterwheel'].includes(id!),
    )
  )
    warnings.push(
      'В комплекте нет предмета, который тратит резонанс и заряжает Конденсатор.',
    );
  return warnings;
}

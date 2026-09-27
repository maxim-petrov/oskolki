/**
 * The balance contract: what the simulation must show for the game to count as balanced. The
 * numbers come from GDD §13 (marked «GDD») or were set with the balance tests (their reason is
 * given). `npm run balance` checks every target and writes the verdict into docs/balance/REPORT.md.
 *
 * A metric is a key in the runner's metrics table (see scripts/balance.mjs, `metrics`); `min` and
 * `max` are inclusive. `hard` targets fail the run (exit code 1), soft ones are warnings.
 */
export interface Target {
  id: string;
  /** What is checked, in the report's words. */
  title: string;
  metric: string;
  min?: number;
  max?: number;
  hard?: boolean;
  /** Where the number comes from. */
  why: string;
  /** Show the metric as a percentage. */
  pct?: boolean;
}

const ACT_NAMES = ['1-й отдел', '2-й отдел', '3-й отдел', '4-й отдел'];

function perAct(acts: number[], make: (a: number, name: string) => Target[]): Target[] {
  return acts.flatMap((a) => make(a, ACT_NAMES[a]));
}

export const TARGETS: Target[] = [
  // ── Engine ─────────────────────────────────────────────────────────
  {
    id: 'engine.violations',
    title: 'Движок: нарушения инвариантов',
    metric: 'engine.violations',
    max: 0,
    hard: true,
    why: 'любое нарушение — баг',
  },
  {
    id: 'engine.stuck',
    title: 'Движок: зависшие бои и забеги',
    metric: 'engine.stuck',
    max: 0,
    hard: true,
    why: 'игрок не должен застревать',
  },
  {
    id: 'engine.stalls',
    title: 'Бесконечные бои в реальных сборках',
    metric: 'engine.stalls',
    max: 0,
    why: 'бой должен кончаться: победой или смертью',
  },

  // ── Whole runs (GDD §13) ───────────────────────────────────────────
  {
    id: 'run.greedy.act1',
    title: 'Жадный бот проходит 1-й отдел',
    metric: 'greedy.clear.0',
    min: 0.7,
    max: 0.9,
    hard: true,
    pct: true,
    why: 'GDD: ~80%',
  },
  {
    id: 'run.greedy.win',
    title: 'Жадный бот проходит забег (3 отдела)',
    metric: 'greedy.win',
    min: 0.15,
    max: 0.35,
    hard: true,
    pct: true,
    why: 'GDD: 15–35%',
  },
  {
    id: 'run.randomGear',
    title: 'Случайные вещи заметно хуже жадного выбора',
    metric: 'randomGear.gap',
    min: 0.05,
    pct: true,
    why: 'GDD: «заметно хуже жадного» — разница не меньше 5 п.п.',
  },
  {
    id: 'run.noGear',
    title: 'Без новых вещей забег почти не пройти',
    metric: 'noGear.win',
    max: 0.1,
    hard: true,
    pct: true,
    why: 'GDD: ~5%',
  },
  ...perAct([0, 1, 2], (a, name) => [
    {
      id: `act${a}.bite`,
      title: `${name}: доля смертей среди дошедших`,
      metric: `greedy.deathRate.${a}`,
      min: 0.08,
      max: 0.4,
      pct: true,
      why: 'каждый отдел должен угрожать: без провалов и без стены',
    },
  ]),

  // ── Fight pacing (GDD §13) ─────────────────────────────────────────
  ...perAct([0, 1, 2], (a, name) => [
    {
      id: `act${a}.fight.moves`,
      title: `${name}: ходов в обычном бою`,
      metric: `greedy.fight.moves.${a}`,
      min: 5,
      max: 9,
      hard: true,
      why: 'GDD: 5–9 ходов',
    },
    {
      id: `act${a}.fight.acts`,
      title: `${name}: действий врагов в обычном бою`,
      metric: `greedy.fight.acts.${a}`,
      min: 2,
      max: 4,
      why: 'GDD: 2–4 действия врагов',
    },
    {
      id: `act${a}.boss.moves`,
      title: `${name}: ходов в бою с боссом`,
      metric: `greedy.boss.moves.${a}`,
      min: 12,
      max: 20,
      hard: true,
      why: 'GDD: 12–20 ходов',
    },
    {
      id: `act${a}.boss.hurt`,
      title: `${name}: босс отнимает здоровья`,
      metric: `greedy.boss.hurt.${a}`,
      min: 0.15,
      pct: true,
      why: 'босс должен ранить: не меньше 15% здоровья в среднем',
    },
    {
      id: `act${a}.elite.hurt`,
      title: `${name}: начальство отнимает здоровья`,
      metric: `greedy.elite.hurt.${a}`,
      min: 0.1,
      pct: true,
      why: 'начальство сильнее обычного боя: не меньше 10% здоровья',
    },
    {
      id: `act${a}.big.wound`,
      title: `${name}: начальство и боссы ранят, а не только убивают`,
      metric: `greedy.big.wound.${a}`,
      min: 0.3,
      pct: true,
      why: 'доля выигранных боёв с начальством и боссом, где герой потерял здоровье: иначе бой — всё или ничего',
    },
    {
      id: `act${a}.boss.fast`,
      title: `${name}: боссы, убитые за 5 ходов и быстрее`,
      metric: `greedy.boss.fast.${a}`,
      max: 0.1,
      pct: true,
      why: 'сборка не должна обнулять босса',
    },
  ]),

  // ── Content ────────────────────────────────────────────────────────
  {
    id: 'encounters.spikes',
    title: 'Встречи-выбросы по опасности',
    metric: 'encounters.spikes',
    max: 0,
    why: 'встреча не опаснее тройной медианы своего отдела',
  },
  {
    id: 'encounters.free',
    title: 'Встречи, которые ничего не стоят',
    metric: 'encounters.free',
    max: 0,
    why: 'встреча, которая не ранит, не нужна',
  },
  {
    id: 'items.op',
    title: 'Предметы-имбы',
    metric: 'items.op',
    max: 0,
    why: 'предмет со старта не должен поднимать победы больше чем на 20 п.п.',
  },
  {
    id: 'items.harmful',
    title: 'Вредные предметы',
    metric: 'items.harmful',
    max: 0,
    why: 'предмет не должен уверенно мешать',
  },
  {
    id: 'items.weak',
    title: 'Предметы без заметного эффекта',
    metric: 'items.weak',
    max: 3,
    why: 'пустышки не радуют находкой',
  },
  {
    id: 'gear.op',
    title: 'Вещи-имбы',
    metric: 'gear.op',
    max: 0,
    why: 'одна вещь не должна решать забег',
  },
  {
    id: 'gear.worse',
    title: 'Вещи хуже простой вещи своего цвета',
    metric: 'gear.worse',
    max: 2,
    why: 'найденная вещь должна быть не хуже стартовой',
  },
  {
    id: 'eraser.gain',
    title: 'Ластик на совпадения: прибавка к победам',
    metric: 'eraser.gain',
    max: 0.15,
    pct: true,
    why: 'бесплатные действия не должны решать забег',
  },
  {
    id: 'eraser.free',
    title: 'Доля урона от бесплатных действий (ластик на совпадения)',
    metric: 'eraser.freeShare',
    max: 0.35,
    pct: true,
    why: 'основной урон — от ходов, которые тратят время',
  },
  {
    id: 'heroes.spread',
    title: 'Разброс побед между героями',
    metric: 'heroes.spread',
    max: 0.15,
    pct: true,
    why: 'все герои играбельны, никто не доминирует',
  },
  {
    id: 'shops.useful',
    title: 'Касса, где удалось что-то купить',
    metric: 'greedy.shops.buy',
    min: 0.5,
    pct: true,
    why: 'касса должна быть событием, а не витриной',
  },
  // ── Energy, finds, coins (GDD §4, §9) ───────────────────────────────
  {
    id: 'energy.rush',
    title: 'Ходы вне очереди',
    metric: 'greedy.rushShare',
    max: 0.2,
    pct: true,
    why: 'враги должны ходить: «Вне очереди» — передышка, а не заморозка боя',
  },
  {
    id: 'finds.perAct',
    title: 'Находок за отдел',
    metric: 'greedy.findsPerAct',
    min: 1.5,
    max: 3,
    why: 'находка — событие, а не поток',
  },
  {
    id: 'coins.shop',
    title: 'Монет при входе в кассу (медиана)',
    metric: 'greedy.shopCoinsMed',
    min: 25,
    max: 75,
    why: 'в кассу приходят с деньгами на выбор, но не на всё',
  },
  {
    id: 'coins.lost',
    title: 'Монет сгорело на потолке кошелька',
    metric: 'greedy.coinsLostShare',
    max: 0.1,
    pct: true,
    why: 'кошелёк на 99 — повод тратить, а не копить впустую',
  },
  {
    id: 'act4.bite',
    title: '4-й отдел: доля смертей среди дошедших',
    metric: 'full4.deathRate.3',
    min: 0.1,
    max: 0.6,
    pct: true,
    why: 'Дирекция — финал для открытого аккаунта',
  },
];

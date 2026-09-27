import type { Fam, RunState } from '../types.ts';

/**
 * «Непонятное» on the map: short scenes on a memo sheet with 2–3 choices. Effects go
 * through EventApi (implemented in run.ts) so this file stays free of engine imports.
 */
export interface EventApi {
  run: RunState;
  /** Deterministic roll in [0, 1). */
  roll(): number;
  coins(n: number): void;
  heal(n: number): void;
  /** Hurts, but never below 1 hp: an event cannot kill. */
  hurt(n: number): void;
  maxHp(n: number): void;
  /** Gives an item of gear (held at once); returns its name, or null when the colour's hands are full. */
  gear(id: string): string | null;
  /** A random item of gear, optionally of one rarity and colour; its name, or null when nothing fits. */
  randomGear(rarity?: 'common' | 'uncommon' | 'rare', fam?: Fam): string | null;
  /** Red tape («Волокита»): junk tiles in the bag of every fight. */
  curse(): void;
  /** Takes one red tape curse away; false when there is none. */
  uncurse(): boolean;
  /** A random relic of a tier; returns its name or null when the pool is empty. */
  relic(tier?: 'common' | 'uncommon' | 'rare'): string | null;
  /** A random consumable into a free pocket; returns its name or null when pockets are full. */
  pocket(): string | null;
  shards(n: number): void;
  /** Lets the player choose items of gear (the scene waits). */
  pick(purpose: 'upgrade' | 'transform', count: number, fam?: Fam): void;
  /** Upgrades random items of gear (of a colour); returns their names. */
  upgradeRandom(n: number, fam?: Fam): string[];
  /** Upgrades the item held in a colour; its name, or null when it is upgraded already. */
  upgradeEquipped(fam: Fam): string | null;
  /** Keys to the safe on the sixth floor. */
  key(n: number): void;
  /** The next fight starts with a find on the board. */
  findSoon(): void;
  /** Starts a fight with the act's elite; winning pays a relic on top. */
  eliteFight(): void;
}

export interface EventOption {
  label: string;
  /** Cost and gain in a few words, under the label. */
  hint: string;
  /** Why the option is unavailable right now, or null. */
  locked?: (run: RunState) => string | null;
  /** Applies the choice; returns the outcome text. */
  run: (api: EventApi) => string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** Picture pinned to the memo (sprite id). */
  art: string;
  options: EventOption[];
}

const needCoins = (n: number) => (run: RunState) => (run.hero.coins < n ? `Нужно ${n} монет` : null);
const needTape = (run: RunState) => (run.hero.tape <= 0 ? 'Волокиты нет' : null);
const needUpgrade = (fam?: Fam) => (run: RunState) =>
  Object.entries(run.hero.gear).some(([f, list]) => (!fam || f === fam) && list.some((id) => !run.hero.ups.includes(id))) ? null : 'Улучшать нечего';
const leave = (text: string): EventOption => ({ label: 'Уйти', hint: 'Ничего не случится', run: () => text });

export const EVENTS: EventDef[] = [
  {
    id: 'jam',
    title: 'Замятие в лотке 2',
    text: 'Копир мигает красным: ЗАМЯТИЕ. Изнутри шуршит, будто кто-то листает страницы.',
    art: 'ev_copier',
    options: [
      {
        label: 'Вытащить лист',
        hint: '−½ сердца · улучшить вещь на выбор',
        locked: needUpgrade(),
        run: (a) => {
          a.hurt(1);
          a.pick('upgrade', 1);
          return 'Лист выходит тёплым. На нём — твоя вещь, только чуть лучше.';
        },
      },
      {
        label: 'Пнуть копир',
        hint: '50%: +20 монет, иначе −1 сердце',
        run: (a) => {
          if (a.roll() < 0.5) {
            a.coins(20);
            return 'Из лотка сыплется мелочь. Кто-то копил её там годами.';
          }
          a.hurt(2);
          return 'Копир пинает в ответ.';
        },
      },
      leave('Шуршание стихает. Тебе, конечно, показалось.'),
    ],
  },
  {
    id: 'meeting',
    title: 'Совещание, которое могло быть письмом',
    text: 'В переговорке двенадцать человек смотрят на слайд «Синергия-2». Тебе оставили стул.',
    art: 'ev_meeting',
    options: [
      {
        label: 'Высидеть до конца',
        hint: '−1 сердце · улучшить 2 случайные вещи',
        locked: needUpgrade(),
        run: (a) => {
          a.hurt(2);
          const up = a.upgradeRandom(2);
          return `Через час ты понимаешь синергию. Улучшены: ${up.join(', ') || 'ничего'}.`;
        },
      },
      {
        label: 'Задремать',
        hint: '+1 сердце · Волокита в мешок',
        run: (a) => {
          a.heal(2);
          a.curse();
          return 'Тебя будят и поручают протокол.';
        },
      },
      leave('Ты уходишь «на срочный звонок». Никто не замечает. Никто никогда не замечает.'),
    ],
  },
  {
    id: 'survey',
    title: 'Анкета удовлетворённости',
    text: '«Оцените рабочий день от 1 до 5». Внизу мелко: «Ваш ответ влияет на всё».',
    art: 'ev_survey',
    options: [
      {
        label: 'Поставить 5',
        hint: '+25 монет · Волокита в мешок',
        run: (a) => {
          a.coins(25);
          a.curse();
          return 'Спасибо! Вам начислена премия. И задачи.';
        },
      },
      {
        label: 'Ответить честно',
        hint: 'Ключ от сейфа',
        run: (a) => {
          a.key(1);
          return 'Анкету забирает шредер. Взамен из щели выпадает ключ с биркой «6 этаж».';
        },
      },
      leave('Через минуту анкета снова лежит на столе.'),
    ],
  },
  {
    id: 'quiet',
    title: 'Тихая комната',
    text: 'Мягкое кресло, лампа, запах лаванды. Табличка: «Отдохните. Это распоряжение».',
    art: 'ev_quiet',
    options: [
      {
        label: 'Вздремнуть',
        hint: '+¼ здоровья',
        run: (a) => {
          a.heal(Math.round(a.run.hero.maxHp * 0.25));
          return 'Тебе снится офис. Проснуться до конца не получается.';
        },
      },
      {
        label: 'Прислушаться к гулу',
        hint: '−½ сердца · +1 осколок',
        run: (a) => {
          a.hurt(1);
          a.shards(1);
          return 'В гуле ламп — голоса. Один из них твой.';
        },
      },
      leave('Кресло ещё долго хранит твою форму.'),
    ],
  },
  {
    id: 'elevator',
    title: 'Лифт без кнопок',
    text: 'Двери открыты. Внутри нет кнопок — только зеркало и табличка «Этаж: ваш».',
    art: 'ev_elevator',
    options: [
      {
        label: 'Войти',
        hint: 'Предмет или −1 сердце',
        run: (a) => {
          if (a.roll() < 0.55) {
            const r = a.relic('uncommon');
            return r ? `Лифт едет вбок. Двери открываются в кладовку, а там — «${r}».` : 'Лифт едет вбок и привозит тебя обратно.';
          }
          a.hurt(2);
          return 'Лифт падает на полэтажа и резко встаёт.';
        },
      },
      {
        label: 'Посмотреть в зеркало',
        hint: '−½ сердца · +1 осколок',
        run: (a) => {
          a.hurt(1);
          a.shards(1);
          return 'Отражение моргает позже тебя.';
        },
      },
      leave('Ты идёшь по лестнице. Лестница длиннее, чем вчера.'),
    ],
  },
  {
    id: 'vending',
    title: 'Торговый автомат',
    text: 'Автомат гудит. Батончик «Сытость» висит на спирали лет десять.',
    art: 'ev_vending',
    options: [
      {
        label: 'Купить батончик',
        hint: '15 монет · +1 сердце к максимуму',
        locked: needCoins(15),
        run: (a) => {
          a.coins(-15);
          a.maxHp(2);
          return 'На вкус как картон. Сытно.';
        },
      },
      {
        label: 'Потрясти',
        hint: '60%: расходник, иначе −½ сердца',
        run: (a) => {
          if (a.roll() < 0.6) {
            const p = a.pocket();
            return p ? `Из лотка выпадает «${p}».` : 'Выпадает что-то, но карманы полны. Оставляешь автомату.';
          }
          a.hurt(1);
          return 'Автомат кренится и почти падает на тебя.';
        },
      },
      leave('Батончик провожает тебя взглядом.'),
    ],
  },
  {
    id: 'birthday',
    title: 'День рождения в отделе',
    text: 'Торт «С днём рождения, ___!» — имя не вписали. Все едят молча.',
    art: 'ev_cake',
    options: [
      {
        label: 'Съесть кусок',
        hint: '+1 сердце к максимуму',
        run: (a) => {
          a.maxHp(2);
          return 'Крем пахнет копиркой.';
        },
      },
      {
        label: 'Скинуться на подарок',
        hint: '30 монет · предмет',
        locked: needCoins(30),
        run: (a) => {
          a.coins(-30);
          const r = a.relic('common');
          return r ? `Тебе вручают подарок, который никто не покупал: «${r}».` : 'Подарок оказывается пустой коробкой.';
        },
      },
      leave('Именинник смотрит тебе вслед. Кажется, это был ты.'),
    ],
  },
  {
    id: 'lost',
    title: 'Стол находок',
    text: 'Коробка с надписью «НИЧЬЁ». Внутри — вещи, которые кто-то очень ждал обратно.',
    art: 'ev_lost',
    options: [
      {
        label: 'Взять ножницы',
        hint: 'Оружие «Ножницы»',
        run: (a) => {
          const name = a.gear('scissors');
          return name ? `Ножницы тёплые, будто их только что держали. ${name} — теперь твоё оружие.` : 'Ножницы тёплые, но руки заняты: ты кладёшь их обратно.';
        },
      },
      {
        label: 'Взять зонтик',
        hint: 'Щит «Зонтик»',
        run: (a) => {
          const name = a.gear('umbrella');
          return name ? `В помещении без окон зонтик мокрый. ${name} — теперь твой щит.` : 'В помещении без окон зонтик мокрый. Руки заняты — он остаётся в коробке.';
        },
      },
      {
        label: 'Взять кошелёк',
        hint: '+25 монет · Волокита в мешок',
        run: (a) => {
          a.coins(25);
          a.curse();
          return 'В кошельке пропуск на твоё имя. Ты его никогда не терял.';
        },
      },
    ],
  },
  {
    id: 'shredder',
    title: 'Шредер',
    text: 'Шредер урчит вхолостую. Стикер: «Кормить документами. Не пальцами».',
    art: 'ev_shredder',
    options: [
      {
        label: 'Скормить волокиту',
        hint: 'Снять одну Волокиту',
        locked: needTape,
        run: (a) => {
          a.uncurse();
          return 'Шредер довольно урчит.';
        },
      },
      {
        label: 'Порыться в обрезках',
        hint: '−½ сердца · находка в следующем бою',
        run: (a) => {
          a.hurt(1);
          a.findSoon();
          return 'Шредер прихватывает рукав. Зато в обрезках что-то блестит — ты суёшь это в карман.';
        },
      },
      leave('Шредер урчит тебе вслед.'),
    ],
  },
  {
    id: 'laminator',
    title: 'Ламинатор разогрет',
    text: 'Ламинатор тёплый и мигает зелёным. Всё, что в него попало, остаётся навсегда.',
    art: 'ev_laminator',
    options: [
      {
        label: 'Заламинировать щит',
        hint: 'Улучшить щит в руке',
        locked: (run) => (run.hero.ups.includes(run.hero.equip.shield) ? 'Щит уже улучшен' : null),
        run: (a) => {
          const name = a.upgradeEquipped('shield');
          return `Плёнка схватывается с тихим щелчком. ${name ?? 'Щит'} теперь держит больше.`;
        },
      },
      {
        label: 'Погреть руки',
        hint: '+1 сердце',
        run: (a) => {
          a.heal(2);
          return 'Тепло. Впервые за день.';
        },
      },
      leave('Зелёная лампочка гаснет, когда ты отворачиваешься.'),
    ],
  },
  {
    id: 'printer',
    title: 'Принтер печатает сам',
    text: 'В лотке растёт стопка. На каждом листе — твоя фамилия и сегодняшняя дата.',
    art: 'ev_printer',
    options: [
      {
        label: 'Прочитать',
        hint: '−½ сердца · +1 осколок',
        run: (a) => {
          a.hurt(1);
          a.shards(1);
          return '«…и снова пошёл в архив в 16:40». Дальше неразборчиво.';
        },
      },
      {
        label: 'Забрать стопку',
        hint: 'Редкая фиолетовая вещь · Волокита в мешок',
        locked: (run) => (run.hero.gear.ink.length >= 3 ? 'Руки заняты' : null),
        run: (a) => {
          const name = a.randomGear('rare', 'ink');
          a.curse();
          return name ? `Среди листов — «${name}». Остальное придётся разбирать.` : 'Среди листов ничего нужного. Остальное придётся разбирать.';
        },
      },
      leave('Ты выдёргиваешь шнур. Принтер допечатывает лист без питания.'),
    ],
  },
  {
    id: 'stamp',
    title: 'Печать отдела',
    text: 'На пустом столе лежит печать. Рядом — очередь бумаг, которые ждут подписи.',
    art: 'ev_stamp',
    options: [
      {
        label: 'Поставить печать',
        hint: 'Улучшить вещь на выбор',
        locked: needUpgrade(),
        run: (a) => {
          a.pick('upgrade', 1);
          return 'Оттиск ложится ровно. Кажется, так и было задумано.';
        },
      },
      {
        label: 'Проштамповать всё',
        hint: '−½ сердца · улучшить случайную вещь',
        locked: needUpgrade(),
        run: (a) => {
          a.hurt(1);
          const list = a.upgradeRandom(1);
          return `Рука немеет. Проштампованы: ${list.join(', ') || 'ничего'}.`;
        },
      },
      leave('Печать ты кладёшь на место. Она снова лежит не там.'),
    ],
  },
  {
    id: 'kitchen',
    title: 'Точилка на кухне',
    text: 'Кто-то оставил точилку для ножей рядом с кофемашиной. Лезвие ещё тёплое.',
    art: 'ev_kitchen',
    options: [
      {
        label: 'Заточить оружие',
        hint: 'Улучшить оружие в руке',
        locked: (run) => (run.hero.ups.includes(run.hero.equip.blade) ? 'Оружие уже заточено' : null),
        run: (a) => {
          const name = a.upgradeEquipped('blade');
          return `Звук, от которого сводит зубы. ${name ?? 'Оружие'} режет лучше.`;
        },
      },
      {
        label: 'Выпить кофе',
        hint: '+1 сердце',
        run: (a) => {
          a.heal(2);
          return 'Кофе холодный, хотя кофемашина горячая.';
        },
      },
      leave('Ты уходишь. Из кухни кто-то тихо моет кружку.'),
    ],
  },
  {
    id: 'rustle',
    title: 'Шорох за перегородкой',
    text: 'За соседней перегородкой кто-то печатает. Без остановки. Сорок минут.',
    art: 'ev_partition',
    options: [
      {
        label: 'Заглянуть',
        hint: 'Бой с начальством · в награду предмет',
        run: (a) => {
          a.eliteFight();
          return 'Печатание прекращается. Кто-то поворачивается к тебе.';
        },
      },
      {
        label: 'Оставить записку',
        hint: '+10 монет',
        run: (a) => {
          a.coins(10);
          return 'Записка возвращается с монетами: «НЕ МЕШАЙТЕ».';
        },
      },
      leave('Печатание не прекращается.'),
    ],
  },
  {
    id: 'paint',
    title: 'Золотая краска',
    text: 'В подсобке банка золотой краски и кисть. На стене недокрашено: «ЦЕЛЬНОСТЬ».',
    art: 'ev_paint',
    options: [
      {
        label: 'Позолотить монетку',
        hint: 'Улучшить жёлтую вещь в руке',
        locked: (run) => (run.hero.ups.includes(run.hero.equip.coin) ? 'Уже позолочено' : null),
        run: (a) => {
          const name = a.upgradeEquipped('coin');
          return `Краска ложится толстым слоем. ${name ?? 'Монетка'} блестит, как настоящая.`;
        },
      },
      {
        label: 'Докрасить надпись',
        hint: '+1 сердце к максимуму',
        run: (a) => {
          a.maxHp(2);
          return '«Цельность — это ты». Тебе стало чуть цельнее.';
        },
      },
      {
        label: 'Унести банку',
        hint: '+15 монет',
        run: (a) => {
          a.coins(15);
          return 'В кассе краску принимают как валюту. Никто не удивлён.';
        },
      },
    ],
  },
  {
    id: 'hr',
    title: 'Отдел кадров',
    text: 'Окошко отдела кадров открыто. «Переводим сотрудников на новые должности. Без очереди».',
    art: 'ev_hr',
    options: [
      {
        label: 'Перевести вещь',
        hint: 'Заменить вещь случайной того же цвета',
        run: (a) => {
          a.pick('transform', 1);
          return 'Вещь возвращается с другим бейджем.';
        },
      },
      {
        label: 'Перевести две',
        hint: 'Заменить 2 вещи случайными того же цвета',
        run: (a) => {
          a.pick('transform', 2);
          return '«Приказ подписан задним числом».';
        },
      },
      leave('Окошко закрывается. На нём табличка: «Обед до 16:40».'),
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

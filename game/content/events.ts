import type { Fam, Finish, RunState } from '../types.ts';

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
  /** Adds a card to the deck; returns its name. */
  card(id: string, up?: boolean): string;
  /** A random reward card, optionally of one rarity and family. */
  randomCard(rarity?: 'common' | 'uncommon' | 'rare', fam?: Fam): string;
  /** Puts «Волокита» into the deck. */
  curse(): void;
  /** A random relic of a tier; returns its name or null when the pool is empty. */
  relic(tier?: 'common' | 'uncommon' | 'rare'): string | null;
  /** A random consumable into a free pocket; returns its name or null when pockets are full. */
  pocket(): string | null;
  shards(n: number): void;
  /** Lets the player choose cards of the deck (the scene waits). */
  pick(purpose: 'remove' | 'upgrade' | 'finish' | 'transform' | 'copy', count: number, finish?: Finish): void;
  /** Upgrades random cards; returns their names. */
  upgradeRandom(n: number): string[];
  /** Finishes random cards; returns their names. */
  finishRandom(finish: Finish, n: number): string[];
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
const needCards = (n: number) => (run: RunState) => (run.hero.deck.length <= n ? 'Колода слишком тонкая' : null);
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
        hint: '−6 здоровья · копия фишки',
        run: (a) => {
          a.hurt(6);
          a.pick('copy', 1);
          return 'Лист выходит тёплым. На нём — твоя фишка, только чуть ровнее.';
        },
      },
      {
        label: 'Пнуть копир',
        hint: '50%: +30 монет, иначе −8 здоровья',
        run: (a) => {
          if (a.roll() < 0.5) {
            a.coins(30);
            return 'Из лотка сыплется мелочь. Кто-то копил её там годами.';
          }
          a.hurt(8);
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
        hint: '−8 здоровья · повысить 2 случайные фишки',
        run: (a) => {
          a.hurt(8);
          const up = a.upgradeRandom(2);
          return `Через час ты понимаешь синергию. Повышены: ${up.join(', ') || 'нечего'}.`;
        },
      },
      {
        label: 'Задремать',
        hint: '+15 здоровья · в колоду — Волокита',
        run: (a) => {
          a.heal(15);
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
        hint: '+35 монет · в колоду — Волокита',
        run: (a) => {
          a.coins(35);
          a.curse();
          return 'Спасибо! Вам начислена премия. И задачи.';
        },
      },
      {
        label: 'Ответить честно',
        hint: 'Убрать фишку из колоды',
        locked: needCards(5),
        run: (a) => {
          a.pick('remove', 1);
          return 'Анкету забирает шредер. Вместе с чем-то ещё.';
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
        hint: '+25% здоровья',
        run: (a) => {
          a.heal(Math.round(a.run.hero.maxHp * 0.25));
          return 'Тебе снится офис. Ты не уверен, что проснулся.';
        },
      },
      {
        label: 'Прислушаться к гулу',
        hint: '−5 здоровья · +1 осколок',
        run: (a) => {
          a.hurt(5);
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
        hint: 'Предмет или −12 здоровья',
        run: (a) => {
          if (a.roll() < 0.55) {
            const r = a.relic('uncommon');
            return r ? `Лифт едет вбок. Двери открываются в кладовку, а там — «${r}».` : 'Лифт едет вбок и привозит тебя обратно.';
          }
          a.hurt(12);
          return 'Лифт падает на полэтажа и резко встаёт.';
        },
      },
      {
        label: 'Посмотреть в зеркало',
        hint: '−3 здоровья · +1 осколок',
        run: (a) => {
          a.hurt(3);
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
        hint: '15 монет · +5 к здоровью навсегда',
        locked: needCoins(15),
        run: (a) => {
          a.coins(-15);
          a.maxHp(5);
          return 'На вкус как картон. Сытно.';
        },
      },
      {
        label: 'Потрясти',
        hint: '60%: расходник, иначе −7 здоровья',
        run: (a) => {
          if (a.roll() < 0.6) {
            const p = a.pocket();
            return p ? `Из лотка выпадает «${p}».` : 'Выпадает что-то, но карманы полны. Оставляешь автомату.';
          }
          a.hurt(7);
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
        hint: '+6 к здоровью навсегда',
        run: (a) => {
          a.maxHp(6);
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
        hint: 'Фишка «Ножницы»',
        run: (a) => `Ножницы тёплые, будто их только что держали. ${a.card('scissors')} — в колоде.`,
      },
      {
        label: 'Взять зонтик',
        hint: 'Фишка «Зонтик»',
        run: (a) => `В помещении без окон зонтик мокрый. ${a.card('umbrella')} — в колоде.`,
      },
      {
        label: 'Взять кошелёк',
        hint: '+40 монет · в колоду — Волокита',
        run: (a) => {
          a.coins(40);
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
        label: 'Скормить документ',
        hint: 'Убрать фишку из колоды',
        locked: needCards(5),
        run: (a) => {
          a.pick('remove', 1);
          return 'Шредер довольно урчит.';
        },
      },
      {
        label: 'Скормить два',
        hint: 'Убрать 2 фишки · −8 здоровья',
        locked: needCards(6),
        run: (a) => {
          a.hurt(8);
          a.pick('remove', 2);
          return 'Шредер прихватывает рукав. Рукав ты отдаёшь.';
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
        label: 'Заламинировать фишки',
        hint: '2 фишки: враги их не портят',
        run: (a) => {
          a.pick('finish', 2, 'laminate');
          return 'Плёнка схватывается с тихим щелчком.';
        },
      },
      {
        label: 'Погреть руки',
        hint: '+10 здоровья',
        run: (a) => {
          a.heal(10);
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
        hint: '−6 здоровья · +1 осколок',
        run: (a) => {
          a.hurt(6);
          a.shards(1);
          return '«…и снова пошёл в архив в 16:40». Дальше неразборчиво.';
        },
      },
      {
        label: 'Забрать стопку',
        hint: 'Редкая фиолетовая фишка · в колоду — Волокита',
        run: (a) => {
          const name = a.randomCard('rare', 'ink');
          a.curse();
          return `Среди листов — «${name}». Остальное придётся разбирать.`;
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
        hint: 'Отделка «Печать» на фишку: +1 множ',
        run: (a) => {
          a.pick('finish', 1, 'seal');
          return 'Оттиск ложится ровно. Кажется, так и было задумано.';
        },
      },
      {
        label: 'Проштамповать всё',
        hint: '«Печать» на 2 случайные фишки · −6 здоровья',
        run: (a) => {
          a.hurt(6);
          const list = a.finishRandom('seal', 2);
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
        label: 'Заточить фишки',
        hint: '2 фишки: +1 к значению',
        run: (a) => {
          a.pick('finish', 2, 'sharp');
          return 'Звук, от которого сводит зубы.';
        },
      },
      {
        label: 'Выпить кофе',
        hint: '+8 здоровья',
        run: (a) => {
          a.heal(8);
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
        hint: '+15 монет',
        run: (a) => {
          a.coins(15);
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
        label: 'Позолотить фишки',
        hint: '2 фишки: +1 монета при сборе',
        run: (a) => {
          a.pick('finish', 2, 'gild');
          return 'Краска ложится толстым слоем.';
        },
      },
      {
        label: 'Докрасить надпись',
        hint: '+4 к здоровью навсегда',
        run: (a) => {
          a.maxHp(4);
          return '«Цельность — это ты». Тебе стало чуть цельнее.';
        },
      },
      {
        label: 'Унести банку',
        hint: '+25 монет',
        run: (a) => {
          a.coins(25);
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
        label: 'Перевести фишку',
        hint: 'Заменить фишку случайной',
        run: (a) => {
          a.pick('transform', 1);
          return 'Фишка возвращается с другим бейджем.';
        },
      },
      {
        label: 'Перевести две',
        hint: 'Заменить 2 фишки случайными',
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

'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  CLASSES,
  COLORS,
  FOES,
  ITEMS,
  LABELS,
  SLOT_NAMES,
  SPELLS,
  STAT_NAMES,
  type ClassId,
  type Color,
  type Kind,
  type SpellId,
  type Stats,
} from '@/game/duel/catalog';
import { adjacent, type Tile } from '@/game/duel/board';
import {
  createDuel,
  dispatchDuel,
  experienceNeeded,
  loadDuel,
  manaCap,
  saveDuel,
  spellError,
  statPrice,
  trainingGold,
  type Command,
  type Config,
  type Duel,
  type Fighter,
  type Frame,
} from '@/game/duel/engine';
import { chooseAction } from '@/game/duel/ai';
import { VectorEnemy, VectorPerson } from './vector-art';
const SAVE_KEY = 'oskolki.duel.session.v1';
const TROPHY_KEY = 'oskolki.duel.achievements.v1';
const ACHIEVEMENTS: Record<string, string> = {
  victory: 'Первая победа',
  five: 'Пять в ряд',
  blast: 'Цепная реакция',
  cascade: 'Героическое усилие',
  synergy: 'Всё связано',
  route: 'За дверью босса',
};
const COLOR_HEX: Record<Color, string> = {
  earth: '#23724e',
  fire: '#ba3c44',
  air: '#97701f',
  water: '#315eac',
};
export function Gem({ kind, power }: Tile) {
  const paths: Record<Kind, React.ReactNode> = {
    earth: <path d="M16 5 28 26H4Z" />,
    fire: <circle cx="16" cy="16" r="11" />,
    air: <rect x="6" y="6" width="20" height="20" rx="2" />,
    water: <path d="m16 4 12 9-5 15H9L4 13Z" />,
    skull: (
      <>
        <path d="M7 18C1 4 30 1 26 18l-4 3v7H10v-7Z" fill="none" />
        <path d="M11 25v3m5-3v3m5-3v3M11 12v4m10-4v4m-5 1-2 4h4Z" fill="none" />
      </>
    ),
    gold: (
      <>
        <circle cx="16" cy="16" r="11" fill="none" />
        <path d="M16 9v14m-4-10 4-4 4 4m-8 6 4 4 4-4" fill="none" />
      </>
    ),
    xp: (
      <path
        d="m16 4 3.5 8 8.5 1-6.5 6 2 9-7.5-5-7.5 5 2-9L4 13l8.5-1Z"
        fill="none"
      />
    ),
    wild: (
      <>
        <path d="m16 3 13 13-13 13L3 16Z" fill="none" />
        <text
          x="16"
          y="20"
          textAnchor="middle"
          stroke="none"
          fill="currentColor"
          fontSize="11"
          fontWeight="800"
        >
          ×3
        </text>
      </>
    ),
  };
  return (
    <svg
      className={`duel-gem duel-gem-${kind}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {paths[kind]}
      {power && (
        <>
          <rect
            x="15"
            y="0"
            width="17"
            height="11"
            rx="2"
            fill="#000"
            stroke="none"
          />
          <text
            x="23.5"
            y="8"
            fill="#fff"
            stroke="none"
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
          >
            +5
          </text>
        </>
      )}
    </svg>
  );
}
function Cost({ cost }: { cost: Partial<Record<Color, number>> }) {
  return (
    <span className="duel-cost">
      {COLORS.filter((c) => cost[c]).map((c) => (
        <span key={c} title={LABELS[c]} style={{ color: COLOR_HEX[c] }}>
          <Gem kind={c} />
          {cost[c]}
        </span>
      ))}
    </span>
  );
}
function FighterPanel({
  f,
  hero,
  active,
}: {
  f: Fighter;
  hero?: boolean;
  active: boolean;
}) {
  return (
    <section
      className={`duel-fighter ${hero ? 'duel-hero' : 'duel-enemy'} ${active ? 'duel-active' : ''}`}
      aria-label={hero ? 'Ваш персонаж' : 'Противник'}
    >
      <div className="duel-fighter-heading">
        <span>{hero ? 'Вы' : 'Противник'}</span>
        <h2>{f.name}</h2>
      </div>
      <div className="duel-portrait">
        {hero ? (
          <VectorPerson
            weaponId={
              f.gear.weapon === 'fullBlade'
                ? 'gear-rune-sword'
                : f.gear.weapon === 'tideNeedle'
                  ? 'gear-rusty-dagger'
                  : 'gear-cutter'
            }
            className="duel-person"
          />
        ) : (
          <VectorEnemy kind={f.art} pose="idle" />
        )}
      </div>
      <div className="duel-health">
        <span>Здоровье</span>
        <strong>
          {f.hp}
          <small> / {f.maxHp}</small>
        </strong>
      </div>
      <progress
        className="duel-health-bar"
        value={f.hp}
        max={f.maxHp}
        aria-label={`Здоровье ${f.hp} из ${f.maxHp}`}
      />
      <div className="duel-mana">
        {COLORS.map((c) => (
          <div
            key={c}
            title={`${LABELS[c]}: ${f.mana[c]} из ${manaCap(f, c)}`}
            style={
              {
                '--mana-color': COLOR_HEX[c],
                '--mana-fill': `${(f.mana[c] / manaCap(f, c)) * 100}%`,
              } as CSSProperties
            }
          >
            <Gem kind={c} />
            <strong>{f.mana[c]}</strong>
            <span className="duel-mana-track" />
          </div>
        ))}
      </div>
      <div className="duel-status">
        {f.ki > 0 && <span>Ки {f.ki}/8</span>}
        {f.wall > 0 && <span>Стена · {f.wall}</span>}
        {f.stealthUntil > f.actions && <span>Тень</span>}
        {f.immune > 0 && (
          <span title="Временная защита от повторного оглушения">
            Защита от контроля
          </span>
        )}
      </div>
    </section>
  );
}
export function DuelApp({
  defaultMode = 'duel',
}: {
  defaultMode?: Config['mode'];
}) {
  const [state, setState] = useState<Duel | null>(null);
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState(true);
  const [config, setConfig] = useState<Config>({
    seed: 707,
    classId: 'blade',
    mode: defaultMode,
    foe: 0,
  });
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [targeting, setTargeting] = useState<SpellId | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [message, setMessage] = useState('');
  const [hint, setHint] = useState<Command | null>(null);
  const [trophies, setTrophies] = useState<string[]>([]);
  const [fast, setFast] = useState(false);
  const [focusCell, setFocusCell] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const latest = useRef<Duel | null>(null);
  const busy = useRef(false);
  const drag = useRef<{ index: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const inputFile = useRef<HTMLInputElement>(null);
  /* eslint-disable react/react-compiler -- These two effects hydrate and persist a local external save, once on mount and after committed actions. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = loadDuel(raw);
        if (saved) {
          setState(saved);
          latest.current = saved;
          setConfig(saved.config);
          setSetup(false);
        } else
          setMessage(
            'Не удалось прочитать запись этого эксперимента. Можно начать новый тест.',
          );
      }
      const found = JSON.parse(localStorage.getItem(TROPHY_KEY) ?? '[]');
      if (Array.isArray(found))
        setTrophies(
          found.filter(
            (id): id is string => typeof id === 'string' && id in ACHIEVEMENTS,
          ),
        );
    } catch {
      setMessage(
        'Автосохранение недоступно. Запись можно выгрузить через меню.',
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    latest.current = state;
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, saveDuel(state));
    } catch {
      setMessage('Не удалось сохранить. Выгрузите запись через меню.');
    }
    setTrophies((previous) => {
      const all = [...new Set([...previous, ...state.achievements])];
      try {
        localStorage.setItem(TROPHY_KEY, JSON.stringify(all));
      } catch {
        /* Gameplay remains usable without storage. */
      }
      return all.length === previous.length ? previous : all;
    });
  }, [state]);
  /* eslint-enable react/react-compiler */
  useEffect(() => {
    if (menu && !dialog.current?.open) dialog.current?.showModal();
    else if (!menu && dialog.current?.open) dialog.current?.close();
  }, [menu]);
  const apply = useCallback((command: Command) => {
    const current = latest.current;
    if (!current || busy.current) return;
    busy.current = true;
    const result = dispatchDuel(current, command);
    if (result.error) {
      setMessage(result.error);
      busy.current = false;
      return;
    }
    latest.current = result.state;
    if (result.state.phase !== current.phase || command.type === 'next')
      window.scrollTo(0, 0);
    setState(result.state);
    setSelected(null);
    setTargeting(null);
    setHint(null);
    setMessage('');
    // Short feedback per actual wave; very long cascades still finish promptly.
    const visual =
      result.frames.length > 7
        ? [
            ...result.frames.slice(0, 6),
            result.frames[result.frames.length - 1],
          ]
        : result.frames;
    setFrames(visual);
    busy.current = visual.length > 0;
  }, []);
  useEffect(() => {
    if (!frames.length) {
      busy.current = false;
      return;
    }
    if (menu || setup) return;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const timer = window.setTimeout(
      () => setFrames((f) => f.slice(1)),
      fast || reduced ? 90 : 280,
    );
    return () => window.clearTimeout(timer);
  }, [frames, menu, setup, fast]);
  useEffect(() => {
    if (
      !state ||
      setup ||
      menu ||
      frames.length ||
      state.phase !== 'battle' ||
      state.actor !== 'enemy'
    )
      return;
    const seq = state.sequence;
    const timer = window.setTimeout(
      () => {
        if (latest.current?.sequence !== seq) return;
        const command = chooseAction(state);
        if (command) apply(command);
        else setMessage('Нет доступного хода. Сохраните запись для проверки.');
      },
      fast ? 180 : 850,
    );
    return () => window.clearTimeout(timer);
  }, [state, setup, menu, frames.length, fast, apply]);
  function start(nextConfig = config) {
    setConfig(nextConfig);
    window.scrollTo(0, 0);
    const fresh = createDuel(nextConfig);
    latest.current = fresh;
    busy.current = false;
    setState(fresh);
    setFrames([]);
    setSetup(false);
    setSelected(null);
    setTargeting(null);
    setMenu(false);
    setMessage('');
  }
  function exportRecord() {
    if (!state) return;
    const url = URL.createObjectURL(
      new Blob([saveDuel(state)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `oskolki-duel-${state.config.seed}-${state.sequence}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importRecord(file?: File) {
    if (!file) return;
    if (file.size > 500000) {
      setMessage('Запись слишком большая');
      return;
    }
    const imported = loadDuel(await file.text());
    if (!imported) {
      setMessage('Запись повреждена или создана для других правил');
      return;
    }
    busy.current = false;
    latest.current = imported;
    setState(imported);
    setConfig(imported.config);
    setFrames([]);
    setSelected(null);
    setTargeting(null);
    setHint(null);
    setSetup(false);
    setMenu(false);
    setMessage('Запись восстановлена');
  }
  const canPlay =
    !!state &&
    state.phase === 'battle' &&
    state.actor === 'hero' &&
    !frames.length &&
    !menu &&
    !setup;
  function select(index: number) {
    if (!canPlay || busy.current) return;
    setFocusCell(index);
    setHint(null);
    if (targeting) {
      apply({ type: 'cast', spell: targeting, target: index });
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    if (selected !== null && adjacent(selected, index)) {
      apply({ type: 'swap', a: selected, b: index });
      return;
    }
    setSelected(index);
    setMessage('');
  }
  function boardKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const dirs: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -8,
      ArrowDown: 8,
    };
    if (event.key === 'Escape') {
      setSelected(null);
      setTargeting(null);
      setHint(null);
      return;
    }
    if (!(event.key in dirs)) return;
    event.preventDefault();
    const next = index + dirs[event.key];
    if (adjacent(index, next)) {
      setFocusCell(next);
      cells.current[next]?.focus();
    }
  }
  const displayBoard = frames[0]?.board ?? state?.board;
  const result = state && ['won', 'lost'].includes(state.phase);
  const camp = state?.phase === 'camp';
  const roundStatus = frames.length
    ? `${frames[0].actor === 'hero' ? 'Вы' : state?.enemy.name}: ${frames[0].text}`
    : state?.actor === 'enemy'
      ? `${state.enemy.name} выбирает ход…`
      : targeting
        ? `${SPELLS[targeting].name}: выберите фишку`
        : selected !== null
          ? 'Выберите соседнюю фишку'
          : 'Ваш ход';
  if (!ready) return <main className="duel-app duel-loading">Осколки</main>;
  return (
    <main className="duel-app">
      <header className="duel-header">
        <button
          className="duel-wordmark"
          onClick={() => setMenu(true)}
          aria-label="Открыть меню"
        >
          Осколки
          <span className="duel-wordmark-dot" />
        </button>
        <span className="duel-place">
          {setup
            ? 'Общая доска'
            : state?.config.mode === 'route'
              ? `Комната ${(state?.room ?? 0) + 1} / ${FOES.length}`
              : 'Дуэль'}
        </span>
        <button className="duel-menu-button" onClick={() => setMenu(true)}>
          Меню <span aria-hidden="true">☰</span>
        </button>
      </header>
      {setup ? (
        <section className="duel-setup">
          <div className="duel-intro">
            <div className="duel-mark" aria-hidden="true">
              <Gem kind="skull" />
              <span>↔</span>
              <Gem kind="water" />
            </div>
            <h1>
              Одно поле.
              <br />
              Два плана.
            </h1>
            <p>
              Собирайте ману, готовьте заклинания.
              <br />И помните: следующий ход — у противника.
            </p>
          </div>
          <div className="duel-setup-controls">
            <fieldset className="duel-modes">
              <legend>Что проверяем</legend>
              {(['duel', 'route'] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={config.mode === mode}
                  onClick={() => setConfig((c) => ({ ...c, mode }))}
                >
                  {mode === 'duel' ? 'Один бой' : 'Пять комнат'}
                </button>
              ))}
            </fieldset>
            <fieldset className="duel-builds">
              <legend>Ваш стиль</legend>
              {(Object.keys(CLASSES) as ClassId[]).map((id) => (
                <button
                  key={id}
                  aria-pressed={config.classId === id}
                  onClick={() => setConfig((c) => ({ ...c, classId: id }))}
                >
                  <strong>{CLASSES[id].name}</strong>
                  <span>{CLASSES[id].description}</span>
                </button>
              ))}
            </fieldset>
            <details className="duel-disclosure">
              <summary>Настроить тест</summary>
              <div className="duel-settings">
                <label>
                  Seed
                  <input
                    type="number"
                    min="0"
                    max="4294967295"
                    value={config.seed}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        seed: Math.max(
                          0,
                          Math.min(
                            0xffffffff,
                            Math.floor(Number(e.target.value) || 0),
                          ),
                        ),
                      }))
                    }
                  />
                </label>
                {config.mode === 'duel' && (
                  <label>
                    Противник
                    <select
                      value={config.foe}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          foe: Number(e.target.value),
                        }))
                      }
                    >
                      {FOES.map((f, i) => (
                        <option key={f.name} value={i}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="duel-checkbox">
                  <input
                    type="checkbox"
                    checked={fast}
                    onChange={(e) => setFast(e.target.checked)}
                  />
                  Быстрые анимации
                </label>
              </div>
            </details>
            <button className="duel-primary duel-start" onClick={() => start()}>
              {config.mode === 'duel' ? 'Начать дуэль' : 'Открыть дверь'}
            </button>
            {state && (
              <button
                className="duel-text-button"
                onClick={() => setSetup(false)}
              >
                Вернуться к текущему тесту
              </button>
            )}
          </div>
        </section>
      ) : (
        state && (
          <>
            {camp ? (
              <section className="duel-camp">
                <div className="duel-camp-heading">
                  <span>Комната пройдена</span>
                  <h1>Минутка передышки.</h1>
                  <p>
                    {state.hero.hp} / {state.hero.maxHp} здоровья ·{' '}
                    {state.hero.gold} золота · уровень {state.hero.level}
                  </p>
                </div>
                {!state.rewarded ? (
                  <>
                    <h2>Возьмите одну находку</h2>
                    <div className="duel-items">
                      {state.offers.map((id) => (
                        <button
                          key={id}
                          className="duel-item"
                          onClick={() => apply({ type: 'reward', item: id })}
                        >
                          <span>{SLOT_NAMES[ITEMS[id].slot]}</span>
                          <strong>{ITEMS[id].name}</strong>
                          <p>{ITEMS[id].description}</p>
                          <small>
                            Заменит:{' '}
                            {state.hero.gear[ITEMS[id].slot]
                              ? ITEMS[state.hero.gear[ITEMS[id].slot]!].name
                              : 'пустой слот'}
                          </small>
                        </button>
                      ))}
                    </div>
                    <button
                      className="duel-text-button"
                      onClick={() => apply({ type: 'reward', item: null })}
                    >
                      Оставить текущие вещи
                    </button>
                  </>
                ) : (
                  <p className="duel-rest-ready">
                    Сборка готова к следующему бою.
                  </p>
                )}
                <details className="duel-disclosure">
                  <summary>Торговец · {state.hero.gold} золота</summary>
                  <p>
                    «Здесь нет бесполезных вещей. Есть неподходящие сочетания».
                  </p>
                  <div className="duel-items">
                    {state.stock.map((id) => (
                      <button
                        key={id}
                        disabled={state.hero.gold < ITEMS[id].price}
                        className="duel-item"
                        onClick={() => apply({ type: 'buy', item: id })}
                      >
                        <span>
                          {SLOT_NAMES[ITEMS[id].slot]} · {ITEMS[id].price}{' '}
                          золота
                        </span>
                        <strong>{ITEMS[id].name}</strong>
                        <p>{ITEMS[id].description}</p>
                        <small>
                          Заменит:{' '}
                          {state.hero.gear[ITEMS[id].slot]
                            ? ITEMS[state.hero.gear[ITEMS[id].slot]!].name
                            : 'пустой слот'}
                        </small>
                      </button>
                    ))}
                  </div>
                </details>
                <details
                  className="duel-disclosure"
                  open={state.hero.points > 0}
                >
                  <summary>Развитие · {state.hero.points} очков</summary>
                  <p>
                    Опыт {state.hero.xp} / {experienceNeeded(state.hero)} до
                    уровня {state.hero.level + 1}. Очки можно сберечь.
                  </p>
                  <div className="duel-training">
                    {(Object.keys(STAT_NAMES) as (keyof Stats)[])
                      .filter((k) => k in state.hero.stats)
                      .map((stat) => (
                        <div key={stat}>
                          <span>
                            {STAT_NAMES[stat]} <b>{state.hero.stats[stat]}</b>
                          </span>
                          <button
                            disabled={
                              state.hero.points < statPrice(state, stat) ||
                              state.hero.stats[stat] >= 30
                            }
                            onClick={() => apply({ type: 'train', stat })}
                          >
                            +1 за {statPrice(state, stat)} очк.
                          </button>
                          <button
                            disabled={
                              state.hero.gold < trainingGold(state, stat) ||
                              state.hero.stats[stat] >= 30
                            }
                            onClick={() =>
                              apply({ type: 'train', stat, gold: true })
                            }
                          >
                            За {trainingGold(state, stat)} зол.
                          </button>
                        </div>
                      ))}
                  </div>
                </details>
                <div className="duel-next">
                  <p>
                    Дальше — {FOES[state.room + 1].name}
                    <small>{FOES[state.room + 1].trait}</small>
                  </p>
                  <button
                    className="duel-primary"
                    disabled={!state.rewarded}
                    onClick={() => apply({ type: 'next' })}
                  >
                    Продолжить
                  </button>
                </div>
              </section>
            ) : result ? (
              <section className="duel-result">
                <div className="duel-mark">
                  <Gem kind={state.phase === 'won' ? 'xp' : 'skull'} />
                </div>
                <h1>
                  {state.phase === 'won'
                    ? state.config.mode === 'route'
                      ? 'Дверь открыта.'
                      : 'Ваш ход оказался последним.'
                    : 'Снова за столом.'}
                </h1>
                <p>
                  {state.phase === 'won'
                    ? 'Можно сменить сборку и проверить другой план.'
                    : 'Доска была общей. Попробуйте забрать ресурсы, которые нужны противнику.'}
                </p>
                <div className="duel-result-stats">
                  <span>
                    <b>{state.metrics.turns}</b>действий на двоих
                  </span>
                  <span>
                    <b>{state.metrics.spells}</b>ваших заклинаний
                  </span>
                  <span>
                    <b>{state.metrics.extra}</b>дополнительных ходов
                  </span>
                </div>
                <div className="duel-trophies">
                  {state.achievements.map((id) => (
                    <span key={id}>{ACHIEVEMENTS[id]}</span>
                  ))}
                </div>
                <div className="duel-result-actions">
                  <button
                    className="duel-primary"
                    onClick={() => {
                      start(state.config);
                    }}
                  >
                    Повторить этот seed
                  </button>
                  <button onClick={() => setSetup(true)}>Другой тест</button>
                  <button onClick={exportRecord}>Выгрузить запись</button>
                </div>
              </section>
            ) : (
              <section
                className="duel-battle"
                aria-label="Дуэль на общей доске"
              >
                <FighterPanel
                  f={state.hero}
                  hero
                  active={(frames[0]?.actor ?? state.actor) === 'hero'}
                />
                <div className="duel-center">
                  <output className="duel-turn" aria-live="polite">
                    <span
                      className={
                        state.actor === 'hero'
                          ? 'duel-turn-dot'
                          : 'duel-turn-dot is-enemy'
                      }
                    />
                    {roundStatus}
                    {targeting && (
                      <button
                        onClick={() => {
                          setTargeting(null);
                          setMessage('');
                        }}
                      >
                        Отмена
                      </button>
                    )}
                  </output>
                  <fieldset
                    className={`duel-board ${targeting ? 'is-targeting' : ''} ${!canPlay ? 'is-busy' : ''}`}
                    aria-label="Общее поле 8 на 8. Выберите фишку и её соседа. Стрелки перемещают фокус, Enter выбирает."
                  >
                    {displayBoard?.map((tile, i) => (
                      <button
                        key={i}
                        ref={(el) => {
                          cells.current[i] = el;
                        }}
                        tabIndex={i === focusCell ? 0 : -1}
                        aria-label={`Строка ${Math.floor(i / 8) + 1}, столбец ${(i % 8) + 1}: ${LABELS[tile.kind]}${tile.power ? ' +5' : ''}`}
                        aria-pressed={selected === i}
                        aria-disabled={!canPlay}
                        className={`duel-cell ${selected === i ? 'is-selected' : ''} ${frames[0]?.cells.includes(i) ? 'is-collected' : ''} ${hint?.type === 'swap' && [hint.a, hint.b].includes(i) ? 'is-hint' : ''} ${targeting === 'bomb' && tile.kind !== 'skull' ? 'is-ineligible' : ''}`}
                        onKeyDown={(e) => boardKey(e, i)}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          select(i);
                        }}
                        onPointerDown={(e) => {
                          if (canPlay && !targeting) {
                            drag.current = {
                              index: i,
                              x: e.clientX,
                              y: e.clientY,
                            };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }
                        }}
                        onPointerCancel={() => {
                          drag.current = null;
                        }}
                        onPointerUp={(e) => {
                          const from = drag.current;
                          drag.current = null;
                          if (!from || !canPlay) return;
                          const dx = e.clientX - from.x,
                            dy = e.clientY - from.y;
                          if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
                          suppressClick.current = true;
                          const destination =
                            from.index +
                            (Math.abs(dx) > Math.abs(dy)
                              ? Math.sign(dx)
                              : Math.sign(dy) * 8);
                          if (adjacent(from.index, destination))
                            apply({
                              type: 'swap',
                              a: from.index,
                              b: destination,
                            });
                        }}
                      >
                        <Gem {...tile} />
                      </button>
                    ))}
                  </fieldset>
                  <div className="duel-feedback" aria-live="polite">
                    {message ||
                      (frames.length ? '' : state.log[state.log.length - 1])}
                  </div>
                  <div className="duel-spells" aria-label="Ваши заклинания">
                    {state.hero.spells.map((id) => {
                      const spell = SPELLS[id],
                        error = spellError(state, id, 'hero');
                      return (
                        <button
                          key={id}
                          className={targeting === id ? 'is-targeted' : ''}
                          disabled={!canPlay || !!error}
                          title={`${spell.description}\n${error ?? 'Заменяет перестановку.'}`}
                          onClick={() => {
                            if (spell.target) {
                              setTargeting(id);
                              setSelected(null);
                              setMessage(spell.description);
                            } else apply({ type: 'cast', spell: id });
                          }}
                        >
                          <strong>{spell.name}</strong>
                          <Cost cost={spell.cost} />
                          {(state.hero.ready[id] ?? 0) > state.hero.actions && (
                            <small>
                              Ещё{' '}
                              {(state.hero.ready[id] ?? 0) - state.hero.actions}{' '}
                              действ.
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="duel-help-link"
                    disabled={!canPlay}
                    onClick={() => {
                      const suggestion = chooseAction(state, 'hero');
                      setHint(suggestion);
                      if (suggestion?.type === 'cast')
                        setMessage(
                          `Можно применить «${SPELLS[suggestion.spell].name}»${suggestion.target !== undefined ? ` к клетке ${Math.floor(suggestion.target / 8) + 1}:${(suggestion.target % 8) + 1}` : ''}.`,
                        );
                      else
                        setMessage(
                          'Подсвечен возможный ход. Будущие каскады неизвестны.',
                        );
                    }}
                  >
                    Подсказать ход
                  </button>
                </div>
                <FighterPanel
                  f={state.enemy}
                  active={(frames[0]?.actor ?? state.actor) === 'enemy'}
                />
              </section>
            )}
          </>
        )
      )}
      {setup && message && (
        <output className="duel-setup-message">{message}</output>
      )}
      <dialog
        ref={dialog}
        className="duel-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setMenu(false);
        }}
      >
        <div className="duel-dialog-heading">
          <h2>Пауза</h2>
          <button onClick={() => setMenu(false)} aria-label="Закрыть меню">
            ×
          </button>
        </div>
        <button className="duel-primary" onClick={() => setMenu(false)}>
          Продолжить
        </button>
        {state && (
          <button
            onClick={() => {
              setMenu(false);
              setSetup(true);
            }}
          >
            Новый тест
          </button>
        )}
        <details className="duel-disclosure">
          <summary>Как играть</summary>
          <div className="duel-rules">
            <p>
              Поменяйте две соседние фишки и соберите от трёх одинаковых.
              Перестановка срабатывает сразу. Заклинание — вместо перестановки.
            </p>
            <p>
              После действия играет противник на том же поле. Группа из 4+
              оставляет ход вам; прямая пятёрка создаёт джокер ×3 только для
              маны. Несколько отдельных троек — обычный ход.
            </p>
            <div className="duel-legend">
              {(
                [
                  'earth',
                  'fire',
                  'air',
                  'water',
                  'skull',
                  'gold',
                  'xp',
                  'wild',
                ] as Kind[]
              ).map((kind) => (
                <div key={kind}>
                  <Gem kind={kind} />
                  <span>{LABELS[kind]}</span>
                </div>
              ))}
            </div>
            <p>
              Цвета только пополняют ману. Черепа наносят урон. Череп +5
              взрывает соседей. Золото и опыт развивают героя между боями.
            </p>
            <p>
              Нет перестановок — буря: новое поле и +3 маны каждого цвета обоим.
              Иногда удачное совпадение сохраняет ход. Случайные продолжения
              заранее неизвестны.
            </p>
            <p>
              Управление: два клика или перетаскивание. Клавиатура: стрелки и
              Enter. Esc отменяет выбор цели.
            </p>
          </div>
        </details>
        {state && (
          <>
            <details className="duel-disclosure">
              <summary>Ваш персонаж и противник</summary>
              {[state.hero, state.enemy].map((f, index) => (
                <section className="duel-dossier" key={index}>
                  <h3>{f.name}</h3>
                  <p>
                    {index === 0
                      ? `Уровень ${f.level} · ${f.gold} золота · ${f.xp}/${experienceNeeded(f)} опыта`
                      : FOES[state.room].trait}
                  </p>
                  <p className="duel-dossier-stats">
                    {(Object.keys(f.stats) as (keyof Stats)[])
                      .map((stat) => `${STAT_NAMES[stat]} ${f.stats[stat]}`)
                      .join(' · ')}
                  </p>
                  {Object.values(f.gear).map((id) => (
                    <p key={id}>
                      <b>{ITEMS[id!].name}.</b> {ITEMS[id!].description}
                    </p>
                  ))}
                  <h4>Заклинания</h4>
                  {f.spells.map((id) => (
                    <p key={id}>
                      <b>{SPELLS[id].name}.</b> {SPELLS[id].description}{' '}
                      <Cost cost={SPELLS[id].cost} /> Восстановление:{' '}
                      {SPELLS[id].cooldown}.
                    </p>
                  ))}
                </section>
              ))}
            </details>
            <details className="duel-disclosure">
              <summary>Журнал боя</summary>
              <ol className="duel-log">
                {state.log.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ol>
            </details>
            <details className="duel-disclosure">
              <summary>Запись теста · seed {state.config.seed}</summary>
              <p>
                {state.sequence} действий. Запись хранится локально и
                воспроизводится с начала для проверки.
              </p>
              <button onClick={exportRecord}>Выгрузить запись</button>
              <label className="duel-checkbox">
                <input
                  type="checkbox"
                  checked={fast}
                  onChange={(e) => setFast(e.target.checked)}
                />
                Быстрые анимации
              </label>
            </details>
          </>
        )}
        <details className="duel-disclosure">
          <summary>
            Достижения · {trophies.length}/{Object.keys(ACHIEVEMENTS).length}
          </summary>
          <ul className="duel-achievement-list">
            {Object.entries(ACHIEVEMENTS).map(([id, name]) => (
              <li key={id}>
                {trophies.includes(id) ? '✓' : '○'} {name}
              </li>
            ))}
          </ul>
        </details>
        <button onClick={() => inputFile.current?.click()}>
          Открыть запись теста
        </button>
        <input
          ref={inputFile}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void importRecord(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {message && <output>{message}</output>}
      </dialog>
    </main>
  );
}

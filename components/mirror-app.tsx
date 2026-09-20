'use client';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  CLASSES,
  RARITIES,
  RARITY_NAMES,
  SLOT_NAMES,
  type ClassId,
  type ItemId,
  type Slot,
} from '@/game/duel/catalog';
import { BIOMES, ENCOUNTERS, ENCOUNTER_NAMES } from '@/game/duel/campaign';
import {
  CHANNELS,
  CHANNEL_NAMES,
  WIDTH,
  HEIGHT,
  adjacent,
  legalSwaps,
  type Kind,
  type Tile,
} from '@/game/mirror/board';
import {
  createGame,
  dispatch,
  intentText,
  loadGame,
  previewSwap,
  saveGame,
  DEFAULT_SKILLS,
  TURN_LIMIT,
} from '@/game/mirror/engine';
import { MIRROR_ITEMS, resonanceCap } from '@/game/mirror/items';
import type {
  Command,
  Config,
  Frame,
  Loadout,
  State,
} from '@/game/mirror/types';
import { VectorEnemy, VectorPerson } from './vector-art';

const SAVE_KEY = 'oskolki.mirror.session.v1';
const COLORS: Record<Kind, string> = {
  strike: '#b13f54',
  arcane: '#5264bd',
  mend: '#278376',
  rage: '#9b6817',
  super: '#101010',
};
const CLASS_COPY: Record<ClassId, string> = {
  blade: 'Сильнее физические атаки',
  elementalist: 'Сильнее магические атаки',
  warlock: 'Агрессивный набор и ярость',
  monk: 'Надёжное лечение и защита',
};
const SKILLS: {
  id: keyof Loadout;
  name: string;
  options: [string, string, string][];
}[] = [
  {
    id: 'strike',
    name: 'Усиленный удар',
    options: [
      ['heavy', 'Тяжёлый удар', 'Больше физического урона.'],
      ['pierce', 'Пробивание', 'Атака сквозь защиту.'],
      ['leech', 'Вампиризм', 'Урон и немного здоровья.'],
    ],
  },
  {
    id: 'arcane',
    name: 'Усиленная магия',
    options: [
      ['burst', 'Всплеск', 'Сильный магический удар.'],
      ['weaken', 'Ослабление', 'Снизить силу следующей атаки врага.'],
      ['delay', 'Задержка', 'Отложить следующее действие врага.'],
    ],
  },
  {
    id: 'mend',
    name: 'Усиленное лечение',
    options: [
      ['restore', 'Восстановление', 'Больше здоровья.'],
      ['cleanse', 'Очищение', 'Лечение и помощь против угроз на поле.'],
      ['grow', 'Рост', 'Подготовить усиленный камень удара.'],
    ],
  },
  {
    id: 'rage',
    name: 'Усиленная ярость',
    options: [
      ['physical', 'Напор', 'Усилить физические атаки.'],
      ['magic', 'Концентрация', 'Усилить магические атаки.'],
      ['healing', 'Самообладание', 'Усилить лечение.'],
    ],
  },
  {
    id: 'super',
    name: 'Суперприём',
    options: [
      ['nova', 'Нова', 'Мощная атака.'],
      ['renew', 'Обновление', 'Восстановиться и очистить поле.'],
      ['surge', 'Прорыв', 'Восстановить здоровье и повысить ярость.'],
    ],
  },
];
const MARKS: Record<string, string> = {
  'super-forged': 'Первый S-камень',
  'seven-hit-combo': 'Серия из семи приёмов',
  'boss-0': 'Канцелярия пройдена',
  'boss-1': 'Архив пройден',
  'boss-2': 'Котельная пройдена',
  'boss-3': 'Дирекция пройдена',
};
const skillName = (slot: keyof Loadout, value: string) =>
  SKILLS.find((s) => s.id === slot)?.options.find(
    ([id]) => id === value,
  )?.[1] ?? value;

export function MirrorGem({ kind, level }: Pick<Tile, 'kind' | 'level'>) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="mirror-gem"
      aria-hidden="true"
      style={{ color: COLORS[kind] }}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'strike' && (
        <>
          <path d="m13 26 14-18 4 3-14 18M10 24l9 7m-6-3-5 6" />
          <path d="m18 20 9-12" />
        </>
      )}
      {kind === 'arcane' && (
        <>
          <path d="m20 6 11 14-11 14L9 20Z" />
          <path d="m20 12 5 8-5 8-5-8Z" fill="currentColor" stroke="none" />
        </>
      )}
      {kind === 'mend' && (
        <>
          <path d="M16 7h8v9h9v8h-9v9h-8v-9H7v-8h9Z" />
          <path d="M20 13v14m-7-7h14" opacity=".3" />
        </>
      )}
      {kind === 'rage' && (
        <path
          d="M22 5 9 23h10l-1 12 13-19H21Z"
          fill="currentColor"
          stroke="none"
        />
      )}
      {kind === 'super' && (
        <>
          <path d="m20 3 5 10 12 7-12 6-5 11-6-11L3 20l11-7Z" />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="currentColor"
            stroke="none"
          >
            S
          </text>
        </>
      )}
      {level > 1 &&
        kind !== 'super' &&
        Array.from({ length: level }, (_, i) => (
          <circle
            key={i}
            cx={17 - (level - 2) * 3 + i * 6}
            cy="37"
            r="1.6"
            fill="currentColor"
            stroke="none"
          />
        ))}
    </svg>
  );
}
function Sheet({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="mirror-sheet"
      onCancel={close}
      aria-labelledby="mirror-sheet-title"
    >
      <div className="mirror-sheet-content">
        <header>
          <h2 id="mirror-sheet-title">{title}</h2>
          <button className="mirror-close" aria-label="Закрыть" onClick={close}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
function Health({
  value,
  max,
  name,
}: {
  value: number;
  max: number;
  name: string;
}) {
  return (
    <div className="mirror-health">
      <div>
        <span>{name}</span>
        <strong>
          {value}
          <small> / {max}</small>
        </strong>
      </div>
      <meter
        className="mirror-health-track"
        aria-label={name}
        value={value}
        min={0}
        max={max}
      >
        <i
          style={{
            width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
          }}
        />
      </meter>
    </div>
  );
}
function ItemCard({
  id,
  state,
  onChoose,
  price,
}: {
  id: ItemId;
  state?: State;
  onChoose?: () => void;
  price?: number;
}) {
  const item = MIRROR_ITEMS[id],
    old = state?.hero.gear[item.slot];
  const content = (
    <>
      <span className="mirror-item-meta">
        {SLOT_NAMES[item.slot]}
        <span>{RARITY_NAMES[item.rarity].split(' · ')[0]}</span>
      </span>
      <strong>{item.name}</strong>
      <p>{item.description}</p>
      {item.risk && (
        <p className="mirror-item-risk">Цена эффекта: {item.risk}</p>
      )}
      {onChoose && old && (
        <p className="mirror-replaces">Заменит: {MIRROR_ITEMS[old].name}</p>
      )}
      {onChoose && (
        <span className="mirror-item-action">
          {price === undefined ? 'Взять находку' : `${price} золота`}
          <span aria-hidden="true">↗</span>
        </span>
      )}
    </>
  );
  return onChoose ? (
    <button
      className="mirror-item"
      disabled={price !== undefined && (state?.hero.gold ?? 0) < price}
      onClick={onChoose}
    >
      {content}
    </button>
  ) : (
    <article className="mirror-item">{content}</article>
  );
}

export function MirrorApp({
  defaultMode = 'route',
}: {
  defaultMode?: Config['mode'];
}) {
  const [state, setState] = useState<State | null>(null),
    [hydrated, setHydrated] = useState(false),
    [setup, setSetup] = useState(true);
  const [config, setConfig] = useState<Config>({
    seed: 1,
    classId: 'blade',
    mode: defaultMode,
    foe: 0,
  });
  const [sheet, setSheet] = useState<
      'menu' | 'gear' | 'help' | 'catalog' | 'results' | null
    >(null),
    [confirmStart, setConfirmStart] = useState(false);
  const [selected, setSelected] = useState<number | null>(null),
    [focus, setFocus] = useState(0),
    [hovered, setHovered] = useState<number | null>(null),
    [hint, setHint] = useState<number[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [frame, setFrame] = useState<Frame | null>(null),
    [fast, setFast] = useState(false),
    [reduceMotion, setReduceMotion] = useState(false),
    [catalogQuery, setCatalogQuery] = useState('');
  const upload = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    stateRef = useRef<State | null>(null),
    busyRef = useRef(false);
  const drag = useRef<{ cell: number; x: number; y: number } | null>(null),
    ignoreClick = useRef(false),
    boardRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'),
      change = () => setReduceMotion(media.matches);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) change();
    });
    media.addEventListener('change', change);
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          const loaded = loadGame(raw);
          if (loaded) {
            stateRef.current = loaded;
            setState(loaded);
            setConfig(loaded.config);
            setSetup(false);
          } else
            setError(
              'Сохранение не удалось проверить. Оно осталось на месте; можно открыть другую запись или начать новый тест.',
            );
        } else setConfig((c) => ({ ...c, seed: Date.now() >>> 0 }));
      } catch {
        setError(
          'Не удалось прочитать сохранение. Браузер может не сохранять прогресс.',
        );
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
      media.removeEventListener('change', change);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const persist = useCallback((next: State) => {
    try {
      localStorage.setItem(SAVE_KEY, saveGame(next));
    } catch {
      setError('Автосохранение недоступно. Скачайте запись через меню.');
    }
  }, []);
  const apply = (command: Command) => {
    if (!stateRef.current || busyRef.current) return;
    const result = dispatch(stateRef.current, command);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError('');
    setSelected(null);
    setHovered(null);
    setHint([]);
    stateRef.current = result.state;
    persist(result.state);
    const finish = () => {
      setFrame(null);
      setState(result.state);
      busyRef.current = false;
      setBusy(false);
    };
    if (reduceMotion || !result.frames.length) {
      finish();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    let i = 0;
    const advance = () => {
      if (i >= result.frames.length) {
        finish();
        return;
      }
      setFrame(result.frames[i++]);
      timer.current = setTimeout(advance, fast ? 75 : 145);
    };
    advance();
  };
  const start = () => {
    try {
      const next = createGame({
        ...config,
        ...(config.mode === 'route' ? { testGear: undefined } : {}),
      });
      if (timer.current) clearTimeout(timer.current);
      stateRef.current = next;
      setState(next);
      setError('');
      persist(next);
      setSetup(false);
      setConfirmStart(false);
      setSheet(null);
      setSelected(null);
      setHint([]);
      setFrame(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Не удалось начать бой. Проверьте настройки.',
      );
    }
  };
  const pick = (index: number) => {
    if (!state || busyRef.current || state.phase !== 'battle' || sheet) return;
    const tile = state.board[index];
    if ((tile.locked ?? 0) > 0) {
      setError(
        'Камень закреплён. Соберите с ним комбинацию или примените очищение.',
      );
      return;
    }
    if (tile.kind === 'super') {
      apply({ type: 'super', cell: index });
      return;
    }
    setError('');
    setHint([]);
    if (selected === index) setSelected(null);
    else if (selected !== null && adjacent(selected, index))
      apply({ type: 'swap', a: selected, b: index });
    else setSelected(index);
  };
  const keys = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const x = index % WIDTH,
      y = Math.floor(index / WIDTH);
    let next = index;
    if (e.key === 'ArrowLeft') next = y * WIDTH + Math.max(0, x - 1);
    else if (e.key === 'ArrowRight')
      next = y * WIDTH + Math.min(WIDTH - 1, x + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, y - 1) * WIDTH + x;
    else if (e.key === 'ArrowDown')
      next = Math.min(HEIGHT - 1, y + 1) * WIDTH + x;
    else if (e.key === 'Escape') {
      if (selected !== null) {
        e.preventDefault();
        e.stopPropagation();
        setSelected(null);
      }
      return;
    } else return;
    e.preventDefault();
    if (e.shiftKey) {
      if (adjacent(index, next)) apply({ type: 'swap', a: index, b: next });
      return;
    }
    setFocus(next);
    setHovered(next);
    boardRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
      ?.focus();
  };
  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !sheet && !setup && !busyRef.current) {
        // Avoid cancelling the dialog that this same Escape is about to open.
        e.preventDefault();
        if (selected !== null) setSelected(null);
        else setSheet('menu');
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selected, setup, sheet]);
  const download = () => {
    if (!stateRef.current) return;
    const url = URL.createObjectURL(
      new Blob([saveGame(stateRef.current)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `oskolki-mirror-${stateRef.current.config.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      const loaded = loadGame(await file.text());
      if (!loaded) {
        setError(
          'Эта запись не подходит или не прошла проверку. Текущий бой сохранён.',
        );
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      stateRef.current = loaded;
      setState(loaded);
      setConfig(loaded.config);
      setSetup(false);
      setSheet(null);
      setSelected(null);
      setFrame(null);
      setBusy(false);
      busyRef.current = false;
      setError('');
      persist(loaded);
    } catch {
      setError('Не удалось открыть запись. Текущий бой сохранён.');
    }
  };
  const displayedBoard = frame?.board ?? state?.board ?? [];
  const preview =
    state &&
    selected !== null &&
    hovered !== null &&
    adjacent(selected, hovered) &&
    !busy
      ? previewSwap(state, selected, hovered)
      : null;
  const skills = config.skills ?? DEFAULT_SKILLS,
    slots = Object.keys(SLOT_NAMES) as Slot[],
    activeRoom = state ? Math.min(state.room, ENCOUNTERS.length - 1) : 0,
    encounter = ENCOUNTERS[activeRoom];
  const countdown = state ? state.enemy.countdown + state.enemy.delay : 0;
  return (
    <main className="mirror-app">
      <input
        type="file"
        ref={upload}
        hidden
        accept="application/json,.json"
        aria-label="Открыть запись теста"
        onChange={(e) => {
          void loadFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <header className="mirror-topbar">
        <div className="mirror-brand">
          <span className="mirror-brand-mark" aria-hidden="true">
            ◈
          </span>
          <strong>ОСКОЛКИ</strong>
          <span className="mirror-edition">Ритм</span>
        </div>
        <div className="mirror-top-actions">
          {!setup && state && (
            <span className="mirror-route-label">
              {state.config.mode === 'route'
                ? `${BIOMES[encounter.biome].name} · ${activeRoom + 1} / 20`
                : 'Один бой'}
            </span>
          )}
          <button onClick={() => setSheet('menu')} disabled={!hydrated || busy}>
            Меню <span aria-hidden="true">☰</span>
          </button>
        </div>
      </header>
      {!hydrated ? (
        <output className="mirror-loading">Открываем сохранение…</output>
      ) : setup ? (
        <section className="mirror-setup">
          <div className="mirror-eyebrow">БОЙ НА ОДНОМ ДЫХАНИИ</div>
          <h1>
            Каждая комбинация —<br />
            сразу действие.
          </h1>
          <p className="mirror-lead">
            Удар, магия, лечение и ярость. Создавайте усиленные камни и
            успевайте подготовиться к ответу противника.
          </p>
          <fieldset className="mirror-mode" aria-label="Режим игры">
            <button
              aria-pressed={config.mode === 'route'}
              onClick={() => setConfig((c) => ({ ...c, mode: 'route' }))}
            >
              Забег <small>4 биома · 20 комнат</small>
            </button>
            <button
              aria-pressed={config.mode === 'duel'}
              onClick={() => setConfig((c) => ({ ...c, mode: 'duel' }))}
            >
              Один бой <small>Быстрый тест сборки</small>
            </button>
          </fieldset>
          <fieldset className="mirror-classes">
            <legend>Ваш подход</legend>
            {(Object.keys(CLASSES) as ClassId[]).map((id) => (
              <button
                key={id}
                aria-pressed={config.classId === id}
                onClick={() => setConfig((c) => ({ ...c, classId: id }))}
              >
                <strong>{CLASSES[id].name}</strong>
                <span>{CLASS_COPY[id]}</span>
              </button>
            ))}
          </fieldset>
          <details className="mirror-details">
            <summary>Настроить опыт</summary>
            <div className="mirror-settings">
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
                      setConfig((c) => ({ ...c, foe: Number(e.target.value) }))
                    }
                  >
                    {BIOMES.map((biome, i) => (
                      <optgroup key={biome.id} label={biome.name}>
                        {ENCOUNTERS.map(
                          (foe, index) =>
                            foe.biome === i && (
                              <option key={foe.name} value={index}>
                                {ENCOUNTER_NAMES[foe.kind]} · {foe.name}
                              </option>
                            ),
                        )}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              <details className="mirror-details">
                <summary>Набор усиленных приёмов</summary>
                <p>
                  Обычная тройка запускает базовый приём. Камень II или III
                  включает выбранный приём этого цвета. Набор фиксируется на бой
                  или забег.
                </p>
                <div className="mirror-skill-settings">
                  {SKILLS.map((skill) => (
                    <label key={skill.id}>
                      {skill.name}
                      <select
                        value={skills[skill.id]}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            skills: {
                              ...(c.skills ?? DEFAULT_SKILLS),
                              [skill.id]: e.target.value,
                            },
                          }))
                        }
                      >
                        {skill.options.map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <small>
                        {
                          skill.options.find(
                            ([id]) => id === skills[skill.id],
                          )?.[2]
                        }
                      </small>
                    </label>
                  ))}
                </div>
              </details>
              {config.mode === 'duel' && (
                <details className="mirror-details">
                  <summary>Испытать предметы · 60</summary>
                  <p>
                    Одна вещь на слот. Проверьте сочетание или слабый предмет
                    отдельно.
                  </p>
                  <div className="mirror-test-gear">
                    {slots.map((slot) => (
                      <label key={slot}>
                        {SLOT_NAMES[slot]}
                        <select
                          aria-label={`Тест: ${SLOT_NAMES[slot]}`}
                          value={
                            (
                              config.testGear ?? CLASSES[config.classId].gear
                            ).find((id) => MIRROR_ITEMS[id].slot === slot) ?? ''
                          }
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              testGear: [
                                ...(
                                  c.testGear ?? CLASSES[c.classId].gear
                                ).filter(
                                  (id) => MIRROR_ITEMS[id].slot !== slot,
                                ),
                                ...(e.target.value
                                  ? [e.target.value as ItemId]
                                  : []),
                              ],
                            }))
                          }
                        >
                          <option value="">Пустой слот</option>
                          {RARITIES.map((rarity) => (
                            <optgroup key={rarity} label={RARITY_NAMES[rarity]}>
                              {Object.values(MIRROR_ITEMS)
                                .filter(
                                  (i) => i.slot === slot && i.rarity === rarity,
                                )
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {config.testGear?.map((id) => (
                    <ItemCard key={id} id={id} />
                  ))}
                  {config.testGear && (
                    <button
                      className="mirror-text-button"
                      onClick={() =>
                        setConfig((c) => ({ ...c, testGear: undefined }))
                      }
                    >
                      Вернуть стартовые вещи
                    </button>
                  )}
                </details>
              )}
            </div>
          </details>
          <div className="mirror-setup-actions">
            <button
              className="mirror-primary"
              onClick={() => {
                if (
                  state &&
                  (state.phase === 'battle' || state.phase === 'camp')
                )
                  setConfirmStart(true);
                else start();
              }}
            >
              {config.mode === 'route' ? 'Открыть дверь' : 'Начать бой'}{' '}
              <span aria-hidden="true">→</span>
            </button>
            {state && (
              <button
                onClick={() => {
                  setSetup(false);
                  setError('');
                }}
              >
                Продолжить текущую игру
              </button>
            )}
            <button
              className="mirror-text-button"
              onClick={() => setSheet('help')}
            >
              Как играть
            </button>
          </div>
        </section>
      ) : (
        state && (
          <>
            {state.phase === 'battle' ? (
              <section
                className={`mirror-battle ${busy ? 'is-resolving' : ''} ${frame?.kind === 'enemy' ? 'is-enemy-action' : ''}`}
                aria-label="Бой"
              >
                <section
                  className="mirror-combatant mirror-hero"
                  aria-label="Ваш персонаж"
                >
                  <div className="mirror-combatant-name">
                    <span>ВЫ · УРОВЕНЬ {state.hero.level}</span>
                    <h2>{CLASSES[state.config.classId].name}</h2>
                  </div>
                  <div className="mirror-portrait">
                    <VectorPerson
                      pose={
                        frame?.kind === 'enemy'
                          ? 'hurt'
                          : frame?.kind === 'match'
                            ? 'strike'
                            : 'idle'
                      }
                      weaponId={
                        ['fullBlade', 'directorPen'].includes(
                          state.hero.gear.weapon ?? '',
                        )
                          ? 'gear-rune-sword'
                          : ['tideNeedle', 'stylus', 'auditPencil'].includes(
                                state.hero.gear.weapon ?? '',
                              )
                            ? 'gear-rusty-dagger'
                            : 'gear-cutter'
                      }
                      className="mirror-person"
                    />
                  </div>
                  <Health
                    value={frame?.heroHp ?? state.hero.hp}
                    max={state.hero.maxHp}
                    name="Здоровье"
                  />
                  <div className="mirror-hero-stats">
                    <span title="Поглощает входящий урон">
                      ◈ Щит <b>{state.hero.barrier}</b>
                    </span>
                    <span title="Усиливает приёмы. Максимум 60">
                      ϟ Ярость <b>{state.hero.rage}</b>
                    </span>
                  </div>
                  <button
                    className="mirror-gear-trigger"
                    onClick={() => setSheet('gear')}
                    disabled={busy}
                  >
                    Снаряжение <span aria-hidden="true">↗</span>
                  </button>
                </section>
                <div className="mirror-board-column">
                  <div className="mirror-board-heading">
                    <span>
                      ХОД{' '}
                      <b>
                        {String(state.turn + 1).padStart(2, '0')}
                        <small> / {TURN_LIMIT}</small>
                      </b>
                    </span>
                    <span>{busy ? 'Комбинация…' : 'Ваше действие'}</span>
                    <button
                      aria-label="Показать возможный обмен"
                      disabled={busy}
                      onClick={() => {
                        const move = legalSwaps(state.board)[0];
                        setSelected(null);
                        setHint(
                          move
                            ? [move.a, move.b]
                            : state.board.flatMap((t, i) =>
                                t.kind === 'super' ? [i] : [],
                              ),
                        );
                      }}
                    >
                      ?
                    </button>
                  </div>
                  <fieldset
                    className="mirror-board"
                    ref={boardRef}
                    aria-label="Поле: 8 столбцов, 7 строк. Стрелки перемещают фокус, Enter выбирает фишку, Shift со стрелкой меняет соседей."
                    aria-busy={busy}
                    style={{ '--columns': WIDTH } as CSSProperties}
                  >
                    {displayedBoard.map((tile, index) => (
                      <button
                        key={index}
                        type="button"
                        data-cell={index}
                        className={`mirror-cell ${selected === index ? 'is-selected' : ''} ${hint.includes(index) ? 'is-hint' : ''} ${preview?.cells.includes(index) ? 'is-preview' : ''} ${frame?.cells.includes(index) ? `is-clearing ${frame.kind === 'enemy' ? 'is-threat' : ''}` : ''} ${tile.level > 1 ? `is-level-${tile.level}` : ''} ${tile.kind === 'super' ? 'is-super' : ''} ${(tile.locked ?? 0) > 0 ? 'is-locked' : ''}`}
                        style={
                          { '--tile-color': COLORS[tile.kind] } as CSSProperties
                        }
                        tabIndex={focus === index ? 0 : -1}
                        aria-label={`${Math.floor(index / WIDTH) + 1} ряд, ${(index % WIDTH) + 1} столбец: ${CHANNEL_NAMES[tile.kind]}${tile.level > 1 ? `, уровень ${tile.level}` : ''}${tile.kind === 'super' ? ', активировать бесплатно' : ''}${tile.locked ? `, закреплён на ${tile.locked}` : ''}${tile.bomb ? `, бомба: ${tile.bomb}` : ''}`}
                        aria-pressed={selected === index}
                        aria-disabled={busy}
                        onFocus={() => {
                          setFocus(index);
                          setHovered(index);
                        }}
                        onPointerEnter={() => setHovered(index)}
                        onPointerLeave={() => setHovered(null)}
                        onKeyDown={(e) => keys(e, index)}
                        onPointerDown={(e) => {
                          if (e.button !== 0 || busyRef.current) return;
                          drag.current = {
                            cell: index,
                            x: e.clientX,
                            y: e.clientY,
                          };
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerCancel={() => {
                          drag.current = null;
                        }}
                        onPointerUp={(e) => {
                          const from = drag.current;
                          drag.current = null;
                          if (!from || busyRef.current) return;
                          const dx = e.clientX - from.x,
                            dy = e.clientY - from.y;
                          if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
                          ignoreClick.current = true;
                          setTimeout(() => {
                            ignoreClick.current = false;
                          }, 0);
                          const next =
                            from.cell +
                            (Math.abs(dx) > Math.abs(dy)
                              ? Math.sign(dx)
                              : Math.sign(dy) * WIDTH);
                          if (adjacent(from.cell, next))
                            apply({ type: 'swap', a: from.cell, b: next });
                        }}
                        onClick={() => {
                          if (!ignoreClick.current) pick(index);
                        }}
                      >
                        <MirrorGem {...tile} />
                        {tile.locked ? (
                          <span className="mirror-lock" aria-hidden="true">
                            <svg viewBox="0 0 14 14">
                              <path d="M4 6V4a3 3 0 0 1 6 0v2M3 6h8v7H3Z" />
                            </svg>
                            {tile.locked}
                          </span>
                        ) : null}
                        {tile.bomb ? (
                          <span className="mirror-bomb" aria-hidden="true">
                            ● {tile.bomb}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </fieldset>
                  <div
                    className="mirror-feedback"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {error ? (
                      <span className="mirror-error">{error}</span>
                    ) : frame ? (
                      <strong>{frame.text}</strong>
                    ) : preview ? (
                      <span>{preview.text}</span>
                    ) : selected !== null ? (
                      <span>Выберите соседнюю фишку</span>
                    ) : state.last.waves > 0 || state.last.supers > 0 ? (
                      <span>
                        {state.last.damage > 0
                          ? `${state.last.damage} урона`
                          : 'Комбинация завершена'}
                        {state.last.healing > 0
                          ? ` · +${state.last.healing} HP`
                          : ''}
                        {state.last.waves > 1
                          ? ` · ${state.last.waves} каскада`
                          : ''}
                        {state.last.created > 0
                          ? ` · усиленных камней: ${state.last.created}`
                          : ''}
                      </span>
                    ) : (
                      <span>Соберите три одинаковых камня</span>
                    )}
                  </div>
                  <div className="mirror-legend">
                    {CHANNELS.map((channel) => (
                      <button
                        key={channel}
                        title={`${CHANNEL_NAMES[channel]} · ${skillName(channel, state.skills[channel])}`}
                        onClick={() => setSheet('help')}
                      >
                        <MirrorGem kind={channel} level={1} />
                        <span>{CHANNEL_NAMES[channel]}</span>
                      </button>
                    ))}
                  </div>
                  {state.hero.gear.ring === 'yieldRing' && (
                    <label className="mirror-guard">
                      <input
                        type="checkbox"
                        checked={state.guard}
                        disabled={busy}
                        onChange={(e) =>
                          apply({ type: 'guard', value: e.target.checked })
                        }
                      />
                      <span>
                        Обменять усиленный камень на щит{' '}
                        <small>Цена: камень не появится на поле</small>
                      </span>
                    </label>
                  )}
                </div>
                <section
                  className="mirror-combatant mirror-enemy"
                  aria-label="Противник"
                >
                  <div className="mirror-combatant-name">
                    <span>
                      {ENCOUNTER_NAMES[encounter.kind].toUpperCase()} · ФАЗА{' '}
                      {state.enemy.stage + 1}
                    </span>
                    <h2>{state.enemy.name}</h2>
                  </div>
                  <div className="mirror-portrait">
                    <VectorEnemy
                      kind={state.enemy.art}
                      pose={
                        frame?.kind === 'enemy'
                          ? 'strike'
                          : frame?.kind === 'match'
                            ? 'hurt'
                            : 'idle'
                      }
                    />
                  </div>
                  <Health
                    value={frame?.enemyHp ?? state.enemy.hp}
                    max={state.enemy.maxHp}
                    name="Здоровье врага"
                  />
                  <div
                    className={`mirror-intent ${countdown <= 1 ? 'is-imminent' : ''}`}
                  >
                    <div>
                      <strong>{countdown}</strong>
                      <span>
                        {countdown === 1
                          ? 'обмен до ответа'
                          : 'обмена до ответа'}
                      </span>
                    </div>
                    <p>{intentText(state)}</p>
                    {state.enemy.weaken > 0 && <small>Ослаблен</small>}
                  </div>
                </section>
              </section>
            ) : state.phase === 'camp' ? (
              <section className="mirror-camp">
                <div className="mirror-eyebrow">
                  КОМНАТА {activeRoom + 1} ПРОЙДЕНА
                </div>
                <h1>Перевести дух.</h1>
                <p className="mirror-lead">
                  {state.hero.hp} / {state.hero.maxHp} здоровья <span>·</span>{' '}
                  {state.hero.gold} золота <span>·</span> {state.hero.xp} опыта
                </p>
                <nav className="mirror-biomes" aria-label="Прогресс забега">
                  {BIOMES.map((biome, i) => (
                    <span
                      key={biome.id}
                      aria-current={encounter.biome === i ? 'step' : undefined}
                    >
                      <b>{activeRoom >= i * 5 + 4 ? '✓' : `0${i + 1}`}</b>
                      {biome.name}
                    </span>
                  ))}
                </nav>
                {!state.rewarded ? (
                  <>
                    <h2>Одна находка с собой.</h2>
                    <p className="mirror-note">
                      Смотрите на сочетание и его цену. Редкость не гарантирует
                      силу.
                    </p>
                    <div className="mirror-item-grid">
                      {state.offers.map((id) => (
                        <ItemCard
                          key={id}
                          id={id}
                          state={state}
                          onChoose={() => apply({ type: 'reward', item: id })}
                        />
                      ))}
                    </div>
                    <button
                      className="mirror-text-button"
                      onClick={() => apply({ type: 'reward', item: null })}
                    >
                      Оставить находки
                    </button>
                  </>
                ) : (
                  <p className="mirror-note">
                    Решение принято. Проверьте снаряжение перед следующей
                    комнатой.
                  </p>
                )}
                {state.stock.length > 0 && (
                  <details className="mirror-details">
                    <summary>
                      Заглянуть к торговцу · {state.hero.gold} золота
                    </summary>
                    <div className="mirror-item-grid">
                      {state.stock.map((id) => (
                        <ItemCard
                          key={id}
                          id={id}
                          state={state}
                          price={MIRROR_ITEMS[id].price}
                          onChoose={() => apply({ type: 'buy', item: id })}
                        />
                      ))}
                    </div>
                  </details>
                )}
                <div className="mirror-camp-actions">
                  <button
                    className="mirror-primary"
                    disabled={!state.rewarded}
                    onClick={() => apply({ type: 'next' })}
                  >
                    {activeRoom === ENCOUNTERS.length - 1
                      ? 'Закончить смену'
                      : `Следующая комната · ${activeRoom + 2}`}{' '}
                    <span aria-hidden="true">→</span>
                  </button>
                  <button onClick={() => setSheet('gear')}>Снаряжение</button>
                </div>
              </section>
            ) : (
              <section className="mirror-ending">
                <div className="mirror-eyebrow">
                  {state.phase === 'won'
                    ? 'СМЕНА ЗАКОНЧЕНА'
                    : 'НОВЫЙ РАБОЧИЙ ДЕНЬ'}
                </div>
                <h1>
                  {state.phase === 'won'
                    ? 'Ещё одна дверь позади.'
                    : 'Вы снова за столом.'}
                </h1>
                <p className="mirror-lead">
                  {state.phase === 'won'
                    ? 'Сохраните запись и попробуйте другой подход на том же поле.'
                    : 'Юла продолжает крутиться. Каждая попытка помогает лучше прочитать поле.'}
                </p>
                <div className="mirror-run-stats">
                  <span>
                    <strong>{state.metrics.victories}</strong>побед
                  </span>
                  <span>
                    <strong>{state.metrics.maxCombo}</strong>макс. комбо
                  </span>
                  <span>
                    <strong>{state.metrics.stones}</strong>усиленных камней
                  </span>
                  <span>
                    <strong>{state.metrics.supers}</strong>суперприёмов
                  </span>
                </div>
                <div className="mirror-setup-actions">
                  <button
                    className="mirror-primary"
                    onClick={() => {
                      setConfig((c) => ({ ...c, seed: Date.now() >>> 0 }));
                      setSetup(true);
                    }}
                  >
                    Ещё одна попытка →
                  </button>
                  <button
                    onClick={() => {
                      setConfig(state.config);
                      setSetup(true);
                    }}
                  >
                    Повторить этот seed
                  </button>
                  <button className="mirror-text-button" onClick={download}>
                    Скачать запись
                  </button>
                </div>
              </section>
            )}
          </>
        )
      )}
      {error && !sheet && (setup || state?.phase !== 'battle') && (
        <p className="mirror-global-error" role="alert">
          {error}
        </p>
      )}
      <footer className="mirror-bottomline">
        <span>
          {setup
            ? 'Эксперимент с ритмом боя'
            : state?.config.testGear
              ? 'Тестовая сборка'
              : 'Осколки · Ритм'}
        </span>
        <button onClick={() => setSheet('help')} disabled={busy}>
          Правила и управление ↗
        </button>
      </footer>
      {sheet && (
        <Sheet
          title={
            sheet === 'menu'
              ? 'Пауза.'
              : sheet === 'gear'
                ? 'Ваша сборка.'
                : sheet === 'catalog'
                  ? 'Предметы.'
                  : sheet === 'results'
                    ? 'Запись боя.'
                    : 'Собирайте. Действуйте.'
          }
          close={() => setSheet(null)}
        >
          {error && (
            <p role="alert" className="mirror-global-error">
              {error}
            </p>
          )}
          {sheet === 'menu' && (
            <div className="mirror-menu-list">
              <button className="mirror-primary" onClick={() => setSheet(null)}>
                Продолжить →
              </button>
              {state && (
                <button onClick={() => setSheet('gear')}>
                  Снаряжение и параметры
                </button>
              )}
              <button onClick={() => setSheet('help')}>
                Правила и управление
              </button>
              <button
                onClick={() => {
                  setCatalogQuery('');
                  setSheet('catalog');
                }}
              >
                Все предметы · 60
              </button>
              <button
                onClick={() => {
                  setSheet(null);
                  setSetup(true);
                  setConfirmStart(false);
                }}
              >
                Новый тест
              </button>
              {state && (
                <button onClick={() => setSheet('results')}>
                  Запись и результаты
                </button>
              )}
              <button onClick={() => upload.current?.click()}>
                Открыть запись теста
              </button>
              <label className="mirror-checkbox">
                <input
                  type="checkbox"
                  checked={fast}
                  onChange={(e) => setFast(e.target.checked)}
                />
                Быстрые анимации
              </label>
              <p className="mirror-note">
                Игра сохраняется после каждого действия.
                {state ? ` Seed: ${state.config.seed}.` : ''}
              </p>
              <Link className="mirror-old-route" href="/duel">
                Открыть прежний режим общей доски ↗
              </Link>
            </div>
          )}
          {sheet === 'gear' && state && (
            <>
              <div className="mirror-statline">
                <span>
                  Удар <b>{state.hero.physical}</b>
                </span>
                <span>
                  Магия <b>{state.hero.magic}</b>
                </span>
                <span>
                  Лечение <b>{state.hero.healing}</b>
                </span>
                <span>
                  Золото <b>{state.hero.gold}</b>
                </span>
              </div>
              <details className="mirror-details">
                <summary>Резонанс предметов</summary>
                <p>
                  Запас для эффектов снаряжения. Базовые приёмы включаются сразу
                  от комбинаций и не требуют ручной оплаты.
                </p>
                <div className="mirror-resonance">
                  {CHANNELS.map((channel) => (
                    <div key={channel}>
                      <MirrorGem kind={channel} level={1} />
                      <span>{CHANNEL_NAMES[channel]}</span>
                      <b>
                        {state.hero.resonance[channel]} /{' '}
                        {resonanceCap(state.hero)}
                      </b>
                    </div>
                  ))}
                </div>
              </details>
              <div className="mirror-equipped">
                {slots.map((slot) =>
                  state.hero.gear[slot] ? (
                    <ItemCard key={slot} id={state.hero.gear[slot]!} />
                  ) : (
                    <div className="mirror-empty-slot" key={slot}>
                      <span>{SLOT_NAMES[slot]}</span>Пусто
                    </div>
                  ),
                )}
              </div>
              <h3>Усиленные приёмы</h3>
              <div className="mirror-current-skills">
                {SKILLS.map((s) => (
                  <div key={s.id}>
                    <span>{s.name}</span>
                    <b>{skillName(s.id, state.skills[s.id])}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {sheet === 'catalog' && (
            <>
              <label className="mirror-search">
                Поиск по названию и эффекту
                <input
                  type="search"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="Например, щит или ярость"
                />
              </label>
              <p className="mirror-note">
                60 вещей, четыре слота. Эффекты адаптированы к этой версии боя.
                У части вещей есть цена, а некоторые раскрываются только в
                сочетании.
              </p>
              <div className="mirror-catalog">
                {RARITIES.map((rarity) => {
                  const items = Object.values(MIRROR_ITEMS).filter(
                    (item) =>
                      item.rarity === rarity &&
                      `${item.name} ${item.description} ${item.risk ?? ''}`
                        .toLocaleLowerCase('ru')
                        .includes(catalogQuery.toLocaleLowerCase('ru')),
                  );
                  return (
                    items.length > 0 && (
                      <section key={rarity}>
                        <h3>
                          {RARITY_NAMES[rarity]} <small>{items.length}</small>
                        </h3>
                        {items.map((item) => (
                          <ItemCard key={item.id} id={item.id} />
                        ))}
                      </section>
                    )
                  );
                })}
              </div>
            </>
          )}
          {sheet === 'results' && state && (
            <>
              <p className="mirror-note">
                Seed {state.config.seed} · {state.metrics.swaps} обменов ·{' '}
                {state.metrics.victories} побед · {state.metrics.damage} урона
              </p>
              <button className="mirror-primary" onClick={download}>
                Скачать запись теста ↓
              </button>
              {state.achievements.length > 0 && (
                <>
                  <h3>Отметки этой попытки</h3>
                  <ul className="mirror-marks">
                    {state.achievements.map((mark) => (
                      <li key={mark}>{MARKS[mark] ?? mark}</li>
                    ))}
                  </ul>
                </>
              )}
              <h3>Последние события</h3>
              <ol className="mirror-journal">
                {state.log
                  .slice(-30)
                  .reverse()
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ol>
            </>
          )}
          {sheet === 'help' && (
            <div className="mirror-help">
              <p className="mirror-help-lead">
                Меняйте соседние фишки. Совпадения сразу запускают приёмы, а
                каскады продолжают серию.
              </p>
              <div className="mirror-help-channels">
                {CHANNELS.map((channel) => (
                  <div key={channel}>
                    <MirrorGem kind={channel} level={1} />
                    <strong>{CHANNEL_NAMES[channel]}</strong>
                    <span>
                      {channel === 'strike'
                        ? 'Физический урон'
                        : channel === 'arcane'
                          ? 'Магический урон'
                          : channel === 'mend'
                            ? 'Восстановление HP'
                            : 'Усиление приёмов'}
                    </span>
                  </div>
                ))}
              </div>
              <h3>Готовьте сильные камни</h3>
              <dl className="mirror-combinations">
                <div>
                  <dt>3 в ряд</dt>
                  <dd>Один приём</dd>
                </div>
                <div>
                  <dt>4 в ряд</dt>
                  <dd>Два приёма + камень II</dd>
                </div>
                <div>
                  <dt>L / T / крест</dt>
                  <dd>Три приёма + камень III</dd>
                </div>
                <div>
                  <dt>5 и больше</dt>
                  <dd>Четыре приёма + S</dd>
                </div>
              </dl>
              <p>
                Цвет совпадает независимо от уровня. Камень II или III внутри
                комбинации включает усиленный приём. Нажмите на свободный
                S-камень — суперприём не расходует обмен и не приближает ответ
                врага.
              </p>
              <h3>Следите за ответом</h3>
              <p>
                После обмена и всех каскадов счётчик врага уменьшается на один.
                При нуле враг выполняет показанное действие. Неудачный обмен
                ничего не расходует. Здесь нет отдельной кнопки завершения хода.
              </p>
              <p>
                Закреплённые камни нельзя двигать, но можно собрать с ними
                комбинацию. Бомбы нужно убрать до взрыва. Предметы и усиленные
                приёмы дают дополнительные способы справиться с угрозами.
              </p>
              <p>
                На бой — {TURN_LIMIT} обменов. Успейте победить до окончания
                смены. При отсутствии ходов поле перемешается без расхода
                обмена.
              </p>
              <h3>Управление</h3>
              <p>
                Нажмите две соседние фишки или перетащите одну в нужную сторону.
                На клавиатуре: стрелки перемещают фокус, Enter выбирает фишку,
                Escape отменяет выбор или открывает меню. Shift со стрелкой
                меняет соседей, включая S. Enter на S активирует суперприём.
              </p>
              <p className="mirror-note">
                Бой сохраняется автоматически. Прежняя версия игры и её
                сохранения доступны по ссылке в меню.
              </p>
            </div>
          )}
        </Sheet>
      )}
      {confirmStart && (
        <Sheet title="Начать заново?" close={() => setConfirmStart(false)}>
          <p>
            Текущая попытка будет заменена. Сначала можно скачать её запись и
            вернуться к ней позднее.
          </p>
          <div className="mirror-confirm-actions">
            <button onClick={download}>Скачать текущую запись</button>
            <button className="mirror-primary" onClick={start}>
              Начать новую попытку
            </button>
            <button onClick={() => setConfirmStart(false)}>Остаться</button>
          </div>
        </Sheet>
      )}
    </main>
  );
}

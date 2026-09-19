/* eslint-disable react/react-compiler -- Refs serialize shared-engine transitions before animation playback. */
'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Shuffle,
  Download,
  Upload,
  FlaskConical,
  Check,
  Sword,
  Shield,
  Droplet,
  Zap,
} from 'lucide-react';
import Game from '@/components/game-session';
import { LabPanel } from '@/components/lab-panel';
import { VectorEnemy } from '@/components/vector-art';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DEFAULT_BALANCE,
  WEAPONS,
  RELICS,
  SKILLS,
  MODIFIERS,
  ENEMY_CATALOG,
  itemById,
  type ScenarioLoadout,
  type Result,
} from '@/game/engine';
import { SCENARIOS } from '@/game/scenarios';
import {
  BUILDS,
  LAB_GOALS,
  LAB_SAVE_KEY,
  LAB_PROFILE_KEY,
  LAB_BUILDS_KEY,
  LAB_HISTORY_KEY,
  LAB_SEED,
  defaultConfig,
  loadoutFor,
  validLoadout,
  createLabSession,
  recordLabAction,
  replayLab,
  emptyLabProfile,
  readLabProfile,
  updateLabProfile,
  labSummary,
  readLabHistory,
  historyEntry,
  type LabSession,
  type LabConfig,
  type LabCommand,
  type LabHistoryEntry,
} from '@/game/lab';

type SavedBuild = { name: string; loadout: ScenarioLoadout };
const buildIcons = [Sword, Shield, Droplet, Zap];
const seedValue = () => crypto.getRandomValues(new Uint32Array(1))[0];
const scenarioName = (c: LabConfig) =>
  c.scenario === 'sprint'
    ? 'Короткий забег'
    : SCENARIOS.find((s) => s.id === c.scenario)!.name;
const buildName = (c: LabConfig) =>
  c.custom ? 'Своя сборка' : BUILDS.find((b) => b.id === c.build)!.name;
const commandName = (c: LabCommand) => {
  const id = typeof c.id === 'string' ? c.id : '';
  const item = itemById(id)?.name ?? id;
  return (
    (
      {
        shift: `Сдвиг ${c.axis === 'row' ? 'строки' : 'столбца'} ${Number(c.line) + 1} на ${Number(c.amount)}`,
        end_turn: 'Завершить ход',
        cast: `Приём: ${item}`,
        potion: 'Зелье',
        select_target: 'Сменить цель',
        choose_reward: id ? `Находка: ${item}` : 'Пропустить находку',
        enter_room: 'Следующая комната',
        buy: `Покупка: ${item}`,
        rest: 'Привал',
        leave_shop: 'Выйти из магазина',
        reroll_treasure: 'Сменить находку',
        buy_workshop: 'Мастерская',
        accept_contract: 'Принять контракт',
        toggle_insurance: 'Страховка',
      } as Record<string, string>
    )[c.action] ?? c.action
  );
};
function download(session: LabSession) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `oskolki-${session.config.scenario}-${session.config.seed}-${session.entries.length}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LabApp() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<LabConfig>(defaultConfig);
  const [session, setSession] = useState<LabSession | null>(null);
  const sessionRef = useRef<LabSession | null>(null);
  const [profile, setProfile] = useState(emptyLabProfile);
  const profileRef = useRef(profile);
  const [saved, setSaved] = useState<SavedBuild[]>([]);
  const [history, setHistory] = useState<LabHistoryEntry[]>([]);
  const [saveName, setSaveName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [mount, setMount] = useState(0);
  const [fast, setFast] = useState(false);
  const [journal, setJournal] = useState(false);
  const [message, setMessage] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const write = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setMessage(
        'Не удалось сохранить в браузере. Выгрузи запись перед закрытием вкладки.',
      );
    }
  };
  const commit = (next: LabSession) => {
    sessionRef.current = next;
    setSession(next);
    write(LAB_SAVE_KEY, next);
  };
  useEffect(() => {
    try {
      const p = readLabProfile(
        JSON.parse(localStorage.getItem(LAB_PROFILE_KEY) ?? 'null'),
      );
      profileRef.current = p;
      setProfile(p);
      setHistory(
        readLabHistory(
          JSON.parse(localStorage.getItem(LAB_HISTORY_KEY) ?? '[]'),
        ),
      );
      const builds: unknown = JSON.parse(
        localStorage.getItem(LAB_BUILDS_KEY) ?? '[]',
      );
      if (Array.isArray(builds))
        setSaved(
          builds
            .filter(
              (x) =>
                x &&
                typeof x.name === 'string' &&
                x.name.length <= 48 &&
                validLoadout(x.loadout),
            )
            .slice(0, 12),
        );
    } catch {
      setMessage(
        'Часть настроек лаборатории не прочиталась. Кампания не затронута.',
      );
    }
    try {
      const raw = localStorage.getItem(LAB_SAVE_KEY);
      if (raw) {
        const restored = replayLab(JSON.parse(raw));
        sessionRef.current = restored;
        setSession(restored);
        setConfig(restored.config);
      }
    } catch {
      setMessage(
        'Запись лаборатории устарела или повреждена. Можно начать новый опыт. Кампания не затронута.',
      );
    }
    setReady(true);
  }, []);
  const launch = (nextConfig: LabConfig, imported?: LabSession) => {
    try {
      const next = imported ?? createLabSession(nextConfig);
      if (sessionRef.current?.entries.length) {
        const list = [historyEntry(sessionRef.current), ...history].slice(
          0,
          12,
        );
        setHistory(list);
        write(LAB_HISTORY_KEY, list);
      }
      setMessage('');
      commit(next);
      setConfig(next.config);
      setMount((n) => n + 1);
      setJournal(false);
      setPlaying(true);
      window.scrollTo(0, 0);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Не удалось начать бой.',
      );
    }
  };
  const transition = (
    command: LabCommand,
    result: Result,
    activeMs: number,
  ) => {
    if (!sessionRef.current) return;
    const next = recordLabAction(sessionRef.current, command, result, activeMs);
    commit(next);
    const p = updateLabProfile(profileRef.current, next);
    profileRef.current = p;
    setProfile(p);
    write(LAB_PROFILE_KEY, p);
  };
  const change = (patch: Partial<LabConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));
  const custom = (patch: Partial<ScenarioLoadout>) =>
    change({ custom: { ...loadoutFor(config), ...patch }, scored: false });
  const toggleItem = (field: 'relics' | 'modifiers' | 'skills', id: string) => {
    const current = loadoutFor(config)[field];
    custom({
      [field]: current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    });
  };
  const saveBuild = () => {
    const name = saveName.trim();
    if (!name) {
      setMessage('Дай название сборке.');
      return;
    }
    const next = [
      { name, loadout: loadoutFor(config) },
      ...saved.filter((b) => b.name !== name),
    ].slice(0, 12);
    setSaved(next);
    write(LAB_BUILDS_KEY, next);
    setSaveName('');
    setMessage(`Сборка «${name}» сохранена.`);
  };
  const resume = () => {
    setMount((n) => n + 1);
    setJournal(false);
    setPlaying(true);
    window.scrollTo(0, 0);
  };
  const leave = () => {
    setPlaying(false);
    setJournal(false);
    window.scrollTo(0, 0);
  };
  const updateNote = (note: string) => {
    if (sessionRef.current) commit({ ...sessionRef.current, note });
  };
  const record = session && (
    <RecordView session={session} onNote={updateNote} />
  );
  if (!ready)
    return (
      <main className="lab-shell">
        <p>Открываем лабораторию…</p>
      </main>
    );
  const terminal =
    session && ['victory', 'defeat'].includes(session.current.phase);
  return (
    <>
      {playing && session ? (
        <Game
          key={mount}
          laboratory={{
            initial: session.current,
            fast,
            paused: journal,
            onTransition: transition,
            onExit: leave,
            toolbar: (_state, busy) => (
              <div className="lab-toolbar">
                <button
                  className="lab-text-button"
                  onClick={leave}
                  disabled={busy}
                >
                  <ArrowLeft size={15} /> Лаборатория
                </button>
                <span className="lab-toolbar-title">
                  {scenarioName(session.config)}{' '}
                  <span>
                    · {buildName(session.config)} · seed {session.config.seed}
                  </span>
                </span>
                <span className="lab-mode-label">
                  {session.imported
                    ? 'Повтор записи'
                    : session.config.scored
                      ? 'Испытание'
                      : 'Свободный опыт'}
                </span>
                <button
                  className="lab-button"
                  disabled={busy}
                  onClick={() => launch(session.config)}
                >
                  <RotateCcw size={14} /> Тот же бой
                </button>
                <button
                  className="lab-button"
                  disabled={busy}
                  onClick={() =>
                    launch({
                      ...session.config,
                      seed: seedValue(),
                      scored: false,
                    })
                  }
                >
                  <Shuffle size={14} /> Новое поле
                </button>
                <label className="lab-check">
                  <input
                    type="checkbox"
                    checked={fast}
                    disabled={busy}
                    onChange={(e) => setFast(e.target.checked)}
                  />{' '}
                  Быстро
                </label>
                <button
                  className="lab-button"
                  disabled={busy}
                  onClick={() => setJournal(true)}
                >
                  Запись · {session.entries.length}
                </button>
              </div>
            ),
            panel: (state, execute, busy) =>
              ['victory', 'defeat'].includes(state.phase) ? (
                <Dialog open>
                  <DialogContent
                    className="lab-dialog lab-result"
                    showCloseButton={false}
                  >
                    <div className="lab-eyebrow">
                      {scenarioName(session.config)} ·{' '}
                      {buildName(session.config)}
                    </div>
                    <DialogTitle>
                      {state.phase === 'victory'
                        ? 'Бой закончен. Что сработало?'
                        : 'Где пришлось уступить?'}
                    </DialogTitle>
                    <DialogDescription>
                      Сравни решения на том же поле или проверь другую сборку.{' '}
                      {session.config.scored && !session.imported
                        ? 'Выполненные испытания сохранены отдельно от кампании.'
                        : 'Свободные опыты не засчитываются в испытания.'}
                    </DialogDescription>
                    {record}
                    <div className="lab-actions">
                      <button
                        className="lab-button lab-primary"
                        onClick={() => launch(session.config)}
                      >
                        <RotateCcw size={16} /> Повторить с начала
                      </button>
                      <button className="lab-button" onClick={leave}>
                        Изменить сборку
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <LabPanel
                  key={`${state.phase}:${state.room}`}
                  state={state}
                  execute={execute}
                  busy={busy}
                  exit={leave}
                />
              ),
          }}
        />
      ) : (
        <main className="lab-shell">
          <header className="lab-header">
            <Link className="lab-brand" href="/">
              ОСКОЛКИ <span>ЛАБОРАТОРИЯ</span>
            </Link>
            <Link className="lab-text-button" href="/campaign">
              Обычная игра <ArrowRight size={16} />
            </Link>
          </header>
          <div className="lab-intro">
            <div>
              <p className="lab-eyebrow">ПОЛЕ. РЕШЕНИЕ. ПОСЛЕДСТВИЕ.</p>
              <h1>
                Проверить идею
                <br />в бою.
              </h1>
              <p>
                Выбери сборку и ситуацию. Сыграй, поменяй одну вещь
                <br className="lab-desktop-break" /> и сравни результат на том
                же поле.
              </p>
            </div>
            <div className="lab-board-mark" aria-hidden="true">
              {[
                Sword,
                Shield,
                Zap,
                Droplet,
                Sword,
                Sword,
                Shield,
                Zap,
                Sword,
              ].map((Icon, i) => (
                <span
                  key={i}
                  className={i === 5 || i === 8 ? 'lab-tile-active' : ''}
                >
                  <Icon strokeWidth={1.4} />
                </span>
              ))}
            </div>
          </div>
          {session && (
            <div className="lab-resume">
              <span>
                <strong>{terminal ? 'Последний опыт' : 'Опыт сохранён'}</strong>{' '}
                {scenarioName(session.config)} · {buildName(session.config)} ·{' '}
                {session.entries.length} действий
              </span>
              <button className="lab-text-button" onClick={resume}>
                {terminal ? 'Посмотреть результат' : 'Продолжить'}{' '}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <fieldset className="lab-mode" aria-label="Режим лаборатории">
            <button
              aria-pressed={config.scenario !== 'sprint'}
              onClick={() => change({ scenario: 'duel' })}
            >
              Один бой <span>Проверить механику</span>
            </button>
            <button
              aria-pressed={config.scenario === 'sprint'}
              onClick={() =>
                change({
                  scenario: 'sprint',
                  build: 'normal',
                  custom: undefined,
                  scored: false,
                })
              }
            >
              Короткий забег <span>Проверить развитие сборки</span>
            </button>
          </fieldset>
          {config.scenario !== 'sprint' ? (
            <div className="lab-picker">
              <section>
                <h2>
                  <span>01</span> С чем идём
                </h2>
                <div className="lab-builds">
                  {BUILDS.map((b, i) => {
                    const Icon = buildIcons[i];
                    return (
                      <button
                        key={b.id}
                        className={`lab-build lab-build-${b.id}`}
                        aria-pressed={config.build === b.id && !config.custom}
                        onClick={() =>
                          change({ build: b.id, custom: undefined })
                        }
                      >
                        <Icon size={25} strokeWidth={1.5} />
                        <span>
                          <strong>{b.name}</strong>
                          <small>{b.description}</small>
                        </span>
                        <span className="lab-radio" aria-hidden="true">
                          {config.build === b.id && !config.custom && (
                            <Check size={13} />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {config.custom && (
                  <p className="lab-custom-hint">
                    Выбрана своя сборка — настройки ниже.
                  </p>
                )}
              </section>
              <section>
                <h2>
                  <span>02</span> Что проверяем
                </h2>
                <div className="lab-encounters">
                  {SCENARIOS.map((s) => (
                    <button
                      key={s.id}
                      className="lab-encounter"
                      aria-pressed={config.scenario === s.id}
                      onClick={() => change({ scenario: s.id })}
                    >
                      <div className="lab-enemy-preview">
                        <VectorEnemy kind={s.roster[0]} pose="idle" />
                        <span>
                          {s.roster.length === 1
                            ? '1 враг'
                            : `${s.roster.length} врага`}
                        </span>
                      </div>
                      <strong>{s.name}</strong>
                      <small>{s.question}</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <section className="lab-sprint">
              <FlaskConical size={32} strokeWidth={1.4} />
              <div>
                <h2>От простого ножа до Цензора</h2>
                <p>
                  Шесть комнат, находка и две развилки. Начни без усилений и
                  посмотри, как меняются решения после каждой награды.
                </p>
                <ol>
                  <li>Первый бой</li>
                  <li>Находка</li>
                  <li>Обычный бой или элита</li>
                  <li>Привал или магазин</li>
                  <li>Два врага</li>
                  <li>Босс</li>
                </ol>
              </div>
            </section>
          )}
          <div className="lab-launch">
            <div>
              <strong>
                {scenarioName(config)} <span>· {buildName(config)}</span>
              </strong>
              <p>
                {config.scenario === 'sprint'
                  ? 'Проверяем путь от первой находки до босса.'
                  : SCENARIOS.find((s) => s.id === config.scenario)!
                      .roster.map((id) => ENEMY_CATALOG[id].name)
                      .join(' + ')}{' '}
                · seed {config.seed}
              </p>
            </div>
            <button
              className="lab-button lab-primary"
              onClick={() => launch(config)}
            >
              Начать {config.scenario === 'sprint' ? 'забег' : 'бой'}{' '}
              <ArrowRight size={18} />
            </button>
          </div>
          <section className="lab-secondary">
            <label
              className="lab-check lab-scored"
              aria-label="Испытание с фиксированными условиями"
            >
              <input
                type="checkbox"
                checked={config.scored}
                disabled={config.scenario === 'sprint'}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? {
                          scored: true,
                          custom: undefined,
                          seed: LAB_SEED,
                          balance: {
                            ...DEFAULT_BALANCE,
                            animation: config.balance.animation,
                          },
                        }
                      : { scored: false },
                  )
                }
              />
              <span>
                <strong>Испытание с фиксированными условиями</strong>
                <small>
                  Seed {LAB_SEED}, готовая сборка и обычный баланс. Для честного
                  сравнения и отметок за механику.
                </small>
              </span>
            </label>
            <details className="lab-details">
              <summary>
                Испытания{' '}
                <span>
                  {profile.marks.length} / {LAB_GOALS.length}
                </span>
              </summary>
              <ul className="lab-goals">
                {LAB_GOALS.map((g) => (
                  <li key={g.id} data-complete={profile.marks.includes(g.id)}>
                    <span
                      aria-label={
                        profile.marks.includes(g.id)
                          ? 'Выполнено'
                          : 'Не выполнено'
                      }
                    >
                      {profile.marks.includes(g.id) ? <Check size={18} /> : '○'}
                    </span>
                    <div>
                      <strong>{g.name}</strong>
                      <p>{g.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="lab-caption">
                Эти отметки принадлежат лаборатории. Своя сборка, изменённые
                параметры и импорт записей не дают зачёт.
              </p>
            </details>
          </section>
          <details className="lab-details lab-advanced">
            <summary>
              Настроить опыт{' '}
              <span>Seed, баланс, предметы, сохранённые сборки</span>
            </summary>
            <div className="lab-settings">
              <label>
                Seed
                <input
                  aria-label="Seed"
                  type="number"
                  min={0}
                  max={4294967295}
                  value={config.seed}
                  onChange={(e) =>
                    change({ seed: Number(e.target.value), scored: false })
                  }
                />
              </label>
              <button
                className="lab-button"
                onClick={() => change({ seed: seedValue(), scored: false })}
              >
                <Shuffle size={14} /> Другой seed
              </button>
              {(
                [
                  {
                    key: 'health',
                    label: 'Здоровье',
                    min: 10,
                    max: 100,
                    step: 1,
                  },
                  {
                    key: 'blade',
                    label: 'Урон фишки',
                    min: 1,
                    max: 5,
                    step: 1,
                  },
                  {
                    key: 'shield',
                    label: 'Блок фишки',
                    min: 1,
                    max: 5,
                    step: 1,
                  },
                  {
                    key: 'enemyPower',
                    label: 'Сила врагов',
                    min: 0.5,
                    max: 2,
                    step: 0.1,
                  },
                ] as const
              ).map((p) => (
                <label key={p.key}>
                  {p.label}
                  <input
                    type="number"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={config.balance[p.key]}
                    onChange={(e) =>
                      change({
                        balance: {
                          ...config.balance,
                          [p.key]: Number(e.target.value),
                        },
                        scored: false,
                      })
                    }
                  />
                </label>
              ))}
              <button
                className="lab-text-button"
                onClick={() =>
                  change({
                    balance: { ...DEFAULT_BALANCE, animation: 80 },
                    scored: false,
                  })
                }
              >
                Обычный баланс
              </button>
              <label className="lab-check">
                <input
                  type="checkbox"
                  checked={fast}
                  onChange={(e) => setFast(e.target.checked)}
                />{' '}
                Без ожидания анимаций
              </label>
            </div>
            {config.scenario !== 'sprint' && (
              <div className="lab-custom">
                <h3>Своя сборка</h3>
                <p className="lab-caption">
                  Меняй один параметр за опыт. Семейства фишек на старте
                  остаются теми же при том же seed; особые правила поля могут
                  потребовать другой раскладки.
                </p>
                <div className="lab-settings">
                  <label>
                    Оружие
                    <select
                      value={loadoutFor(config).weapon}
                      onChange={(e) => custom({ weapon: e.target.value })}
                    >
                      {WEAPONS.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Качество
                    <select
                      value={loadoutFor(config).quality}
                      onChange={(e) =>
                        custom({ quality: Number(e.target.value) as 0 | 1 | 2 })
                      }
                    >
                      <option value="0">Базовое</option>
                      <option value="1">Улучшенное</option>
                      <option value="2">Мастерское</option>
                    </select>
                  </label>
                </div>
                {(
                  [
                    { field: 'relics', name: 'Реликвии', pool: RELICS, max: 6 },
                    {
                      field: 'modifiers',
                      name: 'Особые фишки',
                      pool: MODIFIERS,
                      max: 2,
                    },
                    { field: 'skills', name: 'Приёмы', pool: SKILLS, max: 2 },
                  ] as const
                ).map((group) => (
                  <details className="lab-details" key={group.field}>
                    <summary>
                      {group.name}{' '}
                      <span>
                        {loadoutFor(config)[group.field].length} / {group.max}
                      </span>
                    </summary>
                    <div className="lab-item-list">
                      {group.pool.map((o) => (
                        <label key={o.id} aria-label={o.name}>
                          <input
                            type="checkbox"
                            checked={loadoutFor(config)[group.field].includes(
                              o.id,
                            )}
                            disabled={
                              !loadoutFor(config)[group.field].includes(o.id) &&
                              loadoutFor(config)[group.field].length >=
                                group.max
                            }
                            onChange={() => toggleItem(group.field, o.id)}
                          />
                          <span>
                            <strong>{o.name}</strong>
                            <small>{o.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
                <div className="lab-save-build">
                  <label>
                    Название сборки
                    <input
                      maxLength={48}
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Например, щиты + яд"
                    />
                  </label>
                  <button className="lab-button" onClick={saveBuild}>
                    Сохранить сборку
                  </button>
                </div>
                {saved.length > 0 && (
                  <ul className="lab-saved-builds">
                    {saved.map((b) => (
                      <li key={b.name}>
                        <button
                          className="lab-text-button"
                          onClick={() =>
                            change({ custom: b.loadout, scored: false })
                          }
                        >
                          {b.name} <ArrowRight size={14} />
                        </button>
                        <button
                          className="lab-text-button"
                          aria-label={`Удалить сборку ${b.name}`}
                          onClick={() => {
                            const next = saved.filter((x) => x.name !== b.name);
                            setSaved(next);
                            write(LAB_BUILDS_KEY, next);
                          }}
                        >
                          Удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </details>
          {history.length > 0 && (
            <details className="lab-details">
              <summary>
                Сравнить опыты <span>Последние {history.length}</span>
              </summary>
              <p className="lab-caption">
                Краткие итоги прошлых опытов. Полная запись доступна у текущего
                боя — скачай её до нового запуска. Для сравнения меняй один
                фактор; одинаковый seed сам по себе не означает одинаковые
                условия.
              </p>
              <div className="lab-history">
                <table>
                  <thead>
                    <tr>
                      <th>Ситуация / сборка</th>
                      <th>Итог</th>
                      <th>Урон / блок</th>
                      <th>Действия / остаток ОД</th>
                      <th>Условия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{scenarioName(h.config)}</strong>
                          <span>
                            {buildName(h.config)} · seed {h.config.seed}
                          </span>
                          {h.note && <small>{h.note}</small>}
                        </td>
                        <td>
                          {
                            {
                              victory: 'Победа',
                              defeat: 'Поражение',
                              stopped: 'Остановлен',
                            }[h.outcome]
                          }
                        </td>
                        <td>
                          {h.summary.damage} / {h.summary.blocked}
                        </td>
                        <td>
                          {h.summary.actions} / {h.summary.unusedActions}
                        </td>
                        <td>
                          <button
                            className="lab-text-button"
                            onClick={() => {
                              setConfig(h.config);
                              window.scrollTo(0, 0);
                            }}
                          >
                            Выбрать
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <footer className="lab-footer">
            <div>
              <strong>Короткий цикл проверки</strong>
              <p>Один вопрос → бой → заметка → одно изменение → тот же бой.</p>
            </div>
            <button
              className="lab-text-button"
              onClick={() => upload.current?.click()}
            >
              <Upload size={16} /> Открыть запись боя
            </button>
          </footer>
        </main>
      )}
      {message && (
        <output className="lab-notice">
          <span>{message}</span>
          <button onClick={() => setMessage('')} aria-label="Закрыть сообщение">
            ×
          </button>
        </output>
      )}
      <input
        ref={upload}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > 8 * 1024 * 1024)
              throw Error('Файл больше 8 МБ. Выбери запись одного опыта.');
            const next = replayLab(JSON.parse(await f.text()), true);
            launch(next.config, next);
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : 'Не удалось прочитать запись.',
            );
          }
        }}
      />
      <Dialog open={journal && !terminal} onOpenChange={setJournal}>
        <DialogContent className="lab-dialog lab-record">
          <DialogTitle>Запись опыта</DialogTitle>
          <DialogDescription>
            Действия воспроизводятся на том же seed. Таймер решений не включает
            анимации, справку, просмотр предметов, журнал и скрытую вкладку.
          </DialogDescription>
          {record}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecordView({
  session,
  onNote,
}: {
  session: LabSession;
  onNote: (note: string) => void;
}) {
  const stats = labSummary(session);
  return (
    <div className="lab-record-content">
      <dl className="lab-stats">
        <div>
          <dt>Действий</dt>
          <dd>{stats.actions}</dd>
        </div>
        <div>
          <dt>Время решений</dt>
          <dd>
            {Math.floor(stats.activeSeconds / 60)}:
            {String(stats.activeSeconds % 60).padStart(2, '0')}
          </dd>
        </div>
        <div>
          <dt>Урон / блок</dt>
          <dd>
            {stats.damage} / {stats.blocked}
          </dd>
        </div>
        <div>
          <dt>Не потрачено ОД</dt>
          <dd>{stats.unusedActions}</dd>
        </div>
      </dl>
      <p className="lab-caption">
        Seed {session.config.seed} · {buildName(session.config)} ·{' '}
        {session.config.scored && !session.imported
          ? 'Испытание'
          : 'Без зачёта'}
        . Остаток ОД считается при завершении хода.
      </p>
      <details className="lab-details">
        <summary>Условия опыта</summary>
        <p className="lab-caption">
          {scenarioName(session.config)}. Здоровье:{' '}
          {session.config.balance.health}. Урон фишки:{' '}
          {session.config.balance.blade}. Блок фишки:{' '}
          {session.config.balance.shield}. Сила врагов: ×
          {session.config.balance.enemyPower}.
        </p>
        <p className="lab-caption">
          Оружие: {itemById(loadoutFor(session.config).weapon)?.name}, качество{' '}
          {loadoutFor(session.config).quality}. Реликвии:{' '}
          {loadoutFor(session.config)
            .relics.map((id) => itemById(id)?.name)
            .join(', ') || 'нет'}
          . Фишки:{' '}
          {loadoutFor(session.config)
            .modifiers.map((id) => itemById(id)?.name)
            .join(', ') || 'обычные'}
          . Приёмы:{' '}
          {loadoutFor(session.config)
            .skills.map((id) => itemById(id)?.name)
            .join(', ') || 'нет'}
          .
        </p>
      </details>
      <details className="lab-details">
        <summary>
          Что произошло <span>{session.entries.length} действий</span>
        </summary>
        <ol className="lab-log">
          {session.entries.map((entry, i) => (
            <li key={i}>
              <strong>
                {i + 1}. {commandName(entry.command)}
              </strong>
              <span>
                Комната {entry.room}, ход {entry.round} ·{' '}
                {Math.round(entry.activeMs / 1000)} с · урон {entry.damage} ·
                здоровье {entry.hpDelta > 0 ? '+' : ''}
                {entry.hpDelta}
              </span>
              <small>{entry.messages.join(' · ')}</small>
              {entry.effects.length > 0 && (
                <details>
                  <summary>Цепочка эффектов ({entry.effects.length})</summary>
                  <p>
                    {entry.effects
                      .map(
                        (e) =>
                          `#${e.effectId} ${e.source}: ${e.cause}${e.amount === undefined ? '' : ` ${e.amount}`}`,
                      )
                      .join(' → ')}
                  </p>
                </details>
              )}
            </li>
          ))}
        </ol>
        {!session.entries.length && (
          <p>Сделай первый ход, и здесь появится запись.</p>
        )}
      </details>
      <label className="lab-note">
        Что ожидал и что произошло?
        <textarea
          maxLength={4000}
          rows={3}
          value={session.note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Где был интересный выбор? Что оказалось непонятным? Почему проиграл?"
        />
      </label>
      <button className="lab-button" onClick={() => download(session)}>
        <Download size={15} /> Скачать запись с заметкой
      </button>
    </div>
  );
}

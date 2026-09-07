/* eslint-disable react/react-compiler, nextjs/no-img-element -- This event-driven renderer is not React Compiler compiled; refs bridge asynchronous frame replay and WebMCP to React state. */
'use client';
import { VISUAL_STYLES } from '@/game/visual-style';
import { useRef, useState, useEffect, type PointerEvent } from 'react';
import {
  Sword,
  Shield,
  Zap,
  Sparkles,
  Heart,
  Coins,
  Skull,
  Bomb,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Lightbulb,
  RotateCcw,
  CircleHelp,
  Gem,
  Footprints,
  Flame,
  FlaskConical,
  Check,
  Settings2,
  Crown,
  Timer,
  Pause,
  BookOpen,
  Sprout,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {
  RunPanel,
  Discoveries,
  SettingsPanel,
  ItemIcon,
  type Preset,
} from '@/components/game-panels';
import {
  EMPTY_META,
  isSave,
  isMeta,
  updateMeta,
  abandonMeta,
  withUnlocks,
  pauseTrial,
  tickTrial,
  canCast,
  configureRun,
  type Meta,
  type Balance,
} from '@/game/engine';
import { registerGameTools, gameAction, gameSnapshot } from '@/game/webmcp';
import { SkinIcon } from '@/components/skin-icon';
import {
  StylePicker,
  useVisualStyle,
  readVisualStyle,
  selectVisualStyle,
} from '@/components/visual-style';
import { CombatSprite } from '@/components/combat-sprite';
import { motionFor, type Motion } from '@/game/motion';
import { Progress } from '@/components/ui/progress';
import {
  startRun,
  move,
  endTurn,
  castSkill,
  consumePotion,
  shifted,
  groups,
  validMoves,
  intent,
  energyMax,
  focusMax,
  FAMILY_NAMES,
  FAMILIES,
  itemById,
  type Frame,
  type Result,
  type Family,
} from '@/game/engine';
const SYMBOLS = { blade: Sword, shield: Shield, spark: Zap, focus: Sparkles };
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export default function Game() {
  const visualStyle = useVisualStyle();
  const illustrated = visualStyle !== 'crypt';
  const [game, setGame] = useState(() => startRun());
  const [motion, setMotion] = useState<Motion | null>(null);
  const motionSerial = useRef(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState(
    'Сдвигай целые строки и столбцы. Собери три одинаковых символа.',
  );
  const [selected, setSelected] = useState(14);
  const [editing, setEditing] = useState<Family | null>(null);
  const [help, setHelp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false),
    [discoveries, setDiscoveries] = useState(false),
    [restartConfirm, setRestartConfirm] = useState(false);
  const [detail, setDetail] = useState<string | null>(null),
    [newDiscovery, setNewDiscovery] = useState('');
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const metaRef = useRef(meta);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [ready, setReady] = useState(false);
  const modalOpen =
    help || settingsOpen || discoveries || restartConfirm || !!detail;
  const saveMessageRef = useRef(false);
  const [preview, setPreview] = useState<{
    axis: 'row' | 'col';
    line: number;
    amount: number;
  } | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    index: number;
    size: number;
  } | null>(null);
  const s = frame?.state ?? game;
  const active = ['battle', 'trial'].includes(game.phase);
  const board = preview
    ? shifted(s.board, preview.axis, preview.line, preview.amount)
    : s.board;
  const marked = frame?.cells ?? (preview ? groups(board).flat() : []);
  const play = async (transition: Result) => {
    if (busyRef.current) return;
    if (transition.error) {
      setMessage(transition.error);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setEditing(null);
    setPreview(null);
    let previous = gameRef.current;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    for (const f of transition.frames) {
      const duration = reduced
        ? 90
        : Math.max(220, gameRef.current.balance.animation * 2.2);
      const beat = motionFor(previous, f, ++motionSerial.current, duration);
      setMotion(beat);
      await pause(duration * 0.32);
      setFrame(f);
      setMotion({ ...beat, stage: 'impact' });
      await pause(duration * 0.48);
      setMotion({ ...beat, stage: 'recovery' });
      await pause(duration * 0.2);
      previous = f.state;
    }
    setMotion(null);
    setFrame(null);
    gameRef.current = transition.state;
    setGame(transition.state);
    setBusy(false);
    busyRef.current = false;
    setMessage(
      transition.state.phase === 'reward'
        ? 'Победа. Впереди — новая находка.'
        : transition.state.moved
          ? 'Можно применить способность или завершить ход.'
          : 'Твой ход. Выбирай комбинацию.',
    );
  };
  const restart = (
    b: Balance = gameRef.current.balance,
    preset: Preset = 'normal',
    manualSeed?: number,
  ) => {
    const prev = gameRef.current;
    const nextMeta = abandonMeta(metaRef.current, prev);
    metaRef.current = nextMeta;
    setMeta(nextMeta);
    let next = withUnlocks(
      startRun(manualSeed ?? Date.now() >>> 0, b),
      nextMeta,
    );
    next = configureRun(next, preset);
    next.runId = crypto.randomUUID();
    if (manualSeed !== undefined) next.modified = true;
    gameRef.current = next;
    setGame(next);
    setEditing(null);
    setFrame(null);
    setPreview(null);
    setRestartConfirm(false);
    setMessage('Новый путь. Первая находка ждёт после боя.');
  };
  useEffect(() => {
    try {
      const rawMeta = localStorage.getItem('oskolki.meta.v1');
      const m = rawMeta ? JSON.parse(rawMeta) : EMPTY_META;
      const loadedMeta = isMeta(m) ? m : EMPTY_META;
      metaRef.current = loadedMeta;
      setMeta(loadedMeta);
      const raw = localStorage.getItem('oskolki.run.v1');
      const loaded = raw ? JSON.parse(raw) : null;
      if (isSave(loaded)) {
        loaded.heroPoison ??= 0;
        if (loaded.trial) loaded.trial.paused = true;
        gameRef.current = loaded;
        setGame(loaded);
        setMessage('Забег восстановлен. Можно продолжать.');
      } else {
        const fresh = withUnlocks(startRun(), loadedMeta);
        fresh.runId = crypto.randomUUID();
        gameRef.current = fresh;
        setGame(fresh);
      }
    } catch {
      setMessage('Сохранение не прочиталось. Начат новый забег.');
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const old = metaRef.current;
    const updated = updateMeta(old, game);
    const fresh = updated.unlocked.filter((x) => !old.unlocked.includes(x));
    if (fresh.length)
      setNewDiscovery(
        `Новое открытие! Реликвии станут доступны в следующем забеге.`,
      );
    metaRef.current = updated;
    setMeta(updated);
    try {
      localStorage.setItem('oskolki.run.v1', JSON.stringify(game));
      localStorage.setItem('oskolki.meta.v1', JSON.stringify(updated));
    } catch {
      if (!saveMessageRef.current) {
        saveMessageRef.current = true;
        setMessage(
          'Браузер не разрешил сохранение. Забег доступен до закрытия вкладки.',
        );
      }
    }
  }, [game, ready]);
  useEffect(() => {
    if (!newDiscovery) return;
    const id = setTimeout(() => setNewDiscovery(''), 5000);
    return () => clearTimeout(id);
  }, [newDiscovery]);
  useEffect(() => {
    if (game.phase !== 'trial' || game.trial?.paused || busy || modalOpen)
      return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - last) / 1000;
      last = now;
      if (busyRef.current) return;
      setGame((previous) => tickTrial(previous, elapsed).state);
    }, 100);
    return () => clearInterval(id);
  }, [game.phase, game.trial?.paused, busy, modalOpen]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && gameRef.current.phase === 'trial')
        setGame((previous) => pauseTrial(previous, true).state);
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  const doMove = (axis: 'row' | 'col', line: number, amount: number) => {
    if (!busyRef.current && active) void play(move(game, axis, line, amount));
  };
  const pointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (busy || !active) return;
    setSelected(i);
    if (editing) {
      void play(castSkill(game, 'edit', i, editing));
      return;
    }
    if (game.moved) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      index: i,
      size: e.currentTarget.getBoundingClientRect().width + 5,
    };
  };
  const dragMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = gesture.current;
    if (!d) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < d.size * 0.35) {
      setPreview(null);
      return;
    }
    const axis = Math.abs(dx) > Math.abs(dy) ? 'row' : 'col';
    const delta = axis === 'row' ? dx : dy;
    const amount = Math.max(-5, Math.min(5, Math.round(delta / d.size)));
    setPreview(
      amount
        ? {
            axis,
            line: axis === 'row' ? Math.floor(d.index / 6) : d.index % 6,
            amount,
          }
        : null,
    );
  };
  const dragEnd = () => {
    gesture.current = null;
    if (preview) doMove(preview.axis, preview.line, preview.amount);
    setPreview(null);
  };
  const hint = () => {
    const m = validMoves(game.board).sort(
      (a, b) => b.cells.length - a.cells.length,
    )[0];
    if (m) {
      setSelected(m.axis === 'row' ? m.line * 6 : m.line);
      setMessage(
        `${m.axis === 'row' ? 'Строка' : 'Столбец'} ${m.line + 1}: ${m.axis === 'row' ? 'вправо' : 'вниз'} на ${m.amount} ${m.amount === 1 ? 'клетку' : 'клетки'}. Можно перетащить фишку.`,
      );
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        modalOpen ||
        busyRef.current ||
        !active ||
        (e.target as HTMLElement).closest(
          'input,textarea,select,a,[role=slider],[role=radio],[role=radiogroup],button:not(.tile)',
        )
      )
        return;
      const keys: Record<string, ['row' | 'col', number, number]> = {
        ArrowLeft: ['row', Math.floor(selected / 6), -1],
        ArrowRight: ['row', Math.floor(selected / 6), 1],
        ArrowUp: ['col', selected % 6, -1],
        ArrowDown: ['col', selected % 6, 1],
      };
      if (keys[e.key]) {
        e.preventDefault();
        doMove(...keys[e.key]);
      }
      if (e.key === ' ') {
        e.preventDefault();
        void play(
          game.phase === 'trial' ? pauseTrial(game, true) : endTurn(game),
        );
      }
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const toolsRef = useRef({
    read: () => gameSnapshot(gameRef.current, busyRef.current),
    act: async (input: unknown): Promise<unknown> => {
      return input;
    },
  });
  toolsRef.current = {
    read: () =>
      gameSnapshot(
        gameRef.current,
        busyRef.current || modalOpen,
        modalOpen && gameRef.current.phase === 'trial',
      ),
    act: async (input: unknown) => {
      if (busyRef.current || modalOpen)
        throw Error('Заверши анимацию или закрой справку/настройки.');
      const transition = gameAction(gameRef.current, input);
      if (transition.error) throw Error(transition.error);
      await play(transition);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return gameSnapshot(gameRef.current, busyRef.current);
    },
  };
  useEffect(() => {
    if (ready)
      return registerGameTools(
        () => toolsRef.current.read(),
        (input) => toolsRef.current.act(input),
        { read: readVisualStyle, select: selectVisualStyle },
      );
  }, [ready]);
  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          {illustrated ? (
            <SkinIcon name="crown" size={40} />
          ) : (
            <Gem size={27} />
          )}
          <h1>ОСКОЛКИ</h1>
          <span className="build-tag">
            {s.modified ? 'ПРОВЕРКА БАЛАНСА' : 'ПЕРВЫЙ СПУСК'}
          </span>
        </div>
        <div className="header-run">
          <Flame size={16} />
          <span>Крипта</span>
          <span className="divider">/</span>
          <span>Комната {s.room} из 10</span>
        </div>
        <div className="header-actions">
          <span className="gold">
            {illustrated ? (
              <SkinIcon name="coin" size={30} />
            ) : (
              <Coins size={17} />
            )}
            {s.gold}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Открытия"
            onClick={() => setDiscoveries(true)}
          >
            <BookOpen />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Настройки баланса"
            onClick={() => setSettingsOpen(true)}
            disabled={busy}
          >
            <Settings2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Как играть"
            onClick={() => setHelp(true)}
          >
            <CircleHelp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Новый забег"
            disabled={busy}
            onClick={() => setRestartConfirm(true)}
          >
            <RotateCcw />
          </Button>
        </div>
      </header>
      <div className="appearance-bar">
        <StylePicker disabled={busy} />
      </div>
      <div className="game-layout">
        <aside className="journey">
          <p className="eyebrow">ТВОЙ ПУТЬ</p>
          <h2>
            В глубину
            <br />
            крипты
          </h2>
          <p className="muted journey-copy">
            Каждая находка
            <br />
            меняет следующий ход.
          </p>
          <ol className="path-list">
            {[
              'Вход в крипту',
              'Развилка',
              'Тихие залы',
              'Старые катакомбы',
              'Торговец',
              'Нижние залы',
              'Испытание',
              'Последний рубеж',
              'Привал',
              'Привратник',
            ].map((name, i) => (
              <li
                key={name}
                className={
                  i + 1 === s.room
                    ? 'current'
                    : i + 1 < s.room
                      ? 'complete'
                      : ''
                }
              >
                <span className="path-dot">
                  {i + 1 < s.room ? (
                    <Check size={12} />
                  ) : i === 9 ? (
                    <Crown size={14} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span>{name}</span>
              </li>
            ))}
          </ol>
          <div className="journey-bottom">
            <span className="eyebrow">СТРАННИК</span>
            <p>Сбалансированный герой</p>
            <span className="muted">В начале боя +3 энергии</span>
            <p className="streak-line">
              Серия побед <b>{meta.streak}</b>
              <small>Лучшая: {meta.best}</small>
            </p>
          </div>
        </aside>
        <section className="play-area" aria-label="Поле боя">
          <div
            className={`arena ${motion ? `beat-${motion.cue.type} beat-${motion.stage}` : ''}`}
          >
            <img
              className="arena-bg"
              src={VISUAL_STYLES.find((skin) => skin.id === visualStyle)!.arena}
              alt={
                VISUAL_STYLES.find((skin) => skin.id === visualStyle)!.arenaAlt
              }
            />
            <div className="arena-shade" />
            <div className="arena-dust" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="arena-caption">
              <span className="eyebrow">
                {s.roomKind === 'boss' ? 'БОСС БИОМА' : 'КРИПТА · ПЕРВЫЙ БИОМ'}
              </span>
              <span className="turn-badge">
                {s.phase === 'trial'
                  ? `${Math.ceil(s.trial?.remaining ?? 0)} сек.`
                  : `Ход ${s.round}`}
              </span>
            </div>
            <div className="fighter hero">
              <CombatSprite state={s} motion={motion} actor="hero" />
              <div className="fighter-caption">
                <strong>Странник</strong>
                <span className="health-number">
                  {illustrated ? (
                    <SkinIcon name="heart" size={22} />
                  ) : (
                    <Heart size={13} />
                  )}
                  {s.hp} / {s.maxHp}
                  {s.heroPoison > 0 && (
                    <span className="poison-number"> · яд {s.heroPoison}</span>
                  )}
                </span>
                <Progress
                  value={(s.hp / s.maxHp) * 100}
                  className="health-bar"
                  aria-label="Здоровье героя"
                />
              </div>
              {s.block > 0 && (
                <span className="block-orb">
                  <Shield size={15} />
                  {s.block}
                </span>
              )}
            </div>
            <div className={`enemies count-${s.enemies.length}`}>
              {s.enemies.map((e) => (
                <button
                  className={`fighter enemy ${e.hp <= 0 ? 'fallen' : ''} ${s.target === e.id ? 'targeted' : ''}`}
                  key={e.id}
                  aria-label={`Цель: ${e.name}, ${e.hp} здоровья`}
                  onClick={() => !busy && setGame({ ...game, target: e.id })}
                  disabled={e.hp <= 0 || busy}
                >
                  <span className="enemy-intent">
                    {intent(s, e).type === 'attack' ? (
                      <Sword size={14} />
                    ) : intent(s, e).type === 'roots' ? (
                      <Sprout size={14} />
                    ) : intent(s, e).type === 'poison' ? (
                      <Skull size={14} />
                    ) : (
                      <Shield size={14} />
                    )}{' '}
                    {intent(s, e).text}
                  </span>
                  <CombatSprite state={s} motion={motion} actor={e.id} />
                  <div className="fighter-caption">
                    <strong>{e.name}</strong>
                    <span className="health-number">
                      {e.hp} / {e.maxHp}
                      {e.poison > 0 && (
                        <span className="poison-number"> · яд {e.poison}</span>
                      )}
                      {e.block > 0 && ` · блок ${e.block}`}
                    </span>
                    <Progress
                      value={(Math.max(0, e.hp) / e.maxHp) * 100}
                      className="health-bar enemy-health"
                      aria-label="Здоровье врага"
                    />
                  </div>
                </button>
              ))}
            </div>
            {s.phase === 'trial' && s.trial && (
              <div className="trial-target">
                <Timer size={24} />
                <strong>Закрывающийся шлюз</strong>
                <div>
                  <Zap size={15} />
                  <span>Механизм</span>
                  <b>{Math.min(18, s.trial.energy)} / 18</b>
                </div>
                <Progress
                  value={Math.min(100, (s.trial.energy / 18) * 100)}
                  aria-label="Энергия механизма"
                />
                <div>
                  <Sword size={15} />
                  <span>Преграда</span>
                  <b>{Math.min(30, s.trial.damage)} / 30</b>
                </div>
                <Progress
                  value={Math.min(100, (s.trial.damage / 30) * 100)}
                  aria-label="Разрушение преграды"
                />
              </div>
            )}
            {frame && (
              <div
                className="combat-flash"
                key={`${frame.label}-${s.stats.matches}`}
              >
                {frame.label}
              </div>
            )}
          </div>
          <div className="board-heading">
            <div>
              <span className={`phase-dot ${busy ? 'resolving' : ''}`} />
              <strong>
                {busy
                  ? 'Комбинация сработала'
                  : s.moved
                    ? 'Сдвиг использован'
                    : 'Твой ход'}
              </strong>
            </div>
            <Button
              variant="ghost"
              className="hint-button"
              onClick={hint}
              disabled={busy || !active}
            >
              <Lightbulb size={15} />
              Подсказка
            </Button>
          </div>
          <div
            className={`board-section ${editing ? 'is-editing' : ''} ${game.phase === 'trial' && (game.trial?.paused || modalOpen) ? 'trial-paused' : ''}`}
          >
            <div className="board-frame">
              <div className="arrow-row top-arrows">
                <span />
                {Array.from({ length: 6 }, (_, i) => (
                  <button
                    key={i}
                    aria-label={`Столбец ${i + 1} вверх`}
                    onClick={() => doMove('col', i, -1)}
                    disabled={busy || s.moved || !active}
                  >
                    <ChevronUp />
                  </button>
                ))}
                <span />
              </div>
              <div className="board-body">
                <div className="side-arrows">
                  {Array.from({ length: 6 }, (_, i) => (
                    <button
                      key={i}
                      aria-label={`Строка ${i + 1} влево`}
                      onClick={() => doMove('row', i, -1)}
                      disabled={busy || s.moved || !active}
                    >
                      <ChevronLeft />
                    </button>
                  ))}
                </div>
                <fieldset
                  className="board"
                  aria-label="Поле 6 на 6. Выбери фишку и используй стрелки или перетащи её."
                >
                  {board.map((t, i) => {
                    const Icon =
                      t.variant === 'bomb'
                        ? Bomb
                        : t.variant === 'venom'
                          ? Skull
                          : SYMBOLS[t.family];
                    return (
                      <button
                        key={i}
                        className={`tile tile-${t.family} ${selected === i ? 'selected' : ''} ${marked.includes(i) ? 'matched' : ''} ${t.variant ? 'variant' : ''} ${t.root ? 'rooted' : ''}`}
                        aria-label={`${FAMILY_NAMES[t.family]}${t.variant === 'bomb' ? ', бомба' : t.variant === 'venom' ? ', яд' : ''}, строка ${Math.floor(i / 6) + 1}, столбец ${(i % 6) + 1}`}
                        aria-pressed={selected === i}
                        onPointerDown={(e) => pointerDown(e, i)}
                        onPointerMove={dragMove}
                        onPointerUp={dragEnd}
                        onPointerCancel={() => {
                          gesture.current = null;
                          setPreview(null);
                        }}
                        onClick={(e) => {
                          if (e.detail === 0) {
                            setSelected(i);
                            if (editing)
                              void play(castSkill(game, 'edit', i, editing));
                          }
                        }}
                      >
                        {illustrated ? (
                          <SkinIcon name={t.variant ?? t.family} size={56} />
                        ) : (
                          <Icon size={27} strokeWidth={1.8} />
                        )}
                        {t.root && (
                          <span
                            className="root-mark"
                            aria-label="Корни: собери до следующего ответа"
                          >
                            <Sprout size={12} />
                          </span>
                        )}
                        {t.variant && (
                          <span className="family-mark">
                            {t.family === 'blade' ? 'Ⅰ' : 'ϟ'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </fieldset>
                <div className="side-arrows">
                  {Array.from({ length: 6 }, (_, i) => (
                    <button
                      key={i}
                      aria-label={`Строка ${i + 1} вправо`}
                      onClick={() => doMove('row', i, 1)}
                      disabled={busy || s.moved || !active}
                    >
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              </div>
              <div className="arrow-row bottom-arrows">
                <span />
                {Array.from({ length: 6 }, (_, i) => (
                  <button
                    key={i}
                    aria-label={`Столбец ${i + 1} вниз`}
                    onClick={() => doMove('col', i, 1)}
                    disabled={busy || s.moved || !active}
                  >
                    <ChevronDown />
                  </button>
                ))}
                <span />
              </div>
            </div>
            <div className="board-legend">
              {FAMILIES.map((f) => {
                const Icon = SYMBOLS[f];
                return (
                  <span key={f} className={`legend-${f}`}>
                    {illustrated ? (
                      <SkinIcon name={f} size={23} />
                    ) : (
                      <Icon size={14} />
                    )}
                    {FAMILY_NAMES[f]}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="turn-controls">
            <output className="move-message">
              {editing ? `Выбери фишку → ${FAMILY_NAMES[editing]}` : message}
            </output>
            <Button
              className="end-turn"
              onClick={() =>
                void play(
                  game.phase === 'trial'
                    ? pauseTrial(game, true)
                    : endTurn(game),
                )
              }
              disabled={busy || !active}
            >
              {game.phase === 'trial' ? 'Пауза' : 'Завершить ход'}{' '}
              {game.phase === 'trial' ? (
                <Pause size={17} />
              ) : (
                <ArrowRight size={17} />
              )}
            </Button>
          </div>
        </section>
        <aside className="loadout">
          <div className="resource-row">
            <div className="resource energy">
              {illustrated ? (
                <SkinIcon name="spark" size={40} />
              ) : (
                <Zap size={21} />
              )}
              <strong>
                {s.energy}
                <small>/{energyMax(s)}</small>
              </strong>
              <span>Энергия</span>
            </div>
            <div className="resource focus">
              {illustrated ? (
                <SkinIcon name="focus" size={40} />
              ) : (
                <Sparkles size={21} />
              )}
              <strong>
                {s.focus}
                <small>/{focusMax(s)}</small>
              </strong>
              <span>Фокус</span>
            </div>
          </div>
          <div className="section-label">
            <span className="eyebrow">ПРИЁМЫ</span>
            <span>{s.cast ? 'Использован' : '1 за ход'}</span>
          </div>
          <div className="skills">
            {s.skills.map((id) => (
              <Button
                key={id}
                variant="outline"
                className="skill-card"
                disabled={busy || !canCast(game, id)}
                onClick={() => void play(castSkill(game, id, selected))}
              >
                <span className="skill-icon">
                  <ItemIcon id={id} />
                </span>
                <span>
                  <strong>{itemById(id)?.name}</strong>
                  <small>{itemById(id)?.description}</small>
                </span>
              </Button>
            ))}
            <div className={`edit-skill ${editing ? 'active' : ''}`}>
              <Button
                variant="ghost"
                className="edit-trigger"
                disabled={busy || s.cast || s.focus < 3 || !active}
                onClick={() => setEditing(editing ? null : 'blade')}
              >
                {illustrated ? (
                  <SkinIcon name="focus" size={32} />
                ) : (
                  <Sparkles size={20} />
                )}
                <span>
                  <strong>Правка поля</strong>
                  <small>3 фокуса · замени одну фишку</small>
                </span>
              </Button>
              {editing && (
                <div className="family-choices">
                  {FAMILIES.map((f) => {
                    const Icon = SYMBOLS[f];
                    return (
                      <button
                        key={f}
                        className={`tile-${f} ${editing === f ? 'chosen' : ''}`}
                        aria-label={`Превратить в ${FAMILY_NAMES[f]}`}
                        onClick={() => setEditing(f)}
                      >
                        {illustrated ? (
                          <SkinIcon name={f} size={28} />
                        ) : (
                          <Icon size={18} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            className="potion"
            disabled={
              busy || s.consumed || !s.potions || s.hp === s.maxHp || !active
            }
            onClick={() => void play(consumePotion(game))}
          >
            {illustrated ? (
              <SkinIcon name="potion" size={36} />
            ) : (
              <FlaskConical size={19} />
            )}
            <span>
              Лечебное зелье <small>+8 здоровья</small>
            </span>
            <b>×{s.potions}</b>
          </Button>
          <div className="section-label relic-label">
            <span className="eyebrow">РЕЛИКВИИ</span>
            <span>{s.relics.length}</span>
          </div>
          {s.relics.length ? (
            <div className="relic-list">
              {s.relics.map((id) => (
                <button key={id} onClick={() => setDetail(id)}>
                  <ItemIcon id={id} />
                  <span>{itemById(id)?.name}</span>
                  <CircleHelp size={12} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-relics">
              {illustrated ? (
                <SkinIcon name="relic" size={42} />
              ) : (
                <Gem size={24} />
              )}
              <p>
                Первая находка
                <br />
                ждёт за этим боем.
              </p>
            </div>
          )}
          {s.modifiers.length > 0 && (
            <>
              <div className="section-label">
                <span className="eyebrow">МОДИФИКАТОРЫ ПОЛЯ</span>
                <span>{s.modifiers.length}/2</span>
              </div>
              <div className="modifier-list">
                {s.modifiers.map((id) => (
                  <button key={id} onClick={() => setDetail(id)}>
                    <ItemIcon id={id} />
                    <span>{itemById(id)?.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {Object.values(s.upgrades).some((x) => x > 0) && (
            <div className="upgrade-pips">
              {FAMILIES.filter((f) => s.upgrades[f] > 0).map((f) => (
                <span key={f}>
                  {FAMILY_NAMES[f]} +{s.upgrades[f]}
                </span>
              ))}
            </div>
          )}
          <div className="battle-log">
            <span className="eyebrow">ХОД БОЯ</span>
            {s.log.slice(0, 4).map((line, i) => (
              <p key={`${i}-${line}`} className={i === 0 ? 'latest' : ''}>
                {line}
              </p>
            ))}
          </div>
        </aside>
      </div>
      <footer className="game-footer">
        <span>
          <Footprints size={14} /> Один биом. Много способов пройти.
        </span>
        <span>Выбери фишку + ← ↑ ↓ → · Пробел — завершить ход</span>
      </footer>
      {newDiscovery && (
        <button
          className="discovery-toast"
          onClick={() => {
            setDiscoveries(true);
            setNewDiscovery('');
          }}
        >
          <Gem size={20} />
          <span>{newDiscovery}</span>
          <ArrowRight size={15} />
        </button>
      )}
      <RunPanel
        key={`${game.phase}-${game.room}`}
        game={game}
        meta={meta}
        busy={busy}
        act={play}
        restart={() => restart()}
      />
      <Discoveries
        open={discoveries}
        onClose={() => setDiscoveries(false)}
        meta={meta}
      />
      <SettingsPanel
        key={settingsOpen ? 'open' : 'closed'}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        balance={game.balance}
        onAnimation={(animation) =>
          setGame((g) => ({ ...g, balance: { ...g.balance, animation } }))
        }
        onStart={restart}
      />
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="game-dialog">
          <div className="panel-emblem">
            <ItemIcon id={detail ?? ''} />
          </div>
          <DialogTitle>{itemById(detail ?? '')?.name}</DialogTitle>
          <DialogDescription>
            {itemById(detail ?? '')?.description}
          </DialogDescription>
          <span className="offer-tag">{itemById(detail ?? '')?.tag}</span>
          <Button onClick={() => setDetail(null)}>Вернуться</Button>
        </DialogContent>
      </Dialog>
      <AlertDialog open={restartConfirm} onOpenChange={setRestartConfirm}>
        <AlertDialogContent className="game-dialog">
          <AlertDialogTitle>Начать новый спуск?</AlertDialogTitle>
          <AlertDialogDescription>
            Текущий незавершённый забег закончится. Открытия сохранятся, обычная
            серия побед сбросится.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить этот</AlertDialogCancel>
            <AlertDialogAction onClick={() => restart()}>
              Новый спуск
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="game-dialog">
          <DialogTitle>Как пройти крипту</DialogTitle>
          <DialogDescription>
            Собирай комбинации, читай намерения врагов и строй свою сборку.
          </DialogDescription>
          <div className="help-copy">
            <p>
              Перетащи фишку вдоль строки или столбца. Двигается вся линия;
              вышедшие за край фишки возвращаются с другой стороны.
            </p>
            <p>
              Три одинаковых семейства дают урон, блок, энергию или фокус. Сдвиг
              без комбинации не тратит ход.
            </p>
            <p>
              За ход доступны один успешный сдвиг, одна способность и одно
              зелье. Способность можно применить до или после комбинации.
            </p>
            <p>
              Щиты защищают до следующего хода. Фокус позволяет превратить
              выбранную фишку в нужный тип. Враг действует после кнопки
              «Завершить ход».
            </p>
          </div>
          <Button onClick={() => setHelp(false)}>Всё понятно</Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

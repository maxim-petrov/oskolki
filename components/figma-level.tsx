/* eslint-disable react/react-compiler, nextjs/no-img-element -- Refs coordinate frame replay and pointer input; artwork is exported from Figma. */
/* eslint-disable jsx-a11y/prefer-tag-over-role -- ARIA div grid and art-backed resource meters preserve the supplied layout and expose live game values. */
'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  actionLeft,
  canCast,
  groups,
  intent,
  previewMove,
  shifted,
  type Family,
  type Frame,
} from '@/game/engine';
import {
  LEVEL_ACTIONS,
  LEVEL_FAMILY_NAMES,
  levelAction,
  parallaxOffset,
  startLevel,
  type LevelAction,
} from '@/game/figma-level';
import { impactFor, motionFor, poseFor, type Motion } from '@/game/motion';
import { ART, ABILITIES, Cutout, FigmaTile, HeroHUD } from './figma-level-art';
const FAMILIES: Family[] = ['blade', 'shield', 'spark', 'focus'];
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export default function FigmaLevel() {
  const [game, setGame] = useState(startLevel);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [frame, setFrame] = useState<Frame | null>(null);
  const [motion, setMotion] = useState<Motion | null>(null);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    replayId = useRef(0);
  const [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null),
    scene = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false),
    [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false),
    [editFamily, setEditFamily] = useState<Family>('blade');
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    axis: 'row' | 'col';
    line: number;
    amount: number;
  } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    index: number;
  } | null>(null);
  const [status, setStatus] = useState(
    'Сдвигай строки и столбцы. Три одинаковые фишки дают эффект.',
  );
  const [hovered, setHovered] = useState<number | null>(null);
  const [parallax, setParallax] = useState(10),
    [reduced, setReduced] = useState(false);
  const pointer = useRef({ x: 0, y: 0 }),
    parallaxFrame = useRef(0);
  const s = frame?.state ?? game,
    enemy = s.enemies[0];
  const blocked = busy || menu || help || game.phase !== 'battle';
  const board = preview
    ? shifted(s.board, preview.axis, preview.line, preview.amount)
    : s.board;
  const matched = frame?.cells ?? (preview ? groups(board).flat() : []);
  const prediction = preview
    ? previewMove(game, preview.axis, preview.line, preview.amount)
    : null;
  const enemyIntent = intent(s, enemy),
    heroHit = impactFor(motion, 'hero'),
    enemyHit = impactFor(motion, enemy.id);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () => setScale(node.clientWidth / 1672);
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    try {
      const saved = localStorage.getItem('oskolki.figma-parallax.v1');
      if (saved !== null && Number.isFinite(Number(saved)))
        setParallax(Math.max(0, Math.min(18, Number(saved))));
    } catch {
      /* Optional preference. */
    }
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', update);
      // Invalidate an asynchronous replay, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      replayId.current++;
      cancelAnimationFrame(parallaxFrame.current);
    };
  }, []);
  useEffect(() => {
    let current = { x: 0, y: 0 };
    const update = () => {
      const target = parallaxOffset(
        pointer.current.x,
        pointer.current.y,
        parallax,
        reduced || menu || help,
      );
      current = {
        x: current.x + (target.x - current.x) * 0.12,
        y: current.y + (target.y - current.y) * 0.12,
      };
      scene.current?.style.setProperty(
        '--foreground-x',
        `${current.x.toFixed(2)}px`,
      );
      scene.current?.style.setProperty(
        '--foreground-y',
        `${current.y.toFixed(2)}px`,
      );
      parallaxFrame.current =
        Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.02
          ? requestAnimationFrame(update)
          : 0;
    };
    const schedule = () => {
      if (!parallaxFrame.current)
        parallaxFrame.current = requestAnimationFrame(update);
    };
    const reset = () => {
      pointer.current = { x: 0, y: 0 };
      schedule();
    };
    const track = (e: globalThis.PointerEvent) => {
      const bounds = viewport.current?.getBoundingClientRect();
      if (!bounds || e.pointerType === 'touch') return;
      pointer.current = {
        x: ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: ((e.clientY - bounds.top) / bounds.height) * 2 - 1,
      };
      schedule();
    };
    const node = viewport.current;
    node?.addEventListener('pointermove', track);
    node?.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    schedule();
    return () => {
      node?.removeEventListener('pointermove', track);
      node?.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      cancelAnimationFrame(parallaxFrame.current);
      parallaxFrame.current = 0;
    };
  }, [parallax, reduced, menu, help]);
  const play = async (action: LevelAction) => {
    if (busyRef.current || menu || help) return;
    const result = levelAction(gameRef.current, action);
    if (result.error) {
      setStatus(result.error);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setPreview(null);
    gesture.current = null;
    setEditing(false);
    const id = ++replayId.current;
    let previous = gameRef.current;
    for (const beat of result.frames) {
      if (id !== replayId.current) return;
      const m = motionFor(previous, beat, id, reduced ? 90 : 310);
      setMotion(m);
      await wait(reduced ? 30 : 100);
      if (id !== replayId.current) return;
      setFrame(beat);
      setMotion({ ...m, stage: 'impact' });
      setStatus(
        action.type === 'skill' && beat === result.frames[0]
          ? (ABILITIES.find((a) => a.id === action.id)?.name ?? beat.label)
          : beat.label,
      );
      await wait(reduced ? 60 : 210);
      previous = beat.state;
    }
    if (id !== replayId.current) return;
    gameRef.current = result.state;
    setGame(result.state);
    setFrame(null);
    setMotion(null);
    setStatus(
      action.type === 'end'
        ? `Твой ход · ${LEVEL_ACTIONS} действий`
        : (result.frames.at(-1)?.label ??
            'Поле подготовлено. Можно сделать следующий шаг.'),
    );
    busyRef.current = false;
    setBusy(false);
  };
  const activateSkill = (i: number) => {
    if (blocked) return;
    const ability = ABILITIES[i];
    if (!canCast(game, ability.id)) {
      setStatus(`${ability.name}: нужно ${ability.cost.toLowerCase()}.`);
      return;
    }
    if (ability.id === 'edit') {
      setEditing(!editing);
      setPreview(null);
      setStatus('Выбери символ замены и нажми на фишку.');
    } else void play({ type: 'skill', id: ability.id });
  };
  const openMenu = () => {
    if (busyRef.current) return;
    gesture.current = null;
    setPreview(null);
    setEditing(false);
    setMenu(true);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches('input,select,textarea') ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.code === 'Escape') {
        if (editing || preview || gesture.current) {
          gesture.current = null;
          setPreview(null);
          setEditing(false);
        } else if (menu) setMenu(false);
        else if (help) setHelp(false);
        else openMenu();
        return;
      }
      if (blocked || e.repeat) return;
      if (e.code === 'KeyY') {
        e.preventDefault();
        void play({ type: 'end' });
      } else if (/^Digit[1-5]$/.test(e.code)) {
        e.preventDefault();
        activateSkill(Number(e.code.slice(-1)) - 1);
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const updateGesture = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = (e.clientX - g.x) / scale,
      dy = (e.clientY - g.y) / scale;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) {
      setPreview(null);
      previewRef.current = null;
      return;
    }
    const axis: 'row' | 'col' = Math.abs(dx) >= Math.abs(dy) ? 'row' : 'col';
    const delta = axis === 'row' ? dx : dy;
    const amount =
      Math.sign(delta) *
      Math.min(7, Math.max(1, Math.round(Math.abs(delta) / 67.125)));
    const next = {
      axis,
      line: axis === 'row' ? Math.floor(g.index / 8) : g.index % 8,
      amount,
    };
    previewRef.current = next;
    setPreview(next);
  };
  const release = (e: PointerEvent) => {
    if (gesture.current?.pointerId !== e.pointerId) return;
    updateGesture(e);
    const proposal = previewRef.current;
    gesture.current = null;
    setPreview(null);
    previewRef.current = null;
    if (proposal) void play({ type: 'shift', ...proposal });
  };
  const cancel = () => {
    gesture.current = null;
    setPreview(null);
    previewRef.current = null;
  };
  const restart = () => {
    replayId.current++;
    const next = startLevel();
    gameRef.current = next;
    setGame(next);
    busyRef.current = false;
    setBusy(false);
    setFrame(null);
    setMotion(null);
    setMenu(false);
    setSelected(null);
    setEditing(false);
    cancel();
    setStatus('Сдвигай строки и столбцы. Три одинаковые фишки дают эффект.');
  };
  const changeParallax = (value: number) => {
    setParallax(value);
    try {
      localStorage.setItem('oskolki.figma-parallax.v1', String(value));
    } catch {
      /* Optional preference. */
    }
  };
  const info = hovered === null ? null : ABILITIES[hovered];
  const moveText = prediction
    ? (prediction.error ??
      [
        `${prediction.actionCost} действ.`,
        prediction.targets?.[0]?.damage
          ? `${prediction.targets[0].damage} урона`
          : '',
        prediction.block ? `+${prediction.block} защиты` : '',
        prediction.energy ? `+${prediction.energy} энергии` : '',
        prediction.focus ? `+${prediction.focus} фокуса` : '',
        prediction.cells?.length ? 'без будущих каскадов' : '',
        !prediction.cells?.length ? 'подготовка поля' : '',
      ]
        .filter(Boolean)
        .join(' · '))
    : '';
  return (
    <main className="figma-level" aria-label="Осколки — архив, первый уровень">
      <div className="level-viewport" ref={viewport}>
        <div
          className="level-scene"
          ref={scene}
          style={{ transform: `scale(${scale})` }}
          data-phase={game.phase}
          data-busy={busy}
        >
          <img
            className="level-background"
            src={ART + 'imgBackground.png'}
            alt=""
            draggable={false}
          />
          <img
            className="level-shadow hero-shadow"
            src={ART + 'imgVector1.svg'}
            alt=""
          />
          <img
            className="level-shadow enemy-shadow"
            src={ART + 'imgVector2.svg'}
            alt=""
          />
          <div
            className={`level-actor level-hero pose-${poseFor(s, motion, 'hero')}`}
          >
            <Cutout
              file="imgImage41.png"
              source={[1151, 1367]}
              crop={[186, 39, 805, 1287]}
            />
            {!!heroHit.damage && (
              <span className="level-damage">−{heroHit.damage}</span>
            )}
            {!!heroHit.guard && (
              <span className="level-damage gain">+{heroHit.guard}</span>
            )}
          </div>
          <div
            className={`level-actor level-enemy pose-${poseFor(s, motion, enemy.id)}`}
          >
            <img
              src={ART + 'imgImage125.png'}
              alt="Бумажный враг — Завал отчётов"
              draggable={false}
            />
            {!!enemyHit.damage && (
              <span className="level-damage">−{enemyHit.damage}</span>
            )}
          </div>
          <div className="level-enemy-info">
            <span className="level-enemy-name">{enemy.name}</span>
            <div
              className="level-enemy-health"
              role="progressbar"
              aria-label="Здоровье врага"
              aria-valuenow={enemy.hp}
              aria-valuemin={0}
              aria-valuemax={enemy.maxHp}
            >
              <span style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
              <b>
                {enemy.hp} / {enemy.maxHp}
              </b>
            </div>
            <span className="level-intent">
              {enemy.hp > 0 ? `Следом: ${enemyIntent.text}` : 'Завал разобран'}
            </span>
          </div>
          <div className="level-board-frame">
            <img src={ART + 'imgImage34.png'} alt="" />
          </div>
          <div
            className="level-board"
            role="grid"
            aria-label="Поле 8 на 8. Перетащи фишку, чтобы сдвинуть линию"
            aria-rowcount={8}
            aria-colcount={8}
          >
            {Array.from({ length: 8 }, (_, row) => (
              <div role="row" className="level-board-row" key={row}>
                {board.slice(row * 8, row * 8 + 8).map((tile, col) => {
                  const index = row * 8 + col;
                  return (
                    <div
                      role="gridcell"
                      key={index}
                      aria-selected={index === selected}
                    >
                      <button
                        className={`level-tile ${matched.includes(index) ? 'is-matched' : ''} ${index === selected ? 'is-selected' : ''} ${editing ? 'is-editable' : ''}`}
                        disabled={blocked}
                        aria-label={`${row + 1}:${col + 1} — ${LEVEL_FAMILY_NAMES[tile.family]}`}
                        data-family={tile.family}
                        onPointerDown={(e) => {
                          if (blocked || e.button !== 0 || gesture.current)
                            return;
                          setSelected(index);
                          if (editing) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          gesture.current = {
                            pointerId: e.pointerId,
                            x: e.clientX,
                            y: e.clientY,
                            index,
                          };
                        }}
                        onPointerMove={updateGesture}
                        onPointerUp={release}
                        onPointerCancel={cancel}
                        onLostPointerCapture={cancel}
                        onClick={() => {
                          setSelected(index);
                          if (editing)
                            void play({
                              type: 'skill',
                              id: 'edit',
                              index,
                              family: editFamily,
                            });
                        }}
                        onKeyDown={(e) => {
                          if (blocked || editing || !e.key.startsWith('Arrow'))
                            return;
                          e.preventDefault();
                          setSelected(index);
                          const h =
                            e.key === 'ArrowLeft' || e.key === 'ArrowRight';
                          void play({
                            type: 'shift',
                            axis: h ? 'row' : 'col',
                            line: h ? row : col,
                            amount:
                              e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                                ? -1
                                : 1,
                          });
                        }}
                      >
                        <FigmaTile family={tile.family} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {selected !== null && !preview && !editing && !blocked && (
            <div
              className="level-tap-controls"
              aria-label="Сдвинуть выбранную линию"
            >
              {['←', '→', '↑', '↓'].map((arrow, i) => (
                <button
                  key={arrow}
                  aria-label={`Сдвиг ${['влево', 'вправо', 'вверх', 'вниз'][i]}`}
                  onClick={() =>
                    void play({
                      type: 'shift',
                      axis: i < 2 ? 'row' : 'col',
                      line: i < 2 ? Math.floor(selected / 8) : selected % 8,
                      amount: i % 2 === 0 ? -1 : 1,
                    })
                  }
                >
                  {arrow}
                </button>
              ))}
            </div>
          )}
          <HeroHUD hp={s.hp} maxHp={s.maxHp} energy={s.energy} />
          <div className="level-hero-buffs">
            <span>
              Защита <b>{s.block}</b>
            </span>
            <span>
              Фокус <b>{s.focus}</b>
            </span>
          </div>
          <div className="level-round">
            <img src={ART + 'imgSubtract.png'} alt="" />
            <span>Раунд {s.round}</span>
          </div>
          <img
            className="level-enemy-token"
            src={ART + 'imgImage126.png'}
            alt=""
          />
          <div className="level-top-controls">
            <button onClick={() => setHelp(true)} disabled={busy}>
              Как играть <kbd>H</kbd>
            </button>
            <button onClick={openMenu} disabled={busy}>
              Меню <kbd>Esc</kbd>
            </button>
          </div>
          <div
            className="level-foreground level-foreground-left"
            aria-hidden="true"
          >
            <Cutout
              file="imgForeground.png"
              source={[1672, 941]}
              crop={[0, 247, 760, 694]}
            />
          </div>
          <div
            className="level-foreground level-foreground-right"
            aria-hidden="true"
          >
            <Cutout
              file="imgForeground1.png"
              source={[1672, 941]}
              crop={[1079, 385, 593, 556]}
            />
          </div>
          <div
            className={`level-feedback ${preview ? 'is-preview' : ''}`}
            role="status"
            aria-live="polite"
          >
            {moveText || status}
          </div>
          {editing && (
            <div
              className="level-edit-picker"
              role="group"
              aria-label="Символ для правки"
            >
              {FAMILIES.map((family) => (
                <button
                  key={family}
                  aria-pressed={family === editFamily}
                  aria-label={LEVEL_FAMILY_NAMES[family]}
                  onClick={() => setEditFamily(family)}
                >
                  <FigmaTile family={family} />
                </button>
              ))}
              <button
                className="level-edit-cancel"
                onClick={() => setEditing(false)}
              >
                Отмена
              </button>
            </div>
          )}
          <div className="level-actionbar" aria-label="Действия героя">
            <Cutout
              file="imgImage39.png"
              source={[2172, 724]}
              crop={[1, 195, 2170, 314]}
            />
            <span className="level-actions-label">Действия</span>
            <div
              className="level-action-pips"
              role="meter"
              aria-label="Оставшиеся действия"
              aria-valuenow={actionLeft(s)}
              aria-valuemin={0}
              aria-valuemax={LEVEL_ACTIONS}
            >
              {Array.from({ length: LEVEL_ACTIONS }, (_, i) => (
                <Cutout
                  key={i}
                  className={i >= actionLeft(s) ? 'empty-resource' : ''}
                  file="imgImage39.png"
                  source={[2172, 724]}
                  crop={[141, 353, 72, 100]}
                />
              ))}
            </div>
            {ABILITIES.map((a, i) => (
              <button
                key={a.id}
                className={`level-ability ${!canCast(s, a.id) ? 'unavailable' : ''} ${a.id === 'edit' && editing ? 'armed' : ''}`}
                style={{ left: 265 + i * 90.4 }}
                aria-label={`${i + 1}. ${a.name}. ${a.cost}. ${a.text}`}
                aria-disabled={blocked || !canCast(s, a.id)}
                disabled={blocked}
                onClick={() => activateSkill(i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
              >
                <Cutout
                  file="imgImage39.png"
                  source={[2172, 724]}
                  crop={[a.x, 254, 180, 235]}
                />
              </button>
            ))}
            <button
              className="level-end-turn"
              disabled={blocked}
              onClick={() => void play({ type: 'end' })}
              aria-label="Завершить ход"
            >
              Завершить ход <kbd>Y</kbd>
            </button>
          </div>
          {info && !menu && !help && (
            <div className="level-ability-tooltip" role="tooltip">
              <strong>{info.name}</strong>
              <span>{info.text}</span>
              <small>{info.cost}</small>
            </div>
          )}
          {game.phase !== 'battle' && !busy && (
            <div className="level-outcome">
              <section>
                <span className="level-eyebrow">Архив · Кабинет 01</span>
                <h1>
                  {game.phase === 'victory'
                    ? 'Завал разобран!'
                    : 'Рабочий день начинается снова'}
                </h1>
                <p>
                  {game.phase === 'victory'
                    ? 'За бумагами оказалась ещё одна дверь. Но это история следующего уровня.'
                    : 'Последний отчёт всё ещё лежит на столе. В этот раз попробуй запасти больше защиты.'}
                </p>
                <p className="level-result-numbers">
                  Ходов: {game.round} · Урон: {game.stats.damage} · Комбинаций:{' '}
                  {game.stats.matches}
                </p>
                <button onClick={restart}>Попробовать ещё раз</button>
              </section>
            </div>
          )}
        </div>
      </div>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent className="level-dialog">
          <DialogTitle>Рабочая пауза</DialogTitle>
          <DialogDescription>Архив · Первый кабинет</DialogDescription>
          <button
            className="level-dialog-primary"
            onClick={() => setMenu(false)}
          >
            Продолжить бой
          </button>
          <label className="level-parallax-setting">
            Параллакс переднего плана{' '}
            <output>{parallax === 0 ? 'Выкл.' : `${parallax} px`}</output>
            <input
              type="range"
              min={0}
              max={18}
              value={parallax}
              onChange={(e) => changeParallax(Number(e.target.value))}
            />
          </label>
          {reduced && <p>Движение отключено системной настройкой.</p>}
          <button
            onClick={() => {
              setMenu(false);
              setHelp(true);
            }}
          >
            Как играть
          </button>
          <button onClick={restart}>Начать уровень заново</button>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="level-dialog">
          <DialogTitle>Разбери завал отчётов</DialogTitle>
          <DialogDescription>
            Пять действий на ход. Трать их на короткие сдвиги, один длинный
            сдвиг или способности.
          </DialogDescription>
          <p>
            Перетащи фишку: вся строка или столбец сдвинется. Отпусти — действие
            сработает сразу. Перед отпусканием видно стоимость и результат.
          </p>
          <div className="level-help-families">
            {FAMILIES.map((family, i) => (
              <div key={family}>
                <FigmaTile family={family} />
                <span>
                  <b>{LEVEL_FAMILY_NAMES[family]}</b>
                  {
                    [
                      'Наносит урон',
                      'Поглощает удар врага',
                      'Питает способности',
                      'Для точного удара и правки',
                    ][i]
                  }
                </span>
              </div>
            ))}
          </div>
          <p>
            Собери от трёх одинаковых. После <b>«Завершить ход»</b> противник
            атакует, а действия восстановятся. Защита действует до ответа врага.
          </p>
          <p>
            <b>Мышь / касание:</b> перетаскивание или фишка + стрелка.{' '}
            <b>Клавиатура:</b> Tab до фишки, стрелки — сдвиг; 1–5 — способности,
            Y — конец хода, Esc — меню.
          </p>
          <button
            className="level-dialog-primary"
            onClick={() => setHelp(false)}
          >
            Всё понятно
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

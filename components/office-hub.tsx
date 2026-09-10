/* eslint-disable react/react-compiler, nextjs/no-img-element -- RAF movement is isolated from seeded combat. Native image crops preserve source pixels. */
'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  Menu,
  MessageCircle,
  Footprints,
  BookOpen,
} from 'lucide-react';
import { PalaceActorArt } from './palace-actor-art';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { RunRecap } from './run-journal';
import type { State } from '@/game/engine';
import {
  OFFICE_TARGETS,
  nearestTarget,
  officeWaypoints,
  openingLines,
  officeDialogue,
  stepOffice,
  walkable,
  type OfficeMemory,
  type OfficeTarget,
  type Point,
} from '@/game/office';
import officeArt from '@/game/office-art.json';
import { ROOM_BACKGROUNDS } from '@/game/visual-style';

export function OfficeSprite({ kind }: { kind: 'vera' | 'lev' | 'top' }) {
  const id = useId().replace(/:/g, '');
  const art = officeArt[kind];
  return (
    <svg
      className={`office-sprite office-sprite-${kind}`}
      viewBox={art.crop.join(' ')}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`office-clip-${id}`}>
          <path d={art.clip} />
        </clipPath>
        {kind === 'top' &&
          officeArt.top.clips.map((clip, i) => (
            <clipPath key={i} id={`office-top-${id}-${i}`}>
              <path d={clip} />
            </clipPath>
          ))}
      </defs>
      {kind === 'top' ? (
        officeArt.top.frames.map((crop, i) => (
          <svg
            key={i}
            className={`top-frame top-frame-${i}`}
            x={art.crop[0]}
            y={art.crop[1]}
            width={art.crop[2]}
            height={art.crop[3]}
            viewBox={crop.join(' ')}
          >
            <image
              href={art.src}
              width={art.width}
              height={art.height}
              clipPath={`url(#office-top-${id}-${i})`}
            />
          </svg>
        ))
      ) : (
        <image
          href={art.src}
          width={art.width}
          height={art.height}
          clipPath={`url(#office-clip-${id})`}
        />
      )}
    </svg>
  );
}

export function GameMenu({
  resumable,
  inRun,
  ready,
  onContinue,
  onOffice,
  onSettings,
  onJournal,
  onHelp,
}: {
  resumable: boolean;
  inRun: boolean;
  ready: boolean;
  onContinue: () => void;
  onOffice: () => void;
  onSettings: () => void;
  onJournal: () => void;
  onHelp: () => void;
}) {
  return (
    <main className="office-menu" aria-labelledby="menu-title">
      <img
        className="office-menu-backdrop"
        src={officeArt.background.src}
        alt="Пустой офис. За дверью босса ждут неизвестные комнаты."
      />
      <div className="office-menu-note">
        <p className="office-kicker">ЛИЧНОЕ ДЕЛО № 0001</p>
        <h1 id="menu-title">Осколки</h1>
        <p className="office-menu-subtitle">Дворец слов</p>
        <div className="office-menu-rule" />
        <p className="office-menu-story">Рабочий день ещё не закончился.</p>
        <nav aria-label="Главное меню">
          <Button
            disabled={!ready}
            className="office-primary"
            onClick={onContinue}
          >
            {!ready
              ? 'Открываем личное дело…'
              : inRun
                ? 'Продолжить спуск'
                : resumable
                  ? 'Вернуться в офис'
                  : 'Приступить к работе'}{' '}
            <ArrowRight />
          </Button>
          {inRun && (
            <Button variant="outline" onClick={onOffice}>
              Новый рабочий день
            </Button>
          )}
          <Button variant="outline" onClick={onSettings}>
            Настройки
          </Button>
          <Button variant="outline" onClick={onJournal}>
            Открытия и история
          </Button>
          <Button variant="outline" onClick={onHelp}>
            Как играть
          </Button>
        </nav>
        <p className="office-menu-footnote">
          {inRun
            ? 'Твой спуск сохранён. Можно продолжить с того же места.'
            : 'Понедельник · 18:00'}
        </p>
      </div>
      <div className="office-menu-totem">
        <OfficeSprite kind="top" />
        <span>Она всё ещё крутится.</span>
      </div>
    </main>
  );
}

export function OfficeHub({
  office,
  onChange,
  onDepart,
  onMenu,
  blocked,
  lastRun,
}: {
  office: OfficeMemory;
  onChange: (o: OfficeMemory) => void;
  onDepart: () => void;
  onMenu: () => void;
  blocked: boolean;
  lastRun: State | null;
}) {
  const [position, setPosition] = useState(office.position);
  const positionRef = useRef(position);
  const keys = useRef(new Set<string>());
  const path = useRef<Point[]>([]);
  const pending = useRef<OfficeTarget | null>(null);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState(1);
  const [conversation, setConversation] = useState<
    OfficeTarget | 'opening' | null
  >(
    !office.introduced ||
      (lastRun?.phase === 'defeat' &&
        office.lastWakeRunId === lastRun.runId &&
        office.wakeAcknowledged !== lastRun.runId)
      ? 'opening'
      : null,
  );
  const [topic, setTopic] = useState<number | null>(null);
  const [line, setLine] = useState(0);
  const [recap, setRecap] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const nearest = nearestTarget(position);
  const interactionRef = useRef<(id: OfficeTarget) => void>(() => {});
  const stopped = blocked || !!conversation || recap;
  const stopRef = useRef(stopped);
  stopRef.current = stopped;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const officeRef = useRef(office);
  officeRef.current = office;
  const persistPosition = () =>
    changeRef.current({ ...officeRef.current, position: positionRef.current });
  const interact = (id: OfficeTarget) => {
    if (stopRef.current) return;
    keys.current.clear();
    path.current = [];
    pending.current = null;
    setMoving(false);
    persistPosition();
    setConversation(id);
    setTopic(null);
    setLine(0);
  };
  interactionRef.current = interact;
  const goTo = (id: OfficeTarget) => {
    if (stopped) return;
    keys.current.clear();
    pending.current = id;
    path.current = officeWaypoints(
      positionRef.current,
      OFFICE_TARGETS.find((t) => t.id === id)!.point,
    );
    stage.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    let frame = 0,
      previous = performance.now(),
      wasMoving = false;
    const animate = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (!stopRef.current && !document.hidden) {
        let dx =
          Number(keys.current.has('ArrowRight') || keys.current.has('KeyD')) -
          Number(keys.current.has('ArrowLeft') || keys.current.has('KeyA'));
        let dy =
          Number(keys.current.has('ArrowDown') || keys.current.has('KeyS')) -
          Number(keys.current.has('ArrowUp') || keys.current.has('KeyW'));
        let amount = 205 * dt;
        const waypoint = path.current[0];
        if (!dx && !dy && waypoint) {
          dx = waypoint.x - positionRef.current.x;
          dy = waypoint.y - positionRef.current.y;
          const d = Math.hypot(dx, dy);
          if (d <= amount) {
            path.current.shift();
            amount = d;
          }
        }
        const length = Math.hypot(dx, dy);
        if (length) {
          const next = stepOffice(
            positionRef.current,
            (dx / length) * amount,
            (dy / length) * amount,
          );
          if (dx) setFacing(dx > 0 ? 1 : -1);
          positionRef.current = next;
          setPosition(next);
        }
        const nowMoving = length > 0;
        if (nowMoving !== wasMoving) {
          setMoving(nowMoving);
          if (!nowMoving) persistPosition();
        }
        wasMoving = nowMoving;
        if (!path.current.length && pending.current) {
          const id = pending.current;
          pending.current = null;
          interactionRef.current(id);
        }
      } else if (wasMoving) {
        setMoving(false);
        wasMoving = false;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        stopRef.current ||
        e.defaultPrevented ||
        (e.target as HTMLElement).closest('input,textarea,select')
      )
        return;
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
        path.current = [];
        pending.current = null;
      }
      if (e.code === 'KeyE' && !e.repeat) {
        e.preventDefault();
        const id = nearestTarget(positionRef.current);
        if (id) interactionRef.current(id);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        persistPosition();
        onMenu();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => {
      keys.current.clear();
      path.current = [];
      pending.current = null;
      persistPosition();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [onMenu]);
  useEffect(() => {
    if (stopped) {
      keys.current.clear();
      path.current = [];
      pending.current = null;
    }
  }, [stopped]);
  const closeConversation = () => {
    const next = { ...officeRef.current, position: positionRef.current };
    if (conversation === 'opening') {
      next.introduced = true;
      next.wakeAcknowledged = office.lastWakeRunId;
    } else if (conversation)
      next.talked = [...new Set([...next.talked, conversation])];
    // Discovery happens when the corridor is shown, before choosing to enter.
    if (conversation === 'door' && lastLine) next.discoveredDoor = true;
    onChange(next);
    setConversation(null);
    setLine(0);
    stage.current?.focus({ preventScroll: true });
  };
  const lines =
    conversation === 'opening'
      ? openingLines(office)
      : conversation
        ? officeDialogue(conversation, topic ?? 0, office)
        : [];
  const choosingTopic =
    (conversation === 'vera' || conversation === 'lev') && topic === null;
  const lastLine = line >= lines.length - 1;
  return (
    <main className="office-hub" aria-labelledby="office-title">
      <header className="office-header">
        <div>
          <p className="office-kicker">ОТДЕЛ НЕЗАВЕРШЁННЫХ ДЕЛ</p>
          <h1 id="office-title">Понедельник, снова.</h1>
        </div>
        <div className="office-header-actions">
          <span>18:00</span>
          <Button
            variant="outline"
            onClick={() => {
              persistPosition();
              onMenu();
            }}
          >
            <Menu size={18} /> Меню
          </Button>
        </div>
      </header>
      <div
        ref={stage}
        className="office-stage"
        tabIndex={-1}
        role="application"
        aria-label="Офис. Ходить: WASD или стрелки. Взаимодействовать: E. Можно нажать на коллегу или дверь."
        onPointerDown={(e) => {
          if (stopped || (e.target as HTMLElement).closest('button')) return;
          const r = e.currentTarget.getBoundingClientRect();
          const to = {
            x: ((e.clientX - r.left) / r.width) * 1000,
            y: ((e.clientY - r.top) / r.height) * 600,
          };
          if (walkable(to)) {
            pending.current = null;
            path.current = officeWaypoints(positionRef.current, to);
          }
          stage.current?.focus({ preventScroll: true });
        }}
      >
        <img
          className="office-background"
          src={officeArt.background.src}
          alt="Знакомые столы, картотека и закрытая дверь босса в конце офиса"
          draggable={false}
        />
        <div className="office-colleague office-vera">
          <OfficeSprite kind="vera" />
        </div>
        <div className="office-colleague office-lev">
          <OfficeSprite kind="lev" />
        </div>
        <div className="office-desk-top">
          <OfficeSprite kind="top" />
        </div>
        <div
          className={`office-player ${moving ? 'is-walking' : ''} ${conversation === 'opening' ? 'is-at-desk' : ''}`}
          data-position={`${Math.round(position.x)},${Math.round(position.y)}`}
          style={{ left: `${position.x / 10}%`, top: `${position.y / 6}%` }}
        >
          <div style={{ transform: `scaleX(${facing})` }}>
            <PalaceActorArt hero pose="idle" weaponId={null} unarmed />
          </div>
          <span className="office-player-mark">Ты</span>
        </div>
        {OFFICE_TARGETS.map((t) => (
          <button
            key={t.id}
            disabled={stopped}
            className={`office-hotspot office-hotspot-${t.id} ${nearest === t.id ? 'is-near' : ''}`}
            style={{
              left: `${t.point.x / 10}%`,
              top: `${(t.point.y - 175) / 6}%`,
            }}
            onClick={() => goTo(t.id)}
            aria-label={t.action}
          >
            {t.id === 'door' ? (
              <ArrowRight size={17} />
            ) : t.id === 'desk' ? (
              <BookOpen size={17} />
            ) : (
              <MessageCircle size={17} />
            )}
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      <footer className="office-controls">
        <p>
          <Footprints size={18} /> WASD / стрелки — ходить <span>·</span> E —
          говорить / осмотреть
        </p>
        <Button
          disabled={!nearest || stopped}
          className="office-primary"
          onClick={() => nearest && interact(nearest)}
        >
          {nearest
            ? OFFICE_TARGETS.find((t) => t.id === nearest)!.action
            : 'Подойди поближе'}{' '}
          <ArrowRight size={16} />
        </Button>
      </footer>
      <div className="office-task-note">
        <span>
          {office.discoveredDoor
            ? 'Не всё вернулось на свои места.'
            : 'Последняя строка отчёта подождёт.'}
        </span>
        <p>
          {office.discoveredDoor
            ? 'Поговори с коллегами или снова пройди через дверь босса.'
            : 'Осмотрись, поговори с коллегами и загляни к боссу.'}
        </p>
        {lastRun && ['defeat', 'victory'].includes(lastRun.phase) && (
          <Button variant="outline" onClick={() => setRecap(true)}>
            Вспомнить прошлый спуск
          </Button>
        )}
      </div>
      <Dialog
        open={!!conversation}
        onOpenChange={(v) => !v && closeConversation()}
      >
        <DialogContent className="game-dialog office-dialog">
          <DialogTitle>
            {choosingTopic
              ? conversation === 'vera'
                ? 'Вера · отдел сверки'
                : 'Лев · архив'
              : lines[line]?.speaker}
          </DialogTitle>
          <DialogDescription>
            {choosingTopic
              ? 'Коллега на минуту отрывается от работы.'
              : lines[line]?.text}
          </DialogDescription>
          {conversation === 'door' && (line > 0 || office.discoveredDoor) && (
            <div
              className="office-corridor-reveal"
              aria-label="За кабинетом — череда неизвестных комнат"
            >
              {ROOM_BACKGROUNDS.slice(0, 3).map((r, i) => (
                <div key={r.id}>
                  <img src={r.src} alt="Неизвестная комната" />
                  <span>{i === 2 ? '…' : '?'}</span>
                </div>
              ))}
            </div>
          )}
          {conversation === 'opening' || conversation === 'desk' ? (
            <div className="office-dialog-totem">
              <OfficeSprite kind="top" />
            </div>
          ) : null}
          {choosingTopic ? (
            <div className="office-dialog-choices">
              <Button variant="outline" onClick={() => setTopic(0)}>
                {conversation === 'vera'
                  ? office.awakenings
                    ? 'Я опять проснулся здесь.'
                    : 'Мы давно здесь работаем?'
                  : 'Где выход?'}
              </Button>
              <Button variant="outline" onClick={() => setTopic(1)}>
                {conversation === 'vera'
                  ? 'Что за дверью босса?'
                  : 'Расскажи о комнатах.'}
              </Button>
              <Button variant="ghost" onClick={closeConversation}>
                Поговорим позже
              </Button>
            </div>
          ) : (
            <div className="office-dialog-choices">
              {!lastLine ? (
                <Button
                  onClick={() =>
                    setLine((i) => Math.min(i + 1, lines.length - 1))
                  }
                >
                  Дальше <ArrowRight />
                </Button>
              ) : conversation === 'door' ? (
                <>
                  <Button
                    className="office-primary"
                    onClick={() => {
                      closeConversation();
                      onDepart();
                    }}
                  >
                    Пройти за дверь <ArrowRight />
                  </Button>
                  <Button variant="outline" onClick={closeConversation}>
                    Сначала вернуться к коллегам
                  </Button>
                </>
              ) : (
                <Button onClick={closeConversation}>
                  {conversation === 'opening'
                    ? 'Встать из-за стола'
                    : 'Вернуться в офис'}
                </Button>
              )}
              <span className="office-dialog-page">
                {line + 1} / {lines.length}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={recap} onOpenChange={setRecap}>
        <DialogContent className="game-dialog">
          <DialogTitle>То, что ты помнишь</DialogTitle>
          <DialogDescription>
            На столе всё как прежде. Опыт прошлого спуска остался с тобой.
          </DialogDescription>
          {lastRun && <RunRecap game={lastRun} />}
          <Button onClick={() => setRecap(false)}>Закрыть</Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

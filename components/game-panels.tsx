'use client';
import { useState } from 'react';
import {
  Gem,
  Shield,
  Sword,
  Zap,
  Sparkles,
  Skull,
  Bomb,
  ArrowRight,
  ArrowLeft,
  Coins,
  Flame,
  Footprints,
  Crown,
  Timer,
  Gift,
  Heart,
  FlaskConical,
  Check,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react';
import { useVisualStyle, StylePicker } from '@/components/visual-style';
import { SkinIcon, type SkinIconName } from '@/components/skin-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  ACHIEVEMENTS,
  itemById,
  nextRooms,
  chooseReward,
  enterRoom,
  buy,
  leaveRoom,
  rest,
  eventChoice,
  pauseTrial,
  upgradeOptions,
  DEFAULT_BALANCE,
  type State,
  type Meta,
  type Result,
  type Offer,
  type Balance,
} from '@/game/engine';
export const RoomIcon = ({ kind }: { kind: string }) => {
  const illustrated = useVisualStyle() !== 'crypt';
  const Icon =
    (
      {
        battle: Sword,
        elite: Skull,
        event: Gift,
        trial: Timer,
        shop: Coins,
        rest: Flame,
        boss: Crown,
      } as Record<string, typeof Sword>
    )[kind] ?? Footprints;
  if (illustrated)
    return (
      <SkinIcon
        name={
          (
            {
              battle: 'blade',
              elite: 'crown',
              event: 'relic',
              trial: 'spark',
              shop: 'coin',
              rest: 'heart',
              boss: 'crown',
            } as Record<string, SkinIconName>
          )[kind] ?? 'star'
        }
        size={34}
      />
    );
  return <Icon size={27} strokeWidth={1.5} />;
};
export const ItemIcon = ({ id }: { id: string }) => {
  const illustrated = useVisualStyle() !== 'crypt';
  const Icon =
    (
      {
        thorns: Shield,
        coil: Zap,
        return: RotateCcw,
        toxin: Skull,
        heart: Heart,
        prism: Gem,
        conductor: Zap,
        order: Sparkles,
        lens: Heart,
        vessel: FlaskConical,
        lamp: Flame,
        thread: Sparkles,
        venom: Skull,
        bomb: Bomb,
        bolt: Zap,
        guard: Shield,
        pierce: Sword,
        blood: Sword,
        seal: Flame,
        reshape: Sparkles,
        potion: FlaskConical,
      } as Record<string, typeof Sword>
    )[id] ?? Gem;
  if (illustrated)
    return (
      <SkinIcon
        name={
          (
            {
              thorns: 'shield',
              coil: 'spark',
              return: 'shield',
              toxin: 'venom',
              heart: 'heart',
              prism: 'focus',
              conductor: 'spark',
              order: 'focus',
              lens: 'heart',
              vessel: 'potion',
              lamp: 'spark',
              thread: 'relic',
              venom: 'venom',
              bomb: 'bomb',
              bolt: 'spark',
              guard: 'shield',
              pierce: 'blade',
              blood: 'blade',
              seal: 'spark',
              reshape: 'focus',
              potion: 'potion',
            } as Record<string, SkinIconName>
          )[id] ?? 'relic'
        }
        size={34}
      />
    );
  return <Icon size={27} strokeWidth={1.5} />;
};
export function RunPanel({
  game: s,
  meta,
  busy,
  act,
  restart,
}: {
  game: State;
  meta: Meta;
  busy: boolean;
  act: (r: Result) => Promise<void>;
  restart: () => void;
}) {
  const illustrated = useVisualStyle() !== 'crypt';
  const [pending, setPending] = useState<Offer | null>(null);
  const open =
    !['battle', 'trial'].includes(s.phase) ||
    (s.phase === 'trial' && !!s.trial?.paused);
  const select = (o: Offer) => {
    if (
      (o.kind === 'skill' && s.skills.length >= 2) ||
      (o.kind === 'modifier' && s.modifiers.length >= 2)
    ) {
      setPending(o);
      return;
    }
    void act(s.phase === 'shop' ? buy(s, o.id) : chooseReward(s, o.id));
  };
  const replace = (slot: number) => {
    if (!pending) return;
    void act(
      s.phase === 'shop'
        ? buy(s, pending.id, slot)
        : chooseReward(s, pending.id, slot),
    );
    setPending(null);
  };
  const heading = pending
    ? 'Что заменить?'
    : (
        {
          reward: 'Выбери находку',
          map: 'Куда дальше?',
          shop: 'Торговец у переправы',
          rest: 'У тлеющего костра',
          event: s.room === 3 ? 'Забытый алтарь' : 'Тайник странника',
          trial:
            s.trial?.remaining === 45
              ? 'Закрывающийся шлюз'
              : 'Испытание на паузе',
          victory: 'Крипта пройдена',
          defeat: 'Твой путь оборвался',
        } as Record<string, string>
      )[s.phase];
  const description = pending
    ? `${pending.name}. ${pending.description}`
    : (
        {
          reward: 'Одна вещь останется с тобой до конца забега.',
          map: `Комната ${s.room + 1} из 10. Выбирай риск, который готов принять.`,
          shop: `У тебя ${s.gold} золота. Ассортимент не обновляется.`,
          rest: 'Выбери восстановление здоровья или усиление поля.',
          event:
            s.room === 3
              ? 'Камень просит немного крови. В нише мерцает находка.'
              : 'Кто-то оставил здесь припасы и старый сундук.',
          trial:
            'Собери 18 энергии из совпадений и нанеси 30 урона преграде. Таймер — 45 секунд.',
          victory:
            'Привратник пал. Найденные открытия доступны в следующем забеге.',
          defeat:
            'Находки потеряны, открытия остаются. Попробуй другое сочетание.',
        } as Record<string, string>
      )[s.phase];
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className={`game-dialog run-dialog ${s.phase === 'victory' ? 'victory-dialog' : ''}`}
      >
        <div className="panel-emblem">
          {pending ? (
            <ItemIcon id={pending.id} />
          ) : (
            <RoomIcon
              kind={
                s.phase === 'victory'
                  ? 'boss'
                  : s.phase === 'defeat'
                    ? 'elite'
                    : s.phase === 'reward'
                      ? 'event'
                      : s.phase
              }
            />
          )}
        </div>
        <span className="eyebrow">
          {s.phase === 'victory'
            ? 'ПЕРВЫЙ СПУСК ЗАВЕРШЁН'
            : s.phase === 'defeat'
              ? `КОМНАТА ${s.room} · ХОД ${s.round}`
              : 'ОСКОЛКИ · КРИПТА'}
        </span>
        <DialogTitle>{heading}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {pending ? (
          <>
            <div className="replacement-list">
              {(pending.kind === 'skill' ? s.skills : s.modifiers).map(
                (id, i) => (
                  <Button
                    className="replace-card"
                    variant="outline"
                    key={id}
                    onClick={() => replace(i)}
                    disabled={busy}
                  >
                    <ItemIcon id={id} />
                    <span>
                      <strong>{itemById(id)?.name}</strong>
                      <small>{itemById(id)?.description}</small>
                    </span>
                    <ArrowRight />
                  </Button>
                ),
              )}
            </div>
            <Button variant="ghost" onClick={() => setPending(null)}>
              <ArrowLeft />
              Вернуться к находкам
            </Button>
          </>
        ) : (
          <>
            {(s.phase === 'reward' || s.phase === 'shop') && (
              <div
                className={`offer-grid ${s.phase === 'shop' ? 'shop-grid' : ''}`}
              >
                {s.offers.map((o) => (
                  <button
                    key={o.id}
                    className={`offer-card ${o.kind === 'modifier' ? 'modifier-offer' : ''}`}
                    onClick={() => select(o)}
                    disabled={
                      busy ||
                      (s.phase === 'shop' && s.gold < (o.cost ?? 0)) ||
                      (o.kind === 'potion' && s.potions >= 2)
                    }
                  >
                    <span className="offer-icon">
                      <ItemIcon id={o.id} />
                    </span>
                    <span className="offer-kind">
                      {o.kind === 'relic'
                        ? 'РЕЛИКВИЯ'
                        : o.kind === 'modifier'
                          ? 'ФИШКИ'
                          : o.kind === 'skill'
                            ? 'ПРИЁМ'
                            : o.kind === 'upgrade'
                              ? 'УЛУЧШЕНИЕ'
                              : 'ЗЕЛЬЕ'}
                    </span>
                    <strong>{o.name}</strong>
                    <p>{o.description}</p>
                    <span className="offer-tag">
                      {o.cost ? (
                        <>
                          <>
                            {illustrated ? (
                              <SkinIcon name="coin" size={22} />
                            ) : (
                              <Coins size={14} />
                            )}
                          </>
                          {o.cost}
                        </>
                      ) : (
                        o.tag
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {s.phase === 'reward' && (
              <Button
                variant="ghost"
                onClick={() => void act(chooseReward(s, null))}
              >
                Пропустить находку <ArrowRight />
              </Button>
            )}
            {s.phase === 'shop' && (
              <Button
                className="panel-main-action"
                onClick={() => void act(leaveRoom(s))}
              >
                Продолжить путь <ArrowRight />
              </Button>
            )}
            {s.phase === 'map' && (
              <div className="route-options">
                {nextRooms(s).map((r) => (
                  <button
                    key={r.id}
                    className={`route-card route-${r.kind}`}
                    disabled={busy}
                    onClick={() => void act(enterRoom(s, r.id))}
                  >
                    <span className="route-symbol">
                      <RoomIcon kind={r.kind} />
                    </span>
                    <div>
                      <strong>{r.name}</strong>
                      <p>{r.description}</p>
                    </div>
                    <ArrowRight size={19} />
                  </button>
                ))}
              </div>
            )}
            {s.phase === 'rest' && (
              <>
                <Button
                  className="rest-heal"
                  variant="outline"
                  onClick={() => void act(rest(s, 'heal'))}
                >
                  {illustrated ? (
                    <SkinIcon name="heart" size={40} />
                  ) : (
                    <Heart />
                  )}
                  <span>
                    <strong>Перевести дух</strong>
                    <small>
                      Восстановить до {Math.ceil(s.maxHp * 0.25)} здоровья ·
                      сейчас {s.hp}/{s.maxHp}
                    </small>
                  </span>
                </Button>
                <span className="choice-divider">ИЛИ УЛУЧШИТЬ ПОЛЕ</span>
                <div className="upgrade-grid">
                  {upgradeOptions(s).map((o) => (
                    <Button
                      variant="outline"
                      key={o.id}
                      onClick={() => void act(rest(s, o.id))}
                    >
                      <span>
                        <strong>{o.name}</strong>
                        <small>{o.description}</small>
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            )}
            {s.phase === 'event' && (
              <div className="route-options">
                <button
                  className="route-card"
                  disabled={s.hp <= 5}
                  onClick={() => void act(eventChoice(s, 'relic'))}
                >
                  {illustrated ? <SkinIcon name="relic" size={44} /> : <Gem />}
                  <div>
                    <strong>Открыть тайник</strong>
                    <p>Потерять 5 здоровья и выбрать сильную находку.</p>
                  </div>
                  <ArrowRight />
                </button>
                <button
                  className="route-card"
                  onClick={() => void act(eventChoice(s, 'supplies'))}
                >
                  {illustrated ? (
                    <SkinIcon name="potion" size={44} />
                  ) : (
                    <FlaskConical />
                  )}
                  <div>
                    <strong>Забрать припасы</strong>
                    <p>Восстановить 5 здоровья и получить 10 золота.</p>
                  </div>
                  <ArrowRight />
                </button>
              </div>
            )}
            {s.phase === 'trial' && (
              <>
                <div className="trial-brief">
                  <div>
                    {illustrated ? (
                      <SkinIcon name="spark" size={40} />
                    ) : (
                      <Zap />
                    )}
                    <strong>{s.trial?.energy ?? 0} / 18</strong>
                    <span>Энергия механизма</span>
                  </div>
                  <div>
                    {illustrated ? (
                      <SkinIcon name="blade" size={40} />
                    ) : (
                      <Sword />
                    )}
                    <strong>{s.trial?.damage ?? 0} / 30</strong>
                    <span>Разрушить преграду</span>
                  </div>
                  <div>
                    <Timer />
                    <strong>{Math.ceil(s.trial?.remaining ?? 0)} сек.</strong>
                    <span>Время на поле</span>
                  </div>
                </div>
                <p className="panel-note">
                  Щиты уменьшают ущерб при провале. Автоматические каскады не
                  отнимают время. При провале останется минимум 1 здоровье.
                </p>
                <Button
                  className="panel-main-action"
                  onClick={() => void act(pauseTrial(s, false))}
                >
                  {s.trial?.remaining === 45 ? 'Открыть шлюз' : 'Продолжить'}{' '}
                  <ArrowRight />
                </Button>
              </>
            )}
            {['victory', 'defeat'].includes(s.phase) && (
              <>
                <div className="end-stats">
                  <div>
                    <strong>{s.room}/10</strong>
                    <span>Комнат</span>
                  </div>
                  <div>
                    <strong>{s.stats.damage}</strong>
                    <span>Урона</span>
                  </div>
                  <div>
                    <strong>{s.stats.cascades}</strong>
                    <span>Каскадов</span>
                  </div>
                  <div>
                    <strong>{s.relics.length}</strong>
                    <span>Реликвий</span>
                  </div>
                </div>
                <p className="panel-note">
                  {s.modified
                    ? 'Проверка баланса: серия и открытия не изменились.'
                    : `Открыто ${meta.unlocked.length} из 10 реликвий. Серия побед: ${meta.streak}. Лучшая: ${meta.best}.`}
                </p>
                <Button className="panel-main-action" onClick={restart}>
                  Новый спуск <RotateCcw />
                </Button>
              </>
            )}
          </>
        )}
        <div className="panel-appearance">
          <StylePicker compact disabled={busy} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function Discoveries({
  open,
  onClose,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  meta: Meta;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="game-dialog discovery-dialog">
        <DialogTitle>Открытия</DialogTitle>
        <DialogDescription>
          {meta.unlocked.length} / 10. Каждое достижение добавляет реликвию в
          следующие забеги.
        </DialogDescription>
        <div className="discovery-list">
          {ACHIEVEMENTS.map((a) => {
            const done = meta.unlocked.includes(a.id);
            return (
              <div key={a.id} className={done ? 'unlocked' : ''}>
                <span className="discovery-icon">
                  {done ? <Check size={20} /> : <LockKeyhole size={18} />}
                </span>
                <div>
                  <strong>{a.name}</strong>
                  <p>{a.description}</p>
                  <small>
                    {done ? 'Открыто' : 'Награда'}: {itemById(a.reward)?.name}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
export type Preset = 'normal' | 'shields' | 'poison' | 'cascades';
export function SettingsPanel({
  open,
  onClose,
  balance,
  onAnimation,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  balance: Balance;
  onAnimation: (ms: number) => void;
  onStart: (b: Balance, p: Preset, seed?: number) => void;
}) {
  const [settings, setSettings] = useState(balance);
  const [preset, setPreset] = useState<Preset>('normal');
  const [seed, setSeed] = useState('');
  const [copied, setCopied] = useState(false);
  const sliders: [keyof Balance, string, number, number, number][] = [
    ['health', 'Здоровье героя', 20, 80, 5],
    ['blade', 'Урон одной фишки', 1, 5, 1],
    ['shield', 'Блок одной фишки', 1, 5, 1],
    ['enemyPower', 'Сила врагов', 0.5, 2, 0.1],
    ['animation', 'Длительность анимации, мс', 60, 600, 20],
  ];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="game-dialog settings-dialog">
        <DialogTitle>Настройки</DialogTitle>
        <DialogDescription>
          Оформление и анимация меняются сразу. Остальные параметры применяются
          в новом забеге.
        </DialogDescription>
        <StylePicker compact />
        <div className="settings-controls">
          {sliders.map(([key, label, min, max, step]) => (
            <div key={key} className="setting-row">
              <span>
                {label}
                <b>{settings[key]}</b>
              </span>
              <Slider
                aria-label={label}
                value={[settings[key]]}
                min={min}
                max={max}
                step={step}
                onValueChange={(v) => {
                  const n = (v as number[])[0];
                  setSettings((p) => ({ ...p, [key]: n }));
                  if (key === 'animation') onAnimation(n);
                }}
              />
            </div>
          ))}
        </div>
        <span className="eyebrow">СТАРТОВАЯ СБОРКА</span>
        <div className="preset-options">
          {(['normal', 'shields', 'poison', 'cascades'] as Preset[]).map(
            (p) => (
              <Button
                variant="outline"
                key={p}
                aria-pressed={preset === p}
                onClick={() => setPreset(p)}
              >
                {
                  {
                    normal: 'Обычная',
                    shields: 'Щиты',
                    poison: 'Яд',
                    cascades: 'Каскады',
                  }[p]
                }
              </Button>
            ),
          )}
        </div>
        <label className="seed-control" htmlFor="run-seed">
          Номер поля для повтора{' '}
          <Input
            id="run-seed"
            value={seed}
            onChange={(e) =>
              setSeed(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))
            }
            placeholder="Случайное поле"
            inputMode="numeric"
          />
        </label>
        <p className="panel-note">
          Забеги с изменённым балансом, готовой сборкой или заданным номером не
          влияют на открытия и серию побед. Текущий незавершённый забег
          закончится.
        </p>
        <div className="settings-actions">
          <Button
            className="panel-main-action"
            onClick={() => {
              onStart(settings, preset, seed ? Number(seed) : undefined);
              onClose();
            }}
          >
            Начать с этими настройками <ArrowRight />
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSettings({ ...DEFAULT_BALANCE });
              setPreset('normal');
              setSeed('');
              onAnimation(DEFAULT_BALANCE.animation);
            }}
          >
            Сбросить
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(
                    { ...settings, preset, seed: seed || 'random' },
                    null,
                    2,
                  ),
                );
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Скопировано' : 'Скопировать настройки'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* eslint-disable nextjs/no-img-element -- Room artwork keeps its original native pixels. */
'use client';
import { ReplayRelicArt } from '@/components/replay-relic-art';
import { ProgressionGoals } from '@/components/progression';
import { RunRecap, RunJournal } from '@/components/run-journal';
import { useState } from 'react';
import { RewardActions, SealConfirmation } from '@/components/journey-rewards';
import { ArchiveEntrance } from '@/components/archive-mechanics';
import { biomeAt, TOTAL_ROOMS } from '@/game/engine';
import { RoomIcon } from '@/components/room-icon';
import { RunSeed } from '@/components/run-seed';
import { JourneyMap, NextStops } from '@/components/journey-map';
import { Merchant, ShopPrice } from '@/components/merchant';
import { merchantGreeting, merchantPurchase } from '@/game/merchant';
import { roomBackground } from '@/game/visual-style';
import { isValidSeed } from '@/game/seed';
import {
  ArrowRight,
  ArrowLeft,
  Timer,
  Check,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react';
import { SkinIcon, type SkinIconName } from '@/components/skin-icon';
import { EquipmentIcon, EquipmentComparison } from '@/components/equipment';
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
  HEROES,
  CHALLENGES,
  type ChallengeId,
  canEnterForbidden,
  canTradeRelic,
  type HeroId,
  equipmentById,
  EQUIPMENT_SLOT_NAMES,
  itemById,
  itemForRun,
  offerForRun,
  chooseReward,
  enterRoom,
  buy,
  leaveRoom,
  rest,
  eventChoice,
  pauseTrial,
  restOptions,
  DEFAULT_BALANCE,
  type State,
  type Meta,
  type Result,
  type Offer,
  type Balance,
} from '@/game/engine';
export const ItemIcon = ({ id }: { id: string }) => {
  if (['tape', 'binding', 'carbon', 'bookmark'].includes(id))
    return <ReplayRelicArt id={id} />;
  if (equipmentById(id)) return <EquipmentIcon id={id} size={40} />;
  return (
    <SkinIcon
      name={
        (
          {
            'red-line': 'blade',
            'enduring-record': 'shield',
            'double-edit': 'focus',
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
            sharpen: 'blade',
          } as Record<string, SkinIconName>
        )[id] ?? 'relic'
      }
      size={34}
    />
  );
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
  const [pending, setPending] = useState<Offer | null>(null);
  const [speech, setSpeech] = useState<{
    runId: string;
    room: number;
    text: string;
  } | null>(null);
  const say = (text: string) =>
    setSpeech({ runId: s.runId, room: s.room, text });
  const purchase = (offer: Offer, slot?: number) => {
    const result = buy(s, offer.id, slot);
    say(
      result.error
        ? 'Монеты не беру: ' + result.error
        : merchantPurchase(offer),
    );
    void act(result);
  };
  const open =
    !['battle', 'trial'].includes(s.phase) ||
    (s.phase === 'trial' && !!s.trial?.paused);
  const select = (o: Offer) => {
    if (
      o.kind === 'seal' ||
      o.kind === 'equipment' ||
      (o.kind === 'skill' && s.skills.length >= 2) ||
      (o.kind === 'modifier' && s.modifiers.length >= 2)
    ) {
      setPending(o);
      return;
    }
    if (s.phase === 'shop') purchase(o);
    else void act(chooseReward(s, o.id));
  };
  const replace = (slot: number) => {
    if (!pending) return;
    if (s.phase === 'shop') purchase(pending, slot);
    else void act(chooseReward(s, pending.id, slot));
    setPending(null);
  };
  const heading = pending
    ? pending.kind === 'seal'
      ? 'Принять цену печати?'
      : pending.kind === 'equipment'
        ? 'Надеть находку?'
        : 'Что заменить?'
    : (
        {
          reward:
            s.rewardSource === 'treasure'
              ? 'Находка в кладовой'
              : s.room === 10
                ? 'Цензор повержен'
                : 'Выбери находку',
          map: 'Куда дальше?',
          shop: s.room > 10 ? 'Плавучая лавка Саввы' : 'Торговец у переправы',
          rest: s.room > 10 ? 'Сухой причал' : 'У тлеющего костра',
          event:
            s.room === 17
              ? 'Сердце насосной'
              : s.room === 3
                ? 'Забытый алтарь'
                : 'Тайник странника',
          trial:
            s.trial?.remaining === 45
              ? s.room > 10
                ? 'Аварийный шлюз'
                : 'Закрывающийся шлюз'
              : 'Испытание на паузе',
          victory:
            s.room === TOTAL_ROOMS ? 'Оба биома пройдены' : 'Подвал пройден',
          defeat: 'Твой путь оборвался',
        } as Record<string, string>
      )[s.phase];
  const description = pending
    ? pending.kind === 'equipment'
      ? `${pending.description} ${s.equipment[equipmentById(pending.id)!.slot] ? 'Новая вещь заменит старую до конца забега.' : 'Шлем займёт свободный слот до конца забега.'}`
      : `${pending.name}. ${pending.description}`
    : (
        {
          reward:
            s.rewardSource === 'treasure'
              ? `Одна случайная реликвия бесплатно. У тебя ${s.gold} золота.`
              : s.rewardSource === 'seal'
                ? 'Одна мощная печать с ценой. Можно отказаться без потерь.'
                : s.rewardSource === 'elite'
                  ? 'Выбери одну из сильных находок. Золото за бой уже получено.'
                  : 'Одна вещь останется с тобой до конца забега.',
          map: `Комната ${s.room + 1} из ${TOTAL_ROOMS}. Выбирай риск, который готов принять.`,
          shop: `У тебя ${s.gold} золота. Ассортимент не обновляется.`,
          rest:
            (s.rulesVersion ?? 0) >= 2
              ? 'Выбери лечение, усиление поля или заточку оружия.'
              : 'Выбери лечение или усиление поля.',
          event:
            s.room === 17
              ? 'Насос ещё можно спасти. Его работа ослабит приливы до конца забега.'
              : s.room === 3
                ? 'Камень просит немного крови. В нише мерцает находка.'
                : 'Кто-то оставил здесь припасы и старый сундук.',
          trial:
            'Собери 18 энергии из совпадений и нанеси 30 урона преграде. Таймер — 45 секунд.',
          victory: `${s.enemies[0]?.name ?? 'Босс'} пал. Найденные открытия доступны в следующем забеге.`,
          defeat:
            'Находки потеряны, открытия остаются. Попробуй другое сочетание.',
        } as Record<string, string>
      )[s.phase];
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className={`game-dialog run-dialog biome-${biomeAt(s.room).id} ${s.phase}-dialog ${pending ? 'pending-dialog' : ''}`}
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
            ? 'СПУСК ЗАВЕРШЁН'
            : s.phase === 'defeat'
              ? `КОМНАТА ${s.room} · ХОД ${s.round}`
              : `ОСКОЛКИ · ${biomeAt(s.room).name.toUpperCase()}`}
        </span>
        <DialogTitle>{heading}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <ArchiveEntrance game={s} />
        {['victory', 'defeat'].includes(s.phase) && <RunSeed seed={s.seed} />}
        {s.phase === 'shop' && (
          <Merchant
            archive={s.room > 10}
            text={
              speech?.runId === s.runId && speech.room === s.room
                ? speech.text
                : merchantGreeting(
                    s.seed,
                    s.offers.some((o) => !!o.discount),
                    s.room > 10,
                  )
            }
            onTalk={say}
            busy={busy}
          />
        )}
        {['rest', 'event'].includes(s.phase) && (
          <img
            className="room-vignette"
            src={roomBackground(s.room).src}
            alt={roomBackground(s.room).alt}
          />
        )}
        {pending ? (
          <>
            {pending.kind === 'seal' ? (
              <SealConfirmation
                game={s}
                offer={pending}
                busy={busy}
                confirm={() => {
                  void act(chooseReward(s, pending.id));
                  setPending(null);
                }}
              />
            ) : pending.kind === 'equipment' ? (
              <>
                <EquipmentComparison game={s} id={pending.id} />
                {s.phase === 'shop' && <ShopPrice offer={pending} />}
                <Button
                  disabled={
                    busy || (s.phase === 'shop' && s.gold < (pending.cost ?? 0))
                  }
                  onClick={() => {
                    if (s.phase === 'shop') purchase(pending);
                    else void act(chooseReward(s, pending.id));
                    setPending(null);
                  }}
                >
                  Надеть{pending.cost ? ` за ${pending.cost} золота` : ''}
                </Button>
              </>
            ) : (
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
                        <small>{itemForRun(s, id)?.description}</small>
                      </span>
                      <ArrowRight />
                    </Button>
                  ),
                )}
              </div>
            )}
            <Button variant="ghost" onClick={() => setPending(null)}>
              <ArrowLeft />
              Вернуться к находкам
            </Button>
          </>
        ) : (
          <>
            {(s.phase === 'reward' || s.phase === 'shop') && (
              <div
                className={`offer-grid ${s.phase === 'shop' ? 'shop-grid' : s.offers.length === 4 ? 'four-offers' : ''}`}
              >
                {s.offers
                  .map((o) => offerForRun(s, o))
                  .map((o) => (
                    <button
                      key={o.id}
                      className={`offer-card ${o.kind === 'modifier' ? 'modifier-offer' : ''} ${o.kind === 'equipment' ? `equipment-offer gear-tier-${o.quality ?? equipmentById(o.id)?.tier}` : ''}`}
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
                        {o.kind === 'seal'
                          ? 'ПЕЧАТЬ ЦЕНЗОРА'
                          : o.kind === 'equipment'
                            ? EQUIPMENT_SLOT_NAMES[
                                equipmentById(o.id)!.slot
                              ].toUpperCase()
                            : o.kind === 'relic'
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
                      {o.kind === 'equipment' && (
                        <span className="equipment-replaces">
                          {s.equipment[equipmentById(o.id)!.slot]
                            ? `Вместо: ${equipmentById(s.equipment[equipmentById(o.id)!.slot])?.name}`
                            : 'Свободный слот шлема'}
                        </span>
                      )}
                      <span className="offer-tag">
                        {o.cost ? <ShopPrice offer={o} /> : o.tag}
                      </span>
                    </button>
                  ))}
              </div>
            )}
            {s.phase === 'reward' && (
              <RewardActions game={s} busy={busy} act={act} />
            )}
            {s.phase === 'reward' && <NextStops game={s} />}
            {s.phase === 'shop' && (
              <Button
                className="panel-main-action"
                onClick={() => void act(leaveRoom(s))}
              >
                Продолжить путь <ArrowRight />
              </Button>
            )}
            {s.phase === 'map' && (
              <JourneyMap
                game={s}
                busy={busy}
                onEnter={(id) => void act(enterRoom(s, id))}
              />
            )}
            {s.phase === 'rest' && (
              <>
                <Button
                  className="rest-heal"
                  variant="outline"
                  onClick={() => void act(rest(s, 'heal'))}
                >
                  <SkinIcon name="heart" size={40} />
                  <span>
                    <strong>Перевести дух</strong>
                    <small>
                      Восстановить до {Math.ceil(s.maxHp * 0.25)} здоровья ·
                      сейчас {s.hp}/{s.maxHp}
                    </small>
                  </span>
                </Button>
                <span className="choice-divider">
                  {(s.rulesVersion ?? 0) >= 2
                    ? 'ИЛИ ВЫБРАТЬ УСИЛЕНИЕ'
                    : 'ИЛИ УЛУЧШИТЬ ПОЛЕ'}
                </span>
                <div className="upgrade-grid">
                  {restOptions(s).map((o) => (
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
                {s.room === 7 && (s.rulesVersion ?? 0) >= 4 && (
                  <details className="run-journal">
                    <summary>Сменить план: обмен реликвии</summary>
                    <p>
                      Сдай одну свою реликвию. Вместо неё появятся две
                      неизвестные новые на выбор; забрать можно одну. При отказе
                      старая вещь не возвращается. Припасы и тайник после обмена
                      недоступны.
                    </p>
                    {s.relics.map((id) => (
                      <Button
                        key={id}
                        variant="outline"
                        disabled={busy || !canTradeRelic(s)}
                        onClick={() => void act(eventChoice(s, `trade:${id}`))}
                      >
                        <ItemIcon id={id} /> Отдать «{itemById(id)?.name}» →
                        выбор из двух
                      </Button>
                    ))}
                    {!canTradeRelic(s) && (
                      <p>
                        Нужна своя реликвия и хотя бы две ещё не собранные в
                        доступном пуле.
                      </p>
                    )}
                  </details>
                )}
                {s.room === 17 &&
                  !s.challenge &&
                  (s.rulesVersion ?? 0) >= 4 && (
                    <button
                      className="route-card"
                      disabled={busy || !canEnterForbidden(s)}
                      onClick={() => void act(eventChoice(s, 'forbidden'))}
                    >
                      <SkinIcon name="crown" size={44} />
                      <div>
                        <strong>
                          Пропуск в Запретный отдел · −6 макс. здоровья
                        </strong>
                        <p>
                          {s.flags.includes('run:alternate-access')
                            ? 'Заменяет финального Хранителя на Редактора. Текущее здоровье уменьшится только до нового максимума. Насос останется непочиненным.'
                            : 'Откроется после первой обычной победы. Этот спуск продолжится к Хранителю.'}
                        </p>
                      </div>
                      <ArrowRight />
                    </button>
                  )}
                <button
                  className="route-card"
                  disabled={busy || (s.room === 17 ? s.gold < 30 : s.hp <= 5)}
                  onClick={() =>
                    void act(eventChoice(s, s.room === 17 ? 'repair' : 'relic'))
                  }
                >
                  <SkinIcon name="relic" size={44} />
                  <div>
                    <strong>
                      {s.room === 17
                        ? 'Починить насос · 30 золота'
                        : 'Открыть тайник'}
                    </strong>
                    <p>
                      {s.room === 17
                        ? 'Каждый прилив до конца забега наносит на 2 урона меньше. Работает и против босса.'
                        : 'Потерять 5 здоровья и выбрать сильную находку.'}
                    </p>
                  </div>
                  <ArrowRight />
                </button>
                <button
                  className="route-card"
                  onClick={() => void act(eventChoice(s, 'supplies'))}
                >
                  <SkinIcon name="potion" size={44} />
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
                    <SkinIcon name="spark" size={40} />
                    <strong>{s.trial?.energy ?? 0} / 18</strong>
                    <span>Энергия механизма</span>
                  </div>
                  <div>
                    <SkinIcon name="blade" size={40} />
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
                <RunRecap game={s} />
                <ProgressionGoals meta={meta} />
                <div className="end-stats">
                  <div>
                    <strong>
                      {s.room}/
                      {s.phase === 'victory' && s.room === 10
                        ? 10
                        : TOTAL_ROOMS}
                    </strong>
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
                    : s.challenge
                      ? 'Испытание учитывается в собственной книге отметок. Обычная серия и открытия не изменились.'
                      : `Достижения: ${meta.unlocked.length}/${ACHIEVEMENTS.length}. Серия побед: ${meta.streak}. Лучшая: ${meta.best}.`}
                </p>
                <Button className="panel-main-action" onClick={restart}>
                  Новый спуск <RotateCcw />
                </Button>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function Discoveries({
  game,
  open,
  onClose,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  meta: Meta;
  game: State;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="game-dialog discovery-dialog">
        <DialogTitle>Открытия</DialogTitle>
        <DialogDescription>
          {meta.unlocked.length} / {ACHIEVEMENTS.length} достижений. В новых
          забегах 12 основных реликвий доступны сразу. Копирка, Закладка и две
          новые метки открываются через освоение приёмов и появляются со
          следующего забега.
        </DialogDescription>
        <ProgressionGoals meta={meta} />
        <RunJournal meta={meta} game={game} />
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
                  <small>Связанный предмет: {itemById(a.reward)?.name}</small>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
export type Preset =
  | 'normal'
  | 'shields'
  | 'poison'
  | 'cascades'
  | 'editor'
  | 'runes';
export function SettingsPanel({
  meta,
  currentHero = 'wanderer',
  currentDifficulty = 0,
  currentChallenge,
  open,
  onClose,
  balance,
  currentSeed,
  onAnimation,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  balance: Balance;
  currentSeed: number;
  onAnimation: (ms: number) => void;
  meta: Meta;
  currentHero?: HeroId;
  currentDifficulty?: 0 | 1;
  currentChallenge?: ChallengeId;
  onStart: (
    b: Balance,
    p: Preset,
    seed?: number,
    hero?: HeroId,
    difficulty?: 0 | 1,
    challenge?: ChallengeId,
  ) => void;
}) {
  const [challenge, setChallenge] = useState<ChallengeId | undefined>(
    currentChallenge,
  );
  const [hero, setHero] = useState<HeroId>(currentHero);
  const [difficulty, setDifficulty] = useState<0 | 1>(currentDifficulty);
  const [settings, setSettings] = useState(balance);
  const [preset, setPreset] = useState<Preset>('normal');
  const [seed, setSeed] = useState('');
  const [copied, setCopied] = useState(false);
  const seedValid = seed === '' || isValidSeed(seed);
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
          Скорость анимации меняется сразу. Остальные параметры применяются в
          новом забеге.
        </DialogDescription>
        <fieldset className="run-journal">
          <legend>Режим спуска</legend>
          <label>
            Испытание{' '}
            <select
              value={challenge ?? ''}
              onChange={(e) => {
                setChallenge(
                  (e.target.value || undefined) as ChallengeId | undefined,
                );
                if (e.target.value) {
                  setHero('wanderer');
                  setDifficulty(0);
                  setPreset('normal');
                }
              }}
            >
              <option value="">Обычный спуск</option>
              {CHALLENGES.map((c) => (
                <option key={c.id} value={c.id} disabled={!meta.wins}>
                  {c.name}
                  {meta.wins ? '' : ' · после победы'}
                </option>
              ))}
            </select>
          </label>
          {challenge && (
            <p>
              {CHALLENGES.find((c) => c.id === challenge)?.description} Герой и
              обычная сложность заданы условиями. Испытания имеют собственные
              отметки, не меняют обычную серию и не открывают предметы.
            </p>
          )}

          {HEROES.map((h) => (
            <label key={h.id} style={{ display: 'block', marginBottom: 12 }}>
              <input
                type="radio"
                name="hero"
                checked={hero === h.id}
                disabled={!!challenge || (h.id === 'warden' && !meta.wins)}
                onChange={() => setHero(h.id)}
              />{' '}
              <strong>{h.name}</strong> — {h.description}
              {h.id === 'warden' && !meta.wins ? ' После первой победы.' : ''}
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={difficulty === 1}
              disabled={!!challenge || !meta.wins}
              onChange={(e) => setDifficulty(e.target.checked ? 1 : 0)}
            />{' '}
            Напряжение I: все удары врагов +2. Доступно после первой победы;
            отдельная отметка прохождения.
          </label>
        </fieldset>
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
          {(
            [
              'normal',
              'shields',
              'poison',
              'editor',
              'runes',
              'cascades',
            ] as Preset[]
          ).map((p) => (
            <Button
              variant="outline"
              key={p}
              disabled={!!challenge}
              aria-pressed={preset === p}
              onClick={() => setPreset(p)}
            >
              {
                {
                  normal: 'Обычная',
                  shields: 'Щиты',
                  poison: 'Кинжал и яд',
                  editor: 'Топор и правка',
                  runes: 'Рунный разряд',
                  cascades: 'Каскады',
                }[p]
              }
            </Button>
          ))}
        </div>
        <label className="seed-control" htmlFor="run-seed">
          Seed — номер забега{' '}
          <Input
            id="run-seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Случайный seed"
            aria-invalid={!seedValid}
            aria-describedby="seed-explanation"
            inputMode="numeric"
          />
        </label>
        <div className="seed-current">
          <Button
            variant="outline"
            onClick={() => setSeed(String(currentSeed >>> 0))}
          >
            Использовать текущий: {currentSeed >>> 0}
          </Button>
          <p
            id="seed-explanation"
            className={seedValid ? 'panel-note' : 'seed-error'}
          >
            {seedValid
              ? 'Одинаковый seed, открытия, настройки и решения повторяют поле, находки и скидки.'
              : 'Введи целое число от 0 до 4294967295.'}
          </p>
        </div>
        <p className="panel-note">
          Забеги с изменённым балансом, готовой сборкой или заданным номером не
          влияют на открытия и серию побед. Текущий незавершённый забег
          закончится.
        </p>
        <div className="settings-actions">
          <Button
            className="panel-main-action"
            disabled={!seedValid}
            onClick={() => {
              if (!seedValid) return;
              onStart(
                settings,
                challenge ? 'normal' : preset,
                seed ? Number(seed) : undefined,
                hero,
                difficulty,
                challenge,
              );
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

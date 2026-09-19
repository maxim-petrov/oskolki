'use client';
import { useState } from 'react';
import {
  nextRooms,
  offerForRun,
  restOptions,
  itemById,
  canRerollTreasure,
  type State,
  type Offer,
} from '@/game/engine';
import type { LabCommand } from '@/game/lab';
import { ItemIcon } from '@/components/game-panels';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function LabPanel({
  state: s,
  execute,
  busy,
  exit,
}: {
  state: State;
  execute: (command: LabCommand) => Promise<void>;
  busy: boolean;
  exit: () => void;
}) {
  const [pending, setPending] = useState<Offer | null>(null);
  const pick = (o: Offer, slot?: number) => {
    if (
      slot === undefined &&
      ((o.kind === 'skill' && s.skills.length >= 2) ||
        (o.kind === 'modifier' && s.modifiers.length >= 2))
    ) {
      setPending(o);
      return;
    }
    void execute({
      action: s.phase === 'shop' ? 'buy' : 'choose_reward',
      id: o.id,
      ...(slot === undefined ? {} : { slot }),
    });
    setPending(null);
  };
  const open = ['map', 'reward', 'shop', 'rest'].includes(s.phase);
  return (
    <Dialog open={open}>
      <DialogContent
        className="lab-dialog lab-room-dialog"
        showCloseButton={false}
      >
        <div className="lab-eyebrow">КОРОТКИЙ ЗАБЕГ · КОМНАТА {s.room} / 6</div>
        <DialogTitle>
          {pending
            ? 'Что заменить?'
            : (
                {
                  map: 'Куда дальше?',
                  reward: 'Что изменит следующий ход?',
                  shop: 'Собрать сочетание',
                  rest: 'Перевести дух',
                } as Record<string, string>
              )[s.phase]}
        </DialogTitle>
        <DialogDescription>
          {pending
            ? `Новая находка: ${pending.name}. ${pending.description}`
            : `Здоровье ${s.hp}/${s.maxHp} · монеты ${s.gold}. ${s.phase === 'map' ? (nextRooms(s).length > 1 ? 'Обе ветки ведут к Цензору. Выбор меняет условия следующего боя.' : 'Продолжи путь к Цензору.') : 'Подумай, какие совпадения теперь станут выгоднее.'}`}
        </DialogDescription>
        {pending ? (
          <div className="lab-choice-list">
            {(pending.kind === 'skill' ? s.skills : s.modifiers).map(
              (id, slot) => (
                <button
                  className="lab-button"
                  disabled={busy}
                  key={id}
                  onClick={() => pick(pending, slot)}
                >
                  Заменить «{itemById(id)?.name}»
                </button>
              ),
            )}
            <button className="lab-button" onClick={() => setPending(null)}>
              Назад к находкам
            </button>
          </div>
        ) : (
          <>
            {s.phase === 'map' && (
              <div className="lab-choice-list">
                {nextRooms(s).map((room) => (
                  <button
                    disabled={busy}
                    className="lab-room-choice"
                    key={room.id}
                    onClick={() =>
                      void execute({ action: 'enter_room', id: room.id })
                    }
                  >
                    <strong>{room.name}</strong>
                    <span>{room.description}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}
            {['reward', 'shop'].includes(s.phase) && (
              <div className="lab-offers">
                {s.offers
                  .map((raw) => offerForRun(s, raw))
                  .map((o) => (
                    <button
                      key={o.id}
                      className="lab-offer"
                      disabled={
                        busy ||
                        (s.phase === 'shop' && s.gold < (o.cost ?? 0)) ||
                        (o.kind === 'potion' && s.potions >= 2)
                      }
                      onClick={() => pick(o)}
                    >
                      <ItemIcon id={o.id} />
                      <strong>{o.name}</strong>
                      <span>{o.description}</span>
                      <small>
                        {s.phase === 'shop'
                          ? `${o.cost ?? 0} монет${o.discount ? ` · скидка ${o.discount}%` : ''}`
                          : o.tag}
                      </small>
                    </button>
                  ))}
              </div>
            )}
            {s.phase === 'reward' && (
              <div className="lab-actions">
                <button
                  disabled={busy}
                  className="lab-button"
                  onClick={() =>
                    void execute({ action: 'choose_reward', id: null })
                  }
                >
                  Пропустить находку
                </button>
                {canRerollTreasure(s) && (
                  <button
                    disabled={busy}
                    className="lab-button"
                    onClick={() => void execute({ action: 'reroll_treasure' })}
                  >
                    Поменять находку · 20 монет
                  </button>
                )}
              </div>
            )}
            {s.phase === 'shop' && (
              <button
                disabled={busy}
                className="lab-button lab-primary"
                onClick={() => void execute({ action: 'leave_shop' })}
              >
                Продолжить путь →
              </button>
            )}
            {s.phase === 'rest' && (
              <div className="lab-choice-list">
                <button
                  disabled={busy}
                  className="lab-room-choice"
                  onClick={() => void execute({ action: 'rest', id: 'heal' })}
                >
                  <strong>
                    Восстановить до {Math.ceil(s.maxHp * 0.25)} здоровья
                  </strong>
                  <span>Вернуть запас на следующий бой.</span>
                </button>
                {restOptions(s).map((o) => (
                  <button
                    disabled={busy}
                    className="lab-room-choice"
                    key={o.id}
                    onClick={() => void execute({ action: 'rest', id: o.id })}
                  >
                    <strong>{o.name}</strong>
                    <span>{o.description}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <button className="lab-text-button" disabled={busy} onClick={exit}>
          Сохранить и вернуться в лабораторию
        </button>
      </DialogContent>
    </Dialog>
  );
}

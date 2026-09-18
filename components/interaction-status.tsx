'use client';
import {
  previewEndTurn,
  acceptContract,
  canAcceptContract,
  toggleInsurance,
  equipmentById,
  type State,
  type Result,
} from '@/game/engine';

export function InteractionStatus({
  game: s,
  busy,
  act,
}: {
  game: State;
  busy: boolean;
  act: (r: Result) => Promise<void>;
}) {
  if ((s.rulesVersion ?? 0) < 6 || !s.effectState) return null;
  const e = s.effectState;
  const forecast =
    s.equipment.trousers === 'gear-collateral-belt' ? previewEndTurn(s) : null;
  const labels: { text: string; hint: string }[] = [];
  if (s.relics.includes('ring-clasp'))
    labels.push({
      text: 'Кольцо',
      hint: 'Совпадения продолжаются через противоположный край. Бомбы через край не достают.',
    });
  if (s.relics.includes('defective-copy'))
    labels.push({
      text: `Копия ${e.companion}/3`,
      hint: 'После трёх групп первой волны ручных сдвигов спутник наносит 40% синтетического удара оружием.',
    });
  if (s.relics.includes('return'))
    labels.push({
      text: s.flags.includes('return:armed')
        ? 'Возврат готов'
        : `Энергия ${Math.min(6, e.energySpent)}/6`,
      hint: 'Потрать 6 энергии за ход: следующая группа щитов получит +3 блока. Один раз за ход.',
    });
  if (s.equipment.clothing === 'gear-courier-jacket')
    labels.push({
      text: e.courierUsed
        ? 'Куртка: ✓'
        : e.lastAxis === 'row'
          ? 'Столбец −1 ОД'
          : e.lastAxis === 'col'
            ? 'Строка −1 ОД'
            : 'Ось −1 ОД',
      hint: 'Первый переход между строкой и столбцом за ход дешевле на 1 действие, минимум 1. Первый сдвиг без скидки.',
    });
  if (s.skills.includes('imprint'))
    labels.push({
      text: e.lastAttack ? 'Оттиск готов' : 'Оттиск: —',
      hint: `Повторит 60% последнего первичного удара этой комнаты (${equipmentById(e.lastAttack?.profile.weapon)?.name ?? 'нет записи'}). Запись не меняется от повторов.`,
    });
  if (
    !labels.length &&
    !s.eliteContract &&
    s.equipment.trousers !== 'gear-collateral-belt'
  )
    return null;
  return (
    <aside className="interaction-status" aria-label="Правила сборки">
      {labels.map((l) => (
        <span key={l.text} title={l.hint}>
          {l.text}
        </span>
      ))}
      {s.equipment.trousers === 'gear-collateral-belt' && (
        <button
          type="button"
          aria-pressed={e.insurance}
          disabled={busy}
          onClick={() => void act(toggleInsurance(s))}
          title="Только внешний урон после блока. 2 монеты за 1 здоровье; максимум 4 здоровья за ход."
        >
          Страховка {e.insurance ? 'вкл.' : 'выкл.'} · осталось {4 - e.insured}{' '}
          HP
        </button>
      )}
      {forecast && (
        <span>
          Ответ: −{forecast.healthLoss} HP · −{forecast.goldCost} монет
          {forecast.defeated ? ' · смертельно' : ''}
        </span>
      )}
      {s.eliteContract &&
        (s.eliteContract.accepted ? (
          <span title="Базовая награда не меняется">
            Контракт · {s.eliteContract.responses}/3 ответов · +15 монет
          </span>
        ) : (
          <button
            type="button"
            disabled={busy || !canAcceptContract(s)}
            onClick={() => void act(acceptContract(s))}
            title="Добровольно: победи не позднее третьего ответа врагов. При неудаче обычная награда сохраняется."
          >
            Контракт: до 3 ответов → +15 монет
          </button>
        ))}
    </aside>
  );
}

'use client';
import { previewMove, type State } from '@/game/engine';

const LIMITS: Record<string, string> = {
  'turn:toxin': 'Токсичный амулет',
  'turn:lamp': 'Переполненная лампа',
  'turn:coil': 'Медная катушка',
  'turn:thorns': 'Шипованный обод',
  'turn:focus': 'Усиление фокуса',
  'battle:heart': 'Грибное сердце',
  'battle:thread': 'Ритуальная нить',
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
export function MovePreview({
  game,
  move,
}: {
  game: State;
  move: { axis: 'row' | 'col'; line: number; amount: number } | null;
}) {
  if (!move || game.moved)
    return (
      <p className="move-preview-hint">
        {game.moved
          ? 'Сдвиг использован. Можно применить приём или завершить ход.'
          : 'Стрелка сразу сдвигает линию. При перетаскивании отпусти фишку, чтобы сделать ход.'}
        {game.flags.includes('turn:rune-armed') &&
          ' Рунный заряд готов: следующий атакующий приём за энергию получит +2 урона.'}
      </p>
    );
  const result = previewMove(game, move.axis, move.line, move.amount);
  const used = (result.limitsUsed ?? []).flatMap((f) =>
    LIMITS[f] ? [LIMITS[f]] : f.startsWith('conductor:') ? ['Проводник'] : [],
  );
  return (
    <section
      className="move-preview"
      aria-label="Предварительный результат сдвига"
    >
      <div className="move-preview-heading">
        <strong>
          {move.axis === 'row' ? 'Строка' : 'Столбец'} {move.line + 1} ·{' '}
          {move.axis === 'row'
            ? move.amount > 0
              ? 'вправо'
              : 'влево'
            : move.amount > 0
              ? 'вниз'
              : 'вверх'}{' '}
          на {Math.abs(move.amount)}
        </strong>
        <span>Первая волна</span>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {result.error ? (
          <p>{result.error}</p>
        ) : (
          <>
            <ul className="move-preview-targets">
              {result.targets?.map((e) => (
                <li key={e.id}>
                  <strong>{e.name}</strong>:{' '}
                  {e.damage ? `−${e.damage} здоровья` : 'без потери здоровья'}
                  {e.block ? `, −${e.block} блока` : ''}
                  {e.poison ? `, +${e.poison} яда` : ''}
                  {e.defeated ? ' · повержен' : ''}
                  {e.phaseChanged ? ` · фаза II: ${e.intent?.text}` : ''}
                </li>
              ))}
            </ul>
            <div className="move-preview-resources">
              {(['block', 'energy', 'focus', 'health'] as const).map((key) =>
                result[key] ? (
                  <span key={key}>
                    {
                      {
                        block: 'Блок',
                        energy: 'Энергия',
                        focus: 'Фокус',
                        health: 'Здоровье',
                      }[key]
                    }{' '}
                    {signed(result[key]!)}
                  </span>
                ) : null,
              )}
              {!!result.trialDamage && (
                <span>Преграда −{result.trialDamage}</span>
              )}
            </div>
            {result.tideCleared && <p>Сток откроется: этот прилив отменён.</p>}
            {!!result.inkCleared && <p>Убрано клякс: {result.inkCleared}.</p>}
            {!!result.rootsCleared && <p>Убрано пут: {result.rootsCleared}.</p>}
            {result.runeReady && (
              <p>
                Рунный заряд готов: +2 урона следующему атакующему приёму за
                энергию.
              </p>
            )}
            {!!used.length && (
              <p className="move-preview-limits">
                Сработают лимиты: {used.join(', ')}.
              </p>
            )}
            {result.lethal ? (
              <p className="move-preview-danger">
                Этот сдвиг приведёт к гибели героя.
              </p>
            ) : result.enemiesDefeated ? (
              <p>
                Все враги погибнут в первой волне. Остальные эффекты хода ещё
                разрешаются.
              </p>
            ) : null}
            <p className="move-preview-unknown">
              Пополнение поля и случайные каскады не показаны. После хода
              проверь обновлённые намерения врагов.
            </p>
          </>
        )}
      </div>
      <p className="move-preview-hint">
        Отпусти фишку, чтобы сделать ход. Esc — отменить перетаскивание.
      </p>
    </section>
  );
}

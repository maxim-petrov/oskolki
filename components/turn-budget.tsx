import {
  actionLeft,
  actionMax,
  boardSize,
  minimumMatch,
  tactical,
  type State,
} from '@/game/engine';

export function TurnBudget({ game }: { game: State }) {
  if (!['battle', 'trial'].includes(game.phase)) return null;
  if (!tactical(game))
    return (
      <p className="move-preview-hint">
        Этот забег продолжает прежние правила. Несколько действий за ход и новые
        встречи доступны в новом забеге.
      </p>
    );
  if (game.phase === 'trial')
    return (
      <p className="move-preview-hint">
        Испытание на время: сдвиги не тратят действия, но должны давать
        совпадение. Минимум в ряд: {minimumMatch(game)}.
      </p>
    );
  const left = actionLeft(game),
    max = actionMax(game);
  const locks = game.board.filter((tile) => tile.locked).length;
  return (
    <section className="turn-budget" aria-label="Действия и правила хода">
      <div className="turn-budget-title">
        <strong>
          Действия: {left} / {max}
        </strong>
        <span className="action-pips" aria-hidden="true">
          {Array.from({ length: max }, (_, i) => (
            <i key={i} className={i < left ? 'available' : ''} />
          ))}
        </span>
      </div>
      <p>
        Сдвиг: 1 действие за клетку по кратчайшему пути через край. Приём: 1
        действие + ресурс. Враги отвечают после «Завершить ход».
      </p>
      <details>
        <summary>Как подготовить большой ход</summary>
        <p>
          Можно сдвинуть поле без совпадения, чтобы собрать следующую
          комбинацию. Такой сдвиг тоже платный. Цена считается по кратчайшему
          пути вокруг края. Несколько приёмов можно использовать в любом
          порядке. Зелье — раз за ход без затрат действий. Неиспользованные
          действия не переносятся.
        </p>
      </details>
      {minimumMatch(game) === 4 && (
        <p className="tactical-notice">
          <b>Великий замысел:</b> нужно 4+ фишки в ряд. Тройки остаются на поле.
          Урон оружия и базовые блок, энергия и фокус от совпадений ×2.
        </p>
      )}
      {game.relics.includes('borrowed-time') && (
        <p className="tactical-notice">
          <b>Заемное время:</b> +1 действие. Завершение хода отнимет 2 здоровья
          сквозь блок, даже если это смертельно.
        </p>
      )}
      {game.relics.includes('iron-agenda') && (
        <p className="tactical-notice">
          <b>Железный распорядок:</b> −1 действие, +6 блока в начале каждого
          хода.
        </p>
      )}
      {!!locks && (
        <p className="tactical-notice">
          <b>Печати: {locks}.</b> Отмеченные строки и столбцы не сдвигаются до
          ответа врагов. Совпадение фокуса, Правка или смерть владельца снимают
          печати.
        </p>
      )}
      {game.boardWarp && (
        <p className="tactical-notice">
          <b>
            Поле {boardSize(game.board)}×{boardSize(game.board)}.
          </b>{' '}
          Вернётся к 6×6 через {game.boardWarp.expires - game.round + 1}{' '}
          завершения хода. Край при сжатии исчезает без награды.
        </p>
      )}
    </section>
  );
}

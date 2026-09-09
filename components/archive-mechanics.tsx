import { Droplet, Waves, Sparkles, Wrench } from 'lucide-react';
import { tideDamage, type State } from '@/game/engine';

export function ArchiveMechanics({ game }: { game: State }) {
  if (game.room <= 10 || game.phase !== 'battle') return null;
  const tide = game.tide;
  return (
    <section
      className="archive-mechanics"
      aria-label="Механики затопленного архива"
    >
      {tide && (
        <div className={`tide-notice ${tide.cleared ? 'tide-cleared' : ''}`}>
          <Waves size={22} aria-hidden="true" />
          <div aria-live="polite">
            <strong>
              {tide.cleared
                ? 'Сток открыт — этот прилив безопасен'
                : `Прилив через ${tide.turns} ${tide.turns === 1 ? 'ход' : 'хода'} · ${tideDamage(game)} урона`}
            </strong>
            <p>
              {tide.cleared
                ? 'Следующая строка появится после окончания отсчёта.'
                : `Собери комбинацию со строкой ${tide.row + 1}, чтобы открыть сток. Иначе вода ударит перед врагами. Блок защищает.`}
            </p>
          </div>
        </div>
      )}
      <div className="ink-notice">
        <Droplet size={18} aria-hidden="true" />
        <p>
          Клякса при сборе: −1 здоровья сквозь блок.{' '}
          <Sparkles size={15} aria-hidden="true" /> Матч фокуса сначала смывает
          все кляксы.
        </p>
        <b aria-label="Клякс на поле">
          {game.board.filter((t) => t.ink).length}/6
        </b>
      </div>
      {game.flags.includes('run:sluice') && (
        <p className="pump-benefit">
          <Wrench size={15} /> Насос работает: приливы слабее на 2
        </p>
      )}
    </section>
  );
}

export function ArchiveEntrance({ game }: { game: State }) {
  if (game.phase !== 'reward' || game.room !== 10 || game.roomKind !== 'boss')
    return null;
  return (
    <section className="archive-entrance" aria-label="Открыт второй биом">
      <span className="eyebrow">БИОМ II</span>
      <h3>Затопленный архив</h3>
      <p>
        За печатью Цензора слышна вода. Впереди ещё 10 комнат и Хранитель
        прилива.
      </p>
      <p>
        Передышка уже восстановила до {Math.ceil(game.maxHp / 2)} здоровья и
        добавила зелье, если было место. Всё снаряжение сохранено.
      </p>
      <p>
        <strong>Приливы</strong> останавливает матч в отмеченной строке.{' '}
        <strong>Кляксы</strong> смывает матч фокуса.
      </p>
    </section>
  );
}

import { HEROES, type State, type Meta } from '@/game/engine';
export function ProgressionGoals({ meta }: { meta: Meta }) {
  return (
    <section className="run-journal" aria-label="Цели следующих забегов">
      <strong>Следующие цели</strong>
      <p>
        {meta.wins > 0
          ? 'Страж и Напряжение I доступны в настройках нового спуска. В насосной можно взять пропуск в Запретный отдел.'
          : 'Победи Хранителя прилива: откроются Страж, проход к другому финалу и Напряжение I.'}
      </p>
      {HEROES.map((h) => (
        <p key={h.id}>
          <strong>{h.name}</strong> ·{' '}
          {['tide-keeper', 'redactor']
            .map(
              (boss, i) =>
                `${(meta.marks ?? []).includes(`${h.id}:${boss}`) ? '✓' : '○'} ${i ? 'Редактор' : 'Хранитель'}`,
            )
            .join(' · ')}
        </p>
      ))}
      <p>
        Победы отмечают разные прохождения. Постоянных прибавок к урону и
        здоровью за открытия нет.
      </p>
    </section>
  );
}
export function ActiveHeroRules({ game }: { game: State }) {
  return (
    <div className="active-hero-rules">
      {game.hero === 'warden' && (
        <p>Страж · переносит до 4 блока, каждый бой начинает без энергии.</p>
      )}
      {game.difficulty === 1 && (
        <p>Напряжение I · удары врагов +2; в намерениях уже учтено.</p>
      )}
      {game.redaction && (
        <output>
          Запрет:{' '}
          {
            { blade: 'Клинок', shield: 'Щит', spark: 'Искра', focus: 'Фокус' }[
              game.redaction.family
            ]
          }{' '}
          · совпадение даёт Редактору 6 блока перед эффектом. Правка снимает
          запрет. Осталось ходов: {game.redaction.expires - game.round + 1}.
        </output>
      )}
    </div>
  );
}

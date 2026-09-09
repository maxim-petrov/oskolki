import {
  defeatExplanation,
  equipmentById,
  itemById,
  itemForRun,
  ENEMY_CATALOG,
  RELICS,
  MODIFIERS,
  SKILLS,
  type State,
  type Meta,
} from '@/game/engine';
export function RunRecap({ game }: { game: State }) {
  const damage = game.damageEvents ?? [];
  return (
    <div className="run-recap">
      {game.phase === 'defeat' && <p>{defeatExplanation(game)}</p>}
      <p>
        Оружие: {equipmentById(game.equipment.weapon)?.name}.{' '}
        {game.relics.length
          ? `Сборка: ${game.relics.map((id) => itemById(id)?.name).join(', ')}.`
          : 'Реликвий в сборке пока нет.'}
      </p>
      <details>
        <summary>Последние потери здоровья и блок</summary>
        {damage.length ? (
          damage
            .slice(-6)
            .reverse()
            .map((e, i) => (
              <p key={i}>
                Комната {e.room}, ход {e.round} · {e.source}: −{e.amount}{' '}
                здоровья, {e.blocked} в блок.
              </p>
            ))
        ) : (
          <p>Записанных потерь нет.</p>
        )}
      </details>
      <details>
        <summary>Что произошло в забеге</summary>
        {(game.chronicle ?? game.log).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </details>
    </div>
  );
}
export function RunJournal({ meta, game }: { meta: Meta; game: State }) {
  const seen = new Set(meta.seen ?? []);
  return (
    <div className="run-journal">
      <details>
        <summary>Справочник встреченных предметов и врагов</summary>
        {[...RELICS, ...MODIFIERS, ...SKILLS]
          .filter((o) => seen.has(`item:${o.id}`))
          .map((o) => (
            <p key={o.id}>
              <strong>{o.name}</strong> —{' '}
              {itemForRun(game, o.id)?.description ?? o.description}
            </p>
          ))}
        {Object.entries(ENEMY_CATALOG)
          .filter(([id]) => seen.has(`enemy:${id}`))
          .map(([id, e]) => (
            <p key={id}>
              <strong>{e.name}</strong> — {e.tactic}
            </p>
          ))}
        {!seen.size && <p>Записи появляются при встречах в обычных забегах.</p>}
      </details>
      <details>
        <summary>Последние забеги ({meta.history?.length ?? 0}/30)</summary>
        {(meta.history ?? []).map((r) => (
          <details key={r.id}>
            <summary>
              {r.outcome === 'victory'
                ? 'Победа'
                : r.outcome === 'defeat'
                  ? 'Поражение'
                  : 'Прерван'}{' '}
              · комната {r.room} · seed {r.seed}
              {r.modified ? ' · проверка' : ''}
            </summary>
            <p>
              {equipmentById(r.weapon)?.name} ·{' '}
              {r.relics.map((id) => itemById(id)?.name).join(', ') ||
                'Без реликвий'}
            </p>
            {r.outcome === 'defeat' && (
              <p>
                {defeatExplanation({
                  phase: 'defeat',
                  damageEvents: r.damageEvents,
                })}
              </p>
            )}
            <p>Путь: {r.path.join(' → ')}</p>
            <p>
              Урон: {r.stats.damage}, блок: {r.stats.blocked}, каскады:{' '}
              {r.stats.cascades}.
            </p>
          </details>
        ))}
        {!meta.history?.length && (
          <p>
            Здесь сохранятся завершённые и прерванные новые забеги. Старые
            результаты не восстанавливаются задним числом.
          </p>
        )}
      </details>
    </div>
  );
}

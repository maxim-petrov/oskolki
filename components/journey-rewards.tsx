import { Button } from '@/components/ui/button';
import { SkinIcon } from '@/components/skin-icon';
import {
  chooseReward,
  rerollTreasure,
  canRerollTreasure,
  sealConsequences,
  type State,
  type Result,
  type Offer,
} from '@/game/engine';

export function RewardActions({
  game,
  busy,
  act,
}: {
  game: State;
  busy: boolean;
  act: (r: Result) => unknown;
}) {
  const source = game.rulesVersion === 3 ? game.rewardSource : undefined;
  return (
    <div className="reward-actions">
      {source === 'treasure' && (
        <>
          {!game.offers.length && (
            <p>Все реликвии из этой кладовой уже у тебя.</p>
          )}
          <Button
            variant="outline"
            disabled={busy || !canRerollTreasure(game)}
            onClick={() => void act(rerollTreasure(game))}
          >
            {game.treasureRerolled
              ? 'Находка уже сменена'
              : 'Сменить находку · 20 золота'}
          </Button>
          <p>
            Новая находка неизвестна заранее. Смена доступна один раз; забрать
            можно бесплатно.
          </p>
        </>
      )}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => void act(chooseReward(game, null))}
      >
        {source === 'battle'
          ? 'Обменять всю награду на 8 золота и открыть карту'
          : source === 'seal'
            ? 'Отказаться от печати и отдохнуть перед архивом'
            : source === 'treasure'
              ? 'Оставить находку и открыть карту'
              : 'Пропустить находку и открыть карту'}
      </Button>
    </div>
  );
}
export function SealConfirmation({
  game,
  offer,
  busy,
  confirm,
}: {
  game: State;
  offer: Offer;
  busy: boolean;
  confirm: () => void;
}) {
  return (
    <section className="seal-confirmation" aria-label="Последствия печати">
      <p>{sealConsequences(game, offer.id)}</p>
      <p>
        Выбор действует до конца спуска. После выбора или отказа: лечение до 50%
        максимального здоровья и зелье, если есть место.
      </p>
      <Button
        disabled={busy || (offer.id === 'red-line' && game.maxHp <= 8)}
        onClick={confirm}
      >
        Принять печать и её цену
      </Button>
    </section>
  );
}
export function ActiveSeal({
  seal,
  onDetail,
}: {
  seal: Offer;
  onDetail: (id: string) => void;
}) {
  return (
    <button
      className="skill-card active-seal"
      onClick={() => onDetail(seal.id)}
    >
      <SkinIcon
        name={
          seal.id === 'red-line'
            ? 'blade'
            : seal.id === 'enduring-record'
              ? 'shield'
              : 'focus'
        }
        size={34}
      />
      <span>
        <small>ПЕЧАТЬ ЦЕНЗОРА</small>
        <strong>{seal.name}</strong>
        <small>{seal.description}</small>
      </span>
    </button>
  );
}

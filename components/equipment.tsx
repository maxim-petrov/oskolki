'use client';
import { VectorWeapon, INK, TINT } from './vector-art';
import {
  WEAPONS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_NAMES,
  EQUIPMENT_TIERS,
  equipmentById,
  equipmentForRun,
  WEAPON_RULES,
  equipmentSummary,
  type State,
} from '@/game/engine';

export function EquipmentIcon({
  id,
  size = 48,
}: {
  id: string;
  size?: number;
}) {
  const item = equipmentById(id);
  if (!item) return null;
  if (item.slot === 'weapon') return <VectorWeapon id={id} size={size} />;
  return (
    <svg
      className="equipment-icon"
      data-equipment-id={id}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      stroke={INK}
      strokeWidth="1.7"
      strokeLinejoin="round"
      fill="#e6eaf0"
    >
      {item.slot === 'helmet' ? (
        <path d="M5 22V15a11 11 0 0 1 22 0v7h-8v5h-6v-5ZM16 5v12" />
      ) : item.slot === 'clothing' ? (
        <path d="m11 4-8 8 5 5 3-3v14h10V14l3 3 5-5-8-8-5 5Z" />
      ) : (
        <path d="M8 4h16l2 24h-8l-2-15-2 15H6Z M8 9h16" />
      )}
      {Array.from({ length: item.tier }, (_, i) => (
        <path
          key={i}
          d={`M${12 + i * 5} 20v3`}
          stroke={TINT.blue}
          strokeWidth="2.5"
        />
      ))}
    </svg>
  );
}

export function EquipmentPanel({
  game,
  onDetail,
}: {
  game: State;
  onDetail: (id: string) => void;
}) {
  return (
    <section className="equipment-panel" aria-label="Экипировка персонажа">
      <div className="section-label">
        <span className="eyebrow">ЭКИПИРОВКА</span>
        <span>
          {EQUIPMENT_SLOTS.filter((slot) => game.equipment[slot]).length}/4
        </span>
      </div>
      <div className="equipment-grid">
        {EQUIPMENT_SLOTS.map((slot) => {
          const item = equipmentForRun(game, game.equipment[slot]);
          return item ? (
            <button
              type="button"
              key={slot}
              className={`equipment-slot gear-tier-${item.tier}`}
              onClick={() => onDetail(item.id)}
              aria-label={`${EQUIPMENT_SLOT_NAMES[slot]}: ${item.name}. ${equipmentSummary(item)}. Подробнее`}
            >
              <EquipmentIcon id={item.id} />
              <span>
                <small>{EQUIPMENT_SLOT_NAMES[slot]}</small>
                <strong>{item.name}</strong>
                <em>{equipmentSummary(item)}</em>
              </span>
              <span
                className="gear-rarity"
                title={EQUIPMENT_TIERS[item.tier]}
                aria-label={EQUIPMENT_TIERS[item.tier]}
              >
                {'◆'.repeat(item.tier + 1)}
              </span>
            </button>
          ) : (
            <div key={slot} className="equipment-slot empty-equipment">
              <span className="empty-gear-mark" aria-hidden="true">
                —
              </span>
              <span>
                <small>{EQUIPMENT_SLOT_NAMES[slot]}</small>
                <strong>Без шлема</strong>
                <em>Можно найти в пути</em>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function EquipmentComparison({ game, id }: { game: State; id: string }) {
  const offer = game.offers.find((o) => o.id === id);
  const item = equipmentForRun(game, id, offer?.quality);
  if (!item) return null;
  const old = equipmentForRun(game, game.equipment[item.slot]);
  return (
    <div className="equipment-comparison">
      <div>
        <small>СЕЙЧАС · {EQUIPMENT_SLOT_NAMES[item.slot]}</small>
        {old ? (
          <EquipmentIcon id={old.id} size={64} />
        ) : (
          <span className="empty-gear-mark" aria-hidden="true">
            —
          </span>
        )}
        <strong>{old?.name ?? 'Без шлема'}</strong>
        <span>{equipmentSummary(old)}</span>
      </div>
      <span className="equipment-arrow" aria-hidden="true">
        →
      </span>
      <div className={`gear-tier-${item.tier}`}>
        <small>{EQUIPMENT_TIERS[item.tier].toUpperCase()}</small>
        <EquipmentIcon id={item.id} size={64} />
        <strong>{item.name}</strong>
        <span>{equipmentSummary(item)}</span>
      </div>
    </div>
  );
}

export function WeaponGallery({
  selectedId,
  equippedId,
  onSelect,
  game,
}: {
  game?: State;
  selectedId: string;
  equippedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="weapon-gallery" aria-label="Пять видов оружия">
      <p className="eyebrow">ОРУЖИЕ · {WEAPONS.length} ВИДОВ</p>
      <div className="weapon-gallery-grid">
        {WEAPONS.map((weapon) => (
          <button
            type="button"
            key={weapon.id}
            className={`weapon-preview gear-tier-${(game?.rulesVersion ?? 0) >= 2 ? (weapon.id === equippedId ? game?.weaponQuality : 0) : weapon.tier}`}
            aria-pressed={selectedId === weapon.id}
            onClick={() => onSelect(weapon.id)}
          >
            <EquipmentIcon id={weapon.id} size={64} />
            <strong>{weapon.name}</strong>
            <small>
              {weapon.id === equippedId
                ? 'Надето'
                : (game?.rulesVersion ?? 0) >= 2
                  ? WEAPON_RULES[weapon.id].short
                  : `+${weapon.bonus} к урону`}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

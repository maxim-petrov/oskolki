'use client';
import { useId } from 'react';
import { weaponArtById } from '@/game/weapon-art';
import { PalaceCutout } from '@/components/palace-cutout';
import equipmentArt from '@/game/equipment-art.json';
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
  const uid = useId().replace(/:/g, '');
  const item = equipmentById(id);
  if (!item) return null;
  // Each weapon uses its own PNG; other gear uses measured atlas regions.
  const art = item.slot === 'weapon' ? weaponArtById(id) : null;
  const [x, y, width, height] = art?.bounds ?? equipmentArt.regions[item.icon];
  const extent = art
    ? Math.ceil(Math.max(width, height) * 1.08)
    : Math.max(width, height) + 16;
  return (
    <svg
      aria-hidden="true"
      className="equipment-icon"
      width={size}
      height={size}
      viewBox={`${x + (width - extent) / 2} ${y + (height - extent) / 2} ${extent} ${extent}`}
      shapeRendering="crispEdges"
    >
      <defs>
        <clipPath id={`gear-${uid}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
        <PalaceCutout id={`gear-alpha-${uid}`} bounds={[x, y, width, height]} />
      </defs>
      <image
        href={art?.src ?? equipmentArt.src}
        width={art?.width ?? equipmentArt.width}
        height={art?.height ?? equipmentArt.height}
        clipPath={`url(#gear-${uid})`}
        filter={`url(#gear-alpha-${uid})`}
      />
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

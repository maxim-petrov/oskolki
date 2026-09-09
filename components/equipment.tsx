'use client';
import { useId } from 'react';
import { PalaceCutout } from '@/components/palace-cutout';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_NAMES,
  EQUIPMENT_TIERS,
  equipmentById,
  equipmentSummary,
  type State,
} from '@/game/engine';

const REGIONS = [
  [51, 183, 250, 251],
  [346, 194, 271, 251],
  [646, 167, 288, 281],
  [991, 165, 200, 280],
  [51, 494, 279, 266],
  [363, 500, 245, 268],
  [640, 492, 300, 264],
  [987, 489, 206, 277],
  [44, 799, 286, 310],
  [364, 793, 244, 316],
  [638, 800, 302, 302],
  [977, 810, 226, 295],
];

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
  // The atlas is cropped by source coordinates, keeping the original pixels.
  const [x, y, width, height] = REGIONS[item.icon];
  const extent = Math.max(width, height) + 16;
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
        href="/art/pronoun-palace/equipment.png"
        width={1254}
        height={1254}
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
          const item = equipmentById(game.equipment[slot]);
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
  const item = equipmentById(id);
  if (!item) return null;
  const old = equipmentById(game.equipment[item.slot]);
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

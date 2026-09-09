'use client';
import type { CSSProperties } from 'react';
import { EquipmentIcon } from '@/components/equipment';
import { SkinIcon } from '@/components/skin-icon';
import { type Family, type Variant } from '@/game/engine';
import { weaponArtById } from '@/game/weapon-art';

// Blade tiles keep their family and special effects; only their equipped art changes.
export function BoardTileArt({
  family,
  variant = null,
  weaponId,
  size = 56,
}: {
  family: Family;
  variant?: Variant;
  weaponId: string | null;
  size?: number;
}) {
  if (variant === 'spiked' || variant === 'marked')
    return (
      <span className="board-weapon-art" aria-hidden="true">
        <SkinIcon name={family} size={size} />
        <span
          className="weapon-variant"
          style={{ fontWeight: 900, fontSize: 18 }}
        >
          {variant === 'spiked' ? '▲' : '+'}
        </span>
      </span>
    );
  if (family !== 'blade')
    return <SkinIcon name={variant ?? family} size={size} />;
  const weapon = weaponArtById(weaponId);
  return (
    <span
      className="board-weapon-art"
      data-weapon-id={weapon.id}
      aria-hidden="true"
      style={{ '--weapon-icon-size': `${size}px` } as CSSProperties}
    >
      <EquipmentIcon id={weapon.id} size={size} />
      {variant && (
        <span className={`weapon-variant variant-${variant}`}>
          <SkinIcon name={variant} size={22} />
        </span>
      )}
    </span>
  );
}

'use client';
import type { CSSProperties } from 'react';
import { SkinIcon } from '@/components/skin-icon';
import { type Family, type Variant } from '@/game/engine';
import { VectorWeapon, vectorWeaponId } from './vector-art';

function VariantBadge({ variant }: { variant: Exclude<Variant, null> }) {
  return (
    <span className={`weapon-variant variant-${variant}`}>
      {variant === 'spiked' || variant === 'marked' ? (
        <span className="weapon-variant-symbol">
          {variant === 'spiked' ? '▲' : '+'}
        </span>
      ) : (
        <SkinIcon name={variant} size={22} />
      )}
    </span>
  );
}

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
  const style = { '--weapon-icon-size': `${size}px` } as CSSProperties;
  if (family !== 'blade') {
    if (variant === 'spiked' || variant === 'marked')
      return (
        <span className="board-weapon-art" aria-hidden="true" style={style}>
          <SkinIcon name={family} size={size} />
          <VariantBadge variant={variant} />
        </span>
      );
    return <SkinIcon name={variant ?? family} size={size} />;
  }
  const weapon = { id: vectorWeaponId(weaponId) };
  return (
    <span
      className="board-weapon-art"
      data-weapon-id={weapon.id}
      aria-hidden="true"
      style={style}
    >
      <VectorWeapon id={weapon.id} size={size} mini />
      {variant && <VariantBadge variant={variant} />}
    </span>
  );
}

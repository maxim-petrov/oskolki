'use client';
import type { CSSProperties } from 'react';
import { SkinIcon } from '@/components/skin-icon';
import { type Family, type Variant } from '@/game/engine';
import { boardWeaponArtById } from '@/game/weapon-art';

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
  const weapon = boardWeaponArtById(weaponId);
  const [x, y, width, height] = weapon.bounds;
  const extent = Math.ceil(Math.max(width, height) * 1.08);
  return (
    <span
      className="board-weapon-art"
      data-weapon-id={weapon.id}
      aria-hidden="true"
      style={style}
    >
      <svg
        className="board-weapon-miniature"
        width={size}
        height={size}
        viewBox={`${x + width / 2 - extent / 2} ${y + height / 2 - extent / 2} ${extent} ${extent}`}
        aria-hidden="true"
      >
        <image href={weapon.src} width={weapon.width} height={weapon.height} />
      </svg>
      {variant && <VariantBadge variant={variant} />}
    </span>
  );
}

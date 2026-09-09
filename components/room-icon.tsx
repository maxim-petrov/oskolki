import { SkinIcon, type SkinIconName } from '@/components/skin-icon';
export const RoomIcon = ({ kind }: { kind: string }) => {
  return (
    <SkinIcon
      name={
        (
          {
            treasure: 'relic',
            battle: 'blade',
            elite: 'crown',
            event: 'relic',
            trial: 'spark',
            shop: 'coin',
            rest: 'heart',
            boss: 'crown',
          } as Record<string, SkinIconName>
        )[kind] ?? 'star'
      }
      size={34}
    />
  );
};

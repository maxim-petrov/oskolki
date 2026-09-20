import {
  COLORS,
  ITEMS,
  RARITIES,
  SPELLS,
  type ItemId,
  type Rarity,
} from './catalog.ts';
import { ENCOUNTERS, type EncounterKind } from './campaign.ts';
import type { Fighter } from './engine.ts';
// Weights are selected before build preferences. No off-tier fallback or early pity.
export const LOOT_WEIGHTS: Record<EncounterKind, number[][]> = {
  normal: [
    [98, 2, 0, 0, 0],
    [55, 40, 5, 0, 0],
    [15, 55, 28, 2, 0],
    [5, 22, 55, 15, 3],
  ],
  elite: [
    [35, 65, 0, 0, 0],
    [15, 60, 25, 0, 0],
    [0, 25, 60, 15, 0],
    [0, 10, 50, 32, 8],
  ],
  boss: [
    [0, 90, 10, 0, 0],
    [0, 0, 85, 15, 0],
    [0, 0, 45, 55, 0],
    [0, 0, 20, 60, 20],
  ],
};
export const SHOP_WEIGHTS = [
  [100, 0, 0, 0, 0],
  [60, 40, 0, 0, 0],
  [20, 45, 35, 0, 0],
  [5, 25, 60, 10, 0],
];
export function createOffers(
  hero: Fighter,
  room: number,
  _rareSeen: boolean,
  random: () => number,
) {
  const encounter = ENCOUNTERS[room];
  const directMagic = hero.spells.some((id) =>
    ['bolt', 'drain', 'palm'].includes(id),
  );
  let pool = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) =>
      !Object.values(hero.gear).includes(id) &&
      (directMagic ||
        !['stylus', 'carbonPaper', 'metronome', 'glassNib'].includes(id)) &&
      !(room >= 15 && id === 'scholar') &&
      !(id === 'insurance' && hero.items?.insuranceUsed),
  );
  const tags = new Set(
    Object.values(hero.gear).flatMap((id) => ITEMS[id!].tags),
  );
  tags.add('skull');
  tags.add('spell');
  for (const c of COLORS)
    if (hero.spells.some((id) => (SPELLS[id].cost[c] ?? 0) > 0)) tags.add(c);
  let legendaryOffered = false;
  const pick = (
    weights: number[],
    preference?: (id: ItemId) => boolean,
  ): ItemId => {
    const candidates = pool.filter(
      (id) => !legendaryOffered || ITEMS[id].rarity !== 'legendary',
    );
    const tiers = RARITIES.map((r, i) => ({
      r,
      weight: candidates.some((id) => ITEMS[id].rarity === r) ? weights[i] : 0,
    }));
    const total = tiers.reduce((n, t) => n + t.weight, 0);
    if (!total) throw new Error('No eligible items at this depth');
    let roll = random() * total;
    let rarity: Rarity = tiers.find((t) => t.weight > 0)!.r;
    for (const tier of tiers) {
      if (!tier.weight) continue;
      roll -= tier.weight;
      if (roll < 0) {
        rarity = tier.r;
        break;
      }
    }
    const tierPool = candidates.filter((id) => ITEMS[id].rarity === rarity);
    const preferred = preference ? tierPool.filter(preference) : tierPool;
    const options = preferred.length ? preferred : tierPool;
    const id = options[Math.floor(random() * options.length)];
    pool = pool.filter((candidate) => candidate !== id);
    if (rarity === 'legendary') legendaryOffered = true;
    return id;
  };
  const weights = LOOT_WEIGHTS[encounter.kind][encounter.biome];
  const guaranteed =
    encounter.kind === 'boss'
      ? weights.map((w, i) => (i < Math.min(3, encounter.biome + 1) ? 0 : w))
      : weights;
  // A blade fighter can already own every usable Very Rare and have spent
  // insurance. Keep the reward valid without duplicates or an early Legendary.
  const firstWeights = pool.some(
    (id) => guaranteed[RARITIES.indexOf(ITEMS[id].rarity)] > 0,
  )
    ? guaranteed
    : weights;
  const offers = [
    pick(
      firstWeights,
      (id) => ITEMS[id].slot === 'armor' || ITEMS[id].slot === 'weapon',
    ),
    pick(weights, (id) => ITEMS[id].tags.some((tag) => tags.has(tag))),
    pick(weights),
  ];
  const stock = Array.from({ length: 3 }, () =>
    pick(SHOP_WEIGHTS[encounter.biome]),
  );
  return {
    offers,
    stock,
    rareOffered: offers.some((id) => RARITIES.indexOf(ITEMS[id].rarity) >= 2),
  };
}

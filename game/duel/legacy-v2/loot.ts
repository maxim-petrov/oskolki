import {
  COLORS,
  ITEMS,
  RARITIES,
  SPELLS,
  type ItemId,
  type Rarity,
} from './catalog.ts';
import type { Fighter } from './engine.ts';
export const LOOT_WEIGHTS: number[][] = [
  [60, 35, 5, 0, 0],
  [30, 50, 18, 2, 0],
  [10, 45, 35, 9, 1],
  [0, 30, 50, 17, 3],
];
const rare = (id: ItemId) => RARITIES.indexOf(ITEMS[id].rarity) >= 2;
export function createOffers(
  hero: Fighter,
  room: number,
  rareSeen: boolean,
  random: () => number,
) {
  const equipped = Object.values(hero.gear);
  const directMagic = hero.spells.some((id) =>
    ['bolt', 'drain', 'palm'].includes(id),
  );
  const pool = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) =>
      !equipped.includes(id) &&
      (directMagic || !['stylus', 'carbonPaper'].includes(id)) &&
      !(room >= 2 && id === 'scholar') &&
      !(id === 'insurance' && hero.items?.insuranceUsed),
  );
  const tags = new Set(equipped.flatMap((id) => ITEMS[id!].tags));
  tags.add('skull');
  if (hero.spells.length) tags.add('spell');
  for (const c of COLORS)
    if (hero.spells.some((id) => (SPELLS[id].cost[c] ?? 0) > 0)) tags.add(c);
  const weights = LOOT_WEIGHTS[Math.min(3, room)];
  const pick = (
    candidates: ItemId[],
    allowed: (r: Rarity) => boolean = () => true,
  ) => {
    const tiers = RARITIES.map((r, i) => ({
      r,
      weight:
        allowed(r) && candidates.some((id) => ITEMS[id].rarity === r)
          ? weights[i]
          : 0,
    }));
    let n = random() * tiers.reduce((sum, t) => sum + t.weight, 0);
    let tier = tiers.find((t) => t.weight > 0)?.r;
    for (const t of tiers) {
      if (!t.weight) continue;
      n -= t.weight;
      if (n < 0) {
        tier = t.r;
        break;
      }
    }
    const options = candidates.filter((id) => ITEMS[id].rarity === tier);
    if (!options.length) throw new Error('Empty eligible loot pool');
    const id = options[Math.floor(random() * options.length)];
    pool.splice(pool.indexOf(id), 1);
    return id;
  };
  // Each lane has a purpose, but never prescribes an exact item or complete set.
  const useful = () =>
    pool.filter(
      (id) =>
        ITEMS[id].tags.includes('defense') ||
        id === 'paperKnife' ||
        (id === 'stylus' && hero.spells.some((s) => SPELLS[s].hostile)) ||
        id === 'bluePass',
    );
  const offers: ItemId[] = [pick(useful())];
  offers.push(
    pick(pool.filter((id) => ITEMS[id].tags.some((tag) => tags.has(tag)))),
  );
  const seen = rareSeen || offers.some(rare);
  offers.push(pick(room >= 2 && !seen ? pool.filter(rare) : pool));
  const stock = Array.from({ length: 3 }, () =>
    pick(
      pool.filter((id) => RARITIES.indexOf(ITEMS[id].rarity) <= 2),
      (r) => RARITIES.indexOf(r) <= 2,
    ),
  );
  return { offers, stock, rareOffered: seen || offers.some(rare) };
}

// A what-if patch: `npm run balance -- --patch=docs/balance/patches/example.mjs`.
// The module edits the game's content in place before the simulation starts (in every worker);
// the game itself does not change. The report goes to docs/balance/whatif/<patch name>/ and lists
// what moved against the main report.
import { ACTS } from '../../../game/content/acts.ts';
import { ITEMS } from '../../../game/content/items.ts';

// Tougher boiler room and directorate.
ACTS[2].hpMul = 70;
ACTS[3].hpMul = 110;

// The paper plane hits harder.
ITEMS.plane.apply = (m) => (m.planeOn4 += 20);

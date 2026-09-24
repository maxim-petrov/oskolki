# Осколки — agent contract

Browser pixel-art roguelike (Russian UI): single-tile swap match-3 fights inside Isaac-like floors of rooms, with items that rewrite board rules.

- Start: `npm run dev` (port 4531). Build: `npm run build`. Tests: `npm test`. Balance: `npm run sim [runs] [policy]`.
- Keep `.openai/hosting.json` project_id unchanged; never store credentials.
- Do not import proprietary assets or decompiled code from reference games (Isaac, 10,000,000, Mirror, Puzzle Quest). Mechanics may be inspired, content must be original.

## Architecture

- `game/` — the whole game logic: pure TypeScript, deterministic, no DOM, no `Math.random` (use `game/rng.ts` streams on the run state). `dispatch(run, action) → { run, events }` is the only way to change state.
- `game/content/` — enemies, items, floors, characters as data. New items/enemies go here; effects are implemented in `game/combat.ts` / `game/run.ts` via `Mods` flags.
- `render/` — canvas renderer (640×360 internal, integer upscale). It replays engine events as animations and never decides game outcomes. Visual randomness (particles) may use `Math.random`.
- `render/art/*.ts` — sprites as text (`SpriteDef`, palette names from `render/palette.ts`). Registered automatically by `render/assets.ts`. Preview: `node scripts/sprite-sheet.mjs render/art/<file>.ts`.
- `docs/GDD.md` — the single design document. `docs/ART.md` — the art contract. Update them when rules or style change; do not create parallel versioned docs.

## Rules of the prototype stage

- One active engine, no frozen legacy copies. When the save format or rules change incompatibly, bump `RULES` in `game/run.ts`; old saves are simply discarded.
- Numbers are tuned with `npm run sim`, then with people. A bot win rate is a diagnostic, not proof of fun. Targets live in GDD §11.
- Pixel crispness: integer positions, no rotation or fractional scaling of sprites, palette colours only, text via `render/font.ts` (Tiny5 on the 8 px grid).
- Earlier combat cores are preserved in git tags `core/classic-shift-lab`, `core/shared-board-duel`, `core/mirror-combat`, `core/rebirth-shift` (row/column shifts, before single-tile swaps).

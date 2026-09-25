# Осколки — agent contract

Browser pixel-art roguelike deckbuilder (Russian UI) in a bleak office: the deck is the tiles of a 6×6 swap match-3 board, a move's tiles add up to damage × mult (Balatro-like), acts are Slay-the-Spire-like maps, death wakes the intern at his desk in the office hub.

- Start: `npm run dev` (port 4531). Build: `npm run build`. Tests: `npm test`. Balance: `npm run sim [runs] [policy]`.
- Keep `.openai/hosting.json` project_id unchanged; never store credentials.
- Do not import proprietary assets or decompiled code from reference games (Isaac, 10,000,000, Mirror, Puzzle Quest). Mechanics may be inspired, content must be original.

## Architecture

- `game/` — the whole game logic: pure TypeScript, deterministic, no DOM, no `Math.random` (use `game/rng.ts` streams on the run state). `dispatch(run, action) → { run, events }` is the only way to change state.
- `game/content/` — cards (tiles of the deck), enemies, items (relics, actives, pockets), acts and characters, events — as data. Card rules live in `scoreTile` (`game/combat.ts`), relic effects via `Mods` flags, event effects through `EventApi`.
- `render/` — canvas renderer. The internal resolution follows the screen (`render/view.ts`: 640×360 on 16:9, 512×384 on iPad, ~290×630 on phones), always integer-scaled; every screen reads positions from the layout `L`, never from constants. It replays engine events as animations and never decides game outcomes. Visual randomness (particles) may use `Math.random`.
- Screens: `title.ts` → `intro.ts` (first time) → `hub.ts` (the office) → `runview.ts` (a shift: `combatview.ts`, `mapview.ts`, `runscreens.ts`) → ash → `hub.ts` again. The stage is a low room from `render/stage.ts` drawn through a lit buffer.
- `render/art/*.ts` — sprites as text (`SpriteDef`, palette names from `render/palette.ts`). Registered automatically by `render/assets.ts`. Preview: `node scripts/sprite-sheet.mjs render/art/<file>.ts`.
- `docs/GDD.md` — the single design document. `docs/ART.md` — the art contract. Update them when rules or style change; do not create parallel versioned docs.

## Rules of the prototype stage

- One active engine, no frozen legacy copies. When the save format or rules change incompatibly, bump `RULES` in `game/run.ts`; old saves are simply discarded.
- Numbers are tuned with `npm run sim`, then with people. A bot win rate is a diagnostic, not proof of fun. Targets live in GDD §13.
- QA in a browser: `window.__osk` (`newRun(seed)`, `hub()`, `intro()`, `auto(true)`, `state()`, `act(a)`, `warp(act)`, `layout()`, `errors`, `perf()`). Check wide and tall layouts (e.g. 1920×1080, iPad 1024×768 and 768×1024 @2, iPhone 390×844 @3).
- Pixel crispness: integer positions, no rotation or fractional scaling of sprites, palette colours only. This branch (`feat/office-palace`, the «Дворец слов» look) draws on a screen-resolution canvas that carries the pixel scale as its transform; text is a serif via `render/font.ts` (smooth letters over crisp sprites). See the top of `docs/ART.md`.
- Earlier combat cores are preserved in git tags `core/classic-shift-lab`, `core/shared-board-duel`, `core/mirror-combat`, `core/rebirth-shift` (row/column shifts), `core/rebirth-isaac` (Isaac-like rooms and hearts, before the office deckbuilder).

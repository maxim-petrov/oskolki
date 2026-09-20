# Осколки

Browser prototype of a turn-based match-3 roguelike. Russian interface.

- Start: npm run dev, fixed port 4531. Build: npm run build.
- Keep deterministic combat and board rules separate from React rendering.
- Core randomness uses a saved seed; no Math.random in the engine.
- The game uses cyclic full-row/full-column shifts, four matching families and two inherited tile variants.
- Test combat state transitions, resource limits, rewards, save/resume, and a complete route when changing rules.
- Settings expose balance and animation tuning in the interface. Modified runs do not affect the normal win streak.
- Keep .openai/hosting.json project_id unchanged; never store source credentials.
- Do not import proprietary assets or decompiled implementation from reference games.

## Game design direction

- For combat, item, reward, route or progression changes, read [docs/game-design-v0.2.md](docs/game-design-v0.2.md) and [docs/replayability.md](docs/replayability.md). The latter preserves the historical audit; current rules and delivery status are in [docs/build-interactions-v02.md](docs/build-interactions-v02.md) and [docs/post-victory-v02.md](docs/post-victory-v02.md). Current multi-action turns, fogged routes, squads and risk relics are specified in [docs/tactics-v03.md](docs/tactics-v03.md); read it for gameplay changes. For rules 6 and subsequent interactions read [docs/interactions-v04.md](docs/interactions-v04.md); the supplied specification is archived in docs/isaac-mechanics-spec.md. Opening pacing for new rules-7 runs is specified in [docs/difficulty-curve-v05.md](docs/difficulty-curve-v05.md); preserve rules 1–6 saves. Stage D requires player observations. Player validation remains separate from implementation.
- Build replayability through finds that change board decisions, mastery of different builds, and meaningful goals after victory. Keep the current 12 core relics available in fresh runs; future unlocks expand options without permanent stat grinding.
- Official challenges have their own completion marks; they never change ordinary achievements, unlocks, wins or streaks. Laboratory settings and manual-seed repeats award neither normal nor challenge progression.
- Content counts, possible seeds and passing engine tests do not establish fun or hundreds of hours of replayability. Record what new decision a feature adds and what remains to be tested with players.

## Mandatory visual direction

- Read [docs/visual-style.md](docs/visual-style.md) before any artwork, palette, UI or animation-style change. It is the canonical visual contract for both biomes and every screen.
- Preserve the original hero and purple filing-cabinet enemy in `public/art/pronoun-palace/actors.png` as the visual anchors. Compare new assets with them at actual gameplay size.
- Use flat Pronoun Palace-like pixel cartoons: thick stepped dark contours, simple silhouettes, few flat shades, quiet backgrounds and light paper UI. Do not substitute detailed/painterly pixel art or realistic dungeon scenes.
- Isaac / Slay the Spire references guide mechanics only. Historical palette experiments are superseded by the visual contract.
- Use shared `--palace-*` tokens for extension UI. Do not apply global sepia, brightness or saturation filters to reconcile drifting art. Keep genuine PNG transparency, measured sprite bounds and weapon grips.

## Office and story shell

- Read [docs/office-story-v01.md](docs/office-story-v01.md) for hub, menu or narrative changes. The office is the waking world between expeditions; the boss door leads to the existing rooms, defeat returns to the desk and spinning top.
- Office position/dialogue memories must stay separate from seeded combat. Preserve old active saves, idempotent defeat/progression, explicit confirmation before abandoning a run, and paused trial time in menus.

## Ветка feat/minimal-vector

На этой ветке действует docs/minimal-vector.md: вся активная графика — чистый SVG и CSS. Предыдущий pixel-art контракт относится к исходной ветке. Сохранять полный движок, офис, кампанию и save/RNG контракты. Не возвращать raster в интерфейс.

## Ветка feat/prototype-lab

- Read docs/prototype-lab.md for the test workflow and deliberately reduced surface. The minimalist SVG/CSS contract above also applies here.
- `/` is the laboratory; `/campaign` preserves the full game. Both must use the same authoritative engine and renderer. Never fork combat math into a lab-only implementation.
- Laboratory saves, builds, history and mechanic marks use only `oskolki.lab.*` storage. They must not change campaign saves, achievements, unlocks, official challenges or streaks.
- Replay records verify initial, intermediate and final state through the real action dispatcher. Bump LAB_VERSION when a rule or scenario change makes old replays incompatible; report incompatibility, never silently reinterpret them. Preserve campaign rules 1–6 compatibility.
- Compare the same seed and change one variable at a time. A bot win, a mechanic mark, a passing test or a large content pool is not evidence of fun or retention. Human observations remain a separate step before expanding content.

## Branch contract: shared-board duels

On `feat/shared-board-duels`, the user's latest attached Puzzle Quest reference replaces the former cyclic-shift combat contract. Read `docs/shared-board-duels.md`. The new authoritative rules are in `game/duel/`; both duel and route modes use them. Keep legacy engine files and old lab/campaign saves intact. Only `oskolki.duel.*` stores the new schema, validated by command replay. Do not graft a second combat implementation into React or the AI. The AI must not simulate unknown refills. SVG-only, restrained black-and-white UI with semantic resource colors. Preserve the existing hosting project ID.

For item/reward changes in shared-board rules 2, read `docs/duel-items-v2.md`. Preserve four-slot tradeoffs, physical-collection triggers, per-action/initiative/encounter/run limits, seeded loot and the legacy-v1 replay/continuation path. Custom test gear must not award normal achievements. Do not change rarity labels without updating the catalog, loot weights and UI.

For shared-board rules 3, read `docs/duel-biomes-v3.md`. The active route has four biomes / 20 encounters; rarity is gated by biome and encounter kind, not global room pity. Preserve frozen v1/v2 journals and continuation (`legacy-v1/`, `legacy-v2/`). Additive item effects require physical-collection limits, explicit health/resource costs and meaningful slot conflicts. New catalogs must preserve usable loot pools after equipped/dead items are excluded. `scripts/duel-balance.mjs` is a visible-policy diagnostic, not human balance evidence.

For shared-board rules 4, read `docs/duel-items-v4.md` and the exact contracts in `docs/duel-items-v4-proposal.md`. Preserve frozen v3 alongside v1/v2. Weak items, explicit drawbacks and speculative combinations are intentional; rarity is not guaranteed power, and loot must not guarantee missing partners. Keep ordinary swaps immediate; the optional yield choice is a replayable command, never a second combat action. No unknown refill in previews or AI.

## Mirror-inspired match combat (`feat/mirror-match-combat`)

This branch experiments with the user-supplied local `mirror-remake-mechanics.html` reference. The active `/` and `/campaign` use `game/mirror`; `/duel` keeps the frozen shared-board prototype available. Read `docs/mirror-match-combat.md` and `docs/mirror-item-compatibility.md` before changing these rules. Do not retrofit Mirror timing into old duel saves or modify their board geometry.

Mirror core is an 8-column × 7-row player-only board: four base channels, automatic skills, enhanced stones and free S activation; enemies use telegraphed action countdowns. Each successful swap advances time once after all cascades; invalid swaps, UI animation and S activation do not. Natural 4+ groups create enhanced stones, not extra turns. Passive resonance exists only for item synergies; it never gates a manual spell menu. Preserve the complete 60-item adapter, real drawbacks, physical collection versus gifted income, and per-action/per-enemy-cycle/per-battle/per-run limits. Enemy delay has one common cap per actual enemy action.

New journals use `oskolki-mirror-2` and `oskolki.mirror.session.v2`. Read `docs/mirror-defense-v2.md` for current protection, enemy timing and income rules. Default mend grants temporary barrier, never HP; bounded item healing and inter-room recovery remain. Free S shares the preceding successful swap's proc/income scope. Enemy multi-hit damage is a total budget; a queued phase applies only after the currently announced action. Preserve frozen Mirror v1 and its existing browser key at `/mirror-v1`; never replay v1 commands with v2 math. Keep all simulation, enemy damage, item payments and loot in deterministic engine modules, independent from animation. Preview must not inspect future random refills. `scripts/mirror-balance.mjs` is a visible-board diagnostic, not evidence of human difficulty or long-term engagement. Run the old regression suite as well as new board, engine, item and replay tests. Active UI remains minimal SVG/CSS only, and must support click, swipe/drag, keyboard and reduced motion.

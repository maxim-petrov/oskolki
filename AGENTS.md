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

- For combat, item, reward, route or progression changes, read [docs/game-design-v0.2.md](docs/game-design-v0.2.md) and [docs/replayability.md](docs/replayability.md). The latter preserves the historical audit; current rules and delivery status are in [docs/build-interactions-v02.md](docs/build-interactions-v02.md) and [docs/post-victory-v02.md](docs/post-victory-v02.md). Current multi-action turns, fogged routes, squads and risk relics are specified in [docs/tactics-v03.md](docs/tactics-v03.md); read it for gameplay changes. Player validation remains separate from implementation.
- Build replayability through finds that change board decisions, mastery of different builds, and meaningful goals after victory. Keep the current 12 core relics available in fresh runs; future unlocks expand options without permanent stat grinding.
- Official challenges have their own completion marks; they never change ordinary achievements, unlocks, wins or streaks. Laboratory settings and manual-seed repeats award neither normal nor challenge progression.
- Content counts, possible seeds and passing engine tests do not establish fun or hundreds of hours of replayability. Record what new decision a feature adds and what remains to be tested with players.

## Mandatory visual direction

- Read [docs/visual-style.md](docs/visual-style.md) before any artwork, palette, UI or animation-style change. It is the canonical visual contract for both biomes and every screen.
- Preserve the original hero and purple filing-cabinet enemy in `public/art/pronoun-palace/actors.png` as the visual anchors. Compare new assets with them at actual gameplay size.
- Use flat Pronoun Palace-like pixel cartoons: thick stepped dark contours, simple silhouettes, few flat shades, quiet backgrounds and light paper UI. Do not substitute detailed/painterly pixel art or realistic dungeon scenes.
- Isaac / Slay the Spire references guide mechanics only. Historical palette experiments are superseded by the visual contract.
- Use shared `--palace-*` tokens for extension UI. Do not apply global sepia, brightness or saturation filters to reconcile drifting art. Keep genuine PNG transparency, measured sprite bounds and weapon grips.

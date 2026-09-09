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

## Mandatory visual direction

- Read [docs/visual-style.md](docs/visual-style.md) before any artwork, palette, UI or animation-style change. It is the canonical visual contract for both biomes and every screen.
- Preserve the original hero and purple filing-cabinet enemy in `public/art/pronoun-palace/actors.png` as the visual anchors. Compare new assets with them at actual gameplay size.
- Use flat Pronoun Palace-like pixel cartoons: thick stepped dark contours, simple silhouettes, few flat shades, quiet backgrounds and light paper UI. Do not substitute detailed/painterly pixel art or realistic dungeon scenes.
- Isaac / Slay the Spire references guide mechanics only. Historical palette experiments are superseded by the visual contract.
- Use shared `--palace-*` tokens for extension UI. Do not apply global sepia, brightness or saturation filters to reconcile drifting art. Keep genuine PNG transparency, measured sprite bounds and weapon grips.

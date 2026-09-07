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

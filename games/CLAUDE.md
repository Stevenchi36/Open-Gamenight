# games/

Each folder here is one game. `imposter/` is the reference implementation: when unsure how a game does something, read how Imposter does it. The root `CLAUDE.md` invariants (pure games, only `view()` leaves the server, the game boundary) apply to every file here.

## What a game is

A game is a description the core runs, not a class to extend. The core already owns the room lifecycle for every game: create/join/reconnect/leave, lobby, settings sync, start and back-to-lobby, host handover, kicks, timers, notices, per-player views, and on the client the home page, lobby, room shell and "your move" glow. A game supplies only what differs:

- **Server:** a `GameModule` object built with `defineGame` (`packages/core/src/contract.ts`): `init`/`reduce`/`onTimer`/`view`, settings and player-action schema (timer actions are a separate type, handled by `onTimer`), player limits, `secrets`, and optional lifecycle hooks and integrations (migrations, `prepareRound`, admin/public routers, MCP tools, categories).
- **Rules:** `RULES.md` in the game folder: short, player-facing Markdown (goal, a round, scoring, settings, tips). The room's **How to play** dialog shows it, so keep it in step with the game's `PLAN.md` section whenever rules or settings change. Read it for a quick picture of how a game plays.
- **Client:** a `GameClientModule` (`packages/core/src/client.ts`): lazy `PlayView` and `SettingsView`, `rules` (loads `../RULES.md?raw`), optional `adminPages`, and `needsAction(view, me, room)` so the shell's glow knows when the game is waiting on this player.

## Reuse first

Build from the shared pieces, and grow them rather than copying:

- `@wsfg/core/kit` (`packages/core/src/kit.ts`): pure reducer helpers: presence, `pickConnected`, `nextTurnOrder` + `playerOrderSchema`, scores, `tallyVotes`/`dropBallots`, the `secretBallots` leak spec, `DISCONNECT_GRACE_MS`.
- `@wsfg/core/ui` (`packages/core/src/ui/`): play-view helpers (`nameOf`, `isHost`, `useCountdown`, ...) and components (`StatusCard`, `HoldToReveal`, `SubmitField`, `PlayerPicker`, `VoteBreakdown`, `ScoreBoard`, `NextRoundButton`, ...).
- `SettingSlider`, `SettingSelect`, `SettingToggle`: global components for a `SettingsView`, used without imports.

When a game needs something a second game could use, add it to `kit` or `ui` (with a core test for `kit`) and record it in `docs/decisions.md`. Keep it in the game only when it carries that game's rules or words.

## Adding a game

1. **Spec.** Write the game's section in `PLAN.md` (rules, settings, state machine, actions, view, secrets) and its decisions in `docs/decisions.md`. Done when every phase, action and secret is named there.
2. **Scaffold** a folder shaped like `imposter/`: `shared/` (`meta`: id, name, description and player limits, spread into both the server and client modules; settings schema and defaults, client action schema, view types), `server/` (`game.ts` with the pure module; `index.ts` adding integrations), `client/` (`index.ts` manifest, `PlayView.vue`, `SettingsView.vue`), `test/`, `RULES.md`, plus `package.json` (`@wsfg/game-<id>`, same `exports` as Imposter) and `tsconfig.json`.
3. **Register** it: one entry in `games/index.ts`, one in `games/client.ts`, and the package in `games/package.json` dependencies, then `pnpm install`.
4. **Test** with `createSim` and `runLeakTest` from `@wsfg/core/testing`: game rules in `test/game.test.ts`, a `runLeakTest` suite covering every settings combination that changes what views show, and `needsAction` per phase. Done when the leak test reaches every phase and reports no leaks.
5. **Finish** with the root `CLAUDE.md` workflow checks (test, typecheck, lint, client build), then play a round on the dev-players page (`docs/dev-testing.md`).

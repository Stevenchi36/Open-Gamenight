# games/

Each folder here is one game. `imposter/` is the reference implementation: when unsure how a game does something, read how Imposter does it. The root `CLAUDE.md` invariants (pure games, only `view()` leaves the server, the game boundary) apply to every file here.

## What a game is

A game is a description the core runs, not a class to extend. The core already owns the room lifecycle for every game: create/join/reconnect/leave, lobby, settings sync, start and back-to-lobby, host handover, kicks, timers, notices, per-player views, and on the client the home page, lobby, room shell and "your move" glow. A game supplies only what differs:

- **Server:** a `GameModule` object built with `defineGame` (`packages/core/src/contract.ts`): `init`/`reduce`/`onTimer`/`view`, settings and player-action schema (timer actions are a separate type, handled by `onTimer`), player limits, `secrets`, and optional lifecycle hooks and integrations (migrations, `prepareRound`, admin/public routers, MCP tools, categories).
- **Design:** `DESIGN.md` in the game folder: the spec, then the game's decisions (one line each, with the reason). Platform material stays in `PLAN.md` and `docs/decisions.md`.
- **Rules:** `RULES.md` in the game folder: short, player-facing Markdown (goal, a round, scoring, settings, tips). The room's **How to play** dialog shows it, so keep it in step with the game's `DESIGN.md` whenever rules or settings change. Read it for a quick picture of how a game plays, and the game's `DESIGN.md` (spec, then decisions) before changing it.
- **Client:** a `GameClientModule` built with `defineGameClient<View, Settings>` (`packages/core/src/client.ts`): lazy `PlayView` (gets `view`, `send`, `me`, `room`, typed `settings`, `serverNow`) and `SettingsView`, `rules` (loads `../RULES.md?raw`), optional `adminPages`, `needsAction(view, me, room, settings)` so the shell's glow knows when the game is waiting on this player, and a `SpectatorView` for the watch page (a TV for the room). The contract marks it optional, but every game ships one (see Spectators and animation below). It gets `view`, `room`, `settings`, `serverNow` but no `send` or `me`, and the view is the one built for `SPECTATOR_ID` (an outsider's, like a late joiner's). Its root is core `SpectatorLayout` (the game in the default slot, scores and history in `#side`), which keeps a TV from ever scrolling. Pass `SPECTATOR_ID` as `me` to helpers so nothing reads "you". The leak test already checks the spectator.

## Spectators and animation

`SPECTATOR_VIEWS.md` has the how-to and the animation rules; read it before building either.

- **Every game has a spectator view.** A new game isn't done without its `SpectatorView`, sized for a TV, plus a "Watch page" bullet in its `DESIGN.md`. If the TV needs more than the outsider view shows, add only public data to `view()`: the TV is in every player's sight, so it can show only what the least-informed player knows.
- **Animate where it helps people follow play:** moves landing (marks, discs, lines, cards), reveals, a phase or result arriving, the turn marker on the TV. Skip it where nothing changes hands or the motion would only slow play. Every game with a winner celebrates with `WinCelebration`, on the play view and the TV; a game about a loser (Old Maid) ends with `LoseReveal` instead, unless that round has a winner too (a won Royale).
- **Games announce what happens** to screen readers: `useAnnounce` from `@ogn/core/ui` in the `PlayView`, comparing each view with the one before and returning a sentence. Turn-based games read each new move (the move log's text where there is one); party games read each round's prompt (its third argument reads round 1's when the game has just started), phase changes, who's done (`progressText`) and the round's result, from a pure `client/announce.ts` that imports `@ogn/core/ui/announce` and `/helpers`, not `@ogn/core/ui`, so it can be tested. Never announce a secret: the phone reads aloud. The room already says "Your move" and the celebrations announce results.
- **Animations are client only:** they go in the shared board/table components so both views get them, derive from view changes (never on first render, so joining or opening the TV mid-game doesn't replay moves), and are switched off by `prefers-reduced-motion`. Plain Vue transitions and CSS, Web Animations for card flights, no library.

## Reuse first

Build from the shared pieces, and grow them rather than copying:

- `@ogn/core/kit` (`packages/core/src/kit.ts`): pure reducer helpers: presence, `pickConnected`, `nextTurnOrder` + `playerOrderSchema`, scores and `placings`, `tallyVotes`/`dropBallots`, the `secretBallots` leak spec, `moveHistorySchema` + `visibleMoves` and its `hiddenMoves` leak spec, `DISCONNECT_GRACE_MS`, and cards (`standardDeck`, `deal`, `sortCards`, `rankName`, `Card`/`Rank`/`Suit`, `rankSchema`).
- `@ogn/core/ui` (`packages/core/src/ui/`): play-view helpers (`nameOf`, `isHost`, `useCountdown`, ...) and components (`StatusCard`, `HoldToReveal`, `SubmitField`, `PlayerPicker`, `VoteBreakdown`, `ScoreBoard`, `NextRoundButton`, `PlayingCard`, `CardTable`, `CardCount` (a seat's face-down hand and count), `OrderList`, `MoveLog` + `moveLogEntries`, `MoveLogDialog`, `WhoAnswered`, `WinCelebration` + `winTitle`/`scoreStandings`, `LoseReveal`, `TurnOrder`, `SpectatorLayout`, `CountdownTimer` (seconds left to a deadline), `ProgressCount` ("3 / 5 voted" with a bar); `packages/core/test/ui-docs.test.ts` fails when a component exported from `ui/index.ts` is missing here), `announce` for screen-reader announcements, and card motion (`CardFlight`, `dealFlights`, `useArrivals`: see the Gone Fishin' client in `gonefishin/DESIGN.md`).
- `@ogn/core/library` (server only): batches for library games: `resolveBatch` when adding, `recentOrder` for a "Recently added" pick, `newestBatch`/`newestBatchStats`, `removeUsed` for the admin's Clear used, and `BATCH_RULE`/`batchField` for MCP add tools.
- `SettingSlider`, `SettingSelect`, `SettingToggle`: global components for a `SettingsView`, used without imports.
- Icons: write MDI names as usual (`icon="mdi-sheep"`), but only those listed in `apps/client/src/plugins/icons.ts` are bundled. Add a line there for a new one; `apps/client/test/icons.test.ts` fails on any name that's missing. A name built at runtime (`` `mdi-dice-${face}` ``) needs every value listed and a case in that test.

When a game needs something a second game could use, add it to `kit` or `ui` (with a core test for `kit`) and record it in `docs/decisions.md`. Keep it in the game only when it carries that game's rules or words.

## Naming

Never name a game, or its pieces and branding, after a trademarked game (Connect Four, UNO, Wits & Wagers, Herd Mentality): mechanics are free to use, names aren't. Give it a custom name (Drop Line, Last Card, Ballpark, Flock), or a traditional generic one nobody owns (Tic-Tac-Toe, Cheat, Dots and Boxes). The id follows the name, so settle it before scaffolding, and record why in the first entry of its `DESIGN.md` decisions.

## Accessibility

Every game has to be playable by keyboard and with a screen reader. `pnpm lint` (eslint-plugin-vuejs-accessibility) checks native elements, and `apps/client/test/a11y.test.ts` checks the Vuetify mistakes it can't see; neither covers the rest of this list:

- **Anything tappable is a button.** A native `<button>`, a `v-btn`, or a `v-card` with `tag="button"`; a card holding buttons of its own gets a transparent button over it instead (Ballpark's `SlotBoard`, Flock's `GroupList`). Icon-only buttons get an `aria-label` naming what they do, and selection is `aria-pressed`.
- **The board can be read.** Each square, column or line's name says what's there ("Column 3: red, blue, 4 empty"), and a board of many targets is one Tab stop with arrow keys (Dots and Boxes).
- **Colour is never the only cue**, and text keeps 4.5:1 (3:1 for large bold text) on whatever colour it sits on.
- **Secrets go through `HoldToReveal`**, and other players' hands through `CardCount`.
- **Each new move is announced** with `useAnnounce` (see Spectators and animation above).
- **Check by hand** with a screen reader and keyboard only (`docs/dev-testing.md`, Screen readers and keyboard).

## Adding a game

1. **Spec.** Write the game's `DESIGN.md`, shaped like `imposter/DESIGN.md`: the spec (rules, settings, state machine, actions, view, secrets, client), then its decisions, one line each with the reason. Add it to the games list in `PLAN.md` section 7. Done when every phase, action and secret is named there.
2. **Scaffold** a folder shaped like `imposter/`: `shared/` (`meta`: id, name, description, styles and player limits, spread into both the server and client modules; settings schema and defaults, client action schema, view types), `server/` (`game.ts` with the pure module; `index.ts` adding integrations), `client/` (`index.ts` manifest, `PlayView.vue`, `SettingsView.vue`, `SpectatorView.vue`, with animations per the section above), `test/`, `RULES.md`, plus `package.json` (`@ogn/game-<id>`, same `exports` as Imposter) and `tsconfig.json`.
3. **Register** it: one entry in `games/index.ts`, one in `games/client.ts`, and the package in `games/package.json` dependencies, then `pnpm install`.
4. **Test** with `createSim` and `runLeakTest` from `@ogn/core/testing`: game rules in `test/game.test.ts`, a `runLeakTest` suite covering every settings combination that changes what views show, and `needsAction` per phase. Done when the leak test reaches every phase and reports no leaks. A game with nothing hidden declares `secrets: []` and has no leak test (Tic-Tac-Toe).
5. **Finish** with the root `CLAUDE.md` workflow checks (test, typecheck, lint, client build); `apps/server/test/registry.test.ts` fails until the game is registered under its folder name and ships `DESIGN.md` (with a Watch page section), `RULES.md`, `rules`, `needsAction`, a `SpectatorView`, `useAnnounce` and `WinCelebration`/`LoseReveal` on both views (a game with no game winner is listed there with its reason), and lint fails on imports across the game boundary. Then play a round on the dev-players page (`docs/dev-testing.md`) with a spectator window open, and one seat by keyboard with a screen reader on (the Accessibility list above).

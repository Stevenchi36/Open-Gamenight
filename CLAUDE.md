# ws-family-games

Multiplayer party-game platform (pnpm workspace, TypeScript, Node 26). Word Imposter is the first game and the reference implementation for future ones.

- `PLAN.md`: the design spec. Read the relevant section before building or changing a feature.
- `games/<id>/RULES.md`: each game's player-facing rules, shown in the room's How to play dialog. Update it with any rule or setting change.
- `docs/decisions.md`: every design decision with its reason. Check it before changing behaviour. When you make or change a decision, add or edit its one-line entry there in the same change.
- `docs/mcp.md`: read before touching MCP tools, or when working with the word library through the `ws-family-games` MCP server.
- `docs/dev-testing.md`: manual testing in dev, including the dev-players page (several players in one window) and the `.env` origin it needs. Keep it current when changing `dev-players.html`, `packages/core/src/ui/storage.ts` or room join/reconnect behaviour.

## Invariants

- **Pure games.** A game's `init`/`reduce`/`onTimer`/`view`/lifecycle hooks are pure: randomness from `ctx.rng`, time from `ctx.now`, timers as `schedule`/`cancel` effects, I/O only in `prepareRound`. That purity is what makes `createSim` tests work. State must also stay plain JSON data (`createSim` checks it), which keeps persisting rooms possible later.
- **Only `view()` leaves the server.** Per-player views are the secrecy boundary. Every game declares `secrets`, and its leak test (`runLeakTest`) must stay green. A new field in a view is a new thing to check against `secrets`.
- **Game boundary.** Within the repo, games import only from `@wsfg/core/*` and their own folder; server services arrive through `ServerServices`. Game tables are prefixed `<gameId>_`. The one shared table is core `categories`: games read/join it filtered by their own `game_id`, reference it by foreign key, and write through `services.categories`.
- **Server-side auth.** Every admin and game-admin route sits behind `requireAdmin` + the Origin check (the core mounts them); `create_room` needs a session. Client guards are UX only. IP-based limits use `clientIp()`.
- **Reuse before writing.** Code a second game could use lives in `packages/core`: `@wsfg/core/kit` (`src/kit.ts`, pure reducer helpers) and `@wsfg/core/ui` (`src/ui/`, play-view helpers and Vuetify components). `src/ui` is browser-only: core's `tsc` skips it and the client's `vue-tsc` checks it. `games/CLAUDE.md` covers what a game supplies, what the core already does, and the steps to add a game.
- **Registries are static.** A new game is one entry in `games/index.ts` and one in `games/client.ts`.

## Code conventions

- Node runs the server's TypeScript directly (type stripping), with no build step. So: relative imports carry the `.ts` extension, and code uses erasable syntax only (plain classes with declared fields, union types for enumerations, `import type` for types). Workspace packages export their `.ts` source.
- SQLite is `node:sqlite` (`DatabaseSync`): synchronous, with no transaction helper. Wrap multi-statement writes in `transaction()` from `apps/server/src/db.ts`, or `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` in game code. Match constraint errors on the primary code (`errcode & 0xff === 19`) plus the message; extended codes vary (`ON DELETE RESTRICT` reports 1811).
- Migrations are append-only: add a new numbered migration and leave applied ones exactly as they are (the one exception, squashing after a game id rename, is in `docs/decisions.md`). Core migrations run before every game's.
- The MCP process and everything it imports write logs to stderr (the shared logger, `console.error`), because stdout is the protocol.
- AI calls go through `services.ai` (one strict tool, `tool_choice: auto`, validated output); the model and caps come from env.
- Comments explain *why*; keep them brief and match the surrounding density.
- Text sizes are Vuetify 4 classes (`text-headline-small`, `text-body-medium`, ...). Vuetify 3's `text-h5`, `text-body-2`, `text-caption`, `text-overline` don't exist in 4 and silently do nothing (mapping in `docs/decisions.md`).

## Agent skills

- `.claude/skills/` holds Better Auth's official skills (see `docs/decisions.md`). They're generic, so where they disagree with this repo, follow the repo. The schema migrates at boot (`createAuth`); there is no `npx auth migrate` step. The client IP reaches Better Auth through `INTERNAL_IP_HEADER`, never `x-forwarded-for`. Public sign-up stays closed.

## Workflow

- Done means `pnpm test`, `pnpm typecheck` and `pnpm lint` all pass, plus `pnpm --filter @wsfg/client build` when client or `games/*/client` code changed.
- Write multi-line file content with the Write/Edit tools; Git Bash heredocs on this Windows machine have silently truncated files.
- Create a new file before writing the import that references it. Vite's dev server caches a failed import, doesn't notice new files in `games/*`, and only recovers when `pnpm dev` restarts.
- After adding or removing props in `PlayViewProps` (`packages/core/src/client.ts`) or a game's `PhaseProps` (`client/props.ts`), restart `pnpm dev`. Vue's compiler caches the prop types it resolves per file and the Vue plugin clears only the file that changed, so `PhaseProps` (an alias in `props.ts`, which Vite doesn't watch) keeps the old prop list and a new prop arrives as `undefined`. Changes to view or settings types, and production builds, are unaffected.
- Commit after each self-contained change. Line endings are LF (`.gitattributes`).
- Dev data lives in `data/` (gitignored). The dev server migrates on start, so schema changes apply to the developer's real `data/games.db` as soon as `pnpm dev` reloads: verify migrations against existing rows, not only fresh databases.

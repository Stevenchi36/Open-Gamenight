# ws-family-games: Build Plan

A self-hostable multiplayer party-game platform for groups playing together on their phones. The first game is **Word Imposter** (3-12 players). The platform core owns rooms, connections, auth, reconnect, timers and admin; each game is a plug-in module that implements a small, pure contract.

**Stack:** TypeScript everywhere. **Express 5 + `ws`** backend, **Vue 3 (Vite) + Vuetify 4** frontend, **Better Auth** for accounts, **SQLite** (Node's built-in `node:sqlite`) for data, **pnpm workspaces**, **Vitest**. Room creators must be logged in; guests join with just a name. Admins get a panel (users, plus pages contributed by games, e.g. Imposter's word library with Claude-powered generation). A stdio **MCP server** exposes game tools (e.g. adding words) to Claude Code/Desktop.

The repo starts **empty** (greenfield): nothing is installed yet. Decisions and their reasons are listed in [`docs/decisions.md`](docs/decisions.md).

## 1. Platform architecture

```
Browser (Vue SPA) ──HTTPS──> Express ──┬── /api/auth/*              Better Auth (sessions, admin plugin)
        │                              ├── /api/admin/users ...     core admin (Better Auth admin plugin)
        │                              ├── /api/admin/<gameId>/*    game-contributed admin routes (guarded by core)
        └────────WSS──────────>  ws ───┴── room runner              core rooms + game reducers
                                                 │
                     games/*/server (pure reducers, library services) ──> data/games.db
                                                 ▲                         data/auth.db  (Better Auth only)
 Claude Code / Desktop ──stdio──> apps/mcp ──────┘   (namespaced tools from every game; never opens auth.db)
```

**Key principle: the server is authoritative, and the core only ever sends `view()` output.** Clients send intents; the core validates core messages, the game's reducer validates game actions, and every broadcast is built per recipient with the game's `view(state, viewerId)`. Raw game state never leaves the server. This is how "the imposter never receives the secret word" is enforced for every future game, not just Imposter.

### Layout
```
ws-family-games/
  package.json                 # pnpm workspace root, scripts: dev, build, test, lint
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example  .gitignore     # ignore data/, .env, dist/
  apps/
    server/
      src/
        index.ts               # Express app, Better Auth mount, static client, ws upgrade, SIGTERM handling
        auth.ts                # betterAuth({...}) (sessions, admin plugin, closed signup)
        middleware.ts          # requireSession, requireAdmin, originCheck, rate limits, real-IP
        db.ts                  # auth.db + games.db setup (WAL, busy_timeout), runs game migrations
        rooms.ts               # room registry, join/leave/reconnect, host migration, game switching, caps, cleanup
        runner.ts              # applies reduce(), runs effects (timers), builds per-player views, broadcasts
        ai.ts                  # shared AI service: generate(), daily output-token cap, per-admin rate limit, ai_usage log
        routes/admin.ts        # mounts core admin + each game's admin router under /api/admin/<gameId>
      test/
    client/                    # Vue + Vuetify shell (see section 8)
    mcp/
      src/server.ts            # stdio MCP server, registers every game's tools (namespaced)
  packages/
    core/
      src/
        contract.ts            # server GameModule types, effects, secrets spec, registry checks
        client.ts              # GameClientModule (client manifest), kept apart so the browser never sees server types
        protocol.ts            # wire message types + zod schemas (core messages, action envelope, state)
        rng.ts                 # seeded Rng handed to games via ctx
        testing/sim.ts         # synchronous in-memory runner for game tests (virtual clock, hooks, effects)
        testing/leak.ts        # generic secret-leak test harness for any game
  games/
    index.ts                   # static registry: export const games = [imposter]
    imposter/
      shared/                  # settings/action/view types shared by server + client
      server/
        game.ts                # init / reduce / view (pure, no I/O)
        library.ts             # word library service (listWords, addWords, removeWords, pickWord, generateWords)
        validate.ts            # word/hint/clue validation
        builtin-words.ts       # ~15 categories x ~20 words, fallback when the library is empty
        migrations.ts          # imposter_* tables in games.db
        admin.ts               # Express router mounted at /api/admin/imposter
        mcp.ts                 # MCP tool definitions (imposter_add_words, ...)
      client/                  # Vue views, settings component, admin pages
      test/
  data/                        # *.db files (gitignored)
  docs/
    decisions.md
```

**Rule for games (and the reason Imposter doubles as the reference example):** a game imports only from `packages/core` and its own folder. It never reaches into `apps/server` internals. Server-side services a game needs (DB handle, AI service, logger, notices) are passed in through the contract.

Games are registered by a **static import list** in `games/index.ts`, not discovered at runtime: type-safe, tree-shakeable, and a self-hoster adds a game with one line.

### Packages
**Policy: latest stable releases.** Install with `pnpm add <pkg>@latest` (no hand-typed versions) and commit the lockfile. The versions below were checked on npm on 2026-10-21 and are the expected baseline; newer patch/minor releases are fine. The one exception to "latest" is TypeScript (see the note below the table).

| Area | Packages | Version checked |
|---|---|---|
| Server | `express`, `ws` | 5.3.0, 8.22.0 |
| Auth | `better-auth` (CLI: `npx auth@latest`; `@better-auth/cli` is deprecated) | 1.7.12 |
| DB | built-in `node:sqlite` (`DatabaseSync`; release candidate since Node 25.7, no package) | n/a |
| Validation | `zod` | 4.6.7 |
| Client | `vue`, `vue-router`, `vuetify` | 3.5.44, 5.4.0, 4.3.0 |
| Build | `vite`, `@vitejs/plugin-vue`, `vite-plugin-vuetify`, `create-vuetify` (scaffold only) | 8.3.5, 6.0.10, 2.1.3, 3.2.1 |
| MCP | `@modelcontextprotocol/server` (v2 split package; needs `zod` >= 4.2). Not the v1 `@modelcontextprotocol/sdk` | 2.3.1 |
| AI | `@anthropic-ai/sdk` | 0.137.0 |
| Tooling | `typescript`, `vue-tsc`, `tsx` (server dev runner), `vitest`, `eslint`, `typescript-eslint`, `eslint-plugin-vue`, `@vue/eslint-config-typescript` | **6.0.3**, 3.3.13, 4.23.15, 5.0.5, 10.13.0, 8.72.0, 10.11.1, 14.9.0 |
| Types | `@types/node`, `@types/express`, `@types/ws` | latest, 5.0.6, 8.18.2 |
| Package manager | `pnpm` (pinned via `packageManager` in the root `package.json`) | 12.14.0 |
| Optional | `pinia` (only if the reactive-object store isn't enough) | 4.1.0 |

- **TypeScript is pinned to 6.0.x.** TypeScript 7 (7.0.2) is out, but `typescript-eslint` 8.72 only supports TypeScript below 6.1, and `vue-tsc` support for 7.x is unverified. Move to 7 once both support it.
- **Node:** use the same major version in dev and on the VPS (26; dev runs 26.3), and set `engines.node` in the root `package.json` to match. `node:sqlite` is a release candidate from 25.7; `vitest` needs >= 22.12.
- **`node:sqlite` has no `.transaction()` or `.pragma()` helpers.** Run pragmas with `db.exec('PRAGMA ...')` and use a small `transaction(db, fn)` wrapper (BEGIN/COMMIT/ROLLBACK) in `db.ts`.
- **Socket.IO was considered and rejected; see `docs/decisions.md`.** The browser uses the built-in `WebSocket`, so there is no client websocket library.

## 2. The game contract (`packages/core`)

### Server side
```ts
interface GameModule<S, A, V, Settings> {
  id: string                      // 'imposter'; used for namespacing routes, tables, MCP tools
  name: string
  minPlayers: number
  maxPlayers: number
  settingsSchema: ZodType<Settings>   // validated by core on update_settings
  defaultSettings: Settings
  actionSchema: ZodType<A>            // validated by core before reduce()

  init(ctx: InitCtx<Settings>): { state: S; effects?: Effect<A>[] }
  reduce(state: S, action: A, ctx: ReduceCtx): { state: S; effects?: Effect<A>[] } | GameError
  view(state: S, viewerId: PlayerId): V      // per-player snapshot; the ONLY thing sent to clients

  // Player lifecycle hooks the core calls (also pure):
  onPlayerDisconnected?(state: S, playerId, ctx): { state: S; effects? }
  onPlayerReconnected?(state: S, playerId, ctx): { state: S; effects? }
  onPlayerRemoved?(state: S, playerId, ctx): { state: S; effects? }

  secrets?: SecretSpec<S>          // declares secret values + who may see them when; used by the leak test

  // Optional integrations, given core services:
  migrations?: Migration[]                          // tables in games.db, prefixed with `<id>_`
  adminRouter?(services: ServerServices): Router    // mounted at /api/admin/<id>, already behind requireAdmin + Origin check
  mcpTools?(services: ServerServices): McpToolDef[] // registered as `<id>_<tool>`
  prepareRound?(...)                                // async I/O step (e.g. picking a word from the DB) the runner calls
                                                    // before init/next-round, so reduce() itself stays pure
}
```
- `InitCtx` / `ReduceCtx` carry `players`, `settings`, `actorId`, `now`, `rng` (seeded), and data prepared by `prepareRound`. Games never call `Math.random`, `Date.now`, `setTimeout`, or the DB from `reduce`/`view`.
- **Effects** are plain data the runner executes: `{ type: 'schedule', at, action, key }`, `{ type: 'cancel', key }`, `{ type: 'notice', to, message }`, `{ type: 'gameOver' }` (back to the lobby). Timers (clue timer, disconnect grace) are scheduled actions, so they are testable and replayable.
- Permission checks for game actions (current player only, judge only, host only for game moves) live in the reducer, because only the game knows who the judge is. `ReduceCtx` tells the reducer who the host is.

### Client side
```ts
interface GameClientModule {
  id: string
  name: string
  description: string
  PlayView: () => Promise<Component>       // props: { view, send, me, room }
  SettingsView: () => Promise<Component>   // props: { settings, update, isHost } (custom per game)
  adminPages?: { path: string; title: string; component: () => Promise<Component> }[]  // mounted under /admin/<id>/
}
```
The client shell provides small shared Vuetify field components (`SettingSlider`, `SettingSelect`, `SettingToggle`) so per-game settings components stay short. Auto-generating settings forms from zod is deferred until there are 3+ games.

## 3. Core room behaviour

- A logged-in user creates a room (4-letter code) with an optional `gameId` (defaults to the first registered game). Anyone, logged in or not, joins with a display name.
- **Display names:** trimmed, 1-16 chars, unique per room (case-insensitive; reject duplicates with a clear `validation` error). Logged-in users get their account name prefilled and may override it per room. No profanity filter.
- **Lobby (core):** player list, game picker, the game's `SettingsView`, Start button (host). The host can **switch games in the lobby**: players and connections stay; game settings and scores reset to the new game's defaults.
- **Return to lobby:** when a game emits `gameOver`, or the host sends `return_to_lobby`.
- **Host:** bound to `room.hostUserId` (the creator's `user.id`) so the creator can reconnect from another device and still be host.
  - **Transfer host:** host-only `transfer_host { playerId }` (guests allowed as target).
  - **Automatic migration:** if the host is disconnected for ~2 minutes, host passes to the next connected player in join order, guest or not, for the rest of the room's life. Login gates *creating* rooms (the abuse gate), not running one you're already in. The room keeps counting against the original creator's `MAX_ROOMS_PER_USER`.
- **Reconnect:** `joined` returns a `token`; the client stores `{ code, token }` in localStorage and sends `reconnect` on page load or after the socket drops.
- **Kick:** host only; removes the player and calls `onPlayerRemoved`.
- **Room state is in memory.** Restarting the server ends all rooms. On `SIGTERM` the server broadcasts `notice { kind: 'server_restarting' }`, closes sockets cleanly, then exits; clients show "The server is restarting, rejoin in a moment" instead of spinning on "reconnecting...". Deploy when nobody is playing. (State is plain data, so persisting rooms remains possible later.)
- Rooms expire after ~1h idle; max players is the game's `maxPlayers` (cap 12).

## 4. WebSocket protocol (`packages/core/protocol.ts`)

JSON messages `{ type, ...payload }`, every one validated with zod. Connect to `/ws` (same origin; the session cookie rides along on the upgrade request).

**Transport (`ws`):**
- `new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })`. Handle `server.on('upgrade')` yourself: reject any path other than `/ws`, check `Origin`, resolve the session, apply the per-IP connection cap, and only then call `wss.handleUpgrade`. Rejected upgrades get a plain HTTP status (403/429) and the socket is destroyed before the websocket handshake completes.
- **Heartbeat:** the server pings every 30s and terminates any socket that didn't answer the previous ping. A terminated socket counts as disconnected, which starts the turn-skip, judge and host-migration grace timers. Without this a phone that drops off Wi-Fi looks "connected" for minutes. The pings also keep the connection inside Cloudflare's ~100s idle timeout.
- Messages over `maxPayload`, invalid JSON, and messages that fail the zod check get an `error { code: 'validation' }`; repeated abuse is covered by the per-socket rate limit.

**Client -> Server (core)**
| type | payload | Auth |
|---|---|---|
| `create_room` | `{ gameId?, name? }` | **session required** |
| `join_room` | `{ code, name }` | guests allowed |
| `reconnect` | `{ code, token }` | guests allowed |
| `leave` | `{}` | player |
| `set_name` | `{ name }` (lobby only) | player |
| `select_game` | `{ gameId }` (lobby only; resets settings + scores) | host |
| `update_settings` | `{ settings }` (validated by the game's `settingsSchema`; lobby only) | host |
| `start_game` | `{}` (checks min/max players) | host |
| `return_to_lobby` | `{}` | host |
| `transfer_host` | `{ playerId }` | host |
| `kick` | `{ playerId }` | host |
| `action` | `{ action }` (validated by the game's `actionSchema`, then `reduce`) | per game |

**Server -> Client**
| type | payload |
|---|---|
| `session` | `{ user: { id, name, role } \| null }`, sent on connect |
| `joined` | `{ playerId, token, code }` |
| `state` | `{ room: RoomView, game: GameView \| null }` per recipient |
| `error` | `{ code, message }`, `code` in `unauthorized`, `forbidden`, `rate_limited`, `room_cap`, `validation`, `not_found`, `game` |
| `notice` | `{ kind?, message }` soft info, e.g. "Library was empty, used built-in words", `server_restarting` |

```ts
RoomView = {
  code, phase: 'lobby' | 'playing', hostId,
  game: { id, name, settings }, availableGames: [{ id, name, description, minPlayers, maxPlayers }],
  players: [{ id, name, connected, isHost, isLoggedIn }],
  you: { id }
}
GameView = whatever the game's view(state, viewerId) returns (null in the lobby)
```

## 5. Access control and auth

**Goal: strangers can't spend your resources.** Creating rooms needs a login, accounts are invite-only, and the paid thing (Claude generation) is admin-only and capped. Current audience is semi-public (links shared among friend groups); the design should also hold up for self-hosters later.

### Better Auth setup (`apps/server/src/auth.ts`)
- `database: new DatabaseSync(process.env.AUTH_DB_PATH)` from `node:sqlite` (supported by Better Auth's SQLite adapter). Verify the CLI (`migrate`, `create-admin`) works with it; if not, fall back to `better-sqlite3` for the CLI only.
- `emailAndPassword: { enabled: true, disableSignUp: true }` so **public sign-up is closed**. (Confirm the exact option name in the current docs; the OAuth `disableSignUp` is a separate setting.)
- `plugins: [admin()]` from `better-auth/plugins`: adds `role` (default `user`), `banned`, `banReason`, `banExpires` to users and `impersonatedBy` to sessions.
- Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `trustedOrigins` from `ALLOWED_ORIGINS`, secure cookies in production, and confirm Better Auth's built-in rate limiting is on for auth endpoints.
- Run the schema step after config/plugin changes: `npx auth@latest migrate` (or `generate`).
- **Mount order matters:** `app.all('/api/auth/*splat', toNodeHandler(auth))` (Express 5 pattern) **before** `express.json()`.
- **No email in v1.** Forgotten passwords are reset by an admin from `/admin/users` (admin plugin set-password); the login page says "Forgot your password? Ask an admin to reset it."

### Roles
| Who | Can do |
|---|---|
| Guest (no account) | Join a room by code with a display name, play, become host via transfer/migration |
| `user` | Everything a guest can, plus **create rooms** (max `MAX_ROOMS_PER_USER` open) |
| `admin` | Everything a user can, plus the **admin panel**: users, and every game's admin pages |

### Getting accounts
- **First admin:** `npx auth@latest create-admin --email you@example.com --name "You" --role admin`.
- **Everyone else:** an admin creates them in `/admin/users` via the admin plugin client (`createUser`, `setRole`, `banUser`, `listUsers`, set password). Better Auth enforces the admin check on those endpoints itself.

### Where auth is enforced (server side, always)
1. **REST:** `requireSession` / `requireAdmin` call `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` and check `session.user.role === 'admin'`. Never trust a client-sent role. (Verify `role` is on the session user in the running app.)
2. **Game admin routes:** the core mounts each game's `adminRouter` under `/api/admin/<gameId>` **behind `requireAdmin` and the Origin check**. A game cannot mount routes outside its prefix or bypass the guard.
3. **WebSocket:** resolve the session on the HTTP **upgrade** request (the `noServer` handler in section 4) with the same `getSession` call; attach `{ user }` (or `null`) to the socket. `create_room` requires `socket.user`. **Check the `Origin` header on upgrade** against `ALLOWED_ORIGINS` (cross-site websocket hijacking otherwise).
4. **State-changing REST routes** (POST/PUT/DELETE) run an `Origin` check on top of SameSite cookies.
5. Client route guards and hidden buttons are UX only.

### Abuse limits
- `MAX_ROOMS` total, `MAX_ROOMS_PER_USER` per user, ~1h idle expiry, max 12 players per room.
- Per-socket message rate limit (~10 msgs/sec), cap on websocket connections per IP, join attempts rate-limited per IP (room-code guessing).
- **Real client IP behind Cloudflare + nginx:** `app.set('trust proxy', TRUSTED_PROXY_HOPS)` and read the IP from `REAL_IP_HEADER` (`CF-Connecting-IP` on this deployment) for every IP-based limit; otherwise all limits see Cloudflare's IPs. Both are configurable so self-hosters without Cloudflare can change them.

## 6. Data, AI service, MCP

### Databases
- `data/auth.db`: Better Auth only.
- `data/games.db`: core tables (`ai_usage`, `schema_migrations`) plus each game's tables, prefixed with the game id (`imposter_words`, ...). Each game ships its own `migrations`; `db.ts` runs them in order on boot and records them in `schema_migrations`.
- Both in WAL mode with `PRAGMA busy_timeout = 5000`, so the server and the MCP process can share `games.db` safely. The MCP process **never opens `auth.db`**.

### Shared AI service (`apps/server/src/ai.ts`)
Optional: if `ANTHROPIC_API_KEY` is unset, generation features are hidden in the UI and generation MCP tools are not registered.
```ts
ai.generate({ gameId, userId, system, prompt, tool }) -> Promise<ToolInput>
```
- `messages.create` with one **forced tool**; returns the tool's input.
- Model from `ANTHROPIC_MODEL` (default `claude-haiku-5-5`).
- **Daily cap in output tokens** across all games and admins (`AI_DAILY_OUTPUT_TOKEN_CAP`), computed from `usage.output_tokens` in `ai_usage`. Requests are refused once the cap is hit. Plus a per-admin rate limit (`AI_PER_ADMIN_CALLS_PER_HOUR`).
- Logs every call to `ai_usage { id, game_id, user_id, model, input_tokens, output_tokens, created_at }`.
- Per-call limits in game units (e.g. Imposter's max 50 words) are the game's job.
- The API key lives only in the server environment; never sent to the browser.

### MCP server (`apps/mcp`, stdio)
One process that registers every game's `mcpTools`, namespaced `<gameId>_<tool>`, over the same service code the admin routes use.
```bash
claude mcp add ws-family-games \
  --env GAMES_DB_PATH=/absolute/path/to/data/games.db \
  -- node /absolute/path/to/apps/mcp/dist/server.js
```
**Gotchas:**
- With stdio, stdout *is* the protocol. Never `console.log` in the MCP process or anything it imports; use `console.error` (games use the injected logger, which writes to stderr).
- Resolve the DB path from `GAMES_DB_PATH` (absolute); the client spawns the process from an unknown working directory.
- It edits a local file, so it reaches the production library only where the file is: run it over SSH for prod (`claude mcp add ws-family-games -- ssh your-host node /path/apps/mcp/dist/server.js`, env set remotely), or use the admin panel in prod.
- Use the v2 server package `@modelcontextprotocol/server` (2.3.1 at time of writing), not the v1 `@modelcontextprotocol/sdk`. Check its docs for the v2 stdio transport and tool registration API before writing `server.ts`; v2's API differs from the v1 examples you'll find online.
- **Stretch (not v1):** remote HTTP MCP via Better Auth's `mcp()` plugin (needs `jwt()` and `cimd()` plugins, an HTTPS `resource` URL, targets the MCP 2026-07-28 spec).

## 7. Word Imposter (`games/imposter`)

### Rules
1. Host starts a round. Everyone except the imposter receives the **same secret word**. The imposter sees only the **category** and, optionally, a **vague hint**.
2. The imposter is chosen **uniformly at random every round** (repeats allowed; deliberately no shuffle bag, so nobody can deduce who hasn't been imposter yet). Imposter count is fixed at 1 (keep a constant for later).
3. **Clue phase.** Players take turns in a fixed random order. On your turn, give **one word** linked to the secret word, typed or spoken (see Clue mode). The imposter bluffs. In typed mode everyone sees clues as they arrive.
4. This repeats for N **rotations** (default 2).
5. **Vote phase.** Everyone (including the imposter) votes secretly for who they think the imposter is, with live "x/y voted" progress.
6. **Reveal.** Show tallies and the imposter. **Caught** = the plurality vote lands on the imposter; **escapes** = wrong player or a tie.
7. **Guess check** (per `guessMode`). The imposter says their guess for the secret word **out loud**. A **judge** taps **Got it** or **Missed it**.
   - The judge is the host, unless the host is the imposter, in which case it is the first connected crew member in join order; reassigned if the judge disconnects.
   - The imposter's screen does not show the secret word until the judge answers.
   - The app can't verify a spoken guess; the judge's tap is the source of truth by design.
8. **Scoring** across rounds:
   - Imposter **caught**: crew wins, +`catchPoints` (default 1) to each crew member.
   - Imposter **escapes**: imposter wins, +`escapePoints` (default 2) to the imposter.
   - `guessMode: bonus` (default): a correct guess gives the imposter +`guessPoints` (default 1) on top, regardless of outcome.
   - `guessMode: steal`: the guess is checked only when the imposter is caught; a correct guess flips the round to an imposter win (+`escapePoints`, no crew points).
   - `guessMode: off`: no guess check.
9. Host can start another round, which re-rolls the imposter and the word.

### Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Rotations | 2 | 1-5 |
| Imposter hint | `category` | `none` / `category` / `category+hint` |
| Word source | `library` | `library` (falls back to builtin if empty) / `builtin` |
| Category | Any | categories from the library, plus "Any" |
| Clue mode | `typed` | `typed` / `spoken` (players speak; the app tracks turns, voting, score) |
| Imposter guess | `bonus` | `bonus` / `steal` / `off` |
| Guess points | 1 | 0-3, shown only in `bonus` mode |
| Catch points | 1 | 0-3 |
| Escape points | 2 | 0-5 |
| Clue timer | off | seconds per turn. **Typed:** auto-skip on expiry. **Spoken:** visual countdown only, never auto-advances |

### State machine
```
CLUES -> VOTING -> REVEAL -> (GUESS_CHECK) -> RESULTS -> (next_round -> CLUES | gameOver -> lobby)
```
(The lobby is core; `init` starts at `CLUES`.)
- `CLUES`: `turnOrder` (shuffled with `rng`) x `rotations`; `turnIndex` tracks the current turn.
  - **Typed:** only the current player can `submit_clue`; the turn advances on submit.
  - **Spoken:** nothing is typed; the current speaker taps **Done** (`end_turn`); the host can tap it for anyone. No clue feed.
  - Last turn done -> `VOTING`. Host can `start_voting` at any time to skip remaining turns.
  - A disconnected player on their turn is auto-skipped after a ~15s grace (scheduled effect).
- `VOTING`: one vote each, not for yourself; changes allowed until everyone has voted. Advance when all connected players have voted, or the host forces it. **A disconnected imposter stays in the round** and can be voted for and caught.
- `REVEAL`: tally, set `caught`. Go to `GUESS_CHECK` if `guessMode` is `bonus`, or `steal` and caught; otherwise `RESULTS`.
- `GUESS_CHECK`: only the judge can send `judge_guess { correct }`. The host can `skip_guess` (counts as missed). If the imposter is disconnected, the guess counts as missed after the 15s grace. The imposter's view keeps hiding the secret word.
- `RESULTS`: apply scoring, show the secret word to everyone, outcome, points this round, scoreboard. Host: **Play again** (`next_round`) or **Back to lobby**.

### Actions (inside the `action` envelope)
| action | payload | Who |
|---|---|---|
| `submit_clue` | `{ word }` (typed mode only; rejected in spoken) | current player |
| `end_turn` | `{}` (spoken mode) | current player, or host for anyone |
| `start_voting` | `{}` | host |
| `end_voting` | `{}` (force the reveal before everyone has voted) | host |
| `cast_vote` | `{ targetId }` | player |
| `judge_guess` | `{ correct: boolean }` | **judge only** |
| `skip_guess` | `{}` | host |
| `next_round` | `{}` | host |

### Validation
- Clue (typed only): trimmed, a single token (no spaces), 1-24 chars, **not equal to the secret word**, and **not a repeat** of an earlier clue this round (both case-insensitive). Rejected with `error { code: 'game' }` so the player can retry.
- Library words: `word` non-empty, 1-3 words, under 30 chars; `category` under 40; `hint` under 120 and must **not contain the word** (case-insensitive). Duplicates (same category + word, case-insensitive) are skipped, not errors.

### View (per player)
```ts
{
  phase,
  you: { role: 'crew' | 'imposter', word: string | null, category, hint: string | null },
  scores: { [playerId]: number },
  turn: { currentPlayerId, rotation, totalRotations, deadline: number | null },
  clues: [{ playerId, word, rotation }],        // always [] in spoken mode
  voted: PlayerId[],                            // who has voted, not for whom
  // REVEAL / GUESS_CHECK / RESULTS only:
  result?: {
    votes: { [playerId]: number }, accusedId, caught, imposterId,
    judgeId, guessRequired, guessCorrect: boolean | null,
    secretWord?: string,                        // omitted for the imposter until RESULTS
    imposterWon?, pointsAwarded?                // RESULTS only
  }
}
```
`you.word` is `null` for the imposter. Votes are hidden until REVEAL; `imposterId` appears from REVEAL onward. `secrets` declares: `secretWord` is visible to crew always, to the imposter only in `RESULTS`; `imposterId` is visible to the imposter always, to others from `REVEAL`. The core leak test checks this.

### Hold-to-reveal (physical table)
Players sit together, so the imposter could glance at a neighbour's phone. **The word is never on screen at rest:**
- The role card shows "Hold to see your word" and reveals the word only while pressed (pointer/touch down), hiding it on release. The imposter's card behaves identically (showing their category/hint) so nobody can tell roles apart by how others use their phones.
- The judge's GUESS_CHECK screen shows **Got it / Missed it** with the secret word behind the same hold-to-reveal.

### Word library
Tables in `games.db` (Imposter migrations):
```sql
CREATE TABLE IF NOT EXISTS imposter_words (
  id           INTEGER PRIMARY KEY,
  category     TEXT NOT NULL,
  word         TEXT NOT NULL,
  hint         TEXT NOT NULL,           -- vague clue shown to the imposter
  difficulty   TEXT DEFAULT 'medium',   -- easy | medium | hard
  source       TEXT DEFAULT 'claude',   -- claude | builtin | manual
  times_used   INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE (category COLLATE NOCASE, word COLLATE NOCASE)
);
```
- `library.ts`: `listWords`, `listCategories` (total + unused counts), `addWords` (validate, de-dupe, insert, return `{ inserted, skipped }`), `removeWords`, `pickWord`, `generateWords` (via the core AI service).
- **`pickWord({ category?, excludeIds })`** (run by the runner in `prepareRound`, so the reducer stays pure): least-used word, random among ties, optionally filtered by category, skipping words already used in this room; increments `times_used`/`last_used_at`. If the library is empty or nothing matches, fall back to `builtin-words.ts` and send the host a `notice`. A game must always be able to start.
- Categories with fewer than ~5 unused words are flagged in the admin page ("running low on Foods").

**Admin routes** (`/api/admin/imposter/*`, guarded by core):
| Route | Purpose |
|---|---|
| `GET /words?category=&q=&limit=&offset=` | Browse |
| `GET /categories` | Categories with total / unused counts |
| `POST /words` | Save one or many (manual entry or approved candidates) |
| `DELETE /words` | Remove by `{ ids: [] }` |
| `POST /words/generate` | `{ count (max 50), category?, difficulty? }` -> **candidates only, not saved** |

**Generation flow:** admin enters category + count, clicks Generate, reviews candidates in a table (edit or untick), then Save (`POST /words`). Keeps junk and spoiler hints out of the library.

**Generation prompt** (`generateWords` -> `ai.generate` with forced tool `submit_words` returning `[{ category, word, hint, difficulty }]`): concrete, widely known words (nouns preferred); hints vague enough not to give the word away but enough to bluff with; stay inside the category; vary difficulty; pass existing words in the category as an avoid-list. Validate output; retry once, then return an error (the UI shows it; games are unaffected).

**MCP tools:** `imposter_add_words` (`{ words: [{ category, word, hint, difficulty? }] }`; when driven from Claude Code/Desktop, Claude writes the words itself, so **no API key is needed**), `imposter_list_categories`, `imposter_search_words` (`{ category?, query?, limit? }`), `imposter_remove_words` (`{ ids }`), `imposter_generate_words` (only when `ANTHROPIC_API_KEY` is set; saves directly, still subject to the token cap).

## 8. Vue client (`apps/client`)

### Setup
- Scaffold with `npm create vuetify@latest` (plain Vue/Vite, TypeScript, Vue Router), then move it into the workspace. Check the current Vuetify 4 install docs and generator prompts when running it.
- Theming: Vuetify theme with a light/dark toggle (`useTheme`); primary color from `APP_PRIMARY_COLOR` (exposed via a small `/api/config` endpoint or injected at build). App bar title and `<title>` from `APP_NAME`.
- `src/lib/auth-client.ts`:
  ```ts
  import { createAuthClient } from 'better-auth/vue'
  import { adminClient } from 'better-auth/client/plugins'
  export const authClient = createAuthClient({ plugins: [adminClient()] })
  ```
  Same origin in prod, so no `baseURL`. In dev, Vite proxies `/api` and `/ws` to the Express port.
- Game client modules are imported from `games/*/client` via the static registry and lazy-loaded per route.

### Routes
| Route | Who | What |
|---|---|---|
| `/login` | public | Email + password sign-in, no sign-up, "ask an admin" reset note |
| `/` | public | Join form (code + name). **Create room** (with game picker) only when logged in |
| `/room/:code` | public | Core room shell: lobby (players, game picker, game `SettingsView`, Start) or the game's `PlayView` |
| `/admin` | admin | Admin shell with nav |
| `/admin/users` | admin | List, create (email, name, password, role), set role, ban/unban, reset password |
| `/admin/<gameId>/*` | admin | Pages contributed by games, e.g. `/admin/imposter/words` |

Router guards redirect non-admins from `/admin/*` (UX only).

### State and components
- `useRoom()` composable: owns the websocket (auto-reconnect with the stored token, "reconnecting..." banner, `server_restarting` message), exposes the latest `room` and `game` views, and `send` helpers. A reactive object is enough; Pinia optional.
- Imposter `PlayView` switches on `phase`: `CluesView` (typed: role card, turn order, clue feed, input on your turn), `SpokenTurnView` (role card, big current-speaker card, **Done**, host **Skip** / **Start voting**, rotation progress, visual timer), `VotingView`, `RevealView`, `GuessCheckView` (imposter: "say your guess out loud"; judge: hold-to-reveal word + **Got it** / **Missed it**; others: waiting), `ResultsView`.
- Shared `HoldToReveal` component used by the role card and the judge screen.
- Mobile-first; Vuetify components instead of custom CSS where possible:
  - Layout: `v-app`, `v-app-bar`, `v-main`, `v-container`, `v-row`/`v-col`
  - Inputs: `v-form`, `v-text-field`, `v-otp-input` (room code), `v-btn`
  - Settings: `v-select`, `v-btn-toggle`, `v-slider`, `v-switch`
  - Players/clues: `v-card`, `v-list`, `v-chip`, `v-avatar`
  - Voting/progress: grid of `v-card`s, `v-progress-linear`
  - Admin: `v-data-table` (server-side paging), `v-dialog` / `v-navigation-drawer`
  - Feedback: `v-snackbar` for `error`/`notice`, `v-alert` for blocking states
  (Verify names against the Vuetify 4 docs; some may live under `vuetify/labs`.)

## 9. Environment variables
```
PORT=3000
APP_NAME=Family Games
APP_PRIMARY_COLOR=#6750A4
BETTER_AUTH_SECRET=                          # long random string
BETTER_AUTH_URL=https://your-domain.com
ALLOWED_ORIGINS=https://your-domain.com      # ws Origin check + trustedOrigins + REST Origin check
AUTH_DB_PATH=./data/auth.db
GAMES_DB_PATH=./data/games.db                # absolute path when used by the MCP process
TRUSTED_PROXY_HOPS=2                         # Cloudflare + nginx on this deployment
REAL_IP_HEADER=CF-Connecting-IP              # empty to use req.ip
ANTHROPIC_API_KEY=                           # optional; server only
ANTHROPIC_MODEL=claude-haiku-5-5
AI_DAILY_OUTPUT_TOKEN_CAP=200000
AI_PER_ADMIN_CALLS_PER_HOUR=20
MAX_ROOMS=50
MAX_ROOMS_PER_USER=2
```
Nothing about the domain, branding or deployment is hard-coded; everything self-hosters need to change is here.

## 10. Testing (Vitest)
- **Reducer unit tests** per game with seeded `rng` and fixed `now`. For Imposter: role assignment, both clue modes, clue validation (secret word, duplicates), turn skipping, voting and ties, judge selection (including host-is-imposter and judge disconnect), all three guess modes plus configurable points, a disconnected imposter during voting and guess check, timers in typed vs spoken mode.
- **Core tests:** room lifecycle, reconnect, host transfer and automatic migration, game switching resets settings/scores, caps, rate limits, heartbeat termination of unresponsive sockets (marks the player disconnected), `maxPayload` rejection, and upgrade rejection for a bad Origin or path.
- **Generic leak test** (`packages/core/testing/leak.ts`): for any game, play random action sequences (moves supplied by the game's test, plus random disconnects and timer firings) and, after every step, check each viewer who may not see a secret: (a) **value check**, no string or object key in their `view()` equals a forbidden value (e.g. the secret word); (b) **variant check**, their `view()` is identical across states that differ only in the secret (e.g. who the imposter is, which a string search can't catch). Run for every registered game.
- **Auth route tests:** guest 401, user 403, admin 200 on core and game admin routes; game routers can't escape the guard.
- **Integration simulation:** boot the real server on a random port with temp SQLite files, drive real `ws` clients (1 logged-in host + 3 guests) through a full typed round and a full spoken round. Assert guests cannot `create_room`, only the judge can `judge_guess`, `submit_clue` is rejected in spoken mode, the imposter's messages **never** contain the secret word before RESULTS, and the SIGTERM notice is sent.
- No browser E2E (Playwright) in v1.

## 11. Deployment (existing VPS)
The VPS already runs Laravel apps. **Assumed setup, to verify at deploy time:** nginx in front, Node (same major version as dev, see Packages in section 1), Supervisor (already used for Laravel queues), Cloudflare DNS **proxied** with SSL mode **Full (strict)**.
- Run `pnpm install --frozen-lockfile` on the VPS (never copy `node_modules` from another machine). The VPS must run the same Node major as dev, since `node:sqlite` ships with Node.
- Build (`pnpm build`), run `node apps/server/dist/index.js` under Supervisor on a localhost port, with `.env` alongside and `data/` on persistent disk.
- nginx server block for the new hostname: proxy `/` to the Node port, and a `location /ws` with `proxy_http_version 1.1`, `Upgrade` / `Connection "upgrade"` headers and a long `proxy_read_timeout`. TLS with a Cloudflare origin certificate (or Let's Encrypt).
- Cloudflare: add the DNS record (proxied); websockets work through the proxy.
- `TRUSTED_PROXY_HOPS` / `REAL_IP_HEADER` as in section 9.
- Back up `data/*.db` (e.g. `sqlite3 .backup` via cron).
- Deploy when nobody is playing (restarts end rooms; clients get the restart notice).

## 12. Build order (commit after each milestone)
1. **Repo setup:** `git init`, pnpm workspaces (`packageManager` and `engines.node` in the root `package.json`), `tsconfig.base.json`, Vitest, ESLint (flat config), `.env.example`, `.gitignore`. Install the latest stable packages from section 1 (TypeScript 6.0.x). pnpm blocks dependency build scripts by default; allow-list only reviewed ones via `allowBuilds` in `pnpm-workspace.yaml`. Confirm `node:sqlite` loads before moving on.
2. **`packages/core`:** game contract, protocol types + zod schemas, generic leak-test harness.
3. **Imposter reducer:** `games/imposter/server/game.ts` (`init`/`reduce`/`view`/`secrets`) with full unit tests and the leak test.
4. **Server foundation:** `db.ts` (both DBs, migrations), Better Auth, create the first admin via CLI, `requireSession`/`requireAdmin`/Origin/real-IP middleware, auth route tests.
5. **Game runner:** ws upgrade with session + Origin check, rooms, reconnect, host transfer + migration, game switching, effects/timers, per-player views, rate limits and caps, SIGTERM notice, core tests.
6. **Imposter word library + MCP:** migrations, `validate.ts`, `library.ts`, `builtin-words.ts`, `prepareRound`/`pickWord`, `apps/mcp`. Register it and ask Claude to add 20 words.
7. **Client:** shell (Vuetify, theme, login, home, room shell, lobby, game picker), Imposter settings + play views, `HoldToReveal`. Playable end to end.
8. **Integration simulation test** (section 10).
9. **Admin:** `/admin` shell, `/admin/users`, core AI service with token cap and `ai_usage`, Imposter admin routes + `/admin/imposter/words` with review-then-save generation and low-stock flags.
10. **Deploy and docs:** nginx/Supervisor/Cloudflare setup, README (setup, env vars, create-admin, MCP registration, reverse proxy, writing a game against `packages/core`).

## 13. Out of scope for v1
Spectators, multiple imposters, OAuth/social login, email (password reset, invites), persisting rooms across restarts, remote HTTP MCP, Docker image, license choice (pick deliberately before open-sourcing: MIT vs AGPL), auto-generated settings forms, browser E2E tests.

## 14. Handoff prompt for Claude Code

> Read `PLAN.md` and `docs/decisions.md` in this repo and build the platform and the Word Imposter game as described. The repo is empty: nothing is installed yet. Use pnpm workspaces and TypeScript everywhere. Install the latest stable packages listed in section 1 (TypeScript stays on 6.0.x) with `pnpm add <pkg>@latest`. Follow the build order in section 12, committing after each milestone. Before using Better Auth (and its admin plugin), Vuetify 4, `create-vuetify`, or the MCP server package (`@modelcontextprotocol/server` v2), check their current docs (see References) since options and package names change. Keep game reducers and views pure (no I/O, no `Math.random`/`Date.now`; use the injected `rng`/`now`), and have the core send only `view()` output. Games import only from `packages/core` and their own folder. Enforce auth on the server for every admin route (core and game) and for `create_room`, check the websocket and REST `Origin`, read the real client IP via the configured header, make sure the imposter never receives the secret word before RESULTS, and never write to stdout in the MCP process. Run `pnpm test` (including the leak test and the integration simulation) before declaring it done.

## 15. References
- Better Auth, Express integration: https://better-auth.com/docs/integrations/express
- Better Auth, admin plugin: https://www.better-auth.com/docs/plugins/admin
- Better Auth, client (Vue): https://better-auth.com/docs/concepts/client
- Better Auth, SQLite adapter: https://better-auth.com/docs/adapters/sqlite
- Better Auth, MCP plugin (stretch): https://better-auth.com/docs/plugins/mcp
- Vuetify 4 docs: https://v4.vuetifyjs.com/en/getting-started/installation/
- Vuetify project generator: https://npmjs.com/package/create-vuetify
- `ws` (incl. `noServer` upgrade and heartbeat examples): https://github.com/websockets/ws
- MCP TypeScript SDK (v2 `@modelcontextprotocol/server`): https://github.com/modelcontextprotocol/typescript-sdk
- pnpm workspaces: https://pnpm.io/workspaces
- pnpm settings (build-script allow-list): https://pnpm.io/settings
- Vitest: https://vitest.dev

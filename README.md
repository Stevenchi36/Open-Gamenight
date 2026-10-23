# ws-family-games

A self-hostable platform for party games that a group plays together on their phones, around one table. The first game is **Word Imposter** (3-12 players): everyone gets the same secret word except the imposter, who only knows the category. Players give one-word clues (typed or spoken), vote on who's faking it, and the imposter gets a last chance to guess the word. Also included: **Liar's Dice**, **Herd Mentality** (everyone answers the same question and scores by matching the most popular answer) and **Color Mix** (guess the colour a few paints make when mixed).

- **Rooms with a 4-letter code.** Signed-in users create rooms; anyone joins with just a name. Phones that drop off Wi-Fi reconnect into their seat.
- **The server decides everything.** Each phone only receives its own view of the game, so the imposter's device never gets the secret word. A leak test checks this for every game.
- **Admin panel:** user accounts (no public sign-up), per-game categories, the Imposter word library and the Herd Mentality question library, with optional Claude-powered generation under a daily token cap.
- **Claude integration (MCP):** manage the word and question libraries from Claude Code or Claude Desktop on your Claude subscription; see [`docs/mcp.md`](docs/mcp.md).
- **Built for more games.** The platform owns rooms, sockets, auth, timers and admin; a game is a small, pure module. See [Writing a game](#writing-a-game).

Stack: TypeScript everywhere, Express 5 + `ws`, Vue 3 + Vuetify 4, Better Auth, SQLite via Node's built-in `node:sqlite`, pnpm workspaces, Vitest.

## Quick start

**Prerequisites:** Node **26** (the built-in `node:sqlite` ships with Node, so dev and prod run the same major version) and pnpm **12.14.0**:

```bash
npm install -g pnpm@12.14.0   # Node 25+ no longer bundles Corepack
```

**Install and configure:**

```bash
pnpm install
cp .env.example .env
```

Edit `.env` for local development:

```dotenv
NODE_ENV=development
BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://[::1]:5173
TRUSTED_PROXY_HOPS=0
REAL_IP_HEADER=
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

The `[::1]` origin is for the dev-players page; see [`docs/dev-testing.md`](docs/dev-testing.md).

**Create the first admin and start:**

```bash
pnpm create-admin --email you@example.com --name "You" --password "something-long"
pnpm dev
```

Open **http://localhost:5173**. Vite serves the client and proxies `/api` and `/ws` to the Express server on port 3000. Sign in, create a room, and join it from other browsers or private windows (each private window counts as a separate player).

Databases are created and migrated automatically on first start, in `data/` (gitignored).

### Several players in one window

With `http://[::1]:5173` in `ALLOWED_ORIGINS` (it's in the dev `.env` above), open **http://localhost:5173/dev-players.html?n=4** (or, signed in as an admin, click the people icon in the app bar). You get a grid of frames, each a separate player. Setup, how it works and troubleshooting are in [`docs/dev-testing.md`](docs/dev-testing.md).

### Playing on phones on your network

Add your machine's LAN address to `ALLOWED_ORIGINS` (e.g. `http://192.168.1.20:5173`) and start Vite with `--host`:

```bash
pnpm --filter @wsfg/server dev            # terminal 1
pnpm --filter @wsfg/client dev --host     # terminal 2
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Server (Node, restarts on change) and client (Vite) together |
| `pnpm test` | All tests: unit, leak tests, auth routes, websocket transport, MCP over stdio, full integration simulation |
| `pnpm typecheck` | `tsc` / `vue-tsc` across every package |
| `pnpm lint` | ESLint (TypeScript + Vue) |
| `pnpm build` | Builds the client into `apps/client/dist` (the server has no build step) |
| `pnpm start` | Runs the server for production; it serves the built client too |
| `pnpm create-admin` | Creates an account: `--email`, `--name`, `--password` (prompted if omitted), `--role admin\|user` |

The server runs its TypeScript source directly on Node 26 (native type stripping), so there's nothing to compile for it.

## Configuration

All settings come from `.env` in the repo root (read with Node's built-in loader; real environment variables win). Relative paths resolve against the repo root.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on secure cookies |
| `PORT` | `3000` | Express port |
| `APP_NAME` | `Family Games` | App bar title and page title |
| `APP_PRIMARY_COLOR` | `#6750A4` | **Quote it** in `.env` (`"#6750A4"`): an unquoted `#` starts a comment |
| `BETTER_AUTH_SECRET` | none, required | At least 32 characters |
| `BETTER_AUTH_URL` | none, required | Public URL of the site (in dev, the Vite URL) |
| `ALLOWED_ORIGINS` | none, required | Comma-separated. Used for the websocket Origin check, REST Origin checks and Better Auth's trusted origins |
| `AUTH_DB_PATH` / `GAMES_DB_PATH` | `./data/auth.db` / `./data/games.db` | Accounts vs. game data (the MCP server only ever opens `games.db`) |
| `TRUSTED_PROXY_HOPS` | `0` | Reverse proxies in front of Node (Cloudflare + nginx = `2`) |
| `REAL_IP_HEADER` | empty | e.g. `CF-Connecting-IP` behind Cloudflare; every IP-based limit uses it |
| `ANTHROPIC_API_KEY` | empty | Optional. Turns on word generation in the admin panel. API billing, separate from a Claude subscription |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Model for generation |
| `AI_DAILY_OUTPUT_TOKEN_CAP` | `200000` | Shared by all games and admins; resets at midnight UTC |
| `AI_PER_ADMIN_CALLS_PER_HOUR` | `20` | |
| `MAX_ROOMS` / `MAX_ROOMS_PER_USER` | `50` / `2` | Abuse limits |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` (logs go to stderr) |

## Accounts and admin

- Public sign-up is closed. Admins create accounts in **Admin → Users** (temporary password, role, ban, reset password). Forgotten passwords are reset there too.
- An account is only needed to **create** rooms. Guests join with a code and a name; the host role can pass to a guest (manually, or automatically after the host has been away for about 2 minutes).
- **Admin → Word Imposter** has **Categories** (add, rename, delete empty ones) and the **Word library** (browse, add, edit or move words, delete, and generate-then-review when `ANTHROPIC_API_KEY` is set). Categories running low on unused words are flagged.
- **Admin → Herd Mentality** has **Categories** and the **Question library**, the same way.

## Managing words with Claude

Register the MCP server once and ask Claude Code things like *"add 20 words to every imposter category that's running low"* or *"add 30 herd questions about films"*. Claude writes the words on your Claude subscription; no API key is involved. It also works against a deployed server over SSH. Setup, the tool list and troubleshooting are in [`docs/mcp.md`](docs/mcp.md).

## Project layout

```
apps/
  server/     Express + ws: auth, rooms, game runner, admin routes, AI service
  client/     Vue 3 + Vuetify 4 SPA (lobby, play, admin)
  mcp/        stdio MCP server exposing every game's tools
packages/
  core/       game contract, wire protocol (zod), seeded rng, categories, test sim + leak harness
games/
  index.ts    server-side game registry
  client.ts   client-side game registry
  imposter/   Word Imposter: shared/ (types), server/ (rules, library, admin, MCP), client/ (views)
  liarsdice/  Liar's Dice (no library)
  herd/       Herd Mentality: same shape as imposter/, with a question library
  colormix/   Color Mix (no library; paint mixing vendored from spectral.js)
docs/
  decisions.md   every design decision and why
  dev-testing.md checks, dev-players page (several players in one window)
  mcp.md         Claude / MCP guide
PLAN.md          the full design and build plan
```

## Writing a game

A game is a workspace package under `games/<id>/` that implements the contract in [`packages/core/src/contract.ts`](packages/core/src/contract.ts). Word Imposter is the worked example; copy its shape.

1. **Rules (server, pure).** Export a `GameModule` from `games/<id>/server/`:
   - `init`, `reduce` and `view` are pure functions. Randomness comes from `ctx.rng`, time from `ctx.now`, and timers are returned as `schedule`/`cancel` effects; no I/O, `Math.random`, `Date.now` or `setTimeout`.
   - `view(state, playerId)` is the only game data that leaves the server. Shape it per player.
   - `actionSchema` and `settingsSchema` are zod schemas; the core validates every action and settings change with them.
   - `secrets` declares what each player may not see, and when. The core's leak test plays random games and checks every view against it.
2. **Views (client).** Export a `GameClientModule` from `games/<id>/client/` with a lazy `PlayView` (props: `view`, `send`, `me`, `room`, `serverNow`) a `SettingsView` (props: `settings`, `update`, `isHost`), and `rules` loading the game's `games/<id>/RULES.md` (player-facing rules, shown by the room's **How to play** button). Settings forms can use the shell's `SettingSlider`, `SettingSelect` and `SettingToggle` components without importing them.
3. **Register it:** one entry in `games/index.ts`, one in `games/client.ts`, and the package as a dependency in `games/package.json`.
4. **Test it.** Drive the rules with `createSim` from `@wsfg/core/testing` (virtual clock, joins, disconnects) and run `runLeakTest` with the moves your game allows. See `games/imposter/test/`.
5. **Optional integrations**, all handed core services instead of reaching into the server:
   - `migrations` (tables prefixed `<id>_`) and `prepareRound` (async I/O before a round, such as picking a word from the database)
   - `adminRouter` (mounted at `/api/admin/<id>`, already admin-only) and `adminPages` on the client
   - `publicRouter` (read-only, at `/api/games/<id>`)
   - `mcpTools` (registered as `<id>_<tool>`)
   - `categories` (use the shared categories table; you get the Categories admin page and MCP tools for free)

Within the repo, a game imports only from `@wsfg/core/*` and its own folder (npm packages like `zod` or `vue` are fine), so it never depends on server internals.

## Deploying

The target is a single Node process behind nginx (and optionally Cloudflare), kept running by a process manager, with `data/` on persistent disk:

```bash
pnpm install --frozen-lockfile   # on the server itself
pnpm build
pnpm start                       # set NODE_ENV=production and your domain in .env
```

nginx needs a `location /ws` with websocket upgrade headers and a long read timeout. Back up `data/*.db` with `sqlite3 <db> ".backup <file>"`, which is safe while running. A step-by-step guide (Supervisor, nginx, Cloudflare, backups) is still to be written; the planned setup is in [PLAN.md section 11](PLAN.md#11-deployment-existing-vps). Restarting ends open rooms, and players see a "server is restarting" notice, so deploy when nobody is playing.

## License

Not chosen yet (MIT vs AGPL is an open decision; see `docs/decisions.md`).

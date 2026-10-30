# open-gamenight

A self-hostable platform for party games that a group plays together on their phones, around one table. The first game is **Word Imposter** (3-12 players): everyone gets the same secret word except the imposter, who only knows the category. Players give one-word clues (typed or spoken), vote on who's faking it, and the imposter gets a last chance to guess the word. Also included:

- **Party games:** **Flock** (everyone answers the same question and scores by matching the most popular answer), **Ballpark** (guess a number, then bet on whose guess wins), **Color Mix** (guess the colour a few paints make when mixed) and **In Order** (co-op: describe your secret number to fit a theme, then put the table's clues in order together).
- **Card and dice games:** **Liar's Dice**, **Cheat** (play cards face down and bluff about what they are), **Last Card** (shed your hand onto a matching colour or number), **Gone Fishin'** (ask other players for cards to collect books of four) and **Old Maid** (draw blind from your neighbour and don't get stuck with the odd queen).
- **Board games:** **Tic-Tac-Toe** and **Drop Line** (2 players: drop discs to make a line of 3 to 6), and **Dots and Boxes** (2-4 players).

- **Rooms with a 4-letter code.** Signed-in users create rooms; anyone joins with just a name. Phones that drop off Wi-Fi reconnect into their seat.
- **The server decides everything.** Each phone only receives its own view of the game, so the imposter's device never gets the secret word. A leak test checks this for every game with hidden information.
- **Admin panel:** user accounts (no public sign-up), per-game categories, and the word, question and theme libraries for Word Imposter, Flock, Ballpark and In Order, with optional Claude-powered generation under a daily token cap.
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
pnpm --filter @ogn/server dev            # terminal 1
pnpm --filter @ogn/client dev --host     # terminal 2
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
| `APP_NAME` | `Open Gamenight` | App bar title, and the end of every page title |
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
| `MAX_ROOMS` / `MAX_ROOMS_PER_USER` | `50` / `2` | Abuse limits. Guests' rooms count per IP |
| `ROOM_CREATION` | `accounts` | Who may create rooms: `accounts` (signed-in users) or `anyone` (guests too; meant for a private network, since anyone who can reach the site could open rooms) |
| `UPDATE_CHECK_REPO` | `Stevenchi36/Open-Gamenight` | The admin Overview compares the running version with this GitHub repo's `main` and says when there's an update (one call to GitHub's API at most every 6 hours, only while an admin has the page open). A fork sets its own; empty turns it off |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` (logs go to stderr) |

## Accounts and admin

- Public sign-up is closed. Admins create accounts in **Admin → Users** (temporary password, name, role, ban, reset password). Forgotten passwords are reset there too.
- Signed-in users change their own name from the account menu (**Change name**); admins can change anyone's in **Admin → Users**. Names are 1-40 characters; a room seat prefills from the first 16.
- **Locked out, with no admin who can help** (the only admin forgot their password, say): run `pnpm recover-account --email them@example.com` on the server (Docker: `docker compose exec app node apps/server/scripts/recover-account.ts --email them@example.com`). It prints a recovery code like `ABCD-EFGH-JKMN` that they enter at `/recover` (**Have a recovery code?** on the sign-in page) with a new password. A code works once, for 24 hours, and is stored only as a hash; making one voids any earlier code and signs the account out everywhere. The server can keep running.
- Signed-in users change their own password from the account menu (**Change password**: current password, then the new one twice, optionally signing out their other devices). Admins use the same menu for their own; **Set password** on the Users page is for resetting someone else's.
- An account is only needed to **create** rooms (unless `ROOM_CREATION=anyone`). Guests join with a code and a name; the host role can pass to a guest (manually, or automatically after the host has been away for about 2 minutes).
- **Admin → Games** turns games off that your group never plays. They disappear from the Game Library, the start-room form and the lobby's game switcher; rooms already playing one carry on, and its library stays for when you turn it back on.
- **Admin → Word Imposter** has **Categories** (add, rename, delete empty ones) and the **Word library** (browse, add, edit or move words, delete, and generate-then-review when `ANTHROPIC_API_KEY` is set). Categories running low on unused words are flagged.
- **Admin → Flock** has **Categories** and the **Question library**, the same way.
- **Admin → Ballpark** has **Categories** and the **Question library** (each question has a numeric answer, an optional unit and an optional fact), the same way.
- **Admin → In Order** has **Categories** and the **Theme library** (each theme is a scale with what 1 and 100 mean), the same way.

## Managing words with Claude

Register the MCP server once and ask Claude Code things like *"add 20 words to every imposter category that's running low"* or *"add 30 Flock questions about films"*. Claude writes the words on your Claude subscription; no API key is involved. It also works against a deployed server over SSH. Setup, the tool list and troubleshooting are in [`docs/mcp.md`](docs/mcp.md).

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
  flock/      Flock: same shape as imposter/, with a question library
  colormix/   Color Mix (no library; paint mixing vendored from spectral.js)
  tictactoe/  Tic-Tac-Toe (2 players, nothing hidden)
  dropline/   Drop Line (2 players, nothing hidden; line length and board size settings)
  inorder/    In Order: co-op, with a theme library like flock/
  cheat/      Cheat (card game: bluff about the cards you play; no library)
  dotsandboxes/ Dots and Boxes (2-4 players, nothing hidden; grid size setting)
  oldmaid/    Old Maid (card game: draw blind from your neighbour; Classic or Royale; no library)
  ballpark/   Ballpark: guess a number, bet on the winning guess; question library like flock/
  lastcard/   Last Card (card game: match colour or number, with action cards; no library)
  gonefishin/ Gone Fishin' (card game: ask for ranks to collect books; no library)
docs/
  decisions.md   platform design decisions and why
  dev-testing.md checks, dev-players page (several players in one window)
  mcp.md         Claude / MCP guide
PLAN.md          the platform design (each game's is in games/<id>/DESIGN.md)
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
4. **Test it.** Drive the rules with `createSim` from `@ogn/core/testing` (virtual clock, joins, disconnects) and run `runLeakTest` with the moves your game allows. See `games/imposter/test/`.
5. **Optional integrations**, all handed core services instead of reaching into the server:
   - `migrations` (tables prefixed `<id>_`) and `prepareRound` (async I/O before a round, such as picking a word from the database)
   - `adminRouter` (mounted at `/api/admin/<id>`, already admin-only) and `adminPages` on the client
   - `publicRouter` (read-only, at `/api/games/<id>`)
   - `mcpTools` (registered as `<id>_<tool>`)
   - `categories` (use the shared categories table; you get the Categories admin page and MCP tools for free)

Within the repo, a game imports only from `@ogn/core/*` and its own folder (npm packages like `zod` or `vue` are fine), so it never depends on server internals.

## Deploying

The target is a single Node process behind nginx (and optionally Cloudflare), kept running by a process manager, with `data/` on persistent disk:

```bash
pnpm install --frozen-lockfile   # on the server itself
pnpm build
pnpm start                       # set NODE_ENV=production and your domain in .env
```

nginx needs a `location /ws` with websocket upgrade headers and a long read timeout. Back up `data/*.db` with `sqlite3 <db> ".backup <file>"`, which is safe while running. A step-by-step guide (Supervisor, nginx, Cloudflare, backups) is still to be written; the planned setup is in [PLAN.md section 11](PLAN.md#11-deployment-existing-vps). Restarting ends open rooms, and players see a "server is restarting" notice, so deploy when nobody is playing.

Updates: `npm run deploy` on the server (`scripts/deploy.sh`) pulls, installs, runs lint, typecheck and tests, then builds and restarts; a failed check stops it before anything live changes. GitHub Actions runs the same checks on every push and pull request.

### Self-hosting with Docker

No Node or pnpm needed on the host. Every green commit on `main` publishes an image for amd64 and arm64 to `ghcr.io/stevenchi36/open-gamenight` (tags `latest` and `sha-<commit>`).

```bash
# compose.yaml and .env.example from this repo (or clone it)
cp .env.example .env               # fill in BETTER_AUTH_SECRET, BETTER_AUTH_URL, ALLOWED_ORIGINS
docker compose up -d
docker compose exec app node apps/server/scripts/create-admin.ts --email you@example.com --name "You"
# locked out? a one-time code to enter at /recover:
docker compose exec app node apps/server/scripts/recover-account.ts --email you@example.com
```

- **Data** lives in the `data` volume (`/data/auth.db`, `/data/games.db`); the `*_DB_PATH` lines in `.env` are ignored. Back up with `docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('/data/games.db').exec(\"VACUUM INTO '/data/games-backup.db'\")"` (same for `auth.db`), then `docker compose cp app:/data/games-backup.db .`.
- **HTTPS:** the port is published on `127.0.0.1` only. Put a reverse proxy with TLS in front (nginx, Caddy, Traefik, ...) and proxy `/ws` with websocket upgrades. `NODE_ENV=production` makes cookies Secure, so signing in over plain HTTP only works on `localhost`.
- **Proxy settings:** set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the container: `0` with none, `1` for one reverse proxy, `2` for Cloudflare plus a reverse proxy (with `REAL_IP_HEADER=CF-Connecting-IP`). Too high a number lets clients fake their IP and get around the IP-based limits.
- **Updates:** the admin Overview says when a newer version is out. Run `docker compose pull && docker compose up -d`. Like any restart this ends open rooms (players see the restart notice), so update when nobody is playing. Pin a `sha-<commit>` tag in `compose.yaml` to choose when to move.
- **Build it yourself** from a clone instead of pulling: `docker compose up -d --build`.
- **MCP:** register the word-library server as `docker compose -f /path/to/compose.yaml exec -T app node apps/mcp/src/server.ts`, so it opens the same `games.db` inside the container.
- One container only: rooms live in memory, so the app can't be scaled out.

## License

Copyright © 2026 Steven Childrey. Licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

You may use, change and share this software, including running it for others. If you run a modified version as a network service, you must offer its users the complete source of your version under the same license.

Third-party code keeps its own license: `games/colormix/server/spectral.ts` is a port of [spectral.js](https://github.com/rvanwijnen/spectral.js) (MIT, notice in the file).

### Contributing

By submitting a contribution (a pull request, patch or other code), you agree that it is licensed under AGPL-3.0, and you grant Steven Childrey a perpetual, irrevocable right to also license your contribution under other terms, including commercial ones. This keeps the whole project relicensable by its author.

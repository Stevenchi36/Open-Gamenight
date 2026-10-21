# Decisions

One line each: what we decided and why. See `PLAN.md` for details. Revisit a decision by editing it here, not by quietly diverging in code.

## Platform
- **Generic platform, Imposter as the first game.** More games are expected; rooms, auth and sockets shouldn't be rewritten per game.
- **Game contract is a pure reducer (`init` / `reduce` / `view`) with effects for timers.** Testable with seeded `rng`/`now`, and the core can guarantee secrecy by only ever sending `view()` output.
- **Core sends only `view()` output, never raw state.** Secret-hiding is enforced in one place for every game, not remembered per game.
- **Generic leak test in core.** Makes "games can't leak secrets" a platform guarantee checked in CI.
- **Secrets are checked two ways: forbidden values and indistinguishable variants.** A string search catches a leaked word but not a leaked association like "this player id is the imposter"; comparing a viewer's view across states that differ only in the secret catches both.
- **Client manifest (`client.ts`) is separate from the server contract (`contract.ts`).** The browser bundle and `vue-tsc` never pull in Express or `node:sqlite` types.
- **Games import only from `packages/core` and their own folder.** Keeps Imposter usable as the reference example for future contributors.
- **Static game registry (`games/index.ts`), no runtime discovery.** Type-safe, tree-shakeable, and adding a game is one line.
- **Core protocol messages for room membership; one `action` envelope for game moves.** Core owns who is in the room; games own what happens in play, including game-level permission checks.
- **Host can switch games in the lobby (settings + scores reset).** "Let's play something else" with the same people is the common family-night case.
- **Each game ships its own Vue settings component (with shared field components).** Conditional settings are awkward to auto-generate; revisit at 3+ games.
- **Host migration is core: ~2 min grace, then next player in join order (guests allowed), plus manual transfer.** Login gates creating rooms, not running one you're already in.
- **Display names: 1-16 chars, unique per room (case-insensitive), overridable per room, no profanity filter.** Simple and enough for a semi-public audience.
- **Rooms in memory; SIGTERM sends a restart notice.** Persisting rooms isn't worth the work at this scale; the reducer design keeps it possible later.

## Stack
- **TypeScript everywhere, pnpm workspaces.** Shared protocol and view types can't drift between server and client.
- **Vue 3 + Vite SPA with Vuetify 4, served by Express (one origin).** Vuetify covers almost every component needed; one origin means no CORS and simple cookies. Nuxt skipped since Express + `ws` already is the backend.
- **Vitest for unit, core, auth and integration tests; no browser E2E in v1.** Covers the risky logic without the cost of Playwright.
- **Relative imports use `.ts` extensions (`rewriteRelativeImportExtensions`, `erasableSyntaxOnly`); workspace packages export their TS source.** Works unchanged in Vite, Vitest, tsx and Node's native type stripping. The server build (milestone 4/5) must compile or bundle workspace packages for `dist/`.
- **Latest stable packages, installed with `@latest`, lockfile committed.** Greenfield project; no reason to start behind. Exceptions are recorded here.
- **Keep pnpm's default release-age policy, so "latest" can lag by about a day.** Holding back brand-new releases is a cheap supply-chain guard (on 2026-10-21 it resolved `vite` 8.3.4 and `@anthropic-ai/sdk` 0.135.0 because 8.3.5 and 0.137.0 were under 24h old).
- **Dependency build scripts allow-listed in `pnpm-workspace.yaml` (`allowBuilds`): `esbuild`.** pnpm blocks unreviewed build scripts; add a package here only after checking what its script does.
- **TypeScript pinned to 6.0.x, not 7.** `typescript-eslint` doesn't support TypeScript 7 yet (peer range < 6.1); revisit when it does.
- **`ws`, not Socket.IO.** The core already owns rooms, per-player broadcast (`view()` per recipient), token reconnect and a zod-checked protocol, so Socket.IO would duplicate them. `ws` keeps the browser on native `WebSocket` and lets tests drive plain clients. We add the two things Socket.IO would have given us: a 30s ping/pong heartbeat and a small `maxPayload`.
- **Auth checked in a `noServer` upgrade handler.** Origin, session and per-IP caps are checked before the websocket handshake completes.
- **MCP via `@modelcontextprotocol/server` (v2), not `@modelcontextprotocol/sdk` (v1).** v2 is the current SDK line.
- **SQLite via built-in `node:sqlite`, not `better-sqlite3`.** No native build, no build-script allow-list, no binding tied to a Node version. Costs: release candidate (not yet stable), no `.transaction()`/`.pragma()` helpers (we write a small wrapper). Better Auth supports it; if its CLI doesn't, use `better-sqlite3` for the CLI only.
- **Same Node major version (26) in dev and prod; `pnpm install` runs on the VPS.** `node:sqlite` ships with Node, so its API follows the Node version.

## Auth and access
- **Keep Better Auth with closed sign-up and the admin plugin.** Audience is semi-public now and the project may be self-hosted by others; it's mostly config.
- **Roles `user` and `admin` via the admin plugin's `role` column.** No custom user-management backend.
- **No email in v1; admins reset passwords.** Nothing to send email with yet; admin reset covers a small user base.
- **Game admin routes are mounted by core under `/api/admin/<gameId>` behind `requireAdmin` + Origin check.** Games get admin features without being able to forget auth.

## Data and AI
- **Two SQLite files: `auth.db` and one shared `games.db` with per-game prefixed tables and migrations.** MCP never touches accounts; one game DB avoids multiplying files, backups and WAL handling.
- **No ORM: plain SQL migrations and prepared statements behind typed service functions (`library.ts`, `ai.ts`).** A handful of tables and queries, per-game migrations owned by each game, and live game state in memory leave an ORM little to do. If later games need relational data, add Kysely (already installed via Better Auth) as a query builder.
- **Shared AI service caps daily output tokens (plus per-admin rate limit) and logs to `ai_usage`.** Tokens are game-neutral and close to real spend; per-call limits in game units stay in each game.
- **AI is optional.** Self-hosters without an API key still get a working platform.
- **Generated words are reviewed by an admin before saving (UI path).** Keeps junk and spoiler hints out of the library.
- **One stdio MCP server with namespaced tools from every game.** One registration covers all games; driving it from Claude Code needs no API key.
- **Full v1 scope: game, auth, library, admin panel, AI generation, MCP.** Explicit choice to build it all in v1.

## Word Imposter rules
- **Imposter chosen uniformly at random every round (repeats allowed).** A shuffle bag would let players deduce who hasn't been imposter yet.
- **Hold-to-reveal for the role card and the judge's word.** People play around one table; the word must never sit on screen for the imposter to glance at.
- **Spoken guess confirmed by a judge's tap (host, or first crew member if the host is imposter).** No spelling issues; trust-based by design.
- **Configurable catch/escape points (defaults 1/2), guess bonus default +1.** Defaults suit 4-7 players; the table can rebalance for bigger groups.
- **Ties mean the imposter escapes.** Crew must clearly agree to catch them.
- **Typed clues reject the secret word and exact repeats (case-insensitive).** Prevents giving the word away and lazy copying.
- **Clue timer auto-skips in typed mode but is visual only in spoken mode.** A hard cut-off while someone is talking is annoying.
- **A disconnected imposter stays in the round; their guess counts as missed after a 15s grace.** The game never stalls and their role still matters.
- **The imposter's clue is never checked against the secret word.** Rejecting it would let the imposter retry guesses until one bounces, revealing the word. Crew clues equal to the word are still rejected.
- **REVEAL auto-advances after 5s; the host can force the end of voting (`end_voting`).** Neither had an action in the original table; a timed reveal keeps the table's attention without an extra tap.
- **Late joiners see a `waiting` role (no word) and play from the next round.** Joining mid-round must not hand anyone the secret word.
- **If the imposter leaves before the reveal, the round is voided (no points).** Nothing meaningful is left to score; the host starts the next round.
- **The built-in word list shipped with the reducer (milestone 3), not the library (milestone 6).** `wordSource: builtin` needs no DB and the game is playable before the library exists.

## Deployment
- **Existing VPS alongside Laravel apps, behind nginx, Cloudflare proxied, run under Supervisor.** Already set up; one long-lived process with persistent disk fits in-memory rooms and SQLite. (nginx/Supervisor/Full-strict are assumptions to verify at deploy time.)
- **Real client IP via configurable `TRUSTED_PROXY_HOPS` / `REAL_IP_HEADER` (`CF-Connecting-IP`).** Otherwise every IP-based limit sees Cloudflare's IPs; configurable for self-hosters.
- **Branding via `APP_NAME` / `APP_PRIMARY_COLOR`; nothing domain-specific hard-coded.** Ready for self-hosting later.
- **Docker and license deferred.** Pick the license deliberately (MIT vs AGPL) before open-sourcing.

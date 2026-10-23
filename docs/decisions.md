# Decisions

One line each: what we decided and why. See `PLAN.md` for details. Revisit a decision by editing it here, not by quietly diverging in code.

## Platform
- **Generic platform, Imposter as the first game.** More games are expected; rooms, auth and sockets shouldn't be rewritten per game.
- **Game contract is a pure reducer (`init` / `reduce` / `view`) with effects for timers.** Testable with seeded `rng`/`now`, and the core can guarantee secrecy by only ever sending `view()` output.
- **Player actions (`A`, `reduce`) and timer actions (`T`, `onTimer`) are separate types and handlers.** With one action type, `actionSchema` had to be cast and every timer case had to re-check `actorId === null`; now `actorId` is always a player, clients can't name a timer action, and the compiler keeps the two apart.
- **Core sends only `view()` output, never raw state.** Secret-hiding is enforced in one place for every game, not remembered per game.
- **Generic leak test in core.** Makes "games can't leak secrets" a platform guarantee checked in CI.
- **Secrets are checked two ways: forbidden values and indistinguishable variants.** A string search catches a leaked word but not a leaked association like "this player id is the imposter"; comparing a viewer's view across states that differ only in the secret catches both.
- **Client manifest (`client.ts`) is separate from the server contract (`contract.ts`).** The browser bundle and `vue-tsc` never pull in Express or `node:sqlite` types.
- **Client modules are built with `defineGameClient<View, Settings>`, and the shell passes `room.game.settings` to PlayViews and `needsAction` as a typed `settings`.** `needsAction` used to take `view: unknown` (accepted only through method-syntax bivariance) and play views cast `room.game.settings` by hand; now a mismatch between a game's client and its shared types fails `vue-tsc`.
- **Games import only from `packages/core` and their own folder.** Keeps Imposter usable as the reference example for future contributors.
- **Static game registry (`games/index.ts`), no runtime discovery.** Type-safe, tree-shakeable, and adding a game is one line.
- **A game's id, name, description and player limits (`GameMeta`) are declared once, as `meta` in its `shared/`, and spread into both its server and client modules; a server test checks the two registries match.** They were typed out twice per game and could drift apart.
- **Core protocol messages for room membership; one `action` envelope for game moves.** Core owns who is in the room; games own what happens in play, including game-level permission checks.
- **Host can switch games in the lobby (settings + scores reset).** "Let's play something else" with the same people is the common family-night case.
- **Each game ships its own Vue settings component (with shared field components).** Conditional settings are awkward to auto-generate; revisit at 3+ games.
- **The shared settings fields (`SettingSlider`, `SettingSelect`, `SettingToggle`) are registered as global components by the client shell.** Games use them in templates without importing anything outside `packages/core` and their own folder.
- **Reducer building blocks shared across games (presence, `pickConnected`, `nextTurnOrder` + `playerOrderSchema`, scores, vote tallies, `secretBallots`, `DISCONNECT_GRACE_MS`) live in `@wsfg/core/kit`, pure and tested in core.** Every turn- or vote-based game needs them, and a single copy keeps the behaviour (tie rules, rotate order, judge choice) the same across games. The turn engine itself stays per game until a second game shows its shape.
- **Reusable play-view pieces (helpers like `nameOf`/`useCountdown`, and Vuetify components) live in `@wsfg/core/ui` and are imported explicitly.** Games keep importing only from core, and unlike global components they get types and composables. It's browser-only, so core's `tsc` excludes it and the client's `vue-tsc` checks it.
- **Each game's player-facing rules are a `RULES.md` in its folder, loaded by the client module with Vite's `?raw` and rendered with `marked` in a "How to play" dialog in the room header.** One file serves players, contributors and Claude; it loads with the renderer only when opened. `v-html` is safe here because the Markdown is the repo's own, bundled at build time.
- **Game play views get `serverNow()`; `state` messages carry the server time.** Countdowns against server deadlines stay right on phones whose clocks are off.
- **Client lint uses `eslint-plugin-vue`'s `essential` preset (correctness only).** The `recommended` preset is mostly template line-wrapping rules, which is formatting, not bugs.
- **Host migration is core: ~2 min grace, then next player in join order (guests allowed), plus manual transfer.** Login gates creating rooms, not running one you're already in.
- **Display names: 1-16 chars, unique per room (case-insensitive), overridable per room, no profanity filter.** Simple and enough for a semi-public audience.
- **Rooms in memory; SIGTERM sends a restart notice.** Persisting rooms isn't worth the work at this scale; the reducer design keeps it possible later.
- **Game state must be plain JSON data (no Map, Set, Date, class instances, NaN); `createSim` checks it after every step, so every game test enforces it.** It's what keeps persisting rooms possible, and nothing else would notice a game quietly breaking that. Persisting would also need the seeded rng's position (one number). The game seed is logged at start, but there is no action log, so games can't be replayed yet.
- **Each room has a promise queue; every change (messages, timers, disconnects) runs on it, then broadcasts.** `prepareRound` is async, so without a queue two actions could interleave around it.
- **A fired timer re-checks its key when its turn on the queue comes, and is dropped if the key was cancelled or rescheduled meanwhile.** Work queued ahead of it can cancel it, so `cancel` and rescheduling a key mean what they say and games don't need stale-timer counters. Existing `round`/`turnSeq` guards in the games stay as a second line of defence.
- **A signed-in player who joins a room they're already in takes their seat back** (new token; the old tab gets a `removed` notice). That is how "the creator can reconnect from another device and still be host" works.
- **One connection per player; a second tab/device replaces the first.** Simpler than multiplexing, and it matches one-phone-per-person play.
- **The home page has two tabs, Join and Game Library; the tab lives in the URL (`?tab=library`).** A single game dropdown won't scale to many games, and players want to read rules before choosing. The library is public (browse, filter by name and player count, read rules); **Start a room** shows for any signed-in user, matching the server's `create_room` rule. The Join tab's create card stays for now.
- **Game menus list games alphabetically by name; the server sorts `/api/config` and the room's `availableGames`.** Registry order reflects when games were added, which means nothing to players; sorting at the source keeps the Join tab's dropdown, the lobby's game switcher and the library in the same order. Registry order still picks the server's fallback game.
- **Join errors show on the join form and clear on edit; toasts use `display-strategy="overflow"` (newest replaces current).** The default queue held each toast for its full timeout in turn, so a few wrong codes kept "no room" on screen long after the fix.
- **Manual multi-player testing uses a dev-only `dev-players.html`: an iframe per player, with client storage keys prefixed by the frame's `window.name`, and guest frames on a second host (`[::1]`) so they have no session cookie.** One window replaces juggling browsers; signed-in frames would otherwise merge into one seat. It isn't a Vite build input, and the admin app-bar button that opens it is imported only under `import.meta.env.DEV`, so neither ships.
- **Rooms with nobody connected close after 10 minutes** (plus the 1h idle rule), so a creator isn't locked out of `MAX_ROOMS_PER_USER` by abandoned rooms.
- **Joining mid-game is allowed; the game decides what a late joiner sees.** Imposter shows a waiting view until the next round.
- **Over-size frames close the socket with 1009 instead of returning `error { validation }`.** `ws` enforces `maxPayload` by closing; there is no frame to answer. Invalid JSON and schema failures still get the error message.
- **Defaults: 30 websocket connections per IP, 10 messages/sec per socket, 20 join/reconnect attempts per minute per IP.** A family behind one NAT stays well under; code guessing doesn't.

## Stack
- **TypeScript everywhere, pnpm workspaces.** Shared protocol and view types can't drift between server and client.
- **Vue 3 + Vite SPA with Vuetify 4, served by Express (one origin).** Vuetify covers almost every component needed; one origin means no CORS and simple cookies. Nuxt skipped since Express + `ws` already is the backend.
- **Vite pre-bundles every Vuetify component (`optimizeDeps.include: vuetify/components/*`).** Auto-import adds component imports after Vite's dep scan, so otherwise the first lazy page using a new component triggers a re-bundle and a full page reload mid-session.
- **Vitest for unit, core, auth and integration tests; no browser E2E in v1.** Covers the risky logic without the cost of Playwright.
- **Startup and shutdown live in `startServer()` (server.ts); index.ts only wires signals to it.** Tests run the exact shutdown path in-process. Sending a real SIGTERM to a child process isn't testable on Windows, where it kills the process before handlers run.
- **Relative imports use `.ts` extensions (`rewriteRelativeImportExtensions`, `erasableSyntaxOnly`); workspace packages export their TS source.** Works unchanged in Vite, Vitest, tsx and Node's native type stripping. The server build (milestone 4/5) must compile or bundle workspace packages for `dist/`.
- **Latest stable packages, installed with `@latest`, lockfile committed.** Greenfield project; no reason to start behind. Exceptions are recorded here.
- **Keep pnpm's default release-age policy, so "latest" can lag by about a day.** Holding back brand-new releases is a cheap supply-chain guard (on 2026-10-21 it resolved `vite` 8.3.4 and `@anthropic-ai/sdk` 0.135.0 because 8.3.5 and 0.137.0 were under 24h old).
- **Dependency build scripts allow-listed in `pnpm-workspace.yaml` (`allowBuilds`): `esbuild`.** pnpm blocks unreviewed build scripts; add a package here only after checking what its script does.
- **TypeScript pinned to 6.0.x, not 7.** `typescript-eslint` doesn't support TypeScript 7 yet (peer range < 6.1); revisit when it does.
- **`ws`, not Socket.IO.** The core already owns rooms, per-player broadcast (`view()` per recipient), token reconnect and a zod-checked protocol, so Socket.IO would duplicate them. `ws` keeps the browser on native `WebSocket` and lets tests drive plain clients. We add the two things Socket.IO would have given us: a 30s ping/pong heartbeat and a small `maxPayload`.
- **Auth checked in a `noServer` upgrade handler.** Origin, session and per-IP caps are checked before the websocket handshake completes.
- **MCP via `@modelcontextprotocol/server` (v2), not `@modelcontextprotocol/sdk` (v1).** v2 is the current SDK line.
- **SQLite via built-in `node:sqlite`, not `better-sqlite3`.** No native build, no build-script allow-list, no binding tied to a Node version. Costs: release candidate (not yet stable), no `.transaction()`/`.pragma()` helpers (we write a small wrapper). Better Auth supports it; if its CLI doesn't, use `better-sqlite3` for the CLI only.
- **The server runs its TypeScript directly on Node (type stripping); no server build step.** Node 26 strips types natively, workspace packages export TS source, and `erasableSyntaxOnly` keeps the code strippable. Only the client is built (Vite). `tsx` stays available but isn't needed.
- **Better Auth's schema is migrated at boot from code; the first admin comes from our `pnpm create-admin` script.** No CLI steps to forget on deploy, temp test databases just work, and the script uses the same config/env as the server.
- **Our Origin check runs in front of Better Auth too.** Better Auth skips its own check for requests without cookies, which would let another site sign people in (login CSRF).
- **The real client IP is computed once and handed to Better Auth in an internal header.** Better Auth's rate limits then use the same IP as ours, and a spoofed `X-Forwarded-For` can't dodge them.
- **Agent skills: only ones published by a package's own maintainers, copied into `.claude/skills/` and pinned in `skills-lock.json`.** So far that is Better Auth's (best practices, security, email/password); org and 2FA skipped since we don't use them. Vue's `vuejs-ai/skills` is community-run and Vuetify's only skill targets `@vuetify/v0`, so neither is in. Skills run with full agent permissions, so read the diff after `npx skills update`.
- **`.env` is read with Node's `process.loadEnvFile` from the repo root.** No dotenv dependency. Values starting with `#` (like the primary color) must be quoted.
- **Same Node major version (26) in dev and prod; `pnpm install` runs on the VPS.** `node:sqlite` ships with Node, so its API follows the Node version.

## Auth and access
- **Keep Better Auth with closed sign-up and the admin plugin.** Audience is semi-public now and the project may be self-hosted by others; it's mostly config.
- **Roles `user` and `admin` via the admin plugin's `role` column.** No custom user-management backend.
- **No email in v1; admins reset passwords.** Nothing to send email with yet; admin reset covers a small user base.
- **An admin password reset signs the user out everywhere (an `after` hook in `auth.ts`).** Better Auth's admin `set-user-password` keeps sessions, so resetting a compromised account wouldn't lock out whoever has it.
- **Game admin routes are mounted by core under `/api/admin/<gameId>` behind `requireAdmin` + Origin check.** Games get admin features without being able to forget auth.
- **Admins see open rooms at `/admin/rooms` (names, status, who opened it; no tokens or game state) and can join or close them.** Joining is the normal join flow and takes a seat like any player, so an admin can't watch secret views unseen; closing tells everyone "An admin closed this room." and frees the code and the creator's room slot.

## Data and AI
- **Two SQLite files: `auth.db` and one shared `games.db` with per-game prefixed tables and migrations.** MCP never touches accounts; one game DB avoids multiplying files, backups and WAL handling.
- **Categories live in one core `categories` table scoped by `game_id`, not in each game's rows.** Admins manage them directly (core Categories page per game), pickers and filters read the list instead of `SELECT DISTINCT`, and future games reuse it. Games reference categories by id with `ON DELETE RESTRICT`, may read/join the table filtered by their own `game_id`, and write through `services.categories`. This is the one exception to "games only touch their own prefixed tables".
- **Adding words by category *name* (MCP, AI generation) creates missing categories; the admin "Add word" form picks from existing ones.** Claude can still say "add 20 words in a new Sports category"; the UI keeps the list tidy.
- **A category with words can't be deleted (the database refuses); words can be edited and moved instead.** No silent cascades that delete a library by accident.
- **Imposter migration `003_default_words` seeds a starter library (14 categories x 20 words, source `builtin`) with `INSERT OR IGNORE`.** A fresh install has categories to pick from; an existing library keeps its own words and gains only what's missing. The list in `default-words.ts` is frozen with the migration; more defaults mean a new migration. Tests start from an empty library unless they ask for the seed.
- **No ORM: plain SQL migrations and prepared statements behind typed service functions (`library.ts`, `ai.ts`).** A handful of tables and queries, per-game migrations owned by each game, and live game state in memory leave an ORM little to do. If later games need relational data, add Kysely (already installed via Better Auth) as a query builder.
- **Migrations stay per game; a game id change goes through `renamedFrom` on the game module.** One database suggested one central migration list, but per-game migrations keep a game one folder plus a registry line, and keep the table-prefix check enforced. `renamedFrom` makes a rename safe without editing applied migrations: before the game's migrations run, the core moves the old id's recorded migrations, categories and AI usage to the new id and accepts the old table prefix in old migrations; the game's own new migration renames its tables.
- **Once every database has applied a rename, the game's migrations may be squashed onto the new id (the one exception to append-only), keeping their migration ids, and `renamedFrom` dropped from the game.** Fresh databases then create the new tables directly instead of carrying old names forever; existing ones already have those ids recorded and skip them. Done for Flock after the dev and production databases had applied `003_rename_from_herd`: 001 and 002 now create and seed `flock_questions`, 003 is gone (its record stays in those databases, unused). The `renamedFrom` feature stays in the core for future renames.
- **Shared AI service caps daily output tokens (plus per-admin rate limit) and logs to `ai_usage`.** Tokens are game-neutral and close to real spend; per-call limits in game units stay in each game.
- **Only admin routers (and MCP tools) receive `services.ai`; gameplay hooks and public routes get `null`.** The API key is billed, so a guest or player must never be able to reach a paid call, even through a future game's `prepareRound` or public route.
- **AI is optional.** Self-hosters without an API key still get a working platform.
- **AI calls use one strict tool with `tool_choice: auto`, not a forced tool, and validate the result.** Forced tool choice is rejected by several current models and the model is configurable. A missing or malformed call becomes `AiError('invalid')`, and generation retries once.
- **`AiError` (codes `cap`, `rate_limited`, `invalid`, `refused`, `api`) lives in packages/core.** Games map AI failures to HTTP statuses without importing server code.
- **Usage is logged even when the response is unusable, and the per-admin limit is counted from `ai_usage`.** Tokens were spent either way, and the limits survive restarts.
- **Game admin routers read the signed-in admin from `res.locals.user` (`AdminUser` in the contract).** The core already resolved it in requireAdmin; games don't re-check sessions.
- **The MCP process reads the repo `.env` (without overriding its own env), so `imposter_generate_words` appears when the server has a key.** One place to configure the key, model and caps.
- **Generated words are reviewed by an admin before saving (UI path).** Keeps junk and spoiler hints out of the library.
- **The generate dialog has an opt-in "no spoilers" mode (`save: true`): the server saves directly and returns counts per category only, never words, hints or skipped entries.** An admin who also plays shouldn't see the words; validation and de-duping still screen out junk, and returning counts only (rather than hiding the words in the client) keeps them out of devtools too.
- **Imposter MCP add/generate tools tell Claude not to list the words or hints in its reply (counts and categories only) unless explicitly asked, in the tool description and as a `note` on the result.** The person adding words may be about to play. The words still appear in the tool-call input, which Claude Code shows collapsed.
- **Imposter hints default to a single, loosely related word (seeds, built-ins, MCP guidance, AI prompt); migration `004_vague_default_hints` rewrites the starter hints that are still unedited.** Phrase hints ("Squirt your friends") handed the imposter the word. Longer hints are still allowed when asked for (`hintStyle` on generation); validation does not enforce one word.
- **One stdio MCP server with namespaced tools from every game.** One registration covers all games; driving it from Claude Code needs no API key.
- **The MCP process runs migrations on games.db at start and defaults GAMES_DB_PATH to <repo>/data/games.db.** It works before the web server has ever run, from any working directory.
- **Games may expose a read-only `publicRouter` at /api/games/<id> (GET only, rate-limited).** The lobby's category picker needs library categories, and admin routes are the wrong place for player-facing data.
- **prepareRound signals a library fallback as `{ builtin: true, notice }`; the pure reducer picks the built-in word with ctx.rng.** Repeat-avoidance for built-in words stays in game state, and the notice still comes from the game.
- **Full v1 scope: game, auth, library, admin panel, AI generation, MCP.** Explicit choice to build it all in v1.

## Word Imposter rules
- **Imposter chosen uniformly at random every round (repeats allowed).** A shuffle bag would let players deduce who hasn't been imposter yet.
- **Round player order setting, default `rotate`: random first round, then last round's order moved on one seat; `random` reshuffles every round.** Rotating gives everyone a turn going first (and avoids the same person always opening); the order is fixed within a round's rotations either way. Leavers drop out of the line and newcomers join its end, so a mid-game join never reshuffles everyone. In `rotate`, the host can tick "Randomize player order" on Play again for a one-off reshuffle (a flag on `next_round`, not a setting, since settings only change in the lobby); rotation carries on from the new order.
- **Hold-to-reveal for the role card and the judge's word.** People play around one table; the word must never sit on screen for the imposter to glance at.
- **Spoken guess confirmed by a judge's tap (host, or first crew member if the host is imposter).** No spelling issues; trust-based by design.
- **In typed mode the imposter types the guess, but the judge still rules on it.** Typing settles "what did they actually say"; the judge keeps misspellings and near-misses from being auto-failed. One try, locked once sent, so the imposter can't read the room and retry. Everyone sees the guess. A sent guess stands if the imposter then disconnects.
- **Configurable catch/escape points (defaults 1/2), guess bonus default +1.** Defaults suit 4-7 players; the table can rebalance for bigger groups.
- **Ballots are secret during voting, then public (who voted for whom) on the reveal, guess-check and results screens.** No bandwagoning while voting; afterwards the table wants to talk it over, and the 5s reveal alone is too short to read it.
- **A wordless pulsing screen-edge glow means the game is waiting on you** (your clue turn, your vote, the imposter's guess and the judge, the host's next round). Host-only overrides don't trigger it. Phones lie on the table, so the cue must be visible at a glance without reading. The shell draws it (`AttentionGlow` in `RoomPage`); a game only supplies a pure `needsAction(view, me, room, settings)` in its client module, so every game gets the same cue.
- **Ties mean the imposter escapes.** Crew must clearly agree to catch them.
- **Typed clues reject the secret word and exact repeats (case-insensitive).** Prevents giving the word away and lazy copying.
- **Typed clues are listed by player (name as a small heading, clues as a bulleted list) and stay visible while voting.** Voters compare each player's clues side by side; the view already carries them.
- **Clue timer auto-skips in typed mode but is visual only in spoken mode.** A hard cut-off while someone is talking is annoying.
- **A disconnected imposter stays in the round; their guess counts as missed after a 15s grace.** The game never stalls and their role still matters.
- **The imposter's clue is never checked against the secret word.** Rejecting it would let the imposter retry guesses until one bounces, revealing the word. Crew clues equal to the word are still rejected.
- **REVEAL auto-advances after 5s; the host can force the end of voting (`end_voting`).** Neither had an action in the original table; a timed reveal keeps the table's attention without an extra tap.
- **Late joiners see a `waiting` role (no word) and play from the next round.** Joining mid-round must not hand anyone the secret word.
- **If the imposter leaves before the reveal, the round is voided (no points).** Nothing meaningful is left to score; the host starts the next round.
- **The built-in word list shipped with the reducer (milestone 3), not the library (milestone 6).** It needs no DB, so the game is playable before the library exists; it stays as the last-resort fallback.
- **Word source is "All words" or "Added only" (skips library rows with source `builtin`, i.e. the seeded starter words); there is no "built-in list only" option.** Nobody picks the starter list on purpose, while hosts who have played it through want fresh words. "Added only" falls back to starter words (with a host notice) when added ones run out, then to the in-code list.

## Liar's Dice rules
- **Liar's Dice is the second game.** It's built on hidden per-player information like Imposter but has no words or votes on players, so it tests whether `kit` and `ui` really fit a different game.
- **Perudo rules: wild ones on by default (opening bid can't be on ones, half/double+1 when switching), spot on optional.** They're the best-known rules; wild ones and the halving rule keep late rounds with few dice interesting.
- **Only the next player can call, and never on their own bid.** It's the classic turn structure, and it keeps the game turn-based rather than a race to tap.
- **The player who lost (or gained) a die starts the next round.** Standard rule; it gives the loser the opening bid.
- **A disconnected player's turn passes after the 15s grace with the bid unchanged; nobody auto-bids or auto-calls for them.** Any automatic move would be an arbitrary choice that can cost a die.
- **A player leaving mid-round restarts the round (re-roll, no die lost).** The bid was made against dice that are now gone, and nobody should lose a die over it.
- **One point per match won, carried across matches; seats move on one each match.** A match is the natural unit to win; rotating seats changes who opens.
- **Your dice show only while held (`HoldToReveal`).** Same reason as Imposter's role card: phones lie on a shared table.
- **REVEAL stays up for 8s, then the next round rolls; a summary of the last challenge stays visible while bidding.** Counting dice takes longer than reading an Imposter vote, and the summary keeps "what just happened" readable after the timer.
- **No bid timer in v1.** The disconnect grace stops a stalled turn; a timer can come later if tables want one.

## Flock rules
- **Flock is the third game (id `flock`, formerly `herd`).** It's the simplest library-driven game after Imposter and the first to compare free-text answers, so it tests the categories table and library pattern with a second game.
- **Renamed from Herd Mentality to Flock, and its pink cow to the black sheep, before open-sourcing.** Herd Mentality is a commercial game by Big Potato Games and the name is very likely trademarked, and the pink cow is its signature piece. Mechanics are free to use; names and branding aren't. The id moved from `herd` to `flock` too, so code, tables, routes and MCP tools match the name; `renamedFrom` and migration `003_rename_from_herd` carried existing libraries over, then the migrations were squashed (see Data and AI).
- **Score limit defaults to unlimited (options 5-20).** Family tables often play "a few questions" and stop; a limit is there for a proper race.
- **The flock is a strictly biggest group of at least 2; a tie for biggest scores nobody.** That's the original party game's rule, and it makes a split table a real loss rather than a shared win.
- **Black sheep on by default: exactly one lone answer becomes the black sheep, who can't win.** The odd-one-out twist keeps lone answers interesting; with no score limit it's just a badge of shame.
- **The win check uses who is the black sheep after the round is scored.** Points and the black sheep move together, so reaching the limit in the same round it passes to someone else wins; a stricter "start the round without it" rule was considered and not taken.
- **Players who reach the limit in the same round win together.** The whole flock scores at once, so simultaneous wins are common; a tie-break round would be arbitrary.
- **Answers are matched after normalising (case, accents, punctuation, spaces, leading "the"/"a"/"an", a plural "s" on words of 4+ letters not ending in ss/us/is); the host merges the rest.** Automatic fuzzy matching would merge answers the table thinks are different ("Mars" bars vs Mars); the host's eye is the source of truth, like Imposter's judge.
- **The host checks matches by default (setting), and is a player too.** Near-misses are common with typed answers; a family table trusts the host, and the groups are on everyone's screen while they do it.
- **Answers can be changed until the reveal, and who has answered is public.** Like Imposter's votes: changing your mind is harmless, and the table wants to see who it's waiting for.
- **A disconnected player who hasn't answered doesn't hold up the reveal and sits the round out.** The game never stalls on a dropped phone.
- **One frozen starter list serves as the seed migration (`002_default_questions`) and the in-code fallback.** Imposter needed two lists because its seed outgrew the fallback; here one list keeps a fresh install and an empty library playing the same questions.
- **Your sent answer sits behind `HoldToReveal`.** Phones lie on the table, and a neighbour copying your answer would join your flock.
- **Core `ScoreBoard` has a `badge` slot for a per-player marker (Flock's black sheep).** Copying the scoreboard into a game to add one icon would fork it.
- **Questions aren't secret, so the MCP tools may show them.** Knowing the question in advance doesn't help much: the game is about guessing what others will say.

## Color Mix rules
- **Color Mix is the fourth game (id `colormix`), with no library.** Random colours need no content, so it's a pure game like Liar's Dice.
- **Colours mix like paint (Kubelka-Munk), not like light.** Players expect blue + yellow to make green; an RGB average makes grey, which feels wrong. The user chose paint.
- **The mixing maths is vendored from spectral.js (MIT, v3.0.0) into `server/spectral.ts`, not added as a dependency.** The package is untyped UMD; a typed copy of the few functions used keeps the answer pure and pinned (a library update can't silently change answers).
- **Closeness is OKLab distance, shown as a percentage to 2 decimals: `100 × e^(−distance / 0.25)`.** OKLab is perceptual and simple; a percentage reads better at the table than a raw distance. Whole percentages showed two different guesses as equal (85% and 85%) with one ranked above the other. A straight scale was tried twice: 0% at 0.5 gave a plain grey guess 75% (most colour pairs are under 0.2 apart), and 0% at 0.25 felt harsh and showed two different far-off guesses as 0.00% with a winner between them. The curve gives grey about 61%, never reaches 0, and keeps far-off guesses apart.
- **Scoring is a setting: ranked by default (1 point per player you beat), or closest only.** The user offered both. Ranked keeps every guess worth something; "players you beat" handles ties and missing guesses without special cases.
- **The game length is a number of rounds, unlimited by default, and the highest total wins.** Ranked points grow with the table's size, so a score limit would feel different by group size. The user chose rounds.
- **Difficulty sets the colours to mix: easy 2, medium 3, hard 4, or all difficulties (random each round).** Replaced a free 2-6 count: the user found 6 too many, and named levels read better than numbers.
- **Random colours are vivid (saturation 50-100%, lightness 25-70%), sometimes one white, at least 0.12 OKLab apart.** Fully random RGB gives many muddy, near-identical colours.
- **Guesses can be changed until the reveal and sit behind `HoldToReveal`; who has guessed is public.** Same reasons as Herd's answers.

## Tic-Tac-Toe rules
- **Tic-Tac-Toe is the fifth game (id `tictactoe`), exactly 2 players, no settings.** The user asked for a simple 2-player game; the classic rules need no options.
- **`secrets` is empty and there is no leak test.** Both players see the whole board; `runLeakTest` refuses a game with no secrets, and adding a fake one would test nothing.
- **Marks are random for the first game, then swap every game (`nextTurnOrder` 'rotate'); X always moves first.** Moving first is an advantage, so it alternates.
- **A disconnected player's turn is never skipped.** With one move per turn and two players, skipping hands the other player two marks in a row, which breaks the game; the other player can wait or leave.
- **A player leaving mid-game ends it with no points (`abandoned`).** A win by forfeit would reward the one left for a game that wasn't played out; the room holds 2, so a newcomer joins for the next game.
- **Wins score 1 point, draws score nothing; scores carry across games.** Between two players the win count is the score that matters.

## Drop Line rules
- **Drop Line is the sixth game (id `dropline`), a drop-discs-and-make-a-line game for exactly 2 players.** The user asked for one; the name avoids the trademarked brand of the best-known version and has no number in it because the line length is a setting.
- **Line length 3-6 (default 4) and a small / standard / large board per length, from a fixed table.** Free column and row counts would allow boards that play badly (too cramped to block, or nearly always drawn); 6 is the longest line that fits a board of about 11 columns, the most a phone can show with tappable columns.
- **Red and blue discs, red first.** Two colours that stay distinct in light and dark themes, and not the best-known version's red and yellow.
- **Lines longer than the setting count as wins, and the whole line lights up.** Dropping a disc can join two shorter lines into one longer than required; refusing that win would be a strange rule.
- **Disconnects, leavers, colour swapping and scoring work as in Tic-Tac-Toe.** Same two-player structure, same reasons.

## Deployment
- **Existing VPS alongside Laravel apps, behind nginx, Cloudflare proxied, run under Supervisor.** Already set up; one long-lived process with persistent disk fits in-memory rooms and SQLite. (nginx/Supervisor/Full-strict are assumptions to verify at deploy time.)
- **Each production client build carries an id (Vite stamps it into the bundle and `index.html`); the server sends it in `session`, and a tab running a different build reloads once (guarded per tab in sessionStorage).** After a deploy, open tabs reconnect with the old bundle, which may not understand new view shapes. Rooms don't survive the restart anyway, so the reload costs nothing; the guard stops a loop if a cache keeps serving the old bundle. Dev has no id and never reloads.
- **Updates run through `npm run deploy` (`scripts/deploy.sh`): fast-forward pull, frozen install, build, `supervisorctl restart`.** One command, no skipped build; fails fast on a diverged checkout or lockfile drift. Not `pnpm deploy`, which is pnpm's own built-in command.
- **Real client IP via configurable `TRUSTED_PROXY_HOPS` / `REAL_IP_HEADER` (`CF-Connecting-IP`).** Otherwise every IP-based limit sees Cloudflare's IPs; configurable for self-hosters.
- **Branding via `APP_NAME` / `APP_PRIMARY_COLOR`; nothing domain-specific hard-coded.** Ready for self-hosting later.
- **Docker and license deferred.** Pick the license deliberately (MIT vs AGPL) before open-sourcing.

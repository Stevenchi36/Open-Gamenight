# Word Imposter: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

## Rules
1. Host starts a round. Everyone except the imposter receives the **same secret word**. The imposter sees only the **category** and, optionally, a **vague hint**.
2. The imposter is chosen **uniformly at random every round** (repeats allowed; deliberately no shuffle bag, so nobody can deduce who hasn't been imposter yet). Imposter count is fixed at 1 (keep a constant for later).
3. **Clue phase.** Players take turns in an order set per round (see Round player order) and fixed for all its rotations. On your turn, give **one word** linked to the secret word, typed or spoken (see Clue mode). The imposter bluffs. In typed mode everyone sees clues as they arrive.
4. This repeats for N **rotations** (default 2).
5. **Vote phase.** Everyone (including the imposter) votes secretly for who they think the imposter is, with live "x/y voted" progress.
6. **Reveal.** Show tallies and the imposter. **Caught** = the plurality vote lands on the imposter; **escapes** = wrong player or a tie.
7. **Guess check** (per `guessMode`). The imposter says their guess for the secret word **out loud** (spoken mode) or **types it** once (typed mode; everyone sees it). Either way a **judge** taps **Got it** or **Missed it**, so misspellings can still count.
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

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Rotations | 2 | 1-5 |
| Round player order | `rotate` | `rotate` (random first round; each later round the next player in line goes first, same order; leavers drop out, newcomers join the end; the host can tick **Randomize player order** on Play again for a one-off reshuffle) / `random` (reshuffled every round) |
| Imposter hint | `category` | `none` / `category` / `category+hint` |
| Word source | `all` | `all` (whole library) / `custom` ("Added only": skips the seeded starter words, falls back to them when it runs out) / `recent` ("Recently added": the newest batch first, then older words; see `@ogn/core/library`). All fall back to `builtin-words.ts` if nothing matches |
| Category | Any | categories from the library that have words in the chosen source, plus "Any" |
| Clue mode | `typed` | `typed` / `spoken` (players speak; the app tracks turns, voting, score) |
| Imposter guess | `bonus` | `bonus` / `steal` / `off` |
| Guess points | 1 | 0-3, shown only in `bonus` mode |
| Catch points | 1 | 0-3 |
| Escape points | 2 | 0-5 |
| Clue timer | off | seconds per turn. **Typed:** auto-skip on expiry. **Spoken:** visual countdown only, never auto-advances |

## State machine
```
CLUES -> VOTING -> REVEAL -> (GUESS_CHECK) -> RESULTS -> (next_round -> CLUES | gameOver -> lobby)
```
(The lobby is core; `init` starts at `CLUES`.)
- `CLUES`: `turnOrder` (per `playerOrder`: shuffled with `rng`, or last round's order moved on one seat) x `rotations`; `turnIndex` tracks the current turn.
  - **Typed:** only the current player can `submit_clue`; the turn advances on submit.
  - **Spoken:** nothing is typed; the current speaker taps **Done** (`end_turn`); the host can tap it for anyone. No clue feed.
  - Last turn done -> `VOTING`. Host can `start_voting` at any time to skip remaining turns.
  - A disconnected player on their turn is auto-skipped after a ~15s grace (scheduled effect).
- `VOTING`: one vote each, not for yourself; changes allowed until everyone has voted. Advance when all connected players have voted, or the host forces it. **A disconnected imposter stays in the round** and can be voted for and caught.
- `REVEAL`: tally, set `caught`. Go to `GUESS_CHECK` if `guessMode` is `bonus`, or `steal` and caught; otherwise `RESULTS`.
- `GUESS_CHECK`: only the judge can send `judge_guess { correct }`; in typed mode, only after the imposter's one `submit_guess`. The host can `skip_guess` (counts as missed). If the imposter is disconnected without having sent a guess, it counts as missed after the 15s grace. The imposter's view keeps hiding the secret word.
- `RESULTS`: apply scoring, show the secret word to everyone, outcome, points this round, scoreboard. Host: **Play again** (`next_round`) or **Back to lobby**.

## Actions (inside the `action` envelope)
| action | payload | Who |
|---|---|---|
| `submit_clue` | `{ word }` (typed mode only; rejected in spoken) | current player |
| `end_turn` | `{}` (spoken mode) | current player, or host for anyone |
| `start_voting` | `{}` | host |
| `end_voting` | `{}` (force the reveal before everyone has voted) | host |
| `cast_vote` | `{ targetId }` | player |
| `submit_guess` | `{ word }` (typed mode, once, 1-40 chars) | **imposter only** |
| `judge_guess` | `{ correct: boolean }` | **judge only** |
| `skip_guess` | `{}` | host |
| `next_round` | `{ shuffle? }` (one-off turn order reshuffle) | host |

## Validation
- Clue (typed only): trimmed, a single token (no spaces), 1-24 chars, **not equal to the secret word**, and **not a repeat** of an earlier clue this round (both case-insensitive). Rejected with `error { code: 'game' }` so the player can retry.
- Library words: `word` non-empty, 1-3 words, under 30 chars; `category` under 40; `hint` under 120 and must **not contain the word** (case-insensitive). Duplicates (same category + word, compared by core `matchKey`: ignoring case, accents, punctuation, a leading "the" and a plural "s") are skipped, not errors; the skip reason names the stored spelling when it differs. Questions in other games de-dupe the same way.

## View (per player)
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
    votedFor: { [voterId]: targetId }, accusedId, caught, imposterId,
    judgeId, guessRequired, guess: string | null, guessCorrect: boolean | null,
    secretWord?: string,                        // omitted for the imposter until RESULTS
    imposterWon?, pointsAwarded?                // RESULTS only
  }
}
```
`you.word` is `null` for the imposter. Ballots (who voted for whom; clients count them) are hidden until REVEAL and stay shown through RESULTS; `imposterId` appears from REVEAL onward. `secrets` declares: `ballots` are hidden during VOTING; `secretWord` is visible to crew always, to the imposter only in `RESULTS`; `imposterId` is visible to the imposter always, to others from `REVEAL`; `category` goes to the crew always and, when the imposter gets it too (a hint setting other than none), to everyone, outsiders and the TV included. The core leak test checks this.

## Hold-to-reveal (physical table)
Players sit together, so the imposter could glance at a neighbour's phone. **The word is never on screen at rest:**
- The role card shows "Hold to see your word" and reveals the word only while pressed (pointer/touch down), hiding it on release. The imposter's card behaves identically (showing their category/hint) so nobody can tell roles apart by how others use their phones.
- The judge's GUESS_CHECK screen shows **Got it / Missed it** with the secret word behind the same hold-to-reveal.

## Watch page
A `SpectatorView` showing only what every player knows until the reveal: the category when it's public (otherwise "Secret category"), whose turn it is with the turn order and rotation progress, the clues in order as they're sent (typed mode; in spoken mode the TV mostly shows the turn order), and the vote progress (who has voted, never for whom). Then the imposter and the vote breakdown, the guess and the judge, and in `RESULTS` the word, who won and the scores. Each phase's card pops in as it arrives; clues pop in on phones too.

## Word library
Tables in `games.db` (Imposter migrations):
```sql
-- core table, shared by all games (scoped by game_id), managed in /admin/<gameId>/categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, game_id TEXT NOT NULL, name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (game_id, name COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS imposter_words (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  word         TEXT NOT NULL,
  hint         TEXT NOT NULL,           -- vague clue shown to the imposter
  difficulty   TEXT DEFAULT 'medium',   -- easy | medium | hard
  source       TEXT DEFAULT 'claude',   -- claude | builtin | manual
  times_used   INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE (category_id, word COLLATE NOCASE)
);
```
(Imposter's migration `002_category_ids` moved the original text `category` column into `categories`.)
- `library.ts`: `listWords`, `listCategories` (total + unused counts), `addWords` (validate, de-dupe, insert, return `{ inserted, skipped }`), `removeWords`, `pickWord`, `generateWords` (via the core AI service).
- **`pickWord({ category?, excludeIds, customOnly?, recent? })`** (run by the runner in `prepareRound`, so the reducer stays pure): least-used word, random among ties (with `recent`, the newest batch among the least used), optionally filtered by category (and to non-starter words for "Added only"), skipping words already used in this room; increments `times_used`/`last_used_at`. If the library is empty or nothing matches, fall back to `builtin-words.ts` and send the host a `notice`. A game must always be able to start.
- Categories with fewer than ~5 unused words are flagged in the admin page ("running low on Foods").

**Admin routes** (`/api/admin/imposter/*`, guarded by core):
| Route | Purpose |
|---|---|
| `GET /words?category=&q=&limit=&offset=` | Browse |
| `GET /categories` | Categories with total / unused counts |
| `POST /words` | Save one or many (manual entry or approved candidates) |
| `DELETE /words` | Remove by `{ ids: [] }` |
| `DELETE /words/used` | "Clear used": remove every word played at least once, in `{ categoryId? }` or all categories |
| `POST /words/generate` | `{ count (max 50), category?, difficulty?, save? }` -> **candidates only, not saved**; with `save: true`, saves them and returns counts only (`inserted`, `insertedByCategory`, `createdCategories`, `skippedCount`) |

**Generation flow:** admin enters category + count (and optional extra instructions, e.g. "really easy, for young kids"), clicks Generate, reviews candidates in a table (edit or untick), then Save (`POST /words`). Keeps junk and spoiler hints out of the library. A "no spoilers" checkbox skips the review: the server saves directly and the dialog shows only how many words went into each category, for admins who also play.

**Generation prompt** (`generateWords` -> `ai.generate` with forced tool `submit_words` returning `[{ category, word, hint, difficulty }]`): concrete, widely known words (nouns preferred); hints are a single loosely related word (unless a `hintStyle` override is given), vague enough not to give the word away but enough to bluff with; stay inside the category; vary difficulty; pass existing words in the category as an avoid-list; add the admin's optional free-text `instructions` (up to 500 chars, e.g. "really easy, for young kids"; core `instructionsLine`). Validate output; retry once, then return an error (the UI shows it; games are unaffected).

**MCP tools:** `imposter_add_words` (`{ words: [{ category, word, hint, difficulty? }] }`; when driven from Claude Code/Desktop, Claude writes the words itself, so **no API key is needed**), `imposter_list_categories`, `imposter_search_words` (`{ category?, query?, limit? }`), `imposter_remove_words` (`{ ids }`), `imposter_generate_words` (only when `ANTHROPIC_API_KEY` is set; saves directly, still subject to the token cap).

## Decisions

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
- **Word source is "All words" or "Added only" (skips library rows with source `builtin`, i.e. the seeded starter words); there is no "built-in list only" option.** Nobody picks the starter list on purpose, while hosts who have played it through want fresh words. "Added only" falls back to starter words (with a host notice) when added ones run out, then to the in-code list. A third option, "Recent", plays the newest batch first (see Data and AI); the toggle labels are shortened to All / Added / Recent to fit a phone.

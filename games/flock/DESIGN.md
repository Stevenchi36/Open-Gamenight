# Flock: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The third game: everyone answers the same question and tries to give the answer most people give. The first game with free-text answers that are compared with each other, and the second with a library (questions), managed like Imposter's words. Its id was `herd` until the rename from Herd Mentality; `renamedFrom: ['herd']` and a rename migration moved existing data over, and the migrations were later squashed onto `flock`.

## Rules
1. Each round shows one **question** ("Name a breakfast cereal") and its category. Everyone in the round types **one answer** in secret. Answers can be changed until the reveal.
2. **Reveal** when every connected player has answered, when the answer timer runs out, or when the host taps **Reveal now**. Answers are grouped automatically: the same answer after normalising (case, accents, punctuation, extra spaces, a leading "the"/"a"/"an", a plural "s").
3. **Check matches** (setting, default on). Everyone sees the groups; the host merges near-misses ("Coco Pops" and "Cocoa Pops") or splits a merge again, then taps **Score it**. Off: scoring follows the automatic groups straight away.
4. **Scoring.** If one group is strictly bigger than every other and has at least 2 players, that is **the flock**: each of its players scores 1 point. A tie for biggest, or all answers different, scores nobody.
5. **Black sheep** (setting, default on). If exactly one player is alone in their group (the odd one out), they become the black sheep, taking over from whoever was before. With a score limit, the black sheep can't win. The black sheep leaving clears it.
6. **Score limit** (setting, default unlimited). With a limit, the game ends after a round where a player has at least that many points and isn't the black sheep; everyone who qualifies at once wins together. Unlimited: rounds go on until the host returns to the lobby.
7. The host starts the next round (new question); after a win, **New game** resets scores and the black sheep.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Score limit | unlimited | `null` / 5 / 8 / 10 / 12 / 15 / 20 |
| Black sheep | on | |
| Check matches | on | host merges near-misses before scoring |
| Question source | `all` | `all` (least-played first) / `recent` ("Recently added": the newest batch first, then older questions, with a host notice; see `@ogn/core/library`) |
| Category | Any | categories from the library that have questions, plus "Any" |
| Answer timer | off | 30 / 45 / 60 / 90 / 120 seconds; on expiry, reveal with the answers in |

## State machine
```
ANSWERING -> (REVIEW) -> RESULTS -> next_round -> ANSWERING   (new_game after a win)
```
- `ANSWERING`: round players (everyone present at round start) `submit_answer`; resubmitting replaces your answer. Advances once every connected round player has answered (a disconnected player who hasn't answered sits the round out), on the timer, or on the host's `reveal_answers`.
- `REVIEW` (Check matches on): answers are public, grouped. Host-only `merge_groups { from, into }`, `split_group { group }`, `score_round`.
- `RESULTS`: flock, points, black sheep, scoreboard, winners when the limit is reached. Host: **Next question** (`next_round`), or **New game** (`new_game`) after a win, or **Back to lobby**.
- Late joiners wait for the next round. A round player leaving drops their answer; the black sheep goes with them.

## Actions
| action | payload | Who |
|---|---|---|
| `submit_answer` | `{ text }` (1-40 chars after trimming) | round player, `ANSWERING` |
| `reveal_answers` | `{}` | host, `ANSWERING` |
| `merge_groups` | `{ from, into }` (group ids) | host, `REVIEW` |
| `split_group` | `{ group }` (back to automatic groups) | host, `REVIEW` |
| `score_round` | `{}` | host, `REVIEW` |
| `next_round` | `{}` | host, `RESULTS`, no winner yet |
| `new_game` | `{}` | host, `RESULTS` after a win |

## View (per player)
```ts
{
  phase, round,
  question: { text, category },
  you: { status: 'playing' | 'waiting', answer: string | null },  // your own answer only
  roundPlayers, answered: PlayerId[],     // who has answered, not what
  deadline: number | null,                // answer timer
  scores, blackSheepId: PlayerId | null,
  groups: [{ id, label, answers: [{ playerId, text }] }],  // [] during ANSWERING; biggest first
  flockId: string | null,                 // REVIEW (current leader) and RESULTS
  result: { pointsAwarded, blackSheepFrom, blackSheepTo, winnerIds } | null,  // RESULTS only
}
```
`secrets` declares: other players' answers are hidden during `ANSWERING` (variant check: a viewer's view must not change when another player's answer changes, including to the viewer's own answer).

## Client (watch page and win)
- **Watch page**: a `SpectatorView`. Answering: the question big with the timer and `WhoAnswered` (who has answered, never what). Review: the groups dropping in one by one when revealed live, updating as the host merges and splits, with the flock so far. Results: the flock's answer, the groups, the black sheep if it moved. The scores (with the black sheep's badge) stay alongside.
- **Win**: when someone reaches the score limit, a `WinCelebration` with a podium (the winners first, as the black sheep can't win; then by score), on your phone and the TV.

## Question library
```sql
CREATE TABLE flock_questions (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  question TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'claude',  -- claude | builtin | manual
  times_used INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, question COLLATE NOCASE)
);
```
- Question: trimmed, 5-120 chars. Categories are the core `categories` rows with `game_id = 'flock'`.
- Migration `002_default_questions` seeds a starter set (source `builtin`); the same frozen list is the in-code fallback when the library has nothing to pick.
- `prepareRound` picks the least-used question (random among ties), optionally in the chosen category, skipping ones used in this room, and marks it used; otherwise a built-in question plus a host notice.
- **Admin** (`/api/admin/flock/*`, page `/admin/flock/questions`): browse/search, add, edit/move, delete, Clear used (`DELETE /questions/used`), and AI generation (review, then save), like Imposter's words.
- **MCP tools:** `flock_add_questions`, `flock_list_categories`, `flock_search_questions`, `flock_update_question`, `flock_remove_questions`, `flock_generate_questions` (only with `ANTHROPIC_API_KEY`), plus the core `flock_*_category` tools.

## Decisions

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

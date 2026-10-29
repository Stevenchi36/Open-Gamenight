# Ballpark: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The seventh game: trivia with numeric answers ("How tall is the Eiffel Tower?"). Everyone guesses a number, then everyone bets on the guesses, so a player who knows nothing can still win by betting well. Mechanics from Wits & Wagers, renamed because that name is trademarked. The third library game (questions with answers and units), and the first whose library content is secret during play.

## Rules
1. Each round shows one **question**, its category and its **unit** ("metres", "feet", "years", or none for plain counts). Everyone in the round types **one number** in secret and can change it until the reveal.
2. **Guesses go on the board** when every connected round player has guessed, the timer runs out, or the host taps **Reveal guesses**. Equal guesses merge into one slot. The slots are sorted from lowest to highest, and each gets **odds** by its distance from the middle (see Odds). With the `over` win rule, an **All too high** slot sits below the lowest guess.
3. **Betting.** Every round player (including anyone who didn't guess) places **2 betting tokens** on slots, both on one slot if they like, in secret or openly (setting), and can move them until the reveal. Betting ends the same way guessing does (**Reveal answer** for the host).
4. **The winning slot** (setting):
   - **Without going over** (`over`, default): the highest guess not above the answer wins. If every guess is above it, **All too high** wins.
   - **Closest** (`closest`): the guess nearest the answer wins; two guesses equally far away (one under, one over) both win.
5. **Scoring** (setting), for each token on a winning slot, plus a bonus for each player whose guess is in a winning slot:
   - **Odds** (`odds`, default): a token scores the slot's odds; writing the winning guess scores 3.
   - **Chips** (`chips`): your score is your chip stack. Each token can carry a **stake** of chips from your stack (stakes on both tokens together at most your score when betting opens; a token with no stake is allowed). A winning token scores its odds × (1 + stake); a losing token loses its stake. Writing the winning guess scores 3. Scores never go below 0.
   - **Flat** (`flat`): a winning token scores 1; writing the winning guess scores 1. No odds.
6. **Rounds** (setting, default 7). After the last round the highest total wins; ties win together. Unlimited: the host plays on until returning to the lobby.
7. The host starts the next round; after the last one, **New game** resets the scores.

## Odds
With `n` distinct guesses sorted lowest first, the middle slot pays **2**, and each step outward pays 1 more, up to **5**. With an even `n` there is no middle slot, so the two central slots pay 3. All too high pays **6**. Examples: 1 guess `2`; 4 guesses `4 3 3 4`; 5 guesses `4 3 2 3 4`; 9 guesses `5 5 4 3 2 3 4 5 5`. Odds don't apply in `flat` scoring.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Rounds | 7 | `null` (unlimited) / 5 / 7 / 10 / 15 |
| Units | `metric` | `metric` / `imperial`; see Units |
| Win rule | `over` | `over` (without going over, with All too high) / `closest` |
| Scoring | `odds` | `odds` / `chips` / `flat` |
| Bets | `hidden` | `hidden` (who has bet is public, not on what) / `public` (tokens show as they land) |
| Question source | `all` | `all` (least-played first) / `recent` ("Recently added": the newest batch first, then older questions, with a host notice; see `@ogn/core/library`) |
| Category | Any | categories from the library that have questions, plus "Any" |
| Timer | off | 30 / 45 / 60 / 90 / 120 seconds, separately for guessing and for betting; on expiry, move on with what's in |

## Units
Questions are stored with one metric unit (or a unit that is the same in both systems, or none). With `imperial`, the reducer converts the answer when the round starts and shows the imperial unit; guesses are typed and compared in the room's unit. The question text never names a unit: the unit is shown beside it.

| Stored | Imperial | | Stored | Imperial |
|---|---|---|---|---|
| `mm`, `cm` | inches | | `g` | ounces |
| `m` | feet | | `kg` | pounds |
| `km` | miles | | `t` (tonne) | US tons |
| `m2` | square feet | | `ml` | US fluid ounces |
| `km2` | square miles | | `l` | US gallons |
| `km/h` | mph | | `C` | °F |

Unconverted in both systems: `%`, `s`, `min`, `h`, `days`, `years`, and `null` (no unit: counts, calendar years). A converted answer is rounded before play, and scoring uses the rounded value players see: a whole number from 100 up, otherwise 3 significant figures, with temperatures below 100 to one decimal place instead (330 m → 1,083 ft; 1.6 m → 5.25 ft; 37 °C → 98.6 °F). Conversion is pure (`shared/units.ts`), so it lives in the reducer.

## State machine
```
GUESSING -> BETTING -> RESULTS -> next_round -> GUESSING   (new_game after the last round)
```
- `GUESSING`: round players (everyone present at round start) `submit_guess`; resubmitting replaces it. Advances once every connected round player has guessed (a disconnected player who hasn't guessed has no guess this round), on the timer, or on the host's `reveal_guesses`. No guesses at all: straight to `RESULTS` with the answer and no points.
- `BETTING`: the slots are fixed. Round players `place_bets` (both tokens in one action; resending replaces them). Advances once every connected round player has bet, on the timer, or on the host's `reveal_answer`; anyone who hasn't bet scores nothing from bets.
- `RESULTS`: the answer, winning slots, everyone's bets, points this round, the scoreboard, and winners after the last round. Host: **Next question** (`next_round`), **New game** (`new_game`) after the last round, or **Back to lobby**.
- Late joiners wait for the next round. A round player leaving during `GUESSING` drops their guess; during `BETTING` their slot stays on the board and their bets are dropped; in `RESULTS` the round stays as scored.

## Actions
| action | payload | Who |
|---|---|---|
| `submit_guess` | `{ value }` (finite, \|value\| ≤ 1e12) | round player, `GUESSING` |
| `reveal_guesses` | `{}` | host, `GUESSING` |
| `place_bets` | `{ bets: [{ slot, stake }, { slot, stake }] }` (`slot` a slot id; `stake` a whole number ≥ 0, only above 0 in `chips` scoring, total within your score) | round player, `BETTING` |
| `reveal_answer` | `{}` | host, `BETTING` |
| `next_round` | `{}` | host, `RESULTS`, game not over |
| `new_game` | `{}` | host, `RESULTS` after the last round |

## View (per player)
```ts
{
  phase, round, totalRounds: number | null,
  question: { text, category, unit: string | null },  // unit label in the room's system
  you: { status: 'playing' | 'waiting', guess: number | null, bets: Bet[] },  // your own only
  roundPlayers, guessed: PlayerId[], betted: PlayerId[],  // who, not what
  deadline: number | null,
  slots: [{ id, value: number | null, playerIds, odds }],  // [] during GUESSING; value null = All too high
  bets: { [playerId]: Bet[] } | null,       // BETTING with public bets, and RESULTS
  scores,
  result: { answer, fact: string | null, winningSlotIds, pointsAwarded, winnerIds } | null,  // RESULTS only
}
```
`secrets` declares: other players' guesses are hidden during `GUESSING`; the answer and fact are hidden until `RESULTS`; with hidden bets, other players' bets are hidden during `BETTING` (variant checks, as in Color Mix: a viewer's view must not change when another player's guess or bets change, or when the answer changes). The leak test covers both bet settings and both win rules.

## Client (watch page and win)
- **Watch page**: a `SpectatorView`. Guessing: the question big with its timer and `WhoAnswered` (who has guessed, never what). Betting: the board of guesses dropping in one by one when revealed live, tokens on it only with public bets, and who has bet. Results: the answer and fact, the closest guessers, the winning slot lit with everyone's tokens. The scores (or chips) stay alongside.
- **Win**: after the last question, a `WinCelebration` with a podium by score or chips, on your phone and the TV.

## Hold-to-reveal
Your sent guess, and your bets when bets are hidden, sit behind `HoldToReveal`: phones lie on the table.

## Question library
```sql
CREATE TABLE ballpark_questions (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  question TEXT NOT NULL,             -- no unit in the text
  answer REAL NOT NULL,               -- in `unit`
  unit TEXT,                          -- a code from the Units table, or NULL
  fact TEXT,                          -- optional, shown with the answer ("Including its antennas")
  source TEXT NOT NULL DEFAULT 'claude',  -- claude | builtin | manual
  times_used INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, question COLLATE NOCASE)
);
```
- Question: trimmed, 5-160 chars, ending in `?`. Answer: finite, |answer| ≤ 1e12. Unit: a known code or null. Fact: up to 200 chars, no measurements in it (it isn't converted).
- Good questions have one well-documented answer that won't change soon, where a reasonable guess lands in the right order of magnitude. The AI prompt and MCP descriptions say so; the admin review is where wrong numbers get caught.
- Migration `002_default_questions` seeds a starter set (source `builtin`); the same frozen list is the in-code fallback, as in Flock.
- `prepareRound` picks the least-used question (random among ties), optionally in the chosen category, skipping ones used in this room, and marks it used; otherwise a built-in question plus a host notice.
- **Admin** (`/api/admin/ballpark/*`, page `/admin/ballpark/questions`): browse/search, add, edit/move, delete, Clear used, and AI generation (review, then save, with Imposter's "no spoilers" option), like Flock's questions.
- **MCP tools:** `ballpark_add_questions`, `ballpark_list_categories`, `ballpark_search_questions`, `ballpark_update_question`, `ballpark_remove_questions`, `ballpark_generate_questions` (only with `ANTHROPIC_API_KEY`), plus the core `ballpark_*_category` tools. Add and generate reply with counts only, as Imposter's do: answers are spoilers.

## Decisions

- **Ballpark is the seventh game (id `ballpark`): Wits & Wagers mechanics under a new name.** Wits & Wagers is trademarked; mechanics are free to use. "Ballpark figure" describes the guessing half in one word.
- **Win rule, scoring and bet visibility are all settings (defaults: without going over, odds, hidden).** The user wanted each variant available. The defaults are the original game's rules, except hidden bets, which stop players copying the table's best guesser.
- **Odds by distance from the middle slot (2 up to 5; two central slots pay 3 with an even count; All too high pays 6); writing the winning guess scores 3.** That's the original betting mat, computed from the slot count rather than fixed spaces.
- **Bets are 2 tokens each; chips scoring lets a token carry a stake from your score, and a token without a stake still wins its odds.** Tokens alone keep every player in the game even with no chips, as the original's betting markers do; scores never go negative.
- **Questions are stored with one metric unit (or a unit-free one) and converted for an `imperial` room setting, default metric.** The user asked for it; one stored unit keeps the library single-sourced. The question text never names a unit, so it reads the same in both systems.
- **A converted answer is rounded before play (whole numbers from 100 up, else 3 significant figures, or one decimal for temperatures so 37 °C reads 98.6 °F), and scoring uses the rounded value.** "Without going over" must be judged on the number players see, not a hidden 1082.68.
- **Answers are secret during play, so MCP add/generate tools reply with counts only.** As with Imposter's words: the admin adding questions may be about to play.
- **A leaving player's guess stays on the board once betting has started.** Others may already have bet on it.
- **Core `ScoreBoard` shows negative round points as a red "−N".** Chips scoring can lose points; showing "+-3" in green would be wrong for every future game that can lose points too.
- **Guesses are typed into a decimal keypad field with a ± button.** Phone number pads often have no minus key, and some answers (record low temperatures) are negative. Commas and spaces typed as digit grouping are ignored.

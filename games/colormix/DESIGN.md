# Color Mix: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The fourth game: a few random paint colours are shown, and everyone picks the colour they'd make if mixed in equal parts. The closest guesses score. No library, no hidden roles: the only secrets are the guesses and the answer until the reveal.

## Rules
1. Each round shows **2-4 random colours**, set by the difficulty (setting). Everyone in the round picks one colour with a colour picker, in secret, and can change it until the reveal.
2. **Reveal** when every connected round player has guessed, when the guess timer runs out, or when the host taps **Reveal now**.
3. **The answer** is the colours mixed like paint in equal parts: Kubelka-Munk pigment mixing (spectral.js, vendored in `server/spectral.ts`), so blue + yellow makes green. Computed once at round start.
4. **Closeness** is the OKLab distance between a guess and the answer (perceptual: equal distances look about equally different). Shown as a percentage to 2 decimals, `100 × e^(−distance / 0.25)`: a curve, so near misses score high, poor guesses low, and it never reaches 0 (far-off guesses still show which was closer).
5. **Scoring** (setting):
   - **Ranked** (default): you score 1 point for every round player who was further away than you. With N guessers the closest gets N−1 and the furthest 0; equal distances score the same; a player with no guess counts as furthest and scores 0.
   - **Closest only:** the closest guess scores 1 point (everyone tied for closest scores).
6. **Rounds** (setting, default unlimited). With a number, the game ends after that round: the highest total wins, ties win together. Unlimited: the host plays on until returning to the lobby.
7. The host starts the next round; after the last one, **New game** resets the scores.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Rounds | unlimited | `null` / 5 / 10 / 15 / 20 |
| Difficulty | easy | `easy` (2 colours) / `medium` (3) / `hard` (4) / `all` (a random difficulty each round) |
| Scoring | ranked | `ranked` / `closest` |
| Guess timer | off | 30 / 45 / 60 / 90 / 120 seconds; on expiry, reveal with the guesses in |

## Colours
Drawn with `ctx.rng`: hue anywhere, saturation 50-100%, lightness 25-70% (vivid paints, not mud), and 1 in 10 a white (at most one per round, so tints happen). Each colour is at least 0.12 OKLab away from the others in the round, so no two look alike. Colours travel as lower-case `#rrggbb`.

## State machine
```
GUESSING -> RESULTS -> next_round -> GUESSING   (new_game after the last round)
```
- `GUESSING`: round players (everyone present at round start) `submit_guess`; resubmitting replaces the guess. Advances once every connected round player has guessed (a disconnected player who hasn't guessed sits the round out), on the timer, or on the host's `reveal_guesses`.
- `RESULTS`: the answer, every guess ranked with closeness and points, the scoreboard, and winners after the last round. Host: **Next round** (`next_round`), **New game** (`new_game`) after the last round, or **Back to lobby**.
- Late joiners wait for the next round. A round player leaving before the reveal drops their guess; in `RESULTS` the round stays as scored.

## Actions
| action | payload | Who |
|---|---|---|
| `submit_guess` | `{ color }` (`#rrggbb`, any case) | round player, `GUESSING` |
| `reveal_guesses` | `{}` | host, `GUESSING` |
| `next_round` | `{}` | host, `RESULTS`, game not over |
| `new_game` | `{}` | host, `RESULTS` after the last round |

## View (per player)
```ts
{
  phase, round, totalRounds: number | null,
  colors: string[],                         // the colours to mix
  you: { status: 'playing' | 'waiting', guess: string | null },  // your own guess only
  roundPlayers, guessed: PlayerId[],        // who has guessed, not what
  deadline: number | null,                  // guess timer
  scores,
  target: string | null,                    // RESULTS only
  result: { guesses: [{ playerId, color, distance, closeness, points }], pointsAwarded, winnerIds } | null,  // RESULTS only; closest first
}
```
`secrets` declares: other players' guesses and the answer are hidden during `GUESSING` (variant checks: a viewer's view must not change when another player's guess changes, including to the viewer's own guess, or when the answer changes).

## Client (watch page and win)
- **Watch page**: a `SpectatorView`. Guessing: the colours to mix big with the timer and `WhoAnswered` (who has guessed, never what). Results: the real mix beside the colours, then every guess dropping in from the furthest to the closest, so the winner lands last. The scores stay alongside.
- **Win**: after the last round, a `WinCelebration` with a podium by score, on your phone and the TV.

## Decisions

- **Color Mix is the fourth game (id `colormix`), with no library.** Random colours need no content, so it's a pure game like Liar's Dice.
- **Colours mix like paint (Kubelka-Munk), not like light.** Players expect blue + yellow to make green; an RGB average makes grey, which feels wrong. The user chose paint.
- **The mixing maths is vendored from spectral.js (MIT, v3.0.0) into `server/spectral.ts`, not added as a dependency.** The package is untyped UMD; a typed copy of the few functions used keeps the answer pure and pinned (a library update can't silently change answers).
- **Closeness is OKLab distance, shown as a percentage to 2 decimals: `100 × e^(−distance / 0.25)`.** OKLab is perceptual and simple; a percentage reads better at the table than a raw distance. Whole percentages showed two different guesses as equal (85% and 85%) with one ranked above the other. A straight scale was tried twice: 0% at 0.5 gave a plain grey guess 75% (most colour pairs are under 0.2 apart), and 0% at 0.25 felt harsh and showed two different far-off guesses as 0.00% with a winner between them. The curve gives grey about 61%, never reaches 0, and keeps far-off guesses apart.
- **Scoring is a setting: ranked by default (1 point per player you beat), or closest only.** The user offered both. Ranked keeps every guess worth something; "players you beat" handles ties and missing guesses without special cases.
- **The game length is a number of rounds, unlimited by default, and the highest total wins.** Ranked points grow with the table's size, so a score limit would feel different by group size. The user chose rounds.
- **Difficulty sets the colours to mix: easy 2, medium 3, hard 4, or all difficulties (random each round).** Replaced a free 2-6 count: the user found 6 too many, and named levels read better than numbers.
- **Random colours are vivid (saturation 50-100%, lightness 25-70%), sometimes one white, at least 0.12 OKLab apart.** Fully random RGB gives many muddy, near-identical colours.
- **The colours to mix show as one strip of flush vertical swatches, like a paint chip.** The user found small, spaced-out circles harder to compare.
- **Guesses can be changed until the reveal and sit behind `HoldToReveal`; who has guessed is public.** Same reasons as Herd's answers.

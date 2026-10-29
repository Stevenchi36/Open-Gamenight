# Drop Line: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The sixth game: two players drop discs into an upright grid, aiming for a line of a set length. Built like Tic-Tac-Toe (2 players, nothing hidden), with settings for the line length and board size.

## Rules
1. Two players, **red** and **blue**, take turns dropping a disc into a column that isn't full. The disc falls to the lowest empty cell. Red goes first.
2. A line of at least `lineLength` of your discs, across, down or diagonally, wins the game and scores **1 point**. A full board with no line is a draw (no points). Scores carry across games.
3. The first game's colours are random; each new game the players swap colours, so the first move alternates.
4. The host starts the next game.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Line length | 4 | 3-6 |
| Board size | standard | `small` / `standard` / `large`; columns × rows depend on the line length |

| Line | Small | Standard | Large |
|---|---|---|---|
| 3 | 4×4 | 5×4 | 6×5 |
| 4 | 6×5 | 7×6 | 8×7 |
| 5 | 8×7 | 9×7 | 10×8 |
| 6 | 9×8 | 10×9 | 11×10 |

## State machine
```
PLAYING -> RESULTS -> new_game -> PLAYING
```
- `PLAYING`: `turn` is the player to move; they `drop` a disc. A disconnected player keeps their turn (no skip).
- `RESULTS`: the final board with the winning line, the outcome, and the scoreboard. Host: **New game** (`new_game`, needs 2 players) or **Back to lobby**.
- A player leaving during `PLAYING` ends the game with outcome `abandoned` and no points (a notice says why). A replacement can join and play from the next game.

## Actions
| action | payload | Who |
|---|---|---|
| `drop` | `{ column }` (0-based, left to right) | the player to move, column not full, `PLAYING` |
| `new_game` | `{}` | host, `RESULTS`, 2 players present |

## View (per player)
```ts
{
  phase, game, cols, rows, lineLength,
  you: { disc: 'red' | 'blue' | null },   // null: not in this game
  discs: { red: PlayerId, blue: PlayerId },
  columns: ('red' | 'blue')[][],          // per column, bottom first
  last: { col, row } | null,              // the latest disc dropped
  turn: PlayerId | null,                  // PLAYING only
  outcome: 'win' | 'draw' | 'abandoned' | null,  // RESULTS only
  winnerId: PlayerId | null,
  line: { col, row }[] | null,            // the winning line, every disc in it
  scores,
}
```
`secrets` is empty, as in Tic-Tac-Toe.

## Client
- **Watch page**: a `SpectatorView` like Tic-Tac-Toe's: the board large, the players' chips (colour, name, score), whose move it is with the line length, and on `RESULTS` the outcome and the scoreboard.
- **Animation** (on the board, so players and the TV both see it): a newly dropped disc falls from above the board into its spot with a small bounce, and a line won while watching pulses once the disc lands, with a `WinCelebration` (confetti in the winner's colour, "{name} wins!" or "You win!") for about 3.5 seconds. Not on first render; motion is off under `prefers-reduced-motion` (the card still shows).

## Decisions

- **Drop Line is the sixth game (id `dropline`), a drop-discs-and-make-a-line game for exactly 2 players.** The user asked for one; the name avoids the trademarked brand of the best-known version and has no number in it because the line length is a setting.
- **Line length 3-6 (default 4) and a small / standard / large board per length, from a fixed table.** Free column and row counts would allow boards that play badly (too cramped to block, or nearly always drawn); 6 is the longest line that fits a board of about 11 columns, the most a phone can show with tappable columns.
- **Red and blue discs, red first.** Two colours that stay distinct in light and dark themes, and not the best-known version's red and yellow.
- **Lines longer than the setting count as wins, and the whole line lights up.** Dropping a disc can join two shorter lines into one longer than required; refusing that win would be a strange rule.
- **Disconnects, leavers, colour swapping and scoring work as in Tic-Tac-Toe.** Same two-player structure, same reasons.

# Tic-Tac-Toe: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The fifth game, and the first for exactly 2 players. No library, no settings and no hidden information.

## Rules
1. Two players, **X** and **O**, take turns placing their mark in an empty cell of a 3×3 grid. X goes first.
2. Three of your marks in a row, column or diagonal wins the game and scores **1 point**. A full board with no line is a draw (no points). Scores carry across games.
3. The first game's marks are random; each new game the players swap marks, so the first move alternates.
4. The host starts the next game.

## Settings
None.

## State machine
```
PLAYING -> RESULTS -> new_game -> PLAYING
```
- `PLAYING`: `turn` is the player to move; they `place` a mark. A disconnected player keeps their turn (no skip): the other player waits or leaves.
- `RESULTS`: the final board with the winning line, the outcome, and the scoreboard. Host: **New game** (`new_game`, needs 2 players) or **Back to lobby**.
- A player leaving during `PLAYING` ends the game with outcome `abandoned` and no points (a notice says why). The room holds 2, so a replacement can join and play from the next game.

## Actions
| action | payload | Who |
|---|---|---|
| `place` | `{ cell }` (0-8, row by row) | the player to move, empty cell, `PLAYING` |
| `new_game` | `{}` | host, `RESULTS`, 2 players present |

## View (per player)
```ts
{
  phase, game,
  you: { mark: 'X' | 'O' | null },        // null: not in this game
  marks: { X: PlayerId, O: PlayerId },
  board: ('X' | 'O' | null)[],            // 9 cells, row by row
  turn: PlayerId | null,                  // PLAYING only
  outcome: 'win' | 'draw' | 'abandoned' | null,  // RESULTS only
  winnerId: PlayerId | null,
  line: number[] | null,                  // the winning three cells
  scores,
}
```
`secrets` is empty: everything is on the board, so there is nothing for the leak test to check.

## Client
- **Watch page**: a `SpectatorView` with the board large, the players' chips (mark, name, score), whose move it is, and on `RESULTS` the outcome and the scoreboard.
- **Animation**: a mark placed while watching pops into its square, and a line won then pulses, followed by a `WinCelebration` ("{name} wins!" or "You win!") on your phone and the TV. Not on first render; off under `prefers-reduced-motion`.

## Decisions

- **Tic-Tac-Toe is the fifth game (id `tictactoe`), exactly 2 players, no settings.** The user asked for a simple 2-player game; the classic rules need no options.
- **`secrets` is empty and there is no leak test.** Both players see the whole board; `runLeakTest` refuses a game with no secrets, and adding a fake one would test nothing.
- **Marks are random for the first game, then swap every game (`nextTurnOrder` 'rotate'); X always moves first.** Moving first is an advantage, so it alternates.
- **A disconnected player's turn is never skipped.** With one move per turn and two players, skipping hands the other player two marks in a row, which breaks the game; the other player can wait or leave.
- **A player leaving mid-game ends it with no points (`abandoned`).** A win by forfeit would reward the one left for a game that wasn't played out; the room holds 2, so a newcomer joins for the next game.
- **Wins score 1 point, draws score nothing; scores carry across games.** Between two players the win count is the score that matters.

# Dots and Boxes: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The twelfth game: the classic pencil-and-paper game. Players take turns drawing a line between two neighbouring dots; whoever closes a box claims it and draws again. Built like Drop Line (nothing hidden, a board-size setting), but for 2-4 players, with Cheat's disconnect skip and leaver handling.

## Rules
1. **2-4 players**, each with a colour by seat: **red, blue, green, orange**. Seats follow the turn order; red goes first.
2. **A turn.** Draw one line between two dots next to each other, across or down, that isn't drawn yet.
3. **Boxes.** A line that closes the fourth side of a box claims it for you (filled in your colour). One line can close two boxes. Closing at least one box means you **draw again**; otherwise the turn passes on.
4. **The end.** When every line is drawn, the player with the most boxes wins and scores **1 point**. Players tied for most each score 1 point (a shared win). Scores carry across games.
5. **Next game.** The host starts it. Seats keep their places and the first turn moves on one seat (`nextTurnOrder` 'rotate'), so colours move round too; with 2 players that's a swap.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Grid | 5 | boxes per side, 3-7 (a square grid of 4×4 to 8×8 dots) |

## State machine
```
PLAYING -> RESULTS -> new_game -> PLAYING
```
- `PLAYING`: `turn` is the player to draw. With 3 or more players still in the game, a disconnected player's turn passes to the next seat after the 15s grace (`DISCONNECT_GRACE_MS`), without drawing. With 2 it waits, as in Drop Line.
- `RESULTS`: the full board, the box counts and winners, and the scoreboard. Host: **New game** (`new_game`, needs 2 players) or **Back to lobby**.
- A player leaving mid-game: their seat stays (dimmed) with their boxes, they're skipped, and they can't win. If fewer than 2 players remain, the game ends as `abandoned` with no points. Late joiners wait for the next game.

## Actions
| action | payload | Who |
|---|---|---|
| `draw` | `{ dir, row, col }` (`h`: row 0-grid, col 0-(grid-1); `v`: row 0-(grid-1), col 0-grid; counted in dots from the top left) | the player to move, line not drawn, `PLAYING` |
| `new_game` | `{}` | host, `RESULTS`, 2+ players present |

## View (per player)
```ts
type Line = { dir: 'h' | 'v', row, col }
{
  phase, game, grid,
  you: { seat: number | null },             // your seat (and colour) index; null: not in this game
  seats: [{ id, boxes, left }],             // turn order; the index picks the colour
  h: boolean[][],                           // (grid+1) rows × grid: drawn across-lines
  v: boolean[][],                           // grid rows × (grid+1): drawn down-lines
  boxes: (number | null)[][],               // grid × grid: the owner's seat index
  last: Line | null,                        // the latest line drawn
  turn: PlayerId | null,                    // PLAYING only
  outcome: 'win' | 'abandoned' | null,      // RESULTS only
  winnerIds: PlayerId[],                    // RESULTS only; more than one is a shared win
  scores,
}
```
`secrets` is empty, as in Drop Line.

## Client
- **Board**: an SVG of dots, drawn lines and claimed boxes (filled in the owner's colour, with their initial so colour isn't the only cue). Every undrawn line's tap target is the diamond between its two dots and the centres of the boxes either side, so targets tile the board without overlapping and stay large on a phone. Hovering previews the line in your colour; the latest line is highlighted. A line drawn while watching draws in from its first dot, and any box it closes then grows in, in its owner's colour (not on first render; off under `prefers-reduced-motion`).
- **Seats**: a chip per seat in turn order: colour, name, boxes this game; the turn is highlighted, disconnects show the wifi-off icon, leavers are dimmed.
- **Watch page**: a `SpectatorView` with the seats, the board and the scoreboard.
- **Win**: on the play view and the watch page, a `WinCelebration` with confetti in the winners' colours and a podium of places by boxes (ties share a place; leavers aren't placed).
- `needsAction`: your turn, or the host on `RESULTS`.

## Decisions

- **Dots and Boxes is the twelfth game (id `dotsandboxes`) under its traditional name.** The name is generic and owned by nobody (the game dates from 1889), like Tic-Tac-Toe and Cheat, so it passes the naming rule in `games/CLAUDE.md`; the user chose it over a custom name.
- **2-4 players, not 2 as in `games/IDEAS.md`.** The game plays well with more, and more than 4 colours stop being easy to tell apart on a small board.
- **Square grids of 3-7 boxes per side (default 5).** 8 dots across is the most a phone fits with comfortable tap targets; 5×5 is the usual size and its 25 boxes can't tie between two players.
- **Seat colours red, blue, green, orange follow the turn order; seats rotate each game (`nextTurnOrder` 'rotate').** Moving first changes the game, so it moves round; colours by seat mean red always goes first, as in Drop Line.
- **Closing a box means drawing again, and that is compulsory.** It's the standard rule; the endgame strategy (giving away boxes to keep control) depends on it.
- **Players tied for the most boxes each score 1 point.** With 3-4 players a tie for first is common, and calling it a draw would waste a whole game; between two players a shared point changes nobody's lead.
- **A disconnected player's turn is skipped after the 15s grace only while 3 or more are in the game; with 2 it waits.** With 3-4 players, one locked phone shouldn't stall the rest; with 2, a skip hands the other player two turns in a row, as in Drop Line.
- **A leaver's seat and boxes stay on the board, they're skipped and can't win; under 2 players left ends the game with no points.** Removing their boxes would reopen closed squares; same leaver shape as Cheat.
- **Line tap targets are diamonds (the line's two dots and the centres of the boxes either side).** They tile the board without gaps or overlaps, so every point picks exactly one line and targets stay as large as the grid allows.
- **Boxes show the owner's initial as well as their colour, in white, or dark on orange, on a solid box.** Colour alone fails colour-blind players; white on orange (and on boxes faded to 0.85) was under 3:1.
- **Each line target's screen-reader name says what drawing it does to the boxes either side ("completes the box above; the box below has 1 side"), and a hidden summary gives the boxes claimed and the last line.** Drawn lines aren't focusable, so a screen reader would otherwise learn nothing about the board; box side counts are what a player decides on.
- **The board is one Tab stop: arrow keys move between all lines (left/right along a row, up/down to the next row of lines from the same dot), drawn ones included, and Enter or Space draws; a hint shows under the board while it has keyboard focus.** One Tab stop per undrawn line meant up to 60 on a 5×5 board; drawn lines stay reachable so a screen reader can explore the whole board, and the hint tells sighted keyboard players what screen readers hear in the board's name.

# Spectator views to add

Games with no `SpectatorView` yet. On the watch page (`/watch/:code`) they show only the player list and a note saying the game has no TV view yet. See `PLAN.md` § Spectators and `docs/decisions.md`.

**Done:** Cheat, Dots and Boxes, Tic-Tac-Toe, Drop Line, Gone Fishin', Last Card.

## How to add one

- Add `client/SpectatorView.vue` with props `SpectatorViewProps<View, Settings>`, and register it as `SpectatorView: () => import('./SpectatorView.vue')` in `client/index.ts`.
- It renders `view(state, SPECTATOR_ID)`, the view an outsider gets. There's no `send` and no `me`, so the page is display only. Pass `SPECTATOR_ID` wherever a component asks for `me`, so text never says "you".
- Size it for a TV: game content in a `md="8"` column, and log and scores in a `md="4"` column.
- If the outsider view lacks something a TV should show, add only public data to `view()`, check it against `secrets`, and keep `runLeakTest` green. The spectator check fails any secret the spectator can see that some player can't.
- Update `PLAN.md` (the game's "Watch page" bullet) and `RULES.md` if players would notice the change.

## Groups

### 1. Secret-answer party rounds: Flock, Color Mix, Ballpark

These share one round shape: a prompt, then secret answers, then a reveal, then scores.

- **Answering:** show the prompt big (question, or paint swatches for Color Mix), the timer, and who has answered. Show no answers.
- **Reveal:** this is the TV's best moment. Show Flock's answer groups, Color Mix's real mix against every guess with closest first, and Ballpark's board.
- **Ballpark** has an extra betting phase. Show the board of guesses and where tokens sit only if that's already public at that point; check `secrets`.
- Build one first (Flock is the simplest) and pull the shared "prompt + who's answered + timer" header into `@wsfg/core/ui` if the other two match it.

### 2. Hidden-role and hidden-info games: Word Imposter, In Order, Liar's Dice

These have the most secrets, so check each view against `secrets` before showing anything.

- **Word Imposter:** before the reveal, show the category only, never the word or the imposter. Show the clue list in order, whose turn it is, the vote progress (who has voted, not for whom), and then the reveal and the guess result. If the host chose spoken clues, the TV mostly shows turn order.
- **In Order:** show the theme scale, the shared line of clue cards in its current order, the Ready count, and lives left, with no numbers until the reveal. Then turn the cards over one by one, as players see it. This works well on a TV, since the room arranges the line together.
- **Liar's Dice:** show the seats with dice counts (not faces), the current bid, the bid history, and whose turn it is. When someone calls, show the faces that were revealed. Reuse `SeatList.vue` and `DiceRow.vue` (faces only after a call).

## Animations

Make play more lively, on the TV and on players' phones alike.

- **In the shared board and table components** (`DropBoard`, `DotsBoard`, `CardTable`, `PlayingCard`), so the play view and the `SpectatorView` both get them. A TV view may add extras on top, like a bigger win moment.
- **Client only, driven by view changes.** The server and games stay as they are. A component compares the new view with the one before (`last`, the move log) and animates the difference.
- **Never on first render.** Joining, reconnecting or opening the TV mid-game shows the board as it stands, without replaying moves.
- **`prefers-reduced-motion`** turns every animation off, back to instant updates.
- **Only from view data.** A TV can't show cards leaving a hand it can't see; they come from the seat, face down.
- Plain Vue transitions and CSS, no animation library.

Per game, in order:

1. **Drop Line (done):** the disc falls into its column with a small bounce, and a winning line pulses when it's made live, followed by the win celebration.
2. **Card games (done):** `CardTable` flights (each game's `client/flights.ts`) for Cheat, Gone Fishin' and Last Card: the deal, cards arcing between seats, the pile and your hand, flips when turned up, a Cheat call's reveal and pickup, Last Card's 7-0 swaps, Gone Fishin's books popping in, and new cards dropping into your hand. Their TV views get it by using the game's table.
3. **Dots and Boxes:** the line draws in, and a claimed box fills in its owner's colour.
4. **Tic-Tac-Toe:** a small pop when a mark lands.
5. **Win celebration everywhere:** core `WinCelebration` (confetti burst and a "{name} wins!" card, plus a podium when given `standings`) is in Drop Line, Dots and Boxes, Gone Fishin' and Last Card. Add it to every game with a winner, on the play view and the TV; mount it outside any results-only branch so it sees the win arrive.
6. **TV extras**, per game as its view is built: a pulse on the turn chip.

## Suggested order

1. Party rounds (new shared header, likely worth extracting)
2. Hidden-role games (most secrecy review)

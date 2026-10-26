# Spectator views to add

Games with no `SpectatorView` yet. On the watch page (`/watch/:code`) they show only the player list and a note saying the game has no TV view yet. See `PLAN.md` § Spectators and `docs/decisions.md`.

**Done:** Cheat, Dots and Boxes, Tic-Tac-Toe, Drop Line.

## How to add one

- Add `client/SpectatorView.vue` with props `SpectatorViewProps<View, Settings>`, and register it as `SpectatorView: () => import('./SpectatorView.vue')` in `client/index.ts`.
- It renders `view(state, SPECTATOR_ID)`, the view an outsider gets. There's no `send` and no `me`, so the page is display only. Pass `SPECTATOR_ID` wherever a component asks for `me`, so text never says "you".
- Size it for a TV: game content in a `md="8"` column, and log and scores in a `md="4"` column.
- If the outsider view lacks something a TV should show, add only public data to `view()`, check it against `secrets`, and keep `runLeakTest` green. The spectator check fails any secret the spectator can see that some player can't.
- Update `PLAN.md` (the game's "Watch page" bullet) and `RULES.md` if players would notice the change.

## Groups

### 1. Card games: Gone Fishin', Last Card

Reference: `games/cheat/client/SpectatorView.vue`.

- Both already use core `CardTable` through `FishTable.vue` and `LastTable.vue`. Pass `layout="table"` and `:me="SPECTATOR_ID"` and the table works almost unchanged, with no hand shown.
- Show the latest move prominently, keep a log of earlier moves, and add a scoreboard. Their `text.ts` move formatters should already handle a viewer who isn't a player, as Cheat's do.
- Gone Fishin': show public set counts and the size of the pond. Never show who holds which ranks.
- Last Card: show the discard pile top, the current suit/rank in play, the turn direction, and each player's hand count.

### 2. Secret-answer party rounds: Flock, Color Mix, Ballpark

These share one round shape: a prompt, then secret answers, then a reveal, then scores.

- **Answering:** show the prompt big (question, or paint swatches for Color Mix), the timer, and who has answered. Show no answers.
- **Reveal:** this is the TV's best moment. Show Flock's answer groups, Color Mix's real mix against every guess with closest first, and Ballpark's board.
- **Ballpark** has an extra betting phase. Show the board of guesses and where tokens sit only if that's already public at that point; check `secrets`.
- Build one first (Flock is the simplest) and pull the shared "prompt + who's answered + timer" header into `@wsfg/core/ui` if the other two match it.

### 3. Hidden-role and hidden-info games: Word Imposter, In Order, Liar's Dice

These have the most secrets, so check each view against `secrets` before showing anything.

- **Word Imposter:** before the reveal, show the category only, never the word or the imposter. Show the clue list in order, whose turn it is, the vote progress (who has voted, not for whom), and then the reveal and the guess result. If the host chose spoken clues, the TV mostly shows turn order.
- **In Order:** show the theme scale, the shared line of clue cards in its current order, the Ready count, and lives left, with no numbers until the reveal. Then turn the cards over one by one, as players see it. This works well on a TV, since the room arranges the line together.
- **Liar's Dice:** show the seats with dice counts (not faces), the current bid, the bid history, and whose turn it is. When someone calls, show the faces that were revealed. Reuse `SeatList.vue` and `DiceRow.vue` (faces only after a call).

## Suggested order

1. Card games (existing Cheat reference, `CardTable` ready)
2. Party rounds (new shared header, likely worth extracting)
3. Hidden-role games (most secrecy review)

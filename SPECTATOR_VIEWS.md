# Spectator views

Every game has a `SpectatorView` for the watch page (`/watch/:code`): Cheat, Dots and Boxes, Tic-Tac-Toe, Drop Line, Gone Fishin', Last Card, Flock, Color Mix, Ballpark, Liar's Dice, Word Imposter and In Order. A future game should ship with one. See `PLAN.md` § Spectators, each game's "Watch page" bullet, and `docs/decisions.md`.

## How to add one

- Add `client/SpectatorView.vue` with props `SpectatorViewProps<View, Settings>`, and register it as `SpectatorView: () => import('./SpectatorView.vue')` in `client/index.ts`.
- It renders `view(state, SPECTATOR_ID)`, the view an outsider gets. There's no `send` and no `me`, so the page is display only. Pass `SPECTATOR_ID` wherever a component asks for `me`, so text never says "you".
- Size it for a TV: game content in a `md="8"` column, and log and scores in a `md="4"` column.
- If the outsider view lacks something a TV should show, add only public data to `view()`, check it against `secrets`, and keep `runLeakTest` green. The spectator check fails any secret the spectator can see that some player can't. Remember the TV is in every player's sight: it can only show what the least-informed player already knows (Word Imposter's category is the example).
- Reuse the shared pieces: `WhoAnswered` (who has answered, never what), `MoveLog`, `TurnOrder large`, the large seat chips, `CardTable` (pulses its turn seat for the spectator), `WinCelebration` with `winTitle`/`scoreStandings`.
- Update `PLAN.md` (the game's "Watch page" bullet) and `RULES.md` if players would notice the change.

## Animation rules

Make play lively, on the TV and on players' phones alike.

- **In the shared board and table components** where possible, so the play view and the `SpectatorView` both get them. A TV view may add extras on top: a staggered reveal, a phase card popping in.
- **Client only, driven by view changes.** The server and games stay as they are. A component compares the new view with the one before (`last`, the move log, the phase) and animates the difference.
- **Never on first render.** Joining, reconnecting or opening the TV mid-game shows things as they stand, without replaying moves or reveals.
- **`prefers-reduced-motion`** turns every animation off, back to instant updates.
- **Only from view data.** A TV can't show cards leaving a hand it can't see; they come from the seat, face down.
- Plain Vue transitions and CSS (and the Web Animations API for card flights), no animation library.
- **The TV's turn marker keeps pulsing**; on phones it doesn't.
- **Every game with a winner celebrates** with `WinCelebration` on the play view and the TV, mounted outside any results-only branch so it sees the win arrive, delayed until the winning move's animation has landed. A game about a loser (Old Maid) uses `LoseReveal` the same way instead.

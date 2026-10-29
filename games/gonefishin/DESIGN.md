# Gone Fishin': design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The eighth game and the first card game: the classic ask-for-a-rank game under a new name. It adds deck helpers to `kit` and a card table (seats around an oval) to `ui`, both for later card games.

## Rules
1. **2-6 players**, one standard 52-card deck (13 ranks, 4 suits; suits are only for show). Deal **7 cards each with 2-3 players, 5 with 4-6**; the rest is the face-down **pond**.
2. **Books.** Whenever a player holds all four cards of a rank, the book is laid down face up at once, automatically (including books dealt in the opening hand).
3. **A turn.** Players take turns in seat order, clockwise. On your turn you **ask** one other player who holds cards for a rank you hold at least one of.
   - If they have any of that rank, they hand **all** of them to you and you **ask again**.
   - If not, they say "Gone fishin'!" and you draw the top card of the pond. With **Lucky catch** (default on), drawing the rank you asked for is shown to everyone and you ask again. Otherwise the turn passes to the next seat.
4. **Empty hands.** If your hand is empty when your turn starts, or empties during it, you draw one card from the pond and carry on. With an empty hand and an empty pond, you're done for the game and your turns are skipped.
5. **Nobody to ask.** If you hold cards but no other player does, you draw from the pond instead of asking (counted as fishing, so Lucky catch can't apply) and the turn passes.
6. **End.** The game ends when all 13 books are down. Whoever has the most books wins and scores **1 point**; tied players each score 1. Scores carry across games.
7. **Next game.** The host starts it. Seats stay where they are and the first turn moves on one seat, so everyone keeps their place at the table.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Lucky catch | on | drawing the asked-for rank from the pond lets you ask again |
| Move history | `last5` | how many past moves players and the TV can look back at: `off` (only the latest), `last5` or `all`. Trimmed in `view()` (`visibleMoves` from kit), so older moves never leave the server |

## State machine
```
PLAYING -> RESULTS -> new_game -> PLAYING
```
- `PLAYING`: `turn` is the player to ask. Draws for empty hands (rule 4) and the forced draw (rule 5) happen inside the reducer when the turn reaches that player, so `turn` always names someone who can `ask`. A disconnected player's turn passes to the next seat after the 15s grace (`DISCONNECT_GRACE_MS`); their hand stays, and others can still ask them.
- `RESULTS`: the books per seat, the winners, the scoreboard. Host: **New game** (`new_game`, needs 2 players) or **Back to lobby**.
- A player leaving mid-game: their hand is shuffled into the pond (`ctx.rng`), their books stay down (they can't win), and a notice says so. If fewer than 2 players remain, the game ends as `abandoned` with no points. Late joiners wait for the next game.

## Actions
| action | payload | Who |
|---|---|---|
| `ask` | `{ targetId, rank }` | the player to ask; `rank` in their hand, `targetId` another seated player holding cards |
| `new_game` | `{}` | host, `RESULTS`, 2+ players present |

## View (per player)
```ts
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
type Suit = 'S' | 'H' | 'D' | 'C'
type Card = { rank: Rank; suit: Suit }
type Move = {                               // public: what the table saw and heard
  askerId, targetId: PlayerId | null,       // null: a forced draw (rule 5)
  rank: Rank | null,
  given: number,                            // cards handed over (0 = gone fishin')
  drew: boolean,                            // a card came from the pond (false: it was empty)
  lucky: boolean,                           // drew the asked rank and showed it
  books: Rank[],                            // books laid down as a result
}
{
  phase, game, luckyCatch, moveHistory,
  you: { status: 'playing' | 'waiting', hand: Card[] },  // your cards only, sorted by rank
  seats: [{ id, cards: number, books: Rank[], left: boolean }],  // seat order, clockwise
  pond: number,                             // cards left
  turn: PlayerId | null,                    // PLAYING only
  log: Move[],                              // this game's moves, oldest first, trimmed to moveHistory; the last is the latest
  logStart: number,                         // moves before log[0]; logStart + log.length is the move count
  outcome: 'win' | 'abandoned' | null,      // RESULTS only
  winnerIds: PlayerId[],
  scores,
}
```
`secrets` declares: each hand is visible only to its owner (variant: swap a card between two other players' hands, or between another hand and the pond, and the viewer's view must not change), and the pond's order is visible to nobody. A card drawn while fishing isn't in `Move` unless it was a lucky catch. Everything in `Move` is public because at a real table it's said out loud. Moves outside the Move history window are visible to nobody (`hiddenMoves` from kit: change an older move, and no view may change). The leak test covers both Lucky catch settings, every Move history setting, a leaver, and RESULTS.

## Client
- **Win**: when a game ends while you watch, a `WinCelebration` with a podium of places by books (ties share a place; leavers aren't placed), on your phone and the TV.
- **Watch page**: a `SpectatorView` with the table fixed to the oval (flights included, so the TV sees every ask and draw), the latest move large, the pond and books down, earlier moves and the games won; on `RESULTS` the winners and their books.

## Your hand
Shown openly, not behind `HoldToReveal`: you need it on every turn, and a hand of cards is held, not left on the table. Cards are grouped by rank; tapping a rank selects it for the next ask.

## The table (`@ogn/core/ui`)
- **`PlayingCard`**: one card, face up (rank and suit pip) or face down, in a few sizes. Red suits use a theme colour that holds up in dark mode.
- **`CardTable`**: an oval with the seats in order around it, clockwise, rotated so the viewer's own seat is at the bottom. It draws each seat's name, connection icon and turn highlight; the game fills a `seat` slot (here a face-down fan with a count, and the books as rank tags) and a `center` slot (the pond). Seats in `tappable` emit `select`, so a game can make them targets; `dimmed` fades leavers. Below 520px wide (a container query) the table goes nearly square and the seats shrink; with 2 players the other seat sits at the top. A Table / List toggle above it lets each player switch to a list (one row per seat, starting with you, in turn order), saved per browser; phones default to List. The latest move shows in a status card above the table, and your hand below it.
- **Moving cards**: the game passes `CardTable` a list of `flights` (from, to, a count, optional faces, flip) worked out from its move log in `client/flights.ts`, and the table animates each new one once: cards arc between seats, the middle, card-sized `data-card-anchor` spots in the centre slot, and your hand (your own seat means your hand when it's on screen), shrinking to a seat's small cards and growing to an anchor's size. Each landing gives its seat a small bounce, and the new turn's seat bounces once the cards are down. A deal plays even though the table has just mounted (it mounts with each game); nothing else replays on first render. Hands use `useArrivals`, so new cards drop into place as their flight lands. `prefers-reduced-motion` turns all of it off. Here: the deal from the pond, cards handed over from the player asked, a draw from the pond, and new books popping onto the seat.
- **Asking**: tap a rank in your hand, then a seat that holds cards (or the other way round), then **Ask**. Only valid targets are tappable.
- **Kit**: `standardDeck()` (52 `Card`s, a fixed order to shuffle with `ctx.rng.shuffle`), `deal(deck, players, count)` returning hands and the rest, and `sortCards` (by rank, ace low, then suit), with core tests. `Card`, `Rank`, `Suit`, `RANKS`, `SUITS` and `rankSchema` live in kit too.

## Decisions

- **Gone Fishin' is the eighth game (id `gonefishin`): the classic ask-for-a-rank card game under its own name.** The user asked for it and chose the name to avoid any trademark question over the traditional one; a distinct name also matches Flock, Drop Line and Ballpark.
- **Deck helpers (`standardDeck`, `deal`, `Card`) go in `kit`, and `PlayingCard` and `CardTable` in `ui`.** Every card game in `games/IDEAS.md` needs them, and Liar's Dice could move onto the table too.
- **Seats sit around an oval table, rotated so you're at the bottom.** The user asked for a poker-style table; turn order then matches where people appear, and you see everyone's card count at a glance.
- **Each player picks Table or List for `CardTable`, saved in their browser; with no choice yet, screens up to 520px wide get List.** The user wanted it per player, not per game: six seats round an oval are tight on a phone. The list starts with you and runs in turn order, like the table clockwise from the bottom. The never-throw `localStorage` helpers moved from the client to `@ogn/core/ui/storage` so core components can keep preferences, with the dev-players frame prefix intact.
- **2-6 players, 7 cards each with 2-3 players and 5 with 4-6.** The usual rules; with more than 6, one deck leaves too small a pond.
- **Books are laid down automatically.** Spotting four of a kind takes no skill, and a forgotten book would only stall the game.
- **Lucky catch (draw the asked rank, ask again) is a setting, on by default.** It's the most common house rule and some tables play without it.
- **An empty hand draws one card from the pond and carries on; with the pond empty too, you're done.** That keeps players in the game as long as cards remain, and the turn never names someone who can't ask.
- **Most books wins 1 point; ties each score 1. Scores carry across games.** Same match-point scoring as Liar's Dice; a book count would favour bigger tables.
- **Seats stay put between games and the first turn moves on one seat.** Players keep their place at the table, and a different player starts each game.
- **Every ask and its result are public, in a log of the game's moves.** At a real table they're said out loud, and remembering who asked for what is the skill of the game.
- **A disconnected player's turn passes after the 15s grace; nobody asks for them.** As in Liar's Dice: an automatic ask would be an arbitrary choice.
- **A leaver's hand is shuffled into the pond and their books stay down; fewer than 2 players left ends the game with no points.** All 13 books stay reachable without inventing a new end rule.
- **Your hand isn't behind `HoldToReveal`.** You read it every turn, and cards are held in the hand rather than left on the table.

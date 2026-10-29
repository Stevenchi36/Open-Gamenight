# Old Maid: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The thirteenth game and the fourth card game: the classic pairs game under its traditional name. Players take a face-down card from the player before them, pairs are thrown away, and whoever is left holding the odd queen is the Old Maid. It's the first game about a loser rather than a winner, so its rounds end with core `LoseReveal` instead of `WinCelebration` (all but the one that wins a Royale). It uses the standard deck and card helpers from `kit` and `PlayingCard`/`CardTable` from `ui`.

## Rules
1. **2-10 players**, one standard deck with the **queen of clubs taken out** (51 cards), **all dealt** as evenly as it goes (the first seats get one more when it doesn't divide). One queen is left without a partner: the old maid.
2. **Pairs.** Two cards of the same rank make a pair (with **Match colour**, the same rank and colour: ♠♣ or ♥♦). Pairs are thrown face up onto the discard pile automatically, the moment you hold them, including pairs dealt in your starting hand. Three of a rank throws one pair and keeps the third.
3. **A turn.** Players take turns in seat order, clockwise. On your turn you take **one card, face down**, from the **previous player still holding cards** (the next one anticlockwise): you pick it by its place in their hand without seeing it. If it makes a pair, the pair goes down. The turn then passes to the next player clockwise still holding cards.
4. **Going out.** When your hand empties (your last pair goes down, or your last card is taken), you're out of the round and safe. The order players go out in is recorded.
5. **The Old Maid.** When only one player still holds cards, they hold the odd queen: they're the **Old Maid**, and the card is turned up for everyone.
6. **Format** (setting).
   - **Classic** (default): each round is a game. Every player dealt in, except the Old Maid, scores **1 point**.
   - **Royale**: the Old Maid is **eliminated**, and the next round is dealt to the players still in. Rounds go on until one player is left, who wins the Royale and scores **1 point** (with N players, N−1 rounds). Eliminated players aren't dealt in; they watch the rest from their seat.
   - Scores (points or Royales won) carry across games.
7. **Next round.** The host starts it. Seats stay where they are and the first turn moves on one seat among the players dealt in.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Format | `classic` | `classic` (every round is a game; all but the Old Maid score 1) or `royale` (the Old Maid is eliminated each round; the last player in wins) |
| Match colour | off | pairs need the same rank **and** colour |
| Arrange hand | off | on: you can move single cards in your hand, to bluff where the queen sits. **Shuffle** is always there. Either way your hand shows in the order the next player draws from: the random order it was dealt in, never sorted |

## State machine
```
PLAYING -> RESULTS -> next_round -> PLAYING
```
- `PLAYING`: `turn` is the player to draw, and `from` the player they draw from (derived: the previous seat still holding cards). The deal's pairs are thrown in `init`/`next_round`, and anyone left with no cards is out straight away; if that leaves one player holding cards, the round ends at once.
- A disconnected player's turn is taken for them after the 15s grace (`DISCONNECT_GRACE_MS`): the server draws a random card (`ctx.rng`) from `from`'s hand, and the move is marked `away`. Drawing is blind, so it's the same move they'd make.
- A hand's order is the deal's (random) and is what the next player draws from; a card received lands in a random place in it (`ctx.rng`). With **Arrange hand** the owner can change it.
- `RESULTS`: the Old Maid and their card (when a Royale is won, the winner instead), the order out, and the points (Classic) or who's still in (Royale). Host: **Next round** (Royale, while 2+ players are still in) or **New game** (`next_round` for both, needs 2 players), or **Back to lobby**.
- A player leaving mid-round: their hand is shuffled and dealt out one card at a time, clockwise from the seat after theirs, to the players still holding cards; new pairs go down automatically, and a notice says so. Their seat stays (dimmed) and is skipped. In Royale they're out of the Royale. If one player is left holding cards, the round ends as usual. If fewer than 2 players remain in the round, it ends as `abandoned` with no points; in Royale, fewer than 2 players left in the Royale (leaving between rounds included) ends it as `abandoned` with no points.
- Late joiners wait: in Classic for the next round, in Royale for the next Royale.

## Actions
| action | payload | Who |
|---|---|---|
| `draw` | `{ index }` (a place in `from`'s hand, 0 to its size − 1) | the player to draw, `PLAYING` |
| `arrange` | `{ order }` (a permutation of the places in your hand) | any player holding cards, Arrange hand on, `PLAYING` |
| `shuffle` | `{}` | any player holding cards, `PLAYING`, whatever the settings; the server shuffles your hand (`ctx.rng`). Hands are never shuffled otherwise |
| `next_round` | `{}` | host, `RESULTS`, 2+ players to deal in |

A `draw` and an `arrange` of the same hand can race; the room's action queue takes them in order and `index` picks from the hand as it is then. Neither player sees faces either way, so nothing is lost.

## View (per player)
```ts
type Move = {                                // public, except `card`
  drawerId, fromId,
  index: number,                             // the place picked in fromId's hand
  card: Card | null,                         // the card taken: the drawer and the giver only, unless it made a pair
  pair: [Card, Card] | null,                 // the pair it made, thrown face up
  away: boolean,                             // drawn for a disconnected player
}
{
  phase, round, game, settings,
  you: { status: 'playing' | 'out' | 'eliminated' | 'waiting', hand: Card[] },  // in the order the next player draws from, never sorted
  seats: [{ id, cards, pairs, outPlace: number | null, inRound: boolean, eliminated: boolean, left: boolean }],  // seat order, clockwise
  discard: [Card, Card][],                   // pairs thrown this round, oldest first (face up, public)
  turn, from,                                // PLAYING only
  log: Move[],                               // this round's draws, oldest first
  outcome: 'maid' | 'abandoned' | null,      // RESULTS only
  maidId, maidCard: Card | null,             // RESULTS only: turned up for everyone
  royaleWinnerId: PlayerId | null,           // Royale: set when the last player is left
  royaleOut: PlayerId[],                     // Royale: each round's Old Maid so far, in order (public), for the podium
  scores,
}
```
`secrets` declares: each hand is visible only to its owner (variant: swap a card between two other hands); **the order of a hand** is visible only to its owner (variant: reorder another player's hand, the one you're about to draw from included); and a `Move.card` that made no pair is visible only to its drawer and giver (variant: change it). The leak test covers both formats, both Arrange hand settings, Match colour, an away draw, a leaver, a late joiner, a Royale round with an eliminated player, and RESULTS.

## Client
- **Table**: `CardTable` with each seat's face-down fan and count, pairs thrown, and tags for **Out** (with their place) and, in Royale, **Eliminated** (dimmed). The centre holds the discard pile, its latest pair face up. The turn seat and the seat it draws from are both highlighted, with an arrow between them.
- **Drawing**: on your turn the hand you draw from is shown large above your own as a fan of face-down cards (game-local `PickFan`), mirrored as if facing them: the owner's leftmost card is the drawer's rightmost (the client turns the place round before sending `draw`). Tap a card to lift it (tap it again to put it back), then **Take it**.
- **Your hand**: below the table, shown openly (not behind `HoldToReveal`, as in Gone Fishin'). New cards drop into place as they land (`useArrivals`). **Shuffle** is always there; with Arrange hand, tap a card, then the place it should go. A line says who draws from your hand next. An **As held / By rank** toggle, saved per browser, shows your hand sorted to spot what you need pairs for; it changes only your screen (Shuffle and arranging pause while sorted).
- **Moving cards** (`CardTable` flights, see `games/gonefishin/DESIGN.md`): the deal, then the dealt pairs flying to the discard; each draw flying face down from the giver to the drawer (face up as it lands in your hand when you took it); a pair flying face up to the discard; at the end the old maid card flipping face up over its seat.
- **The Old Maid**: no confetti. On `RESULTS`, on your phone and the TV, core **`LoseReveal`**: the screen greys over, the old maid card drops in and flips face up, and the caught player's name sits under a small rain cloud ("Bea is the Old Maid!"). Like `WinCelebration`, it fires when the result arrives (never on first render), goes by itself or on a tap, doesn't block the page, and plays still under `prefers-reduced-motion`. In Royale the subtitle says they're eliminated. The round that decides a Royale is the exception: it has a winner, so it gets `WinCelebration` instead ("Cal wins the Royale!", subtitle "Bea is the Old Maid") with a podium: the winner 1st, then each Old Maid from the last caught to the first ("Old Maid in round 2"), leavers unplaced. The results card behind it leads with the winner and a trophy too, not the old maid card.
- **Results**: the order out, the Old Maid last, and the points (Classic) or the players still in (Royale).
- **Watch page**: a `SpectatorView` with the table fixed to the oval (flights included, every card taken face down), the latest draw large, the discard pile, the round and players still in (Royale), and the scoreboard; on `RESULTS` the `LoseReveal` (or `WinCelebration` when a Royale is won).
- `needsAction`: your turn, or the host on `RESULTS`.

## Decisions

- **Old Maid is the thirteenth game (id `oldmaid`) under its traditional name.** The name is generic and owned by nobody, like Cheat and Dots and Boxes; the user chose it over a custom name.
- **One deck with the queen of clubs taken out, all dealt, 2-10 players.** The usual way to make an odd queen without a joker (kit's `Card` has none); dealing everything matches Cheat, and ten players still get five cards each.
- **You draw from the previous player still holding cards, then the turn passes clockwise.** The traditional rule (you offer your hand to the player on your left); skipping players who are out keeps the chain unbroken.
- **Pairs are any two of a rank; Match colour (off) is a setting.** Any rank is the common family rule; same-colour pairs are the stricter traditional variant.
- **Pairs go down automatically, the deal's included.** As with Gone Fishin' books: there's no choice in it, only taps.
- **Format is a setting: Classic (default; every player but the Old Maid scores 1) or Royale (the Old Maid is eliminated each round; the last player in wins 1 point).** The user chose Classic scoring and asked for Royale. Points to everyone but the loser fits a game about not getting caught; Royale gives an evening a knockout.
- **In Royale, a late joiner waits for the next Royale; in Classic, for the next round.** Royale rounds build on each other (who's eliminated); Classic rounds stand alone (the late-joiner rule in `docs/decisions.md`).
- **A leaver's hand is dealt out round the players still holding cards and new pairs go down; under 2 players left in the round, or in the Royale, ends it with no points.** The user approved it. Shuffling it into a pile, as in Gone Fishin', would take the odd queen out of the game; the leaver shape is otherwise Cheat's.
- **A disconnected player's turn is taken after the 15s grace with a random draw.** Drawing is blind, so it's the very move they'd make; skipping would leave their hand stuck in the chain.
- **A hand is never sorted: it keeps the deal's random order, cards received land in a random place, the owner sees it in that order, and the next player draws from that same order; only the owner knows it.** As at a table. The first version showed hands sorted and shuffled them before each draw, which was safe but looked as if the cards at the edge were the low ones; the user asked for a random hand. Other card games keep their sorted hands, since nobody draws from them blind.
- **The hand you draw from is shown mirrored: the owner's leftmost card is your rightmost.** That's how a fanned hand looks from across the table; the user pointed it out. `draw`'s `index` stays in the owner's order and the client turns it round, so the server and the leak test are unchanged.
- **Your own hand has an As held / By rank toggle, per player and saved per browser (default As held).** Held in random order a hand is hard to read for the ranks you need; the user wanted both views. Sorting is client only, so what the next player draws from never changes; arranging is off while sorted, since places there aren't the real ones.
- **Shuffle is always available, to every player holding cards; Arrange hand (off) adds moving single cards.** The user wanted shuffling in each player's hands and never automatic. Moving a card is the table trick of offering the queen sticking up, but it adds taps, so it's opt-in.
- **A card taken that makes no pair is visible only to the drawer and the giver.** Both know it at a real table; everyone else sees a card change hands.
- **A round ends with core `LoseReveal` (greyed screen, the old maid card flipping up, a rain cloud over the caught player), except the round that decides a Royale, which gets `WinCelebration` for the winner ("Cal wins the Royale!", the Old Maid in the subtitle) with a podium in reverse order of elimination, and a results card that leads with the winner.** The user asked for the opposite of confetti: the moment is who got caught. That last round is the only one with a winner, so the user wanted it celebrated rather than the loser shown. The view gains `royaleOut` (each round's Old Maid, in order) for the podium; it's public, as every Old Maid was revealed to the table. It's core, as `WinCelebration`'s counterpart, so a later game about a loser has it ready.
- **Arrange hand moves a card with two taps (the card, then its new place), not a drag.** It works the same on a phone and a mouse, needs no pointer tracking over overlapping cards, and a mis-tap on the same card just puts it back.
- **The face-down fan you pick from (`PickFan`) is game-local.** No other game draws blind from a hand yet; it moves to `ui` when one does (as `rankName` moved to `kit`).
- **No Move history setting.** Nothing in the log is worth remembering: who holds the queen is hidden even from a perfect memory, apart from the giver, who knows it anyway.

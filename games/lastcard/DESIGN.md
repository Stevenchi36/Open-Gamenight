# Last Card: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The ninth game and the second card game: the classic shed-your-hand colour-matching game, under its traditional generic name. It uses its own 108-card deck, the core `CardTable` and `deal`, and `PlayingCard`'s face-down back for hidden cards.

## Rules
1. **2-10 players**, one 108-card deck: in each of red, yellow, green and blue, one 0, two each of 1-9, and two each of **Skip**, **Reverse** and **Draw Two**; plus 4 **Wild** and 4 **Wild Draw Four**. Deal **7 each**; the rest is the face-down **draw pile**. The top card is turned up to start the **discard pile**. A wild turned up goes back into the pile and another is turned.
2. **The first card** acts as if the dealer (the seat before the first player) had played it: a Skip skips the first player, a Draw Two makes them draw (rule 6). A Reverse means the dealer goes first and play runs anticlockwise. With 7-0 swaps a starting 7 or 0 does nothing.
3. **A turn.** Play one card that matches the **current colour** (the top card's, or the colour named for a wild) or the top card's **number or symbol**, or play a **Wild**. A **Wild Draw Four** may only be played when you hold no card of the current colour (enforced; there is no challenge). Playing a wild names the next colour.
4. **Drawing.** Instead of playing (you may draw even when you could play), draw one card. If it can be played you may play it straight away, or keep it; either way your turn then ends. With **Draw until playable**, you keep drawing until you draw a card you can play (or the pile runs out), then play it or keep it. When the draw pile is empty, the discard pile except its top card is shuffled into a new one; if that leaves nothing to draw, you just pass. A draw card's penalty (or a stack) is likewise cut short to the cards there are.
5. **Action cards.** **Skip:** the next player loses their turn. **Reverse:** play changes direction; with 2 players left it acts as a Skip. **Draw Two / Wild Draw Four:** the next player draws 2 / 4 and loses their turn.
6. **Stacking** (setting, off): a player facing a Draw Two may answer with another Draw Two, and a player facing either draw card may answer with a Wild Draw Four (here without the colour restriction), passing the growing total on; whoever can't or won't answer draws it all and loses their turn. A Draw Two can't answer a Wild Draw Four. Without stacking the draw happens automatically.
7. **7-0 swaps** (setting, off): playing a 7 swaps your hand with another player of your choice; playing a 0 passes every hand on to the next player in the direction of play. Not when it was your last card.
8. **Jump-in** (setting, off): out of turn, any player may play a card identical to the top card (same colour and number or symbol, never a wild). Play carries on from them, as if it had been their turn; the player whose turn it was loses it. The first to send wins the race; a late jump-in is refused.
9. **Last card.** With **Last card call** set to **Call** (default): when you play your second-to-last card you must call "Last card!" (a button you press before playing). If you don't, any other player may **Catch** you until the next card is played or drawn, and you draw 2. You can still call late, before anyone catches you. With **Automatic**, the call is made for you.
10. **End of a round.** The first to play their last card wins the round. A last Draw Two or Wild Draw Four still makes the next player draw (it counts for points).
11. **Scoring** (setting). **Points** (default): the round's winner scores the cards left in everyone else's hand (number cards face value, Skip/Reverse/Draw Two 20, wilds 50); the first to reach the **target** (100/200/300/500, default 500) wins the game and 1 game point, and the next game starts from 0. **Rounds**: each round won is 1 point. Scores (games or rounds won) carry across games.
12. **Next round.** The host starts it. Seats stay where they are, play runs clockwise again and the first turn moves on one seat.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Scoring | points | `points` (card points to a target) or `rounds` (1 per round won) |
| Target | 500 | 100, 200, 300 or 500; points scoring only |
| Last card call | call | `call` (press it or be caught for 2) or `auto` |
| Stacking | off | answer a draw card with another |
| Draw until playable | off | keep drawing until you can play |
| 7-0 swaps | off | 7 swaps with a chosen player, 0 passes every hand on |
| Jump-in | off | play an identical card out of turn |

## State machine
```
PLAYING -> RESULTS -> next_round -> PLAYING
```
- `PLAYING`: `turn` is the player to move, `direction` is +1 (clockwise) or -1, `stage` is `play` or `drawn` (they drew and may play only that card, or keep it). `pendingDraw` is the total a stack makes the next player draw (stacking only; without it the draw and skip happen inside the reducer). `exposed` is a player who went down to one card without calling, until they're caught, call, or the next card is played or drawn.
- A disconnected player's turn is taken for them after the 15s grace (`DISCONNECT_GRACE_MS`): they take a pending stack, keep a drawn card, or else draw one card; the turn then passes. Nobody plays a card for them.
- `RESULTS`: the winner, every hand revealed with its points, the points table (points scoring) or round wins, and whether the game's target was reached. Host: **Next round** / **New game** (`next_round`, needs 2 players) or **Back to lobby**.
- A player leaving mid-round: their hand is shuffled into the draw pile, their seat stays (dimmed) and is skipped, a stack waiting on them is dropped, and a notice says so. If fewer than 2 players remain, the round ends as `abandoned` with no points. Late joiners wait for the next round.

## Actions
| action | payload | Who |
|---|---|---|
| `play` | `{ card, color?, swapWith?, lastCard? }` | the player to move (in `drawn`, only the drawn card), or anyone with an identical card for a jump-in; `color` for wilds; `swapWith` for a 7 with 7-0 swaps; `lastCard` = "Last card!" was pressed |
| `draw` | `{}` | the player to move, stage `play`; with a stack pending, takes it |
| `pass` | `{}` | the player to move, stage `drawn` (keeps the card) |
| `call` | `{}` | the `exposed` player |
| `catch` | `{ targetId }` | any other player still in the round, while `targetId` is `exposed` |
| `next_round` | `{}` | host, `RESULTS`, 2+ players present |

## View (per player)
```ts
type Color = 'red' | 'yellow' | 'green' | 'blue'
type Value = '0' | ... | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
type LcCard = { color: Color | null; value: Value }     // wilds have no colour
type Move =                                              // public: what the table saw and heard
  | { kind: 'play', playerId, card, color, jumpIn, swapWith, called }  // color: the colour now in play
  | { kind: 'draw', playerId, count, penalty, away }      // penalty: a draw card's; away: taken for a disconnected player
  | { kind: 'pass', playerId, away }                     // kept a drawn card
  | { kind: 'call', playerId }                           // a late "Last card!"
  | { kind: 'catch', playerId, targetId, count }
{
  phase, round, game, settings,
  you: { status: 'playing' | 'waiting', hand: LcCard[], drawn: LcCard | null },  // sorted by colour, then value
  seats: [{ id, cards, left, points }],                 // seat order, clockwise
  drawPile: number, top: LcCard, color: Color,
  turn, stage, direction, pendingDraw, exposed,
  log: Move[],                                           // this round's moves, oldest first
  outcome: 'win' | 'abandoned' | null, winnerId,        // RESULTS only
  hands: Record<PlayerId, LcCard[]> | null,              // RESULTS only: every hand, revealed
  roundPoints, champion,                                 // RESULTS: points won; who reached the target
  scores,
}
```
`secrets` declares: each hand (and the card just drawn) is visible only to its owner until `RESULTS` (variant: swap a card between two other hands, or a hand and the draw pile, or change another player's drawn card), and the draw pile's order is visible to nobody. A drawn card's identity isn't in `Move`; the drawer always gets the play-or-keep choice, so a quick pass doesn't tell the table the card was unplayable, and with stacking a player facing a draw card always gets the choice too, so a pause doesn't tell the table they hold one. The leak test covers the default settings, all house rules together, both scorings and both call modes, a late joiner, and RESULTS.

## Client
- **`LcCard`** (game-local): a coloured card face with the number or symbol; wilds show four colour quarters. Face-down cards reuse `PlayingCard`'s back.
- **Table**: `CardTable` with each seat's face-down fan and count, a "Last card!" tag at one card, and points in points scoring; the centre holds the draw pile, the top card, the current colour, the direction and any pending stack. Seats are tappable when picking a 7's swap.
- **Moving cards** (`CardTable` flights, see `games/gonefishin/DESIGN.md`): the deal from the draw pile, then the first card turning up onto the discard; a played card flying to the discard and turning face up on the way (yours is already up), with the top card changing as it lands; draws, penalties and catches from the draw pile; and with 7-0 swaps, cards crossing between the swapped hands (a 7) or passing round the table (a 0).
- **Your hand**: below the table, playable cards raised. Tap a card, then **Play** (or a colour for a wild, or a seat then **Play** for a 7). **Draw** sits beside it; after drawing, **Play it** / **Keep it**. With jump-in on, identical cards stay tappable out of turn behind a **Jump in!** button. **Last card!** sits by the hand in call mode (pressable any time, so its state hints nothing); others see **Catch** for an exposed player.
- `needsAction`: your turn, or the host on `RESULTS`. Not an exposed player: the cue would remind them to call.
- **Win**: a `WinCelebration` for the game's winner, on your phone and the TV: in points scoring only when someone reaches the target (a round win isn't the game), in rounds scoring every round.
- **Watch page**: a `SpectatorView` with the table fixed to the oval (flights included), the latest move large, a warning while someone can be caught on an uncalled last card, the colour in play, direction, draw pile and any waiting stack, earlier moves, this game's points (points scoring) and the games or rounds won; on `RESULTS` the outcome and everyone's cards left.

## Decisions

- **Last Card is the ninth game (id `lastcard`): the classic colour-matching shed-your-hand game under its traditional generic name.** UNO is a Mattel trademark; the user chose the name. Mechanics are free to use.
- **Its 108-card deck, card type and card face live in the game, not in `kit`/`ui`.** They're specific to this game; it reuses `deal`, `CardTable` and `PlayingCard`'s face-down back.
- **Scoring is a setting: card points to a target (default, 500) or 1 point per round won.** The user wanted both. Points scoring counts games won as the carried score and keeps the running points per game.
- **Stacking, draw until playable, 7-0 swaps and jump-in are settings, all off by default.** The user picked these house rules; off by default plays the official rules.
- **The last-card call is a setting: Call (press it or be caught for 2, default) or Automatic.** The user wanted both. A late call is allowed until someone catches you, and the catch window closes when the next card is played or drawn, so it stays a race between the forgetful player and the table.
- **The Last card! button is shown and pressable at any hand size.** Enabling it only at two cards would remind the player to call, which is the skill being tested. For the same reason the attention glow ignores an exposed player.
- **Wild Draw Four is only playable with no card of the current colour, enforced, with no challenge.** A challenge needs the challenged hand shown to one player and a second decision round; enforcing gives the same legal play without either. When answering a stack it may be played regardless, since you're passing on a penalty, not choosing to start one.
- **Stacking: Draw Two on Draw Two, Wild Draw Four on either, never Draw Two on Wild Draw Four.** The most common house version.
- **After drawing, the drawer always chooses Play it or Keep it, even when the card can't be played; with stacking, a player facing a draw card always gets to choose too.** Passing automatically would tell the table the drawn card was unplayable, or that the player holds no draw card: hidden-hand information. One extra tap is the price.
- **A wild turned up as the first card goes back into the pile; other first cards act as if the dealer played them, except Reverse, where the dealer goes first anticlockwise.** The official rule has the first player name a wild's colour, an extra step before the first turn; Reverse follows the official rule.
- **A disconnected player's turn is taken after the 15s grace: they take a pending stack, keep a drawn card, or else draw one; nobody plays a card for them.** Skipping without a draw would reward disconnecting, and choosing a card to play would be an arbitrary move.
- **A leaver's hand is shuffled into the draw pile and a stack waiting on them is dropped; fewer than 2 players left ends the round with no points.** As in Gone Fishin'; nobody else should take a penalty aimed at someone who left.
- **Hands are revealed on the results screen.** In points scoring they are what the winner scores, so the table can check the count, as when hands are turned up at a real table.
- **With the draw pile and the reshufflable discard both empty, a draw takes what there is (perhaps nothing), penalties included, and play moves on.** It only happens when the hands hold nearly the whole deck; stalling the round or adding a second deck would be worse, and every play puts a card back to reshuffle later.
- **Jump-in reuses `play` from a player whose turn it isn't; the room's action queue settles races and a late jump-in is refused because the top card changed.** No timers or claim windows: first to send wins, as at a table.
- **Coloured cards carry their colour's letter (R, Y, G, B) in the bottom corner, and text on yellow and green is dark.** Yellow and green are hard to tell apart with red-green colour blindness, and white text on them was under 4.5:1.

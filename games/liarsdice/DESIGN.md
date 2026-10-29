# Liar's Dice: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The second game, and the first without words or votes on players.

## Rules
1. A **match** is played in rounds until one player has dice left. Everyone starts with `startingDice` dice.
2. **Each round** everyone with dice rolls them secretly (`ctx.rng`). You see only your own dice; everyone sees how many dice each player has.
3. **Bidding.** Players take turns in seat order. The starter opens with a bid: "there are at least *quantity* dice showing *face*" across **all** dice in play. Each later player either **raises** or **calls "Liar!"** on the bid just made. Quantity is 1 to the total dice in play.
4. **Raising.** A raise is a higher quantity (any face), or the same quantity with a higher face. With **wild ones** (default on), ones count as every face, and bids on ones follow the Perudo rule:
   - The opening bid of a round can't be on ones.
   - To ones: quantity at least half the previous quantity, rounded up.
   - From ones: quantity at least double the previous quantity plus one.
   - Ones to ones: a higher quantity.
5. **Liar.** All dice are revealed and the bid's face counted (plus ones, when wild and the face isn't 1). If the count is at least the quantity the bid stands and the caller loses a die; otherwise the bidder loses a die.
6. **Spot on** (setting, default off). Instead of raising or calling, the current player claims the bid is exactly right. Exactly right: the caller gains a die back (never above `startingDice`). Otherwise the caller loses a die.
7. Whoever lost or gained a die starts the next round; if they're out, the next player in seat order with dice.
8. A player with no dice is **out** for the rest of the match. The last player with dice wins the match and scores **1 point**; scores carry across matches. The host starts a new match (seats move on one, so a different player opens).

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Starting dice | 5 | 1-6 |
| Wild ones | on | ones count as every face; Perudo rules for bidding on ones |
| Spot on | off | allows the exact-count call |

## State machine
```
BIDDING -> REVEAL -> (BIDDING | RESULTS) -> new_match -> BIDDING
```
- `BIDDING`: `turn` is the current player; they `bid` or (once a bid exists, and it isn't their own) `call` / `spot_on`. A disconnected player's turn passes to the next player after the 15s grace; the bid stands.
- `REVEAL`: all dice shown with the outcome for `REVEAL_MS` (8s), then the next round rolls, or `RESULTS` if one player has dice.
- `RESULTS`: the winner and the scoreboard. Host: **Play again** (`new_match`) or **Back to lobby**.
- A player leaving mid-round restarts the round: everyone re-rolls and nobody loses a die (a notice says why). Late joiners wait for the next match.

## Actions
| action | payload | Who |
|---|---|---|
| `bid` | `{ quantity, face }` | current player |
| `call` | `{}` | current player, not on their own bid |
| `spot_on` | `{}` | current player, not on their own bid, when enabled |
| `new_match` | `{}` | host, in `RESULTS` |

## View (per player)
```ts
{
  phase, round,
  you: { status: 'playing' | 'out' | 'waiting', dice: number[] },  // your dice only
  seats: [{ id, dice: number }],          // seat order with dice counts (0 = out)
  totalDice, turn: PlayerId | null,
  bid: { playerId, quantity, face } | null,
  bids: Bid[],                            // this round's bids, oldest first
  lastRound: {                            // the latest challenge: REVEAL, and the summary afterwards
    dice: { [playerId]: number[] }, bid, callerId, call: 'liar' | 'spot_on',
    count, loserId: PlayerId | null, gainerId: PlayerId | null,
  } | null,
  winnerId: PlayerId | null,              // RESULTS only
  scores,
}
```
`secrets` declares: each player's dice are visible to that player only while `BIDDING`; from `REVEAL` everyone sees the round's dice. `lastRound.dice` is the previous round's roll, public once revealed.

## Hold-to-reveal
Your dice sit behind `HoldToReveal`, like Imposter's role card: phones lie on a shared table.

## Bids list
This round's bids as a numbered `MoveLog`, newest first, on phones (a "Bids this round" dialog, then on the reveal and results) and the TV. All plain while bidding; once called, the called bid turns green if it held or red if it didn't, and the call is added as the last row, green if it paid off for the caller.

## Client (watch page and win)
- **Watch page**: a `SpectatorView` with a card per seat showing its dice as hidden dice (counts, never faces; the turn's card pulses), the current bid big, earlier bids this round, and the matches won. On a call, the outcome and everyone's dice with the counted ones lit, each player's turning up in turn when it happens live.
- **Win**: a `WinCelebration` when the match is won, on your phone and the TV.

## Decisions

- **Liar's Dice is the second game.** It's built on hidden per-player information like Imposter but has no words or votes on players, so it tests whether `kit` and `ui` really fit a different game.
- **Perudo rules: wild ones on by default (opening bid can't be on ones, half/double+1 when switching), spot on optional.** They're the best-known rules; wild ones and the halving rule keep late rounds with few dice interesting.
- **Only the next player can call, and never on their own bid.** It's the classic turn structure, and it keeps the game turn-based rather than a race to tap.
- **The player who lost (or gained) a die starts the next round.** Standard rule; it gives the loser the opening bid.
- **A disconnected player's turn passes after the 15s grace with the bid unchanged; nobody auto-bids or auto-calls for them.** Any automatic move would be an arbitrary choice that can cost a die.
- **A player leaving mid-round restarts the round (re-roll, no die lost).** The bid was made against dice that are now gone, and nobody should lose a die over it.
- **One point per match won, carried across matches; seats move on one each match.** A match is the natural unit to win; rotating seats changes who opens.
- **Your dice show only while held (`HoldToReveal`).** Same reason as Imposter's role card: phones lie on a shared table.
- **REVEAL stays up for 8s, then the next round rolls; a summary of the last challenge stays visible while bidding.** Counting dice takes longer than reading an Imposter vote, and the summary keeps "what just happened" readable after the timer.
- **No bid timer in v1.** The disconnect grace stops a stalled turn; a timer can come later if tables want one.

# Cheat: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The eleventh game and the third card game: play cards face down, say what they are, and anyone may call "Cheat!". The card counterpart to Liar's Dice's bluffing. It uses the standard deck and card helpers from `kit` and `PlayingCard`/`CardTable` from `ui`.

## Rules
1. **2-10 players**, one standard 52-card deck, **all dealt** as evenly as it goes (the first seats get one more when it doesn't divide). Suits are only for show.
2. **A turn.** Players take turns in seat order, clockwise. On your turn you put **1-4 cards** face down on the **pile** and **claim** a rank for all of them ("two sevens"). The number of cards is always true; the rank may be a lie.
3. **Claims** (setting). **Next rank** (default): the claims run A, 2, 3 … K and back to A; the first play of a game claims aces. **Nearby**: claim the same rank as the last claim, or one above or below (K and A are neighbours); the first play of a game claims any rank.
4. **Calling.** Any other player still in the game may call **Cheat!** on the latest play, until the next play goes down. After every play there is a **call time** (setting, default 5s) when the next player can't play yet, so the whole table gets a chance. The first call wins; a call on a play that's already been called or covered is refused.
5. **The reveal.** The called play's cards are turned up for everyone. If any isn't the claimed rank, the player who played them **picks up the whole pile**; if they're all true, the **caller** picks it up. Either way play goes on with the player whose turn it already was, and the claims carry on from the last one.
6. **Going out.** When your last cards go down, you win once the call time passes with nobody calling. If someone calls and you lied, you pick up the pile and play on; if you told the truth, you win straight away.
7. **Scoring.** The winner scores **1 point**. Scores carry across games.
8. **Next game.** The host starts it. Seats stay where they are and the first turn moves on one seat.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Claims | `next` | `next` (the rank after the last claim) or `nearby` (same, one up or one down) |
| Call time | 5 | 3, 5 or 10 seconds after each play before the next play |
| Move history | `last5` | how many past moves plays and calls players and the TV can look back at: `off` (only the latest), `last5` or `all`. Trimmed in `view()` (`visibleMoves` from kit), so older moves never leave the server |

## State machine
```
PLAYING -> RESULTS -> new_game -> PLAYING
```
- `PLAYING`: `turn` is the player to play, `stage` is `calling` (call time after a play: no play yet, calls open) or `play` (the turn player may play; the latest play can still be called). A `call_window` timer ends `calling`; if the play it ends emptied a hand, that player wins instead.
- A disconnected player's turn passes to the next seat after the 15s grace (`DISCONNECT_GRACE_MS`), without playing; the claim to make stays the same. Their hand stays.
- `RESULTS`: the winner, each seat's cards left, the scoreboard. Host: **New game** (`new_game`, needs 2 players) or **Back to lobby**.
- A player leaving mid-game: their hand is set aside face down (out of the game), their seat stays (dimmed) and is skipped, and if theirs was the latest play it can no longer be called. If fewer than 2 players remain, the game ends as `abandoned` with no points. Late joiners wait for the next game.

## Actions
| action | payload | Who |
|---|---|---|
| `play` | `{ cards, claim }` (1-4 distinct cards from your hand; `claim` allowed by the Claims setting) | the player to move, stage `play` |
| `call` | `{ play }` (the latest play's number, from the view) | any player still in the game except whoever made that play, while it's open |
| `new_game` | `{}` | host, `RESULTS`, 2+ players present |

## View (per player)
```ts
type Move =                                     // public: what the table saw and heard
  | { kind: 'play', playerId, count, claim }
  | { kind: 'call', callerId, playerId, count, claim, cards: Card[], lied, pickerId, picked }  // cards: the called play, turned up; picked: pile size taken
  | { kind: 'skip', playerId }                  // a disconnected player's turn passed
{
  phase, game, settings,
  you: { status: 'playing' | 'waiting', hand: Card[] },   // your cards only, sorted by rank
  seats: [{ id, cards, left }],                // seat order, clockwise
  pile: number,                                 // cards in the pile
  top: { play, playerId, count, claim } | null, // the latest play while it can be called; play numbers count up through the game
  claims: Rank[],                               // what the turn player may claim
  turn, stage, callUntil,                       // callUntil: server time the call time ends (stage calling)
  log: Move[],                                  // this game's moves, oldest first, trimmed to settings.moveHistory
  logStart: number,                             // moves before log[0]; logStart + log.length is the move count
  outcome: 'win' | 'abandoned' | null, winnerId,  // RESULTS only
  scores,
}
```
`secrets` declares: each hand is visible only to its owner (variant: swap a card between two other hands), and the pile's cards are visible to nobody, the players who put them there included (variants: swap a pile card with a card in another player's hand, or reorder the pile). Only a call turns cards up, and only the called play's. Moves outside the Move history window are visible to nobody (`hiddenMoves`, as in Gone Fishin'). The leak test covers both Claims settings, every Move history setting, a leaver, a late joiner and RESULTS.

## Client
- **Table**: `CardTable` with each seat's face-down fan and count; the centre holds the pile (a face-down stack with its count) and the latest claim ("2 × 7").
- **Moving cards** (`CardTable` flights, see `games/gonefishin/DESIGN.md`): the deal, each play flying face down to the pile, and on a call the called cards turning over side by side above the pile for a moment before the whole pile flies to whoever picks it up.
- **Your hand**: below the table, sorted by rank; tap cards to pick up to 4 (picked cards rise). On your turn with Next rank, the button reads **Play 2 as sevens**; with Nearby, pick the rank first from the allowed three. During the call time the button waits with a countdown.
- **Cheat!**: a big button for everyone but the latest play's player, naming the play ("Cheat! Bea's two sevens"), while it's open.
- The latest move shows in a status card above the table; after a call it shows the turned-up cards, marked true or false.
- **Watch page**: a `SpectatorView` with the table fixed to the oval (flights included, so the TV sees every play and pickup), the latest move large (after a call, the turned-up cards with false ones outlined), a countdown while anyone can call Cheat!, the next claim, earlier moves and the games won; on `RESULTS` the winner.
- **Win**: a `WinCelebration` once the last play has landed, on your phone and the TV, with a podium of places by fewest cards left (ties share a place; leavers aren't placed).
- `needsAction`: your turn (stage `play`), or the host on `RESULTS`. Not a callable play: the cue would hint that calling is wise.

## Decisions

- **Cheat is the eleventh game (id `cheat`): the classic bluffing card game under its traditional UK name.** It was in `games/IDEAS.md` as "Cheat / BS"; "BS" doesn't suit a family platform, and "I Doubt It" is less known.
- **2-10 players with one deck, all of it dealt.** Two can play (you still can't tell which of your opponent's cards went on the pile), and ten still get five cards each.
- **Claims are a setting: Next rank (A, 2 … K, wrapping; default) or Nearby (same, one up or one down).** Next rank is the usual rule; Nearby is the common house rule that makes forced lies rarer.
- **A play is 1-4 cards, and the count is always true.** At a real table everyone sees how many cards go down; four is the most of one rank a deck holds.
- **After each play there is a call time (3/5/10s, default 5s) before the next play; calls stay open until the next play.** Otherwise a quick next player could shut the table out of calling. The window is a timer in state (`stage: 'calling'`), not a comparison with `ctx.now`, so `createSim` and the leak test can move through it.
- **A call names the play it's for (`{ play }`), and a call on a play that's already been called or covered is refused.** Two players tapping at once, or a tap landing just after the next play, must not hit a play nobody meant to call.
- **After a call, play goes on with whoever's turn it already was, and the claims carry on.** The simplest common rule; restarting the sequence would give the loser of the call a free choice.
- **Going out wins only once the call time passes uncalled.** The last play is the one most worth calling; a lie caught there means picking up the pile and playing on.
- **The pile's cards are hidden from everyone, including the players who put them there; only a call turns up, and only the called play.** Your memory of what you played is yours to keep, as at a table, and a secret the view doesn't need.
- **A disconnected player's turn passes after the 15s grace without a play, and the claim to make stays the same.** Playing for them would be an arbitrary choice of cards and claim.
- **A leaver's hand is set aside, out of the game; if theirs was the latest play it can't be called.** Adding it to the pile would hand someone else their cards, and a call on a player who's gone has nobody to pick up the pile. Fewer than 2 players left ends the game with no points, as in Gone Fishin'.
- **The winner scores 1 point; scores carry across games.** Same match scoring as Gone Fishin' and Liar's Dice.
- **The attention glow shows on your turn, never for a callable play.** A cue to call would hint that the play is worth calling.
- **Your hand isn't behind `HoldToReveal`.** As in Gone Fishin': you read it every turn.
- **`rankName` ("sevens", "one ace") moved from Gone Fishin' to `kit`.** Cheat needs it too, and it names a kit `Rank`.

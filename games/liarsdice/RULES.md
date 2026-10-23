# Liar's Dice

**Goal:** be the last player with dice left.

## A round

1. **Roll.** Everyone rolls their dice in secret. Hold your dice card to see them, and keep them hidden.
2. **Bid.** Players take turns guessing about **all the dice on the table**, not just their own: "there are at least **4 fives**".
3. **On your turn, do one of these:**
   - **Raise** the last bid. The count can never go down (except for ones, see below):
     - Raise the count and pick **any face**, even a lower one. After "4 fives", "5 twos" is fine.
     - Keep the same count and pick a **higher face**. After "4 fives", "4 sixes" is fine, but "4 threes" isn't.
   - **Call "Liar!"** if you think the last bid is wrong.
   - **Spot on** (if the host turned it on): you think the last bid is *exactly* right.
4. **Check.** Everyone's dice are shown and counted.
   - At least as many as the bid said: the bid was true, so **the caller loses a die**.
   - Fewer: it was a bluff, so **the bidder loses a die**.
   - Spot on: exactly right wins the caller a die back; anything else costs them one.
5. Whoever lost (or won back) a die starts the next round.

## Winning

Run out of dice and you're out. The last player with dice wins the match and scores a point. The host can start a new match; scores carry on.

## Ones are wild

When **Wild ones** is on (the default), ones count as every face: if the bid is on fives, every one on the table counts as a five too. So any other face counts about twice as often as ones do (its own dice plus the wild ones), which is why a bid on ones may have a lower count:

- The first bid of a round can't be on ones.
- Switching **to** ones: the count can drop to half, rounded up. After "5 fours", "3 ones" is allowed.
- Switching **back** from ones: the count must be at least double plus one. After "3 ones", you need at least "7" of some other face.
- Ones to ones: raise the count, as usual.

With wild ones off, ones are just the lowest face and the normal raising rules apply.

The app only lets you pick legal bids: faces you can't bid are greyed out, and the count can't go below the smallest legal bid.

## Settings

- **Starting dice:** 1 to 6 per player (default 5).
- **Wild ones:** on or off.
- **Spot on:** off by default.

## Tips

- On average a third of all dice match any face once wild ones are counted (a sixth without them).
- Bluffing is allowed. That's the game.
- The screen glows when it's your turn.
- If a player leaves mid-round, everyone re-rolls and nobody loses a die.

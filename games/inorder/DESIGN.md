# In Order: design

The spec, then the decisions behind it (one line each, with the reason). Player-facing rules are in `RULES.md`; the platform is in `PLAN.md` and `docs/decisions.md`.

The tenth game and the first co-op one: everyone gets a secret number, describes it in the round's theme, and the table puts the descriptions in order together. Mechanics like Ito (a commercial game, so the name is generic). The fourth library game (themes), and the first with a shared drag-to-order list (`OrderList` in `@ogn/core/ui`).

## Rules
1. **2-12 players** play as one team with shared **lives** (setting, default 3).
2. **Each round** shows a **theme**: a scale with a label at each end ("How scary is it?", *Not scary at all* ↔ *Terrifying*). Everyone gets `numbersEach` secret numbers (setting, default 1) from **1 to 100**, all different across the table (`ctx.rng`).
3. **Clues.** For each of your numbers, type a **clue** that fits the theme at that point on the scale ("a kitten" low, "a shark" high). Never say the number: a clue containing your own number as a number is refused. Clues are public as they arrive and can be changed until the reveal.
4. **The line.** Every number is a card in one shared line, lowest at the top. Anyone in the round can drag any card at any time, while the table talks it over. A card without a clue yet shows who it's waiting on.
5. **Ready.** When you're happy with the order, tap **Ready** (only once your own numbers have clues). Any move or clue change clears everyone's Ready. The line is revealed when every connected round player is ready, or when the host taps **Reveal now**.
6. **Mistakes.** The numbers are turned over in line order. A round's mistakes are the fewest cards you'd have to move to put the line right (cards − the longest run already in order), and those cards are marked wrong. The team loses **1 life per mistake**.
7. **End.** With no lives left, the team loses. Otherwise, after the last round (setting, default 5) the team wins. With rounds set to unlimited, play goes on until the lives run out, and the score is the rounds cleared. Perfect rounds (no mistakes) are counted too.
8. The host starts the next round (new theme, new numbers); after the game ends, **New game** restores the lives.

## Settings (host, lobby only)
| Setting | Default | Notes |
|---|---|---|
| Rounds | 5 | `null` (until out of lives) / 3 / 5 / 7 / 10 |
| Lives | 3 | 1-5 |
| Numbers each | 1 | 1-3 |
| Theme source | `all` | `all` (least-played first) / `recent` ("Recently added", see `@ogn/core/library`) |
| Category | Any | categories from the library that have themes, plus "Any" |

## State machine
```
ORDERING -> RESULTS -> next_round -> ORDERING   (new_game after the game ends)
```
- `ORDERING`: round players (everyone present at round start) `submit_clue`, `move_item` and `set_ready`. The line starts in seat order (join order, then each player's cards in deal order), which says nothing about the numbers. Advances once every connected round player is ready (a disconnected player doesn't hold it up; their cards stay in the line, clued or not), or on the host's `reveal_now`.
- `RESULTS`: every number in line order, the wrong cards, lives lost, lives left, and the outcome (`won` / `lost` / `null` = carry on). Host: **Next round** (`next_round`), **New game** (`new_game`) after the game ends, or **Back to lobby**.
- Late joiners wait for the next round. A round player leaving during `ORDERING` takes their cards out of the line; in `RESULTS` the round stays as scored.

## Actions
| action | payload | Who |
|---|---|---|
| `submit_clue` | `{ itemId, text }` (1-40 chars after trimming; not your number) | the card's owner, `ORDERING` |
| `move_item` | `{ itemId, to }` (0-based index, clamped) | round player, `ORDERING` |
| `set_ready` | `{ ready }` (`true` needs your cards clued) | round player, `ORDERING` |
| `reveal_now` | `{}` | host, `ORDERING` |
| `next_round` | `{}` | host, `RESULTS`, game not over, 2+ players |
| `new_game` | `{}` | host, `RESULTS` after the game ends, 2+ players |

## View (per player)
```ts
{
  phase, round, totalRounds: number | null,
  lives, maxLives, cleared, perfect,          // team: lives left, rounds cleared, perfect rounds
  theme: { text, low, high, category },
  you: { status: 'playing' | 'waiting', cards: [{ id, number, clue }] },  // your own, lowest first
  roundPlayers,
  line: [{ id, playerId, clue: string | null, number: number | null }],  // number: RESULTS only
  ready: PlayerId[],
  result: { livesLost, wrong: string[], outcome: 'won' | 'lost' | null } | null,  // RESULTS only
}
```
`secrets` declares: other players' numbers are hidden until `RESULTS` (variant checks: swapping two other players' numbers, or changing one to an unused number, must not change the viewer's view). Card ids are `<playerId>#<k>` in deal order, not sorted, so they hint nothing. The leak test covers 1 and 2 numbers each, a leaver and a late joiner.

## Hold-to-reveal
Your numbers sit behind `HoldToReveal` (lowest first); the clue fields under it are labelled by rank ("Your lower number"), so the number is never on screen at rest. Your own cards in the line don't show the number either.

## Theme library
```sql
CREATE TABLE inorder_themes (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  theme TEXT NOT NULL,                -- "How scary is it?"
  low TEXT NOT NULL, high TEXT NOT NULL,  -- the scale's ends: "Not scary at all", "Terrifying"
  source TEXT NOT NULL DEFAULT 'claude',  -- claude | builtin | manual
  times_used INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  batch INTEGER,
  UNIQUE (category_id, theme COLLATE NOCASE)
);
```
- Theme: trimmed, 5-80 chars. `low` / `high`: 1-30 chars each, different from each other. A good theme is a scale everyone can picture, with many things along it, where people roughly agree where things go but not exactly. Categories are `categories` rows with `game_id = 'inorder'`.
- Migration `002_default_themes` seeds a starter set (source `builtin`); the same frozen list is the in-code fallback, as in Flock.
- `prepareRound` picks the least-used theme (random among ties), optionally in the chosen category, skipping ones used in this room, and marks it used; otherwise a built-in theme plus a host notice.
- **Admin** (`/api/admin/inorder/*`, page `/admin/inorder/themes`): browse/search, add, edit/move, delete, Clear used, and AI generation (review, then save), like Flock's questions.
- **MCP tools:** `inorder_add_themes`, `inorder_list_categories`, `inorder_search_themes`, `inorder_update_theme`, `inorder_remove_themes`, `inorder_generate_themes` (only with `ANTHROPIC_API_KEY`), plus the core `inorder_*_category` tools. Themes aren't secret, so Claude may list them.

## Client
- **`OrderList`** (`@ogn/core/ui`): a vertical list a player reorders by dragging a row's handle (pointer events, so it works with touch; the page still scrolls from the rest of the row, and dragging near the screen edge scrolls) or with its up/down buttons. It emits `move(id, to)` and shows the new order straight away until the next view arrives. The game fills each row through a slot.
- The line: the low end's label above the list ("1 · Not scary at all"), the high end's below ("100 · Terrifying"). Each card shows its clue (or "Waiting for Sam…"), whose it is, and a **You** tag on your own.
- Results turn the numbers over one by one, top to bottom, each marked right or wrong, then show lives lost and the team's progress.
- **Win**: when the team clears the last round, a `WinCelebration` ("You made it!") once the cards have turned over, on your phone and the TV.
- **Watch page**: a `SpectatorView` with the theme's scale, the shared line as the room arranges it (cards slide to their new places), who is ready, lives left and rounds cleared; no numbers until the reveal, then the cards turn over one by one as players see it (all turned at once if the TV opens on the results).
- `needsAction`: a round player with an unclued card, or with every card in the line clued and not ready yet; the host on `RESULTS`.

## Decisions

- **In Order is the tenth game (id `inorder`): Ito's mechanics under a generic name, and the first co-op game.** It was in `games/IDEAS.md` under that name; Ito is a commercial game, and mechanics are free to use.
- **Clues and ordering are one phase: clues appear in the shared line as they arrive, and anyone can drag any card at any time.** Ito is played by talking it over while cards are placed; a separate clue phase would make the table wait on its slowest writer before anyone can start arranging.
- **The reveal waits for everyone connected to tap Ready, and any move or clue edit clears every Ready; the host can reveal anyway.** In a co-op game the table should agree, and clearing on change stops a late drag from going through on stale agreement. A disconnected player doesn't block it, as elsewhere.
- **Mistakes are the fewest cards that would have to move to fix the line (cards − longest increasing run), 1 life each.** Counting out-of-order pairs, or Ito's "every lower card still in hand", punishes one card placed far from home as heavily as a scrambled line.
- **Settings: rounds (default 5, or until out of lives), lives (default 3, 1-5), numbers each (default 1, 1-3).** Small tables need more cards to be a challenge; an endless mode gives a "how far can we get" score. No timer: the game is the conversation.
- **A clue containing your own number as a number is refused; other digits are allowed.** "Never say your number" is the one hard rule, but banning every digit would refuse fair clues like "101 Dalmatians".
- **Numbers are behind `HoldToReveal`, and clue fields are labelled by rank ("Your lower number"), never by number.** Phones lie on the table; a neighbour who sees your number has the round solved.
- **Card ids are `<playerId>#<k>` in deal order (not sorted) and the line starts in seat order.** Anything derived from the numbers before the reveal would leak their order.
- **The drag-to-order list is `OrderList` in `@ogn/core/ui`, written on pointer events with no new dependency.** HTML5 drag and drop doesn't fire on touch screens, and ranking games in `games/IDEAS.md` could use the same list.
- **Themes aren't secret, so the MCP tools may show them.** Knowing the theme gives nothing away; the numbers are dealt at play time.
- **Screen readers hear other players' card moves ("Pizza moved to 3 of 5"), not who made them, and not their own a second time.** The view doesn't say who moved a card, as anyone can; your own moves are read by `OrderList` as you make them, so the client notes each one it sends and skips the server's echo (either card of a swap, since a swap fits both).

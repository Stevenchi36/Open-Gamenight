# Managing words with Claude (MCP)

The repo ships a small **MCP server** (`apps/mcp`) that lets Claude Code or Claude Desktop read and edit the game libraries directly, for example the Word Imposter word library. You ask Claude in plain language ("add 30 kitchen words"); Claude writes the words and saves them through the server's tools.

**No API key needed.** When you drive it from Claude Code or Claude Desktop, Claude writes the words itself on your Claude subscription (Pro works). The `ANTHROPIC_API_KEY` in `.env` is only for the **Generate** button in the admin page, which calls the API from the server and is billed separately.

- [How it works](#how-it-works)
- [Use it locally](#use-it-locally)
- [Use it against the VPS (production)](#use-it-against-the-vps-production)
- [Tools](#tools)
- [Example prompts](#example-prompts)
- [Troubleshooting](#troubleshooting)

## How it works

```
You ──> Claude Code / Desktop (your Pro subscription: Claude writes the words)
            │  starts and talks to, over stdin/stdout ("stdio")
            ▼
        node apps/mcp/src/server.ts ──> data/games.db (imposter_words table)
```

- One MCP server exposes the tools of every game, named `<gameId>_<tool>` (for example `imposter_add_words`).
- It only opens `games.db`, **never** `auth.db`, so it can't touch accounts.
- It runs the same validation as the admin page: bad entries and duplicates are skipped and reported, never saved.
- It's safe to use while the web server is running: both use SQLite WAL mode with a busy timeout.
- It can run anywhere Claude can start a command, including on another machine over SSH (see below).

## Use it locally

Prerequisites: the repo is checked out and `pnpm install` has run.

### Claude Code

```bash
claude mcp add ws-family-games \
  --env GAMES_DB_PATH=C:/Users/Steve/WebBench/ws-family-games/data/games.db \
  -- node C:/Users/Steve/WebBench/ws-family-games/apps/mcp/src/server.ts
```

Use absolute paths, because Claude starts the process from an unknown working directory. If you leave out `GAMES_DB_PATH`, it defaults to `<repo>/data/games.db`.

Check it with `claude mcp list` (it should say "connected"), or type `/mcp` inside Claude Code.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "ws-family-games": {
      "command": "node",
      "args": ["C:/Users/Steve/WebBench/ws-family-games/apps/mcp/src/server.ts"],
      "env": { "GAMES_DB_PATH": "C:/Users/Steve/WebBench/ws-family-games/data/games.db" }
    }
  }
}
```

Restart Claude Desktop afterwards.

## Use it against the VPS (production)

Words you add locally only land in your **local** `games.db`. To fill the **production** library with your Pro subscription, have Claude start the MCP server **on the VPS over SSH**. Claude Code (and your subscription) stays on your computer; only the small tool process runs on the server:

```
Your PC: Claude Code (Pro) ──ssh──> VPS: node apps/mcp/src/server.ts ──> /srv/ws-family-games/data/games.db
```

The words go straight into the live library, the next round can use them, and no API key is involved.

### 1. One-time setup

1. **SSH must work without prompts.** Claude can't type a password, so use key authentication. If your key has a passphrase, load it into an agent first. Test it:
   ```bash
   ssh -o BatchMode=yes deploy@your-vps "echo ok"
   ```
   It must print `ok` without asking for anything.
2. **Find the full path to Node on the VPS.** Non-interactive SSH sessions often don't load nvm or your shell profile, so don't rely on `node` being on the PATH:
   ```bash
   ssh deploy@your-vps "bash -lc 'which node'"
   # e.g. /home/deploy/.nvm/versions/node/v26.3.0/bin/node
   ```
   It must be the same Node major version the app runs on (26).
3. **Check the server starts.** Run this with the paths from your deploy. It waits silently for input; press Ctrl+C to quit:
   ```bash
   ssh -T deploy@your-vps "GAMES_DB_PATH=/srv/ws-family-games/data/games.db /home/deploy/.nvm/versions/node/v26.3.0/bin/node /srv/ws-family-games/apps/mcp/src/server.ts"
   ```
   The `registered tool` log lines are written to stderr, which is correct.

Replace `deploy@your-vps`, `/srv/ws-family-games` and the Node path with your real values throughout.

### 2. Register it in Claude Code

Give it a different name from the local one, so you always know which library you're editing:

```bash
claude mcp add ws-family-games-prod -- ssh -T -o BatchMode=yes deploy@your-vps "GAMES_DB_PATH=/srv/ws-family-games/data/games.db /home/deploy/.nvm/versions/node/v26.3.0/bin/node /srv/ws-family-games/apps/mcp/src/server.ts"
```

- `-T` turns off the remote terminal, so nothing but the MCP protocol travels over the connection.
- `-o BatchMode=yes` makes SSH fail fast instead of waiting for a password Claude can't type.
- The quoted part is one argument: the command run on the VPS.

`claude mcp list` should now show `ws-family-games-prod` as connected.

### 3. Use it

In Claude Code, mention the server by name:

> Using ws-family-games-prod, check which imposter categories are running low and add 20 words to each of them.

### Claude Desktop instead of Claude Code

```json
{
  "mcpServers": {
    "ws-family-games-prod": {
      "command": "ssh",
      "args": [
        "-T", "-o", "BatchMode=yes", "deploy@your-vps",
        "GAMES_DB_PATH=/srv/ws-family-games/data/games.db /home/deploy/.nvm/versions/node/v26.3.0/bin/node /srv/ws-family-games/apps/mcp/src/server.ts"
      ]
    }
  }
}
```

### Things to know for production

- **Don't copy your local `games.db` over the production one** to move words across. You'd overwrite production's usage counts and AI-usage log. Use the SSH route above, or add the words again in production.
- The remote process runs as your SSH user, which needs write access to `data/games.db` and its folder (SQLite creates `-wal` and `-shm` files next to it). Use the same user the app runs as, or put both in a shared group.
- Pull the code and run `pnpm install` on the VPS before using new tools; the MCP server runs whatever code is deployed there.
- Alternative: install Claude Code on the VPS itself, sign in with your Pro account, and register the server with plain local paths (as in [Use it locally](#use-it-locally)). That works too; the SSH route just avoids installing anything extra on the server.

## Tools

All tools are prefixed with the game id. The `*_category` tools come from the core and appear for every game that uses the shared categories table; the rest are the game's own. Word Imposter's:

| Tool | What it does |
|---|---|
| `imposter_list_categories` | All categories (including empty ones) with ids, total and unused counts, plus `runningLow` (fewer than 5 unused). |
| `imposter_search_words` | Search by `categoryId` or `category` (name) and/or `query` (substring of word or hint), up to `limit` (max 200). Returns word ids. |
| `imposter_add_words` | Add `{ words: [{ category, word, hint, difficulty? }] }`, up to 200 per call. `category` is a name: matched to an existing category ignoring case, or created (listed in `createdCategories`). Duplicates and invalid entries are skipped and listed with a reason. Saved with source `claude`. |
| `imposter_update_word` | Edit one word `{ id, categoryId? | category?, word?, hint?, difficulty? }`: move it to another category (by id, or by name, which is created if new) or fix its text. Same rules as adding. |
| `imposter_remove_words` | Remove by `{ ids: [...] }` (ids from `search_words`). |
| `imposter_create_category` | Create an empty category `{ name }`. Rarely needed: `add_words` creates missing ones. |
| `imposter_rename_category` | Rename `{ id, name }`. Its words stay in it. |
| `imposter_delete_category` | Delete an empty category `{ id }`. Refused while it has words: move them with `update_word` or remove them first. |
| `imposter_generate_words` | **Only registered when `ANTHROPIC_API_KEY` is set where the MCP server runs.** Generates with the server-side API and saves directly, within the daily token cap. Hints are one word unless you pass `hintStyle` (e.g. "short phrases"). Costs API credits; you usually don't need it from Claude Code. |

**Rules for a word** (enforced by the tools and the admin page):
- `word`: 1-3 words, under 30 characters.
- `category`: under 40 characters.
- `hint`: under 120 characters, and must not contain the word. By default Claude writes a single loosely related word ("Splash" for Water Gun), so the imposter can bluff without being handed the answer; ask for a different style if you want longer hints.
- `difficulty`: `easy` | `medium` | `hard` (default `medium`).
- A word that's already in the same category (ignoring case) is skipped.
- Categories are shared rows (`categories` table), managed with the `*_category` tools or in the admin panel (Admin → Word Imposter → Categories). A category that still has words can't be deleted; move or delete its words first.

Flock's question library (tools prefixed `herd_`, the game's internal id) works the same way, with its own categories:

| Tool | What it does |
|---|---|
| `herd_list_categories` | All question categories with ids, total and unused counts, plus `runningLow` (fewer than 5 unused). |
| `herd_search_questions` | Search by `categoryId` or `category` (name) and/or `query` (substring of the question), up to `limit` (max 200). Returns question ids. |
| `herd_add_questions` | Add `{ questions: [{ category, question }] }`, up to 200 per call. Missing categories are created; duplicates (same category + question, ignoring case) and invalid entries are skipped with a reason. Saved with source `claude`. |
| `herd_update_question` | Edit one question `{ id, categoryId? \| category?, question? }`: move it or fix its text. |
| `herd_remove_questions` | Remove by `{ ids: [...] }` (ids from `search_questions`). |
| `herd_create_category` / `herd_rename_category` / `herd_delete_category` | Same as the imposter ones. |
| `herd_generate_questions` | **Only with `ANTHROPIC_API_KEY`.** Generates `{ count, category? }` with the server-side API and saves directly. |

**Rules for a question:** 5-120 characters, category under 40. A good question has many possible answers but a few obvious favourites, answered in a word or short phrase ("Name a breakfast cereal", "What is the best pizza topping?"), not trivia with one right answer. Questions aren't secret, so Claude may list them.

## Example prompts

- "List the imposter categories and tell me which are running low."
- "Add 25 words to the imposter library in a new category called Sports. Concrete things everyone knows, a mix of difficulties."
- "Rewrite the hints in the Food category as single vague words."
- "Search the Food category for any hints that give the word away too easily and suggest better ones." (Claude can remove and re-add the ones you approve.)
- "Add 10 words to every category that has fewer than 5 unused words. Check existing words first so you don't repeat them."
- "Remove all imposter words in the Weather category with difficulty hard."
- "Rename the imposter category Food to Food & Drink."
- "Merge the imposter categories Snacks and Food: move every Snacks word into Food, then delete Snacks."
- "Find imposter words whose category doesn't really fit them and move them somewhere better."
- "Add 30 Flock questions in a new Music category."
- "Look through the Flock questions and remove any that are really trivia with one right answer."

**Claude keeps new words secret.** After adding or generating words, Claude reports only how many it added and to which categories, so you can still play. Ask "show me the words" if you want to see them. (They are still in the tool call itself; Claude Code shows it collapsed, so don't expand it if you're playing.)

Good hints are the heart of the game. Asking Claude to look at existing words first (`search_words`) gets you new words and a consistent style.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Server shows as failed in `claude mcp list` | Run the exact command yourself in a terminal; it should sit silently waiting for input. Fix the path or Node version it complains about. |
| Connects, then errors like "unexpected token" or "invalid JSON" | Something printed to **stdout**. On the VPS, a `.bashrc` that echoes text, or a missing `-T`, breaks the protocol. Remove the output or move it behind an interactive-shell check. (The app itself only logs to stderr.) |
| `Permission denied (publickey)` / hangs | SSH needs key auth without prompts; check `ssh -o BatchMode=yes deploy@your-vps "echo ok"`. |
| `node: command not found` over SSH | Use the full Node path (see setup step 2). |
| `database is locked` | Rare: another long write is in progress. Retry; both processes wait up to 5 seconds. |
| `imposter_generate_words` is missing | Expected without `ANTHROPIC_API_KEY`. Use `imposter_add_words` and let Claude write the words. |
| Words don't show up in the lobby category list | Reopen the lobby settings (the list is loaded when they open), and check you added them to the right database (local vs `-prod`). |

# Testing in dev

How to check changes on your own machine: the automated checks, and playing a game as several people at once without juggling browsers.

- [Automated checks](#automated-checks)
- [Several players in one window (dev players)](#several-players-in-one-window-dev-players)
- [The watch page (TV view)](#the-watch-page-tv-view)
- [Phones on your network](#phones-on-your-network)
- [Troubleshooting](#troubleshooting)

## Automated checks

A change is done when these pass:

```bash
pnpm test                          # unit, leak tests, auth routes, websocket transport, MCP, integration sim
pnpm typecheck
pnpm lint
pnpm --filter @ogn/client build   # when client or games/*/client code changed
```

Game logic is pure, so most game behaviour is easiest to test with `createSim` in a game's `test/` folder rather than by hand. The page below is for what tests don't cover: how a round looks and feels from each seat.

## Several players in one window (dev players)

`apps/client/dev-players.html` shows a grid of frames, each a separate player running the real app against your dev server.

### One-time setup

Add the guest origin to `ALLOWED_ORIGINS` in your `.env`, then restart `pnpm dev` (the server reads `.env` only at startup):

```dotenv
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://[::1]:5173
```

`.env` is gitignored, so do this on every machine you test on. Without it, the server refuses guest frames' websockets (403) and their Join button spins forever.

### Use it

1. Sign in as an admin on **http://localhost:5173** and click the people icon in the app bar (only shown in dev), or open **http://localhost:5173/dev-players.html?n=4** directly.
2. Create the room in **P1**, which is signed in as you.
3. Put the room code in the toolbar and click **Apply**. The guest frames open that room; enter a name in each.

**Shortcut:** in dev, **Start a new room** (and the library's start dialog) has a **Dev** box. Tick **Open in dev players** and pick a player count, and/or **Open a spectator window**, then **Create room**: each opens in its own window, already pointed at the new room (players on the left, the watch page on the right). The tab you started from stays on the home page, since opening the room there would pull your seat back from P1; P1 takes the seat when you join in it. Chrome allows one pop-up per click, so to get both windows allow pop-ups for localhost once (a toast says when one was blocked). Launching again reuses the same two windows.

Reloading the page reconnects every frame to its seat. URL options: `n` (players, 1-12), `code` (room to open), `guest` (guest origin, see below).

### How it works

- **P1 loads from `localhost`** and gets your sign-in cookie.
- **Guests load from `[::1]`**, the IPv6 address for this computer. It reaches the same dev server, but the browser treats it as a different site, so guests get no cookie and join as anonymous players. If every frame were signed in as you, the server would give them all your one seat.
- **Each frame keeps its own storage.** Every iframe is named `ogn-p<n>`, and `packages/core/src/ui/storage.ts` prefixes its localStorage keys with that name, so frames on the same origin don't overwrite each other's room token.
- **Dev only.** The page isn't a Vite build input and the app-bar button is imported only under `import.meta.env.DEV`, so neither ships.

### Things to know

- **P1 is you.** Opening dev players for a room you're already in from a normal tab moves your seat into P1; the normal tab gets a "removed" notice. Joining from the normal tab again moves it back.
- **Normal tabs don't see frame seats.** Frames store their tokens under prefixed keys, so a normal tab won't show "Back to room" for a game running in the grid.
- **Each frame has its own theme setting**, since the theme is stored per frame too.
- **If Vite listens on IPv4 instead of IPv6** (`[::1]` doesn't load), use `?guest=http://127.0.0.1:5173` and add `http://127.0.0.1:5173` to `ALLOWED_ORIGINS` instead.

## The watch page (TV view)

To see what a TV shows, open **http://localhost:5173/watch/CODE** in a normal tab next to the dev-players window (or the room's **TV** button, or **Show on TV** in the ☰ menu during a game, then **Copy link**). It spectates: no seat, the view built for `SPECTATOR_ID`, and the players' room header (in a game, the ☰ menu) shows "1 watching".

- **It doesn't disturb your seat.** Watching never touches the saved room token. If that tab was a player, its seat is detached as if the socket dropped (you'll show as away in the grid). Leaving the watch page doesn't take the seat back (the same account may be playing it on a phone); opening that room's page in the tab does. P1 in the grid is unaffected either way, because frames keep their own tokens.
- **Watch at TV size.** Resize the tab or use device emulation (1920×1080), and try the **Full screen** button. Games without a `SpectatorView` show the player list during play.
- **It counts as a join for the rate limit**, and it re-spectates on every reconnect, so a dev server that restarts often adds to the 20-per-minute budget.

## Phones on your network

See [Playing on phones on your network](../README.md#playing-on-phones-on-your-network) in the README.

## Troubleshooting

- **Guest frames never finish joining.** The guest origin is missing from `ALLOWED_ORIGINS`, or the server hasn't restarted since you added it.
- **The page reloads by itself.** Check the Vite terminal at that moment. `page reload <file>` names a changed file; `new dependencies optimized` means a dependency Vite hadn't pre-bundled (all Vuetify components are pre-bundled in `vite.config.mts`, so a new one usually means a new package). A "server is restarting" banner is the Node server restarting under `--watch`, not a page reload.
- **"Too many attempts, wait a minute".** Joins and reconnects are limited to 20 per minute per IP, and every frame shares your IP, so reloading a big grid repeatedly can hit it. Wait a minute.

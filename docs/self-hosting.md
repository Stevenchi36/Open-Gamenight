# Self-hosting Open Gamenight

Everything needed to run your own copy, from first start to updates, backups and getting back into
a locked account. It's one Node process with two SQLite files, so a small VPS, a home server or a
Raspberry Pi is plenty.

- [Pick a way to run it](#pick-a-way-to-run-it)
- [Fill in .env](#fill-in-env)
- [Run with Docker](#run-with-docker) or [run with Node](#run-with-node)
- [HTTPS and a reverse proxy](#https-and-a-reverse-proxy)
- [Home network without HTTPS](#home-network-without-https)
- [After the first start](#after-the-first-start)
- [Updating](#updating)
- [Backups](#backups)
- [Locked out](#locked-out)
- [Troubleshooting](#troubleshooting)

## Pick a way to run it

| | Docker (recommended) | Node |
|---|---|---|
| Host needs | Docker with Compose | Node 26 and pnpm 12.14.0 |
| Install | Two files and `docker compose up -d` | Clone, install, build, plus a service to keep it running |
| Update | `docker compose pull && docker compose up -d` | Pull, install, build, restart |
| Runs on | amd64 and arm64 (Raspberry Pi 4/5, ARM VPSs) | Anywhere Node 26 runs |

Either way:

- **Rooms live in memory.** Restarting or updating ends every open room; players see "The server is
  restarting, rejoin in a moment." Update when nobody is playing.
- **One instance only.** Because rooms are in memory, the app can't be spread across several
  containers or servers.
- **Players don't need accounts.** Accounts are for starting rooms and for admins. Anyone joins a
  room with its 4-letter code and a name.

## Fill in .env

All settings live in `.env` (start from [`.env.example`](../.env.example)). Three are required:

```dotenv
BETTER_AUTH_SECRET=<32+ random characters>
BETTER_AUTH_URL=https://games.example.com
ALLOWED_ORIGINS=https://games.example.com
```

- **`BETTER_AUTH_SECRET`** signs sign-in sessions. Generate one with `openssl rand -base64 32` (or
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) and keep it
  private. Changing it later signs everyone out.
- **`BETTER_AUTH_URL`** is the address people type, exactly as it appears in the browser:
  `https://`, the host name, and a port only if it isn't the usual one. Passkeys belong to its host
  name, so moving the site to a new domain later means everyone adds their passkeys again (passwords
  keep working).
- **`ALLOWED_ORIGINS`** is the same address. Requests and game connections from any other address
  are refused, so if people reach the site by two names (say a domain and a LAN address), list both,
  comma-separated.

Then the IP settings, which every per-person limit (sign-in attempts, rooms per guest, connections)
depends on. Count the proxies between players and the app:

| In front of the app | `TRUSTED_PROXY_HOPS` | `REAL_IP_HEADER` |
|---|---|---|
| Nothing (players connect straight to it) | `0` | empty |
| One reverse proxy (Caddy, nginx, Traefik) | `1` | empty |
| Cloudflare, then a reverse proxy | `2` | `CF-Connecting-IP` |

Too low and everyone looks like one person (the proxy), so one player's mistakes rate-limit the
whole table. Too high and players can fake their address to dodge the limits.

The rest is optional: the name and colour in the app bar (`APP_NAME`, `APP_PRIMARY_COLOR`), who may
start rooms (`ROOM_CREATION`), room limits, and an Anthropic API key for AI word generation. The
README's [Configuration](../README.md#configuration) table lists every setting.

> **Comments in .env:** never put a comment after an empty value (`REAL_IP_HEADER=   # note`).
> Docker Compose reads the comment as the value. Put it on the line above.

## Run with Docker

The image is `ghcr.io/stevenchi36/open-gamenight`. `latest` is the newest
[release](https://github.com/Stevenchi36/Open-Gamenight/releases); each release also has its own tag
(`0.1.0`, and `0.1` for the newest patch of 0.1), and `main` follows every commit on `main` that
passes the checks.

```bash
mkdir open-gamenight && cd open-gamenight
curl -fsSLO https://raw.githubusercontent.com/Stevenchi36/Open-Gamenight/main/compose.yaml
curl -fsSL https://raw.githubusercontent.com/Stevenchi36/Open-Gamenight/main/.env.example -o .env
nano .env                       # the three required lines, and the IP settings
docker compose up -d
docker compose logs -f app      # wait for "listening on ...", then Ctrl+C
```

Create your admin account (it asks for the password):

```bash
docker compose exec app node apps/server/scripts/create-admin.ts --email you@example.com --name "You"
```

The app now answers on `http://127.0.0.1:3000` on that machine only. Put a reverse proxy with HTTPS
in front ([below](#https-and-a-reverse-proxy)), or follow [Home network without
HTTPS](#home-network-without-https).

Good to know:

- **Data** is in the Docker volume `open-gamenight_data`: `auth.db` (accounts) and `games.db` (word
  libraries and settings). `docker compose down` keeps it; `docker compose down -v` deletes it.
- **Changed `.env`?** Run `docker compose up -d`, which recreates the container with the new values.
  `docker compose restart` keeps the old ones.
- **Building from source** instead of pulling: clone the repo and run `docker compose up -d --build`.
  A local build knows its version but not its commit, so the admin Overview shows only the version.
- **Your reverse proxy also runs in Docker?** Remove the `ports:` lines from `compose.yaml`, put both
  containers on one Docker network, and point the proxy at `app:3000`.

## Run with Node

Needs Node **26** (the database driver is built into Node, so the major version matters) and pnpm:

```bash
npm install -g pnpm@12.14.0          # Node 25+ no longer ships Corepack
git clone https://github.com/Stevenchi36/Open-Gamenight.git /srv/open-gamenight
cd /srv/open-gamenight
pnpm install --frozen-lockfile
pnpm build                           # builds the web client; the server runs its source directly
cp .env.example .env && nano .env
pnpm create-admin --email you@example.com --name "You"
pnpm start                           # try it; Ctrl+C to stop
```

To keep it running, a systemd service (`/etc/systemd/system/open-gamenight.service`):

```ini
[Unit]
Description=Open Gamenight
After=network.target

[Service]
User=gamenight
WorkingDirectory=/srv/open-gamenight
# `which node` for the full path. Run node itself, not `pnpm start`, so it gets the stop signal
# and can tell players it's restarting.
ExecStart=/usr/bin/node apps/server/src/index.ts
Restart=on-failure
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now open-gamenight
journalctl -u open-gamenight -f      # logs
```

Supervisor works just as well (`command=node apps/server/src/index.ts`, `directory=` the checkout);
it's what `scripts/deploy.sh` restarts (see [Updating](#updating)).

## HTTPS and a reverse proxy

Signing in needs HTTPS (the session cookie is `Secure` when `NODE_ENV=production`), and the game
runs over a websocket at `/ws`, which the proxy has to pass through.

**Caddy** gets and renews certificates by itself and handles websockets with no extra lines. The
whole `Caddyfile`:

```caddy
games.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

**nginx** needs the websocket upgrade spelled out, and a long read timeout so idle rooms aren't cut
off (the server pings every 30 seconds):

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name games.example.com;
    ssl_certificate     /etc/letsencrypt/live/games.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/games.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}

server {
    listen 80;
    server_name games.example.com;
    return 301 https://$host$request_uri;
}
```

With either one, set `TRUSTED_PROXY_HOPS=1`.

**Cloudflare** (proxied DNS) in front of that proxy works as is, websockets included. Use SSL mode
**Full (strict)**, and set `TRUSTED_PROXY_HOPS=2` and `REAL_IP_HEADER=CF-Connecting-IP`. Anyone who
can reach your server without going through Cloudflare could send a fake `CF-Connecting-IP`, so
firewall the origin to [Cloudflare's addresses](https://www.cloudflare.com/ips/) if you rely on the
IP limits.

## Home network without HTTPS

For a game night on your own Wi-Fi, with nothing reachable from the internet, you can skip HTTPS:

```dotenv
NODE_ENV=development                         # only effect here: cookies without the Secure flag
BETTER_AUTH_URL=http://192.168.1.20:3000     # the server's address on your network
ALLOWED_ORIGINS=http://192.168.1.20:3000
TRUSTED_PROXY_HOPS=0
```

With Docker, also change the port line in `compose.yaml` from `"127.0.0.1:${PORT:-3000}:..."` to
`"${PORT:-3000}:${PORT:-3000}"` so other devices can reach it. Then open `http://192.168.1.20:3000`
on the phones. Give the server a fixed address in your router so the URL keeps working.
Passkeys need HTTPS, so on this setup the app offers passwords only.

Don't do this on anything the internet can reach: sign-in sessions would travel unencrypted.

## After the first start

Sign in with the admin account, then open **Admin** (the shield in the app bar):

- **Users:** create accounts for the people who'll start rooms. Public sign-up is closed.
- **Games:** switch off games your group never plays.
- **Word libraries** (Word Imposter, Flock, Ballpark, In Order) come with a starter set. Add your
  own there, or with Claude through the [MCP server](mcp.md).
- **Overview:** which version is running, and a notice when a newer one is out.

`ROOM_CREATION=anyone` lets guests start rooms without an account; it suits a private network only,
since anyone who can reach the site could then open rooms.

## Updating

The admin **Overview** says when there's a newer [release](https://github.com/Stevenchi36/Open-Gamenight/releases),
with a link to what changed, the command and how many rooms are open (updating ends them). Each
release's notes (also in `CHANGELOG.md`) list anything a host has to do under **Hosting**.

**Docker:**

```bash
docker compose pull && docker compose up -d
```

To stay on a version until you choose to move, replace `latest` in `compose.yaml` with a release
tag such as `0.1.0` (or `0.1` to take only that version's fixes). To follow every commit instead of
releases, use `main`. All tags are on the [package page](https://github.com/Stevenchi36/Open-Gamenight/pkgs/container/open-gamenight).

**Node:**

```bash
cd /srv/open-gamenight
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart open-gamenight
```

Under Supervisor, `npm run deploy` (`scripts/deploy.sh`) does all of this, building the client
beside the live one and swapping it in only if the build succeeds. It restarts the Supervisor
program `open-gamenight` (`SUPERVISOR_PROGRAM=other npm run deploy` for another name). It doesn't
run lint, typecheck or tests; those run in GitHub Actions, so update once `main`'s CI is green.

A Node install follows `main`, which includes every release plus whatever has been merged since.
The Overview tells you when a release is out; updating then brings you to it or a little past it.

Database changes apply by themselves on start. There's no separate migration step.

## Backups

Two files hold everything: `auth.db` (accounts, sessions) and `games.db` (libraries, settings).
Both can be copied safely while the server runs with SQLite's own backup:

```bash
# Node (sqlite3 CLI)
sqlite3 data/games.db ".backup backups/games-$(date +%F).db"
sqlite3 data/auth.db ".backup backups/auth-$(date +%F).db"

# Docker (no sqlite3 needed): copies inside the volume, replacing the last ones, then out to the host
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite');for(const n of ['auth','games']){const f='/data/'+n+'-backup.db';require('fs').rmSync(f,{force:true});new DatabaseSync('/data/'+n+'.db').exec(\"VACUUM INTO '\"+f+\"'\")}"
docker compose cp app:/data/games-backup.db ./games-$(date +%F).db
docker compose cp app:/data/auth-backup.db ./auth-$(date +%F).db
```

`auth.db` holds password hashes and live sessions, so keep its backups private.

**Restore:** stop the app, replace the `.db` files (and delete any `-wal`/`-shm` files beside them),
start it again. With Docker, `docker compose cp` them into the stopped container's `/data`.

## Locked out

- **Someone forgot their password:** an admin opens **Admin → Users → Set password** and gives them
  a temporary one. Anyone can change their own from the account menu.
- **No admin can help** (the only admin forgot theirs, say): make a recovery code on the server.

  ```bash
  pnpm recover-account --email them@example.com
  # Docker:
  docker compose exec app node apps/server/scripts/recover-account.ts --email them@example.com
  ```

  It prints a code like `ABCD-EFGH-JKMN`. They open **Have a recovery code?** on the sign-in page,
  enter it and choose a new password. A code works once, for 24 hours; making one voids any earlier
  code, signs the account out everywhere and removes its passkeys (an admin's Set password does
  the same), in case someone else had added one.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| The app exits at start with `Invalid configuration:` and a list | Those `.env` lines are missing or malformed. `docker compose logs app` or `journalctl -u open-gamenight` shows the list. |
| Signing in seems to work, but you're still signed out | No HTTPS while `NODE_ENV=production`: the browser drops Secure cookies over plain HTTP (except on `localhost`). Use HTTPS, or see [Home network without HTTPS](#home-network-without-https). |
| Sign-in fails with "Bad origin", or rooms never get past connecting | The address in the browser bar isn't in `ALLOWED_ORIGINS` exactly (scheme, host and port all count). |
| No passkey option on the sign-in page or in the account menu | The site isn't on HTTPS (browsers allow passkeys only there and on `localhost`). |
| Adding or using a passkey fails on one address but works on another | Passkeys belong to `BETTER_AUTH_URL`'s host name; a second name in `ALLOWED_ORIGINS` (a LAN address, say) can't use them. |
| Rooms connect, then drop after about a minute | The proxy times out idle websockets: `proxy_read_timeout 1h` in nginx. |
| One player's failed sign-ins lock everyone out, or guests share one room limit | `TRUSTED_PROXY_HOPS` is lower than the number of proxies, so everyone looks like the proxy. |
| A plain page saying the site is being updated | The web client isn't built (Node install): run `pnpm build`. |
| AI features switched on with a key you never set | A comment after an empty value in `.env`, read as the value by Docker Compose. Move it to its own line. |
| The admin Overview says the repo "has no published releases, or isn't public" | The update check reads the latest GitHub release of a public repository; a fork sets its own `UPDATE_CHECK_REPO` (and publishes releases), or leaves it empty to turn the check off. |
| The admin Overview can't tell which version is running | The root `package.json` is missing or has been edited. Restore it from the release. |

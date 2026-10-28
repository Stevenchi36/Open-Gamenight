#!/usr/bin/env bash
# Production update: pull, install, build, restart under Supervisor.
# Restarting ends every open room, so run it when nobody is playing.
#   npm run deploy                          (or: pnpm run deploy)
#   SUPERVISOR_PROGRAM=other npm run deploy (if the [program:...] name differs)

# Wrapped in a function so bash reads the whole file before `git pull` can rewrite it.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."

  local program="${SUPERVISOR_PROGRAM:-open-gamenight}"
  local before
  before="$(git rev-parse --short HEAD)"

  echo "==> Pulling"
  git pull --ff-only

  echo "==> Installing dependencies"
  pnpm install --frozen-lockfile

  echo "==> Building client"
  # Into a new folder, swapped in only once it succeeds: Vite empties its outDir before building,
  # and the running server serves dist/ until the restart below, so building in place meant a
  # failed build took the site down.
  local client=apps/client
  rm -rf "$client/dist.next"
  # Run from the folder, not `pnpm --filter <name>`: this script is read before `git pull`, so a
  # package rename in the pull made the old filter match nothing, which pnpm treats as success.
  (cd "$client" && pnpm exec vite build --outDir dist.next)
  if [ ! -f "$client/dist.next/index.html" ]; then
    echo "Client build produced no $client/dist.next/index.html; leaving dist/ in place." >&2
    exit 1
  fi
  rm -rf "$client/dist.old"
  if [ -d "$client/dist" ]; then mv "$client/dist" "$client/dist.old"; fi
  mv "$client/dist.next" "$client/dist"

  echo "==> Restarting $program"
  sudo supervisorctl restart "$program"
  sudo supervisorctl status "$program"

  echo "==> Deployed $before -> $(git rev-parse --short HEAD)"
}

main "$@"
exit

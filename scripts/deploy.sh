#!/usr/bin/env bash
# Production update: pull, install, build, restart under Supervisor.
# Restarting ends every open room, so run it when nobody is playing.
#   npm run deploy                          (or: pnpm run deploy)
#   SUPERVISOR_PROGRAM=other npm run deploy (if the [program:...] name differs)

# Wrapped in a function so bash reads the whole file before `git pull` can rewrite it.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."

  local program="${SUPERVISOR_PROGRAM:-family-games}"
  local before
  before="$(git rev-parse --short HEAD)"

  echo "==> Pulling"
  git pull --ff-only

  echo "==> Installing dependencies"
  pnpm install --frozen-lockfile

  echo "==> Building client"
  pnpm build

  echo "==> Restarting $program"
  sudo supervisorctl restart "$program"
  sudo supervisorctl status "$program"

  echo "==> Deployed $before -> $(git rev-parse --short HEAD)"
}

main "$@"
exit

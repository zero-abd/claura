#!/bin/bash
# Reset the demo database AS ITS OWNER (the spacetime CLI identity is the admin), then run the live incident.
# The agent runner itself is role "agent" and cannot reset anything, by design.
#
#   scripts/live.sh                          Maincloud profile (~/.config/claura/.env), real Nemotron, a human approves in the dashboard
#   scripts/live.sh --auto-approve-after 3   ... approved after 3 s by the labelled TEST HARNESS identity instead
#   scripts/live.sh --scripted               no model (backup)
#   scripts/live.sh --local ...              isolated appliance profile (~/.config/claura/local.env)
#   scripts/live.sh --no-reset ...           skip the reset (the database must already be fresh)
# Everything else is passed to the runner (npm run demo -- ...).
set -euo pipefail

S=${SPACETIME:-$(command -v spacetime || echo "$HOME/.local/bin/spacetime")}
HERE=$(cd "$(dirname "$0")/.." && pwd)
ENVF=${CLAURA_ENV_FILE:-$HOME/.config/claura/.env}
RESET=1
ARGS=()
for a in "$@"; do
  case "$a" in
    --local) ENVF=${CLAURA_ENV_FILE:-$HOME/.config/claura/local.env}; ARGS+=("$a") ;;
    --no-reset) RESET= ;;
    *) ARGS+=("$a") ;;
  esac
done

getvar() { grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'"; }
URI=$(getvar CLAURA_STDB_URI); URI=${URI:-ws://127.0.0.1:3000}
DB=$(getvar CLAURA_STDB_DB);   DB=${DB:-claura}
case "$URI" in *maincloud*) SERVER=maincloud ;; *) SERVER=http://${URI#ws://} ;; esac

if [ -n "$RESET" ]; then
  echo "resetting $DB on $SERVER (as the database owner) ..."
  "$S" call --server "$SERVER" "$DB" reset_demo 2>&1 | grep -v WARNING || true
fi
cd "$HERE/agents"
unset NODE_USE_SYSTEM_CA
exec npm run --silent demo -- "${ARGS[@]+"${ARGS[@]}"}"

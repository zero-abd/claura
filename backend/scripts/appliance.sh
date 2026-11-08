#!/bin/bash
# ISOLATED APPLIANCE MODE: run the whole stack on this laptop, no cloud involved.
#
#   scripts/appliance.sh             start local SpacetimeDB (127.0.0.1:3000) if needed, publish module "claura", issue codes
#   scripts/appliance.sh --wipe      same, but destroy the local "claura" database first (fresh admin, fresh everything)
#
# What it writes: ~/.config/claura/local.env (mode 0600) with the backend address and THREE one-time codes
# (agent runner, demo console, labelled auto-approve test harness). Codes are never printed.
# The local database owner (this Mac's spacetime CLI identity) becomes the "Owner" admin.
set -euo pipefail

S=${SPACETIME:-/Users/abd/.local/bin/spacetime}
HERE=$(cd "$(dirname "$0")/.." && pwd)
ENVF=${CLAURA_LOCAL_ENV:-$HOME/.config/claura/local.env}
DB=claura
WIPE=
[ "${1:-}" = "--wipe" ] && WIPE="-c"

# 1. server (bound to loopback only)
if ! "$S" server ping local >/dev/null 2>&1; then
  echo "starting SpacetimeDB on 127.0.0.1:3000 ..."
  mkdir -p "$HERE/runs"
  nohup "$S" start --listen-addr 127.0.0.1:3000 --non-interactive >"$HERE/runs/spacetime-server.log" 2>&1 &
  echo $! >"$HERE/runs/.stdb.pid"
  for _ in $(seq 1 40); do "$S" server ping local >/dev/null 2>&1 && break; sleep 0.5; done
fi
"$S" server ping local >/dev/null 2>&1 || { echo "local SpacetimeDB did not come up" >&2; exit 1; }

# 2. module
(cd "$HERE/spacetime" && unset NODE_USE_SYSTEM_CA && "$S" publish --server local "$DB" ${WIPE} --yes 2>&1 | grep -v WARNING | tail -3)

# 3. one-time codes -> local.env (mode 0600), never echoed
mkcode() { (unset NODE_USE_SYSTEM_CA; node "$HERE/scripts/new-code.mjs"); }
issue() { # role, name_hint -> prints nothing, returns the code via $CODE
  CODE=$(mkcode)
  "$S" call --server local "$DB" issue_enrollment "$(printf '"%s"' "$CODE")" "$(printf '"%s"' "$1")" "$(printf '"%s"' "$2")" >/dev/null 2>&1
}
mkdir -p "$(dirname "$ENVF")"; chmod 700 "$(dirname "$ENVF")" 2>/dev/null || true
umask 077
issue agent "Claura agent runner";            AGENT=$CODE
issue commander "Demo console";               CONSOLE=$CODE
issue commander "TEST HARNESS (auto-approve)"; APPROVER=$CODE
{
  echo "# Claura LOCAL appliance profile. One-time codes: each works once. Generated $(date '+%Y-%m-%d %H:%M')."
  echo "CLAURA_STDB_URI=ws://127.0.0.1:3000"
  echo "CLAURA_STDB_DB=$DB"
  echo "CLAURA_AGENT_CODE=$AGENT"
  echo "CLAURA_CONSOLE_CODE=$CONSOLE"
  echo "CLAURA_APPROVER_CODE=$APPROVER"
} >"$ENVF"
chmod 600 "$ENVF"

echo "appliance ready: ws://127.0.0.1:3000 db \"$DB\""
echo "  profile  $ENVF  (mode 600; contains 3 one-time codes)"
echo "  run      scripts/live.sh --local            (resets, then runs the incident)"

#!/bin/bash
# Admin helper for access control, run as the database OWNER (the spacetime CLI identity is the "Owner" admin).
#
#   scripts/access.sh [--local] code <role> "<name hint>"     print ONE new single-use enrollment code (nothing else)
#   scripts/access.sh [--local] list                          who has access, and which codes are unused (codes are never shown)
#   scripts/access.sh [--local] add <identity_hex> "<name>" <role>
#   scripts/access.sh [--local] revoke <identity_hex>         cut an identity off immediately
#   scripts/access.sh [--local] void-code <code>              void an unused code
#   scripts/access.sh [--local] reset                         reset_demo (wipes incident data, keeps operators and codes)
#
# roles: admin | commander | legal | exec | comms | vendor | responder | agent
# Default target is Maincloud (~/.config/claura/.env); --local targets the isolated appliance (~/.config/claura/local.env).
set -euo pipefail

S=${SPACETIME:-$(command -v spacetime || echo "$HOME/.local/bin/spacetime")}
HERE=$(cd "$(dirname "$0")/.." && pwd)
ENVF=${CLAURA_ENV_FILE:-$HOME/.config/claura/.env}
if [ "${1:-}" = "--local" ]; then ENVF=${CLAURA_ENV_FILE:-$HOME/.config/claura/local.env}; shift; fi
getvar() { grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'"; }
URI=$(getvar CLAURA_STDB_URI); URI=${URI:-ws://127.0.0.1:3000}
DB=$(getvar CLAURA_STDB_DB);   DB=${DB:-claura}
case "$URI" in *maincloud*) SERVER=maincloud ;; *) SERVER=http://${URI#ws://} ;; esac
call() { "$S" call --server "$SERVER" "$DB" "$@" 2>&1 | grep -v WARNING || true; }
js() { printf '"%s"' "$1"; }

cmd=${1:-}; shift || true
case "$cmd" in
  code)
    role=${1:?role}; hint=${2:-}
    code=$(unset NODE_USE_SYSTEM_CA; node "$HERE/scripts/new-code.mjs")
    out=$("$S" call --server "$SERVER" "$DB" issue_enrollment "$(js "$code")" "$(js "$role")" "$(js "$hint")" 2>&1) \
      || { echo "$out" | grep -v WARNING >&2; exit 1; }
    echo "$code" ;;
  list)
    "$S" sql --server "$SERVER" "$DB" "SELECT name, role, added_by, active FROM operator" 2>&1 | grep -v WARNING
    "$S" sql --server "$SERVER" "$DB" "SELECT role, name_hint, created_by, used_by FROM enrollment" 2>&1 | grep -v WARNING ;;
  add)    call add_operator "$(js "${1:?identity_hex}")" "$(js "${2:?name}")" "$(js "${3:?role}")" ;;
  revoke) call revoke_operator "$(js "${1:?identity_hex}")" ;;
  void-code) call revoke_enrollment "$(js "${1:?code}")" ;;
  reset)  call reset_demo ;;
  *) sed -n '2,13p' "$0"; exit 64 ;;
esac

#!/bin/bash
# Run the live incident: real NVIDIA Nemotron agents (local Ollama) against the Maincloud database.
#
#   demo/run-incident.sh                          reset the demo database, then Nemotron runs the incident; a human approves in the console
#   demo/run-incident.sh --scripted               BACKUP: no model, same reducers, the approval card in about 10 s
#   demo/run-incident.sh --local                  the isolated appliance (ws://127.0.0.1:3000) instead of Maincloud (Wi-Fi down)
#   demo/run-incident.sh --auto-approve-after 3   no human: the labelled TEST HARNESS approves after 3 s
#   demo/run-incident.sh --no-reset               skip the reset (the database must already be fresh)
#   demo/run-incident.sh --dry-run                run the pre-flight checks and print the command, change nothing
#   demo/run-incident.sh --force                  go ahead even if a pre-flight check fails
# Anything else is passed to the runner (for example --pace-ms 0 with --scripted).
#
# This wraps claura-backend/scripts/live.sh. That script RESETS the demo database as its owner first (the agent runner itself
# cannot reset anything, by design), so do not run it while another judge is looking at the room. After the run, put the room
# back to quiet with:  claura-backend/scripts/access.sh reset      (add --local for the appliance)
set -uo pipefail

BACKEND_DIR=${CLAURA_BACKEND_DIR:-$HOME/repos/claura-backend}
LIVE=$BACKEND_DIR/scripts/live.sh
OLLAMA_URL=${CLAURA_OLLAMA_URL:-http://127.0.0.1:11434}
MODEL=${CLAURA_NEMOTRON_MODEL:-nemotron-3-nano:4b}
MAINCLOUD=https://maincloud.spacetimedb.com
LOCAL_DB=http://127.0.0.1:3000
unset NODE_USE_SYSTEM_CA

SCRIPTED=0; LOCAL=0; DRY=0; FORCE=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --scripted) SCRIPTED=1; ARGS+=("$a") ;;
    --local) LOCAL=1; ARGS+=("$a") ;;
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$a") ;;
  esac
done

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else G=; Y=; R=; N=; fi
ok()   { printf '%s[ ok ]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$Y" "$N" "$*"; }
bad()  { printf '%s[FAIL]%s %s\n' "$R" "$N" "$*" >&2; PROBLEMS=$((PROBLEMS + 1)); }
PROBLEMS=0

[ -x "$LIVE" ] || { echo "live.sh not found or not executable: $LIVE (set CLAURA_BACKEND_DIR)" >&2; exit 1; }

# ---- pre-flight
if [ "$SCRIPTED" = 1 ]; then
  ok "scripted run: no model needed"
elif curl -fsS -m 3 "$OLLAMA_URL/api/tags" 2>/dev/null | grep -q "\"name\":\"$MODEL\""; then
  ok "Ollama is up and $MODEL is installed"
  curl -fsS -m 3 "$OLLAMA_URL/api/ps" 2>/dev/null | grep -q "\"name\":\"$MODEL\"" || warn "$MODEL is not loaded yet: the first turns will be slow. Warm it:  ollama run $MODEL ok   (or use --scripted)"
else
  bad "Ollama is not up with $MODEL at $OLLAMA_URL. Start it (~/ollama/ollama serve) or use --scripted"
fi
if [ "$LOCAL" = 1 ]; then
  curl -fsS -m 3 "$LOCAL_DB/v1/ping" >/dev/null 2>&1 && ok "local appliance answers on 127.0.0.1:3000" || bad "the local appliance is not running: $BACKEND_DIR/scripts/appliance.sh"
else
  curl -fsS -m 5 "$MAINCLOUD/v1/ping" >/dev/null 2>&1 && ok "Maincloud answers" || bad "Maincloud is not reachable. Use --local (appliance) or fix the Wi-Fi"
fi

CMD=("$LIVE" ${ARGS[@]+"${ARGS[@]}"})
echo
echo "command: ${CMD[*]}"
if [ "$DRY" = 1 ]; then
  echo "dry run: nothing was changed. ($PROBLEMS pre-flight problem(s))"
  [ "$PROBLEMS" = 0 ]; exit $?
fi
if [ "$PROBLEMS" != 0 ] && [ "$FORCE" = 0 ]; then
  echo "Not starting: fix the problem(s) above, or pass --force." >&2
  exit 2
fi
echo "Resetting the demo database and starting the incident. Approve in the console (live mode) when the card appears."
echo
exec "${CMD[@]}"

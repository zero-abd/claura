#!/bin/bash
# Read-only status of the demo: processes, ports, gateway features, Ollama, backends. Changes nothing.
#   demo/status.sh          exit 0 when the console and the gateway are both up, 1 otherwise
set -uo pipefail

DEMO_DIR=$(cd "$(dirname "$0")" && pwd)
RUN=$DEMO_DIR/.run
GW_PORT=${CLAURA_GATEWAY_PORT:-8787}
CONSOLE_PORT=${CLAURA_CONSOLE_PORT:-4317}
OLLAMA_URL=${CLAURA_OLLAMA_URL:-http://127.0.0.1:11434}
MODEL=${CLAURA_NEMOTRON_MODEL:-nemotron-3-nano:4b}
unset NODE_USE_SYSTEM_CA

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else G=; Y=; R=; N=; fi
up()   { printf '%s[ up ]%s %s\n' "$G" "$N" "$*"; }
down() { printf '%s[down]%s %s\n' "$R" "$N" "$*"; }
note() { printf '%s[ .. ]%s %s\n' "$Y" "$N" "$*"; }
pid_of() { [ -f "$RUN/$1.pid" ] && tr -dc '0-9' < "$RUN/$1.pid"; }
alive()  { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

BAD=0
gw=$(curl -fsS -m 2 "http://127.0.0.1:$GW_PORT/api/health" 2>/dev/null) && up "gateway   http://localhost:$GW_PORT  (pid $(pid_of gateway || echo '?'))" || { down "gateway   not answering on port $GW_PORT"; BAD=1; }
if [ -n "${gw:-}" ]; then
  printf '%s' "$gw" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const j = JSON.parse(s);
      for (const f of j.features) console.log("         " + f.status.padEnd(5) + " " + f.name.padEnd(14) + (f.detail || f.error || ""));
      if (!j.ready) console.log("         (gateway is still starting)");
    });'
fi
curl -fsS -m 2 -o /dev/null "http://127.0.0.1:$CONSOLE_PORT/" 2>/dev/null && up "console   http://localhost:$CONSOLE_PORT/?demo=1  (pid $(pid_of console || echo '?'))" || { down "console   not answering on port $CONSOLE_PORT"; BAD=1; }
tags=$(curl -fsS -m 3 "$OLLAMA_URL/api/tags" 2>/dev/null) || tags=
if [ -z "$tags" ]; then note "ollama    not running ($OLLAMA_URL)"
elif printf '%s' "$tags" | grep -q "\"name\":\"$MODEL\""; then
  if curl -fsS -m 3 "$OLLAMA_URL/api/ps" 2>/dev/null | grep -q "\"name\":\"$MODEL\""; then up "ollama    $MODEL loaded (warm)"; else note "ollama    $MODEL installed but not loaded (first answer will be slow)"; fi
else note "ollama    up, but $MODEL is not installed"; fi
curl -fsS -m 4 https://maincloud.spacetimedb.com/v1/ping >/dev/null 2>&1 && up "maincloud reachable" || note "maincloud NOT reachable (use the local appliance or the replay)"
curl -fsS -m 2 http://127.0.0.1:3000/v1/ping >/dev/null 2>&1 && up "appliance on 127.0.0.1:3000" || note "appliance not running (offline fallback needs backend/scripts/appliance.sh)"
exit $BAD

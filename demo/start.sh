#!/bin/bash
# Claura demo launcher: one command brings up everything the judging table needs.
#
#   demo/start.sh                 console on :4317, gateway on :8787 (with the Secure Shell sshd targets), checks, URLs
#   demo/start.sh --skip-build    reuse the last console build even if the sources changed
#   demo/start.sh --rebuild       force a fresh console build
#   demo/start.sh --start-ollama  also start Ollama if it is not running (stopped again by demo/stop.sh)
#   demo/start.sh --no-console    gateway only          demo/start.sh --no-gateway   console only
#
# Safe to run twice: whatever is already running (and was started by this script) is reused.
# Stop everything with demo/stop.sh. Logs and pid files live in demo/.run/ (no secrets are ever written there).
# The console repo (bulkhead) is only read and built, never edited; the build goes to demo/.run/console-dist.
set -uo pipefail

DEMO_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$DEMO_DIR/.." && pwd)
GATEWAY_DIR=$REPO/gateway
CONSOLE_DIR=${CLAURA_CONSOLE_DIR:-$HOME/repos/bulkhead}
BACKEND_DIR=${CLAURA_BACKEND_DIR:-$HOME/repos/claura-backend}
RUN=$DEMO_DIR/.run
GW_PORT=${CLAURA_GATEWAY_PORT:-8787}
CONSOLE_PORT=${CLAURA_CONSOLE_PORT:-4317}
OLLAMA_URL=${CLAURA_OLLAMA_URL:-http://127.0.0.1:11434}
MODEL=${CLAURA_NEMOTRON_MODEL:-nemotron-3-nano:4b}
MAINCLOUD=https://maincloud.spacetimedb.com
LOCAL_DB=http://127.0.0.1:3000
CONSOLE_OUT=$RUN/console-dist
# The gateway only answers browsers from the console's origins (4317). If the console is moved with CLAURA_CONSOLE_PORT
# (another dev server already owns 4317), tell the gateway; otherwise leave its default untouched.
GW_ORIGINS=${CLAURA_GATEWAY_CONSOLE_ORIGINS:-}
[ "$CONSOLE_PORT" != 4317 ] && GW_ORIGINS="http://localhost:$CONSOLE_PORT,http://127.0.0.1:$CONSOLE_PORT"

unset NODE_USE_SYSTEM_CA

FORCE_BUILD=0; SKIP_BUILD=0; START_OLLAMA=0; WITH_CONSOLE=1; WITH_GATEWAY=1
for a in "$@"; do
  case "$a" in
    --rebuild) FORCE_BUILD=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --start-ollama) START_OLLAMA=1 ;;
    --no-console) WITH_CONSOLE=0 ;;
    --no-gateway) WITH_GATEWAY=0 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $a (try --help)" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'; else G=; Y=; R=; D=; N=; fi
ok()   { printf '%s[ ok ]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$Y" "$N" "$*"; }
bad()  { printf '%s[FAIL]%s %s\n' "$R" "$N" "$*" >&2; }
info() { printf '       %s%s%s\n' "$D" "$*" "$N"; }

mkdir -p "$RUN"
chmod 700 "$RUN" 2>/dev/null || true
trap 'echo; echo "interrupted: whatever was already started keeps running; stop it with $DEMO_DIR/stop.sh"; exit 130' INT TERM

alive()    { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
pid_of()   { [ -f "$RUN/$1.pid" ] && tr -dc '0-9' < "$RUN/$1.pid"; }
cmd_of()   { ps -p "$1" -o command= 2>/dev/null; }
# is_ours <name> <pattern>: the pid file names a live process whose command line matches (guards against pid reuse)
is_ours()  { local p; p=$(pid_of "$1") || return 1; [ -n "$p" ] && alive "$p" && cmd_of "$p" | grep -q -- "$2"; }
listener() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }
wait_for() { local secs=$1; shift; local i=0; while [ "$i" -lt $((secs * 2)) ]; do "$@" >/dev/null 2>&1 && return 0; sleep 0.5; i=$((i + 1)); done; return 1; }
gateway_ready() { curl -fsS -m 2 "http://127.0.0.1:$GW_PORT/api/health" 2>/dev/null | grep -q '"ready":true'; }
console_ready() { curl -fsS -m 2 -o /dev/null "http://127.0.0.1:$CONSOLE_PORT/"; }

print_features() {
  curl -fsS -m 3 "http://127.0.0.1:$GW_PORT/api/health" 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { for (const f of JSON.parse(s).features) console.log("         " + f.status.padEnd(5) + " " + f.name.padEnd(14) + (f.detail || f.error || "")); }
      catch (e) { console.log("         (health unreadable)"); }
    });'
}

fail_and_stop() {
  bad "$1"
  [ -n "${2:-}" ] && [ -f "$2" ] && { info "last lines of $2:"; tail -n 15 "$2" | sed 's/^/         /'; }
  info "stopping what was started"
  "$DEMO_DIR/stop.sh" --quiet >/dev/null 2>&1
  exit 1
}

echo "Claura demo launcher"
echo

# ---------------------------------------------------------------- 1. tools
command -v node >/dev/null || { bad "node not found on PATH"; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { bad "node $NODE_MAJOR is too old (need 20+)"; exit 1; }
for t in curl lsof; do command -v "$t" >/dev/null || { bad "$t not found"; exit 1; }; done
ok "node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------- 2. already running?
if [ "$WITH_GATEWAY" = 1 ] && is_ours gateway 'server.mjs'; then GW_RUNNING=1; else GW_RUNNING=0; fi
if [ "$WITH_CONSOLE" = 1 ] && is_ours console 'vite.js preview'; then CON_RUNNING=1; else CON_RUNNING=0; fi
[ "$WITH_GATEWAY" = 1 ] && [ "$GW_RUNNING" = 0 ] && rm -f "$RUN/gateway.pid"
[ "$WITH_CONSOLE" = 1 ] && [ "$CON_RUNNING" = 0 ] && rm -f "$RUN/console.pid"

# ---------------------------------------------------------------- 3. ports
check_port() { # port label running
  local owner; owner=$(listener "$1")
  if [ -n "$owner" ] && [ "$3" = 0 ]; then
    bad "port $1 ($2) is already in use by pid $owner: $(cmd_of "$owner" | cut -c1-110)"
    info "stop it, or run demo/stop.sh if it is a leftover of this demo"
    exit 1
  fi
}
[ "$WITH_GATEWAY" = 1 ] && check_port "$GW_PORT" gateway "$GW_RUNNING"
[ "$WITH_CONSOLE" = 1 ] && check_port "$CONSOLE_PORT" console "$CON_RUNNING"

# ---------------------------------------------------------------- 4. dependencies
ensure_deps() { # dir label
  [ -f "$1/package.json" ] || return 0
  [ -d "$1/node_modules" ] && return 0
  info "installing $2 dependencies (first run, needs the network) ..."
  if ( cd "$1" && npm install --no-audit --no-fund --loglevel=error ) >"$RUN/npm-$2.log" 2>&1; then ok "$2 dependencies installed"; else
    bad "npm install failed for $2 (see $RUN/npm-$2.log)"; tail -n 8 "$RUN/npm-$2.log" | sed 's/^/         /'; exit 1
  fi
}
if [ "$WITH_GATEWAY" = 1 ]; then
  [ -f "$GATEWAY_DIR/server.mjs" ] || { bad "gateway not found at $GATEWAY_DIR"; exit 1; }
  ensure_deps "$GATEWAY_DIR" gateway
  ensure_deps "$REPO/ssh" ssh
  ensure_deps "$REPO/voice" voice
  for d in "$REPO"/integrations/*/; do [ -d "$d" ] && ensure_deps "${d%/}" "$(basename "$d")"; done
fi
if [ "$WITH_CONSOLE" = 1 ]; then
  [ -f "$CONSOLE_DIR/package.json" ] || { bad "console not found at $CONSOLE_DIR (set CLAURA_CONSOLE_DIR)"; exit 1; }
  ensure_deps "$CONSOLE_DIR" console
fi

# ---------------------------------------------------------------- 5. Ollama + Nemotron
if ! curl -fsS -m 3 "$OLLAMA_URL/api/tags" >"$RUN/ollama-tags.json" 2>/dev/null; then
  if [ "$START_OLLAMA" = 1 ]; then
    OLLAMA_BIN=$(command -v ollama || true); [ -x "$HOME/ollama/ollama" ] && OLLAMA_BIN=$HOME/ollama/ollama
    if [ -n "$OLLAMA_BIN" ]; then
      info "starting Ollama ($OLLAMA_BIN serve) ..."
      ( exec nohup "$OLLAMA_BIN" serve ) >"$RUN/ollama.log" 2>&1 < /dev/null &
      echo $! > "$RUN/ollama.pid"
      wait_for 30 curl -fsS -m 2 "$OLLAMA_URL/api/tags" && curl -fsS -m 3 "$OLLAMA_URL/api/tags" >"$RUN/ollama-tags.json" 2>/dev/null
    fi
  fi
fi
if [ -s "$RUN/ollama-tags.json" ]; then
  if grep -q "\"name\":\"$MODEL\"" "$RUN/ollama-tags.json"; then
    ok "Ollama is up and $MODEL is installed"
    if curl -fsS -m 3 "$OLLAMA_URL/api/ps" 2>/dev/null | grep -q "\"name\":\"$MODEL\""; then info "model is loaded in memory (warm)"; else info "model is not in memory yet: the gateway's voice feature warms it (or: ollama run $MODEL ok)"; fi
  else
    warn "Ollama is up but $MODEL is NOT installed. Fix: ollama pull $MODEL   (the agents and Ask Claura need it; --scripted still works)"
  fi
else
  warn "Ollama is not running at $OLLAMA_URL. Fix: ~/ollama/ollama serve   (or rerun with --start-ollama). Live agents and Ask Claura need it; the replay does not"
fi
rm -f "$RUN/ollama-tags.json"

# ---------------------------------------------------------------- 6. console build
if [ "$WITH_CONSOLE" = 1 ] && [ "$CON_RUNNING" = 0 ]; then
  console_up_to_date() {
    [ -f "$CONSOLE_OUT/index.html" ] || return 1
    [ -z "$(find "$CONSOLE_DIR/src" "$CONSOLE_DIR/public" "$CONSOLE_DIR/index.html" "$CONSOLE_DIR/package.json" "$CONSOLE_DIR/vite.config.ts" "$CONSOLE_DIR/tsconfig.json" -newer "$CONSOLE_OUT/index.html" -print -quit 2>/dev/null)" ]
  }
  if [ "$FORCE_BUILD" = 0 ] && [ "$SKIP_BUILD" = 1 ] && [ -f "$CONSOLE_OUT/index.html" ]; then
    ok "console: reusing the last build (--skip-build)"
  elif [ "$FORCE_BUILD" = 0 ] && [ "$SKIP_BUILD" = 1 ] && [ -f "$CONSOLE_DIR/dist/index.html" ]; then
    warn "console: --skip-build and no build of ours yet; serving $CONSOLE_DIR/dist as it is"
    CONSOLE_OUT=$CONSOLE_DIR/dist
  elif [ "$FORCE_BUILD" = 0 ] && console_up_to_date; then
    ok "console build is up to date (demo/.run/console-dist)"
  else
    info "building the console (npm run build in $CONSOLE_DIR, output to demo/.run/console-dist) ..."
    if ( cd "$CONSOLE_DIR" && npm run build -- --outDir "$CONSOLE_OUT" --emptyOutDir ) >"$RUN/console-build.log" 2>&1; then
      ok "console built"
    elif [ -f "$CONSOLE_OUT/index.html" ]; then
      warn "console build failed; serving the previous build from demo/.run/console-dist (see $RUN/console-build.log)"
    elif [ -f "$CONSOLE_DIR/dist/index.html" ]; then
      warn "console build failed; serving the existing $CONSOLE_DIR/dist (may be stale; see $RUN/console-build.log)"
      CONSOLE_OUT=$CONSOLE_DIR/dist
    else
      fail_and_stop "console build failed" "$RUN/console-build.log"
    fi
  fi
fi

# ---------------------------------------------------------------- 7. gateway (+ Secure Shell sshd targets)
if [ "$WITH_GATEWAY" = 1 ]; then
  if [ "$GW_RUNNING" = 1 ]; then
    ok "gateway already running (pid $(pid_of gateway))"
  else
    info "starting the gateway (Secure Shell sshd targets start with it) ..."
    ( cd "$GATEWAY_DIR" && CLAURA_GATEWAY_CONSOLE_ORIGINS="$GW_ORIGINS" exec nohup node server.mjs ) >"$RUN/gateway.log" 2>&1 < /dev/null &
    echo $! > "$RUN/gateway.pid"
    wait_for 90 gateway_ready || fail_and_stop "gateway did not become ready in 90 s" "$RUN/gateway.log"
    ok "gateway ready on http://127.0.0.1:$GW_PORT (pid $(pid_of gateway))"
  fi
  print_features
  if curl -fsS -m 3 "http://127.0.0.1:$GW_PORT/api/health" 2>/dev/null | grep -q '"status":"down"'; then
    warn "a feature is down (see above and $RUN/gateway.log). The gateway keeps serving; the console works without it."
  fi
fi

# ---------------------------------------------------------------- 8. console (vite preview)
if [ "$WITH_CONSOLE" = 1 ]; then
  if [ "$CON_RUNNING" = 1 ]; then
    ok "console already running (pid $(pid_of console))"
  else
    ( cd "$CONSOLE_DIR" && exec nohup node node_modules/vite/bin/vite.js preview --port "$CONSOLE_PORT" --strictPort --host 127.0.0.1 --outDir "$CONSOLE_OUT" ) >"$RUN/console.log" 2>&1 < /dev/null &
    echo $! > "$RUN/console.pid"
    wait_for 30 console_ready || fail_and_stop "console did not answer on port $CONSOLE_PORT in 30 s" "$RUN/console.log"
    ok "console serving on http://localhost:$CONSOLE_PORT (vite preview, pid $(pid_of console))"
  fi
fi

# ---------------------------------------------------------------- 9. backend reachability (informational)
if curl -fsS -m 4 "$MAINCLOUD/v1/ping" >/dev/null 2>&1; then ok "Maincloud reachable: live mode will work"; else warn "Maincloud NOT reachable: use the local appliance (JUDGING.md, fallback 1) or the replay"; fi
if curl -fsS -m 2 "$LOCAL_DB/v1/ping" >/dev/null 2>&1; then ok "local appliance is up on 127.0.0.1:3000 (the offline fallback is ready)"; else info "local appliance is not running; offline fallback: $BACKEND_DIR/scripts/appliance.sh"; fi

echo
echo "Claura demo is up"
GW_QS=; [ "$GW_PORT" != 8787 ] && GW_QS="&gateway=http://localhost:$GW_PORT"   # the console looks for the gateway on :8787 unless told
[ "$WITH_CONSOLE" = 1 ] && {
  echo "  live mode     http://localhost:$CONSOLE_PORT/?live=1$GW_QS"
  echo "  replay demo   http://localhost:$CONSOLE_PORT/?demo=1$GW_QS      idle until you press P (the breach then plays from T+0)"
  echo "                http://localhost:$CONSOLE_PORT/?demo=1&play=1$GW_QS      the same, started at page load: open it at the cue"
}
[ "$WITH_GATEWAY" = 1 ] && echo "  gateway       http://localhost:$GW_PORT/   (status page; /api/health for JSON)"
echo "  live incident $DEMO_DIR/run-incident.sh        (real Nemotron on Maincloud; add --scripted for the backup)"
echo "  stop          $DEMO_DIR/stop.sh"
echo "  logs          $RUN/{gateway,console}.log"
echo "  open the console as http://localhost:$CONSOLE_PORT (not 127.0.0.1): passkeys and the Secure Shell cookie need a hostname"

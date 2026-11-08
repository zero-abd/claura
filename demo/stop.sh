#!/bin/bash
# Stop everything demo/start.sh started, and nothing else. Safe to run twice, safe when nothing is running.
#
#   demo/stop.sh            stop the console, the gateway (which stops its four sshd targets) and Ollama if start.sh started it
#   demo/stop.sh --quiet    same, with one summary line
#
# It works from the pid files in demo/.run/, but only kills a pid whose command line still looks like ours (a recycled pid is
# left alone). Afterwards it sweeps leftover Secure Shell sshd targets of the default data dir, and checks that the ports are free.
set -uo pipefail

DEMO_DIR=$(cd "$(dirname "$0")" && pwd)
RUN=$DEMO_DIR/.run
GW_PORT=${CLAURA_GATEWAY_PORT:-8787}
CONSOLE_PORT=${CLAURA_CONSOLE_PORT:-4317}
SSH_RUN_DIR=$HOME/.config/claura/ssh-data/run/targets/
QUIET=0
for a in "$@"; do
  case "$a" in
    --quiet|-q) QUIET=1 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else G=; Y=; R=; N=; fi
say()  { [ "$QUIET" = 1 ] || printf '%s\n' "$*"; }
ok()   { [ "$QUIET" = 1 ] || printf '%s[ ok ]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$Y" "$N" "$*" >&2; }
bad()  { printf '%s[FAIL]%s %s\n' "$R" "$N" "$*" >&2; }

alive()    { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
cmd_of()   { ps -p "$1" -o command= 2>/dev/null; }
listener() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }
STOPPED=0; LEFT=0

# terminate <pid> <seconds>: SIGTERM, wait, then SIGKILL
terminate() {
  local pid=$1 secs=$2 i=0
  kill -TERM "$pid" 2>/dev/null
  while alive "$pid" && [ "$i" -lt $((secs * 5)) ]; do sleep 0.2; i=$((i + 1)); done
  if alive "$pid"; then kill -KILL "$pid" 2>/dev/null; sleep 0.3; fi
  ! alive "$pid"
}

# stop_named <name> <pattern-the-command-must-match> <seconds>
stop_named() {
  local name=$1 pattern=$2 secs=$3 pid
  if [ ! -f "$RUN/$name.pid" ]; then say "       $name: no pid file"; return 0; fi
  pid=$(tr -dc '0-9' < "$RUN/$name.pid")
  if ! alive "$pid"; then ok "$name: not running (stale pid file removed)"; rm -f "$RUN/$name.pid"; return 0; fi
  if ! cmd_of "$pid" | grep -q -- "$pattern"; then
    warn "$name: pid $pid is not ours any more ($(cmd_of "$pid" | cut -c1-70)); leaving it alone"
    rm -f "$RUN/$name.pid"; return 0
  fi
  if terminate "$pid" "$secs"; then ok "$name: stopped (pid $pid)"; STOPPED=$((STOPPED + 1)); rm -f "$RUN/$name.pid"
  else bad "$name: pid $pid would not die"; LEFT=$((LEFT + 1)); fi
}

# order matters: console first, then the gateway (its shutdown stops the sshd targets), then Ollama
stop_named console 'vite.js preview' 8
stop_named gateway 'server.mjs' 15
stop_named ollama 'ollama' 8

# belt and braces: a listener on our ports whose command line is unmistakably ours (pid file lost)
sweep_port() { # port pattern label
  local pid; pid=$(listener "$1")
  [ -z "$pid" ] && return 0
  if cmd_of "$pid" | grep -q -- "$2"; then
    if terminate "$pid" 8; then ok "$3: stopped a leftover on port $1 (pid $pid)"; STOPPED=$((STOPPED + 1)); else bad "$3: leftover on port $1 (pid $pid) would not die"; LEFT=$((LEFT + 1)); fi
  else
    warn "port $1 is held by pid $pid ($(cmd_of "$pid" | cut -c1-70)), which is not part of this demo; leaving it"
  fi
}
sweep_port "$GW_PORT" 'server.mjs' gateway
sweep_port "$CONSOLE_PORT" 'vite.js preview' console

# Secure Shell sshd targets that outlived the gateway (only those of the default data dir; another run's data dir is not ours)
for pid in $(ps -axo pid=,command= | grep -F "sshd -D -e -f ${SSH_RUN_DIR}" | grep -v grep | awk '{print $1}'); do
  if terminate "$pid" 5; then ok "ssh: stopped a leftover sshd target (pid $pid)"; STOPPED=$((STOPPED + 1)); else bad "ssh: sshd target pid $pid would not die"; LEFT=$((LEFT + 1)); fi
done

# verify
for spec in "$GW_PORT:gateway" "$CONSOLE_PORT:console"; do
  port=${spec%%:*}; name=${spec##*:}
  owner=$(listener "$port")
  if [ -n "$owner" ]; then
    # ours would have been swept above; anything left is somebody else's, which is reported but is not a failure of this script
    say "       port $port ($name) is held by pid $owner, not started by this demo"
  fi
done
MINE=$(ps -axo pid=,command= | grep -F "sshd -D -e -f ${SSH_RUN_DIR}" | grep -v grep | wc -l | tr -d ' ')
[ "$MINE" = 0 ] || { bad "$MINE Secure Shell sshd target(s) of this demo are still running"; LEFT=$((LEFT + 1)); }

if [ "$LEFT" = 0 ]; then
  [ "$QUIET" = 1 ] || printf '%sAll stopped%s (%s process(es) ended this run). Nothing of the demo is running.\n' "$G" "$N" "$STOPPED"
  exit 0
fi
bad "$LEFT process(es) of the demo are still running"
exit 1

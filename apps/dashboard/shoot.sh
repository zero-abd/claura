#!/bin/bash
# Usage: ./shoot.sh [port]  -> screenshots of every view and incident phase into shots/ (1728x1080 CSS px, DPR 2).
# Needs the app on the port (npm run dev, or npm run build && npm run preview). ?demo=1 hides the dev dock.
PORT=${1:-4317}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p shots
shoot() { # name  query
  "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1728,1080 --virtual-time-budget=6000 \
    --screenshot="$PWD/shots/$1.png" "http://localhost:$PORT/?demo=1&$2" >/dev/null 2>&1
  echo "shots/$1.png"
}
shoot overview            "view=overview"
shoot incident-breach     "view=incident&phase=breach"
shoot incident-approval   "view=incident&phase=approval"
shoot incident-contained  "view=incident&phase=contained"
shoot agents              "view=agents&phase=breach"
shoot agents-expanded     "view=agents&phase=breach&expand=agent:warden"
shoot policy              "view=policy"
shoot report              "phase=report"
shoot warroom             "view=warroom&phase=contained"
shoot warroom-exec        "view=warroom&t=5.2&channel=exec&expand=tasks,decisions"
shoot host-sheet          "view=incident&phase=breach&host=b14-gpu-07"
shoot shells              "view=shells"

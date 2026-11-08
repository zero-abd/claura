#!/bin/bash
# Usage: ./shoot.sh [port]  -> screenshots of every phase into shots/
PORT=${1:-4317}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p shots
for p in nominal breach approval contained report; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1728,1080 --virtual-time-budget=4000 \
    --screenshot="$PWD/shots/$p.png" "http://localhost:$PORT/?phase=$p" >/dev/null 2>&1
  echo "shots/$p.png"
done

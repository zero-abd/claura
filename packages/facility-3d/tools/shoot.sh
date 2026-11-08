#!/bin/zsh
# Headless Chrome screenshot of a URL path on the local server (port 4319). Prints page console output.
# usage: tools/shoot.sh "<path?query>" out.png [width height dpr]
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URLPATH="$1"; OUT="$2"; W="${3:-1728}"; H="${4:-1080}"; D="${5:-2}"
UD=$(mktemp -d "${TMPDIR:-/tmp}/bh3d-chrome.XXXXXX")
"$CH" --headless=new --user-data-dir="$UD" --enable-logging=stderr --v=0 --screenshot="$OUT" \
  --window-size=$W,$H --force-device-scale-factor=$D --use-angle=metal --enable-gpu --hide-scrollbars \
  --virtual-time-budget=4000 --run-all-compositor-stages-before-draw \
  "http://127.0.0.1:4319/$URLPATH" 2>&1 | grep -E "CONSOLE" | sed -E 's/^.*CONSOLE:[0-9]+\] //' | head -8
rm -rf "$UD"

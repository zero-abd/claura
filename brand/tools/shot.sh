#!/bin/bash
# usage: shot.sh <html> <png> <w> <h> [scale] [transparent]
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BG=""
[ "$6" = "transparent" ] && BG="--default-background-color=00000000"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
  --user-data-dir=/Users/abd/repos/claura-brand/tools/.chrome $BG \
  --virtual-time-budget=4000 --screenshot="$2" --window-size="$3,$4" --force-device-scale-factor="${5:-2}" "file://$1" >/dev/null 2>&1

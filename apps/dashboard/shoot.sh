#!/bin/bash
# Usage: ./shoot.sh [port] [name,name,...]
# Screenshots of every view and incident phase into shots/ (1728x1080 CSS px, DPR 2 = 3456x2160), with WebGL on, so the
# real 3D facility renders. Needs the app on the port (npm run dev, or npm run build && npm run preview).
# tools/shoot.mjs drives its own headless Chrome (own profile dir, loopback only, killed on exit) over the DevTools
# protocol, waits for the 3D stage to mount, and settles before each capture. ?demo=1 hides the dev dock.
# Extra: node tools/shoot.mjs --list | --only a,b | --url "view=scope" --eval "js" --snap file.png --clip x,y,w,h
#        node tools/shoot.mjs --url "phase=report&expand=rs:evidence" --eval 1 --pdf shots/report.pdf [--pages 2]
cd "$(dirname "$0")"
unset NODE_USE_SYSTEM_CA
ARGS=(--port "${1:-4317}")
[ -n "$2" ] && ARGS+=(--only "$2")
exec node tools/shoot.mjs "${ARGS[@]}"

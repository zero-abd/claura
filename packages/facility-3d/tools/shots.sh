#!/bin/zsh
# usage: tools/shots.sh outdir "look state t cam" ...   e.g. tools/shots.sh shots "iso breach 3.2 facility"
OUT="$1"; shift
mkdir -p "$OUT"
for spec in "$@"; do
  set -- ${=spec}
  look=$1; state=$2; t=$3; cam=$4
  /Users/abd/repos/bulkhead-3d/tools/shoot.sh "film.html?look=$look&state=$state&t=$t&cam=$cam" "$OUT/$look-$state-$cam.png"
done

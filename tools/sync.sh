#!/bin/sh
# Snapshot every Claura component into this monorepo (the component folders are where work happens).
set -e
R="$HOME/repos"
M="$R/claura"
X="--exclude node_modules --exclude dist --exclude build --exclude .venv* --exclude .hyperframes --exclude .scratch --exclude .DS_Store --exclude .env* --exclude *.token* --exclude out --exclude renders"
sync() { [ -d "$1" ] || return 0; mkdir -p "$2"; eval rsync -a --delete $X $3 "\"$1/\"" "\"$2/\""; }
sync "$R/bulkhead"          "$M/apps/dashboard"      "--exclude docs"
sync "$R/bulkhead-site"     "$M/apps/site"           "--exclude shots"
sync "$R/bulkhead-3d"       "$M/packages/facility-3d" ""
sync "$R/claura-backend"    "$M/backend"             ""
sync "$R/claura-brand"      "$M/brand"               ""
sync "$R/bulkhead-film"     "$M/film"                "--exclude assets/clips --exclude assets/clips-orig --exclude assets/shots --exclude .backup-v1-color --exclude .hyperframes-check.json --exclude .hyperframes-check.log --exclude docs/hyperframes-skills"
sync "$R/bulkhead/docs"     "$M/docs"                ""
# secret scan: refuse to continue if anything key-shaped is present
if grep -rEl "sk_[a-f0-9]{30,}|gho_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xi-api-key: [A-Za-z0-9]|nvapi-[A-Za-z0-9]{20,}|BEGIN (OPENSSH|RSA|EC) PRIVATE KEY" "$M" --exclude-dir=node_modules --exclude-dir=.git --exclude=sync.sh 2>/dev/null; then
  echo "SECRET-LIKE STRING FOUND: not pushing" >&2; exit 3
fi
du -sh "$M" --exclude=.git 2>/dev/null || du -sh "$M"

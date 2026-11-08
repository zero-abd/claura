#!/bin/sh
# Runs `hyperframes check --json` quietly and prints the findings that matter.
unset NODE_USE_SYSTEM_CA
export PATH="$PWD/tools/bin:$HOME/repos/bulkhead-studio/bin:$PATH" DO_NOT_TRACK=1
npx --yes hyperframes@0.9.23 check --json > .hyperframes-check.json 2> .hyperframes-check.log
"$HOME/repos/bulkhead-studio/.venv/bin/python" - <<'PY'
import json
raw = open('.hyperframes-check.json').read()
d = json.loads(raw[raw.index('{'):])
def items(x):
    if isinstance(x, dict):
        if 'severity' in x and ('code' in x or 'rule' in x or 'message' in x):
            yield x
        for v in x.values(): yield from items(v)
    elif isinstance(x, list):
        for v in x: yield from items(v)
seen = set()
for f in items(d):
    k = (f.get('severity'), f.get('code') or f.get('rule'), (f.get('message') or '')[:120])
    if k in seen: continue
    seen.add(k)
    print(f"{f.get('severity')}\t{f.get('code') or f.get('rule')}\t{(f.get('message') or '')[:220]}\t{f.get('file') or ''} {f.get('selector') or ''}")
print('ok' if d.get('ok') else 'NOT ok', {k: v for k, v in d.items() if isinstance(v, (int, str, bool))})
PY

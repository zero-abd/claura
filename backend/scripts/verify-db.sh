#!/bin/bash
# Print the final state of the local `claura` database after a run.
# Read-only: only SELECTs, always against the LOCAL server (never maincloud).
#
#   scripts/verify-db.sh                 # prints to stdout
#   scripts/verify-db.sh > runs/x.txt    # save it
#
# The SpacetimeDB SQL endpoint has no ORDER BY, GROUP BY or IN (...), so rows come back
# in storage order; this script sorts them by their first column (the id) for reading.

S=${SPACETIME:-/Users/abd/.local/bin/spacetime}
DB=${STDB_DB:-claura}

q() { # title, sql
  echo "-- $1"
  echo "   $2"
  "$S" sql --server local "$DB" "$2" 2>&1 \
    | grep -v '^WARNING' \
    | awk 'NR<=3 { print; next } { print | "sort -n" } END { close("sort -n") }'
  echo
}

echo "== Claura database state: $DB on local SpacetimeDB ($(date '+%Y-%m-%d %H:%M:%S %Z'))"
echo
q "incident (status, blast_score, contained_at is Some(..) once contained)" \
  "SELECT id, title, severity, host, vm, status, blast_score, opened_at, contained_at FROM incident"
q "proposal (what the policy gate decided; the model never decides)" \
  "SELECT id, incident_id, agent, action, target, status, policy_mode, decided_by, reason FROM proposal"
q "finding (Triage attack graph)" \
  "SELECT id, incident_id, agent, kind, text FROM finding"
q "incident_event (the ship's log; incident_id 0 = not tied to an incident)" \
  "SELECT id, incident_id, kind, actor, text FROM incident_event"
q "report (Scribe)" \
  "SELECT incident_id, summary, filed_at FROM report"
q "host rows that are not healthy" \
  "SELECT host, hall, rack, status FROM host WHERE status <> 'healthy'"
q "guest_vm rows that are not running (11 failed over to hall C, the suspect VM paused)" \
  "SELECT vm, host, workload, status, moved_to FROM guest_vm WHERE status <> 'running'"
q "agent_state" \
  "SELECT agent, status, model, thought FROM agent_state"
q "policy" \
  "SELECT action, mode, reversible FROM policy"
q "signal (telemetry replayed into the module)" \
  "SELECT id, source, message, host, vm FROM signal"

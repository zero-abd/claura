#!/bin/bash
# Print the final state of the Claura database after a run, as the database OWNER (the spacetime CLI identity,
# an admin, so every view returns all rows). Read-only: only SELECTs. Enrollment codes are never selected.
#
#   scripts/verify-db.sh                  # Maincloud profile (~/.config/claura/.env)
#   scripts/verify-db.sh --local          # isolated appliance (~/.config/claura/local.env)
#   scripts/verify-db.sh > runs/x.txt     # save it
#
# The SpacetimeDB SQL endpoint has no ORDER BY, GROUP BY or IN (...), so rows come back in storage order;
# this script sorts them by their first column (the id) for reading.

S=${SPACETIME:-/Users/abd/.local/bin/spacetime}
ENVF=${CLAURA_ENV_FILE:-$HOME/.config/claura/.env}
[ "${1:-}" = "--local" ] && ENVF=${CLAURA_ENV_FILE:-$HOME/.config/claura/local.env}
getvar() { grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'"; }
URI=$(getvar CLAURA_STDB_URI); URI=${URI:-ws://127.0.0.1:3000}
DB=${STDB_DB:-$(getvar CLAURA_STDB_DB)}; DB=${DB:-claura}
case "$URI" in *maincloud*) SERVER=maincloud ;; *) SERVER=local ;; esac

q() { # title, sql
  echo "-- $1"
  echo "   $2"
  "$S" sql --server "$SERVER" "$DB" "$2" 2>&1 \
    | grep -v '^WARNING' \
    | awk 'NR<=3 { print; next } { print | "sort -n" } END { close("sort -n") }'
  echo
}

echo "== Claura database state: $DB on $SERVER ($URI) at $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo
q "operator (who has access; revoked rows stay for the audit trail)" \
  "SELECT name, role, added_by, active FROM operator"
q "enrollment (single-use codes; the code column is deliberately NOT selected)" \
  "SELECT role, name_hint, created_by, used_by FROM enrollment"
q "stakeholder (display-only roster, not identities)" \
  "SELECT name, role, initials, title, verified_out_of_band FROM stakeholder"
q "incident (status, NIST SP 800-61 fields, blast_score; contained_at is Some(..) once contained)" \
  "SELECT id, title, severity, host, vm, status, nist_phase, blast_score, category, functional_impact, information_impact, recoverability, opened_at, contained_at FROM incident"
q "proposal (what the policy gate decided; the model never decides)" \
  "SELECT id, incident_id, agent, action, target, status, policy_mode, decided_by, reason FROM proposal"
q "data_asset (scope: what was touched, locked, exfiltrated, preserved)" \
  "SELECT id, incident_id, name, classification, records, status, updated_by, note FROM data_asset"
q "task" \
  "SELECT id, incident_id, title, owner_role, status FROM task"
q "decision (decisions of record)" \
  "SELECT id, incident_id, by_name, text FROM decision"
q "brief (plain-language stakeholder brief; incident 0 is the quiet-state brief)" \
  "SELECT incident_id, author, text, known, unknown FROM brief"
q "message (war room; incident 0 = the standing room)" \
  "SELECT id, incident_id, channel, author_name, author_role, kind, text FROM message"
q "finding (Triage attack graph)" \
  "SELECT id, incident_id, agent, kind, text FROM finding"
q "incident_event (the audit log; incident_id 0 = not tied to an incident)" \
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

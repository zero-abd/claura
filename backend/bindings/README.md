# Claura client bindings (TypeScript)

A clean copy of the generated SpacetimeDB bindings for the **dashboard** (`bindings/ts`). Same module as
`../agents/src/module_bindings`, but imports have no `.ts` extension so Vite and other bundlers resolve them.
Needs `spacetimedb@2.14.x` in the client app. Regenerate after any module change:

```bash
unset NODE_USE_SYSTEM_CA
/Users/abd/.local/bin/spacetime generate --lang typescript -y \
  --module-path /Users/abd/repos/claura-backend/spacetime/spacetimedb \
  --out-dir /Users/abd/repos/claura-backend/bindings/ts
```

## Backend

| | |
|---|---|
| Maincloud | database `claura`, `wss://maincloud.spacetimedb.com` |
| Isolated appliance | database `claura`, `ws://127.0.0.1:3000` (see `../DEMO.md`) |

## What the client must know

Every table is private; the client reads **gated views** that keep the old table names, so
`conn.db.incident`, `conn.db.guestVm`, `conn.db.dataAsset` and `subscribeToAllTables()` work as before. A connection that
is not an enrolled operator receives zero rows. Rows appear (and disappear, on revoke) **live**, no reconnect needed.

```ts
import { DbConnection } from './bindings/ts';            // adjust the path

const TOKEN_KEY = 'claura.token';                          // browser storage is per-viewer; the token is a bearer credential
const conn = DbConnection.builder()
  .withUri('wss://maincloud.spacetimedb.com')
  .withDatabaseName('claura')
  .withToken(localStorage.getItem(TOKEN_KEY) ?? undefined)
  .onConnect((c, identity, token) => {
    localStorage.setItem(TOKEN_KEY, token);                // same token next time = same operator
    c.subscriptionBuilder().onApplied(() => render()).subscribeToAllTables();
    // Who am I? The operator view returns my own row if (and only if) I am enrolled and active.
    // No row  ->  show a "Join" screen: a field for the one-time code and a name, plus identity.toHexString()
    //             to read out to an admin (add_operator). Join with:
    //             c.reducers.enroll({ code, name });       // the admin's name_hint on the code wins over `name`
  })
  .build();
```

- **Sign-in states.** `conn.db.operator` has a row with `identity == mine && active` -> signed in (role in `row.role`). A row with
  `active == false` -> revoked, show "access revoked". No row -> not enrolled.
- **Roles decide what arrives** (`../spacetime/README.md`): a commander gets everything; legal/exec/comms get the plain-language layer;
  a vendor gets only `#vendors`. Do not build screens that assume a table has rows for every role.
- **Writes.** `postMessage({ incidentId, channel, text })` (use `incidentId: 0n` before an incident exists), `addTask`,
  `setTaskStatus`, `setAssetStatus`, `setBrief`, `recordDecision`, `setPolicy`, `approve({ proposalId, operator })` (the `operator`
  argument is ignored: the approver is whoever is signed in; pass `''`). Admin only: `issueEnrollment`, `addOperator`,
  `revokeOperator`, `revokeEnrollment`, `resetDemo`. Errors arrive as a rejected promise with a readable message.
- **Codes.** Generate an enrollment code with `crypto.getRandomValues` (at least 80 bits, 12 to 64 chars of `A-Za-z0-9_-`) in the
  admin screen, call `issueEnrollment({ code, role, nameHint })`, and show the code once; the `enrollment` view (admin only) lists
  codes and who used them.
- **Message shapes the agents produce.** `kind: 'agent'` with `authorName` `sentry`/`triage`/`warden`/`scribe`; `kind: 'system'` quiet lines
  (author `scribe`); `kind: 'human'` with the operator's name and role. The shift handoff starts with `SHIFT HANDOFF`.
- **Demo console.** `CLAURA_CONSOLE_CODE` in `~/.config/claura/.env` is a one-time `commander` code whose name is "Riya Kapoor" (the
  stakeholder "RK", Incident Commander). It works once; after that the browser's stored token is the identity. A commander cannot add
  people: for the admin screen issue an admin code with `../scripts/access.sh code admin "<name>"`.

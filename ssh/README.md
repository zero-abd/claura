# Claura Secure Shell

**Click a host. Get a short-lived SSH certificate, a recorded terminal in the browser, and nothing to steal.**

When an incident is live and the attacker may already be inside the network, the usual way into a machine (a shared
key, a bastion password, a VPN account) is the thing they will use against you. Secure Shell has no standing
credential at all. A person asks for access to one host; Claura checks the policy (a passkey touch by the requester,
a second person who approves, a written reason); only then does the Claura CA sign an OpenSSH user certificate that
is valid for minutes, names one person, one host and one role, and dies on its own. The session runs through a real
OpenSSH client against a real `sshd`, is recorded, and is written into a hash-chained log.

```
 browser (xterm.js)                gateway (server.mjs)                       target host (real sshd)
 ──────────────────      ───────────────────────────────────────      ───────────────────────────────────
  request + reason  ──▶  policy for this host (server decides)
  passkey (WebAuthn) ─▶  challenge bound to THIS request
  approver clicks    ─▶  approver ≠ requester, holds approver role
                          ssh-keygen -s user_ca … -I "jt|req_…"        TrustedUserCAKeys   (CA public key only)
                          -n forensics@b14-gpu-07 -V -5s:+600s         AuthorizedPrincipalsFile
                          -O no-port/agent/x11-forwarding,no-user-rc   AuthorizedKeysFile none, no passwords
                          -O source-address=gateway  -z <unique>       RevokedKeys  (KRL, checked every login)
  WebSocket  ◀──────────▶ /usr/bin/ssh -tt  ─────────────────────────▶ ForceCommand = host shell (simulated)
  (keystrokes ↔ output)    StrictHostKeyChecking=yes                    reads the certificate it was let in with
                           known_hosts = one "@cert-authority" line     and fails closed if anything is off
                          asciicast v2 recording ─▶ SHA-256 ─▶ chain ─▶ ledger (hash-chained, mirrored to the incident log)
                          kill the session when the certificate expires
```

## The 20-second demo

1. `node dev.mjs`, then open **http://localhost:8801** (use `localhost`, not `127.0.0.1`: passkeys need a hostname).
2. Click **Open secure shell** on `b14-gpu-07` (the suspect host). The sheet shows the policy as chips and the
   reason is already filled in. Press **⌘↵**. *"Nothing exists yet. No key, no certificate."* (4 s)
3. Touch ID. First run enrolls a passkey with the same touch. *"Proof a person is at the keyboard, bound to this one
   request."* (3 s)
4. **Waiting for an approver** lists what is still missing. Click **Approve as Incident Commander (RK)**.
   *"The requester can never approve their own request."* (3 s)
5. The terminal opens. Header: `b14-gpu-07 · forensics@b14-gpu-07 · ● Recording · cert expires 09:58 · read-only
   forensic`. Type `hostname`, `dmesg | tail -3`, `virsh list --all`, then `rm -rf /`:
   `denied by Claura policy: forensic read-only session`. (7 s)
6. **End session**. *Session sealed*: the recording's SHA-256, the ledger entry it is chained to, and a green
   **Audit chain intact** (both chains recomputed from disk). The Cradle's orb turns green. (3 s)

Also try: `http://localhost:8801/#slot` (the flow mounted into the console's `#claura-shell-slot` panel),
`window.claura.openShell('mgmt-bmc-01')` from the DevTools console, and `DEMO_TTL_SECONDS=20 node dev.mjs`: every
certificate then lasts 20 seconds, so you can watch the countdown turn orange and the session close by itself
(the host shell enforces the same deadline, not only the gateway).

## Run it

```
npm install                       # once (node >= 20, OpenSSH client and server from macOS)
node dev.mjs                      # demo page on http://localhost:8801, four sshd targets on 127.0.0.1:2201-2204
node smoke.mjs                    # end-to-end test against real OpenSSH (92 checks, ~9 s)
node shots.mjs                    # drives the UI in headless Chrome with a virtual authenticator, writes ./shots/*.png (29 checks, ~40 s)
```

No sudo, no change to the system `sshd_config`, macOS Remote Login stays off: each target is a user-space `sshd -D -e
-f <generated config>` bound to `127.0.0.1`, running as you. Ctrl+C stops the page, the gateway and all four targets.

## Security model

Assume the attacker already owns the internal network and most internal systems. Then:

| Principle | How it is done here |
|---|---|
| **No standing credentials** | Targets have no `authorized_keys` (`AuthorizedKeysFile none`), no passwords, no static keys to find. They trust one thing: the user CA's *public* key. |
| **Short lived** | Certificate lifetime is at most 15 minutes, the requester picks 5/10/15. The gateway kills the session at expiry and the host shell enforces the same time itself. |
| **Least privilege by construction** | One principal per certificate, chosen by policy (`forensics@b14-gpu-07` or `operator@c05-gpu-02`), listed in that host's `AuthorizedPrincipalsFile`. A certificate for one host is refused by every other (tested). |
| **Two-person rule** | The requester can never approve. An approver needs the `approver` role. Raise `POLICY_CLASSES.suspect.approvals` in `lib/hosts.mjs` to 2 for a three-person rule. |
| **Proof of presence on risky hosts** | Suspect, quarantined and management hosts need a WebAuthn passkey assertion with **user verification**, from the requester, with a fresh server challenge bound to that request. The certificate does not exist until passkey and approval are both done. |
| **The server decides** | The browser asks. Host status, policy, principal, lifetime and who may approve are computed on the server. The browser never holds a key or a certificate. |
| **Defence in depth on the host** | `sshd` checks the CA signature, validity, principal and revocation list. The host shell then re-reads the certificate through `ExposeAuthInfo` and fails closed (wrong host, wrong principal, expired, odd identity). |
| **Forensic hosts stay forensic** | The suspect host only accepts `forensics@…`, a read-only shell. Anything that mutates state is denied *and recorded*. |
| **Evidence you can prove** | Every keystroke and output is recorded (asciicast v2). Each recording's SHA-256 goes into the ledger; recordings are also chained to each other; the ledger is a SHA-256 hash chain mirrored to the incident log (`ctx.ledger`). `GET /api/ssh/ledger/verify` recomputes everything from disk. |
| **Revocation** | One call (`POST /revoke`, incident commander) kills the live session, lists the serial and key id on the KRL, and the host refuses that certificate from then on (tested with real `ssh`). |
| **Browser-facing hardening** | JSON-only POSTs, `Origin` checks on every write and on the WebSocket handshake (CSRF, cross-site WebSocket hijacking), a `Host` allowlist (DNS rebinding), request secret in an `HttpOnly; SameSite=Strict` cookie scoped to `/api/ssh` (never in a URL), no CORS unless configured, `no-store`, `nosniff`, no framing. |
| **No shell injection, ever** | Every external process is `execFile` with an argument array; every id, host, operator, principal and number is validated against a strict pattern first; recordings are served by a validated id with a realpath check; vendored files by an allowlist. |
| **Console identity** | `ctx.ssh.identity(req)` takes the person from the console session (SSO + passkey). With it, the request body can never claim an identity (tested). Without it, the demo directory in `lib/hosts.mjs` is used and the page says so. |

Certificate options: `-I "<operator>|<requestId>"`, `-n <principal>`, `-V -5s:+<ttl>s` (an explicit window: a bare `+10m`
makes `ssh-keygen` round the start down by up to two minutes), `-z <unique serial>`, `-O no-port-forwarding -O
no-agent-forwarding -O no-x11-forwarding -O no-user-rc -O source-address=<gateway>`. Only `permit-pty` is granted.

`sshd` per target: `AuthenticationMethods publickey`, `PubkeyAcceptedAlgorithms ssh-ed25519-cert-v01@openssh.com`,
`PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowTcpForwarding no`, `AllowAgentForwarding no`,
`X11Forwarding no`, `PermitTunnel no`, `PermitUserEnvironment no`, `PermitUserRC no`, `MaxSessions 1`,
`LoginGraceTime 10`, `ListenAddress 127.0.0.1`, `RevokedKeys`, `ForceCommand`.

OpenSSH client per session: `-F /dev/null -tt`, `StrictHostKeyChecking=yes`, a one-line `known_hosts`
(`@cert-authority <alias> <host CA key>`), `HostKeyAlias=<host id>`, `HostKeyAlgorithms=…cert…`, `IdentitiesOnly`,
`IdentityAgent=none`, `ClearAllForwardings=yes`, `EscapeChar=none` (no `~C` to add a forward), `BatchMode=yes`.

## What is real and what is simulated

| | |
|---|---|
| **Real** | The user CA and the host CA (ed25519, `/usr/bin/ssh-keygen`, in `~/.config/claura/ssh-ca`, directory 0700, keys 0600, never in the repo). The certificates. Four OpenSSH `sshd` processes with certificate-only authentication, principals and a revocation list. The OpenSSH client with strict host-certificate checking. WebAuthn passkeys (`@simplewebauthn`; Touch ID, or a DevTools virtual authenticator in the tests). The recordings and both hash chains. Expiry and revocation. |
| **Simulated** | The four "hosts" are the same machine. What runs behind the `sshd` `ForceCommand` is a Node program (`hostshell/`) that prints incident-consistent output for INC-0419: IOMMU faults in `dmesg`, `ps` with qemu pid 2231 and its `/bin/sh` child, `virsh`, `ip -br link`, `nvidia-smi`, `journalctl -u qemu`, the sealed evidence and its `sha256sum`. It has a virtual file system and never runs a real command. The access control around it (certificate, principal, revocation, policy denials) is real. |
| **Demo data** | The people directory (JT, AL, RK) and their roles, the *Approve as Incident Commander (RK)* button (`ctx.ssh.demo = false` removes it), first-use passkey enrolment. |

## Threat model

| Attacker has… | They try… | What stops it | What is left |
|---|---|---|---|
| Root on a target host | Find a key or password to pivot | Nothing to find: no `authorized_keys`, no passwords, only the CA *public* key. No agent or port forwarding can be requested. | Root on a host can impersonate *that* host to clients with its host certificate until it is rotated (90 days here, shorter in production) or revoked. |
| A copy of a user certificate | Replay it | Valid ≤ 15 min, one principal on one host, bound to the gateway's source address, unique serial, KRL checked by `sshd` at every login, and the private key never leaves the gateway. The approval is single use. | The window until expiry or revocation, from the gateway address. |
| A hijacked console session (XSS, stolen browser session) | Request a shell and use it | The requester's passkey with user verification, a second person who is not the requester, `HttpOnly` request cookie, Origin and Host checks. | Malware that waits for the real person's touch and rides a request they started. The approver sees host and reason. |
| The ability to call the API | Say "I am RK" | With `ctx.ssh.identity` the identity comes from the console session and the body field is ignored. | The **demo build trusts the claimed id**; keep it on localhost. Approver passkeys are not in this build. |
| A network path between gateway and host | Man-in-the-middle, impersonate a host | `StrictHostKeyChecking=yes` against a host-CA-only `known_hosts` with `HostKeyAlias`. Tested: host 05 cannot pass for host 12. | None material. |
| A page in the operator's browser | CSRF, cross-site WebSocket, DNS rebinding | JSON-only writes, `Origin` and `Host` checks, `SameSite=Strict` cookie, WebSocket needs the request cookie. | None known. |
| Write access to the logs | Rewrite history | Hash-chained ledger, per-recording SHA-256, chain over recordings, verification endpoint, mirror to the incident log. | If the attacker can rewrite both the data directory and the mirror, history can be rewritten unless the head hash is anchored somewhere they cannot reach (print it on the war-room screen). |
| A granted session | Escape the shell, tunnel, scp | No forwarding anywhere, `ForceCommand`, no `~C`, read-only principal on the suspect host. | The host shell here is a simulator; a real deployment needs a real restricted shell with the same policy. |
| The gateway host | Mint certificates | CA private keys are 0600 in a 0700 directory outside the repo, user CA and host CA are separate, every issuance is in the ledger. | **This is the crown jewel.** In production the CA key belongs in an HSM or KMS behind a signing service. The ephemeral session key sits in a 0700 directory for the length of a session and is wiped at the end and at start-up. |
| Patience | Exhaust the service | Caps on open requests (8 per person, 300 total), `sshd` `MaxStartups`, `LoginGraceTime`, `MaxSessions`. | No per-IP rate limiting. |

Known limits, said plainly: recordings include what the operator types (full fidelity for forensics; production
should redact input while echo is off); recordings are not encrypted at rest; passkey enrolment is first use (production
enrols through admin onboarding); one OS user runs everything, so the sshd targets all authenticate as that user.

## Using it from the console

```js
import { mount } from './ssh/server.mjs';
const ssh = mount(app, {
  env, log,                                   // optional
  ledger,                                     // optional: { append(entry) }, every chained entry is mirrored into the incident log
  hostStatus: (id) => 'quarantined',          // optional: policy follows the incident (healthy | suspect | cordoned | quarantined)
  ssh: {
    origins: ['http://localhost:4317'],       // pages allowed to call the API (same origin is always allowed)
    identity: (req) => ({ id: 'jt', roles: ['operator'] }),   // the console's signed-in person; omit for the demo directory
    // base '/api/ssh', dataDir, caDir, portBase 2201, rpID, attachment 'platform', demo, openRecordings, sourceAddress, corsOrigins
  },
});
ssh.attach(httpServer);                       // not needed when you use app.listen()
await ssh.stop();                             // ends sessions, stops the sshd targets, wipes ephemeral keys
```

`mount` returns `{ ready, attach, stop, setHostStatus(id, status), ca, targets, ledger, requests, sessions, krl, passkeys }`.
Proxy `/api/ssh` (with `ws: true`) from the console's dev server, or list the console's origin in `origins`; load the
browser module once and the console's host sheet button works:

```html
<script type="module" src="/api/ssh/ui.js"></script>   <!-- defines window.claura.openShell if nobody else has -->
```

```js
import { openShell, mountUI, mountTerminal } from '/api/ssh/ui.js';
openShell('b14-gpu-07');                      // sheet flow; mounts into #claura-shell-slot when it is on screen, else an overlay
mountUI(el);                                  // host list, approvals inbox, recent sessions with recording hashes
mountTerminal(el, requestId);                 // just the terminal for an already approved request
```

Routes (base `/api/ssh`): `GET /hosts`, `POST /request`, `GET /request/:id`, `GET /requests`,
`POST /request/:id/passkey/options|verify`, `POST /request/:id/cancel`, `POST /approve`, `POST /deny`, `POST /revoke`,
`WS /session?requestId=`, `GET /sessions`, `GET /recording/:id`, `GET /ledger`, `GET /ledger/verify`, `GET /ui.js`,
`GET /vendor/*`. Data (ledger, recordings, passkey public keys) lives in `~/.config/claura/ssh-data` (`CLAURA_SSH_DATA`).

## Files

| | |
|---|---|
| `server.mjs` | `mount(app, ctx)`: routes, WebSocket bridge, vendored assets, lifecycle |
| `ui.js` | Browser module: `openShell`, `mountUI`, `mountTerminal`, Liquid Glass styling, no build step |
| `dev.mjs` | Demo page on port 8801 |
| `smoke.mjs` | End-to-end test: 92 checks against real OpenSSH, uses `DEMO_SKIP_PASSKEY` (and only here) |
| `shots.mjs` | Browser flow in own headless Chrome with a virtual WebAuthn authenticator, writes `shots/` |
| `lib/ca.mjs` · `sshcert.mjs` | CA, certificate issuing, KRL · OpenSSH certificate parser |
| `lib/hosts.mjs` · `requests.mjs` | Fleet, people, policy per host class · the request state machine |
| `lib/passkeys.mjs` · `targets.mjs` | WebAuthn · the four user-space `sshd` targets |
| `lib/session.mjs` · `ledger.mjs` | WebSocket ⇄ `ssh` bridge and recorder · hash-chained ledger |
| `hostshell/` | The simulated host behind `ForceCommand` |
| `shots/` | Screenshots: hosts, request, passkey, waiting, terminal, summary, BMC terminal, console slot layout, phone, host not enrolled, expiring and expired certificate |

## What the tests prove

`smoke.mjs` (all against real `sshd` and `ssh`): every policy rule and input check; no terminal before approval; the
certificate's contents via `ssh-keygen -L` (one principal, `permit-pty` only, source-bound, key id `<operator>|<requestId>`);
cross-origin and form-encoded writes refused; `hostname; dmesg | tail -3; rm -rf /` through the browser path with the
denial asserted; the recording's hash against the header, the ledger and the file; an independent recomputation of the
ledger chain; a tamper test (one edited entry breaks the chain at that entry); single-use approvals; keys wiped from
disk; certificate expiry kills the session; revocation kills the session *and* `sshd` then refuses the certificate; a
certificate is refused on another host; a host cannot impersonate another; the identity hook; every process stopped.
`shots.mjs` does the same through the real UI with a real WebAuthn ceremony (enrolment, then authentication).

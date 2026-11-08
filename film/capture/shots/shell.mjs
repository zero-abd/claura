// shell: Claura Secure Shell, the whole flow on the SSH demo page (a real gateway, a real OpenSSH certificate, a real sshd):
// pick b14-gpu-07 -> request (the reason is pre-filled) -> passkey (a Chrome virtual authenticator, held 1.3 s so the sheet
// reads) -> "Waiting for an approver" -> Approve as Incident Commander (RK) -> the recorded read-only terminal:
// dmesg | tail -3, ps aux | grep qemu, rm -rf /var/log (denied by policy) -> End session -> Session sealed, the recording hash.
//
//   (cd /Users/abd/repos/claura/ssh && CLAURA_SSH_DATA=<fresh dir under ~/.config/claura> node dev.mjs)     # http://localhost:8801
//   unset NODE_USE_SYSTEM_CA; node capture/shoot.mjs --port 9231 capture/shots/shell.mjs
//
// The data dir must be fresh for every take (a passkey enrolled by a previous take has no authenticator any more).
import { stamp, sleep } from './_lib.mjs'

export const meta = {
  name: 'shell',
  shows: 'Secure Shell: pick b14-gpu-07, request (reason), passkey, Approve as Incident Commander (RK), terminal (dmesg | tail -3, ps aux | grep qemu, rm -rf /var/log denied by policy), end session, summary with the recording hash',
  url: 'http://localhost:8801/', // localhost, not 127.0.0.1: passkeys need a real hostname as the relying-party id
  webauthn: { transport: 'internal', delay: 1300 }, // virtual authenticator; every create/get is held 1.3 s so the passkey sheet can be read
  settle: 900,
  lead: 700,
  tail: 1000,
  seed: 101,
  retry: false, // a failed take leaves a passkey enrolled in the gateway: re-take by hand with a fresh data dir
  notes: 'Real gateway + real sshd on 127.0.0.1 (dev.mjs). Keys: pickHost, requestSheet, requestAccess, passkeySheet, waitingForApprover, approveAsRK, terminalOpen, typeDmesg, typePs, typeRm, denied (the policy refusal is on screen), endSession, summary, auditChainIntact (recording SHA-256 and the chain check are on screen).',
}

const phase = `document.querySelector('.cs-root')?.dataset.phase ?? null`
const waitPhase = (page, p, timeout = 20000) => page.waitFor(`${phase} === ${JSON.stringify(p)}`, { timeout, label: `phase ${p}` })
const termText = `(document.querySelector('.xterm-rows')?.textContent || '')`

export async function prepare(page) {
  await page.waitFor(`document.querySelectorAll('.cs-card').length === 4`, { timeout: 20000, label: 'four host cards' })
}

export async function act(page, ctx) {
  // 1. pick the suspect host
  const open = await page.find({ sel: '[data-open="b14-gpu-07"]' })
  stamp(page, ctx, 'cursorEnters')
  await page.moveTo(open, { ms: 1000 })
  await sleep(300)
  stamp(page, ctx, 'pickHost')
  await page.click(open, { ms: 40, settle: 0 })

  // 2. the request: policy chips and the pre-filled reason
  await waitPhase(page, 'request')
  stamp(page, ctx, 'requestSheet')
  await sleep(900)
  const submit = await page.find({ sel: '[data-act="submit"]' })
  await page.moveTo(submit, { ms: 900 })
  await sleep(500)
  stamp(page, ctx, 'requestAccess')
  await page.click(submit, { ms: 40, settle: 0 })

  // 3. passkey (held by the virtual authenticator), then the approver
  await waitPhase(page, 'passkey', 8000)
  stamp(page, ctx, 'passkeySheet')
  // the approver sheet is up once the (held) passkey ceremony is done: its demo-approve button exists only there
  await page.waitFor(`(() => { const b = document.querySelector('[data-act="demo-approve"]'); return !!b && b.getBoundingClientRect().width > 0 })()`, { timeout: 20000, label: 'approver sheet' })
  stamp(page, ctx, 'waitingForApprover')
  await sleep(700)
  const approve = await page.find({ sel: '[data-act="demo-approve"]' })
  await page.moveTo(approve, { ms: 900 })
  await sleep(550)
  stamp(page, ctx, 'approveAsRK')
  await page.click(approve, { ms: 40, settle: 0 })

  // 4. the terminal
  await waitPhase(page, 'terminal', 25000)
  await page.waitFor(`/Type 'help' for commands/.test(${termText})`, { timeout: 20000, label: 'host banner' })
  stamp(page, ctx, 'terminalOpen')
  await sleep(1300)
  if (!(await page.eval(`!!document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea')`))) {
    const screen = await page.find({ sel: '.xterm-screen' })
    await page.click({ x: screen.x + 300, y: screen.y + 160 }, { ms: 500 })
    await sleep(300)
  }
  stamp(page, ctx, 'typeDmesg')
  await page.type('dmesg | tail -3\n', { cps: 13 })
  await page.waitFor(`(${termText}.match(/Link down/g) || []).length >= 2`, { timeout: 8000, label: 'dmesg output' })
  await sleep(1100)
  stamp(page, ctx, 'typePs')
  await page.type('ps aux | grep qemu\n', { cps: 13 })
  await page.waitFor(`/libvirt\\+\\s+2231/.test(${termText})`, { timeout: 8000, label: 'ps output' })
  await sleep(1300)
  stamp(page, ctx, 'typeRm')
  await page.type('rm -rf /var/log\n', { cps: 13 })
  await page.waitFor(`/denied by Claura policy: forensic read-only session/.test(${termText})`, { timeout: 8000, label: 'policy denial' })
  stamp(page, ctx, 'denied')
  await sleep(1900)

  // 5. end the session: sealed, with the recording hash
  const end = await page.find({ sel: '[data-bind="endbtn"]' })
  await page.moveTo(end, { ms: 1000 })
  await sleep(350)
  stamp(page, ctx, 'endSession')
  await page.click(end, { ms: 40, settle: 0 })
  await waitPhase(page, 'summary', 15000)
  stamp(page, ctx, 'summary')
  await page.waitFor(`document.querySelector('[data-bind="verify"]')?.classList.contains('is-ok') && /^[0-9a-f]{64}$/.test(document.querySelector('[data-bind="rechash"]')?.textContent || '')`, { timeout: 12000, label: 'chain verified + hash' })
  stamp(page, ctx, 'auditChainIntact')
  await page.move(1380, 330, { ms: 1100, curve: 0.06 }) // the cursor leaves the sheet; hash and chain stay in frame
  await sleep(1700)
}

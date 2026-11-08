// Proof that passkey (Touch ID) prompts complete with no human while recording: register a passkey on https://webauthn.io
// with a throwaway username and sign in with it, using the Chrome DevTools virtual authenticator (no personal data, no
// real key, no keychain). The shot THROWS unless the authenticator really created and then asserted a credential, so a
// green run is a pass. Each passkey request is held 900 ms (meta.webauthn.delay) so a "waiting for Touch ID" state is
// visible for a moment before it completes, which is what a console-side prompt will need on camera.
export const meta = {
  name: 'webauthn-io-test',
  shows: 'virtual WebAuthn authenticator: passkey register + sign-in complete without a human (webauthn.io)',
  url: 'https://webauthn.io/',
  webauthn: { transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, delay: 900 },
  ignoreProblems: ['Conditional UI error'], // webauthn.io starts an autofill-style request on load; headless has no autofill UI
  settle: 600, lead: 500, tail: 900,
}

const bodyText = (page) => page.eval('document.body.innerText')

export async function act(page, ctx) {
  const username = `claura-capture-${Date.now().toString(36)}` // a throwaway name, not a person
  const auth = page.authenticator
  if (!auth) throw new Error('no virtual authenticator on the page')

  // 1. register
  await page.click({ sel: '#input-email' }, { ms: 700 })
  await page.clearFocused() // webauthn.io remembers the last username
  await page.type(username, { cps: 12 })
  await page.click({ sel: '#register-button' }, { ms: 600 })
  await page.waitUntil(() => auth.added >= 1, { timeout: 15000, label: 'the authenticator to create a credential (Register)' })
  await page.waitFor(`/success|registered|now try/i.test(document.body.innerText)`, { timeout: 10000, label: 'webauthn.io to show the registration success message' })
  const afterRegister = (await bodyText(page)).split('\n').find((l) => /success|registered|now try/i.test(l)) ?? ''
  ctx.log('registered:', afterRegister.trim().slice(0, 90))
  await ctx.sleep(900)

  // 2. sign in with the passkey
  await page.click({ sel: '#login-button' }, { ms: 600 })
  await page.waitUntil(() => auth.asserted >= 1, { timeout: 15000, label: 'the authenticator to assert the credential (Authenticate)' })
  await page.waitFor(`/logged in|authenticated|success/i.test(document.body.innerText) && !/now try to authenticate/i.test(document.body.innerText)`, { timeout: 10000, label: 'webauthn.io to show the sign-in success message' })
  const afterLogin = (await bodyText(page)).split('\n').find((l) => /logged in|authenticated|success/i.test(l)) ?? ''
  ctx.log('signed in:', afterLogin.trim().slice(0, 90))
  await ctx.sleep(600)

  // 3. the authenticator's own account of what happened
  const creds = await page.webauthnCredentials()
  if (creds.length !== 1 || creds[0].rpId !== 'webauthn.io') throw new Error(`expected exactly one webauthn.io credential, got ${JSON.stringify(creds)}`)
  return { passkeyRegistered: true, passkeySignedIn: true, credentials: creds.length, rpId: creds[0].rpId, resident: creds[0].isResident, signCount: creds[0].signCount, registeredMessage: afterRegister.trim().slice(0, 80), signedInMessage: afterLogin.trim().slice(0, 80) }
}

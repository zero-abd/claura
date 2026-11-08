// Gateway configuration. Everything here is non-secret and comes from the process environment.
// Secrets (the shared Claura .env) are loaded separately in env.mjs and are never part of this object.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.1.0';
export const GATEWAY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(GATEWAY_DIR, '..'); // the claura monorepo (ssh/, voice/, integrations/ live here)

/** The only browser origins that may call the gateway from another origin (the console, dev server or preview). */
export const CONSOLE_ORIGINS = Object.freeze(['http://localhost:4317', 'http://127.0.0.1:4317']);

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** A path list from the environment (":" separated). undefined = not set, so the default applies. */
function pathList(v) {
  if (v === undefined) return undefined;
  return String(v).split(path.delimiter).map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(s));
}
function nameSet(v) {
  return new Set(String(v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}
function intEnv(v, dflt, min, max) {
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
}

/**
 * The console's origins. Default: http://localhost:4317 and http://127.0.0.1:4317. demo/start.sh sets
 * CLAURA_GATEWAY_CONSOLE_ORIGINS only when the console is moved to another port (CLAURA_CONSOLE_PORT);
 * only loopback http origins are accepted, so this can never open the gateway to a website.
 */
function consoleOrigins(v) {
  if (v === undefined || v === '') return [...CONSOLE_ORIGINS];
  const list = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  for (const o of list) {
    if (!/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(o)) throw new Error(`CLAURA_GATEWAY_CONSOLE_ORIGINS: "${o}" is not an http://localhost:PORT or http://127.0.0.1:PORT origin`);
  }
  return list;
}

export function loadConfig(env = process.env) {
  const host = env.CLAURA_GATEWAY_HOST || '127.0.0.1';
  if (!LOOPBACK.has(host)) throw new Error(`CLAURA_GATEWAY_HOST must be a loopback address (127.0.0.1 or ::1), got "${host}"`);
  return {
    host,
    port: intEnv(env.CLAURA_GATEWAY_PORT, 8787, 0, 65535),
    consoleOrigins: consoleOrigins(env.CLAURA_GATEWAY_CONSOLE_ORIGINS),
    // Packages: explicit feature folders. Roots: folders whose children are feature folders (integrations/*).
    packages: pathList(env.CLAURA_GATEWAY_PACKAGES) ?? [path.join(REPO, 'ssh'), path.join(REPO, 'voice')],
    roots: pathList(env.CLAURA_GATEWAY_ROOTS) ?? [path.join(REPO, 'integrations')],
    only: nameSet(env.CLAURA_GATEWAY_FEATURES), // empty = all
    skip: nameSet(env.CLAURA_GATEWAY_DISABLE),
    mountTimeoutMs: intEnv(env.CLAURA_GATEWAY_MOUNT_TIMEOUT_MS, 30_000, 500, 300_000),
    envFile: env.CLAURA_ENV || path.join(os.homedir(), '.config', 'claura', '.env'),
    sshOpenRecordings: !/^(0|false|no|off)$/i.test(String(env.CLAURA_GATEWAY_SSH_OPEN_RECORDINGS ?? '1')),
    voicePrewarm: !/^(0|false|no|off)$/i.test(String(env.CLAURA_GATEWAY_VOICE_PREWARM ?? '1')),
  };
}

export const isValidFeatureName = (n) => NAME_RE.test(String(n));

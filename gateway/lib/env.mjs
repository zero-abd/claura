// The shared Claura secrets file (~/.config/claura/.env). Parsed with dotenv, never written to process.env, never logged.
import fs from 'node:fs';
import dotenv from 'dotenv';

const SECRETISH = /(KEY|TOKEN|SECRET|CODE|PASSWORD|PASSPHRASE|PRIVATE)/i;

/**
 * @returns {{ env: Record<string,string>, fileEnv: Record<string,string>, found: boolean, tooOpen: boolean, names: string[], secrets: string[] }}
 *   env     what features receive as ctx.env: file values first, the real environment on top (dotenv's own precedence)
 *   secrets values the logger must scrub (anything whose NAME looks secret, 8+ characters)
 */
export function loadEnv(file, base = process.env) {
  let fileEnv = {};
  let found = false;
  let tooOpen = false;
  try {
    fileEnv = dotenv.parse(fs.readFileSync(file));
    found = true;
    tooOpen = (fs.statSync(file).mode & 0o077) !== 0;
  } catch {
    /* missing or unreadable: features fall back to mock modes */
  }
  const env = { ...fileEnv, ...base };
  const secrets = [];
  for (const [k, v] of Object.entries(env)) {
    if (SECRETISH.test(k) && typeof v === 'string' && v.length >= 8) secrets.push(v);
  }
  return { env, fileEnv, found, tooOpen, names: Object.keys(fileEnv), secrets };
}

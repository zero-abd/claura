import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

/** Shared Claura secrets file. CLAURA_ENV overrides the path. Secrets live ONLY here. */
export const DEFAULT_ENV_FILE = path.join(os.homedir(), '.config', 'claura', '.env');
export const envFilePath = () => process.env.CLAURA_ENV || DEFAULT_ENV_FILE;

/** Parse the env file with dotenv. Never mutates process.env and never logs a value. */
export function loadEnvFile(file = envFilePath()) {
  try {
    return dotenv.parse(fs.readFileSync(file));
  } catch {
    return {};
  }
}

/** File values first, the real environment on top (same precedence dotenv uses by default). */
export function loadEnv(extra = {}) {
  return { ...loadEnvFile(), ...process.env, ...extra };
}

/** Pull the ElevenLabs key out of an env object without ever echoing it. */
export function elevenKey(env) {
  const k = String(env?.ELEVENLABS_API_KEY ?? '').trim();
  return k || '';
}

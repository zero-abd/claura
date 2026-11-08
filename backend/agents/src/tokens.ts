// Persistence of the SpacetimeDB identity token (a bearer credential: whoever holds it IS that operator).
//
// One JSON file, mode 0600, in a 0700 directory: { "<uri>|<db>|<slot>": "<token>" }. Keyed per server and
// database because a token minted by Maincloud means nothing to a local server (and the reverse), and per
// slot ('agent', 'approver') because the runner can hold two identities. The token is never logged.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type TokenMap = Record<string, string>;

function readMap(file: string): TokenMap {
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: TokenMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
      return out;
    }
  } catch {
    /* unreadable file: treated as empty, and rewritten on the next save */
  }
  return {};
}

export const tokenKey = (uri: string, db: string, slot: string): string => `${uri}|${db}|${slot}`;

export function readToken(file: string, key: string): string | undefined {
  return readMap(file)[key];
}

export function writeToken(file: string, key: string, token: string): void {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const map = readMap(file);
  map[key] = token;
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n', { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

export function forgetToken(file: string, key: string): void {
  const map = readMap(file);
  if (!(key in map)) return;
  delete map[key];
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n', { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

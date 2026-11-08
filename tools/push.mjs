// Commits the whole monorepo and pushes it to GitHub with isomorphic-git (the system git is blocked by the Xcode
// licence). Auth comes from the gh CLI's stored login; the token is never printed or written to disk.
// Usage: node tools/push.mjs "commit message"
import fs from 'node:fs';
import path from 'node:path';
import http from 'isomorphic-git/http/node/index.js';
import git from 'isomorphic-git';
import { execFileSync } from 'node:child_process';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REMOTE = 'https://github.com/zero-abd/claura.git';
const message = process.argv[2] ?? 'Update Claura';
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();

if (!fs.existsSync(path.join(dir, '.git'))) {
  await git.init({ fs, dir, defaultBranch: 'main' });
  await git.addRemote({ fs, dir, remote: 'origin', url: REMOTE });
}

// stage every change; statusMatrix skips .gitignore'd paths
let added = 0, removed = 0;
for (const [file, head, work] of await git.statusMatrix({ fs, dir })) {
  if (work === 0) { await git.remove({ fs, dir, filepath: file }); removed++; continue; }
  if (head !== work || work === 2) {
    const size = fs.statSync(path.join(dir, file)).size;
    if (size > 90 * 1024 * 1024) { console.warn('skipping >90MB file', file); continue; }
    await git.add({ fs, dir, filepath: file });
    added++;
  }
}
const staged = (await git.statusMatrix({ fs, dir })).filter(([, h, , s]) => h !== s);
if (!staged.length) { console.log('nothing to commit'); process.exit(0); }

const user = JSON.parse(gh('api', 'user'));
const sha = await git.commit({
  fs, dir,
  message: `${message}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`,
  author: { name: user.name || user.login, email: `${user.id}+${user.login}@users.noreply.github.com` },
});
const token = gh('auth', 'token');
const res = await git.push({ fs, http, dir, remote: 'origin', ref: 'main', onAuth: () => ({ username: token, password: 'x-oauth-basic' }) });
console.log(`pushed ${sha.slice(0, 7)} (${added} added/changed, ${removed} removed):`, res.ok ? 'ok' : JSON.stringify(res.errors));

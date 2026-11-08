// Logger handed to every feature as ctx.log. Scrubs known secret values from every line before it is written.
import os from 'node:os';
import util from 'node:util';

export function makeLogger(secretValues = []) {
  const secrets = [...new Set(secretValues.filter((v) => typeof v === 'string' && v.length >= 8))];
  const home = os.homedir();

  /** Remove secret values from a string. */
  const scrub = (s) => {
    let out = String(s);
    for (const sec of secrets) if (out.includes(sec)) out = out.split(sec).join('[redacted]');
    return out;
  };
  /** Same, and shorten the home directory: for text that leaves the process (health JSON). */
  const publicText = (s, max = 240) => {
    let out = scrub(s);
    if (home && home !== '/') out = out.split(home).join('~');
    out = out.replace(/\s+/g, ' ').trim();
    return out.length > max ? `${out.slice(0, max - 1)}…` : out;
  };

  const fmt = (args) =>
    scrub(
      args
        .filter((a) => a !== undefined)
        .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack || a.message : util.inspect(a, { depth: 4, breakLength: 160 })))
        .join(' '),
    );
  const emit = (level, args) => {
    const line = `${new Date().toISOString().slice(11, 23)} ${level.padEnd(5)} ${fmt(args)}\n`;
    try {
      (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line);
    } catch {
      /* a closed pipe must never take the gateway down */
    }
  };
  const debugOn = /^(1|true|yes|on)$/i.test(String(process.env.CLAURA_GATEWAY_DEBUG ?? ''));
  return {
    scrub,
    publicText,
    debug: (...a) => { if (debugOn) emit('debug', a); },
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    log: (...a) => emit('info', a),
  };
}

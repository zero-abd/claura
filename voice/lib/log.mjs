// A tiny logger adapter. ctx.log may be a function, an object with info/warn/error, or absent.
// Anything that looks like a secret is scrubbed before it reaches the sink.

export function makeLog(user, { secrets = [], prefix = '[voice]', debug = false } = {}) {
  const live = secrets.filter((s) => s && String(s).length > 6).map(String);
  const scrub = (v) => {
    let s;
    if (typeof v === 'string') s = v;
    else if (v instanceof Error) s = `${v.name}: ${v.message}`;
    else {
      try { s = JSON.stringify(v); } catch { s = String(v); }
    }
    for (const sec of live) if (s.includes(sec)) s = s.split(sec).join('[redacted]');
    return s;
  };
  const emit = (level, msg, meta) => {
    const line = `${prefix} ${scrub(msg)}`;
    let m;
    if (meta !== undefined) {
      try { m = typeof meta === 'object' && meta !== null ? JSON.parse(scrub(meta)) : scrub(meta); } catch { m = scrub(meta); }
    }
    try {
      if (typeof user === 'function') return m === undefined ? user(line) : user(line, m);
      if (user && typeof user[level] === 'function') return m === undefined ? user[level](line) : user[level](line, m);
      if (user && typeof user.log === 'function') return m === undefined ? user.log(line) : user.log(line, m);
    } catch { /* a broken sink must never break the feature */ }
    const sink = console[level] ?? console.log;
    return m === undefined ? sink(line) : sink(line, m);
  };
  return {
    scrub,
    debug: (msg, meta) => { if (debug) emit('debug', msg, meta); },
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
  };
}

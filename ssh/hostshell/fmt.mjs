// Time and table formatting for the host shell simulator. The simulated data center (DFW-2) keeps
// America/Chicago time, like the console's incident clock.
export const TZ = 'America/Chicago';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  timeZoneName: 'short',
});

const cache = new Map();
export function parts(ms) {
  const sec = Math.floor(ms / 1000);
  let p = cache.get(sec);
  if (p) return p;
  const o = {};
  for (const x of dtf.formatToParts(new Date(sec * 1000))) o[x.type] = x.value;
  const month = Number(o.month);
  p = {
    year: Number(o.year),
    month,
    mon: MONTHS[month - 1],
    day: Number(o.day),
    dow: o.weekday,
    hh: o.hour === '24' ? '00' : o.hour,
    mm: o.minute,
    ss: o.second,
    tz: o.timeZoneName,
  };
  if (cache.size > 5000) cache.clear();
  cache.set(sec, p);
  return p;
}

const p2 = (n) => String(n).padStart(2, '0');

/** Sun Nov  8 02:31:42 CST 2026 */
export const dateFull = (ms) => {
  const t = parts(ms);
  return `${t.dow} ${t.mon} ${String(t.day).padStart(2, ' ')} ${t.hh}:${t.mm}:${t.ss} ${t.tz} ${t.year}`;
};
/** Nov 08 02:14:07 (journalctl) */
export const journalTime = (ms) => {
  const t = parts(ms);
  return `${t.mon} ${p2(t.day)} ${t.hh}:${t.mm}:${t.ss}`;
};
/** Nov  8 02:14:07 (syslog files) */
export const syslogTime = (ms) => {
  const t = parts(ms);
  return `${t.mon} ${String(t.day).padStart(2, ' ')} ${t.hh}:${t.mm}:${t.ss}`;
};
/** Nov  8 02:14 (ls -l) */
export const lsTime = (ms) => {
  const t = parts(ms);
  return `${t.mon} ${String(t.day).padStart(2, ' ')} ${t.hh}:${t.mm}`;
};
/** [Sun Nov  8 02:14:07 2026] (dmesg -T) */
export const dmesgHuman = (ms) => {
  const t = parts(ms);
  return `${t.dow} ${t.mon} ${String(t.day).padStart(2, ' ')} ${t.hh}:${t.mm}:${t.ss} ${t.year}`;
};
/** 02:14:07 */
export const clock = (ms) => {
  const t = parts(ms);
  return `${t.hh}:${t.mm}:${t.ss}`;
};
/** Sun Nov  8 02:31 (last) */
export const lastTime = (ms) => {
  const t = parts(ms);
  return `${t.dow} ${t.mon} ${String(t.day).padStart(2, ' ')} ${t.hh}:${t.mm}`;
};
/** 2026-11-08 02:31 (who) */
export const isoMinute = (ms) => {
  const t = parts(ms);
  return `${t.year}-${p2(t.month)}-${p2(t.day)} ${t.hh}:${t.mm}`;
};
/** ISO-ish with zone, for banners */
export const stamp = (ms) => {
  const t = parts(ms);
  return `${t.year}-${p2(t.month)}-${p2(t.day)} ${t.hh}:${t.mm}:${t.ss} ${t.tz}`;
};
/** Apr26 / 02:14 style START column for ps */
export const psStart = (ms, nowMs) => {
  const a = parts(ms);
  const b = parts(nowMs);
  if (a.year === b.year && a.month === b.month && a.day === b.day) return `${a.hh}:${a.mm}`;
  return `${a.mon}${p2(a.day)}`;
};

export const dayName = (ms) => DAYS[new Date(ms).getUTCDay()];

export const pad = (s, n) => String(s).padEnd(n);
export const lpad = (s, n) => String(s).padStart(n);

/** "up 38 days,  4:12" */
export function uptimeText(ms) {
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const hm = `${h}:${p2(m)}`;
  return d > 0 ? `${d} day${d === 1 ? '' : 's'}, ${lpad(hm, 5)}` : hm;
}
export function uptimePretty(ms) {
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const out = [];
  if (d) out.push(`${d} day${d === 1 ? '' : 's'}`);
  if (h) out.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m || !out.length) out.push(`${m} minute${m === 1 ? '' : 's'}`);
  return `up ${out.join(', ')}`;
}

export function humanSize(bytes) {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return i === 0 ? String(bytes) : `${v < 10 ? v.toFixed(1) : Math.round(v)}${units[i]}`;
}

/** Left-aligned table with a fixed gap, for ls and friends. */
export function columns(items, width) {
  if (!items.length) return '';
  const maxLen = Math.max(...items.map((s) => s.length)) + 2;
  const perRow = Math.max(1, Math.floor(width / maxLen));
  const rows = Math.ceil(items.length / perRow);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < perRow; c++) {
      const it = items[c * rows + r];
      if (it === undefined) continue;
      line += c * rows + r + rows >= items.length ? it : it.padEnd(maxLen);
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}

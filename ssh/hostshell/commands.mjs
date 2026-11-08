// Command implementations for the host shell simulator. SIMULATED: nothing here touches the real
// machine. Every command is a pure function of the simulated world, so sessions are repeatable.
//
//   run(ctx, args, stdin) -> { out?, err?, code? }
//
// ctx: { w: world, fs: Vfs, sh: shell state, mode: 'forensic' | 'ops', cols, tty, now }
import { createHash } from 'node:crypto';
import * as F from './fmt.mjs';
import { EVIDENCE, GUESTS, INCIDENT_ID, SUSPECT_VM, MGMT_IP, hexOf, uuidOf } from './world.mjs';

export const DENY_RO = 'denied by Claura policy: forensic read-only session';
export const DENY_OPS = 'denied by Claura policy: not in the operator allowlist for this session';
export const denial = (c, name) => `${name}: ${c.mode === 'forensic' ? DENY_RO : DENY_OPS}`;

/** Commands that change state or run arbitrary code: always denied, in both modes. */
export const MUTATING = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'ln', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'chattr', 'setfacl', 'dd', 'shred', 'truncate',
  'install', 'rsync', 'scp', 'sftp', 'ssh', 'nc', 'ncat', 'netcat', 'socat', 'curl', 'wget', 'ftp', 'telnet',
  'kill', 'killall', 'pkill', 'skill', 'reboot', 'shutdown', 'poweroff', 'halt', 'init', 'telinit', 'service',
  'mount', 'umount', 'swapon', 'swapoff', 'fdisk', 'parted', 'mkfs', 'mkswap', 'modprobe', 'insmod', 'rmmod', 'sysctl',
  'iptables', 'ip6tables', 'nft', 'ifconfig', 'route', 'tc', 'ethtool', 'useradd', 'userdel', 'usermod', 'passwd', 'chpasswd',
  'groupadd', 'sudo', 'su', 'doas', 'crontab', 'at', 'apt', 'apt-get', 'dpkg', 'yum', 'dnf', 'snap', 'pip', 'pip3', 'npm',
  'vi', 'vim', 'view', 'nano', 'emacs', 'ed', 'ex', 'pico', 'joe', 'bash', 'sh', 'zsh', 'dash', 'ksh', 'csh', 'fish',
  'python', 'python3', 'perl', 'ruby', 'node', 'php', 'lua', 'gcc', 'cc', 'make', 'strace', 'ltrace', 'gdb', 'perf', 'tcpdump',
  'tshark', 'nmap', 'docker', 'nsenter', 'unshare', 'chroot', 'eval', 'exec', 'source', '.', 'xargs', 'watch', 'nohup',
  'screen', 'tmux', 'mkfifo', 'mknod', 'wall', 'write', 'logger', 'systemd-run', 'virt-clone', 'qemu-img', 'qemu-system-x86_64',
]);

const ok = (out = '') => ({ out, code: 0 });
const fail = (err, code = 1) => ({ err: err.endsWith('\n') ? err : `${err}\n`, code });
const lines = (s) => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));
const unlines = (a) => (a.length ? `${a.join('\n')}\n` : '');

/** Tiny getopt: spec = { flags:'la', vals:'nk', long:{ 'no-pager':'P', lines:'n=' } } */
function getopt(args, spec = {}) {
  const o = { f: new Set(), v: {}, rest: [], bad: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      o.rest.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s);
      const key = spec.long?.[name];
      if (!key) {
        o.bad = a;
        continue;
      }
      if (key.endsWith('=')) o.v[key[0]] = inline ?? args[++i];
      else o.f.add(key);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (spec.vals?.includes(ch)) {
          o.v[ch] = a.slice(j + 1) || args[++i];
          break;
        } else if (spec.flags?.includes(ch)) o.f.add(ch);
        else o.bad = `-${ch}`;
      }
    } else o.rest.push(a);
  }
  return o;
}

function readInputs(c, files, stdin, cmd) {
  // returns [{name, data}] and an error string (if any)
  const out = [];
  let err = '';
  if (!files.length || (files.length === 1 && files[0] === '-')) return { inputs: [{ name: '-', data: stdin ?? '' }], err };
  for (const f of files) {
    if (f === '-') {
      out.push({ name: '-', data: stdin ?? '' });
      continue;
    }
    const p = c.fs.resolve(f, c.sh.cwd);
    const r = c.fs.read(p);
    if (!r.ok) err += `${cmd}: ${f}: ${r.err}\n`;
    else out.push({ name: f, data: r.data });
  }
  return { inputs: out, err };
}

// ---------------------------------------------------------------------------------------- basics
const help = (c) => {
  const ro = c.mode === 'forensic';
  const head = `Claura host shell on ${c.w.hostId}  ·  ${ro ? 'FORENSIC READ-ONLY session' : 'OPERATOR session (read-only diagnostics + /tmp scratch)'}`;
  const gpu = c.w.kind !== 'bmc';
  return ok([
    head,
    '',
    '  inspect    ls cat less head tail grep find stat sha256sum wc sort uniq cut awk sed tr',
    `  system     hostname uname uptime date whoami id who w last ps top df free ip ss${gpu ? ' lsmod lspci' : ''}`,
    `  incident   dmesg journalctl systemctl status${gpu ? ' virsh nvidia-smi' : ' ipmitool'}`,
    '  session    claura-session history clear exit',
    '',
    ro
      ? 'Anything that changes state (rm, kill, reboot, dd, chmod, curl, editors, redirects) is denied by policy.'
      : 'Anything outside the allowlist is denied by policy. You can write only under /tmp and your home.',
    'Every keystroke and every denied attempt is recorded and hash-chained into the incident log.',
    ...(c.w.kind === 'gpu-suspect' ? ['Evidence is sealed under /var/lib/claura/evidence (try: ls -l, cat MANIFEST.txt, sha256sum vm-7f3a.mem).'] : []),
    '',
  ].join('\n'));
};

const claura_session = (c) => {
  const s = c.w.session;
  return ok([
    `host        ${c.w.hostId}   (${c.w.meta.where})`,
    `principal   ${s.principal}   (${s.mode === 'forensic' ? 'forensic, read-only' : 'operator'})`,
    `identity    ${s.certId}`,
    `cert        serial ${s.serial}, ${s.keyFingerprint ?? ''}`,
    `signed by   ${s.caFingerprint ?? ''} (Claura user CA)`,
    `issued      ${F.stamp(s.validAfterMs ?? s.startedMs)}`,
    `expires     ${F.stamp(s.validBeforeMs)}   (${Math.max(0, Math.round((s.validBeforeMs - c.now) / 1000))} s left)`,
    'options     no-port-forwarding, no-agent-forwarding, no-x11-forwarding, no-user-rc, source-address bound',
    'recording   on (asciicast v2, SHA-256 hash-chained into the incident log when the session closes)',
    '',
  ].join('\n'));
};

const echo = (c, args) => {
  let nl = true;
  let esc = false;
  const a = [...args];
  while (a[0] && /^-[neE]+$/.test(a[0])) {
    if (a[0].includes('n')) nl = false;
    if (a[0].includes('e')) esc = true;
    a.shift();
  }
  let s = a.join(' ');
  if (esc) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\e/g, '\x1b').replace(/\\\\/g, '\\');
  return ok(nl ? `${s}\n` : s);
};

const printf = (c, args) => {
  if (!args.length) return fail('printf: usage: printf format [arguments]');
  let i = 1;
  const s = args[0].replace(/%([sd%])/g, (_, t) => (t === '%' ? '%' : t === 'd' ? String(parseInt(args[i++] ?? '0', 10) || 0) : (args[i++] ?? '')))
    .replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  return ok(s);
};

const whoami = (c) => ok(`${c.w.user}\n`);
const idcmd = (c) => ok(c.mode === 'forensic'
  ? 'uid=2001(forensics) gid=2001(forensics) groups=2001(forensics),1100(evidence)\n'
  : 'uid=2002(operator) gid=2002(operator) groups=2002(operator),104(libvirt)\n');
const groups = (c) => ok(c.mode === 'forensic' ? 'forensics evidence\n' : 'operator libvirt\n');
const hostname = (c, args) => ok(args.includes('-f') || args.includes('--fqdn') ? `${c.w.fqdn}\n` : args.includes('-I') ? `${c.w.ip} \n` : `${c.w.hostname}\n`);
const uname = (c, args) => {
  const w = c.w.os;
  if (!args.length) return ok('Linux\n');
  const a = args.join(' ');
  if (/-a|--all/.test(a)) return ok(`${w.full}\n`);
  const parts = [];
  if (/-s/.test(a)) parts.push('Linux');
  if (/-n/.test(a)) parts.push(c.w.hostname);
  if (/-r/.test(a)) parts.push(w.kernel);
  if (/-m/.test(a)) parts.push(w.arch);
  if (/-o/.test(a)) parts.push('GNU/Linux');
  return ok(`${parts.join(' ') || 'Linux'}\n`);
};

const date = (c, args) => {
  const now = c.now;
  const fmt = args.find((a) => a.startsWith('+'));
  if (args.includes('-u')) {
    const d = new Date(now);
    if (fmt) return ok(`${strftime(fmt.slice(1), now, true)}\n`);
    return ok(`${d.toUTCString().replace('GMT', 'UTC')}\n`);
  }
  if (fmt) return ok(`${strftime(fmt.slice(1), now)}\n`);
  if (args.includes('-I') || args.includes('--iso-8601')) return ok(`${F.parts(now).year}-${String(F.parts(now).month).padStart(2, '0')}-${String(F.parts(now).day).padStart(2, '0')}\n`);
  return ok(`${F.dateFull(now)}\n`);
};
function strftime(f, ms, utc = false) {
  const t = utc ? null : F.parts(ms);
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const v = {
    Y: utc ? d.getUTCFullYear() : t.year, m: utc ? p(d.getUTCMonth() + 1) : p(t.month), d: utc ? p(d.getUTCDate()) : p(t.day),
    H: utc ? p(d.getUTCHours()) : t.hh, M: utc ? p(d.getUTCMinutes()) : t.mm, S: utc ? p(d.getUTCSeconds()) : t.ss,
    s: Math.floor(ms / 1000), Z: utc ? 'UTC' : t.tz, a: utc ? F.dayName(ms) : t.dow, b: utc ? '' : t.mon,
  };
  v.F = `${v.Y}-${v.m}-${v.d}`;
  v.T = `${v.H}:${v.M}:${v.S}`;
  return f.replace(/%([YmdHMSsZabFT%])/g, (_, k) => (k === '%' ? '%' : String(v[k])));
}

const uptime = (c, args) => {
  if (args.includes('-p')) return ok(`${F.uptimePretty(c.w.uptimeMs)}\n`);
  if (args.includes('-s')) {
    const t = F.parts(c.w.bootMs);
    return ok(`${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')} ${t.hh}:${t.mm}:${t.ss}\n`);
  }
  return ok(` ${F.clock(c.now)} up ${F.uptimeText(c.w.uptimeMs)},  1 user,  load average: ${c.w.load.map((x) => x.toFixed(2)).join(', ')}\n`);
};

const who = (c) => {
  const s = c.w.session;
  return ok(`${c.w.user.padEnd(8)} ${(s.tty ?? 'pts/0').padEnd(12)} ${F.isoMinute(s.startedMs)} (10.0.0.9)\n`);
};
const w_ = (c) => {
  const s = c.w.session;
  return ok([
    ` ${F.clock(c.now)} up ${F.uptimeText(c.w.uptimeMs)},  1 user,  load average: ${c.w.load.map((x) => x.toFixed(2)).join(', ')}`,
    'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT',
    `${c.w.user.padEnd(8)} ${(s.tty ?? 'pts/0').padEnd(8)} 10.0.0.9        ${F.clock(s.startedMs).slice(0, 5)}    0.00s  0.02s  0.00s w`,
    '',
  ].join('\n'));
};
const last = (c, args) => {
  const n = parseInt(args.find((a) => /^-\d+$/.test(a))?.slice(1) ?? args[args.indexOf('-n') + 1] ?? '20', 10) || 20;
  const rows = c.w.logins.slice(0, n).map((l) => {
    const user = l.user.padEnd(9);
    const tty = l.tty.padEnd(12);
    const from = String(l.from).padEnd(16);
    if (l.user === 'reboot') return `${user}${tty}${from}${F.lastTime(l.at)}   still running`;
    const end = l.end ? `- ${F.clock(l.end).slice(0, 5)}  (${F.uptimeText(l.end - l.at).trim().replace(/^0:/, '00:')})` : '  still logged in';
    return `${user}${tty}${from}${F.lastTime(l.at)} ${end}`;
  });
  const tail = F.parts(c.w.bootMs);
  return ok(`${rows.join('\n')}\n\nwtmp begins ${F.lastTime(c.w.bootMs)}:${tail.ss} ${tail.year}\n`);
};

const env = (c, args) => {
  if (args.length) return fail(denial(c, 'env'));
  return ok(unlines(Object.entries(c.sh.env).map(([k, v]) => `${k}=${v}`)));
};
const printenv = (c, args) => (args.length ? ok(args.map((a) => c.sh.env[a]).filter((x) => x !== undefined).join('\n') + (args.some((a) => c.sh.env[a] !== undefined) ? '\n' : '')) : env(c, []));
const history = (c) => ok(unlines(c.sh.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`)));
const which = (c, args) => {
  const out = [];
  let code = 0;
  for (const a of args) {
    if (COMMANDS[a] || BUILTIN_NAMES.has(a)) out.push(BUILTIN_NAMES.has(a) ? `${a}: shell built-in command` : `/usr/bin/${a}`);
    else code = 1;
  }
  return { out: unlines(out), code };
};
const man = (c, args) => fail(`No manual entry for ${args.filter((a) => !a.startsWith('-'))[0] ?? ''}`);
const nproc = (c) => ok(`${c.w.meta.cores}\n`);
const trueCmd = () => ok();
const falseCmd = () => ({ code: 1 });
const sleep = (c, args) => ok();
const clear = () => ok('\x1b[H\x1b[2J\x1b[3J');

// ---------------------------------------------------------------------------------------- files
function lsLine(c, name, node, human) {
  const typeCh = node.type === 'd' ? 'd' : '-';
  const size = c.fs.sizeOf(node);
  const sz = human ? F.humanSize(size) : String(size);
  const nlink = node.type === 'd' ? 2 : 1;
  return `${typeCh}${node.mode} ${String(nlink).padStart(2)} ${node.owner.padEnd(8)} ${node.group.padEnd(8)} ${sz.padStart(human ? 5 : 11)} ${F.lsTime(node.mtime)} ${name}`;
}

const ls = (c, args) => {
  const o = getopt(args, { flags: 'laAhd1RFtr' });
  if (o.bad) return fail(`ls: invalid option -- '${o.bad.replace(/^-+/, '')}'`, 2);
  const long = o.f.has('l');
  const human = o.f.has('h');
  const showAll = o.f.has('a');
  const almost = o.f.has('A');
  const targets = o.rest.length ? o.rest : ['.'];
  let out = '';
  let err = '';
  let code = 0;
  const entries = [];
  for (const t of targets) {
    const p = c.fs.resolve(t, c.sh.cwd);
    const n = c.fs.stat(p);
    if (!n) {
      err += `ls: cannot access '${t}': No such file or directory\n`;
      code = 2;
      continue;
    }
    entries.push({ t, p, n });
  }
  const files = entries.filter((e) => e.n.type !== 'd' || o.f.has('d'));
  const dirs = entries.filter((e) => e.n.type === 'd' && !o.f.has('d'));
  const fmtName = (name, n) => (o.f.has('F') && n.type === 'd' ? `${name}/` : name);
  if (files.length) {
    if (long) out += unlines(files.map((e) => lsLine(c, fmtName(e.t, e.n), e.n, human)));
    else out += unlines(files.map((e) => fmtName(e.t, e.n)));
  }
  const walk = (dirPath, label, showHeader) => {
    let names = c.fs.list(dirPath);
    if (!showAll && !almost) names = names.filter((n) => !n.startsWith('.'));
    const items = names.map((n) => ({ n, node: c.fs.stat(dirPath === '/' ? `/${n}` : `${dirPath}/${n}`) }));
    if (showAll) {
      items.unshift({ n: '..', node: c.fs.stat(dirPath) }, { n: '.', node: c.fs.stat(dirPath) });
    }
    if (o.f.has('t')) items.sort((a, b) => b.node.mtime - a.node.mtime);
    if (o.f.has('r')) items.reverse();
    let s = showHeader ? `${label}:\n` : '';
    if (long) {
      const total = items.reduce((a, it) => a + Math.ceil(Math.min(c.fs.sizeOf(it.node), 1 << 20) / 4096) * 4, 0);
      s += `total ${total}\n`;
      s += unlines(items.map((it) => lsLine(c, fmtName(it.n, it.node), it.node, human)));
    } else if (c.tty && !o.f.has('1')) {
      s += items.length ? `${F.columns(items.map((it) => fmtName(it.n, it.node)), c.cols)}\n` : '';
    } else {
      s += unlines(items.map((it) => fmtName(it.n, it.node)));
    }
    out += (out && showHeader ? '\n' : '') + s;
    if (o.f.has('R')) {
      for (const it of items) {
        if (it.node.type === 'd' && it.n !== '.' && it.n !== '..') walk(dirPath === '/' ? `/${it.n}` : `${dirPath}/${it.n}`, `${label}/${it.n}`, true);
      }
    }
  };
  dirs.forEach((e, i) => walk(e.p, e.t, dirs.length + files.length > 1 || o.f.has('R')));
  return { out, err, code };
};

const cat = (c, args, stdin) => {
  const o = getopt(args, { flags: 'nAbs' });
  const { inputs, err } = readInputs(c, o.rest, stdin, 'cat');
  let data = inputs.map((i) => i.data).join('');
  if (o.f.has('n')) data = unlines(lines(data).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`));
  return { out: data, err, code: err ? 1 : 0 };
};

const head = (c, args, stdin) => headTail(c, args, stdin, 'head');
const tail = (c, args, stdin) => headTail(c, args, stdin, 'tail');
function headTail(c, args, stdin, which) {
  let n = 10;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
    else if (a === '-n') n = parseInt(args[++i], 10);
    else if (/^-n\d+$/.test(a)) n = parseInt(a.slice(2), 10);
    else if (/^--lines=\d+$/.test(a)) n = parseInt(a.split('=')[1], 10);
    else if (a === '-f' || a === '-F' || a === '--follow' || a === '-q' || a === '-v') continue;
    else rest.push(a);
  }
  if (!Number.isFinite(n)) return fail(`${which}: invalid number of lines`);
  const { inputs, err } = readInputs(c, rest, stdin, which);
  let out = '';
  inputs.forEach((inp, idx) => {
    const l = lines(inp.data);
    const sel = which === 'head' ? l.slice(0, n) : n === 0 ? [] : l.slice(-n);
    if (inputs.length > 1) out += `${idx ? '\n' : ''}==> ${inp.name} <==\n`;
    out += unlines(sel);
  });
  return { out, err, code: err ? 1 : 0 };
}

const wc = (c, args, stdin) => {
  const o = getopt(args, { flags: 'lwc' });
  const { inputs, err } = readInputs(c, o.rest, stdin, 'wc');
  const none = !o.f.has('l') && !o.f.has('w') && !o.f.has('c');
  const rows = inputs.map((i) => ({
    l: (i.data.match(/\n/g) ?? []).length,
    w: i.data.split(/\s+/).filter(Boolean).length,
    c: Buffer.byteLength(i.data),
    name: i.name === '-' ? '' : i.name,
  }));
  const fmt = (r) => [none || o.f.has('l') ? String(r.l).padStart(none ? 7 : 0) : null, none || o.f.has('w') ? String(r.w).padStart(none ? 7 : 0) : null, none || o.f.has('c') ? String(r.c).padStart(none ? 7 : 0) : null]
    .filter((x) => x !== null).join(' ') + (r.name ? ` ${r.name}` : '');
  const out = rows.map(fmt);
  if (rows.length > 1) out.push(fmt({ l: rows.reduce((a, r) => a + r.l, 0), w: rows.reduce((a, r) => a + r.w, 0), c: rows.reduce((a, r) => a + r.c, 0), name: 'total' }));
  return { out: unlines(out), err, code: err ? 1 : 0 };
};

function toRegex(pat, o) {
  let src = pat;
  if (o.f.has('F')) src = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  else if (!o.f.has('E')) src = pat.replace(/\\\|/g, '\u0000').replace(/\|/g, '\\|').replace(/\u0000/g, '|').replace(/\\([(){}+?])/g, '$1').replace(/(^|[^\\])([(){}+?])/g, '$1\\$2');
  if (o.f.has('w')) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, o.f.has('i') ? 'i' : '');
  } catch {
    return null;
  }
}

const grep = (c, args, stdin) => {
  const o = getopt(args, { flags: 'ivcnEFwoqlhHrRs', vals: 'ABCem', long: { 'ignore-case': 'i', 'invert-match': 'v', count: 'c', 'line-number': 'n', 'extended-regexp': 'E', 'fixed-strings': 'F', 'word-regexp': 'w', 'only-matching': 'o', quiet: 'q', recursive: 'r', color: 'K=', 'color=': 'K=' } });
  if (o.bad && !/^--color/.test(o.bad)) return fail(`grep: invalid option -- '${o.bad.replace(/^-+/, '')}'`, 2);
  const rest = [...o.rest];
  const pat = o.v.e ?? rest.shift();
  if (pat === undefined) return fail('Usage: grep [OPTION]... PATTERNS [FILE]...', 2);
  const re = toRegex(pat, o);
  if (!re) return fail('grep: Invalid regular expression', 2);
  const ctxN = (k) => (o.v[k] !== undefined ? parseInt(o.v[k], 10) || 0 : 0);
  const after = Math.max(ctxN('A'), ctxN('C'));
  const before = Math.max(ctxN('B'), ctxN('C'));
  let files = rest;
  let err = '';
  const recursive = o.f.has('r') || o.f.has('R');
  let inputs;
  if (recursive) {
    inputs = [];
    const targets = files.length ? files : ['.'];
    const walk = (p, shown) => {
      const n = c.fs.stat(p);
      if (!n) return;
      if (n.type === 'd') c.fs.list(p).forEach((k) => walk(p === '/' ? `/${k}` : `${p}/${k}`, `${shown.replace(/\/$/, '')}/${k}`));
      else {
        const r = c.fs.read(p);
        if (r.ok) inputs.push({ name: shown, data: r.data });
      }
    };
    for (const t of targets) walk(c.fs.resolve(t, c.sh.cwd), t);
  } else {
    const r = readInputs(c, files, stdin, 'grep');
    inputs = r.inputs;
    err = o.f.has('s') ? '' : r.err;
  }
  const multi = (inputs.length > 1 || recursive) && !o.f.has('h');
  let out = '';
  let found = false;
  for (const inp of inputs) {
    const ls_ = lines(inp.data);
    let count = 0;
    const printed = new Set();
    const emit = (i, sep) => {
      if (printed.has(i)) return;
      printed.add(i);
      out += `${multi ? `${inp.name}${sep}` : ''}${o.f.has('n') ? `${i + 1}${sep}` : ''}${ls_[i]}\n`;
    };
    ls_.forEach((line, i) => {
      const hit = re.test(line) !== o.f.has('v');
      if (!hit) return;
      count++;
      found = true;
      if (o.f.has('c') || o.f.has('l') || o.f.has('q')) return;
      for (let b = Math.max(0, i - before); b < i; b++) emit(b, '-');
      if (o.f.has('o') && !o.f.has('v')) {
        const g = new RegExp(re.source, `${re.flags}g`);
        for (const m of line.matchAll(g)) out += `${multi ? `${inp.name}:` : ''}${o.f.has('n') ? `${i + 1}:` : ''}${m[0]}\n`;
      } else emit(i, ':');
      for (let a = i + 1; a <= Math.min(ls_.length - 1, i + after); a++) emit(a, '-');
    });
    if (o.f.has('c')) out += `${multi ? `${inp.name}:` : ''}${count}\n`;
    if (o.f.has('l') && count) out += `${inp.name}\n`;
  }
  return { out: o.f.has('q') ? '' : out, err, code: found ? 0 : err ? 2 : 1 };
};

const sort = (c, args, stdin) => {
  const o = getopt(args, { flags: 'rnuf', vals: 'kt', long: { reverse: 'r', numeric: 'n', unique: 'u' } });
  const { inputs, err } = readInputs(c, o.rest, stdin, 'sort');
  let l = inputs.flatMap((i) => lines(i.data));
  const key = (s) => {
    let x = s;
    if (o.v.k) x = s.split(o.v.t ? o.v.t : /\s+/).filter((_, idx) => !(idx === 0 && s.startsWith(' ') && !o.v.t)).slice(parseInt(o.v.k, 10) - 1).join(' ');
    return o.f.has('f') ? x.toLowerCase() : x;
  };
  l.sort((a, b) => (o.f.has('n') ? (parseFloat(key(a)) || 0) - (parseFloat(key(b)) || 0) : key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  if (o.f.has('r')) l.reverse();
  if (o.f.has('u')) l = l.filter((x, i) => i === 0 || key(x) !== key(l[i - 1]));
  return { out: unlines(l), err, code: err ? 2 : 0 };
};

const uniq = (c, args, stdin) => {
  const o = getopt(args, { flags: 'cdu' });
  const { inputs, err } = readInputs(c, o.rest, stdin, 'uniq');
  const l = inputs.flatMap((i) => lines(i.data));
  const groups_ = [];
  for (const x of l) {
    const g = groups_[groups_.length - 1];
    if (g && g.x === x) g.n++;
    else groups_.push({ x, n: 1 });
  }
  const sel = groups_.filter((g) => (o.f.has('d') ? g.n > 1 : o.f.has('u') ? g.n === 1 : true));
  return { out: unlines(sel.map((g) => (o.f.has('c') ? `${String(g.n).padStart(7)} ${g.x}` : g.x))), err, code: 0 };
};

const cut = (c, args, stdin) => {
  const o = getopt(args, { vals: 'dfc' });
  const { inputs, err } = readInputs(c, o.rest, stdin, 'cut');
  const spec = (o.v.f ?? o.v.c ?? '').split(',').map((r) => {
    const [a, b] = r.split('-');
    return [parseInt(a || '1', 10), b === undefined ? parseInt(a, 10) : b === '' ? Infinity : parseInt(b, 10)];
  });
  const inSpec = (i) => spec.some(([a, b]) => i >= a && i <= b);
  const d = o.v.d ?? '\t';
  const out = inputs.flatMap((i) => lines(i.data)).map((line) => {
    if (o.v.c) return [...line].filter((_, idx) => inSpec(idx + 1)).join('');
    return line.split(d).filter((_, idx) => inSpec(idx + 1)).join(d);
  });
  return { out: unlines(out), err, code: 0 };
};

const tr = (c, args, stdin) => {
  const del = args.includes('-d');
  const sets = args.filter((a) => !a.startsWith('-'));
  const expand = (s) => s.replace(/(.)-(.)/g, (_, a, b) => {
    let r = '';
    for (let x = a.charCodeAt(0); x <= b.charCodeAt(0); x++) r += String.fromCharCode(x);
    return r;
  });
  const a = expand(sets[0] ?? '');
  const b = expand(sets[1] ?? '');
  let out = '';
  for (const ch of stdin ?? '') {
    const i = a.indexOf(ch);
    if (i < 0) out += ch;
    else if (!del) out += b[Math.min(i, b.length - 1)] ?? '';
  }
  return ok(out);
};

const awk = (c, args, stdin) => {
  const o = getopt(args, { vals: 'F' });
  const prog = o.rest.shift();
  if (!prog) return fail('usage: awk [-F fs] program [file ...]', 2);
  const m = /^\s*(?:\/(.+?)\/)?\s*\{\s*print\s*(.*?)\s*;?\s*\}\s*$/s.exec(prog) ?? (prog.startsWith('NR') ? null : null);
  const nr = /^\s*NR\s*(==|>=|<=|>|<)\s*(\d+)\s*(?:\{\s*print\s*(.*?)\s*\})?\s*$/.exec(prog);
  if (!m && !nr) return fail('awk: this restricted awk supports {print $N, ...} with an optional /regex/ or NR condition');
  const { inputs, err } = readInputs(c, o.rest, stdin, 'awk');
  const fsRe = o.v.F ? new RegExp(o.v.F === '\\t' ? '\t' : o.v.F.length === 1 ? o.v.F.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : o.v.F) : /\s+/;
  const items = (m ? m[2] : nr[3] ?? '$0').split(/\s*,\s*/).filter(Boolean);
  const out = [];
  let n = 0;
  for (const inp of inputs) {
    for (const line of lines(inp.data)) {
      n++;
      if (m?.[1] && !new RegExp(m[1]).test(line)) continue;
      if (nr) {
        const k = parseInt(nr[2], 10);
        const cond = { '==': n === k, '>=': n >= k, '<=': n <= k, '>': n > k, '<': n < k }[nr[1]];
        if (!cond) continue;
      }
      const f = fsRe === undefined ? [] : line.replace(/^\s+/, '').split(fsRe);
      const val = (it) => {
        if (it === '$0') return line;
        if (it === '$NF') return f[f.length - 1] ?? '';
        if (/^\$\d+$/.test(it)) return f[parseInt(it.slice(1), 10) - 1] ?? '';
        if (/^".*"$/.test(it)) return it.slice(1, -1);
        return '';
      };
      out.push((items.length ? items : ['$0']).map(val).join(' '));
    }
  }
  return { out: unlines(out), err, code: 0 };
};

const sed = (c, args, stdin) => {
  if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place')) return fail(denial(c, 'sed'));
  const o = getopt(args, { flags: 'nE', vals: 'e' });
  const prog = o.v.e ?? o.rest.shift();
  if (!prog) return fail('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...', 1);
  const { inputs, err } = readInputs(c, o.rest, stdin, 'sed');
  const l = inputs.flatMap((i) => lines(i.data));
  const p = /^(\$|\d+)(?:,(\$|\d+))?p$/.exec(prog);
  if (p) {
    const a = p[1] === '$' ? l.length : parseInt(p[1], 10);
    const b = p[2] === undefined ? a : p[2] === '$' ? l.length : parseInt(p[2], 10);
    const sel = l.slice(a - 1, b);
    return { out: o.f.has('n') ? unlines(sel) : unlines(l.flatMap((x, i) => (i + 1 >= a && i + 1 <= b ? [x, x] : [x]))), err, code: 0 };
  }
  const s = /^s(.)(.*?)\1(.*?)\1([gi]*)$/.exec(prog);
  if (s) {
    let re;
    try {
      re = new RegExp(s[2], s[4].replace(/[^gi]/g, ''));
    } catch {
      return fail('sed: -e expression #1: invalid regex');
    }
    return { out: unlines(l.map((x) => x.replace(re, s[3]))), err, code: 0 };
  }
  return fail("sed: this restricted sed supports 'Np', 'N,Mp', '$p' and 's/a/b/[g]'");
};

const tee = (c, args, stdin) => {
  const files = args.filter((a) => !a.startsWith('-'));
  if (c.mode === 'forensic' && files.length) return fail(denial(c, 'tee'));
  let err = '';
  for (const f of files) {
    const e = c.fs.write(c.fs.resolve(f, c.sh.cwd), stdin ?? '', args.includes('-a'));
    if (e) err += `tee: ${f}: ${e}\n`;
  }
  return { out: stdin ?? '', err, code: err ? 1 : 0 };
};

const stat = (c, args) => {
  let out = '';
  let err = '';
  for (const f of args.filter((a) => !a.startsWith('-'))) {
    const p = c.fs.resolve(f, c.sh.cwd);
    const n = c.fs.stat(p);
    if (!n) {
      err += `stat: cannot statx '${f}': No such file or directory\n`;
      continue;
    }
    const octal = (m) => [0, 3, 6].map((k) => [...m.slice(k, k + 3)].reduce((a, ch, i) => a + (ch === '-' ? 0 : [4, 2, 1][i]), 0)).join('');
    out += [
      `  File: ${f}`,
      `  Size: ${c.fs.sizeOf(n)}\t\tBlocks: ${Math.ceil(Math.min(c.fs.sizeOf(n), 1 << 22) / 512)}\t   IO Block: 4096   ${n.type === 'd' ? 'directory' : 'regular file'}`,
      `Access: (0${octal(n.mode)}/${n.type === 'd' ? 'd' : '-'}${n.mode})  Uid: (${String(n.owner === 'root' ? 0 : 2001).padStart(5)}/${n.owner.padStart(8)})   Gid: (${String(n.group === 'root' ? 0 : 2001).padStart(5)}/${n.group.padStart(8)})`,
      `Modify: ${F.stamp(n.mtime)}`,
      '',
    ].join('\n');
  }
  return { out, err, code: err ? 1 : 0 };
};

const sha256sum = (c, args, stdin) => {
  const files = args.filter((a) => !a.startsWith('-'));
  let out = '';
  let err = '';
  let code = 0;
  if (!files.length) return ok(`${createHash('sha256').update(stdin ?? '').digest('hex')}  -\n`);
  for (const f of files) {
    const p = c.fs.resolve(f, c.sh.cwd);
    const n = c.fs.stat(p);
    if (!n) {
      err += `sha256sum: ${f}: No such file or directory\n`;
      code = 1;
    } else if (n.type === 'd') {
      err += `sha256sum: ${f}: Is a directory\n`;
      code = 1;
    } else if (n.sha256) out += `${n.sha256}  ${f}\n`;
    else {
      const r = c.fs.read(p);
      if (r.ok) out += `${createHash('sha256').update(r.data).digest('hex')}  ${f}\n`;
      else {
        err += `sha256sum: ${f}: ${r.err}\n`;
        code = 1;
      }
    }
  }
  return { out, err, code };
};

const find = (c, args) => {
  const bad = args.find((a) => ['-delete', '-exec', '-execdir', '-ok', '-fprint', '-fprintf', '-fls'].includes(a));
  if (bad) return fail(denial(c, 'find'));
  const start = [];
  let i = 0;
  while (i < args.length && !args[i].startsWith('-')) start.push(args[i++]);
  let name = null;
  let type = null;
  let maxdepth = Infinity;
  for (; i < args.length; i++) {
    if (args[i] === '-name' || args[i] === '-iname') {
      const g = args[++i] ?? '';
      name = new RegExp(`^${g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, args[i - 1] === '-iname' ? 'i' : '');
    } else if (args[i] === '-type') type = args[++i];
    else if (args[i] === '-maxdepth') maxdepth = parseInt(args[++i], 10);
  }
  const out = [];
  const walk = (p, shown, depth) => {
    const n = c.fs.stat(p);
    if (!n) return;
    const base = shown.slice(shown.lastIndexOf('/') + 1) || shown;
    if ((!name || name.test(base)) && (!type || (type === 'f' && n.type === 'f') || (type === 'd' && n.type === 'd'))) out.push(shown);
    if (n.type === 'd' && depth < maxdepth) c.fs.list(p).forEach((k) => walk(p === '/' ? `/${k}` : `${p}/${k}`, `${shown.replace(/\/$/, '')}/${k}`, depth + 1));
  };
  let err = '';
  for (const s of start.length ? start : ['.']) {
    const p = c.fs.resolve(s, c.sh.cwd);
    if (!c.fs.exists(p)) err += `find: '${s}': No such file or directory\n`;
    else walk(p, s, 0);
  }
  return { out: unlines(out), err, code: err ? 1 : 0 };
};

// ---------------------------------------------------------------------------------------- system views
const trunc = (line, c, full) => (c.tty && !full && line.length > c.cols ? line.slice(0, c.cols) : line);
const cpuTime = (t) => t;

const ps = (c, args) => {
  const a = args.join(' ');
  const wide = /\bww?\b|-ww?|\bw\b/.test(a) || /-ww/.test(a);
  const mine = c.w.procs.filter((p) => p.user === c.w.user && p.tty !== '?');
  let rows;
  let header;
  let fmt;
  const aux = /\baux/.test(a) || /\bauxf?\b/.test(a);
  const ef = /-ef|-e\b|-A\b|-ax|\bax\b/.test(a);
  const forest = /f\b|--forest/.test(a) && (aux || ef);
  if (!aux && !ef) {
    const p = c.w.procs.find((x) => x.cmd === '-claura-shell' && x.user === c.w.user);
    rows = [{ pid: p?.pid ?? 9002, tty: 'pts/0', time: '00:00:00', cmd: '-claura-shell' }, { pid: (p?.pid ?? 9002) + 40, tty: 'pts/0', time: '00:00:00', cmd: 'ps' }];
    const out = ['    PID TTY          TIME CMD', ...rows.map((r) => `${String(r.pid).padStart(7)} ${r.tty.padEnd(8)} ${r.time} ${r.cmd.replace(/^-/, '')}`)];
    return ok(unlines(out));
  }
  let procs = [...c.w.procs];
  procs.push({ user: c.w.user, pid: (c.w.session.pid ?? 9002) + 40, ppid: c.w.session.pid ?? 9002, cpu: 0, mem: 0, vsz: 10_240, rss: 3_380, tty: 'pts/0', stat: 'R+', startMs: c.now, time: '0:00', cmd: aux ? `ps ${args.join(' ')}`.trim() : 'ps', short: 'ps' });
  procs.sort((x, y) => x.pid - y.pid);
  if (forest) procs = treeOrder(procs);
  if (aux) {
    header = 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
    fmt = (p) => `${p.user.padEnd(8).slice(0, 8)} ${String(p.pid).padStart(7)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(p.vsz).padStart(6)} ${String(p.rss).padStart(5)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} ${F.psStart(p.startMs, c.now).padEnd(5)} ${p.time.padStart(6)} ${(p.indent ?? '') + p.cmd}`;
  } else {
    header = 'UID          PID    PPID  C STIME TTY          TIME CMD';
    fmt = (p) => `${p.user.padEnd(8).slice(0, 8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)}  ${p.cpu >= 1 ? Math.round(p.cpu) : 0} ${F.psStart(p.startMs, c.now).padEnd(5)} ${p.tty.padEnd(8)} ${('00:' + p.time.padStart(5, '0')).padStart(8)} ${(p.indent ?? '') + p.cmd}`;
  }
  const out = [header, ...procs.map(fmt)].map((l) => trunc(l, c, wide));
  return ok(unlines(out));
};
function treeOrder(procs) {
  const by = new Map();
  for (const p of procs) by.set(p.ppid, [...(by.get(p.ppid) ?? []), p]);
  const out = [];
  const walk = (ppid, depth) => {
    for (const p of by.get(ppid) ?? []) {
      out.push({ ...p, indent: depth ? `${' '.repeat((depth - 1) * 4)} \\_ ` : '' });
      walk(p.pid, depth + 1);
    }
  };
  walk(0, 0);
  return out.length ? out : procs;
}

const top = (c) => {
  const procs = [...c.w.procs].sort((a, b) => b.cpu - a.cpu).slice(0, 12);
  const m = c.w.mem;
  return ok([
    `top - ${F.clock(c.now)} up ${F.uptimeText(c.w.uptimeMs)},  1 user,  load average: ${c.w.load.map((x) => x.toFixed(2)).join(', ')}`,
    `Tasks: ${String(c.w.procs.length + 140).padStart(3)} total,   1 running, ${String(c.w.procs.length + 139).padStart(3)} sleeping,   0 stopped,   0 zombie`,
    `%Cpu(s):  ${c.w.kind === 'gpu-suspect' ? '0.4' : '31.2'} us,  0.3 sy,  0.0 ni, ${c.w.kind === 'gpu-suspect' ? '99.2' : '68.1'} id,  0.0 wa,  0.0 hi,  0.1 si,  0.0 st`,
    `MiB Mem : ${(m.total / 1024).toFixed(1).padStart(9)} total, ${(m.free / 1024).toFixed(1).padStart(9)} free, ${(m.used / 1024).toFixed(1).padStart(9)} used, ${(m.buffcache / 1024).toFixed(1).padStart(9)} buff/cache`,
    '',
    '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
    ...procs.map((p) => `${String(p.pid).padStart(7)} ${p.user.padEnd(8).slice(0, 8)}  20   0 ${String(p.vsz).padStart(7)} ${String(p.rss).padStart(6)} ${String(Math.round(p.rss / 8)).padStart(6)} ${p.stat[0]} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)} ${(p.time + '.00').padStart(9)} ${p.short.split('/').pop()}`),
    '',
  ].join('\n'));
};

const toKiB = (h) => {
  const n = parseFloat(h);
  return Math.round(n * { K: 1, M: 1024, G: 1024 ** 2, T: 1024 ** 3 }[h.slice(-1)] || n);
};
const df = (c, args) => {
  const human = args.some((a) => /^-[a-z]*h/.test(a));
  const rows = c.w.df;
  if (human) return ok(unlines(['Filesystem      Size  Used Avail Use% Mounted on', ...rows.map((r) => `${r[0].padEnd(15)} ${r[1].padStart(4)} ${r[2].padStart(5)} ${r[3].padStart(5)} ${r[4].padStart(4)} ${r[5]}`)]));
  return ok(unlines(['Filesystem        1K-blocks       Used  Available Use% Mounted on', ...rows.map((r) => `${r[0].padEnd(15)} ${String(toKiB(r[1])).padStart(11)} ${String(toKiB(r[2])).padStart(10)} ${String(toKiB(r[3])).padStart(10)} ${r[4].padStart(4)} ${r[5]}`)]));
};

const free = (c, args) => {
  const m = c.w.mem;
  const unit = args.includes('-m') ? 1024 : args.includes('-g') ? 1024 ** 2 : 1;
  const h = args.includes('-h') || args.includes('--human');
  const f = (kib) => (h ? F.humanSize(kib * 1024).replace(/([KMGT])$/, 'i').replace(/^(.*)i$/, (_, x) => x) : String(Math.floor(kib / unit)));
  const hs = (kib) => (h ? `${(kib / 1024 / 1024).toFixed(1)}Gi` : String(Math.floor(kib / unit)));
  const cell = (v) => hs(v).padStart(h ? 11 : 12);
  return ok([
    `               total        used        free      shared  buff/cache   available`,
    `Mem:   ${cell(m.total)}${cell(m.used)}${cell(m.free)}${cell(m.shared)}${cell(m.buffcache)}${cell(m.available)}`,
    `Swap:  ${cell(0)}${cell(0)}${cell(0)}`,
    '',
  ].join('\n'));
};

const ip = (c, args) => {
  const mut = args.find((a) => ['set', 'add', 'del', 'delete', 'flush', 'replace', 'change', 'append', 'netns', 'tuntap', 'tunnel', 'link-add'].includes(a));
  if (mut) return fail(denial(c, 'ip'));
  const brief = args.some((a) => a === '-br' || a === '-brief' || a === '-b');
  const objs = args.filter((a) => !a.startsWith('-'));
  const obj = (objs[0] ?? 'addr').replace(/^a(ddr(ess)?)?$/, 'addr').replace(/^l(ink)?$/, 'link').replace(/^r(oute)?$/, 'route');
  const ifs = c.w.ifaces;
  if (obj === 'route') {
    const gw = c.w.ip.replace(/\.\d+$/, '.1');
    return ok(unlines([`default via ${gw} dev eno1np0 proto static`, `${c.w.ip.replace(/\.\d+$/, '.0')}/24 dev eno1np0 proto kernel scope link src ${c.w.ip}`, '10.64.0.0/16 dev br-guest proto kernel scope link src 10.64.0.1']));
  }
  if (obj === 'link' && brief) {
    return ok(unlines(ifs.map((i) => `${i.name.padEnd(16)} ${i.state.padEnd(14)} ${i.mac} <${i.flags}>`)));
  }
  if (obj === 'addr' && brief) {
    return ok(unlines(ifs.map((i) => `${i.name.padEnd(16)} ${i.state.padEnd(14)} ${i.addrs.join(' ')}`.trimEnd())));
  }
  if (obj === 'link' || obj === 'addr') {
    const out = [];
    ifs.forEach((i, idx) => {
      out.push(`${idx + 1}: ${i.name}: <${i.flags}> mtu ${i.name === 'lo' ? 65536 : 1500} qdisc ${i.name === 'lo' ? 'noqueue' : 'mq'} ${i.master ? `master ${i.master} ` : ''}state ${i.state} mode DEFAULT group default qlen 1000`);
      out.push(`    link/${i.name === 'lo' ? 'loopback' : 'ether'} ${i.mac} brd ${i.name === 'lo' ? '00:00:00:00:00:00' : 'ff:ff:ff:ff:ff:ff'}`);
      if (obj === 'addr') for (const a of i.addrs) out.push(`    inet ${a} scope ${i.name === 'lo' ? 'host' : 'global'} ${i.name}`);
    });
    return ok(unlines(out));
  }
  return fail(`Object "${objs[0]}" is unknown, try "ip help".`, 1);
};

const ss = (c, args) => {
  const a = args.join(' ');
  const listen = /l/.test(a.replace(/--/g, ''));
  const p = /p/.test(a);
  const rows = [];
  const proc = (n, pid, fd) => (p ? `users:(("${n}",pid=${pid},fd=${fd}))` : '');
  if (listen || /a/.test(a)) {
    rows.push(['LISTEN', 0, 128, '0.0.0.0:22', '0.0.0.0:*', proc('sshd', 902, 3)]);
    if (c.w.kind !== 'bmc') {
      rows.push(['LISTEN', 0, 4096, '127.0.0.1:8443', '0.0.0.0:*', proc('claura-agent', 1260, 7)]);
      rows.push(['LISTEN', 0, 4096, '*:9100', '*:*', proc('prometheus-node', 1342, 3)]);
    } else rows.push(['UNCONN', 0, 0, `${MGMT_IP}:623`, '0.0.0.0:*', proc('ipmid', 412, 5)]);
  }
  if (!listen || /a/.test(a)) {
    rows.push(['ESTAB', 0, 0, `${c.w.ip}:22`, '10.0.0.9:51234', proc('sshd', c.w.session.sshdPid ?? 9001, 4)]);
    if (c.w.kind !== 'bmc') rows.push(['ESTAB', 0, 0, `${c.w.ip}:41022`, '10.0.0.4:443', proc('claura-agent', 1260, 9)]);
  }
  const head = 'State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process';
  return ok(unlines([head, ...rows.map((r) => `${String(r[0]).padEnd(7)} ${String(r[1]).padEnd(7)} ${String(r[2]).padEnd(8)} ${String(r[3]).padStart(15)} ${String(r[4]).padStart(15)}  ${r[5]}`.trimEnd())]));
};

const lsmod = (c) => {
  if (c.w.kind === 'bmc') return fail('lsmod: command not found');
  const mods = [['nvidia_vgpu_vfio', 98304, 12], ['nvidia', 9961472, 188], ['vfio_pci', 16384, 13], ['vfio_pci_core', 94208, 1], ['vfio_iommu_type1', 49152, 1], ['vfio', 73728, 15], ['kvm_intel', 413696, 12], ['kvm', 1396736, 1], ['mlx5_core', 2588672, 0], ['br_netfilter', 32768, 0], ['bridge', 421888, 1], ['vhost_net', 32768, 12], ['tap', 28672, 12]];
  return ok(unlines(['Module                  Size  Used by', ...mods.map(([n, s, u]) => `${n.padEnd(22)} ${String(s).padStart(8)}  ${u}`)]));
};
const lspci = (c) => {
  if (c.w.kind === 'bmc') return fail('lspci: command not found');
  const g = c.w.gpus.map((x) => `${x.bus.slice(5, 12)} 3D controller: NVIDIA Corporation AD102GL [L40S] (rev a1)`);
  return ok(unlines(['00:00.0 Host bridge: Intel Corporation Device 1bbf (rev 07)', ...g, '81:00.0 Ethernet controller: Mellanox Technologies MT2892 Family [ConnectX-6 Dx]', '81:00.1 Ethernet controller: Mellanox Technologies MT2892 Family [ConnectX-6 Dx]', 'a1:00.0 Non-Volatile memory controller: Samsung Electronics Co Ltd NVMe SSD Controller PM9A1/PM9A3/980PRO']));
};

// ---------------------------------------------------------------------------------------- incident tools
const dmesg = (c, args) => {
  if (args.some((a) => ['-c', '-C', '--clear', '--read-clear', '-D', '-E', '-n', '--console-level'].includes(a))) return fail(denial(c, 'dmesg'));
  const human = args.some((a) => /^-[a-zA-Z]*T/.test(a) || a === '--ctime');
  const lvl = args.find((a) => a.startsWith('--level=') || a.startsWith('-l'));
  let levels = null;
  if (lvl) {
    const v = lvl.startsWith('--level=') ? lvl.slice(8) : args[args.indexOf(lvl) + 1] ?? lvl.slice(2);
    levels = new Set(v.split(',').map((x) => x.trim()));
  }
  const k = c.w.events.filter((e) => e.src === 'kernel' && (!levels || levels.has(e.prio === 'warning' ? 'warn' : e.prio)));
  const out = k.map((e) => (human ? `[${F.dmesgHuman(e.ts)}] ${e.msg}` : `[${c.w.kts(e.ts)}] ${e.msg}`));
  return ok(unlines(out));
};

const UNIT_ALIAS = { qemu: ['qemu'], 'qemu-kvm': ['qemu'], 'libvirt-qemu': ['qemu'], libvirtd: ['libvirtd'], 'claura-agent': ['claura-agent'], 'claura-edr': ['claura-edr'], sshd: ['sshd'], ssh: ['sshd'], 'nvidia-vgpu-mgr': ['nvidia-vgpu-mgr'], kernel: ['kernel'], ipmid: ['ipmid'], 'bmc-audit': ['bmc-audit'], audit: ['audit'] };
const PRIO = { emerg: 0, alert: 1, crit: 2, err: 3, error: 3, warning: 4, warn: 4, notice: 5, info: 6, debug: 7 };
const journalctl = (c, args) => {
  const o = getopt(args, { flags: 'rkbxf', vals: 'unop', long: { unit: 'u=', lines: 'n=', output: 'o=', priority: 'p=', 'no-pager': 'P', reverse: 'r', dmesg: 'k', utc: 'U', since: 'S=', until: 'T=', follow: 'f', boot: 'b', 'no-hostname': 'H', quiet: 'q', rotate: 'X', 'vacuum-size': 'Y=', 'vacuum-time': 'Y=', 'vacuum-files': 'Y=', flush: 'X', sync: 'X', verify: 'V' } });
  if (o.f.has('X') || o.v.Y !== undefined) return fail(denial(c, 'journalctl'));
  const units = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-u' || args[i] === '--unit') units.push(args[i + 1]);
    else if (/^-u\S+/.test(args[i])) units.push(args[i].slice(2));
    else if (args[i].startsWith('--unit=')) units.push(args[i].slice(7));
  }
  let ev = c.w.events;
  if (o.f.has('k')) ev = ev.filter((e) => e.src === 'kernel');
  if (units.length) {
    const want = new Set(units.flatMap((u) => UNIT_ALIAS[u.replace(/\.service$/, '')] ?? [`__none__${u}`]));
    ev = ev.filter((e) => want.has(e.unit));
  }
  if (o.v.p) {
    const max = PRIO[o.v.p.split('..').pop()] ?? 7;
    ev = ev.filter((e) => (PRIO[e.prio] ?? 6) <= max);
  }
  if (o.v.S) {
    const m = /^(\d+)\s*(s|sec|second|m|min|minute|h|hour|d|day)s?\s*ago$/.exec(o.v.S.trim());
    if (m) {
      const mult = { s: 1000, sec: 1000, second: 1000, m: 60_000, min: 60_000, minute: 60_000, h: 3_600_000, hour: 3_600_000, d: 86_400_000, day: 86_400_000 }[m[2]];
      ev = ev.filter((e) => e.ts >= c.now - parseInt(m[1], 10) * mult);
    } else if (o.v.S.trim() === 'today') {
      const t = F.parts(c.now);
      ev = ev.filter((e) => F.parts(e.ts).day === t.day);
    }
  }
  const n = o.v.n !== undefined ? parseInt(o.v.n, 10) : 300;
  if (Number.isFinite(n)) ev = ev.slice(-n);
  if (o.f.has('r')) ev = [...ev].reverse();
  if (!ev.length) return ok('-- No entries --\n');
  const mode = o.v.o ?? 'short';
  const fmt = (e) => {
    if (mode === 'cat') return e.msg;
    const t = mode === 'short-iso' ? new Date(e.ts).toISOString().replace('Z', '+0000').replace(/\.\d+/, '') : F.journalTime(e.ts);
    const who = e.src === 'kernel' ? 'kernel' : `${e.ident}${e.pid ? `[${e.pid}]` : ''}`;
    return `${t} ${o.f.has('H') ? '' : `${c.w.hostname} `}${who}: ${e.msg}`;
  };
  return ok(unlines(ev.map(fmt).map((l) => trunc(l, c, true))));
};

const virsh = (c, args) => {
  if (c.w.kind === 'bmc') return fail('virsh: command not found', 127);
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-c' || args[i] === '--connect') i++;
    else if (args[i] === '-r' || args[i] === '--readonly' || args[i] === '-q' || args[i] === '--quiet') continue;
    else rest.push(args[i]);
  }
  const sub = rest[0];
  const doms = c.w.domains;
  const MUT = new Set(['start', 'destroy', 'shutdown', 'suspend', 'resume', 'reboot', 'reset', 'undefine', 'define', 'create', 'save', 'restore', 'managedsave', 'migrate', 'attach-device', 'detach-device', 'attach-interface', 'detach-interface', 'attach-disk', 'detach-disk', 'snapshot-create', 'snapshot-create-as', 'snapshot-delete', 'snapshot-revert', 'setmem', 'setmaxmem', 'setvcpus', 'autostart', 'edit', 'dump', 'qemu-monitor-command', 'qemu-agent-command', 'blockcommit', 'blockpull', 'domrename', 'send-key', 'set-user-password', 'console', 'update-device', 'change-media', 'screenshot', 'inject-nmi', 'pool-destroy', 'net-destroy']);
  if (!sub || sub === 'help') return ok('Commands (read-only in this session): list, domstate, dominfo, domiflist, nodeinfo, version\n');
  if (MUT.has(sub)) return fail(`virsh ${sub}: ${c.mode === 'forensic' ? DENY_RO : DENY_OPS}`);
  if (sub === 'list') {
    const all = rest.includes('--all') || rest.includes('-a');
    const shown = doms.filter((d) => all || d.state !== 'shut off');
    const nameW = Math.max(4, ...shown.map((d) => d.name.length)) + 2;
    const line = (id, name, state) => ` ${String(id).padEnd(4)} ${name.padEnd(nameW)} ${state}`;
    return ok(unlines([line('Id', 'Name', 'State'), '-'.repeat(8 + nameW + 10), ...shown.map((d) => line(d.id ?? '-', d.name, d.state))]));
  }
  if (sub === 'nodeinfo') {
    return ok(['CPU model:           x86_64', 'CPU(s):              256', 'CPU frequency:       2400 MHz', 'CPU socket(s):       2', 'Core(s) per socket:  64', 'Thread(s) per core:  2', 'NUMA cell(s):        2', `Memory size:         ${c.w.mem.total} KiB`, ''].join('\n'));
  }
  if (sub === 'version') return ok('Compiled against library: libvirt 10.0.0\nUsing library: libvirt 10.0.0\nUsing API: QEMU 10.0.0\nRunning hypervisor: QEMU 8.2.2\n');
  const name = rest[1];
  if (['domstate', 'dominfo', 'domiflist'].includes(sub)) {
    if (!name) return fail(`error: command '${sub}' requires <domain> option`);
    const d = doms.find((x) => x.name === name);
    if (!d) return fail(`error: failed to get domain '${name}'`);
    if (sub === 'domstate') return ok(rest.includes('--reason') ? `${d.state} (${d.reason})\n` : `${d.state}\n`);
    if (sub === 'domiflist') {
      const rows = d.nic.attached ? [`${d.nic.name.padEnd(10)} bridge     br-guest   virtio      ${d.nic.mac}`] : [];
      return ok(unlines([' Interface   Type       Source     Model       MAC', '-------------------------------------------------------', ...rows]));
    }
    return ok([
      `Id:             ${d.id ?? '-'}`, `Name:           ${d.name}`, `UUID:           ${d.uuid}`, 'OS Type:        hvm', `State:          ${d.state}`, `CPU(s):         ${d.vcpus}`,
      ...(d.id ? [`CPU time:       ${d.cpuTimeS.toFixed(1)}s`] : []), `Max memory:     ${d.memKiB} KiB`, `Used memory:    ${d.state === 'shut off' ? 0 : d.memKiB} KiB`,
      'Persistent:     yes', 'Autostart:      disable', 'Managed save:   no', 'Security model: apparmor', 'Security DOI:   0',
      d.id ? `Security label: libvirt-${d.uuid} (enforcing)` : '', '',
    ].filter((l, i, arr) => l !== '' || i === arr.length - 1).join('\n'));
  }
  return fail(`error: unknown command: '${sub}'`);
};

const nvidia_smi = (c, args) => {
  if (c.w.kind === 'bmc') return fail('nvidia-smi: command not found', 127);
  if (args.includes('-L')) return ok(unlines(c.w.gpus.map((g) => `GPU ${g.idx}: ${g.name} (UUID: GPU-${uuidOf(`${c.w.hostId}/gpu${g.idx}`)})`)));
  if (args.some((a) => ['-r', '--gpu-reset', '-pm', '-e', '-c', '-pl', '--power-limit', '-ac', '-rac', '--lock-gpu-clocks', '--persistence-mode', '-i'].includes(a) && a !== '-i') || args.some((a) => /^--(?:ecc-config|compute-mode|applications-clocks)/.test(a))) {
    return fail(denial(c, 'nvidia-smi'));
  }
  const W = 91;
  const cells = (a, b, d) => `|${a.padEnd(41)}|${b.padEnd(24)}|${d.padEnd(22)}|`;
  const rule = (ch, mid = '+') => `${mid}${ch.repeat(41)}${mid}${ch.repeat(24)}${mid}${ch.repeat(22)}${mid}`;
  const out = [];
  out.push(F.dateFull(c.now).replace(/ [A-Z]{3} (\d{4})$/, ' $1').padEnd(30));
  out.push(`+${'-'.repeat(W - 2)}+`);
  out.push(`| ${'NVIDIA-SMI 570.124.06'.padEnd(33)}${'Driver Version: 570.124.06'.padEnd(26)}${'CUDA Version: 12.8'.padEnd(18)}  |`);
  out.push(rule('-', '|').replace(/\|/g, (m, i) => (i === 0 || i === W - 1 ? '|' : '+')));
  out.push(cells(' GPU  Name                 Persistence-M ', ' Bus-Id          Disp.A ', ' Volatile Uncorr. ECC '));
  out.push(cells(' Fan  Temp   Perf          Pwr:Usage/Cap ', '           Memory-Usage ', ' GPU-Util  Compute M. '));
  out.push(cells('                                         ', '                        ', '               MIG M. '));
  out.push(rule('=', '|').replace(/\|/g, (m, i) => (i === 0 || i === W - 1 ? '|' : '+')).replace(/-/g, '='));
  c.w.gpus.forEach((g, i) => {
    out.push(cells(`   ${g.idx}  ${g.name.padEnd(22)}    On  `, ` ${g.bus} Off `, '                    0 '));
    out.push(cells(` N/A   ${String(g.tempC).padStart(2)}C    P0   ${String(g.powerW).padStart(10)}W / ${String(g.capW).padStart(4)}W `, ` ${String(g.memUsed).padStart(7)}MiB / ${String(g.memTotal).padStart(6)}MiB `, ` ${String(g.util).padStart(6)}%      Default `));
    out.push(cells('                                         ', '                        ', '                  N/A '));
    out.push(rule('-'));
  });
  out.push('');
  out.push(`+${'-'.repeat(W - 2)}+`);
  out.push(`| ${'Processes:'.padEnd(W - 4)} |`);
  out.push(`| ${' GPU   GI   CI              PID   Type   Process name'.padEnd(W - 4 - 12)}${'GPU Memory '.padStart(12)} |`);
  out.push(`| ${'       ID   ID                                                               Usage      '.slice(0, W - 4)} |`);
  out.push(`|${'='.repeat(W - 2)}|`);
  const procs = c.w.gpus.flatMap((g) => g.procs.map((p) => ({ g: g.idx, ...p })));
  if (!procs.length) out.push(`| ${'  No running processes found'.padEnd(W - 4)} |`);
  for (const p of procs) {
    out.push(`| ${String(p.g).padStart(4)}   N/A  N/A ${String(p.pid).padStart(14)}   ${p.type.padStart(4)}   ${p.name.padEnd(36)}${(`${p.mem}MiB`).padStart(10)} |`);
  }
  out.push(`+${'-'.repeat(W - 2)}+`);
  return ok(unlines(out));
};

const UNITS = {
  libvirtd: ['libvirt legacy monolithic daemon', 1180, 'libvirtd', '/usr/sbin/libvirtd --timeout 120'],
  'claura-agent': ['Claura host agent (Sentry/Warden endpoint)', 1260, 'claura-agent', `/opt/claura/agent/claura-agent --host`],
  'claura-edr': ['Claura host EDR', 811, 'claura-edr', '/opt/claura/edr/claura-edr --config /etc/claura/edr.yaml'],
  sshd: ['OpenBSD Secure Shell server (certificates only)', 902, 'sshd', '/usr/sbin/sshd -D'],
  'nvidia-vgpu-mgr': ['NVIDIA vGPU Manager Daemon', 1204, 'nvidia-vgpu-mgr', '/usr/bin/nvidia-vgpu-mgr'],
  ipmid: ['IPMI RMCP+ daemon', 412, 'ipmid', '/usr/bin/ipmid'],
};
const systemctl = (c, args) => {
  const verb = args.find((a) => !a.startsWith('-'));
  const MUT = ['start', 'stop', 'restart', 'reload', 'try-restart', 'enable', 'disable', 'mask', 'unmask', 'daemon-reload', 'kill', 'reset-failed', 'isolate', 'edit', 'set-property', 'poweroff', 'reboot', 'halt', 'suspend', 'link', 'revert', 'preset'];
  if (MUT.includes(verb)) return fail(`systemctl ${verb}: ${c.mode === 'forensic' ? DENY_RO : DENY_OPS}`);
  if (verb === 'is-active') {
    const u = args[args.indexOf(verb) + 1]?.replace(/\.service$/, '');
    return { out: UNITS[u] ? 'active\n' : 'inactive\n', code: UNITS[u] ? 0 : 3 };
  }
  if (verb === 'status') {
    const u = (args[args.indexOf(verb) + 1] ?? '').replace(/\.service$/, '');
    const def = UNITS[u];
    if (!def) return fail(`Unit ${u || '(none)'}.service could not be found.`, 4);
    const ev = c.w.events.filter((e) => e.unit === u || (u === 'qemu' && e.unit === 'qemu')).slice(-4);
    return ok([
      `● ${u}.service - ${def[0]}`,
      `     Loaded: loaded (/usr/lib/systemd/system/${u}.service; enabled; preset: enabled)`,
      `     Active: active (running) since ${F.dmesgHuman(c.w.bootMs + 12_000)} ${F.parts(c.w.bootMs).tz}; ${F.uptimePretty(c.w.uptimeMs).replace('up ', '')} ago`,
      `   Main PID: ${def[1]} (${def[2]})`,
      '      Tasks: 21 (limit: 38312)',
      '     Memory: 46.9M (peak: 112.4M)',
      `     CGroup: /system.slice/${u}.service`,
      `             └─${def[1]} ${def[3]}`,
      '',
      ...ev.map((e) => `${F.journalTime(e.ts)} ${c.w.hostname} ${e.ident}[${e.pid}]: ${e.msg}`),
      '',
    ].join('\n'));
  }
  if (verb === 'list-units' || verb === undefined) {
    return ok(unlines(['  UNIT                  LOAD   ACTIVE SUB     DESCRIPTION', ...Object.entries(UNITS).map(([u, d]) => `  ${(`${u}.service`).padEnd(21)} loaded active running ${d[0]}`)]));
  }
  return fail(`Unknown command verb '${verb}'.`, 1);
};

const ipmitool = (c, args) => {
  if (c.w.kind !== 'bmc') return fail('Could not open device at /dev/ipmi0 or /dev/ipmi/0 or /dev/ipmidev/0: No such file or directory');
  const rest = args.filter((a, i) => !(a === '-I' || args[i - 1] === '-I' || a === '-H' || args[i - 1] === '-H' || a === '-U' || args[i - 1] === '-U' || a === '-P' || args[i - 1] === '-P'));
  const [a, b] = rest;
  const mut = (a === 'power' && b && b !== 'status') || (a === 'chassis' && ['power', 'identify', 'policy', 'bootdev', 'bootparam'].includes(b) && rest[2] !== 'status') || a === 'raw' || (a === 'user' && b !== 'list' && b !== 'summary') || (a === 'lan' && b === 'set') || (a === 'sel' && ['clear', 'delete', 'time'].includes(b)) || (a === 'mc' && b === 'reset') || a === 'sol' || a === 'bmc' || a === 'sunoem' || a === 'fru' && b === 'write';
  if (mut) return fail(`ipmitool ${rest.join(' ')}: ${c.mode === 'forensic' ? DENY_RO : DENY_OPS}`);
  if (a === 'power' && b === 'status') return ok('Chassis Power is on\n');
  if (a === 'chassis') return ok(['System Power         : on', 'Power Overload       : false', 'Power Interlock      : inactive', 'Main Power Fault     : false', 'Power Control Fault  : false', 'Power Restore Policy : always-on', 'Last Power Event     : ', 'Chassis Intrusion    : inactive', 'Front-Panel Lockout  : inactive', 'Drive Fault          : false', 'Cooling/Fan Fault    : false', ''].join('\n'));
  if (a === 'lan') {
    return ok(['Set in Progress         : Set Complete', 'IP Address Source       : Static Address', `IP Address              : ${MGMT_IP}`, 'Subnet Mask             : 255.255.255.0', `MAC Address             : ${c.w.ifaces[1].mac}`, '802.1q VLAN ID          : 40', 'RMCP+ Cipher Suites     : 3,17', 'Cipher Suite Priv Max   : XaaaXXaaaXXaaXX', ''].join('\n'));
  }
  if (a === 'user') return ok(['ID  Name\t     Callin  Link Auth\tIPMI Msg   Channel Priv Limit', '1   admin            true    true       true       ADMINISTRATOR', '2   claura-ro        true    false      false      USER', '3   (Empty User)     true    false      false      NO ACCESS', ''].join('\n'));
  if (a === 'mc') return ok(['Device ID                 : 32', 'Device Revision           : 1', 'Firmware Revision         : 2.14', 'IPMI Version              : 2.0', 'Manufacturer ID           : 7244', 'Product ID                : 1 (0x0001)', ''].join('\n'));
  if (a === 'sel') {
    const t = (ms) => `${String(F.parts(ms).month).padStart(2, '0')}/${String(F.parts(ms).day).padStart(2, '0')}/${F.parts(ms).year} | ${F.clock(ms)}`;
    return ok(unlines([
      `   1 | 09/12/2026 | 14:02:11 | Event Logging Disabled #0x72 | Log area reset/cleared | Asserted`,
      `   2 | ${t(c.w.T(0.7))} | Session Audit #0x7e | RMCP+ open-session request from 10.0.14.7, not activated | Asserted`,
      `   3 | ${t(c.w.T(0.72))} | Session Audit #0x7e | 0 successful logins, 0 configuration changes | Deasserted`,
      `   4 | ${t(c.w.T(2.4))} | Physical Security #0x7a | Mgmt ACL: flow from 10.0.14.7 dropped | Asserted`,
    ]));
  }
  if (a === 'sdr' || a === 'sensor') {
    return ok(unlines(['Inlet Temp        | 24 degrees C      | ok', 'Exhaust Temp      | 33 degrees C      | ok', 'Fan1              | 7320 RPM          | ok', 'Fan2              | 7260 RPM          | ok', 'PSU1 Status       | 0x01              | ok', 'PSU2 Status       | 0x01              | ok', 'Mgmt LAN Link     | 0x01              | ok']));
  }
  return fail(`Invalid command: ${rest.join(' ')}`);
};

export const COMMANDS = {
  help, 'claura-session': claura_session, session: claura_session,
  echo, printf, whoami, id: idcmd, groups, hostname, uname, date, uptime, who, w: w_, last, env, printenv, history, which, type: which, man, nproc,
  true: trueCmd, false: falseCmd, sleep, clear,
  ls, dir: ls, cat, less: cat, more: cat, head, tail, wc, grep, egrep: (c, a, s) => grep(c, ['-E', ...a], s), fgrep: (c, a, s) => grep(c, ['-F', ...a], s),
  sort, uniq, cut, tr, awk, sed, tee, stat, sha256sum, find,
  ps, top, df, free, ip, ss, lsmod, lspci, dmesg, journalctl, virsh, 'nvidia-smi': nvidia_smi, systemctl, ipmitool,
};
export const BUILTIN_NAMES = new Set(['cd', 'exit', 'logout', 'export', 'pwd', 'history', 'type', 'unset', 'alias', 'set', 'read', 'return', 'test', '[', 'command']);

export { hexOf, EVIDENCE, GUESTS, INCIDENT_ID, SUSPECT_VM };

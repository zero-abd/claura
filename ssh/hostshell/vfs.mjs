// A small in-memory filesystem for the host shell simulator: the files an incident responder would
// look at (logs, the sealed evidence directory, a few /etc and /proc files). Read-only in forensic
// mode; in operator mode a scratch overlay under /tmp and the home directory is writable.
import * as F from './fmt.mjs';
import { EVIDENCE, INCIDENT_ID } from './world.mjs';

const isoLocal = (ms) => {
  const t = F.parts(ms);
  const off = t.tz === 'CDT' ? '-05:00' : '-06:00';
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${t.year}-${p(t.month)}-${p(t.day)}T${t.hh}:${t.mm}:${t.ss}.${p(ms % 1000, 3)}${off}`;
};
const isoUtc = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '+0000');

const COLLATE = new Intl.Collator('en', { ignorePunctuation: true });
const LEVEL = { err: 'ERROR', warning: 'WARN', notice: 'INFO', info: 'INFO' };

export class Vfs {
  constructor(world) {
    this.w = world;
    this.nodes = new Map();
    this.kids = new Map();
    this.overlay = new Map();
    this.home = `/home/${world.user}`;
    this.#build();
  }

  // ------------------------------------------------------------------ path helpers
  resolve(p, cwd = '/') {
    let path = p === '~' || p.startsWith('~/') ? this.home + p.slice(1) : p;
    if (!path.startsWith('/')) path = `${cwd}/${path}`;
    const out = [];
    for (const seg of path.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return `/${out.join('/')}`;
  }
  #parent(p) {
    const i = p.lastIndexOf('/');
    return i <= 0 ? '/' : p.slice(0, i);
  }

  #add(path, node) {
    this.nodes.set(path, node);
    let child = path;
    while (child !== '/') {
      const parent = this.#parent(child);
      if (!this.kids.has(parent)) this.kids.set(parent, new Set());
      this.kids.get(parent).add(child.slice(child.lastIndexOf('/') + 1));
      if (!this.nodes.has(parent)) this.nodes.set(parent, this.#dir({}));
      child = parent;
    }
  }
  #dir(o) {
    return { type: 'd', mode: 'rwxr-xr-x', owner: 'root', group: 'root', size: 4096, mtime: this.w.bootMs + 60_000, ...o };
  }
  #file(content, o = {}) {
    return { type: 'f', mode: 'rw-r--r--', owner: 'root', group: 'root', mtime: this.w.bootMs + 60_000, content, ...o };
  }

  // ------------------------------------------------------------------ queries
  stat(p) {
    return this.overlay.get(p) ?? this.nodes.get(p) ?? null;
  }
  exists(p) {
    return this.stat(p) !== null;
  }
  list(p) {
    const names = new Set(this.kids.get(p) ?? []);
    for (const k of this.overlay.keys()) if (this.#parent(k) === p) names.add(k.slice(k.lastIndexOf('/') + 1));
    return [...names].sort(COLLATE.compare);
  }
  sizeOf(node) {
    if (node.type === 'd') return node.size ?? 4096;
    if (node.size !== undefined) return node.size;
    const c = typeof node.content === 'function' ? node.content() : node.content;
    return Buffer.byteLength(c ?? '');
  }
  /** @returns {{ok:true,data:string}|{ok:false,err:string}} */
  read(p) {
    const n = this.stat(p);
    if (!n) return { ok: false, err: 'No such file or directory' };
    if (n.type === 'd') return { ok: false, err: 'Is a directory' };
    if (n.sealed) return { ok: false, err: 'Operation not permitted (sealed evidence: binary object, use sha256sum or the manifest)' };
    if (n.denyRead) return { ok: false, err: 'Permission denied' };
    return { ok: true, data: typeof n.content === 'function' ? n.content() : n.content ?? '' };
  }
  canWrite(p) {
    return p.startsWith('/tmp/') || p === '/tmp' || p.startsWith(`${this.home}/`);
  }
  write(p, data, append = false) {
    if (!this.canWrite(p)) return 'Permission denied';
    const parent = this.stat(this.#parent(p));
    if (!parent || parent.type !== 'd') return 'No such file or directory';
    const prev = this.overlay.get(p);
    if (prev?.type === 'd') return 'Is a directory';
    const old = append && prev ? prev.content : '';
    this.overlay.set(p, { type: 'f', mode: 'rw-r--r--', owner: this.w.user, group: this.w.user, mtime: Date.now(), content: old + data });
    return null;
  }
  mkdir(p) {
    if (!this.canWrite(p)) return 'Permission denied';
    if (this.exists(p)) return 'File exists';
    this.overlay.set(p, { type: 'd', mode: 'rwxr-xr-x', owner: this.w.user, group: this.w.user, size: 4096, mtime: Date.now() });
    return null;
  }
  remove(p) {
    if (!this.overlay.has(p)) return this.exists(p) ? 'Permission denied' : 'No such file or directory';
    this.overlay.delete(p);
    return null;
  }

  glob(pattern, cwd) {
    const abs = this.resolve(pattern, cwd);
    const segs = abs.split('/').filter(Boolean);
    let paths = ['/'];
    for (const seg of segs) {
      const next = [];
      const re = /[*?[]/.test(seg) ? new RegExp(`^${seg.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`) : null;
      for (const base of paths) {
        if (!re) {
          const cand = base === '/' ? `/${seg}` : `${base}/${seg}`;
          if (this.exists(cand)) next.push(cand);
        } else if (this.stat(base)?.type === 'd') {
          for (const name of this.list(base)) {
            if (name.startsWith('.') && !seg.startsWith('.')) continue;
            if (re.test(name)) next.push(base === '/' ? `/${name}` : `${base}/${name}`);
          }
        }
      }
      paths = next;
      if (!paths.length) break;
    }
    return paths.sort();
  }

  // ------------------------------------------------------------------ content
  #build() {
    const w = this.w;
    const host = w.hostname;
    const bmc = w.kind === 'bmc';
    const T = w.T;
    const sysline = (e) => {
      if (e.src === 'kernel') return `${F.syslogTime(e.ts)} ${host} kernel: [${w.kts(e.ts)}] ${e.msg}`;
      return `${F.syslogTime(e.ts)} ${host} ${e.ident}${e.pid ? `[${e.pid}]` : ''}: ${e.msg}`;
    };
    const joinLines = (arr) => (arr.length ? `${arr.join('\n')}\n` : '');

    for (const d of ['/bin', '/boot', '/dev', '/lib', '/opt', '/root', '/run', '/sbin', '/srv', '/sys', '/usr', '/usr/bin', '/usr/sbin', '/usr/lib', '/mnt', '/media']) {
      this.#add(d, this.#dir({ mode: d === '/root' ? 'rwx------' : 'rwxr-xr-x' }));
    }
    this.#add('/tmp', this.#dir({ mode: 'rwxrwxrwx', group: 'root', mtime: w.now }));
    this.#add('/home', this.#dir({}));
    this.#add(this.home, this.#dir({ owner: w.user, group: w.user, mode: 'rwxr-x---', mtime: w.session.startedMs }));
    this.#add(`${this.home}/README.txt`, this.#file(
      () => [
        'Claura Secure Shell: just-in-time session',
        '',
        `  host       ${host}`,
        `  principal  ${w.session.principal}`,
        `  mode       ${w.session.mode === 'forensic' ? 'FORENSIC READ-ONLY (every state-changing command is denied by policy)' : 'OPERATOR (read-only diagnostics + scratch space in /tmp)'}`,
        `  cert       serial ${w.session.serial}, id ${w.session.certId}`,
        `  expires    ${F.stamp(w.session.validBeforeMs)}`,
        '',
        'Everything you type and see is recorded and hash-chained into the incident log.',
        "Run 'claura-session' for details, 'help' for commands.",
        '',
      ].join('\n'),
      { owner: w.user, group: w.user, mtime: w.session.startedMs },
    ));

    this.#add('/etc/hostname', this.#file(`${host}\n`));
    this.#add('/etc/hosts', this.#file(`127.0.0.1 localhost\n${w.ip} ${w.fqdn} ${host}\n${bmc ? '' : '10.0.0.1 mgmt-bmc-01.dfw2.claura.internal mgmt-bmc-01\n'}`));
    this.#add('/etc/os-release', this.#file(
      bmc
        ? 'NAME="OpenBMC"\nVERSION="2.14"\nID=openbmc\nPRETTY_NAME="OpenBMC 2.14 (claura-bmc)"\n'
        : 'PRETTY_NAME="Ubuntu 24.04.2 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.2 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\n',
    ));
    this.#add('/etc/passwd', this.#file(
      'root:x:0:0:root:/root:/bin/bash\nlibvirt-qemu:x:64055:64055:Libvirt Qemu,,,:/var/lib/libvirt:/usr/sbin/nologin\nclaura-w:x:1500:1500:Claura Warden service:/home/claura-w:/usr/sbin/nologin\nforensics:x:2001:2001:Claura forensic read-only principal:/home/forensics:/usr/local/bin/claura-shell\noperator:x:2002:2002:Claura operator principal:/home/operator:/usr/local/bin/claura-shell\n',
    ));
    this.#add('/etc/claura/policy.yaml', this.#file(() => [
      '# Claura host policy, pushed by claura-agent',
      `host: ${host}`,
      `status: ${w.kind === 'gpu-suspect' ? (w.quarantined ? 'quarantined' : 'cordoned') : 'healthy'}`,
      `incident: ${w.kind === 'gpu-suspect' ? INCIDENT_ID : 'none'}`,
      'ssh:',
      '  ca: claura-user-ca            # certificates only, no keys, no passwords',
      `  principals: [${w.kind === 'gpu-suspect' ? 'forensics' : 'operator, forensics'}]`,
      `  forensic_read_only: ${w.session.mode === 'forensic'}`,
      '  recording: required           # gateway records and hash-chains every session',
      '  max_cert_minutes: 15',
      '',
    ].join('\n')));
    this.#add('/etc/claura/host.yaml', this.#file(`role: ${w.kind}\nwhere: ${w.meta.where}\nmgmt_ip: ${w.ip}\nmgmt_plane: BMC ${'10.0.0.1'}:623 (IPMI, mgmt VLAN 40)\n`));

    this.#add('/proc/uptime', this.#file(() => `${(w.uptimeMs / 1000).toFixed(2)} ${(w.uptimeMs / 1000 * 0.97).toFixed(2)}\n`, { mtime: w.now }));
    this.#add('/proc/loadavg', this.#file(() => `${w.load.map((x) => x.toFixed(2)).join(' ')} 2/${w.procs.length + 340} ${w.session.pid ?? 9002}\n`, { mtime: w.now }));
    this.#add('/proc/version', this.#file(`${w.os.full.replace(`${host} `, '').replace('GNU/Linux', '')}\n`));
    this.#add('/proc/meminfo', this.#file(() => [
      `MemTotal:       ${String(w.mem.total).padStart(10)} kB`,
      `MemFree:        ${String(w.mem.free).padStart(10)} kB`,
      `MemAvailable:   ${String(w.mem.available).padStart(10)} kB`,
      `Buffers:        ${String(Math.round(w.mem.buffcache * 0.1)).padStart(10)} kB`,
      `Cached:         ${String(Math.round(w.mem.buffcache * 0.9)).padStart(10)} kB`,
      `HugePages_Total:${String(w.kind === 'bmc' ? 0 : 384).padStart(10)}`,
      '',
    ].join('\n'), { mtime: w.now }));

    if (!bmc) {
      this.#add('/var/log/syslog', this.#file(() => joinLines(w.events.map(sysline))));
      this.#add('/var/log/kern.log', this.#file(() => joinLines(w.events.filter((e) => e.src === 'kernel').map(sysline))));
      this.#add('/var/log/auth.log', this.#file(() => joinLines(w.events.filter((e) => e.unit === 'sshd' || e.unit === 'audit').map(sysline)), { group: 'adm', mode: 'rw-r-----' }));
      this.#add('/var/log/claura/agent.log', this.#file(() => joinLines(w.events.filter((e) => e.unit === 'claura-agent').map((e) => `${isoLocal(e.ts)} ${LEVEL[e.prio] ?? 'INFO'} ${e.msg}`))));
      this.#add('/var/log/claura/edr.log', this.#file(() => joinLines(w.events.filter((e) => e.unit === 'claura-edr').map((e) =>
        JSON.stringify({ ts: isoLocal(e.ts), level: e.prio === 'err' ? 'alert' : 'info', host, msg: e.msg })))));
      this.#add('/var/log/libvirt/libvirtd.log', this.#file(() => joinLines(w.events.filter((e) => e.unit === 'libvirtd').map((e) => `${isoUtc(e.ts)}: ${e.pid}: ${e.prio === 'err' ? 'error' : 'info'} : ${e.msg}`))));
      this.#add('/var/lib/libvirt/images', this.#dir({ owner: 'libvirt-qemu', group: 'kvm' }));
    }
    if (w.kind === 'gpu-suspect') {
      this.#add('/var/log/libvirt/qemu/vm-7f3a.log', this.#file(() => joinLines([
        `${isoUtc(T(-3 * 3600))}: starting up libvirt version: 10.0.0, package: 10.0.0-2ubuntu8.5 (Ubuntu), qemu version: 8.2.2Debian 1:8.2.2+ds-0ubuntu1.4, kernel: 6.8.0-52-generic, hostname: ${host}`,
        'LC_ALL=C PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/qemu-system-x86_64 -name guest=vm-7f3a,debug-threads=on -S ...',
        `char device redirected to /dev/pts/4 (label charserial0)`,
        ...w.events.filter((e) => e.unit === 'qemu' || (e.unit === 'libvirtd' && /vm-7f3a/.test(e.msg))).map((e) => `${isoUtc(e.ts)}: ${e.msg}`),
      ]), { owner: 'libvirt-qemu', group: 'kvm', mode: 'rw-r-----' }));
      this.#add('/var/lib/libvirt/images/vm-7f3a.qcow2', this.#file('', { size: 214_748_364_800, owner: 'libvirt-qemu', group: 'kvm', mode: 'rw-------', sealed: true, mtime: T(3.8) }));
      this.#add('/var/lib/claura/evidence', this.#dir({ owner: 'root', group: 'evidence', mode: 'rwxr-x---', mtime: T(5.2) }));
      for (const e of EVIDENCE) {
        this.#add(`/var/lib/claura/evidence/${e.name}`, this.#file('', { size: e.bytes, owner: 'root', group: 'evidence', mode: 'r--r-----', sealed: true, mtime: T(e.atSec), sha256: e.sha256 }));
      }
      this.#add('/var/lib/claura/evidence/MANIFEST.txt', this.#file(() => [
        `# Claura evidence manifest · ${INCIDENT_ID} · ${host}`,
        '# Captured by claura-warden over the trusted management path (out-of-band), not the guest network.',
        '# Objects are sealed (root:evidence 0440). The console shows these hashes abbreviated.',
        '#',
        '# sha256                                                            size         name',
        ...EVIDENCE.map((e) => `${e.sha256}  ${String(e.bytes).padStart(11)}  ${e.name}`),
        '',
      ].join('\n'), { group: 'evidence', mode: 'r--r-----', mtime: T(5.2) }));
      this.#add('/var/lib/claura/evidence/CHAIN_OF_CUSTODY.txt', this.#file(() => [
        `# Chain of custody · ${INCIDENT_ID} · ${host}`,
        ...EVIDENCE.map((e) => `${F.stamp(T(e.atSec))}  claura-warden (policy: auto, reversible)  captured ${e.name}  sha256 ${e.sha256.slice(0, 8)}...${e.sha256.slice(-8)}`),
        `${F.stamp(T(5.2))}  claura-scribe  sealed evidence directory (root:evidence 0440)`,
        `${F.stamp(w.session.startedMs)}  ${w.session.principal}  opened ${w.session.mode} session via SSH certificate serial ${w.session.serial} (${w.session.certId})`,
        '',
      ].join('\n'), { group: 'evidence', mode: 'r--r-----', mtime: w.session.startedMs }));
    }
    if (w.kind === 'bmc') {
      this.#add('/var/log/ipmi/auth.log', this.#file(() => joinLines(w.events.filter((e) => e.unit === 'ipmid' || e.unit === 'bmc-audit').map((e) => `${isoLocal(e.ts)} ${e.ident}[${e.pid}] ${e.msg}`))));
      this.#add('/etc/bmc/audit.yaml', this.#file('listen: 10.0.0.1:623\nlog: /var/log/ipmi/auth.log\nrecord_config_hash: true\n'));
    }
    if (w.kind.startsWith('gpu')) {
      for (const d of w.domains) {
        this.#add(`/var/lib/libvirt/images/${d.name}.qcow2`, this.#file('', { size: 214_748_364_800, owner: 'libvirt-qemu', group: 'kvm', mode: 'rw-------', sealed: true, mtime: w.bootMs + 86_400_000 }));
      }
    }
    // scratch dir in /tmp that exists on every host
    this.#add('/tmp/.keep', this.#file('', { mtime: w.bootMs }));
  }
}

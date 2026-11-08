// The simulated machines behind the Secure Shell demo.
//
// Everything here is consistent with the INC-0419 story the console tells (6 signals in 0.85 s,
// reversible containment, guest memory captured, 11 guests failed over, quarantine approved at
// +7.4 s, contained at +9.4 s) and with the SpacetimeDB seed data (hosts, guest VM names).
// All of it is SIMULATED: these are not real logs. Times are anchored on `t0` (the first signal)
// so `date`, `uptime`, `dmesg` and the log files agree with each other.
import { createHash } from 'node:crypto';
import * as F from './fmt.mjs';

export const INCIDENT_ID = 'INC-0419';
export const SUSPECT_HOST = 'b14-gpu-07';
export const SUSPECT_VM = 'vm-7f3a';
export const MGMT_IP = '10.0.0.1';

// Same 12 guests the SpacetimeDB seed puts on b14-gpu-07.
export const GUESTS = [
  ['vm-7f3a', 'agent-7f3'],
  ['vm-2b91', 'llm-inference-prod'],
  ['vm-4c0e', 'embedding-service'],
  ['vm-5d17', 'rag-retriever'],
  ['vm-6a42', 'finetune-llama-batch'],
  ['vm-8e03', 'vision-batch'],
  ['vm-91bc', 'recsys-ranker'],
  ['vm-a3d5', 'speech-asr'],
  ['vm-b7f8', 'eval-harness'],
  ['vm-c14a', 'vector-index-build'],
  ['vm-d62e', 'tenant-sandbox-21'],
  ['vm-e9a0', 'kv-cache-warm'],
];
const FAILOVER_TARGET = {
  'vm-2b91': 'c05-gpu-02', 'vm-4c0e': 'c05-gpu-02', 'vm-5d17': 'c05-gpu-02',
  'vm-6a42': 'c05-gpu-02', 'vm-8e03': 'c05-gpu-02', 'vm-91bc': 'c05-gpu-02',
  'vm-a3d5': 'c12-gpu-04', 'vm-b7f8': 'c12-gpu-04', 'vm-c14a': 'c12-gpu-04',
  'vm-d62e': 'c12-gpu-04', 'vm-e9a0': 'c12-gpu-04',
};
const NATIVE_GUESTS = {
  'c05-gpu-02': [['vm-1a07', 'ocr-pipeline'], ['vm-3c58', 'ads-ranker'], ['vm-7d21', 'tenant-sandbox-08']],
  'c12-gpu-04': [['vm-0b64', 'translate-batch'], ['vm-5e19', 'tenant-sandbox-14'], ['vm-9a3c', 'code-eval-farm'], ['vm-bd70', 'feature-store']],
};

export const HOST_META = {
  'b14-gpu-07': { kind: 'gpu-suspect', ip: '10.0.14.7', where: 'DFW-2 Hall B rack 14', slot: 7, ramGiB: 512, gpus: 4, cores: 128 },
  'c05-gpu-02': { kind: 'gpu-healthy', ip: '10.0.5.2', where: 'DFW-2 Hall C rack 05', slot: 2, ramGiB: 512, gpus: 4, cores: 128 },
  'c12-gpu-04': { kind: 'gpu-healthy', ip: '10.0.12.4', where: 'DFW-2 Hall C rack 12', slot: 4, ramGiB: 512, gpus: 4, cores: 128 },
  'mgmt-bmc-01': { kind: 'bmc', ip: MGMT_IP, where: 'DFW-2 Hall B management VLAN 40', slot: 1, ramGiB: 4, gpus: 0, cores: 4 },
};

export const hexOf = (seed, n = 64) => createHash('sha256').update(String(seed)).digest('hex').slice(0, n);
export function longHex(seed) {
  let h = '';
  for (let i = 0; h.length < 64; i++) h += hexOf(`${seed}/${i}`);
  return h.slice(0, 64);
}
export const uuidOf = (seed) => {
  const h = hexOf(`uuid/${seed}`, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const macOf = (seed, prefix = '52:54:00') => {
  const h = hexOf(`mac/${seed}`, 6);
  return `${prefix}:${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}`;
};

// Evidence hashes shown abbreviated in the console (9f3c…e1a0 and so on); here are the full values.
const abbr = (full, head, tail) => head + full.slice(4, 60) + tail;
export const EVIDENCE = [
  { name: 'vm-7f3a.mem', bytes: 68_719_476_736, label: '64 GiB', sha256: abbr(longHex('claura/evidence/vm-7f3a.mem'), '9f3c', 'e1a0'), atSec: 4.6, what: 'guest memory, captured over the trusted management path' },
  { name: 'qemu-2231.core', bytes: 1_288_490_189, label: '1.2 GiB', sha256: abbr(longHex('claura/evidence/qemu-2231.core'), '41be', '07d2'), atSec: 4.9, what: 'core of the VMM process (pid 2231)' },
  { name: 'b14-gpu-07-flows.pcap', bytes: 39_845_888, label: '38 MB', sha256: abbr(longHex('claura/evidence/b14-gpu-07-flows.pcap'), 'c0a7', '5f19'), atSec: 5.1, what: 'east-west flow capture, mgmt VLAN 40' },
];

/** @returns {object} a self-consistent description of one machine at time `now`. */
export function buildWorld({ hostId, t0, now, phase = 'quarantined', session }) {
  const meta = HOST_META[hostId];
  if (!meta) throw new Error(`unknown host ${hostId}`);
  const kind = meta.kind;
  const quarantined = kind === 'gpu-suspect' && phase === 'quarantined';
  const T = (sec) => t0 + Math.round(sec * 1000);
  const bootMs = t0 - (kind === 'bmc' ? 143 : 38) * 86_400_000 - 4 * 3_600_000 - 12 * 60_000 - 41_000;
  const uptimeMs = now - bootMs;
  const kts = (ms) => ((ms - bootMs) / 1000).toFixed(6).padStart(12, ' ');

  const user = session.user; // forensics | operator
  const world = {
    hostId, kind, meta, t0, now, phase, quarantined, session, user, bootMs, uptimeMs,
    hostname: hostId,
    fqdn: `${hostId}.dfw2.claura.internal`,
    ip: meta.ip,
    os: kind === 'bmc'
      ? { pretty: 'OpenBMC 2.14 (claura-bmc)', id: 'openbmc', kernel: '6.6.37-bmc', full: 'Linux mgmt-bmc-01 6.6.37-bmc #1 SMP PREEMPT Tue Mar 4 11:02:19 UTC 2025 armv7l GNU/Linux', arch: 'armv7l' }
      : { pretty: 'Ubuntu 24.04.2 LTS', id: 'ubuntu', kernel: '6.8.0-52-generic', full: `Linux ${hostId} 6.8.0-52-generic #53-Ubuntu SMP PREEMPT_DYNAMIC Sat Jan 11 00:06:25 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux`, arch: 'x86_64' },
    kts,
    T,
  };

  world.domains = buildDomains(world);
  world.ifaces = buildIfaces(world);
  world.gpus = buildGpus(world);
  world.events = buildEvents(world);
  world.procs = buildProcs(world);
  world.logins = buildLogins(world);
  world.df = buildDf(world);
  world.load = kind === 'bmc' ? [0.18, 0.2, 0.19] : kind === 'gpu-suspect' ? [0.31, 0.38, 0.4] : [6.82, 7.01, 6.55];
  world.mem = buildMem(world);
  return world;
}

// ---------------------------------------------------------------------------------------- guests
function buildDomains(w) {
  if (w.kind === 'bmc') return [];
  const doms = [];
  if (w.kind === 'gpu-suspect') {
    GUESTS.forEach(([name, workload], i) => {
      const suspect = name === SUSPECT_VM;
      doms.push({
        id: suspect ? 9 : null, name, workload, uuid: uuidOf(name),
        state: suspect ? 'paused' : 'shut off', reason: suspect ? 'user' : 'shutdown',
        vcpus: suspect ? 16 : 8, memKiB: suspect ? 67_108_864 : 33_554_432,
        cpuTimeS: suspect ? 1423.7 : 0, nic: { name: `vnet-${name.slice(3)}`, mac: macOf(name), attached: !suspect && false },
        pid: suspect ? 2231 : null, order: i,
      });
    });
    return doms;
  }
  const incoming = Object.entries(FAILOVER_TARGET).filter(([, h]) => h === w.hostId).map(([n]) => n);
  let id = 3;
  for (const name of incoming) {
    const g = GUESTS.find(([n]) => n === name);
    doms.push({ id: id++, name, workload: g[1], uuid: uuidOf(name), state: 'running', reason: 'booted', vcpus: 8, memKiB: 33_554_432, cpuTimeS: 12.4 + (id % 5) * 3.1, nic: { name: `vnet-${name.slice(3)}`, mac: macOf(name), attached: true }, pid: 4100 + id * 37, failoverFrom: SUSPECT_HOST, startedSec: 4.9 + (id % 6) * 0.07 });
  }
  for (const [name, workload] of NATIVE_GUESTS[w.hostId] ?? []) {
    doms.push({ id: id++, name, workload, uuid: uuidOf(name), state: 'running', reason: 'booted', vcpus: 8, memKiB: 33_554_432, cpuTimeS: 90_000 + id * 311.2, nic: { name: `vnet-${name.slice(3)}`, mac: macOf(name), attached: true }, pid: 1900 + id * 41, native: true });
  }
  return doms;
}

function buildIfaces(w) {
  if (w.kind === 'bmc') {
    return [
      { name: 'lo', state: 'UNKNOWN', mac: '00:00:00:00:00:00', flags: 'LOOPBACK,UP,LOWER_UP', addrs: ['127.0.0.1/8'] },
      { name: 'eth0', state: 'UP', mac: macOf('bmc-eth0', '0c:c4:7a'), flags: 'BROADCAST,MULTICAST,UP,LOWER_UP', addrs: [`${MGMT_IP}/24`] },
      { name: 'eth0.40', state: 'UP', mac: macOf('bmc-eth0', '0c:c4:7a'), flags: 'BROADCAST,MULTICAST,UP,LOWER_UP', addrs: ['10.0.40.1/24'] },
    ];
  }
  const fabricUp = !w.quarantined;
  const ifs = [
    { name: 'lo', state: 'UNKNOWN', mac: '00:00:00:00:00:00', flags: 'LOOPBACK,UP,LOWER_UP', addrs: ['127.0.0.1/8'] },
    { name: 'eno1np0', state: 'UP', mac: macOf(`${w.hostId}-eno1`, '3c:ec:ef'), flags: 'BROADCAST,MULTICAST,UP,LOWER_UP', addrs: [`${w.ip}/24`] },
    { name: 'eno2np1', state: 'DOWN', mac: macOf(`${w.hostId}-eno2`, '3c:ec:ef'), flags: 'NO-CARRIER,BROADCAST,MULTICAST,UP', addrs: [] },
    { name: 'ens1f0np0', state: fabricUp ? 'UP' : 'DOWN', mac: macOf(`${w.hostId}-f0`, 'b8:ce:f6'), flags: fabricUp ? 'BROADCAST,MULTICAST,UP,LOWER_UP' : 'NO-CARRIER,BROADCAST,MULTICAST,UP', addrs: [`172.20.${w.meta.slot}.${w.meta.slot + 10}/16`] },
    { name: 'ens1f1np1', state: fabricUp ? 'UP' : 'DOWN', mac: macOf(`${w.hostId}-f1`, 'b8:ce:f6'), flags: fabricUp ? 'BROADCAST,MULTICAST,UP,LOWER_UP' : 'NO-CARRIER,BROADCAST,MULTICAST,UP', addrs: [] },
    { name: 'br-guest', state: 'UP', mac: macOf(`${w.hostId}-br`, '3c:ec:ef'), flags: 'BROADCAST,MULTICAST,UP,LOWER_UP', addrs: ['10.64.0.1/16'] },
  ];
  if (w.kind === 'gpu-suspect') {
    // vm-7f3a's vNIC was detached by Warden: the tap is left down and out of the bridge.
    ifs.push({ name: 'vnet-7f3a', state: 'DOWN', mac: macOf('vm-7f3a', 'fe:54:00'), flags: 'BROADCAST,MULTICAST', addrs: [], note: 'detached' });
  } else {
    for (const d of w.domains) ifs.push({ name: d.nic.name, state: 'UNKNOWN', mac: macOf(d.name, 'fe:54:00'), flags: 'BROADCAST,MULTICAST,UP,LOWER_UP', addrs: [], master: 'br-guest' });
  }
  return ifs;
}

function buildGpus(w) {
  if (!w.meta.gpus) return [];
  const gpus = [];
  for (let i = 0; i < w.meta.gpus; i++) {
    const bus = `00000000:${(0x41 + i * 0x20).toString(16).toUpperCase()}:00.0`;
    const g = { idx: i, name: 'NVIDIA L40S', bus, memTotal: 46068, procs: [] };
    if (w.kind === 'gpu-suspect') {
      const suspect = i === 1; // vm-7f3a is on GPU 1 (bus 61:00.0), paused
      g.tempC = 38 + i; g.powerW = suspect ? 71 : 36; g.capW = 350; g.util = 0;
      g.memUsed = suspect ? 12304 : 4;
      if (suspect) g.procs.push({ pid: 2231, type: 'C+G', name: 'qemu-system-x86_64', mem: 12288 });
    } else {
      g.tempC = 55 + i * 3; g.powerW = 190 + i * 21; g.capW = 350; g.util = 54 + i * 9;
      g.memUsed = 21_000 + i * 4200;
      const owners = w.domains.filter((_, di) => di % w.meta.gpus === i);
      for (const d of owners) g.procs.push({ pid: d.pid, type: 'C', name: 'qemu-system-x86_64', mem: 6144 });
    }
    gpus.push(g);
  }
  return gpus;
}

function buildMem(w) {
  const total = w.meta.ramGiB * 1024 * 1024; // KiB
  const used = w.kind === 'bmc' ? 98_304 : w.kind === 'gpu-suspect' ? 69_206_016 : 318_767_104;
  const buff = w.kind === 'bmc' ? 21_000 : 8_388_608;
  return { total, used, free: Math.max(0, total - used - buff), shared: 1_572_864, buffcache: buff, available: total - used };
}

function buildDf(w) {
  if (w.kind === 'bmc') {
    return [
      ['/dev/root', '1.9G', '812M', '1.1G', '43%', '/'],
      ['tmpfs', '1.9G', '12M', '1.9G', '1%', '/run'],
      ['/dev/mtdblock5', '64M', '31M', '33M', '49%', '/var/persist'],
    ];
  }
  return [
    ['/dev/nvme0n1p2', '3.5T', w.kind === 'gpu-suspect' ? '412G' : '1.9T', w.kind === 'gpu-suspect' ? '2.9T' : '1.4T', w.kind === 'gpu-suspect' ? '13%' : '58%', '/'],
    ['/dev/nvme0n1p1', '1.1G', '6.4M', '1.1G', '1%', '/boot/efi'],
    ['/dev/nvme1n1', '7.0T', w.kind === 'gpu-suspect' ? '1.2T' : '3.4T', w.kind === 'gpu-suspect' ? '5.5T' : '3.3T', w.kind === 'gpu-suspect' ? '18%' : '51%', '/var/lib/libvirt/images'],
    ['tmpfs', '252G', '0', '252G', '0%', '/dev/shm'],
    ['tmpfs', '51G', '4.4M', '51G', '1%', '/run'],
  ];
}

// ---------------------------------------------------------------------------------------- events
/**
 * One merged event list for dmesg, journalctl and /var/log. Kernel events carry src 'kernel'.
 * `phase` hides everything after the approval request while the quarantine is still pending.
 */
function buildEvents(w) {
  const ev = [];
  const E = (ts, src, unit, ident, pid, prio, msg, extra = {}) => ev.push({ ts, src, unit, ident, pid, prio, msg, ...extra });
  const K = (ts, msg, prio = 'info') => E(ts, 'kernel', 'kernel', 'kernel', null, prio, msg);
  const S = (sec, unit, ident, pid, prio, msg) => E(w.T(sec), 'svc', unit, ident, pid, prio, msg);
  const KT = (sec, msg, prio) => K(w.T(sec), msg, prio);
  const b = w.bootMs;

  if (w.kind === 'bmc') {
    K(b + 120, 'Booting Linux on physical CPU 0x0');
    K(b + 640, 'ftgmac100 1e660000.ethernet eth0: irq 31, mapped at 8d4e2000');
    K(b + 6100, 'ftgmac100 1e660000.ethernet eth0: NCSI Network controller reset');
    K(b + 8100, 'eth0: link up, 1000Mbps, full-duplex');
    S(-3 * 3600, 'ipmid', 'ipmid', 412, 'info', 'RMCP+ listener bound to 10.0.0.1:623 (mgmt VLAN 40)');
    S(-1800, 'bmc-audit', 'bmc-audit', 633, 'info', 'config unchanged since 2026-09-12 14:02 (hash 4d1e8c, signed by cm-ops)');
    S(0.7, 'ipmid', 'ipmid', 412, 'warning', `RMCP+ open-session request from 10.0.14.7:51944 (6 packets, 412 bytes); no session activated`);
    S(0.72, 'bmc-audit', 'bmc-audit', 633, 'warning', 'IPMI session audit: 6 packets from 10.0.14.7, 0 successful logins, 0 config changes');
    S(2.4, 'claura-agent', 'claura-agent', 705, 'info', `warden: flow 10.0.14.7 -> ${MGMT_IP}:623 dropped at the mgmt ACL (policy: auto, reversible)`);
    S(5.8, 'claura-agent', 'claura-agent', 705, 'info', 'triage: management plane reachable from b14-gpu-07, not compromised (no auth success, no config diff)');
    if (w.phase === 'quarantined') S(8.8, 'claura-agent', 'claura-agent', 705, 'info', 'warden: BMC b14-gpu-07: IPMI LAN off, mgmt VLAN 40 pruned for b14-gpu-07');
    heartbeats(w, E, 'claura-agent', 705, 'bmc heartbeat ok (sel 4 entries, fans ok, config hash 4d1e8c)', 600);
    sessionLines(w, E);
    return finish(w, ev);
  }

  // --- kernel boot noise
  K(b + 0, 'Linux version 6.8.0-52-generic (buildd@lcy02-amd64-099) (x86_64-linux-gnu-gcc-13 (Ubuntu 13.3.0-6ubuntu2~24.04) 13.3.0, GNU ld (GNU Binutils for Ubuntu) 2.42) #53-Ubuntu SMP PREEMPT_DYNAMIC Sat Jan 11 00:06:25 UTC 2025 (Ubuntu 6.8.0-52.53-generic 6.8.12)');
  K(b + 1, 'Command line: BOOT_IMAGE=/boot/vmlinuz-6.8.0-52-generic root=UUID=3b1d9e0c-6a52-4f8e-9d0e-5f8bd2c1e7aa ro intel_iommu=on iommu=pt default_hugepagesz=1G hugepagesz=1G hugepages=384 vfio-pci.disable_vga=1');
  K(b + 412, 'DMAR: IOMMU enabled');
  K(b + 1934, 'DMAR: Intel(R) Virtualization Technology for Directed I/O');
  K(b + 4201, 'NVRM: loading NVIDIA UNIX x86_64 Kernel Module  570.124.06  Wed Feb 12 20:16:44 UTC 2025');
  K(b + 4633, 'nvidia-vgpu-vfio 0000:61:00.4: Adding to iommu group 86');
  K(b + 12118, 'kvm_intel: ept=1 flexpriority=1 vpid=1 unrestricted_guest=1');
  K(b + 18220, 'br-guest: port 1(vnet-0001) entered forwarding state');
  K(b + 19300, 'mlx5_core 0000:81:00.0 ens1f0np0: Link up');

  // --- quiet background in the hour before the first signal
  for (let m = 55; m >= 5; m -= 10) E(w.T(-m * 60), 'svc', 'claura-edr', 'claura-edr', 811, 'info', 'heartbeat ok (policy bundle 2026.11.07-3, 0 alerts)');
  E(w.T(-41 * 60), 'svc', 'sshd', 'sshd', 902, 'info', 'Accepted publickey for claura-w from 10.0.0.2 port 40112 ssh2: ED25519-CERT SHA256:Hq8yq3nQ0m6o1X0e6j5n1mZ7s1Yp0W9kT2lY8t4cQ5E ID warden|svc-pull (serial 4401) CA ED25519 SHA256:' + 'uPNtZMRJ7YjnaEubowWXtEECdp6f/Dkx98/VcNUQ9lU');
  E(w.T(-40 * 60 + 2), 'svc', 'sshd', 'sshd', 902, 'info', 'Disconnected from user claura-w 10.0.0.2 port 40112');

  if (w.kind === 'gpu-suspect') {
    // --- the incident, relative to the first signal (t0)
    S(0.0, 'qemu', 'qemu-system-x86', 2231, 'warning', 'vmm-audit: unexpected ioctl 0xC0186441 from vcpu 3 (guest vm-7f3a), request denied');
    KT(0.0, 'vfio-pci 0000:61:00.4: vmm-audit: unexpected ioctl 0xC0186441 (pid 2231, comm qemu-system-x86)', 'warning');
    KT(0.15, 'nvidia-vgpu-vfio 0000:61:00.4: mdev vm-7f3a: invalid RPC from guest (opcode 0x2c, len 0x40000), dropped', 'err');
    S(0.15, 'nvidia-vgpu-mgr', 'nvidia-vgpu-mgr', 1204, 'err', 'vm-7f3a: vGPU mdev driver fault: invalid RPC from guest (opcode 0x2c)');
    KT(0.15, 'NVRM: Xid (PCI:0000:61:00): 31, pid=2231, name=qemu-system-x86, Ch 0000000c, intr 10000000. MMU Fault: ENGINE GRAPHICS GPCCLIENT_T1_0 faulted @ 0x7f3a_00000000. Fault is of type FAULT_PDE ACCESS_TYPE_VIRT_WRITE', 'err');
    KT(0.3, 'DMAR: DRHD: handling fault status reg 2', 'err');
    KT(0.3, 'DMAR: [DMA Write NO_PASID] Request device [61:00.4] fault addr 0x7ffe3a1000 [fault reason 0x05] PTE Write access is not set', 'err');
    S(0.3, 'qemu', 'qemu-system-x86', 2231, 'warning', 'vfio: DMA write outside guest range blocked by IOMMU (iova 0x7ffe3a1000, guest vm-7f3a)');
    S(0.5, 'claura-edr', 'claura-edr', 811, 'err', 'ALERT exec: qemu-system-x86_64[2231] -> /bin/sh[2412] (parent is a VMM process; no policy allows exec)');
    E(w.T(0.5), 'svc', 'audit', 'audit', 2231, 'notice', 'type=EXECVE msg=audit(' + ((w.T(0.5)) / 1000).toFixed(3) + ':8841): argc=1 a0="/bin/sh" ppid=2231 comm="sh" exe="/usr/bin/dash"');
    S(0.7, 'claura-edr', 'claura-edr', 811, 'err', `ALERT flow: ${w.ip} -> ${MGMT_IP}:623/udp (IPMI) 6 packets, 412 bytes, mgmt VLAN 40`);
    S(0.85, 'claura-agent', 'claura-agent', 1260, 'warning', 'iam: workload identity agent-7f3 used a token outside its scope (aud=gpu-scheduler, asked=mgmt-api:write)');
    S(1.0, 'claura-agent', 'claura-agent', 1260, 'notice', `sentry: 6 signals correlated, ${INCIDENT_ID} opened (critical)`);
    S(1.8, 'claura-agent', 'claura-agent', 1260, 'notice', 'triage: attack graph: 1 suspect host, 11 co-resident guests, 2 exposed tokens, management plane reachable');
    S(2.4, 'libvirtd', 'libvirtd', 1180, 'info', 'qemuDomainDetachDeviceLive: domain vm-7f3a, detached net0 (vnet-7f3a), requested by claura-warden');
    KT(2.4, 'br-guest: port 12(vnet-7f3a) entered disabled state');
    KT(2.4, 'vnet-7f3a (unregistering): left promiscuous mode');
    S(2.4, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: isolate network: detached vNIC of vm-7f3a; flow to :623 dropped (policy: auto, reversible)');
    S(2.9, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: revoked 2 workload tokens for agent-7f3 (policy: auto, reversible)');
    S(3.3, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: cordoned b14-gpu-07, no new placements (policy: auto, reversible)');
    S(3.8, 'libvirtd', 'libvirtd', 1180, 'info', 'domain vm-7f3a paused (reason: user, requested by claura-warden); vCPU 0-15 frozen');
    S(3.8, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: paused guest vm-7f3a (policy: auto, reversible)');
    for (const e of EVIDENCE) {
      S(e.atSec, 'claura-agent', 'claura-agent', 1260, 'notice', `warden: captured ${e.what}: /var/lib/claura/evidence/${e.name} ${e.label} sha256 ${e.sha256}${e.name === 'vm-7f3a.mem' ? ' (trusted management path)' : ''}`);
    }
    let i = 0;
    for (const [name] of GUESTS.slice(1)) {
      const sec = 4.65 + (i++) * 0.06;
      S(sec, 'libvirtd', 'libvirtd', 1180, 'info', `domain ${name} destroyed after failover: restarted from checkpoint on ${FAILOVER_TARGET[name]} (no live migration from a suspect host)`);
      KT(sec, `vfio-pci 0000:61:00.4: released by qemu pid ${3100 + i}`);
    }
    S(5.3, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: failover complete: 11/11 co-resident guests running on clean hosts');
    S(5.5, 'claura-agent', 'claura-agent', 1260, 'warning', `warden: approval requested: quarantine host b14-gpu-07 (policy: approval, high impact); ${INCIDENT_ID}`);
    if (w.quarantined) {
      S(7.4, 'claura-agent', 'claura-agent', 1260, 'notice', 'approval: RK approved quarantine of b14-gpu-07');
      S(8.1, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: fabric ports down, host removed from pool');
      KT(8.1, 'mlx5_core 0000:81:00.0 ens1f0np0: Link down');
      KT(8.1, 'mlx5_core 0000:81:00.1 ens1f1np1: Link down');
      S(8.8, 'claura-agent', 'claura-agent', 1260, 'notice', 'warden: BMC b14-gpu-07: IPMI LAN off, mgmt VLAN 40 pruned');
      S(9.4, 'claura-agent', 'claura-agent', 1260, 'notice', `warden: host b14-gpu-07 quarantined: ${INCIDENT_ID} contained in 9.4 s (illustrative demo number)`);
      S(12.4, 'claura-agent', 'claura-agent', 1260, 'notice', `scribe: report ${INCIDENT_ID} filed, 15 entries, 1 human approval, 3 evidence files`);
    }
    heartbeats(w, E, 'claura-agent', 1260, w.quarantined
      ? 'heartbeat ok (host quarantined, 1 guest paused, evidence sealed)'
      : 'heartbeat ok (host cordoned, awaiting quarantine approval, 1 guest paused, evidence sealed)', 300);
  } else {
    // healthy failover target: guests arrive from b14-gpu-07 at about +5 s
    for (const d of w.domains) {
      if (!d.failoverFrom) continue;
      S(d.startedSec - 0.1, 'claura-agent', 'claura-agent', 1260, 'notice', `failover: restoring ${d.name} (${d.workload}) from checkpoint, source ${d.failoverFrom} (no live migration from a suspect host)`);
      S(d.startedSec, 'libvirtd', 'libvirtd', 1180, 'info', `domain ${d.name} started (restored from checkpoint, requested by claura-warden)`);
      KT(d.startedSec, `br-guest: port ${d.id + 1}(${d.nic.name}) entered forwarding state`);
    }
    S(5.35, 'claura-agent', 'claura-agent', 1260, 'notice', `failover: ${w.domains.filter((d) => d.failoverFrom).length} guests running on ${w.hostId}, placement healthy`);
    heartbeats(w, E, 'claura-agent', 1260, `heartbeat ok (${w.domains.length} guests running, gpu ecc 0, no alerts)`, 300);
  }
  sessionLines(w, E);
  return finish(w, ev);
}

function heartbeats(w, E, unit, pid, msg, everySec) {
  const first = w.t0 + 30_000;
  const last = Math.min(w.now - 1000, first + 400 * everySec * 1000);
  for (let ts = first; ts <= last; ts += everySec * 1000) E(ts, 'svc', unit, unit, pid, 'info', msg);
}

function sessionLines(w, E) {
  const s = w.session;
  if (!s || !s.certId) return;
  const tty = s.tty ?? 'pts/0';
  E(s.startedMs - 40, 'svc', 'sshd', 'sshd', s.sshdPid ?? 9001, 'info', `Accepted publickey for ${w.user} from 10.0.0.9 port ${s.clientPort ?? 51234} ssh2: ED25519-CERT ${s.keyFingerprint ?? 'SHA256:unknown'} ID ${s.certId} (serial ${s.serial}) CA ED25519 ${s.caFingerprint ?? 'SHA256:unknown'}`);
  E(s.startedMs - 30, 'svc', 'sshd', 'sshd', s.sshdPid ?? 9001, 'info', `pam_unix(sshd:session): session opened for user ${w.user}(uid=2001) by (uid=0)`);
  E(s.startedMs - 20, 'svc', 'claura-agent', 'claura-agent', 1260, 'notice', `ssh: JIT session for ${s.principal} on ${tty}: certificate serial ${s.serial}, expires ${F.stamp(s.validBeforeMs)}, mode ${s.mode}`);
}

function finish(w, ev) {
  return ev.filter((e) => e.ts <= w.now + 1000).sort((a, b) => a.ts - b.ts);
}

// ---------------------------------------------------------------------------------------- processes
function buildProcs(w) {
  const P = [];
  const add = (user, pid, ppid, cpu, mem, vsz, rss, tty, stat, startMs, time, cmd, short) =>
    P.push({ user, pid, ppid, cpu, mem, vsz, rss, tty, stat, startMs, time, cmd, short: short ?? cmd.split(' ')[0] });
  const boot = w.bootMs + 9_000;
  const sess = w.session;

  if (w.kind === 'bmc') {
    add('root', 1, 0, 0.0, 0.1, 5432, 3204, '?', 'Ss', boot, '0:07', '/sbin/init');
    add('root', 412, 1, 0.4, 0.9, 41208, 18904, '?', 'Ssl', boot, '19:52', '/usr/bin/ipmid --bind 10.0.0.1:623');
    add('root', 633, 1, 0.0, 0.4, 21004, 9108, '?', 'Ss', boot, '2:41', '/usr/bin/bmc-audit --config /etc/bmc/audit.yaml');
    add('root', 705, 1, 0.0, 0.5, 98320, 11452, '?', 'Ssl', boot, '3:30', '/opt/claura/agent/claura-agent --role bmc');
    add('root', 880, 1, 0.0, 0.1, 9120, 2180, '?', 'Ss', boot, '0:01', '/usr/sbin/sshd -D');
    addSession(w, add);
    return P;
  }

  add('root', 1, 0, 0.0, 0.0, 168_264, 13_152, '?', 'Ss', boot, '0:21', '/sbin/init splash');
  add('root', 2, 0, 0.0, 0.0, 0, 0, '?', 'S', boot, '0:00', '[kthreadd]', '[kthreadd]');
  add('root', 503, 1, 0.0, 0.0, 36_192, 10_244, '?', 'Ss', boot, '0:09', '/usr/lib/systemd/systemd-journald');
  add('root', 561, 1, 0.0, 0.0, 29_460, 7_020, '?', 'Ss', boot, '0:03', '/usr/lib/systemd/systemd-udevd');
  add('root', 811, 1, 0.1, 0.0, 1_329_876, 61_240, '?', 'Ssl', boot, '62:11', '/opt/claura/edr/claura-edr --config /etc/claura/edr.yaml');
  add('root', 902, 1, 0.0, 0.0, 15_420, 8_812, '?', 'Ss', boot, '0:02', 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups');
  add('root', 1180, 1, 0.2, 0.0, 1_861_232, 48_112, '?', 'Ssl', boot, '14:03', '/usr/sbin/libvirtd --timeout 120');
  add('root', 1204, 1, 0.0, 0.0, 421_388, 24_176, '?', 'Ssl', boot, '1:44', '/usr/bin/nvidia-vgpu-mgr');
  add('root', 1231, 1, 0.0, 0.0, 232_608, 6_612, '?', 'Ssl', boot, '0:31', '/usr/bin/nvidia-persistenced --verbose');
  add('root', 1260, 1, 0.1, 0.0, 1_204_552, 52_832, '?', 'Ssl', boot, '9:18', `/opt/claura/agent/claura-agent --host ${w.hostId}`);
  add('prometh+', 1342, 1, 0.1, 0.0, 1_240_824, 31_512, '?', 'Ssl', boot, '21:07', '/usr/bin/prometheus-node-exporter');
  add('root', 1390, 1, 0.0, 0.0, 6_716, 2_168, '?', 'Ss', boot, '0:00', '/usr/sbin/cron -f -P');
  add('chrony', 1402, 1, 0.0, 0.0, 22_552, 3_676, '?', 'S', boot, '0:11', '/usr/sbin/chronyd -F 1');

  if (w.kind === 'gpu-suspect') {
    const qStart = w.t0 - 3 * 3_600_000;
    add('libvirt+', 2231, 1, 3.1, 12.8, 71_301_452, 67_108_864, '?', 'Sl', qStart, '27:44',
      '/usr/bin/qemu-system-x86_64 -name guest=vm-7f3a,debug-threads=on -S -machine pc-q35-8.2,usb=off,dump-guest-core=off,memory-backend=pc.ram -accel kvm -cpu host,migratable=on -m size=67108864k -smp 16,sockets=1,cores=8,threads=2 -uuid ' + uuidOf('vm-7f3a') + ' -no-user-config -nodefaults -rtc base=utc -no-shutdown -device vfio-pci,host=0000:61:00.4,id=hostdev0 -device virtio-net-pci,netdev=hostnet0,id=net0,mac=52:54:00:7f:3a:01 -sandbox on,obsolete=deny,elevateprivileges=deny,spawn=deny,resourcecontrol=deny -msg timestamp=on',
      '/usr/bin/qemu-system-x86_64');
    add('libvirt+', 2412, 2231, 0.0, 0.0, 2_892, 1_032, '?', 'S', w.T(0.5), '0:00', '/bin/sh', '/bin/sh');
  } else {
    for (const d of w.domains) {
      add('libvirt+', d.pid, 1, 6.2 + (d.id % 4), 6.2, 41_301_452, 33_554_432, '?', 'Sl', d.failoverFrom ? w.T(d.startedSec) : w.bootMs + 3_600_000 * (d.id + 3), `${12 + d.id * 3}:${String(10 + d.id * 7).padStart(2, '0')}`,
        `/usr/bin/qemu-system-x86_64 -name guest=${d.name},debug-threads=on -S -machine pc-q35-8.2,usb=off -accel kvm -cpu host -m size=33554432k -smp 8 -uuid ${d.uuid} -no-user-config -nodefaults -device vfio-pci,host=0000:${(0x41 + (d.id % w.meta.gpus) * 0x20).toString(16)}:00.4 -msg timestamp=on`,
        '/usr/bin/qemu-system-x86_64');
    }
  }
  addSession(w, add);
  return P;
}

function addSession(w, add) {
  const s = w.session;
  if (!s) return;
  const start = s.startedMs;
  const ppid = s.sshdPid ?? 9001;
  add('root', ppid, 902, 0.0, 0.0, 17_204, 10_624, '?', 'Ss', start, '0:00', `sshd: ${w.user} [priv]`, `sshd: ${w.user} [priv]`);
  add(w.user, ppid + 1, ppid, 0.0, 0.0, 17_480, 6_316, '?', 'S', start, '0:00', `sshd: ${w.user}@${s.tty ?? 'pts/0'}`, `sshd: ${w.user}@pts/0`);
  add(w.user, s.pid ?? ppid + 2, ppid + 1, 0.2, 0.0, 612_480, 41_220, s.tty ?? 'pts/0', 'Ss', start, '0:00', '-claura-shell', '-claura-shell');
}

// ---------------------------------------------------------------------------------------- logins
function buildLogins(w) {
  const rows = [];
  const s = w.session;
  if (s) rows.push({ user: w.user, tty: s.tty ?? 'pts/0', from: '10.0.0.9', at: s.startedMs, end: null });
  if (w.kind !== 'bmc') {
    rows.push({ user: 'operator', tty: 'pts/1', from: '10.0.0.9', at: w.T(-26 * 3600), end: w.T(-26 * 3600 + 37 * 60) });
    rows.push({ user: 'claura-w', tty: 'ssh', from: '10.0.0.2', at: w.T(-41 * 60), end: w.T(-41 * 60 + 2) });
  }
  rows.push({ user: 'reboot', tty: 'system boot', from: w.os.kernel, at: w.bootMs, end: 'running' });
  return rows;
}

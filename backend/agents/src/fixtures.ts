// Fixture data standing in for real telemetry and network probes.

export const SUSPECT_HOST = 'b14-gpu-07';
export const SUSPECT_VM = 'vm-7f3a';
export const SUSPECT_IDENTITY = 'agent-7f3';

export interface TelemetryEvent {
  /** seconds after the first signal (before --telemetry-speed scaling) */
  t: number;
  source: string;
  message: string;
  host: string;
  vm: string;
}

export const TELEMETRY: readonly TelemetryEvent[] = [
  { t: 0.0, source: 'vmm', message: 'VMM audit: unexpected ioctl 0xC0186441', host: SUSPECT_HOST, vm: SUSPECT_VM },
  { t: 0.15, source: 'vgpu', message: 'vGPU mdev driver fault (vm-7f3a)', host: SUSPECT_HOST, vm: SUSPECT_VM },
  { t: 0.3, source: 'iommu', message: 'IOMMU fault: DMA write outside guest range', host: SUSPECT_HOST, vm: SUSPECT_VM },
  { t: 0.5, source: 'edr', message: 'host EDR: qemu spawned /bin/sh', host: SUSPECT_HOST, vm: SUSPECT_VM },
  { t: 0.7, source: 'flow', message: 'east-west flow -> 10.0.0.1:623 (IPMI)', host: SUSPECT_HOST, vm: SUSPECT_VM },
  { t: 0.85, source: 'iam', message: 'workload identity agent-7f3 used token outside scope', host: SUSPECT_HOST, vm: SUSPECT_VM },
];

export interface Reachability {
  host: string;
  mgmt_plane: string;
  reachable: boolean;
  compromised: boolean;
  evidence: string[];
}

/** Fixture for the reachability probe. Mgmt plane 10.0.0.1:623 is reachable from the suspect host, not compromised. */
export function reachabilityFixture(host: string): Reachability {
  if (host === SUSPECT_HOST) {
    return {
      host,
      mgmt_plane: 'BMC 10.0.0.1:623 (IPMI, mgmt VLAN 40)',
      reachable: true,
      compromised: false,
      evidence: [
        'east-west flow from vm-7f3a path to 10.0.0.1:623 observed (6 packets)',
        'BMC auth log: no successful login, no config change',
        'IPMI LAN is enabled on this host (pivot path exists)',
      ],
    };
  }
  return {
    host,
    mgmt_plane: 'BMC (IPMI, mgmt VLAN 40)',
    reachable: false,
    compromised: false,
    evidence: ['no east-west flow to the management plane observed from this host'],
  };
}

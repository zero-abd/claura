// The demo fleet, the people who can request/approve, and the access policy per host class.
// Policy lives here, on the server: the browser can ask, it cannot decide.

export const HOSTS = [
  {
    id: 'b14-gpu-07', index: 0, label: 'b14-gpu-07', where: 'DFW-2 · Hall B · rack 14', role: 'GPU host',
    note: 'INC-0419 suspect host: guest vm-7f3a attempted a vGPU escape', baseStatus: 'quarantined', profile: 'gpu-suspect',
  },
  {
    id: 'c05-gpu-02', index: 1, label: 'c05-gpu-02', where: 'DFW-2 · Hall C · rack 05', role: 'GPU host',
    note: 'Clean failover target: runs 6 of the 11 failed-over guests', baseStatus: 'healthy', profile: 'gpu-healthy',
  },
  {
    id: 'c12-gpu-04', index: 2, label: 'c12-gpu-04', where: 'DFW-2 · Hall C · rack 12', role: 'GPU host',
    note: 'Clean failover target: runs 5 of the 11 failed-over guests', baseStatus: 'healthy', profile: 'gpu-healthy',
  },
  {
    id: 'mgmt-bmc-01', index: 3, label: 'mgmt-bmc-01', where: 'DFW-2 · mgmt VLAN 40', role: 'BMC / management plane',
    note: 'The IPMI endpoint (10.0.0.1:623) the suspect host tried to reach', baseStatus: 'healthy', profile: 'bmc',
  },
];

export const hostById = (id) => HOSTS.find((h) => h.id === id) ?? null;

export const STATUSES = ['healthy', 'suspect', 'cordoned', 'quarantined'];

/** Demo directory. Production: identities come from the console's authenticated session (SSO + passkey). */
export const PEOPLE = [
  { id: 'jt', initials: 'JT', name: 'JT', title: 'Platform on-call' },
  { id: 'rk', initials: 'RK', name: 'RK', title: 'Shift lead' },
  { id: 'al', initials: 'AL', name: 'AL', title: 'Incident Commander' },
];
export const personById = (id) => PEOPLE.find((p) => p.id === id) ?? null;

export const POLICY_CLASSES = {
  // A host under investigation: strongest controls, and a session that cannot change anything.
  suspect: { label: 'Suspect or quarantined host', stepUp: true, approvals: 2, role: 'forensics', mode: 'forensic', readOnly: true, defaultMinutes: 10 },
  // The management plane (BMC): the classic pivot target, so it gets a passkey step-up too.
  management: { label: 'Management plane', stepUp: true, approvals: 1, role: 'operator', mode: 'ops', readOnly: false, defaultMinutes: 15 },
  // Ordinary healthy hosts.
  healthy: { label: 'Healthy host', stepUp: false, approvals: 1, role: 'operator', mode: 'ops', readOnly: false, defaultMinutes: 15 },
};
export const MAX_MINUTES = 15;

export function policyClass(host, status) {
  if (status === 'suspect' || status === 'cordoned' || status === 'quarantined') return 'suspect';
  return host.profile === 'bmc' ? 'management' : 'healthy';
}

/** The full policy decision for one host at one status. */
export function policyFor(host, status) {
  const cls = policyClass(host, status);
  const p = POLICY_CLASSES[cls];
  return {
    class: cls,
    label: p.label,
    stepUp: p.stepUp,
    approvals: p.approvals,
    principal: `${p.role}@${host.id}`,
    mode: p.mode,
    readOnly: p.readOnly,
    maxMinutes: MAX_MINUTES,
    defaultMinutes: p.defaultMinutes,
  };
}

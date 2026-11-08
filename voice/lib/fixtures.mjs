// Default demo data, so the voice feature works standalone (dev.mjs, smoke.mjs) and in the scripted console.
// Everything here is SCRIPTED, FICTIONAL demo data that mirrors apps/dashboard/src/script.ts and warroom-data.ts
// (INC-0419, b14-gpu-07, 9.4 s). The numbers are illustrative, not measurements.
//
// In the integrated build, ctx.getIncidentContext() / ctx.getBrief() replace these with live SpacetimeDB state.

export const STAGES = ['quiet', 'detect', 'contain', 'approval', 'quarantine', 'contained'];
export const DEFAULT_STAGE = 'approval'; // the console holds here until a human approves
export const isStage = (s) => STAGES.includes(s);

/** The console exposes its phase on document.body.dataset.phase. Map it to a fixture stage. */
export function phaseToStage(phase) {
  switch (phase) {
    case 'nominal': return 'quiet';
    case 'breach': return 'contain';
    case 'approval': return 'approval';
    case 'isolating': return 'quarantine';
    case 'contained':
    case 'report': return 'contained';
    default: return isStage(phase) ? phase : null;
  }
}

// ---- Scribe's plain-language briefs (English), same shape the War Room renders.
const KNOW_CONTAIN = ['It started on one server, b14-gpu-07', 'It was stopped before the management network', '2 exposed passwords are revoked'];
const DONT = ['Whether any data was read first', 'How the attacker found the flaw'];
const H1 = 'An AI workload inside a virtual machine tried to break out and reach the server underneath it.';
export const BRIEFS_EN = {
  quiet: {
    stamp: 'Scribe · standing by',
    happened: 'Nothing to report. All systems are normal.',
    contained: 'Nothing to contain.',
    impact: 'No customers affected.',
    need: 'Nothing. Keep your break-glass sign-in somewhere safe.',
    know: ['All 6 stakeholder identities are verified', 'This channel runs outside the company network', 'The last incident closed 6 days ago'],
    dont: ['Nothing is open right now'],
  },
  detect: {
    stamp: 'Scribe · T+1.0s',
    happened: H1,
    contained: 'Not yet. Our detection agent caught it within a second and is checking how far it got.',
    impact: 'Not known yet. One server out of 2,048 is involved.',
    need: 'Nothing yet. Please stay in this channel.',
    know: ['It started on one server, b14-gpu-07', 'It was detected within 1 second', 'Our own tools are working'],
    dont: ['Whether any data was read', 'How far the attacker got'],
  },
  contain: {
    stamp: 'Scribe · T+2.4s',
    happened: H1,
    contained: 'Its network and passwords are cut off, the server is fenced off, and the workload is paused.',
    impact: 'No customer data accessed so far. 11 other workloads are moving to safe servers.',
    need: 'Legal: start a notification assessment. PR: have a holding statement ready.',
    know: KNOW_CONTAIN,
    dont: DONT,
  },
  approval: {
    stamp: 'Scribe · T+5.5s',
    happened: H1,
    contained: 'Everything that can be undone is done. One step is left and needs a person.',
    impact: 'No customer data accessed so far. Other workloads are running normally.',
    need: 'Incident Commander: approve taking the server out of service.',
    know: ['11 other workloads moved to safe servers', ...KNOW_CONTAIN.slice(1)],
    dont: DONT,
  },
  quarantine: {
    stamp: 'Scribe · T+7.4s',
    happened: H1,
    contained: 'The Incident Commander approved. The server is being taken out of service now.',
    impact: 'No customer data accessed so far. Other workloads are running normally.',
    need: 'Nothing right now. This will take a couple of seconds.',
    know: ['Approved by RK at T+7.4 s', ...KNOW_CONTAIN.slice(1)],
    dont: DONT,
  },
  contained: {
    stamp: 'Scribe · T+9.4s',
    happened: 'A suspected escape from an AI workload was stopped at the edge of its virtual machine.',
    contained: 'Contained in 9.4 seconds. The server is out of service and its workloads run elsewhere.',
    impact: '0 other workloads affected. No sign that customer data was accessed.',
    need: 'Legal: decide on notification. Vendor: confirm the hypervisor patch.',
    know: ['Stopped at the hypervisor boundary', 'Evidence is captured and hashed', 'Approved by RK at T+7.4 s'],
    dont: ['Whether any data was read before containment', 'The root cause. The vendor is checking'],
  },
};

export function defaultBrief(stage = DEFAULT_STAGE) {
  const s = isStage(stage) ? stage : DEFAULT_STAGE;
  const b = BRIEFS_EN[s];
  return { stage: s, ...b, know: [...b.know], dont: [...b.dont] };
}

// ---- Incident context for Ask Claura (grounding JSON for Nemotron).
const TIME = { quiet: null, detect: '1.0 seconds', contain: '4.0 seconds', approval: '5.5 seconds', quarantine: '8.4 seconds', contained: '9.4 seconds' };
const STEPS = [
  'Isolate network: detach the vNIC of vm-7f3a',
  'Revoke workload credentials: 2 tokens of agent-7f3',
  'Cordon host b14-gpu-07: no new placements',
  'Pause guest vm-7f3a: vCPUs frozen',
  'Capture guest memory over the trusted management path (hashed, stored off the network)',
  'Fail over the 11 co-resident guests to clean hosts (no live migration off the suspect host)',
];
const STATUS_LINE = {
  quiet: 'No open incident. All systems normal.',
  detect: 'Detecting. Sentry has correlated 6 signals and opened INC-0419.',
  contain: 'Containing. Warden is running the reversible steps.',
  approval: 'Waiting for a human. All 6 reversible steps are done; quarantining the host needs approval.',
  quarantine: 'Approved by RK. The host is being quarantined now.',
  contained: 'Contained in 9.4 seconds (illustrative demo number). The host is quarantined.',
};
const OVERALL = {
  quiet: 'Nothing to contain.',
  detect: 'Not yet. The incident was just detected.',
  contain: 'Not yet. Containment is under way: network cut, credentials revoked, host cordoned, guest paused.',
  approval: 'Partly. Every reversible step is done and the guest cannot talk to anything. The host is cordoned but not yet quarantined: that last step needs a human.',
  quarantine: 'Almost. The quarantine was approved and is running.',
  contained: 'Yes. The host b14-gpu-07 is quarantined and the incident is contained.',
};

function stepList(stage) {
  const done = stage === 'contain' ? 4 : ['approval', 'quarantine', 'contained'].includes(stage) ? 6 : 0;
  const out = STEPS.map((s, i) => `${i + 1}. ${s}: ${i < done ? 'done' : stage === 'contain' && i === done ? 'running' : stage === 'quiet' ? 'not started' : 'pending'}`);
  const q = 'Quarantine host b14-gpu-07 (takes it out of the pool)';
  const qStatus = stage === 'contained' ? 'done, approved by RK' : stage === 'quarantine' ? 'approved by RK, running' : stage === 'approval' ? 'waiting for a human to approve' : 'not started';
  out.push(`7. ${q}: ${qStatus}`);
  return out;
}

function tasksFor(stage) {
  const t = [];
  if (stage === 'approval') t.push({ title: 'Approve host quarantine', owner: 'RK', status: 'Waiting' });
  if (stage === 'quarantine' || stage === 'contained') t.push({ title: 'Approve host quarantine', owner: 'RK', status: 'Done' });
  if (['contain', 'approval', 'quarantine'].includes(stage)) t.push({ title: 'Assess notification obligations', owner: 'JT', status: 'In progress' });
  if (stage === 'contained') t.push({ title: 'Assess notification obligations', owner: 'JT', status: 'Draft ready' });
  if (['approval', 'quarantine', 'contained'].includes(stage)) t.push({ title: 'Prepare a holding statement', owner: 'PR', status: 'Ready' });
  if (['approval', 'quarantine'].includes(stage)) t.push({ title: 'Confirm the hypervisor patch', owner: 'CV', status: 'In progress' });
  if (stage === 'contained') {
    t.push({ title: 'Confirm the hypervisor patch', owner: 'CV', status: 'Confirmed' });
    t.push({ title: 'Brief the board chair', owner: 'AL', status: 'Scheduled' });
  }
  return t;
}

function agentsFor(stage) {
  const s = {
    quiet: ['Watching', 'Standing by', 'Standing by', 'Idle'],
    detect: ['Escalated: 6 signals correlated', 'Scoring blast radius', 'Standing by', 'Idle'],
    contain: ['Escalated', 'Scored 0.87', 'Executing reversible steps', 'Recording'],
    approval: ['Escalated', 'Scored 0.87', 'Awaiting approval', 'Recording'],
    quarantine: ['Escalated', 'Scored 0.87', 'Quarantining', 'Recording'],
    contained: ['Back on watch, fleet rule added', 'Closed: 0 co-resident guests affected', 'Contained', 'Report filed: 15 entries, 1 human approval, 3 evidence files'],
  }[stage];
  return { Sentry: s[0], Triage: s[1], Warden: s[2], Scribe: s[3] };
}


const WARDEN_DID = {
  quiet: 'Nothing. Warden is standing by.',
  detect: 'Nothing yet. Warden is standing by while Triage scores the blast radius.',
  contain: 'Warden has cut the guest network, revoked 2 tokens, cordoned the host and paused the guest, and is now capturing memory.',
  approval: 'Warden ran all 6 reversible steps: cut the guest network, revoked 2 tokens, cordoned the host, paused the guest, captured memory and failed 11 guests over to clean hosts. It cannot quarantine the host on its own.',
  quarantine: 'Warden ran all 6 reversible steps, and after RK approved it is taking the host off the fabric and pruning its management VLAN.',
  contained: 'Warden ran all 6 reversible steps and, after RK approved, quarantined the host: fabric ports down, removed from the pool, management VLAN pruned.',
};
const CUSTOMER_DATA = {
  quiet: 'No customers affected.',
  detect: 'Not known yet.',
  contain: 'No customer data accessed so far. It is not yet known whether any data was read first.',
  approval: 'No customer data accessed so far. It is not yet known whether any data was read first.',
  quarantine: 'No customer data accessed so far. It is not yet known whether any data was read first.',
  contained: 'No sign that customer data was accessed. Whether any was read before containment is not yet known.',
};

function faqFor(st) {
  if (st === 'quiet') {
    return [
      { q: 'Is anything open?', a: 'No. All systems are normal and no incident is open.' },
      { q: 'Is the host contained?', a: 'There is nothing to contain. No incident is open.' },
    ];
  }
  const waiting =
    st === 'approval' ? 'Quarantining host b14-gpu-07 is waiting for RK, the Incident Commander, to approve it on the approval card.'
    : st === 'quarantine' ? 'Nothing. RK approved the quarantine and it is running.'
    : st === 'contained' ? 'Nothing. The quarantine was approved by RK and is done.'
    : 'Nothing yet. Warden will ask for approval to quarantine the host once the reversible steps are done.';
  return [
    { q: 'Is the host contained?', a: OVERALL[st] },
    { q: 'How many guests are affected?', a: st === 'detect' ? 'Not known yet.' : st === 'contain' ? 'None confirmed. 11 other guests shared the host and are being moved to clean hosts as a precaution.' : 'None are confirmed affected. 11 other guests shared the host and were moved to clean hosts as a precaution.' },
    { q: 'Is customer data affected?', a: CUSTOMER_DATA[st] },
    { q: 'What is waiting for approval?', a: waiting },
    { q: 'What did Warden do?', a: WARDEN_DID[st] },
    { q: 'How fast was it detected?', a: 'Under 1 second.' },
    { q: 'Can the quarantine be undone?', a: 'Yes. Un-quarantine restores the host to the pool. The six earlier steps are reversible too, except memory capture, which is read-only.' },
    { q: 'Why does quarantine need a human?', a: 'It takes the host out of the pool, which is high impact. Policy, not the model, decides: Warden may run only the reversible steps on its own.' },
    { q: 'Do we have to notify regulators or customers?', a: 'Counsel (JT) decides, and the clocks have not started. As examples, an SEC 8-K is due 4 business days after a materiality decision and GDPR notice within 72 hours once personal data is involved. Confirm with counsel.' },
  ];
}

/** The default Ask Claura grounding JSON for a given stage. Plain data, safe to JSON.stringify.
 *  Most direct answers first (small models weigh early fields more), details after. */
export function buildIncidentContext(stage = DEFAULT_STAGE) {
  const st = isStage(stage) ? stage : DEFAULT_STAGE;
  const open = st !== 'quiet';
  const brief = BRIEFS_EN[st];
  const ctx = {
    scenario: 'Scripted demo data. Every number is illustrative.',
    incident: open
      ? { id: 'INC-0419', title: 'Suspected guest-to-host escape via the vGPU path', severity: 'critical', status: STATUS_LINE[st], timeSinceFirstAlert: TIME[st] }
      : { id: null, status: STATUS_LINE.quiet, lastIncident: 'INC-0418, filed 6 days ago' },
  };
  ctx.faq = faqFor(st);
  if (open) {
    ctx.isHostContained = OVERALL[st];
    ctx.pendingApprovals = st === 'approval'
      ? [{
          action: 'Quarantine host b14-gpu-07',
          waitingOn: 'RK (shift lead, Incident Commander)',
          how: 'Approve on the approval card, or press Cmd+Enter',
          evidence: '6 correlated signals',
          scope: '1 host, 11 guests failed over',
          rollback: 'Un-quarantine restores the host to the pool',
        }]
      : [];
    ctx.whatWardenDid = WARDEN_DID[st];
    ctx.customerData = CUSTOMER_DATA[st];
    ctx.timeToDetect = 'Under 1 second. Sentry correlated 6 signals within the first second and opened INC-0419 as critical.';
    ctx.guests = st === 'detect'
      ? { confirmedAffected: 'not known yet' }
      : {
          confirmedAffected: 0,
          sharedTheSuspectHost: 11,
          movedToCleanHosts: st === 'contain' ? 'in progress' : 11,
          meaning: 'The 11 other guests only shared the suspect host. They were moved to clean hosts as a precaution. None is confirmed affected.',
        };
    ctx.containmentSteps = stepList(st);
    ctx.blastRadius = st === 'detect'
      ? { status: 'still being scored', suspectHosts: 1 }
      : { score: 0.87, suspectHosts: 1, exposedTokens: 2, managementPlane: 'reachable from the host, not compromised' };
    ctx.signals = '6 correlated: VMM audit ioctl, vGPU driver fault, IOMMU fault, qemu spawned a shell (host EDR), flow to the IPMI port, workload token used outside its scope';
    if (['approval', 'quarantine', 'contained'].includes(st)) {
      ctx.evidence = ['vm-7f3a.mem (64 GiB, hashed)', 'qemu-2231.core (1.2 GiB, hashed)', 'b14-gpu-07-flows.pcap (38 MB, hashed)'];
    }
    ctx.agents = agentsFor(st);
    ctx.policy = {
      rule: 'Policy, not the model, decides what is allowed.',
      wardenMayRunAlone: 'isolate network, revoke credentials, cordon host, pause guest, capture memory, fail over guests',
      needsAHuman: 'quarantine host, reimage host, terminate guest',
    };
    ctx.where = { facility: 'DFW-2 AI Compute Campus', suspectHost: 'b14-gpu-07 (Hall B, rack 14, slot 7)', suspectGuest: 'vm-7f3a', workloadIdentity: 'agent-7f3' };
  }
  ctx.warRoom = {
    channel: 'Out-of-band, off the corporate network; email and phones not required',
    people: { RK: 'Incident Commander (shift lead)', JT: 'Legal counsel', AL: 'CISO', PR: 'PR lead', CV: 'Cloud vendor', CEO: 'CEO' },
    tasks: tasksFor(st),
    notifications: {
      whoDecides: 'Counsel (JT) decides whether and when to notify. Claura gives no legal advice.',
      status: 'Clocks have not started. They start only when counsel makes the materiality call.',
      exampleClocks: ['SEC 8-K Item 1.05: within 4 business days after a materiality determination', 'GDPR: 72 hours to the supervisory authority, once personal data is involved'],
      note: 'Example obligations, confirm with counsel.',
    },
    brief: { happened: brief.happened, contained: brief.contained, impact: brief.impact, need: brief.need, weKnow: brief.know, weDontKnowYet: brief.dont },
  };
  ctx.fleet = { hosts: 2048, sandboxedAgents: 61207, meanTimeToContainSeconds: 11.8 };
  return ctx;
}

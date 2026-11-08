// ctx.getIncidentContext() and ctx.getBrief(): the incident every feature talks about (INC-0419) until a live source replaces it.
//
// Preferred source: the voice package's fixtures, so the spoken answers, the brief and every other feature tell one story.
// Fallback: the small built-in defaults below (the gateway must not depend on a package that may be broken).
// Live data later: gateway.setIncidentSource({ getIncidentContext, getBrief }) swaps both without touching the features.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const INCIDENT_ID = 'INC-0419';
export const STAGES = ['quiet', 'detect', 'contain', 'approval', 'quarantine', 'contained'];
export const DEFAULT_STAGE = 'approval'; // the console holds here until a human approves

const STATUS = {
  quiet: 'All clear',
  detect: 'Detected: six signals correlated, blast radius being scored',
  contain: 'Containing: reversible steps running',
  approval: 'Contained except one step that needs a human: quarantine of b14-gpu-07',
  quarantine: 'Quarantine approved and running',
  contained: 'Contained. Report filed.',
};
const NIST = { quiet: 'preparation', detect: 'detection_analysis', contain: 'containment', approval: 'containment', quarantine: 'containment', contained: 'post_incident' };

const stageOf = (o) => (STAGES.includes(o?.stage) ? o.stage : DEFAULT_STAGE);

function builtinContext(stage) {
  const open = stage !== 'quiet';
  return {
    scenario: 'Scripted demo data. Every number is illustrative.',
    incident: open
      ? { id: INCIDENT_ID, title: 'Suspected guest-to-host escape via the vGPU path', severity: 'critical', status: STATUS[stage], nistPhase: NIST[stage] }
      : { id: null, status: STATUS.quiet, lastIncident: 'INC-0418, filed 6 days ago' },
    where: { facility: 'DFW-2 AI Compute Campus', suspectHost: 'b14-gpu-07 (Hall B, rack 14, slot 7)', suspectGuest: 'vm-7f3a', neighbors: open ? 11 : 0 },
    isHostContained: stage === 'contained' ? 'Yes. b14-gpu-07 is quarantined.' : open ? 'Partly. Only the quarantine step is left and it needs a human.' : 'Nothing to contain.',
    pendingApprovals: stage === 'approval' ? [{ action: 'Quarantine host b14-gpu-07', waitingOn: 'RK (Incident Commander)', rollback: 'Un-quarantine restores the host to the pool' }] : [],
    warRoom: { brief: builtinBrief(stage), tasks: [] },
  };
}

function builtinBrief(stage) {
  if (stage === 'quiet') {
    return { stage, happened: 'Nothing to report. All systems are normal.', contained: 'Nothing to contain.', impact: 'No customers affected.', need: 'Nothing.', know: ['The command channel runs outside the company network'], dont: ['Nothing is open right now'] };
  }
  if (stage === 'contained') {
    return {
      stage,
      happened: 'An AI workload broke out of its virtual machine on one server, b14-gpu-07.',
      contained: 'The host is quarantined and eleven neighbouring workloads were moved to clean hosts.',
      impact: 'No customer is confirmed affected.',
      need: 'Counsel to decide on notification. Nothing else is needed from you.',
      know: ['It started on one server', 'It was stopped before the management network'],
      dont: ['Whether any data was read first', 'How the attacker found the flaw'],
    };
  }
  return {
    stage,
    happened: 'An AI workload is breaking out of its virtual machine toward a server shared with eleven other companies.',
    contained: 'Network isolated, credentials revoked, host cordoned, memory captured. One step is left and needs a person.',
    impact: 'No customer is confirmed affected.',
    need: 'The Incident Commander to approve the quarantine of b14-gpu-07.',
    know: ['It started on one server, b14-gpu-07', 'Six independent signals agree'],
    dont: ['Whether any data was read first', 'How the attacker found the flaw'],
  };
}

export function makeIncidentSource({ repo, log }) {
  let override = null;
  let fixtures; // undefined = not tried yet, null = unavailable
  async function richer() {
    if (fixtures !== undefined) return fixtures;
    const file = path.join(repo, 'voice', 'lib', 'fixtures.mjs');
    try {
      if (!fs.existsSync(file)) throw new Error('not found');
      const m = await import(pathToFileURL(file).href);
      fixtures = typeof m.buildIncidentContext === 'function' && typeof m.defaultBrief === 'function' ? m : null;
    } catch (e) {
      log?.warn?.(`incident defaults: voice fixtures unavailable (${e.message}); using the built-in INC-0419 defaults`);
      fixtures = null;
    }
    return fixtures;
  }
  return {
    /** @param {{stage?: string, incidentId?: string}} [opts] */
    async getIncidentContext(opts = {}) {
      if (override?.getIncidentContext) {
        const v = await override.getIncidentContext(opts);
        if (v) return v;
      }
      const stage = stageOf(opts);
      const fx = await richer();
      return fx ? fx.buildIncidentContext(stage) : builtinContext(stage);
    },
    /** @param {{stage?: string, lang?: string, incidentId?: string}} [opts] @returns {Promise<{happened:string,contained:string,impact:string,need:string,know:string[],dont:string[]}>} */
    async getBrief(opts = {}) {
      if (override?.getBrief) {
        const v = await override.getBrief(opts);
        if (v) return v;
      }
      const stage = stageOf(opts);
      const fx = await richer();
      return fx ? fx.defaultBrief(stage) : builtinBrief(stage);
    },
    /** Replace the defaults with live state. Either function may be omitted; returning a falsy value falls back to the defaults. */
    set(source) {
      override = source && typeof source === 'object' ? source : null;
    },
  };
}

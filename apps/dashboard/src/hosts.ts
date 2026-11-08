// Hosts: ids, derived info for the Host sheet, and the helper that makes any host id clickable.
//
// A host id looks like `b14-gpu-07` = hall B, rack 14, slot 7. The facility map, the incident hero,
// agent lines, reports and War Room messages all route through here, so a click anywhere opens the
// same Host sheet (window.bulkhead.openHost(id)).
import { hash } from "./util";
import { S, info, phase } from "./engine";

export const HALL_LETTERS = "abcd";
const HOST_RE = /\b([a-d]\d{2}-gpu-\d{2})\b/g;

export const hostId = (hall: number, rack: number, slot: number) =>
  `${HALL_LETTERS[hall]}${String(rack + 1).padStart(2, "0")}-gpu-${String(slot).padStart(2, "0")}`;

export function parseHost(id: string): { hall: number; rack: number; slot: number } | null {
  const m = /^([a-d])(\d{2})-gpu-(\d{2})$/.exec(id);
  if (!m) return null;
  const hall = HALL_LETTERS.indexOf(m[1]);
  const rack = +m[2] - 1;
  const slot = +m[3];
  if (rack < 0 || rack > 31 || slot < 1 || slot > 16) return null;
  return { hall, rack, slot };
}

/** Guest VMs on a host. Rack B14 is the incident rack: host 07 carries 12. */
export function guestsFor(hall: number, rack: number, slot: number): number {
  if (hall === 1 && rack === 13) return slot === 7 ? 12 : 6 + Math.floor(hash(77, slot - 1) * 5);
  return 6 + Math.floor(hash(hall, rack, slot, 7) * 5);
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One clickable host id. */
export const hostLink = (id: string) => `<span class="host" role="link" data-host="${id}">${id}</span>`;
/** Escape plain text and turn every host id in it into a clickable link. */
export const linkHosts = (text: string) => esc(text).replace(HOST_RE, (_m, id: string) => hostLink(id));

export interface HostInfo {
  id: string;
  where: string;
  guests: number;
  load: number;
  temp: number;
  status: string;
  tone: "safe" | "hot" | "busy";
  note: string;
  incident: boolean;
}

export function hostInfo(id: string): HostInfo | null {
  const p = parseHost(id);
  if (!p) return null;
  const incident = id === info().host;
  let guests = guestsFor(p.hall, p.rack, p.slot);
  let load = 18 + Math.floor(hash(p.hall, p.rack, p.slot, 3) * 50);
  const temp = 57 + Math.floor(hash(p.hall, p.rack, p.slot, 5) * 9);
  let status = "Healthy";
  let tone: HostInfo["tone"] = "safe";
  let note = `No alerts. ${guests} guests running and GPU memory errors at zero.`;

  if (incident && S.started) {
    const ph = phase();
    const r = S.r;
    guests = r < 4.6 ? 12 : r >= 5.3 ? 1 : 12 - Math.floor(((r - 4.6) / 0.7) * 11);
    load = 71;
    if (ph === "breach") {
      tone = "hot";
      if (r < 3.3) {
        status = "Suspect";
        note = "qemu on this host spawned a shell after a DMA fault. Agents are containing it.";
      } else {
        status = "Cordoned";
        note = r >= 4.6 ? "The guest is paused. Co-resident guests are failing over to clean hosts." : "No new placements. Warden is pausing the guest.";
      }
    } else if (ph === "approval") {
      tone = "hot";
      status = "Awaiting approval";
      note = "Everything reversible is done. Warden needs a human to quarantine this host.";
    } else if (ph === "isolating") {
      tone = "busy";
      status = "Quarantining";
      note = "Taking the host off the fabric and pruning its BMC VLAN.";
    } else {
      status = "Quarantined";
      load = 0;
      note = "Out of the pool, memory captured. Reimage it before it returns.";
    }
  }
  return {
    id,
    where: `Hall ${HALL_LETTERS[p.hall].toUpperCase()} · rack ${p.rack + 1} · slot ${p.slot}`,
    guests,
    load,
    temp,
    status,
    tone,
    note,
    incident,
  };
}

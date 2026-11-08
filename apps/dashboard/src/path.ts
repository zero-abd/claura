import { clamp, easeOut, easeOutBack } from "./util";
import { ISOLATE_DUR } from "./script";
import { icon } from "./icons";
import { setAttr, setText } from "./dom";

// Attack path: five compartments. The escape reaches the hypervisor boundary and a door
// seals it there (T+3.8 s). Same script times as before, drawn as plain DOM.

const NODES = [
  { name: "Guest agent", ico: "terminal" },
  { name: "vGPU driver", ico: "cpu" },
  { name: "QEMU / VMM", ico: "cube" },
  { name: "Host kernel", ico: "server" },
  { name: "Management", ico: "network" },
];
export const SEAL_AT = 3.8;
const HOT_FROM = 10; // % of width where the node-0 centre sits
const HOT_SPAN = 48; // % of width to the seal

export function pathHTML(): string {
  return `<div class="path" id="path" data-c="0">
    <div class="p-line"></div>
    <div class="p-hot" id="pHot"></div>
    <i class="p-tip" id="pTip"></i>
    <i class="p-wall" id="pw1" style="left:20%"></i>
    <i class="p-wall" id="pw2" style="left:40%"></i>
    <i class="p-wall" id="pw4" style="left:80%"></i>
    <div class="p-seal" id="pSeal">
      <i class="p-burst" id="pBurst"></i>
      <span class="p-door">${icon("lock")}</span>
      <em id="pSealLabel"></em>
    </div>
    ${NODES.map(
      (n, i) => `<div class="p-node" id="pn${i}" data-s="idle">
        <span class="p-ico">${icon(n.ico)}</span>
        <b>${n.name}</b>
        <span class="p-st" id="ps${i}"></span>
      </div>`,
    ).join("")}
  </div>`;
}

export interface PathState {
  started: boolean;
  r: number;
  u: number;
}

export function updatePath(root: HTMLElement, s: PathState, amb: number): string {
  const q = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const inc = s.started && s.r >= 0;
  const contained = s.u >= ISOLATE_DUR;
  const sealed = inc && s.r >= SEAL_AT;
  setAttr(root, "data-c", contained ? "1" : "0");

  // attack line + its leading tip
  const p = inc ? easeOut(clamp(s.r / 1.0)) : 0;
  const hot = q("pHot");
  hot.style.transform = `scaleX(${p.toFixed(4)})`;
  hot.style.opacity = inc ? "1" : "0";
  setAttr(hot, "data-s", contained ? "safe" : "hot");
  const tip = q("pTip");
  const pr = sealed ? 1 : 1 + 0.35 * (0.5 + 0.5 * Math.sin(amb * 9));
  tip.style.left = `${HOT_FROM + HOT_SPAN * p}%`;
  tip.style.opacity = inc ? "1" : "0";
  tip.style.transform = `translate(-50%, -50%) scale(${pr.toFixed(3)})`;
  setAttr(tip, "data-s", contained ? "safe" : "hot");

  // the seal door
  const seal = q("pSeal");
  const dp = sealed ? easeOutBack(clamp((s.r - SEAL_AT) / 0.34)) : 0;
  seal.style.opacity = sealed ? String(clamp((s.r - SEAL_AT) / 0.1)) : "0";
  seal.style.setProperty("--drop", `${((1 - dp) * -64).toFixed(2)}px`);
  setAttr(seal, "data-s", contained ? "safe" : sealed ? "sealed" : "idle");
  const bp = sealed ? clamp((s.r - SEAL_AT - 0.16) / 0.55) : 0;
  const burst = q("pBurst");
  burst.style.opacity = bp > 0 && bp < 1 ? String(((1 - bp) * 0.7).toFixed(3)) : "0";
  burst.style.transform = `translate(-50%, -50%) scale(${(0.5 + bp * 2.2).toFixed(3)})`;
  setText(q("pSealLabel"), sealed ? (contained ? "Sealed" : `Sealed T+${SEAL_AT.toFixed(1)}s`) : "");

  // bulkhead hairlines the attack went through
  setAttr(q("pw1"), "data-s", inc && s.r >= 0.1 ? "breached" : "idle");
  setAttr(q("pw2"), "data-s", inc && s.r >= 0.4 ? "breached" : "idle");

  // nodes
  const node = (i: number, state: string, status: string) => {
    setAttr(q("pn" + i), "data-s", state);
    setText(q("ps" + i), status);
  };
  if (!inc) {
    node(0, "idle", "Sandboxed");
    node(1, "idle", "Intact");
    node(2, "idle", "Intact");
    node(3, "idle", "Intact");
    node(4, "idle", "Intact");
  } else {
    let g0 = "Compromised";
    if (s.r >= 2.4) g0 = "Network cut";
    if (s.r >= 2.9) g0 = "Tokens revoked";
    if (s.r >= 3.8) g0 = "Paused";
    if (s.r >= 4.6) g0 = "Paused, memory kept";
    node(0, s.r >= 3.8 ? (contained ? "frozen-safe" : "frozen") : "hot", g0);
    node(1, s.r >= 0.15 ? (contained ? "spent" : "hot") : "idle", s.r >= 0.3 ? "DMA out of range" : s.r >= 0.15 ? "Driver fault" : "Intact");
    node(2, s.r >= 0.5 ? (contained ? "safe" : sealed ? "stopped" : "hot") : "idle", sealed ? "Stopped here" : s.r >= 0.5 ? "Shell spawned" : "Intact");
    node(3, "unreached", "Not reached");
    node(4, s.u >= 1.4 ? "unreached" : s.r >= 0.7 ? "exposed" : "unreached", s.u >= 1.4 ? "VLAN pruned" : s.r >= 0.7 ? "Reachable" : "Not reached");
  }

  if (!inc) return "All boundaries intact";
  if (contained) return "Sealed at the hypervisor boundary";
  if (sealed) return "Stopped at the hypervisor boundary";
  return "Reached the hypervisor boundary";
}

/* Planned architecture, drawn as SVG.
   telemetry -> Nemotron (on-prem) -> policy gate -> actions, and SpacetimeDB -> every console.
   Two layouts from the same parts: "wide" (desktop) and "tall" (phone). CSS switches between them. */

const SVGNS = "http://www.w3.org/2000/svg";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const TELEMETRY = ["IOMMU faults", "Hypervisor audit logs", "Host EDR", "IPMI flows", "Token misuse"];
const ACTIONS = ["Isolate network", "Revoke credentials", "Cordon host", "Pause guest", "Capture memory", "Fail over guests"];
const AGENTS = ["Sentry", "Triage", "Warden", "Scribe"];
const OPERATORS = ["RK", "JT", "AL"];

/* ── primitives ── */
const group = (c: number, body: string) => `<g data-col style="--c:${c}">${body}</g>`;

const text = (x: number, y: number, s: string, cls: string, anchor: "start" | "middle" | "end" = "start") =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;

const box = (x: number, y: number, w: number, h: number, r: number, cls = "node") =>
  `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;

const chip = (x: number, y: number, w: number, h: number, label: string) =>
  box(x, y, w, h, Math.min(16, h / 2)) + text(x + 16, y + h / 2 + 5, label, "t-chip");

const flow = (d: string, cls = "flow", arrow = true) =>
  `<path class="${cls}" d="${d}"${arrow ? ' marker-end="url(#arr)"' : ""}/>`;

const pill = (x: number, y: number, w: number, h: number, label: string, cls = "t-mut") =>
  `<rect class="pill" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>` +
  text(x + w / 2, y + h / 2 + 4.5, label, cls, "middle");

const avatar = (cx: number, cy: number, initials: string) =>
  `<circle class="pill" cx="${cx}" cy="${cy}" r="13"/>` + text(cx, cy + 4.5, initials, "t-mut", "middle");

/* ── wide layout: 1120 x 690 ── */
function wide(): string {
  const W = 1120;
  const colTop = 56;
  const colH = 296;
  const bus = 730;
  const chipYs = ACTIONS.map((_, i) => colTop + i * 44);
  const humanY = 318;

  const telem = TELEMETRY.map((t, i) => {
    const y = colTop + i * 61.5;
    return chip(0, y, 232, 50, t) + flow(`M234 ${y + 25} H308`);
  }).join("");

  const nemo =
    box(312, colTop, 262, colH, 24) +
    text(336, 96, "Defender agents", "t-title") +
    text(336, 120, "NVIDIA Nemotron", "t-sub") +
    pill(336, 134, 156, 26, "self-hosted · on-prem") +
    AGENTS.map((a, i) => pill(336 + (i % 2) * 112, 196 + Math.floor(i / 2) * 48, 104, 38, a, "t-chip")).join("") +
    text(336, 312, "Reason over the telemetry and", "t-mut") +
    text(336, 330, "propose bounded actions.", "t-mut") +
    flow(`M576 204 H648`) +
    text(612, 190, "proposes", "t-mut", "middle");

  const gate =
    text(662, 24, "Policy gate", "t-title", "middle") +
    `<rect class="gate" x="654" y="40" width="16" height="134" rx="8"/>` +
    `<rect class="gate" x="654" y="234" width="16" height="134" rx="8"/>` +
    text(662, 398, "Policy, not the model,", "t-sub", "middle") +
    text(662, 416, "decides what executes.", "t-sub", "middle") +
    flow(`M672 204 H${bus}`, "flow", false) +
    text(702, 190, "allowed", "t-mut", "middle");

  const actions =
    text(776, 30, "Actions", "t-mut") +
    `<path class="flow" d="M${bus} ${chipYs[0] + 18} V${humanY + 17}" />` +
    ACTIONS.map((a, i) => chip(776, chipYs[i], 344, 36, a) + flow(`M${bus} ${chipYs[i] + 18} H772`)).join("") +
    box(776, humanY, 344, 34, 16, "node sig") +
    text(792, humanY + 22, "Quarantine host", "t-chip") +
    text(1104, humanY + 22, "needs a person · ⌘↵", "t-sig", "end") +
    flow(`M${bus} ${humanY + 17} H772`, "flow sig");

  const barY = 470;
  const bar =
    flow(`M443 ${colTop + colH + 4} V${barY - 4}`) +
    text(455, 420, "alerts · proposals", "t-mut") +
    flow(`M948 ${colTop + colH + 4} V${barY - 4}`) +
    text(960, 420, "actions · approvals", "t-mut") +
    box(0, barY, W, 80, 26) +
    text(28, barY + 34, "SpacetimeDB", "t-title") +
    text(28, barY + 58, "The incident state machine. Every alert, action and approval is a row.", "t-sub");

  const consoleY = 610;
  const xs = [228, 456, 684];
  const consoles =
    xs
      .map(
        (x, i) =>
          flow(`M${x + 104} ${barY + 82} V${consoleY - 4}`) +
          box(x, consoleY, 208, 56, 18) +
          avatar(x + 34, consoleY + 28, OPERATORS[i]) +
          text(x + 60, consoleY + 33, "Operator console", "t-chip"),
      )
      .join("") + text(560, 700, "Every operator sees the same incident, live.", "t-mut", "middle");

  return `<svg class="wide" viewBox="0 0 ${W} 716" role="img" aria-label="Planned architecture. Telemetry feeds defender agents running NVIDIA Nemotron on-prem. Proposed actions pass a policy gate before they execute. SpacetimeDB holds every alert, action and approval as a row, live on every operator console." focusable="false">
    ${group(0, text(0, 30, "Telemetry", "t-mut") + telem)}
    ${group(1, nemo)}
    ${group(2, gate)}
    ${group(3, actions)}
    ${group(4, bar)}
    ${group(5, consoles)}
  </svg>`;
}

/* ── tall layout (phones): 340 x 1110 ── */
function tall(): string {
  const W = 340;
  const half = 164;

  const telem =
    text(0, 14, "Telemetry", "t-mut") +
    TELEMETRY.map((t, i) => chip((i % 2) * (W - half), 26 + Math.floor(i / 2) * 56, half, 44, t)).join("") +
    flow(`M170 192 V234`);

  const nemo =
    box(0, 238, W, 168, 24) +
    text(20, 276, "Defender agents", "t-title") +
    text(20, 298, "NVIDIA Nemotron", "t-sub") +
    pill(20, 310, 156, 26, "self-hosted · on-prem") +
    AGENTS.map((a, i) => pill(20 + i * 77.3, 354, 68, 36, a, "t-chip")).join("") +
    flow(`M170 408 V452`) +
    text(182, 436, "proposes", "t-mut");

  const gate =
    `<rect class="gate" x="0" y="456" width="134" height="16" rx="8"/>` +
    `<rect class="gate" x="206" y="456" width="134" height="16" rx="8"/>` +
    text(0, 502, "Policy gate", "t-title") +
    text(0, 522, "Policy, not the model,", "t-sub") +
    text(0, 538, "decides what executes.", "t-sub") +
    flow(`M170 474 V574`) +
    text(182, 558, "allowed", "t-mut");

  const aTop = 580;
  const actions =
    text(0, aTop + 14, "Actions", "t-mut") +
    ACTIONS.map((a, i) => chip((i % 2) * (W - half), aTop + 26 + Math.floor(i / 2) * 46, half, 38, a)).join("") +
    box(0, aTop + 168, W, 42, 18, "node sig") +
    text(16, aTop + 194, "Quarantine host", "t-chip") +
    text(W - 16, aTop + 194, "needs a person · ⌘↵", "t-sig", "end") +
    flow(`M170 ${aTop + 214} V${aTop + 258}`) +
    text(182, aTop + 242, "actions · approvals", "t-mut");

  const barY = aTop + 262;
  const bar =
    box(0, barY, W, 112, 26) +
    text(20, barY + 38, "SpacetimeDB", "t-title") +
    text(20, barY + 62, "The incident state machine.", "t-sub") +
    text(20, barY + 80, "Every alert, action and approval", "t-sub") +
    text(20, barY + 98, "is a row.", "t-sub");

  const cY = barY + 160;
  const consoles =
    [0, 118, 236]
      .map(
        (x, i) =>
          flow(`M${x + 52} ${barY + 114} V${cY - 4}`) +
          box(x, cY, 104, 62, 18) +
          avatar(x + 52, cY + 24, OPERATORS[i]) +
          text(x + 52, cY + 52, "Console", "t-mut", "middle"),
      )
      .join("") + text(170, cY + 92, "Every operator sees the same incident, live.", "t-mut", "middle");

  return `<svg class="tall" viewBox="0 0 ${W} ${cY + 104}" role="img" aria-label="Planned architecture. Telemetry feeds defender agents running NVIDIA Nemotron on-prem. Proposed actions pass a policy gate before they execute. SpacetimeDB holds every alert, action and approval as a row, live on every operator console." focusable="false">
    ${group(0, telem)}
    ${group(1, nemo)}
    ${group(2, gate)}
    ${group(3, actions)}
    ${group(4, bar)}
    ${group(5, consoles)}
  </svg>`;
}

/* Shared defs live in one zero-size SVG that always renders (gradients inside a display:none SVG fail). */
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="gl" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".07"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".35" stop-color="#fff" stop-opacity=".08"/><stop offset=".7" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/>
  </linearGradient>
  <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path class="arrow-fill" d="M0 0 L10 5 L0 10 z"/>
  </marker>
</defs></svg>`;

export function initDiagram(): void {
  const host = document.querySelector<HTMLElement>("[data-diagram-art]");
  if (!host) return;
  host.innerHTML = DEFS + wide() + tall();
}

/* Triage's blast radius: 11 co-resident guests on a ring around the suspect host.
   The angles leave a gap on the right for the dashed line to the management plane. */
export function buildBlast(): void {
  const g = document.querySelector<SVGGElement>(".art-triage .guests");
  if (!g) return;
  const cx = 112;
  const cy = 120;
  const r = 70;
  for (let k = 0; k < 11; k++) {
    const a = ((16.36 + (360 / 11) * k) * Math.PI) / 180;
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("class", "guest");
    c.setAttribute("cx", (cx + r * Math.cos(a)).toFixed(1));
    c.setAttribute("cy", (cy + r * Math.sin(a)).toFixed(1));
    c.setAttribute("r", "6.5");
    c.style.setProperty("--k", String(k + 3));
    g.appendChild(c);
  }
}

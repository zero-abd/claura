// A stand-in for the feature gateway, only to exercise the console's loader (the real gateway lives outside this repo).
// It speaks the contract from src/features.ts:
//   GET /api/health                  -> { features: [{ name, title, track, status, ui }] }
//   GET /client/claura-features.js   -> ES module, default export async load({ base }) importing each feature's ui.js
//   GET /features/<name>/ui.js       -> attaches to window.claura WITHOUT overwriting existing keys
// CORS is open (the console is a different origin). Binds to 127.0.0.1 only.
//
//   node tools/mock-gateway.mjs [port]      (default 8791, so it never collides with the real gateway on 8787)
import { createServer } from "node:http";

export const FEATURES = [
  { name: "ssh", title: "Secure Shell", track: "Winstead", status: "live", ui: "/features/ssh/ui.js" },
  { name: "voice", title: "Ask Claura (voice)", track: "NVIDIA", status: "mock", ui: "/features/voice/ui.js" },
  { name: "solana", title: "Evidence anchor", track: "Solana", status: "mock", ui: "/features/solana/ui.js" },
  { name: "ledger", title: "Session ledger", track: "Spacetime", status: "down", ui: "/features/ledger/ui.js" },
];

const loader = `
export default async function load({ base }) {
  const res = await fetch(base + "/api/health");
  const { features } = await res.json();
  await Promise.all(features.filter((f) => f.status !== "down").map((f) => import(base + f.ui)));
  return features.length;
}
`;
const attach = (name, extra) => `
const c = (window.claura = window.claura || {});
c.integrations = c.integrations || {};
if (!c.integrations[${JSON.stringify(name)}]) c.integrations[${JSON.stringify(name)}] = {
  title: ${JSON.stringify(FEATURES.find((f) => f.name === name).title)},
  track: ${JSON.stringify(FEATURES.find((f) => f.name === name).track)},
  status: ${JSON.stringify(FEATURES.find((f) => f.name === name).status)},
  open(container) { container.innerHTML = '<p data-mock-panel="${name}" style="margin:0;color:inherit">Mock panel for ${name}. Mounted by the feature, not by the console.</p>'; },
};
${extra}
`;
const UI = {
  ssh: attach("ssh", `if (!c.openShell) c.openShell = (hostId) => { window.__shellOpened = hostId; };`),
  voice: attach("voice", `if (!c.voice) c.voice = { toggle() { window.__voice = (window.__voice || 0) + 1; }, playBrief() {}, say() {}, sting() {} };`),
  solana: attach(
    "solana",
    `if (!c.anchor) c.anchor = async (hash, label) => {
      window.__anchorCall = [hash, label];
      await new Promise((r) => setTimeout(r, 350));
      const sig = "5Kq9mockSignatureForTheAnchorTest" + hash.slice(0, 24);
      return { signature: sig, explorer: "https://explorer.solana.com/tx/" + sig + "?cluster=devnet" };
    };`,
  ),
};

export function startMockGateway(port = 8791) {
  const server = createServer((req, res) => {
    const cors = { "access-control-allow-origin": "*", "cache-control": "no-store" };
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/health") {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      return res.end(JSON.stringify({ features: FEATURES }));
    }
    if (url.pathname === "/client/claura-features.js") {
      res.writeHead(200, { ...cors, "content-type": "text/javascript" });
      return res.end(loader);
    }
    const m = /^\/features\/([a-z]+)\/ui\.js$/.exec(url.pathname);
    if (m && UI[m[1]]) {
      res.writeHead(200, { ...cors, "content-type": "text/javascript" });
      return res.end(UI[m[1]]);
    }
    res.writeHead(404, cors);
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ port, close: () => new Promise((r) => server.close(() => r())) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.argv[2] ?? "8791", 10);
  await startMockGateway(port);
  console.log(`mock gateway on http://127.0.0.1:${port} (Ctrl+C to stop)`);
}

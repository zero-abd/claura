// Anchor UI proof (replay data, no backend): what Reports says after "Anchor evidence on Solana devnet", for the answers the
// solana-anchor server really gives (see integrations/solana-anchor/server.mjs):
//   mock  -> { mock: true, signature: "mock-<32 hex>", explorer: null, reason: "unfunded" }   (devnet wallet has no SOL)
//   live  -> { mock: false, signature: "<base58>", slot, explorer: "https://explorer.solana.com/tx/..." }
// A simulated anchor must say so (amber), carry no Explorer link, and stay out of the printed PDF; a real one keeps its link.
//
//   node tools/anchor-proof.mjs [--port 4431] [--out dir]
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4431");
const OUT = resolve(opt("out", "anchor-proof-out"));
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};

const MOCK = `async (hash, label) => ({ ok: true, mock: true, signature: 'mock-' + hash.slice(0, 32), slot: null, explorer: null, memo: 'claura:' + label, hash, label, reason: 'unfunded' })`;
const LIVE = `async (hash, label) => ({ ok: true, mock: false, signature: '5Kq9realSignature' + hash.slice(0, 40), slot: 123, explorer: 'https://explorer.solana.com/tx/5Kq9realSignature' + hash.slice(0, 40) + '?cluster=devnet', hash, label })`;

const chrome = await launchChrome({ width: 1440, height: 900 });
try {
  for (const [kind, fn] of [["mock", MOCK], ["live", LIVE]]) {
    const p = await chrome.page(`http://127.0.0.1:${PORT}/?demo=1&t=14&view=reports&expand=report:INC-0419`);
    await p.until("window.claura && document.readyState === 'complete'", 20000, "boot");
    await sleep(1500);
    await p.eval(`window.claura.anchor = ${fn}; true`);
    await sleep(300);
    await p.clickSel("#anchorBtn");
    await p.until("document.getElementById('anchorOut') && !document.getElementById('anchorOut').hidden && document.getElementById('anchorOut').dataset.s !== 'busy'", 8000, "anchor result");
    const o = await p.eval("(() => { const e = document.getElementById('anchorOut'); return { s: e.dataset.s, text: e.textContent.replace(/\\s+/g, ' ').trim(), links: e.querySelectorAll('a[href]').length, color: getComputedStyle(e.querySelector('b')).color }; })()");
    console.log(`  ${kind}: ${JSON.stringify(o)}`);
    await p.eval("document.getElementById('anchorOut').scrollIntoView({ block: 'center' }), true");
    await sleep(500);
    await p.shot(`${OUT}/anchor-${kind}.png`);
    await p.send("Emulation.setEmulatedMedia", { media: "print" });
    await sleep(200);
    const printed = await p.eval("getComputedStyle(document.getElementById('anchorOut')).display");
    await p.send("Emulation.setEmulatedMedia", { media: "" });
    if (kind === "mock") {
      check("mock: the result says 'Simulated anchor — devnet wallet not funded yet'", o.s === "sim" && /Simulated anchor — devnet wallet not funded yet/.test(o.text), o.text.slice(0, 110));
      check("mock: no Explorer link", o.links === 0 && !/Open in Solana Explorer/.test(o.text));
      check("mock: never says 'Anchored on Solana devnet'", !/Anchored on Solana devnet/.test(o.text));
      check("mock: amber, not green", /^rgb\((2[0-9]{2}|1[5-9][0-9])/.test(o.color) && o.s === "sim", o.color);
      check("mock: left out of the printed PDF (print media: display none)", printed === "none", `print display=${printed}`);
    } else {
      check("live: 'Anchored on Solana devnet' with the signature and an https Explorer link", o.s === "ok" && /Anchored on Solana devnet/.test(o.text) && o.links === 1, o.text.slice(0, 110));
      check("live: kept in the printed PDF", printed !== "none", `print display=${printed}`);
    }
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
} catch (e) {
  console.log("PROOF ERROR:", e.stack || e.message);
  process.exitCode = 1;
} finally {
  chrome.close();
}
process.exit(process.exitCode ?? (results.every((r) => r.ok) ? 0 : 1));

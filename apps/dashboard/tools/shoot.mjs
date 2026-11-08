// Screenshot driver: headless Chrome over the DevTools protocol (no dependencies; Node 22+ has WebSocket built in).
//
//   node tools/shoot.mjs [--port 4317] [--out shots] [--only name,name] [--list]
//
// Every shot is 1728x1080 CSS px at device-scale-factor 2 (3456x2160 PNG). WebGL runs through ANGLE/Metal, the page
// is loaded with ?demo=1 (hides the dev dock), and the script waits until the 3D stage reports 'mounted' (or gives up
// after 15 s and shoots the 2D fallback) before it settles and captures. Chrome gets its own throwaway profile dir
// and is always killed on exit. The debugging port is loopback-only.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4317");
const OUT = resolve(opt("out", "shots"));
const ONLY = opt("only", "")
  .split(",")
  .filter(Boolean);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = `http://127.0.0.1:${PORT}/`;
const W = 1728;
const H = 1080;

// name, query string (after ?demo=1&), optional page script run after load (string), extra settle in ms.
// Page scripts talk to window.claura (the same API the film recorder uses).
export const SHOTS = [
  { name: "overview", q: "view=overview" },
  { name: "overview-breach", q: "view=overview&phase=breach", settle: 3600 },
  { name: "incident-breach", q: "view=incident&phase=breach", settle: 3600 },
  { name: "incident-approval", q: "view=incident&phase=approval", settle: 3600 },
  { name: "incident-contained", q: "view=incident&phase=contained", settle: 3600 },
  { name: "incident-scroll", q: "view=incident&phase=contained", settle: 3600, run: "document.querySelector('#scroll').scrollTop = 560" },
  { name: "scope", q: "view=scope&phase=contained" },
  { name: "scope-live", q: "view=scope&t=4.0&approveAt=7.4" },
  { name: "scope-expanded", q: "view=scope&phase=contained&expand=asset:6,asset:3" },
  { name: "scope-empty", q: "view=scope" },
  { name: "access-nominal", q: "view=access" },
  { name: "access", q: "view=access&phase=contained" },
  { name: "access-add-person", q: "view=access&phase=contained&sheet=person" },
  { name: "access-code", q: "view=access&phase=contained&sheet=person-code" },
  { name: "access-expanded", q: "view=access&phase=contained&expand=identities,enroll-how" },
  { name: "access-nonadmin", q: "view=access&phase=contained&as=JT" },
  { name: "approval-nonadmin", q: "view=incident&phase=approval&as=JT", settle: 3000 },
  { name: "warroom", q: "view=warroom&phase=contained" },
  { name: "warroom-exec", q: "view=warroom&t=5.2&channel=exec&expand=tasks,decisions" },
  { name: "report", q: "phase=report" },
  { name: "report-actions", q: "phase=report&expand=rs:actions,rs:scope" },
  { name: "report-evidence", q: "phase=report&expand=rs:evidence,rs:comms" },
  { name: "isolation", q: "view=incident&phase=contained&pop=isolation" },
  { name: "agents", q: "view=agents&phase=breach" },
  { name: "agents-expanded", q: "view=agents&phase=breach&expand=agent:warden" },
  { name: "policy", q: "view=policy" },
  { name: "shells", q: "view=shells" },
  { name: "host-sheet", q: "view=incident&phase=breach&host=b14-gpu-07" },
];

const EVALS = [];
args.forEach((a, i) => a === "--eval" && EVALS.push(args[i + 1]));
const URL_ARG = opt("url", "");
const CLICKS = [];
args.forEach((a, i) => a === "--click" && CLICKS.push(args[i + 1])); // --click x,y : a real mouse click (CSS px) after load
const SNAP = opt("snap", "");
const PDF = opt("pdf", "");
const PRINT = opt("print", "report");
const PAGES = opt("pages", ""); // printToPDF pageRanges, e.g. "2" or "2-3"
const CLIP = opt("clip", "");
const WAIT = parseInt(opt("wait", "1500"), 10);

if (args.includes("--list")) {
  console.log(SHOTS.map((s) => s.name).join("\n"));
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const dir = mkdtempSync(join(tmpdir(), "claura-shoot-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--user-data-dir=${dir}`,
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--use-angle=metal",
      "--enable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate,MediaRouter",
      `--window-size=${W},${H}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  const cleanup = () => {
    try {
      proc.kill("SIGKILL");
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  // Chrome writes the chosen port to <profile>/DevToolsActivePort
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = parseInt(readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")[0], 10);
    } catch {}
  }
  if (!port) throw new Error("Chrome did not start");
  return { port, cleanup };
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method === "Runtime.consoleAPICalled") {
        const t = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        if (m.params.type === "error" || m.params.type === "warning") this.logs.push(`${m.params.type}: ${t}`);
      } else if (m.method === "Runtime.exceptionThrown") {
        this.logs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { port, cleanup } = await launch();
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    const cdp = new CDP(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

    if (EVALS.length) {
      await cdp.send("Page.navigate", { url: `${BASE}?demo=1&${URL_ARG.replace(/^\?/, "")}` });
      for (let i = 0; i < 150; i++) {
        await sleep(100);
        try {
          if ((await cdp.eval(`window.claura ? window.claura.stage : null`)) === "mounted") break;
        } catch {}
      }
      await sleep(600);
      for (const c of CLICKS) {
        const [x, y] = c.split(",").map(Number);
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await sleep(250);
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
        await sleep(700);
      }
      for (const e of EVALS) {
        try {
          console.log(JSON.stringify(await cdp.eval(e)));
        } catch (err) {
          console.log("ERR " + err.message);
        }
      }
      if (PDF) {
        await sleep(WAIT);
        await cdp.eval(`document.body.dataset.print = ${JSON.stringify(PRINT)}`);
        await sleep(300);
        const pdf = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, ...(PAGES ? { pageRanges: PAGES } : {}) });
        writeFileSync(resolve(PDF), Buffer.from(pdf.data, "base64"));
        console.log(resolve(PDF));
      }
      if (SNAP) {
        await sleep(WAIT);
        const params = { format: "png", captureBeyondViewport: false };
        if (CLIP) {
          const [x, y, w, h] = CLIP.split(",").map(Number);
          params.clip = { x, y, width: w, height: h, scale: 1 };
        }
        const shot = await cdp.send("Page.captureScreenshot", params);
        writeFileSync(resolve(SNAP), Buffer.from(shot.data, "base64"));
        console.log(resolve(SNAP));
      }
      if (cdp.logs.length) console.log("console:", cdp.logs.slice(0, 6).join(" | "));
      ws.close();
      return;
    }
    const list = SHOTS.filter((s) => !ONLY.length || ONLY.includes(s.name));
    for (const s of list) {
      cdp.logs.length = 0;
      await cdp.send("Page.navigate", { url: `${BASE}?demo=1&${s.q}` });
      // wait for the app, then for the 3D stage (or give up and shoot the 2D map)
      let mounted = false;
      for (let i = 0; i < 150; i++) {
        await sleep(100);
        try {
          const st = await cdp.eval(`(window.claura && document.readyState !== 'loading') ? window.claura.stage : null`);
          if (st === "mounted") {
            mounted = true;
            break;
          }
        } catch {}
      }
      await cdp.eval(`document.fonts.ready.then(() => true)`);
      if (s.run) await cdp.eval(s.run);
      await sleep(s.settle ?? 1800);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const file = join(OUT, `${s.name}.png`);
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      const errs = cdp.logs.filter((l) => !/favicon|Download the React DevTools/.test(l));
      console.log(`${file}${mounted ? "" : "  (2D fallback)"}${errs.length ? "\n   " + errs.slice(0, 4).join("\n   ") : ""}`);
    }
    ws.close();
  } finally {
    cleanup();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

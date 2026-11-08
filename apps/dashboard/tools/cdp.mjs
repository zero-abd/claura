// Tiny headless-Chrome driver over the DevTools protocol, no dependencies (Node 22+ has WebSocket built in).
//
//   import { launchChrome } from "./cdp.mjs";
//   const chrome = await launchChrome({ width: 1100, height: 1000 });   // own throwaway profile dir, loopback only
//   const page = await chrome.page("http://127.0.0.1:4317/?live=1");
//   await page.eval("document.title");  await page.click(x, y);  await page.type("text");  await page.shot("a.png");
//   chrome.close();                                                      // kills Chrome and removes the profile dir
//
// Used by tools/regress.mjs (scripted-mode regression) and tools/live-proof.mjs (two live consoles side by side).
// Chrome runs headless=new with ANGLE/Metal and the GPU on, so the WebGL facility renders like it does for a person.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

class Page {
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
  async goto(url) {
    await this.send("Page.navigate", { url });
  }
  /** Wait until `expr` (evaluated in the page) is truthy. Returns its value, or throws after `ms`. */
  async until(expr, ms = 15000, label = expr) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < ms) {
      try {
        last = await this.eval(expr);
        if (last) return last;
      } catch {
        /* the page may be navigating */
      }
      await sleep(100);
    }
    throw new Error(`timed out after ${ms} ms waiting for: ${label}`);
  }
  async click(x, y) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(120);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  /** Click the centre of the first element matching `selector` (a real mouse event). */
  async clickSel(selector) {
    // wait for the element to stop moving (sheets spring in), then click its centre
    const rect = () => this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    let r = await rect();
    for (let i = 0; i < 25 && r; i++) {
      await sleep(90);
      const n = await rect();
      const still = n && Math.abs(n.x - r.x) < 0.5 && Math.abs(n.y - r.y) < 0.5;
      r = n;
      if (still) break;
    }
    if (!r) throw new Error(`no element for ${selector}`);
    await this.click(r.x, r.y);
  }
  /** Type text into whatever has focus (real key events, so the page's input handlers run). */
  async type(text) {
    await this.send("Input.insertText", { text });
  }
  async key(key, code = key) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  }
  async shot(file, clip) {
    const params = { format: "png", captureBeyondViewport: false };
    if (clip) params.clip = { ...clip, scale: 1 };
    const r = await this.send("Page.captureScreenshot", params);
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }
}

export async function launchChrome({ width = 1440, height = 900, dpr = 1 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "claura-chrome-"));
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
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      proc.kill("SIGKILL");
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  };
  process.on("exit", close);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = parseInt(readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")[0], 10);
    } catch {}
  }
  if (!port) {
    close();
    throw new Error("Chrome did not start");
  }
  return {
    dir,
    close,
    /** Open the first page target, size it, and optionally navigate. */
    async page(url) {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const t = targets.find((x) => x.type === "page");
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener("open", r, { once: true }));
      const p = new Page(ws);
      await p.send("Page.enable");
      await p.send("Runtime.enable");
      await p.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
      if (url) await p.goto(url);
      return p;
    },
  };
}

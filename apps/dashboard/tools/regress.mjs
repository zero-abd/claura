// Scripted-mode regression snapshot. Dumps the rendered DOM of every view at a grid of script times (nominal, breach,
// approval, isolating, contained, report) plus the approval / host sheets, so a change to the console can be proven not
// to touch the scripted film. Run it before and after a change and diff the two folders:
//
//   node tools/regress.mjs --port 4317 --out /tmp/before
//   ... change code ...
//   node tools/regress.mjs --port 4317 --out /tmp/after && diff -r /tmp/before /tmp/after
//
// Excluded on purpose (they change by design when a feature is added): the sidebar nav list and the isolation popover.
// The "integrations" view never calls reset() (the scripted source counts resets in its version, which shows up in data-k keys),
// so a run before and after that view existed makes the same number of calls.
// Views that exist only after the change have no "before" file, so `diff -r` lists them as "Only in".
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4317");
const OUT = resolve(opt("out", "regress-out"));
const BASE = `http://127.0.0.1:${PORT}/?demo=1`;

const SCEN = [
  { name: "nominal", reset: true },
  { name: "t0.4", t: 0.4, ap: null },
  { name: "t1.2", t: 1.2, ap: null },
  { name: "t2.6", t: 2.6, ap: null },
  { name: "t3.6", t: 3.6, ap: null },
  { name: "t4.8", t: 4.8, ap: null },
  { name: "t5.2", t: 5.2, ap: null },
  { name: "t6.8-approval", t: 6.8, ap: null },
  { name: "t7.6", t: 7.6, ap: 7.4 },
  { name: "t8.6", t: 8.6, ap: 7.4 },
  { name: "t9.5", t: 9.5, ap: 7.4 },
  { name: "t12", t: 12, ap: 7.4 },
  { name: "t12.8", t: 12.8, ap: 7.4 },
  { name: "t14", t: 14, ap: 7.4 },
  { name: "t14-jt", t: 14, ap: 7.4, who: "JT" },
  { name: "t6.8-jt", t: 6.8, ap: null, who: "JT" },
  { name: "report", t: 14, ap: 7.4, report: true },
  { name: "host-sheet", t: 3.6, ap: null, host: "b14-gpu-07" },
];

const dumpJS = (view) => `(() => {
  const q = (s) => document.querySelector(s);
  const html = (s) => (q(s) ? q(s).outerHTML : "(none)");
  const sideRest = ["#appRoot .brand", "#appRoot .fac", "#appRoot .side-foot"].map(html).join("\\n");
  const v = q("#v-${view}");
  const body = Object.entries(document.body.dataset).sort().map(([k, x]) => k + "=" + x).join(" ");
  return [
    "## title " + document.title,
    "## body " + body,
    "## toolbar\\n" + (q(".toolbar") ? q(".toolbar").innerHTML : ""),
    "## side\\n" + sideRest,
    "## view ${view}\\n" + (v ? v.innerHTML : "(none)"),
    "## sheet\\n" + html("#sheet"),
    "## hostSheet\\n" + html("#hostSheet"),
    "## personSheet\\n" + html("#personSheet"),
    "## scrim\\n" + html("#scrim"),
  ].join("\\n");
})()`;

const chrome = await launchChrome({ width: 1728, height: 1080 });
try {
  mkdirSync(OUT, { recursive: true });
  const page = await chrome.page(BASE);
  await page.until("window.claura && document.readyState === 'complete'", 20000, "console boot");
  await sleep(1500);
  const views = await page.eval("window.claura.views");
  let n = 0;
  for (const s of SCEN) {
    for (const view of views) {
      if (s.report && view !== "reports") continue;
      if (s.host && view !== "incident") continue;
      await page.eval(`(() => {
        const c = window.claura;
        c.closeHost && c.closeHost();
        ${s.who ? `c.as(${JSON.stringify(s.who)});` : "c.as('RK');"}
        ${s.reset ? (view === "integrations" ? "" : "c.reset();") : `c.seek(${s.t}, { approveAt: ${s.ap === null ? "null" : s.ap}${s.report ? ", report: true" : ""} });`}
        c.go(${JSON.stringify(view)});
        ${s.host ? `c.openHost(${JSON.stringify(s.host)});` : ""}
        return true;
      })()`);
      await sleep(260);
      let dump = await page.eval(dumpJS(view));
      if (s.reset) dump = dump.replace(/<div class="sig"[^>]*id="sigLines"[\s\S]*?<\/div><\/div>/, "(ambient lines elided)");
      dump = dump.replace(/(id="pTip"[^>]*scale\()[\d.]+/, "$1X"); // the tip pulses with real time
      writeFileSync(`${OUT}/${s.name}__${view}.txt`, dump);
      n++;
    }
  }
  await page.eval("window.claura.as('RK'); window.claura.reset(); true");
  const errs = page.logs.filter((l) => !/favicon|Download the React DevTools/.test(l));
  console.log(`wrote ${n} dumps to ${OUT}${errs.length ? `\nconsole: ${errs.slice(0, 5).join(" | ")}` : ""}`);
} finally {
  chrome.close();
}
process.exit(0);

// Replay-fallback proof (no backend, no network): how a person starts the scripted incident, the approval-sheet guards, the 3D
// pick and hover, and two small console fixes.
//
//   node tools/replay-proof.mjs [--port 4431] [--out dir]
//
// Each part runs in its own headless Chrome profile (hardware WebGL like a person's browser):
//   1. /?demo=1            sits on "All clear" (the film and the recorders depend on that), the dev dock is hidden;
//   2. /?demo=1&play=1     starts the incident at load, no click;
//   3. /?demo=1 + key P    starts it; the isolation popover's "Replay the incident" starts it; R replays it once it has finished;
//      a stray P / R mid-run, or typing r / p in the War Room composer, does nothing;
//   4. a click on "Approve quarantine" in the first moments after the sheet opens does NOT approve; a click later does;
//   5. 3D: while an incident is open the hover ring and the click both land on the incident host from anywhere on its rack;
//   6. the War Room composer is empty after Send; a 23-character access.sh code still gets a QR.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt("port", "4431");
const OUT = resolve(opt("out", "replay-proof-out"));
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const sub = (p) => p.eval("document.querySelector('#tbSub').textContent");

const chromes = [];
const open = async (url) => {
  const c = await launchChrome({ width: 1440, height: 900 });
  chromes.push(c);
  const p = await c.page(url);
  await p.until("window.claura && document.readyState === 'complete'", 20000, "console boot");
  await sleep(1200);
  return p;
};
const key = async (p, k, code = k) => {
  await p.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k.length === 1 ? k : undefined });
  await p.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};

try {
  // ---------------------------------------------------------------- 1, 3, 4: start controls and the approval sheet
  {
    const p = await open(`${BASE}?demo=1`);
    const t = await sub(p);
    const dock = await p.eval("getComputedStyle(document.getElementById('devdock')).display");
    await sleep(2500);
    const t2 = await sub(p);
    check("?demo=1 alone stays on 'All clear' (recorders rely on it)", t === "All clear" && t2 === "All clear", `${t} / ${t2}`);
    check("the dev dock is hidden with ?demo=1", dock === "none", `display=${dock}`);
    // a key typed while the Secure Shell overlay is open (its terminal is not an input element) must never start the replay
    await p.eval("(() => { const d = document.createElement('div'); d.className = 'cs-root'; d.id = 'fakeShell'; document.body.appendChild(d); return true; })()");
    await key(p, "p");
    await key(p, "r", "KeyR");
    await sleep(400);
    check("P / R do nothing while the Secure Shell overlay is on screen", (await sub(p)) === "All clear");
    await p.eval("document.getElementById('fakeShell').remove(), true");
    await key(p, "p");
    await p.until("document.querySelector('#tbSub').textContent === 'Breach in progress'", 6000, "P starts the replay");
    check("key P starts the incident from the first signal", true);
    await sleep(800);
    const t1 = await p.eval("claura.time");
    await key(p, "p");
    await key(p, "r", "KeyR");
    await sleep(400);
    const t3 = await p.eval("claura.time");
    check("a stray P / R mid-run does not restart it", t3 > t1 && (await sub(p)) === "Breach in progress", `script clock ${t1.toFixed(1)} -> ${t3.toFixed(1)} s`);
    await p.until("document.getElementById('sheet').dataset.open === '1'", 20000, "approval sheet opens");
    const r = await p.eval("(() => { const b = document.getElementById('approveBtn').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()");
    await p.click(r.x, r.y); // mouse move + 120 ms + press: the first moments after the sheet opened
    await sleep(350);
    const s1 = await p.eval("document.getElementById('sheet').dataset.s");
    check("replay: a click on Approve in the first moments does NOT approve", s1 === "request", `sheet state=${s1}`);
    await sleep(900);
    await p.shot(`${OUT}/replay-approval-sheet.png`);
    await p.clickSel("#approveBtn");
    await p.until("document.getElementById('sheet').dataset.s === 'approved'", 6000, "approve after the pause");
    check("replay: a click after the pause approves", true);
    await p.until("document.querySelector('#tbSub').textContent === 'Contained'", 20000, "contained");
    await sleep(3500);
    await p.shot(`${OUT}/replay-contained.png`);
    await key(p, "r", "KeyR");
    await p.until("document.querySelector('#tbSub').textContent === 'Breach in progress'", 6000, "R replays");
    check("key R plays it again once the incident has finished", true);
  }

  // ---------------------------------------------------------------- 2: autoplay at load
  {
    const p = await open(`${BASE}?demo=1&play=1`);
    await sleep(1500);
    const t = await sub(p);
    check("?demo=1&play=1 starts the incident at load, no click", t === "Breach in progress", t);
    await p.shot(`${OUT}/replay-play1.png`);
  }

  // ---------------------------------------------------------------- 3b: the isolation popover control
  {
    const p = await open(`${BASE}?demo=1`);
    await p.clickSel("#isoBtn");
    await sleep(700);
    const vis = await p.eval("(() => { const b = document.getElementById('isoReplay'); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), text: b.textContent.trim(), inert: document.getElementById('isoPop').inert }; })()");
    check("the isolation popover offers 'Replay the incident'", vis.w > 100 && /Replay the incident/.test(vis.text) && !vis.inert, JSON.stringify(vis));
    await p.shot(`${OUT}/replay-popover.png`);
    await p.clickSel("#isoReplay");
    await p.until("document.querySelector('#tbSub').textContent === 'Breach in progress'", 6000, "popover control starts the replay");
    const open2 = await p.eval("document.getElementById('isoPop').dataset.open");
    check("the popover control starts the incident and closes the popover", open2 === "0", `popover.open=${open2}`);
  }

  // ---------------------------------------------------------------- 3c + 6: composer
  {
    const p = await open(`${BASE}?demo=1&view=warroom`);
    await p.clickSel("#wrInput");
    await p.type("rp");
    await key(p, "r", "KeyR");
    await sleep(400);
    check("typing r / p in the War Room composer does not start the replay", (await sub(p)) !== "Breach in progress", await sub(p));
    await p.eval("claura.reset(), true");
    await p.clickSel("#wrInput");
    await p.eval("document.getElementById('wrInput').value = ''");
    await p.type("Counsel here. Preserve the memory image.");
    await p.clickSel("#wrForm .send");
    await sleep(500);
    const v = await p.eval("document.getElementById('wrInput').value");
    check("War Room (replay): the composer is empty after Send", v === "", JSON.stringify(v));
    // the encoder is imported from source, so this one check needs the dev server (a production build has no /src)
    const qr = await p.eval(`(async () => {
      try {
        const m = await import('/src/data/qr.ts');
        const code = 'ABCDEFGHJKMNPQRSTUVWXYZ'.slice(0, 23);
        const mx = m.qrMatrix('claura://join/' + code);
        return { ok: true, size: mx.length };
      } catch (e) { return { ok: false, err: String(e) }; }
    })()`);
    if (qr.ok || !/dynamically imported module/.test(qr.err ?? "")) check("a 23-character access.sh code still gets a QR (no throw)", qr.ok === true, JSON.stringify(qr));
    else console.log("SKIP  QR check (needs the dev server: no /src in a production build)");
  }

  // ---------------------------------------------------------------- 5: 3D hover ring and click map to the incident host
  {
    const p = await open(`${BASE}?demo=1&view=overview`);
    const mounted = await p.until("claura.stage === 'mounted'", 20000, "3D stage mounted").catch(() => false);
    if (!mounted) check("3D stage mounted (WebGL)", false);
    else {
      await p.eval("claura.seek(4.4, { approveAt: null }), true");
      await sleep(2600); // the camera flies for 1.9 s: picks and hovers are meaningful only after it
      const sweep = await p.eval(`(() => {
        const cv = document.querySelector('#facility3d canvas:not(.f3d-fallback)') || document.querySelector('#facility3d canvas');
        const r = cv.getBoundingClientRect();
        const out = { onHost: 0, mapped: 0, bad: [], first: null };
        for (let y = r.top + 4; y < r.bottom - 4; y += 5)
          for (let x = r.left + 4; x < r.right - 4; x += 5) {
            cv.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
            if (cv.style.cursor === 'pointer') out.onHost++;
            const ring = claura.hoverRing();
            if (ring) {
              out.mapped++;
              if (ring !== 'b14-gpu-07') out.bad.push(ring);
              if (!out.first) out.first = [Math.round(x), Math.round(y)];
            }
          }
        cv.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerId: 1 }));
        return out;
      })()`);
      check("3D hover: every point of rack 14 outlines the incident host b14-gpu-07", sweep.mapped > 20 && sweep.bad.length === 0, `${sweep.mapped} points on rack 14 of ${sweep.onHost} on any host; wrong ring: ${sweep.bad.length}`);
      if (sweep.first) {
        await p.click(sweep.first[0], sweep.first[1]); // a real click on a rack-14 slot that is not the incident host
        await p.until("document.getElementById('hostSheet').dataset.open === '1'", 5000, "host sheet");
        const title = await p.eval("document.getElementById('hostTitle').textContent");
        check("3D click: a click anywhere on rack 14 opens b14-gpu-07", title === "b14-gpu-07", title);
        await p.shot(`${OUT}/replay-host-sheet.png`);
      }
    }
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
} catch (e) {
  console.log("PROOF ERROR:", e.stack || e.message);
  process.exitCode = 1;
} finally {
  for (const c of chromes) c.close();
}
process.exit(process.exitCode ?? (results.every((r) => r.ok) ? 0 : 1));

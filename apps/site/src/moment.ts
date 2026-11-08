/* The 9.4 s moment: a playhead runs across the timeline strip, the number counts up,
   and only at the end does everything turn the "contained" green. */

const END = 9.4; // seconds of demo time
const RUN_MS = 5200; // wall-clock length of the replay

export function initMoment(reduced: boolean): void {
  const root = document.querySelector<HTMLElement>("[data-moment]");
  if (!root) return;

  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const scale = root.querySelector<HTMLElement>(".scale")!;
  const marks = [...root.querySelectorAll<HTMLElement>(".pip, .steps li")];
  const replay = root.querySelector<HTMLButtonElement>("[data-replay]");
  const target = root.querySelector<HTMLElement>(".bignum")!;

  let raf = 0;

  const setNow = (t: number) => {
    scale.style.setProperty("--now", t.toFixed(3));
    count.textContent = t.toFixed(1);
    for (const m of marks) m.classList.toggle("on", t >= Number(m.dataset.t) - 1e-6);
  };

  const finish = () => {
    root.classList.remove("running");
    root.classList.add("contained");
    status.textContent = "Contained";
    setNow(END);
  };

  const play = () => {
    cancelAnimationFrame(raf);
    if (reduced) {
      finish();
      return;
    }
    root.classList.remove("contained");
    root.classList.add("running");
    status.textContent = "Containing";
    setNow(0);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(END, ((now - t0) / RUN_MS) * END);
      setNow(t);
      if (t < END) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
  };

  if (reduced) {
    finish();
  } else {
    // wait at zero until the number is on screen, then run once
    root.classList.add("running");
    status.textContent = "Containing";
    setNow(0);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.55 },
    );
    io.observe(target);
  }

  replay?.addEventListener("click", play);
}

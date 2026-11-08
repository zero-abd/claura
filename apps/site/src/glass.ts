/* Liquid Glass specular: a soft highlight that follows the pointer across glass surfaces. */

export function initGlass(): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  let target: HTMLElement | null = null;
  let x = 0;
  let y = 0;
  let queued = false;

  const paint = () => {
    queued = false;
    if (!target) return;
    const r = target.getBoundingClientRect();
    target.style.setProperty("--mx", `${(x - r.left).toFixed(0)}px`);
    target.style.setProperty("--my", `${(y - r.top).toFixed(0)}px`);
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(".glass");
      if (!el) return;
      target = el;
      x = e.clientX;
      y = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    },
    { passive: true },
  );
}

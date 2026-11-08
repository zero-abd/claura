/* In-page links glide, unless the person prefers reduced motion. (Done in JS, not CSS, so a page
   opened on a #hash lands instantly instead of animating from the top.) */
export function initAnchors(reduced: boolean): void {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const id = decodeURIComponent(a.hash.slice(1));
    const target = id ? document.getElementById(id) : document.body;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", a.hash || location.pathname);
  });
}

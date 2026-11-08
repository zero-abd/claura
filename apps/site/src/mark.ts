/* The brand mark is a single file (public/brand/logo.svg). The hero tile inlines it so it can
   animate the seal. The mark is being redesigned, so nothing here assumes its shape:
   - if the SVG has an element with id "seal", that element slides closed and turns the
     "contained" green;
   - otherwise (or if the file cannot be inlined) the whole mark simply fades in. */

const SIGNAL = "#FF5A1F";
const CONTAINED = "#2FBF71";

export async function initMark(reduced: boolean): Promise<void> {
  const tile = document.querySelector<HTMLElement>("[data-mark]");
  const img = tile?.querySelector<HTMLImageElement>("[data-mark-img]");
  if (!tile || !img) return;

  let mark: Element = img;
  let seal: SVGElement | null = null;

  try {
    const res = await fetch(img.getAttribute("src") ?? "");
    if (!res.ok) throw new Error("logo not found");
    const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("not svg");

    svg.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
    svg.querySelectorAll("*").forEach((n) => {
      for (const a of [...n.attributes]) if (a.name.startsWith("on")) n.removeAttribute(a.name);
    });
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const inline = document.importNode(svg, true) as unknown as SVGSVGElement;
    img.replaceWith(inline);
    mark = inline;
    seal = inline.querySelector<SVGElement>("#seal");
  } catch {
    // keep the <img>; fade fallback below
  }

  const play = () => {
    if (reduced) return;
    tile.classList.remove("sealed");
    if (seal) {
      seal.style.transformBox = "fill-box";
      seal.style.transformOrigin = "center";
      const run = seal.animate(
        [
          { opacity: 0, transform: "translateX(24%) scale(0.9)", fill: SIGNAL },
          { opacity: 1, transform: "translateX(0) scale(1)", fill: SIGNAL, offset: 0.5 },
          { opacity: 1, transform: "none", fill: CONTAINED },
        ],
        { duration: 1500, delay: 450, easing: "cubic-bezier(0.3, 0.9, 0.3, 1)", fill: "both" },
      );
      run.finished.then(() => tile.classList.add("sealed")).catch(() => undefined);
    } else {
      mark.animate([{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "none" }], {
        duration: 700,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  };

  play();
  tile.addEventListener("click", play);
}

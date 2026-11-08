# Claura · Mono theme (black · grey · red)

A colour-and-material re-skin of the console. Layout, components, spacing, type, motion and the Liquid Glass recipe are
unchanged; only colour and material changed. Ported from the approved reference copy (`/tmp/claura-mono`, screenshots in
`~/Downloads/Claura/ui-mono/`) into this console and into the Secure Shell UI (`claura/ssh`).

## Palette, by meaning

| Role | Value | Used for |
| --- | --- | --- |
| Ground | `#050506` to `#111113`, soft white radial lights | wallpaper (no purple, blue or teal) |
| Glass | white 2 to 7 % over `rgba(20,20,22,.4)`, blur 30 px, saturate 1.15, white 14 % top edge, hairline | panels, toolbar, sidebar, sheets |
| Text | `#F5F5F7` / `#A1A1A6` / `#6E6E73` | everywhere |
| Red | `#FF3B30` (pressed `#D70015`) | breach, critical, locked, Approve quarantine, nav count badge, the brand C and orb |
| Orange | `#FF9F0A` (accessed `#FFB85C`) | needs approval, exfil suspected, accessed, Admin |
| Green | `#30D158` | small marks only: sealed orb, checks, verified glyphs, online dots, switches, the 3D seal |
| Was blue / purple / teal / pink | grey or white | selected nav, avatars, links, focus rings, primary buttons (white) |

## What changed (this console)

| File | Change |
| --- | --- |
| `src/theme-mono.css` | new override, imported after `style.css` in `src/main.ts`; all inside `@media screen`, so the print (paper) theme is untouched |
| `src/style.css` | literal colours rewritten by `tools/mono-remap.mjs` (163 occurrences, 95 distinct), nothing else |
| `src/map.ts`, `src/data/format.ts`, `src/views/overview.ts` | 2D fallback map colours, graphite avatar gradients, the legend dot |
| `src/shell.ts` | favicon orb: red, green once sealed |
| `src/logo.ts` | comment only (brand rule names the new colours) |
| `public/logo.svg`, `public/favicon.svg`, `public/favicon-32.png` | the C and the orb are `#FF3B30` (was `#FF5A1F`) |
| `public/bulkhead-3d/facility.js` | re-tinted by `tools/mono-3d.mjs`: grey racks, red breach glow, green seal |
| `index.html` | `theme-color` `#050506` |

Secure Shell (`claura/ssh`): `ui.js` and the `dev.mjs` demo page were run through the same `tools/mono-remap.mjs`, plus the
two `--accent-rgb` / `--safe-rgb` fallback triplets in `ui.js` (raw `r,g,b` values the remap does not match).

## Re-running (idempotent, value-level, safe after other edits)

```
node tools/mono-remap.mjs src/style.css                 # and: ../claura/ssh/ui.js ../claura/ssh/dev.mjs
node tools/mono-3d.mjs public/bulkhead-3d/facility.js   # re-tint after the 3D module is rebuilt; `-- ... (0)` means a pattern moved
```

If the 3D module is rebuilt and a patch pattern stops matching, the log shows it. Do not copy a themed `facility.js` over a
newer build: the real module was rebuilt after the reference was made (different minified names), so always re-tint.

## Deliberate differences from the reference copy

- **Brand mark.** The reference used a grey C. Here the Cradle C and orb are brand red; the orb turns green once sealed
  (`.mark` block in `theme-mono.css`). The C colour is one variable: `--mark-c: #e5e5ea` gives the grey-C variant. For the 3D
  ring around the sealed rack, `node tools/mono-3d.mjs ... --grey-ring` applies the reference's grey ring (default: red).
- **All-clear orb and favicon** are red (brand), not grey.
- Inside the state pill the whole mark still takes the pill's colour (red in a breach, green once sealed), as in the reference.

## Verification

`npm run build` passes. `tools/regress.mjs` (162 DOM dumps before and after) differs only in colour: the logo fill, six avatar
gradients and the legend dot. `tools/replay-proof.mjs` 15 of 15 (QR check skipped on a production build). A pixel audit over
all 28 `shots/*.png` (the old design measured 66 to 80 % cool-hued pixels) finds no blue, purple or teal; the only pink-band
pixels (0.1 to 0.3 %, two breach shots) are red breach light falling on grey 3D surfaces. The old-orange hue band stays under
0.02 % of any frame (anti-aliased red and orange edges) and green under 0.6 %.
Not covered: `public/app-icon.svg` (orange, unused by the UI; the brand folder owns the app icon) and the `shots/live-*` images,
which need the live stack to regenerate.

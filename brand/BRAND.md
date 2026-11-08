# Claura brand (single source of truth)

- Name: **Claura** (was "Bulkhead"; rename everything). Domain: **claura.tech**. Tagline: "Seal the breach before it spreads."
- Agents keep their names: Sentry, Triage, Warden, Scribe. The product metaphor (sealing a breach like a ship's bulkhead) can stay in copy.
- Colours
  - Signal orange `#FF5A1F`: the brand colour and the breach. Primary accent.
  - Sealed green `#2FBF71`: only for the sealed/contained state. Never a brand colour.
  - Ink `#0B0C0E` and white `#FFFFFF`.

## The mark: Cradle

A C-shaped aura holding a contained breach in a concentric socket. The mouth of the C (85.4 units) is narrower than the orb (96 units), so the breach is held and cannot slip out. Three readings in one gesture: the letter C, an aura wrapped around the fleet, and a breach that is contained. It is two paths, built only from circles, and it stays a clear "C and a dot" at 16 px and in one colour.

### Files

| File | Use |
| --- | --- |
| `logo.svg` | The mark only, 256 box, two paths: `#ring` (the C) and `#seal` (the orb). Colour. |
| `logo-mono.svg` | Same two paths in `currentColor`. Use ink on light, white on dark. |
| `lockup.svg` | Mark and wordmark for light backgrounds (ink wordmark). Tight viewBox, wordmark outlined. |
| `lockup-dark.svg` | Same for dark backgrounds (white wordmark). |
| `app-icon.svg`, `app-icon-1024.png` | macOS-style squircle app icon (824 pt body on a 1024 canvas, transparent margin) with Liquid Glass layering. |
| `favicon.svg`, `favicon-32.png` | Mark cropped square, no padding, for tabs. |
| `concepts/` | The nine concepts with a one-line rationale in each SVG's `<desc>`, a `-mono.svg` for each, and `concepts.json` with the 16 px check. |
| `contact-sheet.html`, `contact-sheet.png` | All nine concepts compared at every size. |
| `recommendation.png` | The shortlist, the chosen mark in the app icon, and a mock product header. |
| `tools/` | Generators (see Rebuilding). |

### Exact path data (`logo.svg`, viewBox `0 0 256 256`)

```
ring  M231.95 73.95A111 111 0 1 0 231.95 182.05A7.64 7.64 0 0 0 219.1 173.85A78 78 0 1 1 219.1 82.15A7.64 7.64 0 0 0 231.95 73.95Z
seal  M108 128a48 48 0 1 0 96 0a48 48 0 1 0-96 0z
```

### Construction

- Socket: circle, centre (156, 128), radius 78. This is the inner edge of the C.
- Outer edge: one circle, radius 111, centre (135, 128), so the C is 46 thick at the back and thins towards the mouth.
- Tips: round caps of radius 7.64, each tangent to both circles, at +/-36 degrees from the socket centre. There are no corners anywhere.
- Orb: circle, radius 48, concentric with the socket (156, 128). The gap between orb and C is 30.
- The mark's bounding box (x 24 to 233, y 17 to 239) is centred in the 256 box, so it sits optically centred without offsets.

### Sealed state (UI)

`#seal` is the orb. Tint only the orb green when the incident is contained; the C stays orange.

```css
#seal { fill: #FF5A1F; transition: fill .35s ease-out; }
.contained #seal { fill: #2FBF71; }
@media (prefers-reduced-motion: reduce) { #seal { transition: none; } }
```

Inline the SVG (or use `<use>`) so the id is reachable from CSS; an `<img>` cannot be styled. The mono mark keeps both ids, so `currentColor` still works with a tinted seal.

### Wordmark

- Logo files use "Claura" outlined from **Inter SemiBold** (SIL Open Font License) at tracking -0.025em. It is a near twin of SF Pro Display 600 and, unlike SF, may be converted to outlines in a logo.
- Cap height is 46% of the mark height; the gap between mark and wordmark is 26% of the mark height.
- In running UI text (not in the logo) the name may be set in `-apple-system` / SF Pro Display 600 with -0.02em tracking.

### Clear space and size

- Clear space: the orb's radius (48 of 256 units, about 22% of the mark height) on every side of the mark or the lockup. Nothing enters it.
- Minimum size: mark 16 px (checked as a 1x raster on the contact sheet); lockup 24 px tall, about 73 px wide. Below 24 px tall use the mark alone.
- App icon: only ever shown as the full squircle. Do not crop it.

### Usage rules

Do
- Use the colour mark on white, ink, or the deep glass backgrounds of the product.
- Use `logo-mono.svg` (ink or white) on photos, on orange, and anywhere only one colour is available.
- Keep the orb concentric with the C. Keep the C and the orb in the same orange unless the state is sealed.

Do not
- Colour the C green, or the orb anything but orange or sealed green.
- Add shadows, glows, gradients, outlines, or glass effects to the logo. The app icon is the one place the glass treatment lives.
- Rotate, skew, stretch, or mirror it. Do not close the mouth of the C or move the orb off-centre.
- Put the orange mark on red, green or saturated pink, or on orange. Switch to mono.
- Retype the wordmark. Use the outlined paths in `lockup*.svg`.

## Why Cradle (concept notes)

Nine concepts survived round one; Cradle, Glass C and Bulkhead Doors were refined into the shortlist (`recommendation.png`).

| Concept | File | Verdict |
| --- | --- | --- |
| Cradle | `concepts/05-cradle.svg` | Recommended: the cleanest silhouette, letter plus metaphor plus state, two paths, strong in one colour. |
| Glass C | `concepts/02-glass-c.svg` | Runner-up: the most native to Liquid Glass (solid front pane, faint panes behind). Safest read as a C, least ownable. Its mono is a C with detached echo segments. |
| Bulkhead Doors | `concepts/04-split-doors.svg` | Runner-up: the most literal to the product. Strong silhouette, but it drifts from the name and the C, and the bolt is weak in mono. |
| Eclipse, Staggered Aura, Closing Spiral, Keyhole Halo, Enso Pearl, Closing a | `concepts/` | Explored. Staggered Aura and Closing Spiral fail at 16 px, Keyhole Halo reads as a generic lock, Closing a reads as "CI", Enso Pearl can echo a crescent and star, and Eclipse reads as an eye. |

Dropped after round one: Sentinel eye (generic icon), Halo Orb (reads as Saturn), Halo Lock (padlock clip-art), Four Hands (lifebuoy), Nest (heavy blob), Ripple Wall (reads as the letters OI), Three Fields (muddy, fails at 16 px).

## Rebuilding

The generators live in `tools/` and write every file above.

```
cd tools && npm install
node build-concepts.mjs          # concepts/*.svg + concepts.json
ICON=ink node build-final.mjs    # logo, mono, lockups, favicon, app-icon.svg
TOP3=cradle,glass-c,split-doors REC=cradle node sheet.mjs   # contact-sheet.html
node wordmark.mjs                # re-outline the wordmark (needs @fontsource/inter)
node recommendation.mjs          # tools/recommendation.html
./shot.sh <html> <png> <w> <h> [scale] [transparent]   # headless Chrome render
```

`app-icon-1024.png`, `favicon-32.png`, `contact-sheet.png` and `recommendation.png` are headless Chrome screenshots of the HTML or SVG (see `tools/shot.sh`); the 1024 icon and the favicon are rendered with a transparent background.

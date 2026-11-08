// Final assets for the recommended concept (Cradle).
import fs from 'node:fs';
import paper from 'paper-jsdom';
import * as g from './geo.mjs';
import { CRADLE } from './concepts.mjs';
import { WM } from './lockup.mjs';

const OUT = '/Users/abd/repos/claura-brand';
const k = g.cradleC(CRADLE);
const RING = k.d;
const ORB = (() => { const { cx, cy, orb } = CRADLE; return `M${cx - orb} ${cy}a${orb} ${orb} 0 1 0 ${2 * orb} 0a${orb} ${orb} 0 1 0-${2 * orb} 0z`; })();
const bounds = g.P(RING).bounds; // mark bbox
export const MARK = { RING, ORB, bounds };
const O = '#FF5A1F', INK = '#0B0C0E';

// ---- logo.svg / logo-mono.svg
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>Claura</title>
  <!-- Cradle: a C-shaped aura (id="aura") holding the contained breach (id="seal"). Tint #seal to #2FBF71 when sealed. -->
  <path id="aura" fill="${O}" d="${RING}"/>
  <path id="seal" fill="${O}" d="${ORB}"/>
</svg>
`;
fs.writeFileSync(`${OUT}/logo.svg`, logo);
fs.writeFileSync(`${OUT}/logo-mono.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>Claura (one colour)</title>
  <path id="aura" fill="currentColor" d="${RING}"/>
  <path id="seal" fill="currentColor" d="${ORB}"/>
</svg>
`);

// ---- lockups (tight crop). Wordmark: Inter SemiBold (OFL) outlined, tracking -0.025em.
const H = bounds.height, y0 = bounds.y, x0 = bounds.x;
const capH = H * 0.46, sc = capH / WM.capH, gap = H * 0.26;
const wx = bounds.x + bounds.width + gap, base = 128 + capH / 2;
const W = +(wx + WM.width * sc - x0).toFixed(1);
const wm = (fill) => `<path fill="${fill}" transform="translate(${wx.toFixed(2)} ${base.toFixed(2)}) scale(${sc.toFixed(4)})" d="${WM.d}"/>`;
const lock = (fill, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${W} ${H.toFixed(1)}" width="${Math.round(W / H * 64)}" height="64">
  <title>${title}</title>
  <path id="aura" fill="${O}" d="${RING}"/>
  <path id="seal" fill="${O}" d="${ORB}"/>
  ${wm(fill)}
</svg>
`;
fs.writeFileSync(`${OUT}/lockup.svg`, lock(INK, 'Claura'));
fs.writeFileSync(`${OUT}/lockup-dark.svg`, lock('#FFFFFF', 'Claura'));

// ---- favicon (tight square crop of the mark)
const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2, half = H / 2 + 1;
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(cx - half).toFixed(1)} ${(cy - half).toFixed(1)} ${(2 * half).toFixed(1)} ${(2 * half).toFixed(1)}" width="32" height="32">
  <title>Claura</title>
  <path fill="${O}" d="${RING}"/>
  <path fill="${O}" d="${ORB}"/>
</svg>
`;
fs.writeFileSync(`${OUT}/favicon.svg`, fav);

// ---- app icon: macOS squircle (824 body on a 1024 canvas), Liquid Glass layering
function squircle(cx0, cy0, half, n = 5) {
  const pts = [];
  const N = 180;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([cx0 + half * Math.sign(c) * Math.abs(c) ** (2 / n), cy0 + half * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  const p = new paper.Path({ segments: pts, closed: true });
  p.simplify(0.08);
  return g.D(p, 1);
}
const BODY = squircle(512, 512, 412);
const mc = [cx, cy];
const gl = `translate(512 520) scale(2.0) translate(${-mc[0].toFixed(2)} ${-mc[1].toFixed(2)})`;
const ox = CRADLE.cx, oy = CRADLE.cy, orr = CRADLE.orb;

function icon(variant) {
  const dark = variant === 'ink';
  const bgStops = dark
    ? `<stop offset="0" stop-color="#262C54"/><stop offset=".55" stop-color="#12142A"/><stop offset="1" stop-color="#0B0C0E"/>`
    : `<stop offset="0" stop-color="#FF9461"/><stop offset=".5" stop-color="#FF5A1F"/><stop offset="1" stop-color="#D93A05"/>`;
  const glyphFill = dark
    ? `<stop offset="0" stop-color="#FF8A57"/><stop offset=".6" stop-color="#FF5A1F"/><stop offset="1" stop-color="#E8470F"/>`
    : `<stop offset="0" stop-color="#FFFFFF" stop-opacity=".97"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".74"/>`;
  const glyphAlpha = dark ? 0.96 : 1;
  const shadowCol = dark ? '#000000' : '#7A1700';
  const shadowOp = dark ? 0.55 : 0.42;
  const core = dark
    ? `<radialGradient id="orbf" gradientUnits="userSpaceOnUse" cx="${ox - 14}" cy="${oy - 18}" r="${orr * 1.25}"><stop offset="0" stop-color="#FFD2B8"/><stop offset=".35" stop-color="#FF7A45"/><stop offset="1" stop-color="#E8470F"/></radialGradient>`
    : `<radialGradient id="orbf" gradientUnits="userSpaceOnUse" cx="${ox - 12}" cy="${oy - 16}" r="${orr * 1.3}"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity=".92"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".62"/></radialGradient>`;
  const emberCore = dark ? '' : `<circle cx="${ox + 2}" cy="${oy + 6}" r="${orr * 0.5}" fill="#FF5A1F" opacity=".9" filter="url(#blurS)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Claura app icon</title>
  <defs>
    <path id="body" d="${BODY}"/>
    <clipPath id="clipBody"><use href="#body"/></clipPath>
    <path id="ring" d="${RING}"/>
    <path id="orb" d="${ORB}"/>
    <clipPath id="clipGlyph"><use href="#ring"/><use href="#orb"/></clipPath>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="170" y1="100" x2="860" y2="930">${bgStops}</linearGradient>
    <radialGradient id="bloom" gradientUnits="userSpaceOnUse" cx="330" cy="215" r="600"><stop offset="0" stop-color="#FFFFFF" stop-opacity="${dark ? 0.16 : 0.5}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="shade" gradientUnits="userSpaceOnUse" cx="790" cy="930" r="560"><stop offset="0" stop-color="${dark ? '#FF5A1F' : '#7A1700'}" stop-opacity="${dark ? 0.38 : 0.5}"/><stop offset="1" stop-color="${dark ? '#FF5A1F' : '#7A1700'}" stop-opacity="0"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".9"/><stop offset=".35" stop-color="#FFFFFF" stop-opacity=".12"/><stop offset=".7" stop-color="#FFFFFF" stop-opacity=".04"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".35"/></linearGradient>
    <linearGradient id="pane" gradientUnits="userSpaceOnUse" x1="300" y1="190" x2="740" y2="840"><stop offset="0" stop-color="#FFFFFF" stop-opacity="${dark ? 0.16 : 0.34}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="${dark ? 0.03 : 0.07}"/></linearGradient>
    <linearGradient id="paneEdge" gradientUnits="userSpaceOnUse" x1="260" y1="170" x2="780" y2="860"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".85"/><stop offset=".4" stop-color="#FFFFFF" stop-opacity=".1"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".3"/></linearGradient>
    <linearGradient id="glyphf" gradientUnits="userSpaceOnUse" x1="40" y1="20" x2="220" y2="240">${glyphFill}</linearGradient>
    <linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="40" y1="17" x2="220" y2="239"><stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".25"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".7"/></linearGradient>
    ${core}
    <filter id="blurXL" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>
    <filter id="blurM" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="blurS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>

  <!-- ground shadow of the icon body -->
  <use href="#body" fill="#000" opacity=".34" filter="url(#blurXL)" transform="translate(0 26)"/>

  <g clip-path="url(#clipBody)">
    <use href="#body" fill="url(#bg)"/>
    <use href="#body" fill="url(#bloom)"/>
    <use href="#body" fill="url(#shade)"/>

    <!-- frosted glass layer: the aura field behind the mark -->
    <circle cx="512" cy="522" r="318" fill="#000" opacity="${dark ? 0.35 : 0.16}" filter="url(#blurXL)" transform="translate(0 20)"/>
    <circle cx="512" cy="522" r="318" fill="url(#pane)"/>
    <circle cx="512" cy="522" r="317" fill="none" stroke="url(#paneEdge)" stroke-width="3"/>
    <circle cx="512" cy="522" r="300" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="2"/>

    <!-- mark: depth shadow, glass body, inner light, specular edge -->
    <g transform="${gl}">
      <g transform="translate(0 7)" opacity="${shadowOp}" filter="url(#blurM)" fill="${shadowCol}"><use href="#ring"/><use href="#orb"/></g>
      <use href="#ring" fill="url(#glyphf)" fill-opacity="${glyphAlpha}"/>
      <use href="#orb" fill="url(#orbf)"/>
      ${emberCore}
      <g clip-path="url(#clipGlyph)">
        <g fill="none" stroke="#FFFFFF" stroke-width="9" opacity="${dark ? 0.5 : 0.85}" filter="url(#blurS)"><use href="#ring"/><use href="#orb"/></g>
        <use href="#ring" fill="none" stroke="#FFFFFF" stroke-opacity=".0" stroke-width="1"/>
      </g>
      <use href="#ring" fill="none" stroke="url(#edge)" stroke-width="1.4" opacity=".95"/>
      <use href="#orb" fill="none" stroke="url(#edge)" stroke-width="1.4" opacity=".95"/>
      <ellipse cx="${ox - 14}" cy="${oy - 26}" rx="${orr * 0.5}" ry="${orr * 0.24}" fill="#FFFFFF" opacity="${dark ? 0.55 : 0.0}" transform="rotate(-24 ${ox - 14} ${oy - 26})" filter="url(#blurS)"/>
    </g>

    <!-- specular rim of the whole icon (inner half of the stroke only) -->
    <use href="#body" fill="none" stroke="url(#rim)" stroke-width="7"/>
    <use href="#body" fill="url(#bloom)" opacity=".0"/>
  </g>
</svg>
`;
}
fs.writeFileSync(`${OUT}/app-icon.svg`, icon(process.env.ICON || 'orange'));
fs.writeFileSync(`${OUT}/tools/app-icon-orange.svg`, icon('orange'));
fs.writeFileSync(`${OUT}/tools/app-icon-ink.svg`, icon('ink'));
console.log('final assets written; ring', RING.length, 'chars; W', W);

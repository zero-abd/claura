// Shared lockup geometry. Mark (256 box) + outlined Inter SemiBold wordmark.
import fs from 'node:fs';
import { COLORS } from './geo.mjs';
export const WM = JSON.parse(fs.readFileSync(new URL('./wordmark.json', import.meta.url)));
export const LOCK = { gap: 30, capH: 104 };       // gap after the 256 box; cap height of wordmark in mark units
export const lockScale = LOCK.capH / WM.capH;
export const lockW = Math.round(256 + LOCK.gap + WM.width * lockScale);
export const lockBaseline = 128 + LOCK.capH / 2;

export function markPaths(layers, { mono = false, tint = null } = {}) {
  return layers.map((l) => {
    const fill = mono ? 'currentColor' : (tint && l.id === 'seal' ? tint : COLORS[l.fill] || l.fill);
    const attrs = [l.id ? `id="${l.id}"` : '', `fill="${fill}"`, l.opacity && !mono ? `fill-opacity="${l.opacity}"` : ''].filter(Boolean).join(' ');
    return `<path ${attrs} d="${l.d}"/>`;
  }).join('');
}
export function wordmarkPath(fill) {
  return `<path fill="${fill}" transform="translate(${256 + LOCK.gap} ${lockBaseline.toFixed(2)}) scale(${lockScale.toFixed(4)})" d="${WM.d}"/>`;
}
export function lockupSvg(layers, { mono = false, dark = false, height = 48, cls = '' } = {}) {
  const wm = dark ? '#FFFFFF' : COLORS.INK;
  const w = Math.round((lockW / 256) * height);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lockW} 256" width="${w}" height="${height}" class="${cls}" style="color:${wm}">${markPaths(layers, { mono })}${wordmarkPath(wm)}</svg>`;
}

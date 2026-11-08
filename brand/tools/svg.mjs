// Serialise layers to standalone SVG strings.
import { COLORS } from './geo.mjs';

export function layersToSvg(layers, { mono = false, title = '', size = 256, extra = '', cls = '' } = {}) {
  const body = layers.map((l) => {
    const fill = mono ? 'currentColor' : COLORS[l.fill] || l.fill;
    const attrs = [l.id ? `id="${l.id}"` : '', `fill="${fill}"`, l.opacity && !mono ? `fill-opacity="${l.opacity}"` : '', l.rule ? `fill-rule="${l.rule}"` : '']
      .filter(Boolean).join(' ');
    return `<path ${attrs} d="${l.d}"/>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}"${cls ? ` class="${cls}"` : ''}${extra}>${title ? `\n  <title>${title}</title>` : ''}\n  ${body}\n</svg>\n`;
}

// speechify(): turn console text into something a TTS voice reads correctly.
// "b14-gpu-07" would be read as a word salad; "B 14 G P U 0 7" is what an operator would say.
// Display text is never changed: this only prepares the string sent to ElevenLabs (and hashed for the cache).

const SPELL_KEEP = new Set(['NVIDIA']); // all-caps words that are real words
const SPELL_LONG = new Set(['IOMMU', 'PSIRT', 'HTTPS']); // 5+ letters that should still be spelled out

const spaced = (s) => s.toUpperCase().split('').join(' ');
const digitsOut = (d) => (d.length > 2 || d.startsWith('0') ? d.split('').join(' ') : d);

function speakPart(p) {
  if (/^\d+$/.test(p)) return digitsOut(p);
  if (/^[A-Za-z]+$/.test(p)) return p.length <= 3 ? spaced(p) : p;
  return (p.match(/[A-Za-z]+|\d+/g) || [p]).map((c) => (/^\d+$/.test(c) ? digitsOut(c) : spaced(c))).join(' ');
}
/** vm-7f3a -> "V M 7 F 3 A", b14-gpu-07 -> "B 14 G P U 0 7", INC-0419 -> "I N C 0 4 1 9". Plain words are left alone. */
function speakId(tok) {
  if (!/\d/.test(tok)) return tok;
  return tok.split('-').map(speakPart).join(' ');
}

export function speechify(input, lang = 'en', { maxChars = 1500 } = {}) {
  let s = String(input ?? '');

  // markdown and noise
  s = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/(\*\*|__|\*|_)(?=\S)([^*_]+?)(?<=\S)\1/g, '$2')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ');

  // known tokens
  s = s
    .replace(/\bvGPU\b/g, 'V G P U')
    .replace(/\bvNIC(s?)\b/g, 'V NIC$1')
    .replace(/\bmdev\b/gi, 'M dev')
    .replace(/\bioctl\b/gi, 'I O control')
    .replace(/\bsha-?256\b/gi, 'sha 256')
    .replace(/\bVLAN\b/g, 'V LAN')
    .replace(/\bqemu\b/gi, 'QEMU');

  // hyphenated ids that contain a digit (vm-7f3a, b14-gpu-07, agent-7f3, INC-0419, DFW-2)
  s = s.replace(/\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g, speakId);
  s = s.replace(/\b(\d+)-([A-Z])\b/g, '$1 $2'); // 8-K

  if (lang === 'en') {
    s = s
      .replace(/(?:⌘|Cmd|Command)\s*\+?\s*(?:↵|Enter|Return)/gi, 'Command Enter')
      .replace(/Ctrl\s*\+\s*Enter/gi, 'Control Enter')
      .replace(/\bT\+(\d+(?:\.\d+)?)\s*s\b/g, 'T plus $1 seconds')
      .replace(/(\d+(?:\.\d+)?)\s?ms\b/g, '$1 milliseconds')
      .replace(/(\d+(?:\.\d+)?)\s?s\b/g, '$1 seconds')
      .replace(/(\d+)\s?h\b/g, '$1 hours')
      .replace(/(\d+(?:\.\d+)?)\s?GiB\b/g, '$1 gigabytes')
      .replace(/(\d+(?:\.\d+)?)\s?MB\b/g, '$1 megabytes')
      .replace(/#([a-z][a-z-]*)/g, (_m, n) => `${n.split('-').map((w) => (w.length <= 2 ? spaced(w) : w)).join(' ')} channel`)
      .replace(/\bmgmt\b/gi, 'management')
      .replace(/\be\.g\.\s/gi, 'for example ')
      .replace(/\bi\.e\.\s/gi, 'that is ')
      .replace(/\s&\s/g, ' and ');
  }

  // acronyms: spell them out (GPU -> G P U) unless they are real words
  s = s.replace(/\b[A-Z]{2,6}\b/g, (w) => {
    if (SPELL_KEEP.has(w)) return w;
    if (w.length <= 4 || SPELL_LONG.has(w)) return spaced(w);
    return w;
  });

  s = s
    .replace(/\s+[-–—]\s+/g, ', ')
    .replace(/\s*→\s*/g, ' to ')
    .replace(/\s*[·•]\s*/g, ', ')
    .replace(/[​⁠]/g, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (s.length > maxChars) {
    const cut = s.slice(0, maxChars);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = (stop > maxChars * 0.5 ? cut.slice(0, stop + 1) : cut).trim();
  }
  return s;
}

/** Split text into sentences (works for CJK and Devanagari full stops too). */
export function sentences(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?。！？।])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

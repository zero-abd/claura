// Audio helpers that need no external encoder.
//  - silentMp3: a valid MPEG-1 Layer III stream of silence, used by the MOCK path so every consumer
//    (an <audio> tag, decodeAudioData, afinfo) still gets a real, playable audio/mpeg body.
//  - chimeWav: a two-tone alert chime, used when the ElevenLabs Sound Effects API is unavailable.

const FRAME_BYTES = 417; // 128 kbps, 44.1 kHz, no padding
const FRAME_SECONDS = 1152 / 44100;

export function silentMp3(seconds = 1) {
  const frames = Math.max(2, Math.ceil(seconds / FRAME_SECONDS));
  const buf = Buffer.alloc(frames * FRAME_BYTES); // zero side-info + zero main data decodes to silence
  for (let i = 0; i < frames; i++) {
    const o = i * FRAME_BYTES;
    buf[o] = 0xff;
    buf[o + 1] = 0xfb; // MPEG-1, Layer III, no CRC
    buf[o + 2] = 0x90; // 128 kbps, 44.1 kHz, no padding
    buf[o + 3] = 0x00; // stereo
  }
  return buf;
}

/** True when the buffer starts like an MP3 (ID3 tag or an MPEG audio frame sync). */
export function isMp3(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}
export const isWav = (buf) => !!buf && buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';

/** Rough speaking time for mock audio: about 15 characters per second. */
export const estimateSeconds = (text) => Math.min(20, Math.max(0.8, String(text ?? '').length / 15));

/** Short, urgent but calm two-tone chime (F#5 then B5), 22.05 kHz mono 16-bit WAV. */
export function chimeWav() {
  const rate = 22050;
  const notes = [
    { f: 739.99, start: 0.0, len: 0.34 },
    { f: 987.77, start: 0.2, len: 0.62 },
  ];
  const total = 0.9;
  const n = Math.floor(rate * total);
  const pcm = new Int16Array(n);
  for (const { f, start, len } of notes) {
    const s0 = Math.floor(start * rate);
    const sn = Math.floor(len * rate);
    for (let i = 0; i < sn && s0 + i < n; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.012);
      const decay = Math.exp(-t / (len * 0.42));
      const v = (Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(2 * Math.PI * f * 2 * t) + 0.08 * Math.sin(2 * Math.PI * f * 3 * t)) * attack * decay;
      pcm[s0 + i] = Math.max(-32768, Math.min(32767, pcm[s0 + i] + Math.round(v * 9000)));
    }
  }
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

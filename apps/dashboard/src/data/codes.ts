// Break-glass enrollment codes. Generated in the admin's browser with Web Crypto: no server round trip, no email, no phone.
//
// 12 characters from a 31-symbol alphabet (no 0/O, 1/I/L) is about 59 bits, shown as XXXX-XXXX-XXXX so it can be
// read aloud or printed on a card. Single use: the module marks `enrollment.used_by` when it is consumed.
import { hash } from "../util";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 symbols
const group = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;

/** A fresh random code. Rejection sampling, so every symbol is equally likely (no modulo bias). */
export function generateCode(): string {
  let out = "";
  const buf = new Uint8Array(32);
  while (out.length < 12) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248 && out.length < 12) out += ALPHABET[b % 31]; // 248 = 31 * 8
    }
  }
  return group(out);
}
/** A repeatable code for demo recordings (?demo=1): the same seed always gives the same code. */
export function codeFromSeed(seed: number): string {
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[Math.floor(hash(seed, i, 41) * 31)];
  return group(out);
}
/** How a code is shown: the live source's 18-symbol codes in three groups of six; scripted codes already carry their dashes. */
export const fmtCode = (code: string) => (/^[A-Z0-9]{18}$/.test(code) ? code.replace(/(.{6})(?=.)/g, "$1-") : code);
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const looksLikeCode = (s: string) => /^[2-9A-HJKMNP-Z]{12}$/.test(normalizeCode(s));
/** What the QR carries: a deep link the enrolling device opens (or types in by hand). 28 bytes: fits QR version 2-L. */
export const enrollLink = (code: string) => `claura://join/${code}`;
/** Fully hidden: a pending code is listed without a single character of it until an admin chooses to reveal it. */
export const maskCode = (_code: string) => "····-····-····";

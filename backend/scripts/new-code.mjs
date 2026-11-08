// Print one high-entropy enrollment code (about 78 bits) to stdout. Nothing else is printed.
//   node scripts/new-code.mjs            ->  CLA-7QK2-M9XR-4TVD-HW3E
// Alphabet skips 0/O/1/I/L so a code can be read aloud or copied by hand without mistakes.
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
process.stdout.write(`CLA-${group()}-${group()}-${group()}-${group()}\n`);

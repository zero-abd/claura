// Loopback port checks. Used to keep the Secure Shell's four sshd targets from fighting another sshd for 2201-2204.
import net from 'node:net';

export const portFree = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });

/** First base (base, base+step, ...) whose `count` consecutive ports are all free, or null. */
export async function freeBlock(base, count, { step = 10, tries = 8 } = {}) {
  for (let i = 0; i < tries; i++) {
    const b = base + i * step;
    if (b + count > 65000) break;
    const free = await Promise.all(Array.from({ length: count }, (_, k) => portFree(b + k)));
    if (free.every(Boolean)) return b;
  }
  return null;
}

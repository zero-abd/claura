import { HELP, HelpRequested, parseArgs } from './config.ts';
import { runDemo } from './demo.ts';

process.on('SIGINT', () => process.exit(130));

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof HelpRequested) {
      console.log(HELP);
      return;
    }
    console.error(`error: ${(e as Error).message}\n\n${HELP}`);
    process.exitCode = 64;
    return;
  }
  const summary = await runDemo(opts);
  process.exitCode = summary.exitCode;
  // The SDK keeps sockets/timers alive briefly after disconnect; exit explicitly.
  setTimeout(() => process.exit(summary.exitCode), 200).unref();
}

main().catch(e => {
  console.error('fatal:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});

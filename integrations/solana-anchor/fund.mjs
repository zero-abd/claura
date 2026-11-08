// Fund the Claura devnet wallet with test SOL.   node fund.mjs      (npm run fund)
//
// Creates ~/.config/claura/solana-devnet.json (mode 600) if it does not exist, prints the PUBLIC address only, and asks the
// devnet RPC faucet (connection.requestAirdrop) for test SOL with backoff. Devnet SOL has no value. As of this writing
// api.devnet.solana.com answers "410 Gone: The RPC faucet is closed on this cluster"; then this script tells you to use
// the web faucet, which needs a GitHub sign-in and so has to be done by a person. Exit code 0 = funded, 2 = not funded.
import {
  DEFAULT_WALLET_FILE, DEVNET_GENESIS, DEVNET_RPC, FAUCET_URL, explorerAddress, guardRpcUrl, loadOrCreateWallet, loadWeb3, makeConnection, requestFunding,
} from './server.mjs';

const MIN_LAMPORTS = 2_000_000;
const walletFile = process.env.CLAURA_SOLANA_KEYPAIR || DEFAULT_WALLET_FILE;
const rpcUrl = process.env.CLAURA_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || DEVNET_RPC;

try {
  guardRpcUrl(rpcUrl);
  const web3 = await loadWeb3();
  if (!web3) throw new Error('@solana/web3.js is not installed: run npm install in integrations/solana-anchor');
  const { keypair, created } = await loadOrCreateWallet(walletFile);
  const address = keypair.publicKey.toBase58();
  console.log(created ? 'Created a new DEVNET wallet (the secret key is in the file, mode 600, and is never printed).' : 'DEVNET wallet loaded.');
  console.log(`PUBLIC ADDRESS: ${address}`);
  console.log(`Explorer:       ${explorerAddress(address)}`);

  const conn = makeConnection(web3, rpcUrl, { quiet429: true });
  if ((await conn.getGenesisHash()) !== DEVNET_GENESIS) throw new Error('refusing to go on: that RPC is not Solana devnet');
  let lamports = await conn.getBalance(keypair.publicKey, 'confirmed');
  console.log(`Balance:        ${(lamports / 1e9).toFixed(4)} SOL`);
  if (lamports >= MIN_LAMPORTS) {
    console.log('Already funded: the integration runs LIVE. Nothing to do.');
    process.exit(0);
  }

  console.log('Asking the devnet RPC faucet for test SOL...');
  const r = await requestFunding({ connection: conn, publicKey: keypair.publicKey });
  if (r.ok) {
    lamports = r.lamports;
    console.log(`Funded. Balance: ${(lamports / 1e9).toFixed(4)} SOL. The integration now runs LIVE.`);
    process.exit(0);
  }
  console.log(r.closed ? 'The devnet RPC faucet is closed (410 Gone), so it cannot be funded from the command line.' : `The airdrop did not go through: ${r.error}`);
  console.log('To fund the wallet:');
  console.log(`  1. Open ${FAUCET_URL} and sign in with GitHub.`);
  console.log(`  2. Paste ${address}, choose Devnet, request 1 to 5 SOL.`);
  console.log('  3. Run npm run smoke here, or just use the app: the next balance check flips the integration from mock to live.');
  process.exit(2);
} catch (e) {
  console.error(`fund: ${e.message}`);
  process.exit(1);
}

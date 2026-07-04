import { createRequire } from 'node:module';

const require = createRequire(new URL('../../artifacts/xrpl-flow/package.json', import.meta.url));
const XRPL = require('xrpl');

const network = process.env.XRPL_SMOKE_NETWORK || 'testnet';
const seed = process.env.XRPL_SMOKE_SEED || '';
const destination = process.env.XRPL_SMOKE_DESTINATION || '';
const drops = process.env.XRPL_SMOKE_DROPS || '1';

const endpoints = {
  testnet: process.env.XRPL_SMOKE_URL || 'wss://s.altnet.rippletest.net:51233',
  devnet: process.env.XRPL_SMOKE_URL || 'wss://s.devnet.rippletest.net:51233',
};

if (!seed || !destination) {
  console.log('Skipping live XRPL smoke test. Set XRPL_SMOKE_SEED and XRPL_SMOKE_DESTINATION to run it.');
  process.exit(0);
}

if (network !== 'testnet' && network !== 'devnet') {
  throw new Error('XRPL smoke tests only support XRPL_SMOKE_NETWORK=testnet or devnet. Mainnet is intentionally blocked.');
}

if (!XRPL.isValidClassicAddress(destination)) {
  throw new Error('XRPL_SMOKE_DESTINATION must be a classic XRPL address.');
}

const wallet = XRPL.Wallet.fromSeed(seed);
const client = new XRPL.Client(endpoints[network]);

try {
  console.log(`Connecting to ${network} (${endpoints[network]}) as ${wallet.address}...`);
  await client.connect();
  const tx = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: destination,
    Amount: drops,
  };
  const response = await client.submitAndWait(tx, { wallet });
  const result = response.result.meta && typeof response.result.meta === 'object'
    ? response.result.meta.TransactionResult
    : 'unknown';
  if (result !== 'tesSUCCESS') throw new Error(`Smoke payment failed with ${result}`);
  console.log(`XRPL smoke payment succeeded: ${response.result.hash}`);
} finally {
  await client.disconnect();
}

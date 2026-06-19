import * as XRPL from 'xrpl';

export type NetworkType = 'mainnet' | 'testnet' | 'devnet';

export const NETWORK_URLS = {
  mainnet: 'wss://xrplcluster.com',
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233'
};

export const EXPLORER_URLS = {
  mainnet: 'https://livenet.xrpl.org/transactions/',
  testnet: 'https://testnet.xrpl.org/transactions/',
  devnet: 'https://devnet.xrpl.org/transactions/'
};

export const FAUCET_URLS = {
  testnet: 'https://faucet.altnet.rippletest.net/accounts',
  devnet: 'https://faucet.devnet.rippletest.net/accounts'
};

/**
 * Request funds from the faucet.
 * - If `destination` is provided the faucet will fund that existing address.
 * - Otherwise the faucet mints a brand-new funded wallet and returns its credentials.
 */
export async function fundWalletWithFaucet(
  network: NetworkType,
  destination?: string,
): Promise<{ account: { xAddress: string; classicAddress: string; secret: string } }> {
  if (network === 'mainnet') {
    throw new Error('Faucet not available on mainnet');
  }

  const url = FAUCET_URLS[network];
  const body = destination ? JSON.stringify({ destination }) : undefined;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body } : {}),
  });

  if (!response.ok) {
    throw new Error(`Faucet request failed: ${response.statusText}`);
  }

  return response.json();
}

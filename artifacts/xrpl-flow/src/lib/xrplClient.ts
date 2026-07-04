import * as XRPL from 'xrpl';

export type NetworkType = 'mainnet' | 'testnet' | 'devnet' | 'custom';
export type EndpointKind = 'rippled' | 'clio' | 'unknown';

export interface EndpointConfig {
  id: string;
  label: string;
  url: string;
  kind: EndpointKind;
  network: NetworkType;
  notes?: string;
}

export interface NetworkProfile {
  network: NetworkType;
  label: string;
  primaryUrl: string;
  fallbackUrls: string[];
  clioUrls: string[];
  publicEndpoints: EndpointConfig[];
}

export const NETWORK_URLS: Record<Exclude<NetworkType, 'custom'>, string> = {
  mainnet: 'wss://xrplcluster.com',
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233'
};

export const EXPLORER_URLS: Record<NetworkType, string> = {
  mainnet: 'https://livenet.xrpl.org/transactions/',
  testnet: 'https://testnet.xrpl.org/transactions/',
  devnet: 'https://devnet.xrpl.org/transactions/',
  custom: 'https://livenet.xrpl.org/transactions/',
};

export const FAUCET_URLS = {
  testnet: 'https://faucet.altnet.rippletest.net/accounts',
  devnet: 'https://faucet.devnet.rippletest.net/accounts'
};

export type FaucetAccount = {
  xAddress?: string;
  classicAddress: string;
  seed?: string;
  secret?: string;
  balance?: string;
};

export type FaucetResponse = {
  account: FaucetAccount;
  raw: unknown;
};

export const CUSTOM_NETWORK_PROFILE_KEY = 'xrplFlow_customNetworkProfile_v1';
export const NETWORK_PROFILE_OVERRIDES_KEY = 'xrplFlow_networkProfileOverrides_v1';

// Seeded from the official XRPL public server list. We keep this bundled and
// versioned instead of scraping docs at runtime; users can still override or
// paste their own plain WS/HTTP endpoint in Advanced settings.
export const PUBLIC_ENDPOINTS: EndpointConfig[] = [
  { id: 'mainnet-honeycluster', label: 'Honeycluster Mainnet (Clio/full history)', network: 'mainnet', kind: 'clio', url: 'wss://honeycluster.io/', notes: 'Full-history Clio cluster' },
  { id: 'mainnet-xrplcluster', label: 'InFTF Mainnet xrplcluster', network: 'mainnet', kind: 'clio', url: 'wss://xrplcluster.com/', notes: 'Full-history cluster with CORS' },
  { id: 'mainnet-xrplws', label: 'InFTF Mainnet xrpl.ws alias', network: 'mainnet', kind: 'clio', url: 'wss://xrpl.ws/', notes: 'Alias for xrplcluster.com; not ideal as a production default' },
  { id: 'mainnet-ripple-s1', label: 'Ripple Mainnet s1', network: 'mainnet', kind: 'rippled', url: 'wss://s1.ripple.com/', notes: 'General-purpose public server' },
  { id: 'mainnet-ripple-s2', label: 'Ripple Mainnet s2 full history', network: 'mainnet', kind: 'rippled', url: 'wss://s2.ripple.com/', notes: 'Full-history public server' },
  { id: 'testnet-ripple', label: 'Ripple Testnet', network: 'testnet', kind: 'rippled', url: 'wss://s.altnet.rippletest.net:51233/', notes: 'Public Testnet server' },
  { id: 'testnet-honeycluster', label: 'Honeycluster Testnet', network: 'testnet', kind: 'rippled', url: 'wss://testnet.honeycluster.io/', notes: 'Public Testnet server' },
  { id: 'testnet-xrpl-labs', label: 'XRPL Labs Testnet', network: 'testnet', kind: 'rippled', url: 'wss://testnet.xrpl-labs.com/', notes: 'Public Testnet server with CORS' },
  { id: 'testnet-ripple-clio', label: 'Ripple Testnet Clio', network: 'testnet', kind: 'clio', url: 'wss://clio.altnet.rippletest.net:51233/', notes: 'Clio for validated/history queries' },
  { id: 'devnet-ripple', label: 'Ripple Devnet', network: 'devnet', kind: 'rippled', url: 'wss://s.devnet.rippletest.net:51233/', notes: 'Public Devnet server' },
  { id: 'devnet-ripple-clio', label: 'Ripple Devnet Clio', network: 'devnet', kind: 'clio', url: 'wss://clio.devnet.rippletest.net:51233/', notes: 'Clio for validated/history queries' },
  { id: 'devnet-honeycluster', label: 'Honeycluster Devnet', network: 'devnet', kind: 'rippled', url: 'wss://devnet.honeycluster.io/', notes: 'Public Devnet server' },
];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function endpointsFor(network: NetworkType): EndpointConfig[] {
  return PUBLIC_ENDPOINTS.filter(endpoint => endpoint.network === network);
}

function defaultProfile(network: NetworkType): NetworkProfile {
  if (network === 'custom') {
    return {
      network,
      label: 'Custom',
      primaryUrl: '',
      fallbackUrls: [],
      clioUrls: [],
      publicEndpoints: [],
    };
  }
  const endpoints = endpointsFor(network);
  const rippled = endpoints.filter(endpoint => endpoint.kind === 'rippled').map(endpoint => endpoint.url);
  const clio = endpoints.filter(endpoint => endpoint.kind === 'clio').map(endpoint => endpoint.url);
  return {
    network,
    label: network[0].toUpperCase() + network.slice(1),
    primaryUrl: NETWORK_URLS[network],
    fallbackUrls: unique([...rippled, ...clio].filter(url => url !== NETWORK_URLS[network])),
    clioUrls: unique(clio),
    publicEndpoints: endpoints,
  };
}

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string): string {
  return url.trim();
}

export function isPlainPublicEndpointUrl(url: string): boolean {
  const trimmed = normalizeUrl(url);
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return ['ws:', 'wss:', 'http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function getNetworkProfile(network: NetworkType): NetworkProfile {
  if (network === 'custom') {
    const custom = readJson<Partial<NetworkProfile>>(CUSTOM_NETWORK_PROFILE_KEY);
    const primaryUrl = normalizeUrl(custom?.primaryUrl || '');
    const fallbackUrls = unique((custom?.fallbackUrls || []).map(normalizeUrl).filter(isPlainPublicEndpointUrl));
    const clioUrls = unique((custom?.clioUrls || []).map(normalizeUrl).filter(isPlainPublicEndpointUrl));
    return {
      ...defaultProfile(network),
      ...custom,
      network,
      label: custom?.label || 'Custom',
      primaryUrl: isPlainPublicEndpointUrl(primaryUrl) ? primaryUrl : '',
      fallbackUrls,
      clioUrls,
      publicEndpoints: [],
    };
  }

  const base = defaultProfile(network);
  const overrides = readJson<Record<string, Partial<NetworkProfile>>>(NETWORK_PROFILE_OVERRIDES_KEY);
  const override = overrides?.[network] || {};
  return {
    ...base,
    ...override,
    network,
    label: override.label || base.label,
    primaryUrl: normalizeUrl(override.primaryUrl || base.primaryUrl),
    fallbackUrls: unique([...(override.fallbackUrls || []), ...base.fallbackUrls].map(normalizeUrl).filter(isPlainPublicEndpointUrl)),
    clioUrls: unique([...(override.clioUrls || []), ...base.clioUrls].map(normalizeUrl).filter(isPlainPublicEndpointUrl)),
    publicEndpoints: base.publicEndpoints,
  };
}

export function saveNetworkProfile(profile: NetworkProfile): void {
  if (typeof localStorage === 'undefined') return;
  const sanitized: NetworkProfile = {
    ...profile,
    primaryUrl: normalizeUrl(profile.primaryUrl),
    fallbackUrls: unique(profile.fallbackUrls.map(normalizeUrl).filter(isPlainPublicEndpointUrl)),
    clioUrls: unique(profile.clioUrls.map(normalizeUrl).filter(isPlainPublicEndpointUrl)),
  };
  if (!isPlainPublicEndpointUrl(sanitized.primaryUrl)) {
    throw new Error('Use a plain ws://, wss://, http://, or https:// endpoint URL with no embedded credentials.');
  }
  if (sanitized.network === 'custom') {
    localStorage.setItem(CUSTOM_NETWORK_PROFILE_KEY, JSON.stringify(sanitized));
    return;
  }
  const overrides = readJson<Record<string, Partial<NetworkProfile>>>(NETWORK_PROFILE_OVERRIDES_KEY) || {};
  overrides[sanitized.network] = sanitized;
  localStorage.setItem(NETWORK_PROFILE_OVERRIDES_KEY, JSON.stringify(overrides));
}

function readString(source: unknown, keys: string[]): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function normalizeFaucetResponse(raw: unknown): FaucetResponse {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const accountLike = (
    root.account && typeof root.account === 'object' ? root.account :
    root.wallet && typeof root.wallet === 'object' ? root.wallet :
    root
  );
  const classicAddress = readString(accountLike, ['classicAddress', 'classic_address', 'address', 'account', 'Account']);
  const seed = readString(accountLike, ['seed', 'secret']) || readString(root, ['seed', 'secret']);
  const xAddress = readString(accountLike, ['xAddress', 'xaddress', 'x_address']);
  const balance = readString(accountLike, ['balance', 'Balance']) || readString(root, ['balance', 'Balance']);

  if (!classicAddress && !seed) {
    throw new Error('Faucet response did not include an address or seed. Try again or use Generate Wallet + Fund.');
  }

  return {
    account: {
      classicAddress: classicAddress || '',
      xAddress,
      seed,
      secret: seed,
      balance,
    },
    raw,
  };
}

/**
 * Request funds from the faucet.
 * - If `destination` is provided the faucet will fund that existing address.
 * - Otherwise the faucet mints a brand-new funded wallet and returns its credentials.
 */
export async function fundWalletWithFaucet(
  network: NetworkType,
  destination?: string,
): Promise<FaucetResponse> {
  if (network === 'mainnet' || network === 'custom') {
    throw new Error('Faucet is only available on Testnet and Devnet');
  }

  const url = FAUCET_URLS[network];
  const body = destination ? JSON.stringify({ destination }) : undefined;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body } : {}),
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const message = readString(payload, ['message', 'error', 'error_message']) || response.statusText;
    throw new Error(`Faucet request failed: ${message}`);
  }

  return normalizeFaucetResponse(payload);
}

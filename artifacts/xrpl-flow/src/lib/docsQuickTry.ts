import * as XRPL from 'xrpl';
import type { Node, Edge } from '@xyflow/react';
import { connectXRPL } from './networkConnection';
import { EXPLORER_URLS, fundWalletWithFaucet, type NetworkType } from './xrplClient';
import { runWorkflow } from './workflowEngine';
import type { WalletInfo } from '@/store/workflowStore';

export const QUICK_TRY_WORKFLOWS = new Set([
  'Send XRP',
  'Loop 3×',
  'Delay Between Txns',
  'Conditional Branch',
  'Token Holder Snapshot',
  'Airdrop Prep: Query Eligible Wallets',
  'Guarded Treasury Payout',
  'Fetch Trustlines CSV',
  'Fetch All Holders by Issuer CSV',
  'Account Audit CSV',
]);

type QuickTryStore = {
  wallets: WalletInfo[];
  network: NetworkType;
  xrplClient: XRPL.Client | null;
  connectionStatus: string;
  addWallet: (wallet: WalletInfo) => void;
  setActiveWallet: (id: string | null) => void;
  setNetwork: (network: NetworkType) => void;
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
  setClient: (client: XRPL.Client | null) => void;
  createWorkflow: (name: string, nodes: Node[], edges: Edge[], options?: { autosave?: boolean }) => void;
  setNodeStatus: (id: string, status: 'idle' | 'running' | 'success' | 'failed', error?: string) => void;
  addLogEntry: (entry: { nodeId: string; nodeLabel: string; message: string; txHash?: string; status: 'running' | 'success' | 'failed' | 'info' }) => void;
  resetNodeStatuses: () => void;
};

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function docsWalletName(network: NetworkType, role: 'Source' | 'Destination') {
  return `Docs ${network} ${role}`;
}

function walletFromFaucet(network: 'testnet' | 'devnet', role: 'Source' | 'Destination', index: number, response: Awaited<ReturnType<typeof fundWalletWithFaucet>>): WalletInfo {
  const seed = response.account.seed || response.account.secret;
  if (!seed) throw new Error('Faucet did not return a seed for the docs example wallet.');
  const wallet = XRPL.Wallet.fromSeed(seed);
  return {
    id: `docs-${network}-${role.toLowerCase()}-${Date.now()}-${index}`,
    name: docsWalletName(network, role),
    address: response.account.classicAddress || wallet.address,
    publicKey: wallet.publicKey,
    seed,
    balance: response.account.balance || '1000',
  };
}

async function ensureWalletPair(store: QuickTryStore, network: 'testnet' | 'devnet') {
  const existingSource = store.wallets.find(wallet => wallet.name === docsWalletName(network, 'Source') && wallet.seed);
  const existingDestination = store.wallets.find(wallet => wallet.name === docsWalletName(network, 'Destination') && wallet.seed);

  let source = existingSource;
  let destination = existingDestination;

  if (!source) {
    source = walletFromFaucet(network, 'Source', 1, await fundWalletWithFaucet(network));
    store.addWallet(source);
  } else {
    await fundWalletWithFaucet(network, source.address).catch(() => undefined);
  }

  if (!destination) {
    destination = walletFromFaucet(network, 'Destination', 2, await fundWalletWithFaucet(network));
    store.addWallet(destination);
  }

  store.setActiveWallet(source.id);
  return { source, destination };
}

function fillConfigValue(key: string, value: unknown, source: WalletInfo, destination: WalletInfo): unknown {
  if (typeof value === 'string' && value.trim()) return value;
  if (key === 'Account' || key === 'Owner') return source.address;
  if (key === 'Destination' || key === 'Counterparty' || key === 'Holder') return destination.address;
  if (key === 'Issuer' || key.endsWith('_issuer')) return source.address;
  return value;
}

function prepareWorkflow(nodes: Node[], source: WalletInfo, destination: WalletInfo): Node[] {
  return clonePlain(nodes).map(node => {
    const config = { ...((node.data?.config as Record<string, unknown> | undefined) || {}) };
    for (const key of Object.keys(config)) config[key] = fillConfigValue(key, config[key], source, destination);
    return {
      ...node,
      data: {
        ...node.data,
        config,
      },
    };
  });
}

export async function runDocsQuickTry(
  name: string,
  nodes: Node[],
  edges: Edge[],
  store: QuickTryStore,
): Promise<{ network: 'testnet' | 'devnet'; source: WalletInfo; destination: WalletInfo }> {
  if (!QUICK_TRY_WORKFLOWS.has(name)) {
    throw new Error('This example needs custom values, so open it in the editor first.');
  }

  const targetNetwork: 'testnet' | 'devnet' = store.network === 'devnet' ? 'devnet' : 'testnet';
  store.setNetwork(targetNetwork);
  const client = store.connectionStatus === 'connected' && store.network === targetNetwork && store.xrplClient
    ? store.xrplClient
    : await connectXRPL(targetNetwork, store.xrplClient, {
        setClient: store.setClient,
        setStatus: store.setConnectionStatus,
      });

  const { source, destination } = await ensureWalletPair(store, targetNetwork);
  const preparedNodes = prepareWorkflow(nodes, source, destination);
  const preparedEdges = clonePlain(edges);

  store.createWorkflow(`Docs Quick: ${name}`, preparedNodes, preparedEdges, { autosave: false });
  store.resetNodeStatuses();
  store.addLogEntry({
    nodeId: '',
    nodeLabel: 'Docs Quick Try',
    message: `Running "${name}" on ${targetNetwork} with docs-funded wallets.`,
    status: 'info',
  });

  await runWorkflow(
    preparedNodes,
    preparedEdges,
    client,
    source,
    source.seed || '',
    {
      setNodeStatus: store.setNodeStatus,
      addLogEntry: store.addLogEntry,
      getExplorerUrl: hash => `${EXPLORER_URLS[targetNetwork]}${hash}`,
      network: targetNetwork,
    },
    [...store.wallets, source, destination],
  );

  store.addLogEntry({
    nodeId: '',
    nodeLabel: 'Docs Quick Try',
    message: `"${name}" completed on ${targetNetwork}.`,
    status: 'success',
  });

  return { network: targetNetwork, source, destination };
}

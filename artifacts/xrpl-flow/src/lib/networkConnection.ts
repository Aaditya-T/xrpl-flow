import * as XRPL from 'xrpl';
import type { ConnectionStatus } from '@/store/workflowStore';
import { getNetworkProfile, type NetworkType } from './xrplClient';

type ConnectionHandlers = {
  setClient: (client: XRPL.Client | null) => void;
  setStatus: (status: ConnectionStatus) => void;
};

let connectionGeneration = 0;

export async function disconnectXRPL(client: XRPL.Client | null, handlers: ConnectionHandlers): Promise<void> {
  connectionGeneration += 1;
  if (client) {
    try { await client.disconnect(); } catch { /* already disconnected */ }
  }
  handlers.setClient(null);
  handlers.setStatus('disconnected');
}

export async function connectXRPL(network: NetworkType, current: XRPL.Client | null, handlers: ConnectionHandlers): Promise<XRPL.Client> {
  const generation = ++connectionGeneration;
  if (current) {
    try { await current.disconnect(); } catch { /* already disconnected */ }
  }
  handlers.setClient(null);
  handlers.setStatus('connecting');
  const profile = getNetworkProfile(network);
  if (!profile.primaryUrl) {
    handlers.setStatus('error');
    throw new Error('No primary XRPL endpoint is configured for this network.');
  }
  const client = new XRPL.Client(profile.primaryUrl);
  client.on('disconnected', () => {
    if (generation !== connectionGeneration) return;
    handlers.setClient(null);
    handlers.setStatus('disconnected');
  });
  client.on('error', () => {
    if (generation !== connectionGeneration) return;
    handlers.setStatus('error');
  });
  try {
    await client.connect();
    if (generation !== connectionGeneration) {
      await client.disconnect();
      throw new Error('Connection was superseded by a newer network selection.');
    }
    handlers.setClient(client);
    handlers.setStatus('connected');
    return client;
  } catch (error) {
    if (generation === connectionGeneration) {
      handlers.setClient(null);
      handlers.setStatus('error');
    }
    throw error;
  }
}

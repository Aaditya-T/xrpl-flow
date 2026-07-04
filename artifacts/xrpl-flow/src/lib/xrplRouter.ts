import * as XRPL from 'xrpl';
import { getNetworkProfile, type EndpointKind, type NetworkType } from './xrplClient';

export interface XRPLRequestRequirements {
  kind?: EndpointKind | 'either';
  method?: string;
  preferClio?: boolean;
  clioOnly?: boolean;
  validatedOnly?: boolean;
  pinnedUrl?: string;
}

export interface RoutingAttempt {
  url: string;
  kind: EndpointKind;
  status: 'success' | 'retry' | 'failed' | 'unsupported';
  message: string;
  retryAfterMs?: number;
}

export interface RoutedXRPLResponse<T = unknown> {
  result: T;
  endpoint: {
    url: string;
    kind: EndpointKind;
  };
  attempts: RoutingAttempt[];
}

const CLIO_ONLY_METHODS = new Set(['nft_history', 'nft_info', 'nfts_by_issuer', 'mpt_holders']);
const LIVE_ONLY_METHODS = new Set(['subscribe', 'unsubscribe']);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Workflow stopped by user.', 'AbortError'));
    }, { once: true });
  });
}

function classifyError(error: any): { retryable: boolean; unsupported: boolean; retryAfterMs?: number; message: string } {
  const message = error?.data?.error_message || error?.data?.error || error?.message || String(error);
  const lower = String(message).toLowerCase();
  const retryAfter = Number(error?.response?.headers?.get?.('Retry-After'));
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
  const unsupported = lower.includes('unknown command') || lower.includes('unsupported') || lower.includes('not implemented') || lower.includes('reportingunsupported');
  const rateLimited = lower.includes('rate') || lower.includes('too busy') || lower.includes('toobusy') || lower.includes('slowdown') || lower.includes('slow down') || error?.status === 429;
  const transient = rateLimited || lower.includes('timeout') || lower.includes('disconnected') || lower.includes('network') || lower.includes('econnreset') || lower.includes('503') || lower.includes('502') || lower.includes('500');
  return { retryable: transient && !unsupported, unsupported, retryAfterMs, message };
}

function isWebSocketUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

function endpointCandidates(network: NetworkType, requirements: XRPLRequestRequirements, liveClient?: XRPL.Client): Array<{ url: string; kind: EndpointKind; live?: XRPL.Client }> {
  const profile = getNetworkProfile(network);
  const command = requirements.method || '';
  const wantsClio = requirements.clioOnly || CLIO_ONLY_METHODS.has(command);
  const wantsLive = LIVE_ONLY_METHODS.has(command) || requirements.kind === 'rippled';
  const candidates: Array<{ url: string; kind: EndpointKind; live?: XRPL.Client }> = [];

  if (requirements.pinnedUrl) {
    candidates.push({ url: requirements.pinnedUrl, kind: wantsClio ? 'clio' : 'unknown' });
    return candidates;
  }

  if (liveClient && !wantsClio) {
    candidates.push({ url: profile.primaryUrl || 'connected-client', kind: 'rippled', live: liveClient });
  }

  if (wantsClio || requirements.preferClio || requirements.validatedOnly) {
    for (const url of profile.clioUrls) candidates.push({ url, kind: 'clio' });
  }

  if (!wantsClio) {
    if (profile.primaryUrl) candidates.push({ url: profile.primaryUrl, kind: wantsLive ? 'rippled' : 'unknown' });
    for (const url of profile.fallbackUrls) candidates.push({ url, kind: 'unknown' });
  } else {
    for (const url of profile.fallbackUrls.filter(url => profile.clioUrls.includes(url))) candidates.push({ url, kind: 'clio' });
  }

  const deduped: Array<{ url: string; kind: EndpointKind; live?: XRPL.Client }> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.live ? 'live' : candidate.url;
    if (!candidate.url || seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

async function requestViaClient<T>(
  candidate: { url: string; kind: EndpointKind; live?: XRPL.Client },
  request: Record<string, unknown>,
): Promise<T> {
  if (candidate.live) {
    const response = await candidate.live.request(request as any);
    return response.result as T;
  }

  if (!isWebSocketUrl(candidate.url)) {
    const response = await fetch(candidate.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: request.command, params: [request] }),
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    const json = await response.json();
    if (json.error) throw new Error(json.error_message || json.error);
    if (json.result?.error) throw new Error(json.result.error_message || json.result.error);
    return json.result as T;
  }

  const client = new XRPL.Client(candidate.url);
  try {
    await client.connect();
    const response = await client.request(request as any);
    return response.result as T;
  } finally {
    try { await client.disconnect(); } catch { /* ignore */ }
  }
}

export async function routeXRPLRequest<T = unknown>(
  network: NetworkType,
  request: Record<string, unknown>,
  requirements: XRPLRequestRequirements = {},
  liveClient?: XRPL.Client,
  signal?: AbortSignal,
): Promise<RoutedXRPLResponse<T>> {
  const command = String(request.command || requirements.method || '');
  const effectiveRequirements: XRPLRequestRequirements = {
    ...requirements,
    method: command,
    clioOnly: requirements.clioOnly || CLIO_ONLY_METHODS.has(command),
  };
  if (effectiveRequirements.clioOnly && request.ledger_index && ['current', 'closed'].includes(String(request.ledger_index))) {
    throw new Error(`${command} is Clio-only and must query validated ledger history, not ledger_index=${String(request.ledger_index)}.`);
  }

  const candidates = endpointCandidates(network, effectiveRequirements, liveClient);
  if (candidates.length === 0) throw new Error(`No compatible ${effectiveRequirements.clioOnly ? 'Clio' : 'XRPL'} endpoint is configured for ${network}.`);

  const attempts: RoutingAttempt[] = [];
  const maxAttempts = Math.min(Math.max(candidates.length * 2, 1), 5);
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = candidates[attempt % candidates.length];
    try {
      const result = await requestViaClient<T>(candidate, request);
      attempts.push({ url: candidate.url, kind: candidate.kind, status: 'success', message: 'ok' });
      return { result, endpoint: { url: candidate.url, kind: candidate.kind }, attempts };
    } catch (error: any) {
      lastError = error;
      const classified = classifyError(error);
      attempts.push({
        url: candidate.url,
        kind: candidate.kind,
        status: classified.unsupported ? 'unsupported' : classified.retryable ? 'retry' : 'failed',
        message: classified.message,
        retryAfterMs: classified.retryAfterMs,
      });
      if (classified.unsupported || !classified.retryable) continue;
      const delay = classified.retryAfterMs || Math.min(30_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      await sleep(delay, signal);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown routing failure');
  throw new Error(`XRPL request "${command}" failed after ${attempts.length} attempt(s): ${message}`);
}

import type { WorkflowDocumentV2 } from './workflowTypes';

const SESSION_KEY = 'xrplFlow_marketplaceSession_v1';

function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  if (!configured) return '';

  try {
    const parsed = new URL(configured);
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (!import.meta.env.DEV && isLocalhost) return '';

    const withoutApiSuffix = parsed.pathname.replace(/\/api\/?$/i, '');
    parsed.pathname = withoutApiSuffix || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    if (!import.meta.env.DEV && /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(configured)) return '';
    return configured.replace(/\/api$/i, '');
  }
}

export type MarketplaceUser = {
  address: string;
  displayName?: string;
};

export type MarketplaceTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  authorAddress: string;
  authorName: string;
  workflow: WorkflowDocumentV2;
  createdAt: number;
  updatedAt: number;
};

export type MarketplaceListResult = {
  templates: MarketplaceTemplate[];
  storage: 'memory' | 'cloudflare-d1' | 'unknown';
};

export function getMarketplaceSession(): string {
  return localStorage.getItem(SESSION_KEY) || '';
}

export function setMarketplaceSession(token: string): void {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

export function captureMarketplaceSessionFromUrl(): string {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('xrplFlowSession') || '';
  if (!token) return getMarketplaceSession();
  setMarketplaceSession(token);
  url.searchParams.delete('xrplFlowSession');
  window.history.replaceState({}, '', url.toString());
  return token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getMarketplaceSession();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session}`);
  const requestUrl = `${getApiBaseUrl()}/api${path}`;
  const response = await fetch(requestUrl, {
    ...init,
    headers,
  });
  const text = await response.text();
  let json: any = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      const htmlShell = response.headers.get('content-type')?.includes('text/html') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
      throw new Error(htmlShell
        ? `Marketplace API is not connected at ${requestUrl}. Start the API server and use the Vite /api proxy locally, or set VITE_API_BASE_URL to your deployed API origin.`
        : `Marketplace API returned invalid JSON: ${text.slice(0, 120)}`);
    }
  }
  if (!response.ok) throw new Error(json.error || response.statusText);
  return json as T;
}

export async function getMarketplaceUser(): Promise<MarketplaceUser | null> {
  const result = await api<{ user: MarketplaceUser | null }>('/auth/me');
  return result.user;
}

export async function beginXamanSignIn(): Promise<void> {
  const result = await api<{ authorizationUrl: string }>(`/auth/xaman/start?returnTo=${encodeURIComponent(window.location.href)}`, {
    method: 'GET',
    headers: {},
  });
  window.location.assign(result.authorizationUrl);
}

export async function createDevMarketplaceSession(address: string): Promise<MarketplaceUser> {
  const result = await api<{ token: string; user: MarketplaceUser }>('/auth/xaman/dev-session', {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
  setMarketplaceSession(result.token);
  return result.user;
}

export async function listMarketplaceTemplates(): Promise<MarketplaceListResult> {
  const result = await api<{ templates: MarketplaceTemplate[]; storage?: MarketplaceListResult['storage'] }>('/marketplace/templates');
  return { templates: result.templates, storage: result.storage || 'unknown' };
}

export async function publishMarketplaceTemplate(input: {
  name: string;
  description: string;
  tags: string[];
  workflow: WorkflowDocumentV2;
}): Promise<{ template: MarketplaceTemplate; storage: MarketplaceListResult['storage'] }> {
  const result = await api<{ template: MarketplaceTemplate; storage?: MarketplaceListResult['storage'] }>('/marketplace/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return { template: result.template, storage: result.storage || 'unknown' };
}

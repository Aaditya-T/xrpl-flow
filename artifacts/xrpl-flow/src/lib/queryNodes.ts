import * as XRPL from 'xrpl';
import type { NetworkType } from './xrplClient';
import { resolveWorkflowBindings, selectOutputPath } from './dataBinding';
import { routeXRPLRequest, type RoutedXRPLResponse } from './xrplRouter';

export const QUERY_NODE_TYPES = new Set([
  'AccountInfoQuery',
  'AccountLinesQuery',
  'AccountTxQuery',
  'AccountObjectsQuery',
  'LedgerQuery',
  'TxQuery',
  'NFTInfoQuery',
  'NFTHistoryQuery',
  'NFTsByIssuerQuery',
  'RawLedgerQuery',
  'PickOutput',
  'FilterItems',
  'DedupeItems',
  'AccumulateItems',
  'FormatTrustLines',
  'ExportCsv',
]);

const runtimeAccumulators = new Map<string, unknown[]>();

export function resetQueryNodeRuntime(): void {
  runtimeAccumulators.clear();
}

type QueryOutput = {
  data: unknown;
  items: unknown[];
  meta: {
    command: string;
    endpoint?: string;
    endpointKind?: string;
    attempts?: number;
    count?: number;
    marker?: unknown;
    markerEndpoint?: string;
    note?: string;
  };
  raw: unknown;
};

function normalizeItems(result: any): unknown[] {
  if (!result) return [];
  if (Array.isArray(result.items)) return result.items;
  if (Array.isArray(result.transactions)) return result.transactions;
  if (Array.isArray(result.lines)) return result.lines;
  if (Array.isArray(result.account_objects)) return result.account_objects;
  if (Array.isArray(result.nfts)) return result.nfts;
  if (Array.isArray(result.nfts_by_issuer)) return result.nfts_by_issuer;
  if (Array.isArray(result.holders)) return result.holders;
  if (Array.isArray(result.ledger?.transactions)) return result.ledger.transactions;
  if (Array.isArray(result.ledger?.accountState)) return result.ledger.accountState;
  return [];
}

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function parseRawRequest(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Raw request JSON is required.');
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Raw request must be a JSON object.');
  return parsed as Record<string, unknown>;
}

function wrapRouted(command: string, routed: RoutedXRPLResponse<any>, note?: string): QueryOutput {
  const items = normalizeItems(routed.result);
  const marker = routed.result && typeof routed.result === 'object' ? routed.result.marker : undefined;
  const data = routed.result && typeof routed.result === 'object' && !Array.isArray(routed.result)
    ? { ...routed.result, markerEndpoint: marker ? routed.endpoint.url : undefined }
    : routed.result;
  return {
    data,
    items,
    meta: {
      command,
      endpoint: routed.endpoint.url,
      endpointKind: routed.endpoint.kind,
      attempts: routed.attempts.length,
      count: items.length,
      marker,
      markerEndpoint: marker ? routed.endpoint.url : undefined,
      note,
    },
    raw: routed.result,
  };
}

async function request(
  network: NetworkType,
  liveClient: XRPL.Client,
  command: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
  options: { clioOnly?: boolean; preferClio?: boolean; validatedOnly?: boolean } = {},
  pinnedUrl?: string,
): Promise<QueryOutput> {
  const routed = await routeXRPLRequest<any>(
    network,
    { command, ...payload },
    { method: command, ...options, pinnedUrl },
    liveClient,
    signal,
  );
  return wrapRouted(command, routed);
}

function optionalMarker(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

function sourceItems(cfg: Record<string, any>, prevOutput: any): unknown[] {
  const sourcePath = String(cfg.SourcePath || 'items');
  const selected = selectOutputPath(prevOutput, sourcePath);
  if (Array.isArray(selected)) return selected;
  if (Array.isArray(prevOutput?.items)) return prevOutput.items;
  return selected === undefined ? [] : [selected];
}

function matchesFilter(item: unknown, fieldPath: string, operator: string, compareValue: unknown): boolean {
  const value = fieldPath ? selectOutputPath(item, fieldPath) : item;
  const left = typeof value === 'number' ? value : String(value ?? '');
  const right = typeof compareValue === 'number' ? compareValue : String(compareValue ?? '');
  switch (operator) {
    case 'exists': return value !== undefined && value !== null && value !== '';
    case 'equals': return left === right;
    case 'not-equals': return left !== right;
    case 'contains': return String(left).includes(String(right));
    case 'gt': return Number(left) > Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'lte': return Number(left) <= Number(right);
    default: return false;
  }
}

function parseColumns(value: unknown): Array<{ header: string; path: string }> {
  const text = String(value || '').trim();
  if (!text) return [{ header: 'value', path: '' }];
  return text
    .split(/[\n,]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.includes('=') ? '=' : part.includes(':') ? ':' : '';
      if (!separator) return { header: part, path: part };
      const [header, ...rest] = part.split(separator);
      return { header: header.trim(), path: rest.join(separator).trim() };
    })
    .filter(column => column.header);
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined') throw new Error('CSV export is only available in the browser.');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function trustLineBalance(value: unknown, absolute: boolean): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  return absolute ? String(Math.abs(number)) : String(number);
}

export async function executeQueryNode(
  type: string,
  rawConfig: Record<string, any>,
  prevOutput: any,
  network: NetworkType,
  liveClient: XRPL.Client,
  signal?: AbortSignal,
  nodeId?: string,
): Promise<QueryOutput> {
  const cfg = resolveWorkflowBindings(rawConfig, prevOutput) as Record<string, any>;

  if (type === 'AccountInfoQuery') {
    if (!cfg.Account) throw new Error('Account is required.');
    return request(network, liveClient, 'account_info', {
      account: String(cfg.Account),
      ledger_index: cfg.LedgerIndex || 'validated',
      signer_lists: Boolean(cfg.SignerLists),
      queue: Boolean(cfg.Queue),
    }, signal, { validatedOnly: true });
  }

  if (type === 'AccountLinesQuery') {
    if (!cfg.Account) throw new Error('Account is required.');
    return request(network, liveClient, 'account_lines', {
      account: String(cfg.Account),
      ledger_index: cfg.LedgerIndex || 'validated',
      peer: cfg.Peer || undefined,
      limit: asPositiveInt(cfg.Limit, 200, 400),
      marker: optionalMarker(cfg.Marker),
    }, signal, { preferClio: true, validatedOnly: true }, optionalMarker(cfg.MarkerEndpoint) ? String(cfg.MarkerEndpoint) : undefined);
  }

  if (type === 'AccountTxQuery') {
    if (!cfg.Account) throw new Error('Account is required.');
    const ledgerIndexMin = cfg.LedgerIndexMin === '' || cfg.LedgerIndexMin === undefined ? -1 : Number(cfg.LedgerIndexMin);
    const ledgerIndexMax = cfg.LedgerIndexMax === '' || cfg.LedgerIndexMax === undefined ? -1 : Number(cfg.LedgerIndexMax);
    return request(network, liveClient, 'account_tx', {
      account: String(cfg.Account),
      ledger_index_min: ledgerIndexMin,
      ledger_index_max: ledgerIndexMax,
      binary: false,
      forward: Boolean(cfg.Forward),
      limit: asPositiveInt(cfg.Limit, 50, 400),
      marker: optionalMarker(cfg.Marker),
    }, signal, { preferClio: true, validatedOnly: true }, optionalMarker(cfg.MarkerEndpoint) ? String(cfg.MarkerEndpoint) : undefined);
  }

  if (type === 'AccountObjectsQuery') {
    if (!cfg.Account) throw new Error('Account is required.');
    return request(network, liveClient, 'account_objects', {
      account: String(cfg.Account),
      ledger_index: cfg.LedgerIndex || 'validated',
      type: cfg.ObjectType || undefined,
      deletion_blockers_only: Boolean(cfg.DeletionBlockersOnly),
      limit: asPositiveInt(cfg.Limit, 100, 400),
      marker: optionalMarker(cfg.Marker),
    }, signal, { preferClio: true, validatedOnly: true }, optionalMarker(cfg.MarkerEndpoint) ? String(cfg.MarkerEndpoint) : undefined);
  }

  if (type === 'LedgerQuery') {
    return request(network, liveClient, 'ledger', {
      ledger_index: cfg.LedgerIndex || 'validated',
      transactions: Boolean(cfg.IncludeTransactions),
      accounts: Boolean(cfg.IncludeState),
      expand: Boolean(cfg.Expand),
    }, signal, { validatedOnly: cfg.LedgerIndex === 'validated' || !cfg.LedgerIndex });
  }

  if (type === 'TxQuery') {
    if (!cfg.TransactionHash) throw new Error('Transaction hash is required.');
    return request(network, liveClient, 'tx', {
      transaction: String(cfg.TransactionHash),
      binary: false,
    }, signal, { preferClio: true, validatedOnly: true });
  }

  if (type === 'NFTInfoQuery') {
    if (!cfg.NFTokenID) throw new Error('NFTokenID is required.');
    return request(network, liveClient, 'nft_info', {
      nft_id: String(cfg.NFTokenID),
      ledger_index: cfg.LedgerIndex || 'validated',
    }, signal, { clioOnly: true, validatedOnly: true });
  }

  if (type === 'NFTHistoryQuery') {
    if (!cfg.NFTokenID) throw new Error('NFTokenID is required.');
    return request(network, liveClient, 'nft_history', {
      nft_id: String(cfg.NFTokenID),
      ledger_index: cfg.LedgerIndex || 'validated',
      limit: asPositiveInt(cfg.Limit, 50, 400),
      marker: optionalMarker(cfg.Marker),
    }, signal, { clioOnly: true, validatedOnly: true }, optionalMarker(cfg.MarkerEndpoint) ? String(cfg.MarkerEndpoint) : undefined);
  }

  if (type === 'NFTsByIssuerQuery') {
    if (!cfg.Issuer) throw new Error('Issuer is required.');
    return request(network, liveClient, 'nfts_by_issuer', {
      issuer: String(cfg.Issuer),
      ledger_index: cfg.LedgerIndex || 'validated',
      limit: asPositiveInt(cfg.Limit, 100, 400),
      marker: optionalMarker(cfg.Marker),
    }, signal, { clioOnly: true, validatedOnly: true }, optionalMarker(cfg.MarkerEndpoint) ? String(cfg.MarkerEndpoint) : undefined);
  }

  if (type === 'RawLedgerQuery') {
    const payload = parseRawRequest(cfg.RequestJson);
    const command = String(payload.command || cfg.Command || '');
    if (!command) throw new Error('Raw request must include a command.');
    delete payload.command;
    const clioOnly = Boolean(cfg.ClioOnly);
    return request(network, liveClient, command, payload, signal, { clioOnly, preferClio: Boolean(cfg.PreferClio) || clioOnly });
  }

  if (type === 'PickOutput') {
    const path = String(cfg.Path || 'data');
    const data = selectOutputPath(prevOutput, path);
    const items = Array.isArray(data) ? data : data === undefined ? [] : [data];
    return { data, items, meta: { command: 'pick_output', count: items.length }, raw: prevOutput };
  }

  if (type === 'FilterItems') {
    const items = sourceItems(cfg, prevOutput).filter(item => matchesFilter(item, String(cfg.FieldPath || ''), String(cfg.Operator || 'exists'), cfg.Value));
    return { data: { items }, items, meta: { command: 'filter_items', count: items.length }, raw: prevOutput };
  }

  if (type === 'DedupeItems') {
    const fieldPath = String(cfg.FieldPath || '');
    const seen = new Set<string>();
    const items = sourceItems(cfg, prevOutput).filter(item => {
      const value = fieldPath ? selectOutputPath(item, fieldPath) : item;
      const key = typeof value === 'string' ? value : JSON.stringify(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { data: { items }, items, meta: { command: 'dedupe_items', count: items.length }, raw: prevOutput };
  }

  if (type === 'AccumulateItems') {
    const pagePath = String(cfg.PageItemsPath || 'items');
    const page = selectOutputPath(prevOutput, pagePath);
    const key = String(cfg.AccumulatorKey || nodeId || 'default');
    const existingItems = runtimeAccumulators.get(key) || [];
    const pageItems = Array.isArray(page) ? page : [];
    const items = [...existingItems, ...pageItems];
    runtimeAccumulators.set(key, items);
    const marker = selectOutputPath(prevOutput, String(cfg.MarkerPath || 'data.marker'));
    const markerEndpoint = selectOutputPath(prevOutput, String(cfg.MarkerEndpointPath || 'data.markerEndpoint'));
    return {
      data: {
        ...(prevOutput?.data && typeof prevOutput.data === 'object' ? prevOutput.data : {}),
        items,
        marker,
        markerEndpoint,
      },
      items,
      meta: {
        command: 'accumulate_items',
        count: items.length,
        marker,
        markerEndpoint: typeof markerEndpoint === 'string' ? markerEndpoint : undefined,
        note: `Added ${pageItems.length} item${pageItems.length === 1 ? '' : 's'} this page`,
      },
      raw: prevOutput,
    };
  }

  if (type === 'FormatTrustLines') {
    const items = sourceItems(cfg, prevOutput);
    const perspective = String(cfg.Perspective || 'issuer');
    const includeZero = Boolean(cfg.IncludeZeroBalances);
    const absolute = cfg.AbsoluteBalances !== false;
    const formatted = items
      .map((item: any) => ({
        holder: item?.account || item?.holder || '',
        counterparty: item?.account || '',
        balance: trustLineBalance(item?.balance, perspective === 'issuer' ? absolute : false),
        rawBalance: item?.balance ?? '',
        currency: item?.currency || '',
        limit: item?.limit || '',
        limitPeer: item?.limit_peer || '',
        noRipple: Boolean(item?.no_ripple),
        authorized: Boolean(item?.authorized),
        raw: item,
      }))
      .filter(item => includeZero || Number(item.balance) !== 0);
    return { data: { items: formatted }, items: formatted, meta: { command: 'format_trust_lines', count: formatted.length }, raw: prevOutput };
  }

  if (type === 'ExportCsv') {
    const items = sourceItems(cfg, prevOutput);
    const columns = parseColumns(cfg.Columns);
    const header = columns.map(column => escapeCsv(column.header)).join(',');
    const rows = items.map(item => columns.map(column => escapeCsv(column.path ? selectOutputPath(item, column.path) : item)).join(','));
    const csv = [header, ...rows].join('\n');
    if (cfg.Download !== false) downloadCsv(String(cfg.FileName || 'xrpl-flow-export'), csv);
    return {
      data: { csv, columns, filename: String(cfg.FileName || 'xrpl-flow-export.csv') },
      items,
      meta: { command: 'export_csv', count: items.length, note: `Prepared ${items.length} CSV row${items.length === 1 ? '' : 's'}` },
      raw: prevOutput,
    };
  }

  throw new Error(`Unsupported query node: ${type}`);
}

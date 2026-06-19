import * as XRPL from 'xrpl';
import { Node, Edge } from '@xyflow/react';
import { WalletInfo, LogEntry, NetworkType } from '@/store/workflowStore';
import { getNodeDef } from '@/lib/nodeRegistry';

export type ExecutionCallbacks = {
  setNodeStatus: (id: string, status: 'idle'|'running'|'success'|'failed', error?: string) => void;
  addLogEntry: (entry: Omit<LogEntry, 'id'|'timestamp'>) => void;
  getExplorerUrl: (hash: string) => string;
  network: NetworkType;
};

// ─────────────────────────────────────────────────────────────────────────────
// Abort helper
// ─────────────────────────────────────────────────────────────────────────────

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Workflow stopped by user.', 'AbortError');
  }
}

function isAbortError(err: any): boolean {
  return err?.name === 'AbortError';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-run field validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationError {
  nodeId:     string;
  nodeLabel:  string;
  fieldLabel: string;
}

/**
 * Validates that all required fields on every tx node are filled.
 * Account is excluded — it falls back to the active wallet when blank.
 * Returns an array of errors (empty = all good).
 */
export function validateWorkflow(nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (NON_TX_TYPES.has(node.type as string)) continue;
    const def = getNodeDef(node.type as string);
    if (!def) continue;

    const cfg   = getConfig(node);
    const label = getNodeLabel(node);

    for (const field of def.fields) {
      if (!field.required) continue;
      if (field.name === 'Account') continue; // fallback to active wallet

      const val = cfg[field.name];

      if (field.type === 'amount') {
        const filled =
          val?.type === 'xrp'   ? String(val.drops ?? '').trim() !== '' :
          val?.type === 'token' ? Boolean(val.currency && val.issuer && val.value) :
          typeof val === 'string' ? val.trim() !== '' : false;
        if (!filled) errors.push({ nodeId: node.id, nodeLabel: label, fieldLabel: field.label });
      } else {
        if (val === '' || val === null || val === undefined) {
          errors.push({ nodeId: node.id, nodeLabel: label, fieldLabel: field.label });
        }
      }
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error code → human explanation
// ─────────────────────────────────────────────────────────────────────────────

const TX_ERROR_HELP: Record<string, string> = {
  tefBAD_AUTH:
    'The signing key does not match the Account address. ' +
    'In a multi-wallet workflow each node\'s Account must match one of your imported wallets. ' +
    'Check that the Account field is filled with the correct address (or leave it blank to use the active wallet).',
  tefNO_AUTH_REQUIRED: 'Authorization is not required for this operation.',
  tefMASTER_DISABLED:  'The account\'s master key is disabled — use the regular key.',
  tefWRONG_PRIOR:      'AccountTxnID does not match the account\'s last transaction.',
  temBAD_AMOUNT:
    'Invalid Amount format. ' +
    'Use a drops string (e.g. "1000000") for XRP, or {"currency":"USD","issuer":"r...","value":"10"} for tokens.',
  temBAD_FEE:          'Invalid Fee value.',
  temBAD_SEQUENCE:     'Invalid Sequence number.',
  temBAD_AUTH_MASTER:  'Invalid use of the master key.',
  temBAD_CURRENCY:     'Malformed currency code.',
  temBAD_ISSUER:       'Malformed issuer address.',
  temDST_IS_SRC:       'Destination cannot be the same as the source account.',
  temINVALID_FLAG:     'Invalid Flags value for this transaction type.',
  temREDUNDANT:        'Transaction would make no change (e.g. TrustSet with existing limit).',
  terINSUF_FEE_B:      'Insufficient XRP to cover the fee. Fund the account first.',
  terNO_ACCOUNT:       'Account not found on ledger. Fund this address to activate it.',
  terPRE_SEQ:          'Sequence number is too high for the current account sequence.',
  tecUNFUNDED_PAYMENT: 'Insufficient balance to send this payment.',
  tecNO_DST:
    'Destination account does not exist. Send at least 10 XRP to activate it first.',
  tecNO_DST_INSUF_XRP:
    'Destination account does not exist and the amount is below the activation reserve.',
  tecNO_LINE_INSUF_RESERVE:
    'Insufficient XRP reserve to create a new trust line (~2 XRP required).',
  tecNO_LINE_NO_ZERO:  'Cannot delete a non-zero trust line.',
  tecNO_TRUST:         'No trust line from holder to issuer. Holder must run TrustSet first.',
  tecPATH_DRY:
    'Cross-currency path is completely dry. Verify trust lines exist and issuer has issued tokens.',
  tecPATH_PARTIAL:
    'Partial payment delivered — consider enabling tfPartialPayment flag or adjust SendMax/DeliverMin.',
  tecUNFUNDED_OFFER:   'Insufficient balance to fund this offer.',
  tecOWNER_COUNT:      'Account has too many objects — delete some to free reserve.',
};

/**
 * Returns a human-readable explanation for an XRPL engine_result code.
 * Falls back to the raw engine_result_message if no mapping exists.
 */
function humanizeError(
  engineResult: string,
  rawMessage: string,
  tx: Record<string, any>,
): string {
  const help = TX_ERROR_HELP[engineResult];
  const base = help
    ? `${engineResult}: ${help}`
    : `${engineResult}: ${rawMessage || 'Transaction rejected by the ledger.'}`;

  const extra: string[] = [];

  if (engineResult === 'tefBAD_AUTH' && tx.Account) {
    extra.push(`Transaction Account: ${tx.Account}`);
    extra.push('→ Make sure you have a wallet with that address imported, or clear the Account field to use the active wallet.');
  }

  return extra.length > 0 ? `${base}\n\n${extra.join('\n')}` : base;
}

/** Terminal engine_result codes that will never succeed — fail immediately. */
function isTerminalFailure(code: string): boolean {
  return /^(tef|tem|tel)/.test(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit with fail-fast + polling for validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replaces client.submitAndWait with a two-phase approach:
 *   Phase 1 — submit and get preliminary result fast (~500ms)
 *             throw immediately for terminal failures (tef/tem/tel)
 *   Phase 2 — poll for validated result (no more 20-second LLS wait on hard errors)
 */
async function submitWithFastFail(
  client: XRPL.Client,
  tx: Record<string, any>,
  wallet: XRPL.Wallet,
  onPrelim: (code: string, msg: string) => void,
  signal?: AbortSignal,
): Promise<any> {
  checkAbort(signal);

  // Phase 1: autofill + sign + submit
  const filled = await client.autofill(tx as any);
  const signed = wallet.sign(filled as any);

  checkAbort(signal);

  const submitRes = await client.request({
    command:  'submit',
    tx_blob:  signed.tx_blob,
  } as any);

  const prelim    = (submitRes.result as any)?.engine_result    as string ?? '';
  const prelimMsg = (submitRes.result as any)?.engine_result_message as string ?? '';

  onPrelim(prelim, prelimMsg);

  if (isTerminalFailure(prelim)) {
    throw new Error(humanizeError(prelim, prelimMsg, filled));
  }

  // Phase 2: poll for validated result
  const hash          = signed.hash;
  const lastLedgerSeq = (filled as any).LastLedgerSequence as number;

  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1_000);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Workflow stopped by user.', 'AbortError')); }, { once: true });
    });

    checkAbort(signal);

    try {
      const txRes = await client.request({ command: 'tx', transaction: hash } as any);
      const txData = (txRes.result as any);
      if (txData?.validated) return txData;
    } catch (e: any) {
      if (isAbortError(e)) throw e;
      // txnNotFound is normal while waiting
    }

    // Check if LastLedgerSequence has been exceeded
    try {
      const ledgerRes = await client.request({ command: 'ledger', ledger_index: 'validated' } as any);
      const currentLedger = Number((ledgerRes.result as any)?.ledger_index ?? 0);
      if (currentLedger > lastLedgerSeq) {
        throw new Error(
          `Transaction not included in ledger — LastLedgerSequence (${lastLedgerSeq}) exceeded ` +
          `(current validated ledger: ${currentLedger}). ` +
          'This usually means the network was congested or the Fee was too low. Try again.',
        );
      }
    } catch (e: any) {
      if (e.message?.includes('LastLedgerSequence') || isAbortError(e)) throw e;
    }
  }

  throw new Error('Transaction validation timeout after 80s.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch flags
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_MODE_FLAGS: Record<string, number> = {
  ALLORNOTHING: 0x00010000,
  ONLYONE:      0x00020000,
  UNTILFAILURE: 0x00040000,
  INDEPENDENT:  0x00080000,
};

const TF_INNER_BATCH_TXN = 0x40000000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NON_TX_TYPES = new Set([
  'ManualTrigger', 'AccountEventTrigger',
  'ConditionBranch', 'ParallelSplit', 'SyncJoin',
  'Loop', 'Delay', 'LogOutput', 'BatchContainer',
]);

function getNodeLabel(node: Node): string {
  return (node.data?.label as string) || (node.type as string) || node.id;
}

function getConfig(node: Node): Record<string, any> {
  return (node.data?.config as Record<string, any>) || {};
}

function buildGraph(nodes: Node[], edges: Edge[]) {
  const successors   = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const nodeMap      = new Map<string, Node>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
    successors.set(n.id, []);
    predecessors.set(n.id, []);
  }
  for (const e of edges) {
    successors.get(e.source)?.push(e.target);
    predecessors.get(e.target)?.push(e.source);
  }
  return { successors, predecessors, nodeMap };
}

function evalCondition(expr: string, output: any): boolean {
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function('output', `"use strict"; return (${expr});`)(output));
  } catch {
    return false;
  }
}

/** Build XRPL transaction object from a node's config */
function buildTx(
  node: Node,
  fallbackWallet: WalletInfo,
  innerBatch = false,
): Record<string, any> {
  const cfg     = getConfig(node);
  const type    = node.type as string;
  const nodeDef = getNodeDef(type);

  // Collect 'amount' field names so the main loop skips them (assembled below)
  const amountFieldNames = new Set(
    (nodeDef?.fields || []).filter(f => f.type === 'amount').map(f => f.name),
  );

  const tx: Record<string, any> = {
    TransactionType: type,
    Account: cfg.Account || fallbackWallet.address,
  };

  if (innerBatch) {
    tx.Flags        = TF_INNER_BATCH_TXN;
    tx.Fee          = '0';
    tx.Sequence     = 0;
    tx.SigningPubKey = '';
    tx.TxnSignature = null;
  }

  const skipKeys = new Set([
    'Account', 'LimitAmount_currency', 'LimitAmount_issuer', 'LimitAmount_value',
  ]);
  for (const [k, v] of Object.entries(cfg)) {
    if (skipKeys.has(k)) continue;
    if (amountFieldNames.has(k)) continue; // assembled separately below
    if (v === '' || v === null || v === undefined) continue;
    if (typeof v === 'boolean') continue; // boolean helpers handled via Flags bitmask
    if (innerBatch && (k === 'Fee' || k === 'Sequence')) continue;
    tx[k] = v;
  }

  // Assemble structured amount fields: { type:'xrp', drops:'...' } | { type:'token', currency, issuer, value }
  for (const fieldName of amountFieldNames) {
    const amtData = cfg[fieldName];
    if (!amtData) continue;
    if (typeof amtData === 'string') {
      // Backward-compat: plain drops string or raw JSON string
      if (amtData.trim()) tx[fieldName] = amtData;
    } else if (amtData?.type === 'xrp') {
      if (amtData.drops !== undefined && amtData.drops !== '') {
        tx[fieldName] = String(amtData.drops);
      }
    } else if (amtData?.type === 'token') {
      const { currency = '', issuer = '', value: amtVal = '' } = amtData;
      if (currency && issuer && amtVal) {
        tx[fieldName] = { currency, issuer, value: String(amtVal) };
      }
    }
  }

  // TrustSet: LimitAmount assembled from three flat sub-fields
  if (type === 'TrustSet') {
    tx.LimitAmount = {
      currency: cfg.LimitAmount_currency || '',
      issuer:   cfg.LimitAmount_issuer   || '',
      value:    cfg.LimitAmount_value    || '0',
    };
  }

  // JSON textarea fields
  for (const field of [
    'SignerEntries', 'AuthAccounts', 'NFTokenOffers',
    'PriceDataSeries', 'AcceptedCredentials', 'Memos', 'Signers', 'Paths',
  ]) {
    if (typeof cfg[field] === 'string' && cfg[field].trim()) {
      try { tx[field] = JSON.parse(cfg[field]); } catch { /* keep as string */ }
    }
  }

  return tx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet resolution: match cfg.Account to the right wallet from the list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the wallet that should sign a transaction.
 * 1. If cfg.Account is set and matches a wallet in the list → use that wallet.
 * 2. Otherwise → use the active wallet.
 * Returns { walletInfo, xrplWallet } or throws if no seed available.
 */
function resolveSigningWallet(
  cfgAccount: string | undefined,
  allWallets: WalletInfo[],
  activeWallet: WalletInfo,
): { walletInfo: WalletInfo; xrplWallet: XRPL.Wallet } {
  let walletInfo = activeWallet;

  if (cfgAccount) {
    const match = allWallets.find(w => w.address === cfgAccount);
    if (match) {
      walletInfo = match;
    }
    // If no match found, warn but fall back to active wallet.
    // The error will surface as tefBAD_AUTH with a clear message.
  }

  if (!walletInfo.seed) {
    throw new Error(
      `Wallet "${walletInfo.name}" (${walletInfo.address}) has no seed. ` +
      'Import the wallet with its seed/secret to sign transactions.',
    );
  }

  return { walletInfo, xrplWallet: XRPL.Wallet.fromSeed(walletInfo.seed) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Network gating pre-flight
// ─────────────────────────────────────────────────────────────────────────────

function preflightNetworkGating(nodes: Node[], network: NetworkType): void {
  if (network === 'devnet') return;
  const violations: string[] = [];
  for (const node of nodes) {
    const def = getNodeDef(node.type as string);
    if (def?.networkGating === 'devnet-only') violations.push(`"${def.label}"`);
  }
  if (violations.length > 0) {
    throw new Error(
      `Network mismatch: The following nodes require Devnet but you are on ${network}:\n` +
      violations.join(', ') +
      '\n\nSwitch to Devnet in the Network panel to use these nodes.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AccountEventTrigger: live WebSocket subscription
// ─────────────────────────────────────────────────────────────────────────────

async function subscribeAccountEvent(
  client: XRPL.Client,
  address: string,
  onTx: (tx: any) => void,
): Promise<() => void> {
  await client.request({ command: 'subscribe', accounts: [address] } as any);
  const handler = (event: any) => {
    if (
      event.type === 'transaction' &&
      (event.transaction?.Destination === address || event.transaction?.Account === address)
    ) onTx(event.transaction);
  };
  client.on('transaction', handler);
  return () => {
    client.off('transaction', handler);
    client.request({ command: 'unsubscribe', accounts: [address] } as any).catch(() => {});
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delay: WaitForLedger close via WebSocket
// ─────────────────────────────────────────────────────────────────────────────

function waitForNextLedger(client: XRPL.Client): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off('ledgerClosed', handler);
      client.request({ command: 'unsubscribe', streams: ['ledger'] } as any).catch(() => {});
      reject(new Error('WaitForLedger: no ledger closed within 30s'));
    }, 30_000);
    const handler = () => {
      clearTimeout(timeout);
      client.off('ledgerClosed', handler);
      client.request({ command: 'unsubscribe', streams: ['ledger'] } as any).catch(() => {});
      resolve();
    };
    client.request({ command: 'subscribe', streams: ['ledger'] } as any)
      .then(() => client.on('ledgerClosed', handler))
      .catch(reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BatchContainer
// ─────────────────────────────────────────────────────────────────────────────

async function executeBatch(
  batchNode: Node,
  allNodes: Node[],
  client: XRPL.Client,
  activeWallet: WalletInfo,
  allWallets: WalletInfo[],
  cbs: ExecutionCallbacks,
  signal?: AbortSignal,
): Promise<any> {
  checkAbort(signal);
  const label    = getNodeLabel(batchNode);
  const cfg      = getConfig(batchNode);
  const mode     = cfg.ExecutionMode || 'ALLORNOTHING';
  const modeFlag = BATCH_MODE_FLAGS[mode] ?? BATCH_MODE_FLAGS.ALLORNOTHING;

  const innerNodes = allNodes.filter(
    n => n.parentId === batchNode.id && !NON_TX_TYPES.has(n.type as string),
  );

  cbs.addLogEntry({
    nodeId: batchNode.id, nodeLabel: label,
    message: `Building Batch (${mode}) with ${innerNodes.length} inner txns...`,
    status: 'running',
  });

  if (innerNodes.length === 0) {
    throw new Error(
      'BatchContainer has no inner transaction nodes. ' +
      'Drop tx nodes inside the batch container group on the canvas.',
    );
  }
  if (innerNodes.length > 8) {
    throw new Error('BatchContainer supports at most 8 inner transactions.');
  }

  const rawTransactions = innerNodes.map(n => ({
    RawTransaction: buildTx(n, activeWallet, true),
  }));

  const { walletInfo, xrplWallet } = resolveSigningWallet(undefined, allWallets, activeWallet);

  const batchTx: any = {
    TransactionType: 'Batch',
    Account: walletInfo.address,
    RawTransactions: rawTransactions,
    Flags: modeFlag,
  };

  cbs.addLogEntry({
    nodeId: batchNode.id, nodeLabel: label,
    message: `Submitting Batch envelope to ${cbs.network}...`,
    status: 'running',
  });

  const result = await submitWithFastFail(client, batchTx, xrplWallet, (prelim, msg) => {
    cbs.addLogEntry({
      nodeId: batchNode.id, nodeLabel: label,
      message: `Prelim: ${prelim}${msg ? ` — ${msg}` : ''}`,
      status: /^tes/.test(prelim) ? 'success' : isTerminalFailure(prelim) ? 'failed' : 'running',
    });
  }, signal);

  const txResult = result?.meta?.TransactionResult || 'unknown';

  if (txResult !== 'tesSUCCESS') {
    throw new Error(`Batch failed: ${txResult}`);
  }

  cbs.addLogEntry({
    nodeId: batchNode.id, nodeLabel: label,
    message: `Batch succeeded (${txResult})`,
    txHash: result?.hash || '', status: 'success',
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single node executor
// ─────────────────────────────────────────────────────────────────────────────

async function executeNode(
  node: Node,
  prevOutput: any,
  allNodes: Node[],
  client: XRPL.Client,
  activeWallet: WalletInfo,
  allWallets: WalletInfo[],
  cbs: ExecutionCallbacks,
  innerNodeIds: Set<string>,
  nodeMap: Map<string, Node>,
  successors: Map<string, string[]>,
  signal?: AbortSignal,
): Promise<{ output: any; conditionResult?: boolean }> {
  checkAbort(signal);

  const type  = node.type as string;
  const label = getNodeLabel(node);
  const cfg   = getConfig(node);

  cbs.setNodeStatus(node.id, 'running');
  cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Running...', status: 'running' });

  try {
    // ── Triggers ─────────────────────────────────────────────────────────
    if (type === 'ManualTrigger') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Triggered', status: 'success' });
      return { output: prevOutput || {} };
    }

    if (type === 'AccountEventTrigger') {
      const watchAddr = cfg.WatchAddress;
      if (!watchAddr) throw new Error('WatchAddress is required for AccountEventTrigger');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Subscribing to ${watchAddr}...`, status: 'running' });
      const output = await new Promise<any>((resolve, reject) => {
        let cleanup: (() => void) | undefined;
        const timeout = setTimeout(() => {
          if (cleanup) cleanup();
          reject(new Error('AccountEventTrigger: no transaction received within 60s'));
        }, 60_000);
        signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          if (cleanup) cleanup();
          reject(new DOMException('Workflow stopped by user.', 'AbortError'));
        }, { once: true });
        subscribeAccountEvent(client, watchAddr, (tx) => {
          clearTimeout(timeout);
          if (cleanup) cleanup();
          resolve(tx);
        }).then(fn => { cleanup = fn; }).catch(reject);
      });
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Received tx: ${output.hash || ''}`, status: 'success' });
      return { output };
    }

    // ── Control flow ──────────────────────────────────────────────────────
    if (type === 'ConditionBranch') {
      const expr   = cfg.Expression || 'false';
      const result = evalCondition(expr, prevOutput);
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Condition → ${result}`, status: 'success' });
      return { output: prevOutput, conditionResult: result };
    }

    if (type === 'ParallelSplit' || type === 'SyncJoin') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({
        nodeId: node.id, nodeLabel: label,
        message: type === 'ParallelSplit' ? 'Fan-out' : 'Join complete',
        status: 'success',
      });
      return { output: prevOutput };
    }

    if (type === 'Delay') {
      const delayMode = cfg.DelayMode || (cfg.WaitForLedger ? 'ledger-close' : 'ms');
      if (delayMode === 'ledger-close') {
        cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Waiting for next ledger close...', status: 'running' });
        await waitForNextLedger(client);
        cbs.setNodeStatus(node.id, 'success');
        cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Ledger closed', status: 'success' });
      } else {
        const ms = Number(cfg.Duration) || 1000;
        cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Waiting ${ms}ms...`, status: 'running' });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, ms);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Workflow stopped by user.', 'AbortError'));
          }, { once: true });
        });
        cbs.setNodeStatus(node.id, 'success');
        cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Delayed ${ms}ms`, status: 'success' });
      }
      return { output: prevOutput };
    }

    if (type === 'Loop') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Loop started', status: 'success' });
      return { output: prevOutput };
    }

    if (type === 'LogOutput') {
      const msg = cfg.Message
        ? cfg.Message
        : (typeof prevOutput === 'object' ? JSON.stringify(prevOutput, null, 2) : String(prevOutput));
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: msg, status: 'success' });
      return { output: prevOutput };
    }

    // ── BatchContainer ─────────────────────────────────────────────────────
    if (type === 'BatchContainer') {
      cbs.setNodeStatus(node.id, 'running');
      const childNodes = allNodes.filter(
        n => n.parentId === node.id && !NON_TX_TYPES.has(n.type as string),
      );
      for (const cn of childNodes) innerNodeIds.add(cn.id);

      const batchOutput = await executeBatch(
        node, allNodes, client, activeWallet, allWallets, cbs, signal,
      );

      for (const cn of childNodes) {
        cbs.setNodeStatus(cn.id, 'success');
        cbs.addLogEntry({ nodeId: cn.id, nodeLabel: getNodeLabel(cn), message: 'Included in Batch', status: 'success' });
      }
      cbs.setNodeStatus(node.id, 'success');
      return { output: batchOutput };
    }

    // ── Transaction node ──────────────────────────────────────────────────
    // Resolve the signing wallet: match cfg.Account to an imported wallet
    const { walletInfo, xrplWallet } = resolveSigningWallet(cfg.Account, allWallets, activeWallet);

    const tx = buildTx(node, walletInfo, false);

    // Log which wallet is signing (helpful for multi-wallet debugging)
    const signerNote = walletInfo.address !== activeWallet.address
      ? ` (signing as ${walletInfo.name}: ${walletInfo.address.slice(0, 8)}…)`
      : '';

    cbs.addLogEntry({
      nodeId: node.id, nodeLabel: label,
      message: `Submitting ${type}${signerNote}…`,
      status: 'running',
    });

    const result = await submitWithFastFail(client, tx, xrplWallet, (prelim, msg) => {
      // Show the preliminary engine result immediately in the log
      const prelimStatus = /^tes/.test(prelim) ? 'success'
        : isTerminalFailure(prelim)             ? 'failed'
        : 'running';

      cbs.addLogEntry({
        nodeId: node.id, nodeLabel: label,
        message: `Prelim: ${prelim}${msg ? ` — ${msg}` : ''}`,
        status: prelimStatus,
      });
    }, signal);

    const hash     = result?.hash || '';
    const txResult = result?.meta?.TransactionResult || 'unknown';

    if (txResult === 'tesSUCCESS') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({
        nodeId: node.id, nodeLabel: label,
        message: `✓ ${type} succeeded (${txResult})`,
        txHash: hash, status: 'success',
      });
    } else {
      throw new Error(
        TX_ERROR_HELP[txResult]
          ? `${txResult}: ${TX_ERROR_HELP[txResult]}`
          : `Transaction failed: ${txResult}`,
      );
    }

    return { output: result };
  } catch (err: any) {
    if (isAbortError(err)) throw err; // propagate cleanly — don't mark node as failed
    const msg = err?.message || String(err);
    cbs.setNodeStatus(node.id, 'failed', msg);
    cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `✗ ${msg}`, status: 'failed' });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main workflow runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runWorkflow(
  nodes: Node[],
  edges: Edge[],
  client: XRPL.Client,
  activeWalletInfo: WalletInfo,
  walletSeed: string,           // kept for backward compat — resolved via allWallets now
  cbs: ExecutionCallbacks,
  allWallets: WalletInfo[] = [],
  signal?: AbortSignal,
): Promise<void> {
  checkAbort(signal);
  preflightNetworkGating(nodes, cbs.network);

  // Ensure allWallets contains at least the active wallet
  const walletList = allWallets.length > 0
    ? allWallets
    : [activeWalletInfo];

  const { successors, predecessors, nodeMap } = buildGraph(nodes, edges);

  const triggerTypes = new Set(['ManualTrigger', 'AccountEventTrigger']);
  const triggerNodes = nodes.filter(n => triggerTypes.has(n.type as string));

  if (triggerNodes.length === 0) {
    throw new Error(
      'No trigger node found. Add a Manual Trigger or Account Event trigger to start the workflow.',
    );
  }

  // Group-child nodes are skipped during normal graph traversal
  const innerBatchIds = new Set<string>(
    nodes.filter(n => n.parentId !== undefined).map(n => n.id),
  );

  const inFlight   = new Map<string, Promise<any>>();
  // SyncJoin: count how many predecessors have arrived at each join node
  const sjArrivals = new Map<string, number>();
  // SyncJoin: deferred resolvers for early-arriving predecessors
  const sjWaiters  = new Map<string, Array<{ resolve: (v: any) => void; reject: (e: any) => void }>>();

  async function runNode(nodeId: string, input: any): Promise<any> {
    checkAbort(signal);
    if (innerBatchIds.has(nodeId)) return input;

    const node = nodeMap.get(nodeId);
    if (!node) return input;

    // ── SyncJoin: arrival-counting to avoid circular inFlight dependency ──
    if ((node.type as string) === 'SyncJoin') {
      const predCount = (predecessors.get(nodeId) || []).length;
      const arrivals  = (sjArrivals.get(nodeId) || 0) + 1;
      sjArrivals.set(nodeId, arrivals);

      if (arrivals < predCount) {
        // Not the last predecessor to arrive — park and wait
        return new Promise<any>((resolve, reject) => {
          const list = sjWaiters.get(nodeId) || [];
          list.push({ resolve, reject });
          sjWaiters.set(nodeId, list);
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Workflow stopped by user.', 'AbortError'));
          }, { once: true });
        });
      }

      // Last predecessor arrived — execute SyncJoin then run successors
      const succs = successors.get(nodeId) || [];
      try {
        const { output } = await executeNode(
          node, input, nodes, client, activeWalletInfo, walletList, cbs,
          innerBatchIds, nodeMap, successors, signal,
        );
        const result = await Promise.all(succs.map(sid => runNode(sid, output)));
        // Unblock all parked callers
        for (const w of (sjWaiters.get(nodeId) || [])) w.resolve(result);
        return result;
      } catch (e) {
        for (const w of (sjWaiters.get(nodeId) || [])) w.reject(e);
        throw e;
      }
    }

    // ── Normal cached execution for all other nodes ──
    if (inFlight.has(nodeId)) return inFlight.get(nodeId);

    const promise = executeNode(
      node, input, nodes, client, activeWalletInfo, walletList, cbs,
      innerBatchIds, nodeMap, successors, signal,
    ).then(({ output, conditionResult }) => {
      const succs = successors.get(nodeId) || [];

      if ((node.type as string) === 'ConditionBranch') {
        const trueEdges  = edges.filter(e => e.source === nodeId && (e.sourceHandle === 'true' || !e.sourceHandle));
        const falseEdges = edges.filter(e => e.source === nodeId && e.sourceHandle === 'false');
        const nextEdges  = conditionResult ? trueEdges : falseEdges;
        return Promise.all(nextEdges.map(e => runNode(e.target, output)));
      }

      if ((node.type as string) === 'ParallelSplit') {
        return Promise.all(succs.map(sid => runNode(sid, output)));
      }

      if ((node.type as string) === 'Loop') {
        const loopMode = getConfig(node).LoopMode || 'count';
        const maxIter  = Number(getConfig(node).Iterations) || 1;
        const delay    = Number(getConfig(node).DelayBetween) || 0;
        const condExpr = getConfig(node).Condition || '';

        const run = async () => {
          let iter = 0;
          const MAX_SAFETY = 100;
          let loopOutput = output;
          while (true) {
            if (loopMode === 'count' && iter >= maxIter) break;
            if (loopMode === 'until-condition' && condExpr && evalCondition(condExpr, loopOutput)) break;
            if (iter >= MAX_SAFETY) break;
            if (iter > 0 && delay > 0) await new Promise(r => setTimeout(r, delay));
            for (const sid of succs) inFlight.delete(sid);
            const results = await Promise.all(succs.map(sid => runNode(sid, loopOutput)));
            loopOutput = results[0] ?? loopOutput;
            iter++;
          }
        };
        return run();
      }

      if ((node.type as string) === 'BatchContainer') {
        const afterBatch = succs.filter(sid => !innerBatchIds.has(sid));
        return afterBatch.reduce(
          (chain, sid) => chain.then(() => runNode(sid, output)),
          Promise.resolve() as Promise<any>,
        );
      }

      // Default: sequential
      return succs.reduce(
        (chain, sid) => chain.then(() => runNode(sid, output)),
        Promise.resolve() as Promise<any>,
      );
    });

    inFlight.set(nodeId, promise);
    return promise;
  }

  await Promise.all(triggerNodes.map(t => runNode(t.id, {})));
}

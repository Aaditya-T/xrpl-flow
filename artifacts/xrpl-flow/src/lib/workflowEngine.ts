import * as XRPL from 'xrpl';
import { Node, Edge } from '@xyflow/react';
import { WalletInfo, LogEntry, NetworkType } from '@/store/workflowStore';
import { getNodeDef } from '@/lib/nodeRegistry';
import { buildValidatedTransaction, getTransactionAdapter } from '@/lib/transactionAdapters';
import { evaluateSafeExpression } from '@/lib/safeExpression';

export type ExecutionCallbacks = {
  setNodeStatus: (id: string, status: 'idle'|'running'|'success'|'failed', error?: string) => void;
  addLogEntry: (entry: Omit<LogEntry, 'id'|'timestamp'>) => void;
  getExplorerUrl: (hash: string) => string;
  network: NetworkType;
  reviewTransaction?: (transaction: Record<string, unknown>, simulation: unknown, signerAddresses: string[], nodeId: string, nodeLabel: string) => Promise<boolean>;
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
  const triggerTypes = new Set(['ManualTrigger', 'AccountEventTrigger']);
  const triggers = nodes.filter(node => triggerTypes.has(node.type as string));
  if (triggers.length !== 1) {
    errors.push({ nodeId: '', nodeLabel: 'Workflow', fieldLabel: `Exactly one trigger is required (found ${triggers.length})` });
  }

  for (const node of nodes) {
    if (NON_TX_TYPES.has(node.type as string)) continue;
    const def = getNodeDef(node.type as string);
    if (!def) {
      errors.push({ nodeId: node.id, nodeLabel: getNodeLabel(node), fieldLabel: `Unsupported node type: ${String(node.type)}` });
      continue;
    }

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
    const adapter = getTransactionAdapter(node.type as string);
    if (adapter) {
      for (const message of adapter.validate(cfg, 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')) {
        if (!errors.some(error => error.nodeId === node.id && message.includes(error.fieldLabel))) {
          errors.push({ nodeId: node.id, nodeLabel: label, fieldLabel: message });
        }
      }
    }
  }

  return errors;
}

export function validateWorkflowStructure(nodes: Node[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const triggerTypes = new Set(['ManualTrigger', 'AccountEventTrigger']);
  const triggers = nodes.filter(node => triggerTypes.has(node.type as string));
  if (triggers.length !== 1) errors.push({ nodeId: '', nodeLabel: 'Workflow', fieldLabel: `Exactly one trigger is required (found ${triggers.length})` });
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const edgeKeys = new Set<string>();
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      errors.push({ nodeId: edge.source, nodeLabel: 'Workflow', fieldLabel: `Edge ${edge.id} references a missing node` });
      continue;
    }
    const key = `${edge.source}:${edge.sourceHandle || ''}:${edge.target}`;
    if (edgeKeys.has(key)) errors.push({ nodeId: edge.source, nodeLabel: getNodeLabel(nodeMap.get(edge.source)!), fieldLabel: 'Duplicate edge' });
    edgeKeys.add(key);
    const source = nodeMap.get(edge.source)!;
    const target = nodeMap.get(edge.target)!;
    if (source.parentId || target.parentId) {
      errors.push({ nodeId: edge.source, nodeLabel: getNodeLabel(source), fieldLabel: 'Container child nodes cannot have outer graph edges' });
    }
    if (target.type === 'ManualTrigger' || target.type === 'AccountEventTrigger') {
      errors.push({ nodeId: edge.target, nodeLabel: getNodeLabel(target), fieldLabel: 'Trigger nodes cannot have incoming edges' });
    }
    if (source.type === 'ConditionBranch') {
      if (edge.sourceHandle !== 'true' && edge.sourceHandle !== 'false') errors.push({ nodeId: source.id, nodeLabel: getNodeLabel(source), fieldLabel: 'Condition edges must use the true or false handle' });
    } else if (edge.sourceHandle) {
      errors.push({ nodeId: source.id, nodeLabel: getNodeLabel(source), fieldLabel: `Unexpected source handle: ${edge.sourceHandle}` });
    }
    if (edge.targetHandle) errors.push({ nodeId: target.id, nodeLabel: getNodeLabel(target), fieldLabel: `Unexpected target handle: ${edge.targetHandle}` });
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);
  }
  for (const node of nodes.filter(item => !item.parentId)) {
    const count = (outgoing.get(node.id) || []).length;
    if (count > 1 && node.type !== 'ConditionBranch' && node.type !== 'ParallelSplit') {
      errors.push({ nodeId: node.id, nodeLabel: getNodeLabel(node), fieldLabel: 'Only branch nodes may have multiple outgoing edges' });
    }
    if (node.type === 'ParallelSplit' && count < 2) errors.push({ nodeId: node.id, nodeLabel: getNodeLabel(node), fieldLabel: 'Parallel Split requires at least two outgoing branches' });
    if (node.type === 'ConditionBranch') {
      const handles = (outgoing.get(node.id) || []).map(edge => edge.sourceHandle);
      if (handles.filter(handle => handle === 'true').length > 1 || handles.filter(handle => handle === 'false').length > 1) {
        errors.push({ nodeId: node.id, nodeLabel: getNodeLabel(node), fieldLabel: 'Condition Branch allows at most one edge per handle' });
      }
    }
  }

  const trigger = nodes.find(node => node.type === 'ManualTrigger' || node.type === 'AccountEventTrigger');
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) {
      errors.push({ nodeId: id, nodeLabel: getNodeLabel(nodeMap.get(id)!), fieldLabel: 'Cycles are not allowed; use a Loop Container' });
      return;
    }
    if (visited.has(id)) return;
    visited.add(id); active.add(id);
    for (const edge of outgoing.get(id) || []) visit(edge.target);
    active.delete(id);
  };
  if (trigger) visit(trigger.id);
  for (const node of nodes.filter(item => !item.parentId)) {
    if (trigger && !visited.has(node.id)) errors.push({ nodeId: node.id, nodeLabel: getNodeLabel(node), fieldLabel: 'Node is unreachable from the trigger' });
  }
  return errors;
}

export function validateWorkflowGraph(nodes: Node[], edges: Edge[]): ValidationError[] {
  const all = [...validateWorkflow(nodes), ...validateWorkflowStructure(nodes, edges)];
  const seen = new Set<string>();
  return all.filter(error => {
    const key = `${error.nodeId}:${error.fieldLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  wallet: XRPL.Wallet | XRPL.Wallet[],
  onPrelim: (code: string, msg: string) => void,
  signal?: AbortSignal,
  review?: { callback: NonNullable<ExecutionCallbacks['reviewTransaction']>; signerAddresses: string[]; nodeId: string; nodeLabel: string },
  counterpartyWallet?: XRPL.Wallet,
  batchWallets?: Map<string, XRPL.Wallet>,
): Promise<any> {
  checkAbort(signal);

  // Phase 1: autofill + sign + submit
  let filled = await client.autofill(tx as any);
  if (filled.TransactionType === 'Batch' && batchWallets && batchWallets.size > 0) {
    const partials: XRPL.Batch[] = [];
    for (const [account, batchWallet] of batchWallets) {
      const partial = structuredClone(filled) as XRPL.Batch;
      XRPL.signMultiBatch(batchWallet, partial, { batchAccount: account });
      partials.push(partial);
    }
    filled = XRPL.decode(XRPL.combineBatchSigners(partials)) as typeof filled;
  }
  XRPL.validate(filled as Record<string, unknown>);
  if (review) {
    let simulation: unknown;
    try { simulation = (await client.simulate(filled as XRPL.SubmittableTransaction)).result; } catch { simulation = undefined; }
    const snapshot = JSON.stringify(filled);
    const approved = await review.callback(filled as Record<string, unknown>, simulation, review.signerAddresses, review.nodeId, review.nodeLabel);
    if (!approved) throw new DOMException('Transaction review cancelled.', 'AbortError');
    if (snapshot !== JSON.stringify(filled)) throw new Error('Transaction changed after review; refusing to sign.');
  }
  let signed: { tx_blob: string; hash: string };
  if (Array.isArray(wallet)) {
    if (wallet.length === 0) throw new Error('Select at least one local multisigner.');
    const accountInfo = await client.request({ command: 'account_info', account: String(filled.Account), signer_lists: true, ledger_index: 'validated' } as any);
    const signerList = (accountInfo.result as any)?.account_data?.signer_lists?.[0] || (accountInfo.result as any)?.signer_lists?.[0];
    if (!signerList) throw new Error(`Account ${String(filled.Account)} has no signer list.`);
    const entries = signerList.SignerEntries || [];
    const selected = new Set(wallet.map(item => item.address));
    const weight = entries.reduce((sum: number, entry: any) => selected.has(entry.SignerEntry?.Account) ? sum + Number(entry.SignerEntry.SignerWeight || 0) : sum, 0);
    if (weight < Number(signerList.SignerQuorum)) throw new Error(`Selected signer weight ${weight} does not meet quorum ${signerList.SignerQuorum}.`);
    const blobs = wallet.map(item => item.sign({ ...filled, SigningPubKey: '' } as any, true).tx_blob);
    const txBlob = XRPL.multisign(blobs);
    signed = { tx_blob: txBlob, hash: XRPL.hashes.hashSignedTx(txBlob) };
  } else {
    signed = wallet.sign(filled as any);
  }
  if (filled.TransactionType === 'LoanSet') {
    if (!counterpartyWallet) throw new Error('LoanSet requires a selected local counterparty wallet.');
    signed = XRPL.signLoanSetByCounterparty(counterpartyWallet, signed.tx_blob);
  }

  checkAbort(signal);

  const submitRes = await client.request({
    command:  'submit',
    tx_blob: signed.tx_blob,
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NON_TX_TYPES = new Set([
  'ManualTrigger', 'AccountEventTrigger',
  'ConditionBranch', 'ParallelSplit', 'SyncJoin',
  'LoopContainer', 'Delay', 'LogOutput', 'BatchContainer',
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
  return evaluateSafeExpression(expr, output);
}

/** Build XRPL transaction object from a node's config */
function buildTx(
  node: Node,
  fallbackWallet: WalletInfo,
  innerBatch = false,
): Record<string, any> {
  return buildValidatedTransaction(node.type as string, getConfig(node), fallbackWallet.address, innerBatch) as Record<string, any>;
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
    if (!match) throw new Error(`No local signer is available for transaction account ${cfgAccount}. Import that account before running.`);
    walletInfo = match;
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

async function preflightNetworkGating(nodes: Node[], network: NetworkType, client: XRPL.Client): Promise<void> {
  const gatedNodes = nodes.filter(node => getNodeDef(node.type as string)?.networkGating === 'devnet-only');
  if (network === 'devnet') {
    if (gatedNodes.length === 0) return;
    const required = new Set<string>();
    for (const node of gatedNodes) {
      const type = String(node.type);
      if (type === 'BatchContainer') required.add('Batch');
      else if (type.startsWith('Vault')) required.add('SingleAssetVault');
      else if (type.startsWith('Loan')) required.add('LendingProtocol');
    }
    let result: any;
    try {
      result = (await client.request({ command: 'feature' } as any)).result;
    } catch (error) {
      throw new Error(`Could not verify required Devnet amendments: ${error instanceof Error ? error.message : String(error)}`);
    }
    const features = Object.values(result?.features || result || {}) as Array<any>;
    const enabledNames = new Set(features.filter(feature => feature && typeof feature === 'object' && feature.enabled !== false).map(feature => feature.name));
    const missing = [...required].filter(name => !enabledNames.has(name));
    if (missing.length) throw new Error(`Connected Devnet server does not report required amendment(s): ${missing.join(', ')}.`);
    return;
  }
  const violations: string[] = [];
  for (const node of gatedNodes) {
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

  if (innerNodes.length < 2) {
    throw new Error(
      'BatchContainer requires at least 2 inner transaction nodes. ' +
      'Drop 2–8 transaction nodes inside the group.',
    );
  }
  if (innerNodes.length > 8) {
    throw new Error('BatchContainer supports at most 8 inner transactions.');
  }

  const rawTransactions = innerNodes.map(n => ({
    RawTransaction: buildTx(n, activeWallet, true),
  }));

  const { walletInfo, xrplWallet } = resolveSigningWallet(undefined, allWallets, activeWallet);
  const involvedAccounts = new Set(rawTransactions.map(item => String(item.RawTransaction.Account)));
  involvedAccounts.delete(walletInfo.address);
  const batchWallets = new Map<string, XRPL.Wallet>();
  for (const account of involvedAccounts) {
    const info = allWallets.find(item => item.address === account);
    if (!info?.seed) throw new Error(`Batch account ${account} requires an imported local signing wallet.`);
    batchWallets.set(account, XRPL.Wallet.fromSeed(info.seed));
  }

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
  }, signal, cbs.network === 'mainnet' && cbs.reviewTransaction ? {
    callback: cbs.reviewTransaction, signerAddresses: [walletInfo.address, ...batchWallets.keys()], nodeId: batchNode.id, nodeLabel: label,
  } : undefined, undefined, batchWallets);

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
      if (!XRPL.isValidClassicAddress(String(watchAddr))) throw new Error('WatchAddress must be a valid classic XRPL address.');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Subscribing to ${watchAddr}...`, status: 'running' });
      const output = await new Promise<any>((resolve, reject) => {
        let cleanup: (() => void) | undefined;
        let settled = false;
        const timeoutMs = Math.min(Math.max(Number(cfg.TimeoutSeconds || 60), 1), 3600) * 1000;
        const timeout = setTimeout(() => {
          settled = true;
          if (cleanup) cleanup();
          reject(new Error(`AccountEventTrigger: no matching transaction received within ${timeoutMs / 1000}s`));
        }, timeoutMs);
        signal?.addEventListener('abort', () => {
          settled = true;
          clearTimeout(timeout);
          if (cleanup) cleanup();
          reject(new DOMException('Workflow stopped by user.', 'AbortError'));
        }, { once: true });
        subscribeAccountEvent(client, watchAddr, (tx) => {
          if (cfg.EventType && tx.TransactionType !== cfg.EventType) return;
          settled = true;
          clearTimeout(timeout);
          if (cleanup) cleanup();
          resolve(tx);
        }).then(fn => { cleanup = fn; if (settled) fn(); }).catch(reject);
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

    if (type === 'LoopContainer') {
      const children = allNodes
        .filter(child => child.parentId === node.id)
        .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
      if (children.length === 0) throw new Error('Loop Container requires at least one contained node.');
      const mode = String(cfg.LoopMode || 'count');
      const requested = Number(cfg.Iterations || 1);
      const maximum = Math.min(Math.max(requested, 1), 100);
      if (!Number.isInteger(requested) || requested < 1 || requested > 100) throw new Error('Loop iterations must be an integer from 1 to 100.');
      let output = prevOutput;
      let iteration = 0;
      do {
        checkAbort(signal);
        for (const child of children) {
          const result = await executeNode(child, output, allNodes, client, activeWallet, allWallets, cbs, innerNodeIds, nodeMap, successors, signal);
          output = result.output;
        }
        iteration += 1;
        if (mode === 'until-condition' && cfg.Condition && evalCondition(String(cfg.Condition), output)) break;
        if (iteration < maximum && Number(cfg.DelayBetween) > 0) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, Number(cfg.DelayBetween));
            signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Workflow stopped by user.', 'AbortError')); }, { once: true });
          });
        }
      } while (iteration < maximum);
      if (mode === 'until-condition' && (!cfg.Condition || !evalCondition(String(cfg.Condition), output))) {
        throw new Error(`Loop stop condition was not met after ${maximum} iterations.`);
      }
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Completed ${iteration} iteration${iteration === 1 ? '' : 's'}`, status: 'success' });
      return { output };
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
    const signingConfig = (node.data?.signing as { mode?: 'single' | 'multi'; signerWalletIds?: string[]; counterpartyWalletId?: string } | undefined);
    const isMultisign = signingConfig?.mode === 'multi';
    const { walletInfo, xrplWallet } = resolveSigningWallet(isMultisign ? undefined : cfg.Account, allWallets, activeWallet);
    const selectedWallets = isMultisign
      ? (signingConfig?.signerWalletIds || []).map(id => allWallets.find(item => item.id === id)).filter((item): item is WalletInfo => Boolean(item))
      : [];
    if (isMultisign && selectedWallets.some(item => !item.seed)) throw new Error('Every selected multisigner must have a local seed.');
    const signingWallets = isMultisign
      ? selectedWallets.map(item => XRPL.Wallet.fromSeed(item.seed!))
      : xrplWallet;
    const counterpartyInfo = signingConfig?.counterpartyWalletId ? allWallets.find(item => item.id === signingConfig.counterpartyWalletId) : undefined;
    const counterpartyWallet = counterpartyInfo?.seed ? XRPL.Wallet.fromSeed(counterpartyInfo.seed) : undefined;

    const tx = buildTx(node, walletInfo, false);

    // Log which wallet is signing (helpful for multi-wallet debugging)
    const signerNote = isMultisign
      ? ` (${selectedWallets.length} local multisigners)`
      : walletInfo.address !== activeWallet.address
      ? ` (signing as ${walletInfo.name}: ${walletInfo.address.slice(0, 8)}…)`
      : '';

    cbs.addLogEntry({
      nodeId: node.id, nodeLabel: label,
      message: `Submitting ${type}${signerNote}…`,
      status: 'running',
    });

    const result = await submitWithFastFail(client, tx, signingWallets, (prelim, msg) => {
      // Show the preliminary engine result immediately in the log
      const prelimStatus = /^tes/.test(prelim) ? 'success'
        : isTerminalFailure(prelim)             ? 'failed'
        : 'running';

      cbs.addLogEntry({
        nodeId: node.id, nodeLabel: label,
        message: `Prelim: ${prelim}${msg ? ` — ${msg}` : ''}`,
        status: prelimStatus,
      });
    }, signal, cbs.network === 'mainnet' && cbs.reviewTransaction ? {
      callback: cbs.reviewTransaction, signerAddresses: isMultisign ? selectedWallets.map(item => item.address) : [walletInfo.address], nodeId: node.id, nodeLabel: label,
    } : undefined, counterpartyWallet);

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
  const validationErrors = validateWorkflowGraph(nodes, edges);
  if (validationErrors.length) {
    throw new Error(`Workflow validation failed: ${validationErrors.map(error => `${error.nodeLabel} — ${error.fieldLabel}`).join('; ')}`);
  }
  await preflightNetworkGating(nodes, cbs.network, client);

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

  type RuntimeToken = { tokenId: string; branchId: string; splitId?: string };
  const inFlight = new Map<string, Promise<any>>();
  const sjArrivals = new Map<string, Set<string>>();
  const sjWaiters = new Map<string, Array<{ resolve: (v: any) => void; reject: (e: any) => void }>>();

  async function runNode(nodeId: string, input: any, token: RuntimeToken): Promise<any> {
    checkAbort(signal);
    if (innerBatchIds.has(nodeId)) return input;

    const node = nodeMap.get(nodeId);
    if (!node) return input;

    // ── SyncJoin: arrival-counting to avoid circular inFlight dependency ──
    if ((node.type as string) === 'SyncJoin') {
      const joinKey = `${token.splitId || token.tokenId}:${nodeId}`;
      const expected = token.splitId ? (successors.get(token.splitId) || []).length : 1;
      const arrivals = sjArrivals.get(joinKey) || new Set<string>();
      arrivals.add(token.branchId);
      sjArrivals.set(joinKey, arrivals);

      if (arrivals.size < expected) {
        // Not the last predecessor to arrive — park and wait
        return new Promise<any>((resolve, reject) => {
          const list = sjWaiters.get(joinKey) || [];
          list.push({ resolve, reject });
          sjWaiters.set(joinKey, list);
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
        const mergedToken = { tokenId: crypto.randomUUID(), branchId: 'merged' };
        const result = await Promise.all(succs.map(sid => runNode(sid, output, mergedToken)));
        // Unblock all parked callers
        for (const w of (sjWaiters.get(joinKey) || [])) w.resolve(result);
        return result;
      } catch (e) {
        for (const w of (sjWaiters.get(joinKey) || [])) w.reject(e);
        throw e;
      }
    }

    // ── Normal cached execution for all other nodes ──
    const flightKey = `${token.tokenId}:${nodeId}`;
    if (inFlight.has(flightKey)) return inFlight.get(flightKey);

    const promise = executeNode(
      node, input, nodes, client, activeWalletInfo, walletList, cbs,
      innerBatchIds, nodeMap, successors, signal,
    ).then(({ output, conditionResult }) => {
      const succs = successors.get(nodeId) || [];

      if ((node.type as string) === 'ConditionBranch') {
        const trueEdges  = edges.filter(e => e.source === nodeId && (e.sourceHandle === 'true' || !e.sourceHandle));
        const falseEdges = edges.filter(e => e.source === nodeId && e.sourceHandle === 'false');
        const nextEdges  = conditionResult ? trueEdges : falseEdges;
        return Promise.all(nextEdges.map(e => runNode(e.target, output, token)));
      }

      if ((node.type as string) === 'ParallelSplit') {
        return Promise.all(succs.map((sid, index) => runNode(sid, output, {
          tokenId: crypto.randomUUID(), branchId: `${nodeId}:${index}`, splitId: nodeId,
        })));
      }

      if ((node.type as string) === 'BatchContainer') {
        const afterBatch = succs.filter(sid => !innerBatchIds.has(sid));
        return afterBatch.reduce(
          (chain, sid) => chain.then(() => runNode(sid, output, token)),
          Promise.resolve() as Promise<any>,
        );
      }

      // Default: sequential
      return succs.reduce(
        (chain, sid) => chain.then(() => runNode(sid, output, token)),
        Promise.resolve() as Promise<any>,
      );
    });

    inFlight.set(flightKey, promise);
    return promise;
  }

  await Promise.all(triggerNodes.map(t => runNode(t.id, {}, { tokenId: crypto.randomUUID(), branchId: 'root' })));
}

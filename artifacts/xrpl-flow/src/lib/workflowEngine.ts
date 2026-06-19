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

/** XRPL Batch execution mode flags */
const BATCH_MODE_FLAGS: Record<string, number> = {
  ALLORNOTHING: 0x00000001,
  ONLYONE:      0x00000002,
  UNTILFAILURE: 0x00000004,
  INDEPENDENT:  0x00000008,
};

/** Inner batch transaction flag */
const TF_INNER_BATCH_TXN = 0x00010000;

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

/** Build successors/predecessors graph from edges */
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

/** Evaluate a JS condition expression against prevOutput */
function evalCondition(expr: string, output: any): boolean {
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function('output', `"use strict"; return (${expr});`)(output));
  } catch {
    return false;
  }
}

/** Build XRPL transaction object from a node's config */
function buildTx(node: Node, activeWallet: WalletInfo, innerBatch = false): Record<string, any> {
  const cfg  = getConfig(node);
  const type = node.type as string;

  const tx: Record<string, any> = {
    TransactionType: type,
    Account: cfg.Account || activeWallet.address,
  };

  if (innerBatch) {
    tx.Flags         = TF_INNER_BATCH_TXN;
    tx.Fee           = '0';
    tx.Sequence      = 0;
    tx.SigningPubKey  = '';
    tx.TxnSignature  = '';
  }

  const skipKeys = new Set(['Account', 'LimitAmount_currency', 'LimitAmount_issuer', 'LimitAmount_value']);
  for (const [k, v] of Object.entries(cfg)) {
    if (skipKeys.has(k) || v === '' || v === null || v === undefined) continue;
    if (innerBatch && (k === 'Fee' || k === 'Sequence')) continue;
    tx[k] = v;
  }

  if (type === 'TrustSet') {
    tx.LimitAmount = {
      currency: cfg.LimitAmount_currency || '',
      issuer:   cfg.LimitAmount_issuer   || '',
      value:    cfg.LimitAmount_value    || '0',
    };
  }

  for (const field of ['SignerEntries', 'AuthAccounts', 'NFTokenOffers', 'PriceDataSeries', 'AcceptedCredentials', 'Memos']) {
    if (typeof cfg[field] === 'string' && cfg[field].trim()) {
      try { tx[field] = JSON.parse(cfg[field]); } catch { /* keep as string */ }
    }
  }

  return tx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight: network gating
// ─────────────────────────────────────────────────────────────────────────────

function preflightNetworkGating(nodes: Node[], network: NetworkType): void {
  if (network === 'devnet') return;

  const violations: string[] = [];
  for (const node of nodes) {
    const def = getNodeDef(node.type as string);
    if (def?.networkGating === 'devnet-only') {
      violations.push(`"${def.label}"`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Network mismatch: The following nodes require Devnet but you are connected to ${network}:\n` +
      violations.join(', ') + '\n\nSwitch to Devnet in the Network panel to use these nodes.'
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
  await client.request({ command: 'subscribe', accounts: [address] });

  const handler = (event: any) => {
    if (
      event.type === 'transaction' &&
      (event.transaction?.Destination === address || event.transaction?.Account === address)
    ) {
      onTx(event.transaction);
    }
  };

  client.on('transaction', handler);
  return () => {
    client.off('transaction', handler);
    client.request({ command: 'unsubscribe', accounts: [address] }).catch(() => {});
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delay: WaitForLedger close via WebSocket
// ─────────────────────────────────────────────────────────────────────────────

function waitForNextLedger(client: XRPL.Client): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off('ledgerClosed', handler);
      client.request({ command: 'unsubscribe', streams: ['ledger'] }).catch(() => {});
      reject(new Error('WaitForLedger: no ledger closed within 30s'));
    }, 30_000);

    const handler = () => {
      clearTimeout(timeout);
      client.off('ledgerClosed', handler);
      client.request({ command: 'unsubscribe', streams: ['ledger'] }).catch(() => {});
      resolve();
    };

    client.request({ command: 'subscribe', streams: ['ledger'] })
      .then(() => client.on('ledgerClosed', handler))
      .catch(reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BatchContainer: collect children by parentId, build + submit Batch envelope
// ─────────────────────────────────────────────────────────────────────────────

async function executeBatch(
  batchNode: Node,
  allNodes: Node[],
  client: XRPL.Client,
  wallet: XRPL.Wallet,
  activeWalletInfo: WalletInfo,
  cbs: ExecutionCallbacks,
): Promise<any> {
  const label  = getNodeLabel(batchNode);
  const cfg    = getConfig(batchNode);
  const mode   = cfg.ExecutionMode || 'ALLORNOTHING';
  const modeFlag = BATCH_MODE_FLAGS[mode] ?? BATCH_MODE_FLAGS.ALLORNOTHING;

  // Collect inner tx nodes: those whose parentId === batchNode.id (group children)
  const innerNodes = allNodes.filter(
    n => n.parentId === batchNode.id && !NON_TX_TYPES.has(n.type as string)
  );

  cbs.addLogEntry({
    nodeId: batchNode.id, nodeLabel: label,
    message: `Building Batch (${mode}) with ${innerNodes.length} inner txns...`,
    status: 'running',
  });

  if (innerNodes.length === 0) {
    throw new Error(
      'BatchContainer has no inner transaction nodes. ' +
      'Drop tx nodes inside the batch container group on the canvas.'
    );
  }
  if (innerNodes.length > 8) {
    throw new Error('BatchContainer supports at most 8 inner transactions.');
  }

  const rawTransactions = innerNodes.map(n => ({
    RawTransaction: buildTx(n, activeWalletInfo, true),
  }));

  const batchTx: any = {
    TransactionType: 'Batch',
    Account: activeWalletInfo.address,
    RawTransactions: rawTransactions,
    Flags: modeFlag,
  };

  cbs.addLogEntry({
    nodeId: batchNode.id, nodeLabel: label,
    message: `Submitting Batch envelope to ${cbs.network}...`,
    status: 'running',
  });

  const result = await client.submitAndWait(batchTx, { wallet });
  const hash     = (result.result as any)?.hash || '';
  const txResult = (result.result?.meta as any)?.TransactionResult || 'unknown';

  if (txResult === 'tesSUCCESS') {
    cbs.addLogEntry({
      nodeId: batchNode.id, nodeLabel: label,
      message: `Batch succeeded (${txResult})`,
      txHash: hash, status: 'success',
    });
  } else {
    throw new Error(`Batch failed: ${txResult}`);
  }

  return result.result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single node executor
// ─────────────────────────────────────────────────────────────────────────────

async function executeNode(
  node: Node,
  prevOutput: any,
  allNodes: Node[],
  client: XRPL.Client,
  wallet: XRPL.Wallet,
  activeWalletInfo: WalletInfo,
  cbs: ExecutionCallbacks,
  innerNodeIds: Set<string>,
  nodeMap: Map<string, Node>,
  successors: Map<string, string[]>,
): Promise<{ output: any; conditionResult?: boolean }> {
  const type  = node.type as string;
  const label = getNodeLabel(node);
  const cfg   = getConfig(node);

  cbs.setNodeStatus(node.id, 'running');
  cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Running...', status: 'running' });

  try {
    // ── Triggers ───────────────────────────────────────────────────────────
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

    // ── Control flow ───────────────────────────────────────────────────────
    if (type === 'ConditionBranch') {
      const expr   = cfg.Expression || 'false';
      const result = evalCondition(expr, prevOutput);
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Condition → ${result}`, status: 'success' });
      return { output: prevOutput, conditionResult: result };
    }

    if (type === 'ParallelSplit' || type === 'SyncJoin') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: type === 'ParallelSplit' ? 'Fan-out' : 'Join', status: 'success' });
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
        await new Promise(r => setTimeout(r, ms));
        cbs.setNodeStatus(node.id, 'success');
        cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Delayed ${ms}ms`, status: 'success' });
      }
      return { output: prevOutput };
    }

    if (type === 'Loop') {
      // Handled by the graph traversal layer (runNode), not here
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Loop started`, status: 'success' });
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

    // ── BatchContainer (group node) ─────────────────────────────────────────
    if (type === 'BatchContainer') {
      cbs.setNodeStatus(node.id, 'running');

      // Mark group children so they are skipped in normal traversal
      const childNodes = allNodes.filter(
        n => n.parentId === node.id && !NON_TX_TYPES.has(n.type as string)
      );
      for (const cn of childNodes) innerNodeIds.add(cn.id);

      const batchOutput = await executeBatch(node, allNodes, client, wallet, activeWalletInfo, cbs);

      for (const cn of childNodes) {
        cbs.setNodeStatus(cn.id, 'success');
        cbs.addLogEntry({ nodeId: cn.id, nodeLabel: getNodeLabel(cn), message: 'Included in Batch', status: 'success' });
      }

      cbs.setNodeStatus(node.id, 'success');
      return { output: batchOutput };
    }

    // ── Transaction node ────────────────────────────────────────────────────
    const tx = buildTx(node, activeWalletInfo, false);

    cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Submitting ${type}...`, status: 'running' });

    const result = await client.submitAndWait(tx as any, { wallet });
    const hash     = (result.result as any)?.hash || '';
    const txResult = (result.result?.meta as any)?.TransactionResult || 'unknown';

    if (txResult === 'tesSUCCESS') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({
        nodeId: node.id, nodeLabel: label,
        message: `${type} succeeded (${txResult})`,
        txHash: hash, status: 'success',
      });
    } else {
      throw new Error(`Transaction failed: ${txResult}`);
    }

    return { output: result.result };
  } catch (err: any) {
    const msg = err?.message || String(err);
    cbs.setNodeStatus(node.id, 'failed', msg);
    cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Error: ${msg}`, status: 'failed' });
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
  walletSeed: string,
  cbs: ExecutionCallbacks,
): Promise<void> {
  preflightNetworkGating(nodes, cbs.network);

  const { successors, predecessors, nodeMap } = buildGraph(nodes, edges);
  const wallet = XRPL.Wallet.fromSeed(walletSeed);

  const triggerTypes = new Set(['ManualTrigger', 'AccountEventTrigger']);
  const triggerNodes = nodes.filter(n => triggerTypes.has(n.type as string));

  if (triggerNodes.length === 0) {
    throw new Error('No trigger node found. Add a Manual Trigger or Account Event trigger to start the workflow.');
  }

  // Group-child nodes are skipped during normal graph traversal; the BatchContainer handles them
  const innerBatchIds = new Set<string>(
    nodes.filter(n => n.parentId !== undefined).map(n => n.id)
  );

  const inFlight = new Map<string, Promise<any>>();

  async function runNode(nodeId: string, input: any): Promise<any> {
    if (innerBatchIds.has(nodeId)) return input;
    if (inFlight.has(nodeId)) return inFlight.get(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return input;

    const promise = executeNode(
      node, input, nodes, client, wallet, activeWalletInfo, cbs, innerBatchIds, nodeMap, successors,
    ).then(({ output, conditionResult }) => {
      const succs = successors.get(nodeId) || [];

      // ConditionBranch: route by handle label
      if ((node.type as string) === 'ConditionBranch') {
        const trueEdges  = edges.filter(e => e.source === nodeId && (e.sourceHandle === 'true'  || !e.sourceHandle));
        const falseEdges = edges.filter(e => e.source === nodeId && e.sourceHandle === 'false');
        const nextEdges  = conditionResult ? trueEdges : falseEdges;
        return Promise.all(nextEdges.map(e => runNode(e.target, output)));
      }

      // ParallelSplit: all successors concurrently
      if ((node.type as string) === 'ParallelSplit') {
        return Promise.all(succs.map(sid => runNode(sid, output)));
      }

      // SyncJoin: wait for all predecessors before continuing
      if ((node.type as string) === 'SyncJoin') {
        const preds = predecessors.get(nodeId) || [];
        return Promise.all(preds.map(pid => inFlight.get(pid) || Promise.resolve()))
          .then(() => Promise.all(succs.map(sid => runNode(sid, output))));
      }

      // Loop: count or until-condition
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
            if (iter >= MAX_SAFETY) break; // safety cap

            if (iter > 0 && delay > 0) await new Promise(r => setTimeout(r, delay));

            // Clear cached results for successor nodes before each re-run
            for (const sid of succs) inFlight.delete(sid);
            const results = await Promise.all(succs.map(sid => runNode(sid, loopOutput)));
            loopOutput = results[0] ?? loopOutput;
            iter++;
          }
        };
        return run();
      }

      // BatchContainer: successors that are NOT group children run after the batch
      if ((node.type as string) === 'BatchContainer') {
        const afterBatch = succs.filter(sid => !innerBatchIds.has(sid));
        return afterBatch.reduce(
          (chain, sid) => chain.then(() => runNode(sid, output)),
          Promise.resolve() as Promise<any>
        );
      }

      // Default: sequential
      return succs.reduce(
        (chain, sid) => chain.then(() => runNode(sid, output)),
        Promise.resolve() as Promise<any>
      );
    });

    inFlight.set(nodeId, promise);
    return promise;
  }

  await Promise.all(triggerNodes.map(t => runNode(t.id, {})));
}

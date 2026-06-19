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
  const successors  = new Map<string, string[]>();
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
    tx.Flags = TF_INNER_BATCH_TXN;
    tx.Fee   = '0';
    tx.Sequence = 0;
    tx.SigningPubKey = '';
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

  // Parse textarea JSON fields
  for (const field of ['SignerEntries', 'AuthAccounts', 'NFTokenOffers', 'PriceDataSeries', 'AcceptedCredentials']) {
    if (typeof cfg[field] === 'string' && cfg[field].trim()) {
      try { tx[field] = JSON.parse(cfg[field]); } catch { /* keep as string */ }
    }
  }

  return tx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight: network gating validation
// ─────────────────────────────────────────────────────────────────────────────

/** Throw if any node in the workflow requires devnet but a different network is active */
function preflightNetworkGating(nodes: Node[], network: NetworkType): void {
  if (network === 'devnet') return; // devnet allows all nodes

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

/**
 * Subscribe to account transactions; returns the first incoming tx as output.
 * The returned cleanup function unsubscribes.
 */
async function subscribeAccountEvent(
  client: XRPL.Client,
  address: string,
  onTx: (tx: any) => void,
): Promise<() => void> {
  await client.request({
    command: 'subscribe',
    accounts: [address],
  });

  const handler = (event: any) => {
    if (event.type === 'transaction' && (
      event.transaction?.Destination === address ||
      event.transaction?.Account      === address
    )) {
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
// BatchContainer execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and submit a Batch transaction wrapping all inner tx nodes
 * (successors of the BatchContainer in the graph).
 */
async function executeBatch(
  batchNode: Node,
  innerNodes: Node[],
  client: XRPL.Client,
  wallet: XRPL.Wallet,
  activeWalletInfo: WalletInfo,
  cbs: ExecutionCallbacks,
): Promise<any> {
  const label  = getNodeLabel(batchNode);
  const cfg    = getConfig(batchNode);
  const mode   = cfg.ExecutionMode || 'ALLORNOTHING';
  const modeFlag = BATCH_MODE_FLAGS[mode] ?? BATCH_MODE_FLAGS.ALLORNOTHING;

  cbs.addLogEntry({
    nodeId: batchNode.id, nodeLabel: label,
    message: `Building Batch (${mode}) with ${innerNodes.length} inner txns...`,
    status: 'running',
  });

  if (innerNodes.length === 0) {
    throw new Error('BatchContainer has no inner transaction nodes connected via edges.');
  }
  if (innerNodes.length > 8) {
    throw new Error('BatchContainer supports at most 8 inner transactions.');
  }

  // Build each inner tx with tfInnerBatchTxn flag
  const rawTransactions = innerNodes.map(n => {
    const innerTx = buildTx(n, activeWalletInfo, true);
    return { RawTransaction: innerTx };
  });

  // Outer Batch envelope
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
  const hash = (result.result as any)?.hash || '';
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
  client: XRPL.Client,
  wallet: XRPL.Wallet,
  activeWalletInfo: WalletInfo,
  cbs: ExecutionCallbacks,
  innerNodeIds: Set<string>,           // nodes that are inner-batch nodes (skip direct execute)
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
      const ms = Number(cfg.Duration) || 1000;
      await new Promise(r => setTimeout(r, ms));
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Delayed ${ms}ms`, status: 'success' });
      return { output: prevOutput };
    }

    if (type === 'Loop') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Loop ×${cfg.Iterations || 1}`, status: 'success' });
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

    // ── BatchContainer ──────────────────────────────────────────────────────
    if (type === 'BatchContainer') {
      // Collect direct successor tx-type nodes as inner batch nodes
      const succIds  = successors.get(node.id) || [];
      const innerNodes: Node[] = [];
      for (const sid of succIds) {
        const sn = nodeMap.get(sid);
        if (sn && !NON_TX_TYPES.has(sn.type as string)) {
          innerNodes.push(sn);
          innerNodeIds.add(sid); // mark so they are skipped in normal traversal
          cbs.setNodeStatus(sid, 'running');
        }
      }

      cbs.setNodeStatus(node.id, 'running');
      const batchOutput = await executeBatch(node, innerNodes, client, wallet, activeWalletInfo, cbs);

      // Mark inner nodes as success
      for (const sn of innerNodes) {
        cbs.setNodeStatus(sn.id, 'success');
        cbs.addLogEntry({ nodeId: sn.id, nodeLabel: getNodeLabel(sn), message: 'Included in Batch', status: 'success' });
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
// Fix: batchNode reference inside executeNode (need to hoist)
// ─────────────────────────────────────────────────────────────────────────────

// Re-export the actual public API. The `batchNode` in executeNode above
// refers to the `node` argument (BatchContainer) — fix by aliasing inside scope.
// (The above code uses `batchNode` correctly — it IS the `node` arg.)

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
  // ── 1. Pre-flight: network gating ─────────────────────────────────────────
  preflightNetworkGating(nodes, cbs.network);

  // ── 2. Build graph ────────────────────────────────────────────────────────
  const { successors, predecessors, nodeMap } = buildGraph(nodes, edges);
  const wallet = XRPL.Wallet.fromSeed(walletSeed);

  // ── 3. Find trigger nodes ─────────────────────────────────────────────────
  const triggerTypes = new Set(['ManualTrigger', 'AccountEventTrigger']);
  const triggerNodes = nodes.filter(n => triggerTypes.has(n.type as string));

  if (triggerNodes.length === 0) {
    throw new Error('No trigger node found. Add a Manual Trigger or Account Event trigger to start the workflow.');
  }

  // ── 4. Traversal state ───────────────────────────────────────────────────
  const inFlight     = new Map<string, Promise<any>>();
  const innerBatchIds = new Set<string>(); // nodes absorbed into a BatchContainer

  async function runNode(nodeId: string, input: any): Promise<any> {
    // Skip nodes that are inner-batch members (executed by the BatchContainer)
    if (innerBatchIds.has(nodeId)) return input;
    if (inFlight.has(nodeId)) return inFlight.get(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return input;

    const promise = executeNode(
      node, input, client, wallet, activeWalletInfo, cbs, innerBatchIds, nodeMap, successors,
    ).then(({ output, conditionResult }) => {
      const succs = successors.get(nodeId) || [];

      if ((node.type as string) === 'ConditionBranch') {
        const trueEdges  = edges.filter(e => e.source === nodeId && (e.sourceHandle === 'true'  || !e.sourceHandle));
        const falseEdges = edges.filter(e => e.source === nodeId && e.sourceHandle === 'false');
        const nextEdges  = conditionResult ? trueEdges : falseEdges;
        return Promise.all(nextEdges.map(e => runNode(e.target, output)));
      }

      if ((node.type as string) === 'ParallelSplit') {
        return Promise.all(succs.map(sid => runNode(sid, output)));
      }

      if ((node.type as string) === 'SyncJoin') {
        const preds = predecessors.get(nodeId) || [];
        return Promise.all(preds.map(pid => inFlight.get(pid) || Promise.resolve()))
          .then(() => Promise.all(succs.map(sid => runNode(sid, output))));
      }

      if ((node.type as string) === 'Loop') {
        const iters = Number(getConfig(node).Iterations) || 1;
        const delay = Number(getConfig(node).DelayBetween) || 0;
        const run = async () => {
          for (let i = 0; i < iters; i++) {
            if (i > 0 && delay > 0) await new Promise(r => setTimeout(r, delay));
            for (const sid of succs) inFlight.delete(sid);
            await Promise.all(succs.map(sid => runNode(sid, output)));
          }
        };
        return run();
      }

      // BatchContainer: skip its direct successors (already absorbed)
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

import * as XRPL from 'xrpl';
import { Node, Edge } from '@xyflow/react';
import { WalletInfo, LogEntry } from '@/store/workflowStore';

export type ExecutionCallbacks = {
  setNodeStatus: (id: string, status: 'idle'|'running'|'success'|'failed', error?: string) => void;
  addLogEntry: (entry: Omit<LogEntry, 'id'|'timestamp'>) => void;
  getExplorerUrl: (hash: string) => string;
};

function getNodeLabel(node: Node): string {
  return (node.data?.label as string) || (node.type as string) || node.id;
}

function getConfig(node: Node): Record<string, any> {
  return (node.data?.config as Record<string, any>) || {};
}

/** Build a successors map from edges */
function buildGraph(nodes: Node[], edges: Edge[]): {
  successors: Map<string, string[]>;
  predecessors: Map<string, string[]>;
  nodeMap: Map<string, Node>;
} {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const nodeMap = new Map<string, Node>();

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

/** Evaluate a condition expression safely */
function evalCondition(expr: string, output: any): boolean {
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function('output', `"use strict"; return (${expr});`)(output));
  } catch {
    return false;
  }
}

/** Build XRPL transaction object from node config */
function buildTx(node: Node, activeWallet: WalletInfo): Record<string, any> {
  const cfg = getConfig(node);
  const type = node.type as string;

  // Base transaction
  const tx: Record<string, any> = {
    TransactionType: type,
    Account: cfg.Account || activeWallet.address,
  };

  // Copy all config fields except internal ones
  const skip = new Set(['Account']); // already set
  for (const [k, v] of Object.entries(cfg)) {
    if (skip.has(k) || v === '' || v === null || v === undefined) continue;

    // TrustSet LimitAmount reconstruction
    if (k === 'LimitAmount_currency' || k === 'LimitAmount_issuer' || k === 'LimitAmount_value') continue;

    tx[k] = v;
  }

  // Special cases
  if (type === 'TrustSet') {
    tx.LimitAmount = {
      currency: cfg.LimitAmount_currency || '',
      issuer: cfg.LimitAmount_issuer || '',
      value: cfg.LimitAmount_value || '0',
    };
  }

  // Parse JSON fields
  for (const field of ['SignerEntries', 'AuthAccounts', 'NFTokenOffers', 'PriceDataSeries', 'AcceptedCredentials']) {
    if (cfg[field]) {
      try { tx[field] = JSON.parse(cfg[field]); } catch { /* keep as string */ }
    }
  }

  return tx;
}

/** Execute a single node, return output data */
async function executeNode(
  node: Node,
  prevOutput: any,
  client: XRPL.Client,
  wallet: XRPL.Wallet,
  activeWalletInfo: WalletInfo,
  cbs: ExecutionCallbacks,
): Promise<{ output: any; conditionResult?: boolean }> {
  const type = node.type as string;
  const label = getNodeLabel(node);
  const cfg = getConfig(node);

  cbs.setNodeStatus(node.id, 'running');
  cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Running...', status: 'running' });

  try {
    // ── Non-transaction nodes ───────────────────────────────────────────
    if (type === 'ManualTrigger' || type === 'AccountEventTrigger') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: 'Triggered', status: 'success' });
      return { output: prevOutput || {} };
    }

    if (type === 'ConditionBranch') {
      const expr = cfg.Expression || 'false';
      const result = evalCondition(expr, prevOutput);
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Condition: ${result}`, status: 'success' });
      return { output: prevOutput, conditionResult: result };
    }

    if (type === 'ParallelSplit' || type === 'SyncJoin') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: type === 'ParallelSplit' ? 'Splitting...' : 'Joining', status: 'success' });
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
      // Loop is handled at graph traversal level; here just pass through
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Loop: ${cfg.Iterations || 1}x`, status: 'success' });
      return { output: prevOutput };
    }

    if (type === 'LogOutput') {
      const msg = cfg.Message || JSON.stringify(prevOutput, null, 2);
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: msg, status: 'success' });
      return { output: prevOutput };
    }

    if (type === 'BatchContainer') {
      cbs.setNodeStatus(node.id, 'success');
      cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Batch (${cfg.ExecutionMode || 'ALLORNOTHING'}) — activate BatchV1_1 on devnet`, status: 'success' });
      return { output: prevOutput };
    }

    // ── Transaction nodes ───────────────────────────────────────────────
    const tx = buildTx(node, activeWalletInfo);

    // Auto-fill Account if empty
    if (!tx.Account) tx.Account = wallet.address;

    cbs.addLogEntry({ nodeId: node.id, nodeLabel: label, message: `Submitting ${type}...`, status: 'running' });

    const result = await client.submitAndWait(tx as any, { wallet });
    const hash = (result.result as any)?.hash || '';
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

/** Main workflow runner — BFS traversal with parallel fan-out support */
export async function runWorkflow(
  nodes: Node[],
  edges: Edge[],
  client: XRPL.Client,
  activeWalletInfo: WalletInfo,
  walletSeed: string,
  cbs: ExecutionCallbacks,
): Promise<void> {
  const { successors, predecessors, nodeMap } = buildGraph(nodes, edges);
  const wallet = XRPL.Wallet.fromSeed(walletSeed);

  // Find trigger nodes as entry points
  const triggerTypes = new Set(['ManualTrigger', 'AccountEventTrigger']);
  const triggerNodes = nodes.filter(n => triggerTypes.has(n.type as string));

  if (triggerNodes.length === 0) {
    throw new Error('No trigger node found. Add a Manual Trigger to start the workflow.');
  }

  // Track completed node outputs
  const outputs = new Map<string, any>();
  // Track in-progress promise for each node (for parallel join)
  const inFlight = new Map<string, Promise<any>>();

  async function runNode(nodeId: string, input: any): Promise<any> {
    if (inFlight.has(nodeId)) return inFlight.get(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return input;

    const promise = executeNode(node, input, client, wallet, activeWalletInfo, cbs).then(({ output, conditionResult }) => {
      outputs.set(nodeId, output);

      const succs = successors.get(nodeId) || [];

      // ConditionBranch: route to only one branch
      if ((node.type as string) === 'ConditionBranch') {
        // Edges from condition branch — check sourceHandle
        const trueEdges = edges.filter(e => e.source === nodeId && (e.sourceHandle === 'true' || !e.sourceHandle));
        const falseEdges = edges.filter(e => e.source === nodeId && e.sourceHandle === 'false');
        const nextEdges = conditionResult ? trueEdges : falseEdges;
        return Promise.all(nextEdges.map(e => runNode(e.target, output)));
      }

      // ParallelSplit: run all successors concurrently
      if ((node.type as string) === 'ParallelSplit') {
        return Promise.all(succs.map(sid => runNode(sid, output)));
      }

      // SyncJoin: wait for all predecessors before proceeding
      if ((node.type as string) === 'SyncJoin') {
        const preds = predecessors.get(nodeId) || [];
        return Promise.all(preds.map(pid => inFlight.get(pid) || Promise.resolve())).then(() => {
          return Promise.all(succs.map(sid => runNode(sid, output)));
        });
      }

      // Loop: repeat downstream subgraph
      if ((node.type as string) === 'Loop') {
        const iters = Number(getConfig(node).Iterations) || 1;
        const delay = Number(getConfig(node).DelayBetween) || 0;
        const run = async () => {
          for (let i = 0; i < iters; i++) {
            if (i > 0 && delay > 0) await new Promise(r => setTimeout(r, delay));
            // Clear downstream node in-flight for re-run
            for (const sid of succs) inFlight.delete(sid);
            await Promise.all(succs.map(sid => runNode(sid, output)));
          }
        };
        return run();
      }

      // Default: run all successors sequentially
      return succs.reduce((chain, sid) =>
        chain.then(() => runNode(sid, output)),
        Promise.resolve() as Promise<any>
      );
    });

    inFlight.set(nodeId, promise);
    return promise;
  }

  // Start from all trigger nodes (can run concurrently)
  await Promise.all(triggerNodes.map(t => runNode(t.id, {})));
}

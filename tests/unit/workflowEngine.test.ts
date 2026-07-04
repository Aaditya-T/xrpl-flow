import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { runWorkflow, validateWorkflowGraph } from '@/lib/workflowEngine';
import { ACCOUNT, TEST_WALLET, edge, validTransactionConfig, workflowNode } from '../helpers/fixtures';
import { createMockXrplClient } from '../helpers/mockXrplClient';

function callbacks() {
  const statuses: Array<{ id: string; status: string; error?: string }> = [];
  const logs: Array<{ nodeLabel: string; message: string; status: string }> = [];
  return {
    statuses,
    logs,
    cbs: {
      setNodeStatus(id: string, status: 'idle' | 'running' | 'success' | 'failed', error?: string) {
        statuses.push({ id, status, error });
      },
      addLogEntry(entry: { nodeLabel: string; message: string; status: 'running' | 'success' | 'failed' | 'info' }) {
        logs.push(entry);
      },
      getExplorerUrl(hash: string) {
        return `https://example.test/${hash}`;
      },
      network: 'testnet' as const,
    },
  };
}

function validationMessages(nodes: Node[], edges: Edge[]): string[] {
  return validateWorkflowGraph(nodes, edges).map(error => error.fieldLabel);
}

describe('workflow graph validation', () => {
  it('requires exactly one trigger', () => {
    expect(validationMessages([], [])).toContain('Exactly one trigger is required (found 0)');
    expect(validationMessages([
      workflowNode('ManualTrigger', 'a'),
      workflowNode('AccountEventTrigger', 'b', { WatchAddress: ACCOUNT }),
    ], [])).toContain('Exactly one trigger is required (found 2)');
  });

  it('rejects malformed graph structures', () => {
    const nodes = [
      workflowNode('ManualTrigger', 'start'),
      workflowNode('LogOutput', 'a'),
      workflowNode('LogOutput', 'b'),
    ];

    expect(validationMessages(nodes, [edge('missing', 'a')])).toContain('Edge missing-a references a missing node');
    expect(validationMessages(nodes, [edge('start', 'a'), edge('start', 'a', { id: 'dupe' })])).toContain('Duplicate edge');
    expect(validationMessages(nodes, [edge('a', 'start')])).toContain('Trigger nodes cannot have incoming edges');
    expect(validationMessages(nodes, [edge('start', 'a'), edge('a', 'start')])).toContain('Cycles are not allowed; use a Loop Container');
    expect(validationMessages(nodes, [edge('start', 'a')])).toContain('Node is unreachable from the trigger');
  });

  it('enforces branch and split formation rules', () => {
    const conditionNodes = [
      workflowNode('ManualTrigger', 'start'),
      workflowNode('ConditionBranch', 'branch', { Expression: 'output.ok == true' }),
      workflowNode('LogOutput', 'yes'),
      workflowNode('LogOutput', 'no'),
    ];
    expect(validationMessages(conditionNodes, [
      edge('start', 'branch'),
      edge('branch', 'yes', { sourceHandle: 'maybe' }),
    ])).toContain('Condition edges must use the true or false handle');
    expect(validationMessages(conditionNodes, [
      edge('start', 'branch'),
      edge('branch', 'yes', { sourceHandle: 'true' }),
      edge('branch', 'no', { sourceHandle: 'true' }),
    ])).toContain('Condition Branch allows at most one edge per handle');

    const splitNodes = [
      workflowNode('ManualTrigger', 'start'),
      workflowNode('ParallelSplit', 'split'),
      workflowNode('LogOutput', 'a'),
    ];
    expect(validationMessages(splitNodes, [edge('start', 'split'), edge('split', 'a')])).toContain('Parallel Split requires at least two outgoing branches');
  });
});

describe('workflow runtime', () => {
  it('runs walletless query and data utility workflows without a seed', async () => {
    const client = createMockXrplClient();
    const { cbs } = callbacks();
    const nodes = [
      workflowNode('ManualTrigger', 'start'),
      workflowNode('AccountLinesQuery', 'lines', { Account: ACCOUNT, Limit: 2 }),
      workflowNode('FormatTrustLines', 'format', { SourcePath: 'items' }),
      workflowNode('LogOutput', 'log', { Message: '{{output.meta.count}} formatted' }),
    ];
    const edges = [edge('start', 'lines'), edge('lines', 'format'), edge('format', 'log')];

    await expect(runWorkflow(nodes, edges, client as never, {
      id: 'readonly',
      name: 'Read-only',
      address: ACCOUNT,
      publicKey: '',
    }, '', cbs, [])).resolves.toBeUndefined();

    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ command: 'account_lines' }));
  });

  it('rejects transaction execution when a local signer seed is required but missing', async () => {
    const client = createMockXrplClient();
    const { cbs } = callbacks();
    const nodes = [
      workflowNode('ManualTrigger', 'start'),
      workflowNode('Payment', 'pay', validTransactionConfig('Payment')),
    ];

    await expect(runWorkflow(nodes, [edge('start', 'pay')], client as never, {
      id: 'readonly',
      name: 'Read-only',
      address: ACCOUNT,
      publicKey: '',
    }, '', cbs, [])).rejects.toThrow(/no seed/i);
  });

  it('blocks devnet-only nodes on non-devnet networks before signing', async () => {
    const client = createMockXrplClient();
    const { cbs } = callbacks();
    const nodes = [
      workflowNode('ManualTrigger', 'start'),
      workflowNode('VaultCreate', 'vault', validTransactionConfig('VaultCreate')),
    ];

    await expect(runWorkflow(nodes, [edge('start', 'vault')], client as never, TEST_WALLET, TEST_WALLET.seed, cbs, [TEST_WALLET])).rejects.toThrow(/Network mismatch/i);
  });

  it('enforces loop bounds', async () => {
    const client = createMockXrplClient();
    const { cbs } = callbacks();
    const loop = workflowNode('LoopContainer', 'loop', { LoopMode: 'count', Iterations: 101 });
    const child = { ...workflowNode('LogOutput', 'child', { Message: 'inside' }), parentId: 'loop' };

    await expect(runWorkflow([
      workflowNode('ManualTrigger', 'start'),
      loop,
      child,
    ], [edge('start', 'loop')], client as never, TEST_WALLET, TEST_WALLET.seed, cbs, [TEST_WALLET])).rejects.toThrow(/Loop iterations/i);
  });

  it('honors abort signals before running', async () => {
    const controller = new AbortController();
    controller.abort();
    const { cbs } = callbacks();

    await expect(runWorkflow([
      workflowNode('ManualTrigger', 'start'),
    ], [], createMockXrplClient() as never, TEST_WALLET, TEST_WALLET.seed, cbs, [TEST_WALLET], controller.signal)).rejects.toThrow(/Workflow stopped/i);
  });

  it('can execute a millisecond delay with fake timers', async () => {
    vi.useFakeTimers();
    const client = createMockXrplClient();
    const { cbs } = callbacks();
    const promise = runWorkflow([
      workflowNode('ManualTrigger', 'start'),
      workflowNode('Delay', 'delay', { DelayMode: 'ms', Duration: 1000 }),
      workflowNode('LogOutput', 'log', { Message: 'done' }),
    ], [edge('start', 'delay'), edge('delay', 'log')], client as never, TEST_WALLET, TEST_WALLET.seed, cbs, [TEST_WALLET]);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

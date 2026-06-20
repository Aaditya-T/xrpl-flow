import { Node, Edge } from '@xyflow/react';
import {
  LEGACY_WORKFLOW_STORAGE_KEY,
  WORKFLOW_STORAGE_KEY,
  WORKFLOW_VERSION,
  type WorkflowDocumentV2,
} from './workflowTypes';

export interface ExampleWorkflow {
  name: string;
  nodes: Node[];
  edges: Edge[];
}

const px = (x: number, y: number) => ({ x, y });

export const EXAMPLE_WORKFLOWS: ExampleWorkflow[] = [

  // ── 1. Send XRP ────────────────────────────────────────────────────────
  {
    name: 'Send XRP',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'Payment', position: px(380, 200),
        data: {
          label: 'Send XRP',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '1000000' },
          },
        },
      },
      {
        id: 'n3', type: 'LogOutput', position: px(680, 200),
        data: { label: 'Log Result', config: { Message: '' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
    ],
  },

  // ── 2. Issue Token (2 Wallets) ─────────────────────────────────────────
  //   Step 1 — ISSUER wallet: AccountSet SetFlag=8 (asfDefaultRipple)
  //   Step 2 — HOLDER wallet: TrustSet to trust the issuer's currency
  //   Step 3 — ISSUER wallet: Payment of token amount to holder
  //   Fill in ISSUER and HOLDER addresses before running.
  {
    name: 'Issue Token (2 Wallets)',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 220),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'AccountSet', position: px(360, 100),
        data: {
          label: 'Enable Default Ripple (ISSUER)',
          config: {
            Account: '',
            SetFlag: 8,
          },
        },
      },
      {
        id: 'n3', type: 'TrustSet', position: px(360, 330),
        data: {
          label: 'Set Trust Line (HOLDER)',
          config: {
            Account: '',
            LimitAmount_currency: 'USD',
            LimitAmount_issuer: '',
            LimitAmount_value: '10000',
          },
        },
      },
      {
        id: 'n4', type: 'ParallelSplit', position: px(220, 220),
        data: { label: 'Parallel Split', config: {} },
      },
      {
        id: 'n5', type: 'SyncJoin', position: px(620, 220),
        data: { label: 'Sync Join', config: {} },
      },
      {
        id: 'n6', type: 'Payment', position: px(860, 220),
        data: {
          label: 'Send Token (ISSUER → HOLDER)',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'token', currency: 'USD', issuer: '', value: '100' },
          },
        },
      },
      {
        id: 'n7', type: 'LogOutput', position: px(1100, 220),
        data: { label: 'Done', config: { Message: 'Token issued!' } },
      },
    ],
    edges: [
      { id: 'e1-4',  source: 'n1', target: 'n4' },
      { id: 'e4-2',  source: 'n4', target: 'n2' },
      { id: 'e4-3',  source: 'n4', target: 'n3' },
      { id: 'e2-5',  source: 'n2', target: 'n5' },
      { id: 'e3-5',  source: 'n3', target: 'n5' },
      { id: 'e5-6',  source: 'n5', target: 'n6' },
      { id: 'e6-7',  source: 'n6', target: 'n7' },
    ],
  },

  // ── 3. Parallel Branches → Sync Join ───────────────────────────────────
  {
    name: 'Parallel Branches',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 240),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'ParallelSplit', position: px(340, 240),
        data: { label: 'Parallel Split', config: {} },
      },
      {
        id: 'n3', type: 'Payment', position: px(600, 100),
        data: {
          label: 'Payment A',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '500000' },
          },
        },
      },
      {
        id: 'n4', type: 'Payment', position: px(600, 380),
        data: {
          label: 'Payment B',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '500000' },
          },
        },
      },
      {
        id: 'n5', type: 'SyncJoin', position: px(880, 240),
        data: { label: 'Sync Join', config: {} },
      },
      {
        id: 'n6', type: 'LogOutput', position: px(1100, 240),
        data: { label: 'Both Done', config: { Message: 'Both branches finished' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e2-4', source: 'n2', target: 'n4' },
      { id: 'e3-5', source: 'n3', target: 'n5' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
    ],
  },

  // ── 4. Loop (Repeat 3×) ─────────────────────────────────────────────────
  {
    name: 'Loop 3×',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'LoopContainer', position: px(360, 140), style: { width: 480, height: 260 },
        data: {
          label: 'Repeat 3×',
          config: {
            LoopMode: 'count',
            Iterations: 3,
            DelayBetween: 1000,
          },
        },
      },
      {
        id: 'n3', type: 'Payment', position: px(100, 105), parentId: 'n2', extent: 'parent',
        data: {
          label: 'Payment (looped)',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '100000' },
          },
        },
      },
      {
        id: 'n4', type: 'LogOutput', position: px(920, 200),
        data: { label: 'Log', config: { Message: '' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-4', source: 'n2', target: 'n4' },
    ],
  },

  // ── 5. Delay Between Transactions ─────────────────────────────────────
  {
    name: 'Delay Between Txns',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'Payment', position: px(340, 200),
        data: {
          label: 'First Payment',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '500000' },
          },
        },
      },
      {
        id: 'n3', type: 'Delay', position: px(620, 200),
        data: {
          label: 'Wait 5s',
          config: {
            DelayMode: 'ms',
            Duration: 5000,
          },
        },
      },
      {
        id: 'n4', type: 'Payment', position: px(900, 200),
        data: {
          label: 'Second Payment',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '500000' },
          },
        },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(1180, 200),
        data: { label: 'Done', config: { Message: 'Both payments sent' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
    ],
  },

  // ── 6. Conditional Branch ──────────────────────────────────────────────
  {
    name: 'Conditional Branch',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 220),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'Payment', position: px(340, 220),
        data: {
          label: 'Attempt Payment',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '1000000' },
          },
        },
      },
      {
        id: 'n3', type: 'ConditionBranch', position: px(620, 220),
        data: {
          label: 'Did it succeed?',
          config: {
            Expression: 'output.meta.TransactionResult === "tesSUCCESS"',
            TrueLabel: 'success',
            FalseLabel: 'failed',
          },
        },
      },
      {
        id: 'n4', type: 'LogOutput', position: px(920, 80),
        data: { label: '✓ Success', config: { Message: 'Payment delivered!' } },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(920, 360),
        data: { label: '✗ Failed', config: { Message: 'Payment failed — check config.' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4', sourceHandle: 'true' },
      { id: 'e3-5', source: 'n3', target: 'n5', sourceHandle: 'false' },
    ],
  },

  // ── 7. Batch (Devnet) ──────────────────────────────────────────────────
  //   Drop inner tx nodes inside the BatchContainer group to include them.
  {
    name: 'Batch Txns (Devnet)',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 240),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'BatchContainer', position: px(360, 80),
        style: { width: 400, height: 280 },
        data: {
          label: 'Batch Container',
          config: { ExecutionMode: 'ALLORNOTHING' },
        },
      },
      {
        id: 'n3', type: 'Payment', position: px(30, 60),
        parentId: 'n2',
        extent: 'parent' as const,
        data: {
          label: 'Inner Payment',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '1000000' },
          },
        },
      },
      {
        id: 'n4', type: 'OfferCreate', position: px(30, 160),
        parentId: 'n2',
        extent: 'parent' as const,
        data: {
          label: 'Inner OfferCreate',
          config: {
            Account: '',
            TakerPays: { type: 'xrp', drops: '1000000' },
            TakerGets: { type: 'token', currency: 'USD', issuer: '', value: '1' },
          },
        },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(820, 240),
        data: { label: 'Batch Result', config: { Message: '' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-5', source: 'n2', target: 'n5' },
    ],
  },

  // ── 8. Mint & List NFT ────────────────────────────────────────────────
  {
    name: 'Mint & List NFT',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'NFTokenMint', position: px(340, 200),
        data: {
          label: 'NFTokenMint',
          config: {
            Account: '',
            NFTokenTaxon: 0,
            TransferFee: 500,
            tfTransferable: true,
          },
        },
      },
      {
        id: 'n3', type: 'NFTokenCreateOffer', position: px(620, 200),
        data: {
          label: 'List for Sale',
          config: {
            Account: '',
            NFTokenID: '',
            Amount: { type: 'xrp', drops: '1000000' },
            tfSellNFToken: true,
          },
        },
      },
      {
        id: 'n4', type: 'LogOutput', position: px(900, 200),
        data: { label: 'Listed', config: { Message: 'NFT minted and listed!' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
    ],
  },

  // ── 9. Create AMM Pool ────────────────────────────────────────────────
  {
    name: 'Create AMM Pool',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'TrustSet', position: px(340, 200),
        data: {
          label: 'Set Trust Line (USD)',
          config: {
            Account: '',
            LimitAmount_currency: 'USD',
            LimitAmount_issuer: '',
            LimitAmount_value: '100000',
          },
        },
      },
      {
        id: 'n3', type: 'AMMCreate', position: px(620, 200),
        data: {
          label: 'AMMCreate (XRP/USD)',
          config: {
            Account: '',
            Amount: { type: 'xrp', drops: '10000000' },
            Amount2: { type: 'token', currency: 'USD', issuer: '', value: '10' },
            TradingFee: 500,
          },
        },
      },
      {
        id: 'n4', type: 'LogOutput', position: px(900, 200),
        data: { label: 'Pool Created', config: { Message: 'AMM pool is live!' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
    ],
  },

  // ── 10. Escrow Create & Finish ────────────────────────────────────────
  {
    name: 'Escrow Create & Finish',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'EscrowCreate', position: px(340, 200),
        data: {
          label: 'Lock XRP in Escrow',
          config: {
            Account: '',
            Destination: '',
            Amount: '5000000',
            FinishAfter: 0,
          },
        },
      },
      {
        id: 'n3', type: 'Delay', position: px(620, 200),
        data: {
          label: 'Wait for Ledger Close',
          config: { DelayMode: 'ledger-close' },
        },
      },
      {
        id: 'n4', type: 'EscrowFinish', position: px(900, 200),
        data: {
          label: 'Release Escrow',
          config: {
            Account: '',
            Owner: '',
            OfferSequence: 0,
          },
        },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(1180, 200),
        data: { label: 'Finished', config: { Message: 'Escrow released!' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
    ],
  },
];

export function loadWorkflowsFromStorage(): Record<string, WorkflowDocumentV2> {
  try {
    // v2 is intentionally a clean break: old documents are neither read nor migrated.
    localStorage.removeItem(LEGACY_WORKFLOW_STORAGE_KEY);
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WorkflowDocumentV2>;
    return Object.fromEntries(Object.entries(parsed).filter(([, document]) => document?.version === WORKFLOW_VERSION));
  } catch { return {}; }
}

export function saveWorkflowsToStorage(workflows: Record<string, WorkflowDocumentV2>) {
  try {
    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflows));
  } catch { /* ignore */ }
}

/**
 * Always merges in any example workflows that aren't already stored by name.
 * This means new examples added to EXAMPLE_WORKFLOWS appear for existing users,
 * and any workflows the user has saved/renamed are preserved.
 */
export function initializeExamplesIfNeeded(): Record<string, WorkflowDocumentV2> {
  const existing = loadWorkflowsFromStorage();
  const result: Record<string, WorkflowDocumentV2> = { ...existing };
  let changed = false;
  for (const wf of EXAMPLE_WORKFLOWS) {
    if (!result[wf.name]) {
      const now = Date.now();
      result[wf.name] = {
        version: WORKFLOW_VERSION,
        id: `example-${wf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: wf.name,
        createdAt: now,
        updatedAt: now,
        nodes: wf.nodes as any,
        edges: wf.edges,
      };
      changed = true;
    }
  }
  if (changed) saveWorkflowsToStorage(result);
  return result;
}

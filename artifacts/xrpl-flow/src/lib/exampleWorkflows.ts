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

const RETIRED_EXAMPLE_WORKFLOW_NAMES = new Set([
  'Batch Txns (Devnet)',
]);

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

  // ── 7. Mint & List NFT ────────────────────────────────────────────────
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
  // ── 11. Token Holder Snapshot ─────────────────────────────────────────
  {
    name: 'Token Holder Snapshot',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'AccountLinesQuery', position: px(340, 200),
        data: {
          label: 'Query Trust Lines',
          config: {
            Account: '',
            Peer: '',
            Limit: 200,
            LedgerIndex: 'validated',
          },
        },
      },
      {
        id: 'n3', type: 'FilterItems', position: px(620, 200),
        data: {
          label: 'Keep Positive Balances',
          config: {
            SourcePath: 'items',
            FieldPath: 'balance',
            Operator: 'gt',
            Value: '0',
          },
        },
      },
      {
        id: 'n4', type: 'LogOutput', position: px(900, 200),
        data: { label: 'Holder Snapshot', config: { Message: 'Found {{output.meta.count}} positive trust lines. Use Log JSON for a holder/export snapshot.' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
    ],
  },

  // ── 12. Airdrop Prep: Query Eligible Wallets ──────────────────────────
  {
    name: 'Airdrop Prep: Query Eligible Wallets',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 220),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'AccountTxQuery', position: px(340, 220),
        data: {
          label: 'Query Campaign Tx History',
          config: {
            Account: '',
            LedgerIndexMin: -1,
            LedgerIndexMax: -1,
            Limit: 200,
            Forward: false,
          },
        },
      },
      {
        id: 'n3', type: 'FilterItems', position: px(620, 220),
        data: {
          label: 'Only Payments',
          config: {
            SourcePath: 'items',
            FieldPath: 'tx.TransactionType',
            Operator: 'equals',
            Value: 'Payment',
          },
        },
      },
      {
        id: 'n4', type: 'DedupeItems', position: px(900, 220),
        data: {
          label: 'Unique Participants',
          config: {
            SourcePath: 'items',
            FieldPath: 'tx.Account',
          },
        },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(1180, 220),
        data: { label: 'Airdrop List', config: { Message: 'Eligible wallet candidates: {{output.meta.count}}. Review/export the JSON before sending rewards.' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
    ],
  },

  // ── 13. NFT Issuer Analytics (Clio) ───────────────────────────────────
  {
    name: 'NFT Issuer Analytics (Clio)',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'NFTsByIssuerQuery', position: px(340, 200),
        data: {
          label: 'Query NFTs By Issuer',
          config: {
            Issuer: '',
            Limit: 100,
            LedgerIndex: 'validated',
          },
        },
      },
      {
        id: 'n3', type: 'LogOutput', position: px(620, 200),
        data: { label: 'NFT Count', config: { Message: 'Clio returned {{output.meta.count}} NFTs for this issuer.' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
    ],
  },

  // ── 14. Guarded Treasury Payout ───────────────────────────────────────
  {
    name: 'Guarded Treasury Payout',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 240),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'AccountInfoQuery', position: px(330, 240),
        data: {
          label: 'Check Treasury Balance',
          config: {
            Account: '',
            LedgerIndex: 'validated',
          },
        },
      },
      {
        id: 'n3', type: 'ConditionBranch', position: px(600, 240),
        data: {
          label: 'Enough XRP?',
          config: {
            Expression: 'output.data.account_data.Balance > 10000000',
            TrueLabel: 'Pay',
            FalseLabel: 'Stop',
          },
        },
      },
      {
        id: 'n4', type: 'Payment', position: px(880, 130),
        data: {
          label: 'Send Treasury Payout',
          config: {
            Account: '',
            Destination: '',
            Amount: { type: 'xrp', drops: '1000000' },
          },
        },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(880, 350),
        data: { label: 'Stop Reason', config: { Message: 'Treasury balance too low. Current drops: {{output.data.account_data.Balance}}' } },
      },
      {
        id: 'n6', type: 'LogOutput', position: px(1160, 130),
        data: { label: 'Paid', config: { Message: 'Treasury payout submitted: {{output.hash}}' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4', sourceHandle: 'true' },
      { id: 'e3-5', source: 'n3', target: 'n5', sourceHandle: 'false' },
      { id: 'e4-6', source: 'n4', target: 'n6' },
    ],
  },

  // ── 15. Fetch Trustlines CSV ──────────────────────────────────────────
  {
    name: 'Fetch Trustlines CSV',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 220),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'AccountLinesQuery', position: px(340, 220),
        data: {
          label: 'Fetch First 200 Trustlines',
          config: {
            Account: '',
            Peer: '',
            Limit: 200,
            LedgerIndex: 'validated',
          },
        },
      },
      {
        id: 'n3', type: 'FormatTrustLines', position: px(620, 220),
        data: {
          label: 'Friendly Holder Rows',
          config: {
            SourcePath: 'items',
            Perspective: 'account',
            AbsoluteBalances: false,
            IncludeZeroBalances: true,
          },
        },
      },
      {
        id: 'n4', type: 'ExportCsv', position: px(900, 220),
        data: {
          label: 'Export CSV',
          config: {
            SourcePath: 'items',
            FileName: 'trustlines.csv',
            Columns: 'counterparty=counterparty,balance=balance,currency=currency,limit=limit,limitPeer=limitPeer,noRipple=noRipple',
            Download: true,
          },
        },
      },
      {
        id: 'n5', type: 'LogOutput', position: px(1180, 220),
        data: { label: 'Done', config: { Message: 'Exported {{output.meta.count}} trustline rows to CSV.' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
    ],
  },

  // ── 16. Fetch All Holders by Issuer CSV ──────────────────────────────
  {
    name: 'Fetch All Holders by Issuer CSV',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 240),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'LoopContainer', position: px(330, 110), style: { width: 620, height: 290 },
        data: {
          label: 'Fetch Pages Until Marker Ends',
          config: {
            LoopMode: 'until-condition',
            Iterations: 50,
            Condition: '!output.data.marker',
            DelayBetween: 250,
          },
        },
      },
      {
        id: 'n3', type: 'AccountLinesQuery', position: px(35, 90), parentId: 'n2', extent: 'parent',
        data: {
          label: 'Fetch Trustline Page',
          config: {
            Account: '',
            Peer: '',
            Limit: 200,
            Marker: '{{output.data.marker}}',
            MarkerEndpoint: '{{output.data.markerEndpoint}}',
            LedgerIndex: 'validated',
          },
        },
      },
      {
        id: 'n4', type: 'AccumulateItems', position: px(330, 90), parentId: 'n2', extent: 'parent',
        data: {
          label: 'Accumulate Pages',
          config: {
            AccumulatorKey: 'issuer-holders',
            PageItemsPath: 'items',
            MarkerPath: 'data.marker',
            MarkerEndpointPath: 'data.markerEndpoint',
          },
        },
      },
      {
        id: 'n5', type: 'FormatTrustLines', position: px(1030, 240),
        data: {
          label: 'Format Holder Rows',
          config: {
            SourcePath: 'items',
            Perspective: 'issuer',
            AbsoluteBalances: true,
            IncludeZeroBalances: false,
          },
        },
      },
      {
        id: 'n6', type: 'ExportCsv', position: px(1300, 240),
        data: {
          label: 'Export Holders CSV',
          config: {
            SourcePath: 'items',
            FileName: 'issuer-holders.csv',
            Columns: 'holder=holder,balance=balance,currency=currency,rawBalance=rawBalance,limit=limit,authorized=authorized',
            Download: true,
          },
        },
      },
      {
        id: 'n7', type: 'LogOutput', position: px(1580, 240),
        data: { label: 'Done', config: { Message: 'Exported {{output.meta.count}} holder rows. If this hit 50 pages, increase Loop max iterations.' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-5', source: 'n2', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
      { id: 'e6-7', source: 'n6', target: 'n7' },
    ],
  },

  // ── 17. Vault Lifecycle Test Case (Devnet) ───────────────────────────
  {
    name: 'Vault Lifecycle Test Case (Devnet)',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      {
        id: 'n2', type: 'VaultCreate', position: px(330, 220),
        data: { label: 'Create XRP Vault', config: { Account: '', Asset: { type: 'xrp', currency: 'XRP' }, AssetsMaximum: '1000000000', WithdrawalPolicy: 0 } },
      },
      { id: 'n3', type: 'LogOutput', position: px(600, 220), data: { label: 'Copy VaultID', config: { Message: 'VaultCreate submitted. Copy the created VaultID from the validated transaction metadata, then fill it into the next nodes.' } } },
      {
        id: 'n4', type: 'VaultDeposit', position: px(880, 120),
        data: { label: 'Deposit Asset', config: { Account: '', VaultID: '', Amount: { type: 'xrp', drops: '1000000' } } },
      },
      {
        id: 'n5', type: 'VaultWithdraw', position: px(1160, 120),
        data: { label: 'Withdraw Asset', config: { Account: '', VaultID: '', Amount: { type: 'xrp', drops: '500000' }, Destination: '' } },
      },
      {
        id: 'n6', type: 'VaultDelete', position: px(1440, 120),
        data: { label: 'Delete Empty Vault', config: { Account: '', VaultID: '' } },
      },
      { id: 'n7', type: 'LogOutput', position: px(1720, 120), data: { label: 'Lifecycle Done', config: { Message: 'Vault lifecycle test completed. If delete failed, verify all shares/assets were withdrawn first.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
      { id: 'e6-7', source: 'n6', target: 'n7' },
    ],
  },

  // ── 18. Private Vault Configuration Test ─────────────────────────────
  {
    name: 'Private Vault Configuration Test',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      {
        id: 'n2', type: 'VaultCreate', position: px(340, 220),
        data: { label: 'Create Private Vault', config: { Account: '', Asset: { type: 'xrp', currency: 'XRP' }, AssetsMaximum: '5000000000', Data: '', DomainID: '', tfVaultPrivate: true, tfVaultShareNonTransferable: true } },
      },
      { id: 'n3', type: 'Delay', position: px(620, 220), data: { label: 'Wait Ledger', config: { DelayMode: 'ledger-close' } } },
      {
        id: 'n4', type: 'VaultSet', position: px(900, 220),
        data: { label: 'Update Vault Metadata', config: { Account: '', VaultID: '', Data: '', AssetsMaximum: '8000000000', DomainID: '' } },
      },
      { id: 'n5', type: 'LogOutput', position: px(1180, 220), data: { label: 'Config Done', config: { Message: 'Private vault config test submitted. Fill VaultID from the create transaction before running VaultSet.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
    ],
  },

  // ── 19. Vault Clawback Test Case ─────────────────────────────────────
  {
    name: 'Vault Clawback Test Case',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 200), data: { label: 'Manual Trigger', config: {} } },
      {
        id: 'n2', type: 'VaultClawback', position: px(360, 200),
        data: { label: 'Claw Back Holder Assets', config: { Account: '', VaultID: '', Holder: '', Amount: { type: 'xrp', drops: '100000' } } },
      },
      { id: 'n3', type: 'LogOutput', position: px(660, 200), data: { label: 'Result', config: { Message: 'Vault clawback submitted. Confirm holder, cap amount, and issuer account before Mainnet-like testing.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
    ],
  },

  // ── 20. Loan Broker Setup Test Case ──────────────────────────────────
  {
    name: 'Loan Broker Setup Test Case',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      {
        id: 'n2', type: 'VaultCreate', position: px(340, 220),
        data: { label: 'Create Funding Vault', config: { Account: '', Asset: { type: 'xrp', currency: 'XRP' }, AssetsMaximum: '10000000000', WithdrawalPolicy: 0 } },
      },
      { id: 'n3', type: 'LogOutput', position: px(620, 220), data: { label: 'Paste VaultID', config: { Message: 'Copy VaultID from the create result, then fill LoanBrokerSet.VaultID.' } } },
      {
        id: 'n4', type: 'LoanBrokerSet', position: px(900, 220),
        data: { label: 'Create Loan Broker', config: { Account: '', VaultID: '', DebtMaximum: '5000000000', ManagementFeeRate: 0, CoverRateMinimum: 120000, CoverRateLiquidation: 110000 } },
      },
      {
        id: 'n5', type: 'LoanBrokerCoverDeposit', position: px(1180, 220),
        data: { label: 'Deposit First-Loss Cover', config: { Account: '', LoanBrokerID: '', Amount: { type: 'xrp', drops: '1000000' } } },
      },
      { id: 'n6', type: 'LogOutput', position: px(1460, 220), data: { label: 'Setup Done', config: { Message: 'Broker setup test complete. Fill LoanBrokerID from broker creation before cover deposit.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
    ],
  },

  // ── 21. Loan Origination Test Case ───────────────────────────────────
  {
    name: 'Loan Origination Test Case',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      {
        id: 'n2', type: 'LoanSet', position: px(360, 220),
        data: { label: 'Create Loan Agreement', config: { Account: '', LoanBrokerID: '', PrincipalRequested: '1000000', Counterparty: '', LoanOriginationFee: '0', LoanServiceFee: '0', InterestRate: 500, PaymentTotal: 4, PaymentInterval: 86400, GracePeriod: 3600, tfLoanOverpayment: true } },
      },
      { id: 'n3', type: 'LogOutput', position: px(660, 220), data: { label: 'Loan Created', config: { Message: 'LoanSet submitted. For this node, select the counterparty wallet in Advanced signing config if required.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
    ],
  },

  // ── 22. Loan Payment Modes Test Matrix ───────────────────────────────
  {
    name: 'Loan Payment Modes Test Matrix',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 260), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'ParallelSplit', position: px(330, 260), data: { label: 'Payment Mode Matrix', config: {} } },
      {
        id: 'n3', type: 'LoanPay', position: px(600, 80),
        data: { label: 'Normal Payment', config: { Account: '', LoanID: '', Amount: { type: 'xrp', drops: '250000' } } },
      },
      {
        id: 'n4', type: 'LoanPay', position: px(600, 200),
        data: { label: 'Late Payment', config: { Account: '', LoanID: '', Amount: { type: 'xrp', drops: '250000' }, tfLoanLatePayment: true } },
      },
      {
        id: 'n5', type: 'LoanPay', position: px(600, 320),
        data: { label: 'Overpayment', config: { Account: '', LoanID: '', Amount: { type: 'xrp', drops: '500000' }, tfLoanOverpayment: true } },
      },
      {
        id: 'n6', type: 'LoanPay', position: px(600, 440),
        data: { label: 'Full Early Payment', config: { Account: '', LoanID: '', Amount: { type: 'xrp', drops: '1000000' }, tfLoanFullPayment: true } },
      },
      { id: 'n7', type: 'SyncJoin', position: px(920, 260), data: { label: 'All Payment Cases Submitted', config: {} } },
      { id: 'n8', type: 'LogOutput', position: px(1160, 260), data: { label: 'Matrix Done', config: { Message: 'Payment mode matrix complete. Use separate LoanIDs per branch if cases should not mutate the same loan.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e2-4', source: 'n2', target: 'n4' },
      { id: 'e2-5', source: 'n2', target: 'n5' },
      { id: 'e2-6', source: 'n2', target: 'n6' },
      { id: 'e3-7', source: 'n3', target: 'n7' },
      { id: 'e4-7', source: 'n4', target: 'n7' },
      { id: 'e5-7', source: 'n5', target: 'n7' },
      { id: 'e6-7', source: 'n6', target: 'n7' },
      { id: 'e7-8', source: 'n7', target: 'n8' },
    ],
  },

  // ── 23. Loan State Management Test Case ──────────────────────────────
  {
    name: 'Loan State Management Test Case',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'LoanManage', position: px(340, 160), data: { label: 'Mark Impaired', config: { Account: '', LoanID: '', tfLoanImpair: true } } },
      { id: 'n3', type: 'Delay', position: px(600, 160), data: { label: 'Wait Ledger', config: { DelayMode: 'ledger-close' } } },
      { id: 'n4', type: 'LoanManage', position: px(860, 160), data: { label: 'Unimpaired', config: { Account: '', LoanID: '', tfLoanUnimpair: true } } },
      { id: 'n5', type: 'LoanManage', position: px(1120, 160), data: { label: 'Mark Default', config: { Account: '', LoanID: '', tfLoanDefault: true } } },
      { id: 'n6', type: 'LoanDelete', position: px(1380, 160), data: { label: 'Delete Repaid Loan', config: { Account: '', LoanID: '' } } },
      { id: 'n7', type: 'LogOutput', position: px(1640, 160), data: { label: 'State Done', config: { Message: 'Loan state test submitted. Delete only succeeds for eligible fully-repaid loans.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
      { id: 'e6-7', source: 'n6', target: 'n7' },
    ],
  },

  // ── 24. Cover Withdraw & Clawback Test ───────────────────────────────
  {
    name: 'Cover Withdraw & Clawback Test',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'ParallelSplit', position: px(330, 220), data: { label: 'Cover Actions', config: {} } },
      { id: 'n3', type: 'LoanBrokerCoverWithdraw', position: px(620, 120), data: { label: 'Withdraw Cover', config: { Account: '', LoanBrokerID: '', Amount: { type: 'xrp', drops: '100000' }, Destination: '' } } },
      { id: 'n4', type: 'LoanBrokerCoverClawback', position: px(620, 320), data: { label: 'Clawback Cover', config: { Account: '', LoanBrokerID: '', Amount: { type: 'xrp', drops: '100000' } } } },
      { id: 'n5', type: 'SyncJoin', position: px(920, 220), data: { label: 'Join', config: {} } },
      { id: 'n6', type: 'LogOutput', position: px(1160, 220), data: { label: 'Cover Done', config: { Message: 'Cover withdraw/clawback cases submitted. Use separate broker IDs if cases should not conflict.' } } },
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

  // ── 25. Check Payment Lifecycle ──────────────────────────────────────
  {
    name: 'Check Payment Lifecycle',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'CheckCreate', position: px(340, 220), data: { label: 'Create Check', config: { Account: '', Destination: '', SendMax: { type: 'xrp', drops: '1000000' } } } },
      { id: 'n3', type: 'LogOutput', position: px(620, 220), data: { label: 'Copy CheckID', config: { Message: 'Copy CheckID from the created ledger object, then fill CheckCash or CheckCancel.' } } },
      { id: 'n4', type: 'CheckCash', position: px(900, 220), data: { label: 'Cash Check', config: { Account: '', CheckID: '', Amount: { type: 'xrp', drops: '1000000' } } } },
      { id: 'n5', type: 'LogOutput', position: px(1180, 220), data: { label: 'Done', config: { Message: 'Check lifecycle action submitted. Use CheckCancel separately if you want the cancel path.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
    ],
  },

  // ── 26. NFT Offer Lifecycle Test ─────────────────────────────────────
  {
    name: 'NFT Offer Lifecycle Test',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'NFTokenMint', position: px(340, 220), data: { label: 'Mint NFT', config: { Account: '', NFTokenTaxon: 0, TransferFee: 0, tfTransferable: true, tfBurnable: true } } },
      { id: 'n3', type: 'LogOutput', position: px(620, 220), data: { label: 'Copy NFTokenID', config: { Message: 'Copy NFTokenID from mint result, then fill offer/accept/burn nodes.' } } },
      { id: 'n4', type: 'NFTokenCreateOffer', position: px(900, 120), data: { label: 'Create Sell Offer', config: { Account: '', NFTokenID: '', Amount: { type: 'xrp', drops: '1000000' }, tfSellNFToken: true } } },
      { id: 'n5', type: 'NFTokenAcceptOffer', position: px(1180, 220), data: { label: 'Accept Offer', config: { Account: '', NFTokenSellOffer: '' } } },
      { id: 'n6', type: 'NFTokenBurn', position: px(1460, 220), data: { label: 'Burn NFT Optional', config: { Account: '', NFTokenID: '' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e4-5', source: 'n4', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
    ],
  },

  // ── 27. Account Audit CSV ────────────────────────────────────────────
  {
    name: 'Account Audit CSV',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 240), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'ParallelSplit', position: px(320, 240), data: { label: 'Audit Queries', config: {} } },
      { id: 'n3', type: 'AccountObjectsQuery', position: px(600, 120), data: { label: 'Owned Objects', config: { Account: '', Limit: 200, LedgerIndex: 'validated' } } },
      { id: 'n4', type: 'ExportCsv', position: px(880, 120), data: { label: 'Export Objects CSV', config: { SourcePath: 'items', FileName: 'account-objects.csv', Columns: 'type=LedgerEntryType,index=index,previousTxn=PreviousTxnID', Download: true } } },
      { id: 'n5', type: 'AccountTxQuery', position: px(600, 360), data: { label: 'Recent Transactions', config: { Account: '', LedgerIndexMin: -1, LedgerIndexMax: -1, Limit: 200 } } },
      { id: 'n6', type: 'ExportCsv', position: px(880, 360), data: { label: 'Export Tx CSV', config: { SourcePath: 'items', FileName: 'account-transactions.csv', Columns: 'hash=tx.hash,type=tx.TransactionType,account=tx.Account,result=meta.TransactionResult', Download: true } } },
      { id: 'n7', type: 'SyncJoin', position: px(1160, 240), data: { label: 'Audit Exports Done', config: {} } },
      { id: 'n8', type: 'LogOutput', position: px(1400, 240), data: { label: 'Done', config: { Message: 'Account audit CSV exports completed.' } } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2' },
      { id: 'e2-3', source: 'n2', target: 'n3' },
      { id: 'e3-4', source: 'n3', target: 'n4' },
      { id: 'e2-5', source: 'n2', target: 'n5' },
      { id: 'e5-6', source: 'n5', target: 'n6' },
      { id: 'e4-7', source: 'n4', target: 'n7' },
      { id: 'e6-7', source: 'n6', target: 'n7' },
      { id: 'e7-8', source: 'n7', target: 'n8' },
    ],
  },

  // ── 28. DEX Offer Placement Test ─────────────────────────────────────
  {
    name: 'DEX Offer Placement Test',
    nodes: [
      { id: 'n1', type: 'ManualTrigger', position: px(80, 220), data: { label: 'Manual Trigger', config: {} } },
      { id: 'n2', type: 'OfferCreate', position: px(340, 220), data: { label: 'Create Offer', config: { Account: '', TakerPays: { type: 'xrp', drops: '1000000' }, TakerGets: { type: 'token', currency: 'USD', issuer: '', value: '1' } } } },
      { id: 'n3', type: 'Delay', position: px(620, 220), data: { label: 'Wait Ledger', config: { DelayMode: 'ledger-close' } } },
      { id: 'n4', type: 'AccountObjectsQuery', position: px(900, 220), data: { label: 'Query Open Offers', config: { Account: '', ObjectType: 'offer', Limit: 200, LedgerIndex: 'validated' } } },
      { id: 'n5', type: 'ExportCsv', position: px(1180, 220), data: { label: 'Export Offers CSV', config: { SourcePath: 'items', FileName: 'open-offers.csv', Columns: 'sequence=Sequence,takerPays=TakerPays,takerGets=TakerGets,flags=Flags', Download: true } } },
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

export function createExampleWorkflowDocuments(): Record<string, WorkflowDocumentV2> {
  const now = 0;
  return Object.fromEntries(EXAMPLE_WORKFLOWS.map(wf => [
    wf.name,
    {
      version: WORKFLOW_VERSION,
      id: `example-${wf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: wf.name,
      createdAt: now,
      updatedAt: now,
      nodes: wf.nodes as any,
      edges: wf.edges,
    },
  ]));
}

/**
 * Loads only user-owned local workflows. Curated examples are intentionally
 * not persisted in localStorage anymore; the library renders them from
 * EXAMPLE_WORKFLOWS so they cannot multiply into user drafts.
 */
export function initializeExamplesIfNeeded(): Record<string, WorkflowDocumentV2> {
  const result = loadWorkflowsFromStorage();
  let changed = false;
  for (const name of RETIRED_EXAMPLE_WORKFLOW_NAMES) {
    if (result[name]?.id?.startsWith('example-')) {
      delete result[name];
      changed = true;
    }
  }
  for (const [name, document] of Object.entries(result)) {
    if (document.id?.startsWith('example-')) {
      delete result[name];
      changed = true;
    }
  }
  if (changed) saveWorkflowsToStorage(result);
  return result;
}

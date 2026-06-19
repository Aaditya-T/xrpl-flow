import { Node, Edge } from '@xyflow/react';

export interface ExampleWorkflow {
  name: string;
  nodes: Node[];
  edges: Edge[];
}

const px = (x: number, y: number) => ({ x, y });

export const EXAMPLE_WORKFLOWS: ExampleWorkflow[] = [
  {
    name: 'Send XRP',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(100, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'Payment', position: px(380, 200),
        data: {
          label: 'Payment',
          config: {
            Account: '',
            Destination: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            Amount: '1000000',
          },
        },
      },
      {
        id: 'n3', type: 'LogOutput', position: px(660, 200),
        data: { label: 'Log Output', config: { Message: 'Payment complete!' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: false },
      { id: 'e2-3', source: 'n2', target: 'n3', animated: false },
    ],
  },
  {
    name: 'Trustline + Token Send',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'TrustSet', position: px(340, 200),
        data: {
          label: 'TrustSet',
          config: {
            Account: '',
            LimitAmount_currency: 'USD',
            LimitAmount_issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            LimitAmount_value: '1000',
          },
        },
      },
      {
        id: 'n3', type: 'Payment', position: px(620, 200),
        data: {
          label: 'Payment (Token)',
          config: {
            Account: '',
            Destination: '',
            Amount: '10/USD/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
          },
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: false },
      { id: 'e2-3', source: 'n2', target: 'n3', animated: false },
    ],
  },
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
          config: { Account: '', NFTokenTaxon: 0, TransferFee: 500, Flags: 8 },
        },
      },
      {
        id: 'n3', type: 'NFTokenCreateOffer', position: px(620, 200),
        data: {
          label: 'NFTokenCreateOffer',
          config: { Account: '', NFTokenID: '', Amount: '1000000', Flags: 1 },
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: false },
      { id: 'e2-3', source: 'n2', target: 'n3', animated: false },
    ],
  },
  {
    name: 'Create MPT Issuance',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 200),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'MPTokenIssuanceCreate', position: px(340, 200),
        data: {
          label: 'MPTokenIssuanceCreate',
          config: {
            Account: '',
            AssetScale: 2,
            MaximumAmount: '1000000',
            Flags: 66,
          },
        },
      },
      {
        id: 'n3', type: 'MPTokenAuthorize', position: px(620, 200),
        data: {
          label: 'MPTokenAuthorize',
          config: { Account: '', MPTokenIssuanceID: '' },
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: false },
      { id: 'e2-3', source: 'n2', target: 'n3', animated: false },
    ],
  },
  {
    name: 'Issue & Accept Credential',
    nodes: [
      {
        id: 'n1', type: 'ManualTrigger', position: px(80, 150),
        data: { label: 'Manual Trigger', config: {} },
      },
      {
        id: 'n2', type: 'CredentialCreate', position: px(340, 150),
        data: {
          label: 'CredentialCreate',
          config: {
            Account: '',
            Subject: '',
            CredentialType: '6B59432D4944',
          },
        },
      },
      {
        id: 'n3', type: 'CredentialAccept', position: px(620, 150),
        data: {
          label: 'CredentialAccept',
          config: {
            Account: '',
            Issuer: '',
            CredentialType: '6B59432D4944',
          },
        },
      },
      {
        id: 'n4', type: 'LogOutput', position: px(900, 150),
        data: { label: 'Log Output', config: { Message: 'Credential workflow complete' } },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: false },
      { id: 'e2-3', source: 'n2', target: 'n3', animated: false },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: false },
    ],
  },
];

const STORAGE_KEY = 'xrplFlow_workflows';
const INIT_KEY = 'xrplFlow_initialized';

export function loadWorkflowsFromStorage(): Record<string, { name: string; nodes: Node[]; edges: Edge[] }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveWorkflowsToStorage(workflows: Record<string, { name: string; nodes: Node[]; edges: Edge[] }>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
  } catch { /* ignore */ }
}

export function initializeExamplesIfNeeded(): Record<string, { name: string; nodes: Node[]; edges: Edge[] }> {
  const existing = loadWorkflowsFromStorage();
  if (Object.keys(existing).length > 0 || localStorage.getItem(INIT_KEY)) {
    return existing;
  }
  const result: Record<string, { name: string; nodes: Node[]; edges: Edge[] }> = { ...existing };
  for (const wf of EXAMPLE_WORKFLOWS) {
    result[wf.name] = { name: wf.name, nodes: wf.nodes, edges: wf.edges };
  }
  saveWorkflowsToStorage(result);
  localStorage.setItem(INIT_KEY, '1');
  return result;
}

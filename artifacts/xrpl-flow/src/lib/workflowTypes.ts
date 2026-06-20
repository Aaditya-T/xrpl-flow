import type { Edge, Node } from '@xyflow/react';

export const WORKFLOW_VERSION = 2 as const;
export const WORKFLOW_STORAGE_KEY = 'xrplFlow_workflows_v2';
export const LEGACY_WORKFLOW_STORAGE_KEY = 'xrplFlow_workflows';

export type AmountValue =
  | { type: 'xrp'; drops: string }
  | { type: 'token'; currency: string; issuer: string; value: string }
  | { type: 'mpt'; issuanceId: string; value: string };

export type IssueValue =
  | { type: 'xrp'; currency: 'XRP' }
  | { type: 'token'; currency: string; issuer: string }
  | { type: 'mpt'; issuanceId: string };

export type SigningConfig = {
  mode?: 'single' | 'multi';
  signerWalletIds?: string[];
  counterpartyWalletId?: string;
};

export type WorkflowNodeData = {
  label: string;
  config: Record<string, unknown>;
  signing?: SigningConfig;
};

export type WorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowDocumentV2 {
  version: typeof WORKFLOW_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: Edge[];
}

export interface ExecutionToken {
  runId: string;
  tokenId: string;
  branchId: string;
  splitId?: string;
}

export type ExecutionEventStatus =
  | 'queued'
  | 'running'
  | 'awaiting-review'
  | 'submitted'
  | 'validated'
  | 'failed'
  | 'cancelled';

export interface ExecutionEvent {
  token: ExecutionToken;
  nodeId: string;
  status: ExecutionEventStatus;
  message: string;
  transaction?: Record<string, unknown>;
  txHash?: string;
}

export interface TransactionReviewRequest {
  id: string;
  nodeId: string;
  nodeLabel: string;
  network: 'mainnet' | 'testnet' | 'devnet';
  transaction: Record<string, unknown>;
  signerAddresses: string[];
  simulation?: unknown;
  warnings: string[];
}

export interface SigningRequest {
  transaction: Record<string, unknown>;
  account: string;
  mode: 'single' | 'multi';
  signerWalletIds: string[];
}

export interface SigningResult {
  txBlob: string;
  hash: string;
  signerAddresses: string[];
}

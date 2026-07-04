import type { Edge, Node } from '@xyflow/react';
import * as XRPL from 'xrpl';
import { NODE_REGISTRY, type FieldDef, type NodeTypeDef } from '@/lib/nodeRegistry';
import { QUERY_NODE_TYPES } from '@/lib/queryNodes';
import type { AmountValue, IssueValue, WorkflowDocumentV2 } from '@/lib/workflowTypes';

export const ACCOUNT = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
export const COUNTERPARTY = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
export const ISSUER = 'rrrrrrrrrrrrrrrrrrrrBZbvji';
export const HEX_32 = 'A'.repeat(32);
export const HEX_64 = 'B'.repeat(64);
export const CREDENTIAL_TYPE_HEX = '4B5943';

const generatedWallet = XRPL.Wallet.generate();

export const TEST_WALLET = {
  id: 'wallet-1',
  name: 'Generated Test Wallet',
  address: generatedWallet.address,
  publicKey: generatedWallet.publicKey,
  seed: generatedWallet.seed,
};

export function xrpAmount(drops = '1000000'): AmountValue {
  return { type: 'xrp', drops };
}

export function tokenAmount(value = '10'): AmountValue {
  return { type: 'token', currency: 'USD', issuer: ISSUER, value };
}

export function xrpIssue(): IssueValue {
  return { type: 'xrp', currency: 'XRP' };
}

export function tokenIssue(): IssueValue {
  return { type: 'token', currency: 'USD', issuer: ISSUER };
}

function jsonFieldValue(name: string): string {
  switch (name) {
    case 'AcceptedCredentials':
    case 'AuthorizeCredentials':
    case 'UnauthorizeCredentials':
      return JSON.stringify([{ Credential: { Issuer: ISSUER, CredentialType: CREDENTIAL_TYPE_HEX } }]);
    case 'AuthAccounts':
      return JSON.stringify([{ AuthAccount: { Account: COUNTERPARTY } }]);
    case 'CredentialIDs':
    case 'NFTokenOffers':
      return JSON.stringify([HEX_64]);
    case 'Memos':
      return JSON.stringify([{ Memo: { MemoData: '6869' } }]);
    case 'Paths':
      return JSON.stringify([[{ account: COUNTERPARTY }]]);
    case 'Permissions':
      return JSON.stringify([{ Permission: { PermissionValue: 'Payment' } }]);
    case 'PriceDataSeries':
      return JSON.stringify([{ PriceData: { BaseAsset: 'XRP', QuoteAsset: 'USD', AssetPrice: '1000000', Scale: 6 } }]);
    case 'SignerEntries':
      return JSON.stringify([{ SignerEntry: { Account: COUNTERPARTY, SignerWeight: 1 } }]);
    default:
      return JSON.stringify({});
  }
}

function fieldValue(field: FieldDef): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  switch (field.name) {
    case 'Account':
      return ACCOUNT;
    case 'Authorize':
    case 'Counterparty':
    case 'Destination':
    case 'Holder':
    case 'Issuer':
    case 'MPTokenHolder':
    case 'NFTokenMinter':
    case 'Owner':
    case 'RegularKey':
    case 'Subject':
    case 'Unauthorize':
      return COUNTERPARTY;
    case 'LimitAmount_currency':
      return 'USD';
    case 'LimitAmount_issuer':
      return ISSUER;
    case 'LimitAmount_value':
      return '100';
    case 'CredentialType':
      return CREDENTIAL_TYPE_HEX;
    case 'PublicKey':
      return TEST_WALLET.publicKey;
    case 'MaximumAmount':
    case 'AssetsMaximum':
    case 'DebtMaximum':
    case 'PrincipalRequested':
    case 'LoanOriginationFee':
    case 'LoanServiceFee':
    case 'LatePaymentFee':
    case 'ClosePaymentFee':
      return '100';
  }

  switch (field.type) {
    case 'address':
      return COUNTERPARTY;
    case 'amount':
      return xrpAmount();
    case 'boolean':
      return false;
    case 'drops':
      return '1000000';
    case 'hex':
      return HEX_64;
    case 'issue':
      return field.name.endsWith('2') ? tokenIssue() : xrpIssue();
    case 'number':
      return 1;
    case 'select':
      return field.defaultValue ?? field.options?.[0] ?? '';
    case 'textarea':
      return jsonFieldValue(field.name);
    case 'text':
      return '100';
  }
}

export function validTransactionConfig(type: string): Record<string, unknown> {
  const definition = NODE_REGISTRY.find(item => item.id === type);
  if (!definition) throw new Error(`Unknown node type: ${type}`);
  const config = Object.fromEntries(
    definition.fields
      .filter(field => field.required)
      .map(field => [field.name, fieldValue(field)]),
  );

  const overrides: Record<string, Record<string, unknown>> = {
    AMMBid: { BidMin: tokenAmount('1'), BidMax: tokenAmount('2') },
    AMMClawback: { Account: ISSUER, Asset: tokenIssue(), Amount: tokenAmount('1') },
    AMMCreate: { Amount: xrpAmount('10000000'), Amount2: tokenAmount('100'), TradingFee: 100 },
    AMMDeposit: { Amount: xrpAmount('10000000'), Amount2: tokenAmount('100'), tfTwoAsset: true },
    AMMWithdraw: { Amount: xrpAmount('1000000'), Amount2: tokenAmount('10'), tfTwoAsset: true },
    CheckCash: { Amount: xrpAmount('1000000') },
    Clawback: { Amount: tokenAmount('1') },
    CredentialDelete: { Issuer: ISSUER },
    DepositPreauth: { Authorize: COUNTERPARTY },
    DIDSet: { URI: '68747470733A2F2F6578616D706C652E636F6D' },
    EscrowCreate: { FinishAfter: 800000000 },
    LoanBrokerCoverClawback: { LoanBrokerID: HEX_64, Amount: tokenAmount('1') },
    NFTokenAcceptOffer: { NFTokenSellOffer: HEX_64 },
    NFTokenCancelOffer: { NFTokenOffers: JSON.stringify([HEX_64]) },
    NFTokenCreateOffer: { Amount: xrpAmount('1000000'), tfSellNFToken: true },
    OfferCreate: { TakerPays: xrpAmount('1000000'), TakerGets: tokenAmount('5') },
    OracleSet: { LastUpdateTime: 1_700_000_000, PriceDataSeries: jsonFieldValue('PriceDataSeries') },
    PaymentChannelClaim: { Balance: '0', Amount: '1' },
    PermissionedDomainSet: { AcceptedCredentials: jsonFieldValue('AcceptedCredentials') },
    SignerListSet: { SignerQuorum: 1, SignerEntries: jsonFieldValue('SignerEntries') },
  };

  return {
    Account: ACCOUNT,
    ...config,
    ...(overrides[type] ?? {}),
  };
}

export function transactionDefinitions(): NodeTypeDef[] {
  const nonTransactions = new Set([
    'ManualTrigger', 'AccountEventTrigger', 'ConditionBranch', 'ParallelSplit',
    'SyncJoin', 'LoopContainer', 'Delay', 'LogOutput', 'BatchContainer',
    ...QUERY_NODE_TYPES,
  ]);
  return NODE_REGISTRY.filter(item => !nonTransactions.has(item.id));
}

export function workflowNode(type: string, id = type, config: Record<string, unknown> = {}): Node {
  const definition = NODE_REGISTRY.find(item => item.id === type);
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? type,
      config,
    },
  };
}

export function edge(source: string, target: string, extra: Partial<Edge> = {}): Edge {
  return {
    id: `${source}-${extra.sourceHandle ? `${extra.sourceHandle}-` : ''}${target}`,
    source,
    target,
    ...extra,
  };
}

export function validWorkflowDocument(overrides: Partial<WorkflowDocumentV2> = {}): WorkflowDocumentV2 {
  const now = Date.now();
  return {
    version: 2,
    id: 'workflow-test',
    name: 'Test Workflow',
    createdAt: now,
    updatedAt: now,
    nodes: [workflowNode('ManualTrigger', 'start'), workflowNode('LogOutput', 'log', { Message: 'ok' })],
    edges: [edge('start', 'log')],
    ...overrides,
  };
}

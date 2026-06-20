import * as XRPL from 'xrpl';
import { z } from 'zod';
import { NODE_REGISTRY, type FieldDef, type NodeTypeDef } from './nodeRegistry';
import type { AmountValue, IssueValue } from './workflowTypes';

export type TransactionConfig = Record<string, unknown>;

export interface TransactionAdapter<TConfig extends TransactionConfig = TransactionConfig> {
  type: string;
  definition: NodeTypeDef;
  schema: z.ZodType<TConfig>;
  flags: Readonly<Record<string, number>>;
  availability: NodeTypeDef['networkGating'];
  build(config: TConfig, fallbackAccount: string, innerBatch?: boolean): XRPL.SubmittableTransaction;
  validate(config: unknown, fallbackAccount: string): string[];
}

const NON_TRANSACTION_TYPES = new Set([
  'ManualTrigger', 'AccountEventTrigger', 'ConditionBranch', 'ParallelSplit',
  'SyncJoin', 'LoopContainer', 'Delay', 'LogOutput', 'BatchContainer',
]);

const JSON_FIELDS = new Set([
  'AcceptedCredentials', 'AuthAccounts', 'AuthorizeCredentials', 'CredentialIDs',
  'Memos', 'NFTokenOffers', 'Paths', 'Permissions', 'PriceDataSeries',
  'SignerEntries', 'UnauthorizeCredentials',
]);

const FLAG_VALUES: Record<string, Record<string, number>> = {
  AccountSet: { tfRequireDestTag: 0x00010000, tfOptionalDestTag: 0x00020000, tfRequireAuth: 0x00040000, tfOptionalAuth: 0x00080000, tfDisallowXRP: 0x00100000, tfAllowXRP: 0x00200000 },
  Payment: { tfNoRippleDirect: 0x00010000, tfPartialPayment: 0x00020000, tfLimitQuality: 0x00040000 },
  PaymentChannelClaim: { tfRenew: 0x00010000, tfClose: 0x00020000 },
  TrustSet: { tfSetfAuth: 0x00010000, tfSetNoRipple: 0x00020000, tfClearNoRipple: 0x00040000, tfSetFreeze: 0x00100000, tfClearFreeze: 0x00200000 },
  OfferCreate: { tfPassive: 0x00010000, tfImmediateOrCancel: 0x00020000, tfFillOrKill: 0x00040000, tfSell: 0x00080000 },
  AMMDeposit: { tfLPToken: 0x00010000, tfSingleAsset: 0x00080000, tfTwoAsset: 0x00100000, tfOneAssetLPToken: 0x00200000, tfLimitLPToken: 0x00400000, tfTwoAssetIfEmpty: 0x00800000 },
  AMMWithdraw: { tfLPToken: 0x00010000, tfWithdrawAll: 0x00020000, tfOneAssetWithdrawAll: 0x00040000, tfSingleAsset: 0x00080000, tfTwoAsset: 0x00100000, tfOneAssetLPToken: 0x00200000, tfLimitLPToken: 0x00400000 },
  AMMClawback: { tfClawTwoAssets: 0x00000001 },
  MPTokenIssuanceCreate: { tfMPTCanLock: 0x00000002, tfMPTRequireAuth: 0x00000004, tfMPTCanEscrow: 0x00000008, tfMPTCanTrade: 0x00000010, tfMPTCanTransfer: 0x00000020, tfMPTCanClawback: 0x00000040 },
  MPTokenIssuanceSet: { tfMPTLock: 0x00000001, tfMPTUnlock: 0x00000002 },
  MPTokenAuthorize: { tfMPTUnauthorize: 0x00000001 },
  NFTokenMint: { tfBurnable: 0x00000001, tfOnlyXRP: 0x00000002, tfTrustLine: 0x00000004, tfTransferable: 0x00000008, tfMutable: 0x00000010 },
  NFTokenCreateOffer: { tfSellNFToken: 0x00000001 },
  VaultCreate: { tfVaultPrivate: 0x00010000, tfVaultShareNonTransferable: 0x00020000 },
  LoanSet: { tfLoanOverpayment: 0x00010000 },
  LoanPay: { tfLoanOverpayment: 0x00010000, tfLoanFullPayment: 0x00020000, tfLoanLatePayment: 0x00040000 },
  LoanManage: { tfLoanDefault: 0x00010000, tfLoanImpair: 0x00020000, tfLoanUnimpair: 0x00040000 },
};

const INNER_BATCH_FLAG = 0x40000000;

function present(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value !== 'object') return true;
  if ('type' in value) {
    const typed = value as { type?: string; drops?: string; currency?: string; issuer?: string; value?: string; issuanceId?: string };
    if (typed.type === 'xrp') return typed.drops !== undefined ? Boolean(typed.drops) : typed.currency === 'XRP';
    if (typed.type === 'token') return Boolean(typed.currency && typed.issuer && (typed.value === undefined || typed.value !== ''));
    if (typed.type === 'mpt') return Boolean(typed.issuanceId && (typed.value === undefined || typed.value !== ''));
  }
  return true;
}

function createConfigSchema(fields: FieldDef[]): z.ZodType<TransactionConfig> {
  return z.record(z.unknown()).superRefine((config, ctx) => {
    for (const field of fields) {
      if (field.required && field.name !== 'Account' && !present(config[field.name])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.name], message: `${field.label} is required` });
      }
    }
  });
}

function parseJsonField(name: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} must contain valid JSON.`);
  }
}

export function toXRPLAmount(value: unknown): unknown {
  if (typeof value === 'string') return value;
  const amount = value as AmountValue | undefined;
  if (!amount) return undefined;
  if (amount.type === 'xrp') return amount.drops;
  if (amount.type === 'token') return { currency: amount.currency, issuer: amount.issuer, value: amount.value };
  if (amount.type === 'mpt') return { mpt_issuance_id: amount.issuanceId, value: amount.value };
  return undefined;
}

export function toXRPLIssue(value: unknown): unknown {
  const issue = value as IssueValue | undefined;
  if (!issue) return undefined;
  if (issue.type === 'xrp') return { currency: 'XRP' };
  if (issue.type === 'token') return { currency: issue.currency, issuer: issue.issuer };
  if (issue.type === 'mpt') return { mpt_issuance_id: issue.issuanceId };
  return undefined;
}

function composeFlags(type: string, config: TransactionConfig, innerBatch: boolean): number | undefined {
  const selected = Object.keys(FLAG_VALUES[type] ?? {}).filter(name => config[name] === true);
  if (present(config.Flags) && selected.length) throw new Error(`Use either raw Flags or named flag toggles for ${type}, not both.`);
  const incompatibleGroups: Record<string, string[][]> = {
    AccountSet: [['tfRequireDestTag', 'tfOptionalDestTag'], ['tfRequireAuth', 'tfOptionalAuth'], ['tfDisallowXRP', 'tfAllowXRP']],
    TrustSet: [['tfSetNoRipple', 'tfClearNoRipple'], ['tfSetFreeze', 'tfClearFreeze']],
    OfferCreate: [['tfImmediateOrCancel', 'tfFillOrKill']],
    MPTokenIssuanceSet: [['tfMPTLock', 'tfMPTUnlock']],
    LoanManage: [['tfLoanDefault', 'tfLoanImpair', 'tfLoanUnimpair']],
  };
  for (const group of incompatibleGroups[type] ?? []) {
    const conflict = group.filter(name => selected.includes(name));
    if (conflict.length > 1) throw new Error(`Incompatible ${type} flags: ${conflict.join(', ')}.`);
  }
  let flags = typeof config.Flags === 'number' ? config.Flags : 0;
  for (const [name, value] of Object.entries(FLAG_VALUES[type] ?? {})) {
    if (config[name] === true) flags |= value;
  }
  if (innerBatch) flags |= INNER_BATCH_FLAG;
  return flags === 0 ? undefined : flags >>> 0;
}

function buildTransaction(definition: NodeTypeDef, config: TransactionConfig, fallbackAccount: string, innerBatch = false): XRPL.SubmittableTransaction {
  const parsed = createConfigSchema(definition.fields).parse(config);
  const amountFields = new Set(definition.fields.filter((field) => field.type === 'amount').map((field) => field.name));
  const issueFields = new Set(definition.fields.filter((field) => field.type === 'issue').map((field) => field.name));
  const transaction: Record<string, unknown> = {
    TransactionType: definition.id,
    Account: String(parsed.Account || fallbackAccount),
  };

  const skip = new Set(['Account', 'Flags', 'LimitAmount_currency', 'LimitAmount_issuer', 'LimitAmount_value']);
  for (const [name, value] of Object.entries(parsed)) {
    if (skip.has(name) || amountFields.has(name) || issueFields.has(name) || typeof value === 'boolean' || !present(value)) continue;
    transaction[name] = JSON_FIELDS.has(name) ? parseJsonField(name, value) : value;
  }
  for (const name of amountFields) {
    if (present(parsed[name])) transaction[name] = toXRPLAmount(parsed[name]);
  }
  for (const name of issueFields) {
    if (present(parsed[name])) transaction[name] = toXRPLIssue(parsed[name]);
  }
  if (definition.id === 'TrustSet') {
    transaction.LimitAmount = {
      currency: parsed.LimitAmount_currency,
      issuer: parsed.LimitAmount_issuer,
      value: String(parsed.LimitAmount_value ?? '0'),
    };
  }
  const flags = composeFlags(definition.id, parsed, innerBatch);
  if (flags !== undefined) transaction.Flags = flags;

  if (parsed.TicketSequence !== undefined && parsed.TicketSequence !== '') transaction.Sequence = 0;
  if (innerBatch) {
    transaction.Fee = '0';
    transaction.Sequence = parsed.TicketSequence ? 0 : (typeof parsed.Sequence === 'number' ? parsed.Sequence : 0);
    transaction.SigningPubKey = '';
    delete transaction.TxnSignature;
    delete transaction.Signers;
    delete transaction.LastLedgerSequence;
  }

  XRPL.validate(transaction);
  return transaction as XRPL.SubmittableTransaction;
}

function makeAdapter(definition: NodeTypeDef): TransactionAdapter {
  const schema = createConfigSchema(definition.fields);
  return {
    type: definition.id,
    definition,
    schema,
    flags: FLAG_VALUES[definition.id] ?? {},
    availability: definition.networkGating,
    build(config, fallbackAccount, innerBatch = false) {
      return buildTransaction(definition, config, fallbackAccount, innerBatch);
    },
    validate(config, fallbackAccount) {
      try {
        buildTransaction(definition, config as TransactionConfig, fallbackAccount);
        return [];
      } catch (error) {
        if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message);
        return [error instanceof Error ? error.message : String(error)];
      }
    },
  };
}

export const TRANSACTION_ADAPTERS = new Map<string, TransactionAdapter>(
  NODE_REGISTRY
    .filter((definition) => !NON_TRANSACTION_TYPES.has(definition.id))
    .map((definition) => [definition.id, makeAdapter(definition)]),
);

export function getTransactionAdapter(type: string): TransactionAdapter | undefined {
  return TRANSACTION_ADAPTERS.get(type);
}

export function buildValidatedTransaction(type: string, config: TransactionConfig, fallbackAccount: string, innerBatch = false): XRPL.SubmittableTransaction {
  const adapter = getTransactionAdapter(type);
  if (!adapter) throw new Error(`Unsupported transaction type: ${type}`);
  return adapter.build(config, fallbackAccount, innerBatch);
}

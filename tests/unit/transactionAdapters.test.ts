import * as XRPL from 'xrpl';
import { describe, expect, it } from 'vitest';
import { buildValidatedTransaction, getTransactionAdapter } from '@/lib/transactionAdapters';
import { ACCOUNT, validTransactionConfig, transactionDefinitions, xrpAmount } from '../helpers/fixtures';

describe('transaction adapters', () => {
  it.each(transactionDefinitions().map(definition => [definition.id]))('builds a valid minimal %s transaction', (type) => {
    const transaction = buildValidatedTransaction(type, validTransactionConfig(type), ACCOUNT);

    expect(transaction.TransactionType).toBe(type);
    expect(transaction.Account).toBeTruthy();
    expect(() => XRPL.validate(transaction as Record<string, unknown>)).not.toThrow();
  });

  it.each(
    transactionDefinitions()
      .map(definition => {
        const requiredField = definition.fields.find(field => field.required && field.name !== 'Account');
        return requiredField ? [definition.id, requiredField.name, requiredField.label] : undefined;
      })
      .filter((value): value is [string, string, string] => Boolean(value)),
  )('rejects %s when required field %s is missing', (type, fieldName, fieldLabel) => {
    const adapter = getTransactionAdapter(type);
    const config = validTransactionConfig(type);
    delete config[fieldName];

    expect(adapter?.validate(config, ACCOUNT).join('\n')).toContain(fieldLabel);
  });

  it('uses the fallback account when Account is blank', () => {
    const transaction = buildValidatedTransaction('Payment', {
      ...validTransactionConfig('Payment'),
      Account: '',
    }, ACCOUNT);

    expect(transaction.Account).toBe(ACCOUNT);
  });

  it('rejects mixing raw Flags with named flag toggles', () => {
    expect(() => buildValidatedTransaction('Payment', {
      ...validTransactionConfig('Payment'),
      Flags: 1,
      tfPartialPayment: true,
    }, ACCOUNT)).toThrow(/either raw Flags or named flag toggles/i);
  });

  it.each([
    ['AccountSet', { tfRequireDestTag: true, tfOptionalDestTag: true }],
    ['AccountSet', { tfRequireAuth: true, tfOptionalAuth: true }],
    ['AccountSet', { tfDisallowXRP: true, tfAllowXRP: true }],
    ['TrustSet', { tfSetNoRipple: true, tfClearNoRipple: true }],
    ['TrustSet', { tfSetFreeze: true, tfClearFreeze: true }],
    ['OfferCreate', { tfImmediateOrCancel: true, tfFillOrKill: true }],
    ['AMMDeposit', { tfSingleAsset: true, tfTwoAsset: true }],
    ['AMMWithdraw', { tfWithdrawAll: true, tfTwoAsset: true }],
    ['MPTokenIssuanceSet', { tfMPTLock: true, tfMPTUnlock: true }],
    ['LoanManage', { tfLoanDefault: true, tfLoanImpair: true }],
  ])('rejects incompatible %s flag combinations', (type, flags) => {
    expect(() => buildValidatedTransaction(type, {
      ...validTransactionConfig(type),
      ...flags,
    }, ACCOUNT)).toThrow(/incompatible/i);
  });

  it('shapes inner Batch transactions without fees, signatures, or ledger sequence fields', () => {
    const transaction = buildValidatedTransaction('Payment', {
      ...validTransactionConfig('Payment'),
      TicketSequence: 42,
      Amount: xrpAmount('1000'),
    }, ACCOUNT, true) as Record<string, unknown>;

    expect(transaction.Fee).toBe('0');
    expect(transaction.Sequence).toBe(0);
    expect(transaction.SigningPubKey).toBe('');
    expect(transaction.LastLedgerSequence).toBeUndefined();
    expect(Number(transaction.Flags)).toBe(0x40000000);
  });
});

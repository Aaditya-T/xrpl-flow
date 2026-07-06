import { describe, expect, it } from 'vitest';
import { formatXrplKnowledge, selectXrplKnowledge } from '@/lib/xrplKnowledge';

describe('XRPL knowledge retrieval', () => {
  it('grounds AMM swap requests in Payment rather than AMMDeposit', () => {
    const snippets = selectXrplKnowledge({ prompt: 'Create an AMM swap from XRP to RLUSD with slippage protection' });
    expect(snippets[0]?.id).toBe('payment-swaps');
    expect(formatXrplKnowledge({ prompt: 'AMM swap XRP for RLUSD' })).toMatch(/Use Payment/i);
    expect(formatXrplKnowledge({ prompt: 'AMM swap XRP for RLUSD' })).toMatch(/not AMMDeposit/i);
  });

  it('selects trust line context for token receive setup', () => {
    const formatted = formatXrplKnowledge({ prompt: 'Prepare a wallet to receive an issued token from an issuer' });
    expect(formatted).toMatch(/TrustSet/i);
  });

  it('grounds end-to-end loan lifecycle requests in vault and lending nodes', () => {
    const prompt = 'Design a full end to end lifecycle of a loan with manager, lender, borrower, vault, broker, borrower drawdown and repayment';
    const snippets = selectXrplKnowledge({ prompt });
    expect(snippets[0]?.id).toBe('vault-loan-lifecycle');
    const formatted = formatXrplKnowledge({ prompt });
    expect(formatted).toMatch(/VaultCreate/i);
    expect(formatted).toMatch(/LoanBrokerSet/i);
    expect(formatted).toMatch(/VaultDeposit/i);
    expect(formatted).toMatch(/LoanSet/i);
    expect(formatted).toMatch(/LoanPay/i);
  });
});

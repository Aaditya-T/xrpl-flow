import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

type MockRequestHandler = (request: Record<string, unknown>) => unknown | Promise<unknown>;

export type MockXrplClientOptions = {
  request?: MockRequestHandler;
  submitResult?: Record<string, unknown>;
  txResult?: Record<string, unknown>;
  ledgerIndex?: number;
};

export function createMockXrplClient(options: MockXrplClientOptions = {}) {
  const emitter = new EventEmitter();
  const request = vi.fn(async (payload: Record<string, unknown>) => {
    if (options.request) return options.request(payload);
    switch (payload.command) {
      case 'account_info':
        return { result: { account_data: { Account: payload.account, Balance: '100000000', Sequence: 1 } } };
      case 'account_lines':
        return { result: { lines: [{ account: 'rrrrrrrrrrrrrrrrrrrrBZbvji', balance: '10', currency: 'USD' }] } };
      case 'account_tx':
        return { result: { transactions: [] } };
      case 'account_objects':
        return { result: { account_objects: [] } };
      case 'ledger':
        return { result: { ledger_index: options.ledgerIndex ?? 1, ledger: { transactions: [], accountState: [] } } };
      case 'tx':
        return { result: options.txResult ?? { validated: true, hash: 'HASH', meta: { TransactionResult: 'tesSUCCESS' } } };
      case 'feature':
        return { result: { features: [{ name: 'SingleAssetVault', enabled: true }, { name: 'LendingProtocol', enabled: true }, { name: 'Batch', enabled: true }] } };
      case 'submit':
        return { result: options.submitResult ?? { engine_result: 'tesSUCCESS', engine_result_message: 'The transaction was applied.' } };
      case 'subscribe':
      case 'unsubscribe':
        return { result: { status: 'success' } };
      default:
        return { result: {} };
    }
  });

  return {
    request,
    autofill: vi.fn(async (tx: Record<string, unknown>) => ({ ...tx, Fee: tx.Fee ?? '12', Sequence: tx.Sequence ?? 1, LastLedgerSequence: 100 })),
    simulate: vi.fn(async () => ({ result: { engine_result: 'tesSUCCESS' } })),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => { emitter.on(event, handler); return undefined; }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => { emitter.off(event, handler); return undefined; }),
    emit: emitter.emit.bind(emitter),
  };
}

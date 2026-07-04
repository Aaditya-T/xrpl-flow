import { describe, expect, it } from 'vitest';
import { executeQueryNode, resetQueryNodeRuntime } from '@/lib/queryNodes';
import { ACCOUNT } from '../helpers/fixtures';
import { createMockXrplClient } from '../helpers/mockXrplClient';

describe('query and data utility nodes', () => {
  it('executes account queries through the routed live client', async () => {
    const client = createMockXrplClient();

    const output = await executeQueryNode('AccountInfoQuery', { Account: ACCOUNT }, {}, 'testnet', client as never);

    expect(output.meta.command).toBe('account_info');
    expect(output.data).toMatchObject({ account_data: { Account: ACCOUNT } });
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ command: 'account_info', account: ACCOUNT }));
  });

  it('filters, dedupes, accumulates, formats, and exports data without a wallet', async () => {
    resetQueryNodeRuntime();
    const client = createMockXrplClient();
    const previous = {
      items: [
        { account: 'rA', balance: '-5', currency: 'USD' },
        { account: 'rA', balance: '-5', currency: 'USD' },
        { account: 'rB', balance: '0', currency: 'EUR' },
      ],
      data: { marker: 'next', markerEndpoint: 'https://clio.example.test' },
    };

    const filtered = await executeQueryNode('FilterItems', { FieldPath: 'currency', Operator: 'equals', Value: 'USD' }, previous, 'testnet', client as never);
    const deduped = await executeQueryNode('DedupeItems', { FieldPath: 'account' }, filtered, 'testnet', client as never);
    const accumulated = await executeQueryNode('AccumulateItems', { AccumulatorKey: 'holders' }, deduped, 'testnet', client as never, undefined, 'acc');
    const formatted = await executeQueryNode('FormatTrustLines', { SourcePath: 'items' }, accumulated, 'testnet', client as never);
    const exported = await executeQueryNode('ExportCsv', { Download: false, Columns: 'holder=holder,balance=balance,currency=currency' }, formatted, 'testnet', client as never);

    expect(filtered.items).toHaveLength(2);
    expect(deduped.items).toHaveLength(1);
    expect(accumulated.meta.marker).toBeUndefined();
    expect(formatted.items[0]).toMatchObject({ holder: 'rA', balance: '5', currency: 'USD' });
    expect(exported.data).toMatchObject({ csv: expect.stringContaining('holder,balance,currency') });
  });
});

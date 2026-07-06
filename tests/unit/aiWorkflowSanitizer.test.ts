import { describe, expect, it } from 'vitest';
import { sanitizeGeneratedWorkflow } from '@/lib/aiWorkflowSanitizer';

function rawWorkflow(config: Record<string, unknown>) {
  return {
    message: 'ok',
    workflow: {
      name: 'Memo test',
      nodes: [
        { id: 'start', type: 'ManualTrigger', label: 'Start', configJson: '{}', parentId: null, x: 0, y: 0 },
        { id: 'pay', type: 'Payment', label: 'Payment', configJson: JSON.stringify(config), parentId: null, x: 240, y: 0 },
      ],
      edges: [{ id: 'edge-1', source: 'start', target: 'pay', sourceHandle: null }],
    },
  };
}

describe('AI workflow sanitizer', () => {
  it('repairs prose memos into XRPL memo JSON', () => {
    const workflow = sanitizeGeneratedWorkflow(rawWorkflow({
      Destination: '',
      Amount: { type: 'xrp', drops: '1000000' },
      Memos: 'hello memo',
    }));

    const memos = JSON.parse(String(workflow.nodes[1].data?.config?.Memos));
    expect(memos).toEqual([{ Memo: { MemoData: '68656C6C6F206D656D6F' } }]);
  });

  it('keeps valid memo JSON formatted as JSON', () => {
    const workflow = sanitizeGeneratedWorkflow(rawWorkflow({
      Destination: '',
      Amount: { type: 'xrp', drops: '1000000' },
      Memos: '[{"Memo":{"MemoType":"6E6F7465","MemoData":"68656C6C6F"}}]',
    }));

    expect(String(workflow.nodes[1].data?.config?.Memos)).toContain('"MemoType": "6E6F7465"');
  });

  it('rejects invalid non-memo JSON textarea output', () => {
    expect(() => sanitizeGeneratedWorkflow(rawWorkflow({
      Destination: '',
      Amount: { type: 'xrp', drops: '1000000' },
      Paths: 'not json',
    }))).toThrow(/invalid JSON for Paths/i);
  });
});

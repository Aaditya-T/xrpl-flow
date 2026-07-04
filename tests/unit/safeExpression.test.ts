import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateSafeExpression } from '@/lib/safeExpression';
import { resolveWorkflowString } from '@/lib/dataBinding';

describe('safe expressions and bindings', () => {
  it('evaluates allowlisted boolean expressions', () => {
    expect(evaluateSafeExpression('output.count >= 3 && output.ok == true', { count: 4, ok: true })).toBe(true);
    expect(evaluateSafeExpression('!output.ok || output.count < 3', { count: 4, ok: true })).toBe(false);
  });

  it.each([
    'process.exit()',
    'output.items[0]',
    'output.constructor',
    'output.value + 1',
    'globalThis',
  ])('rejects unsafe expression feature: %s', (expression) => {
    expect(() => evaluateSafeExpression(expression, { value: 1, items: [1] })).toThrow();
  });

  it('never resolves prototype-polluting binding paths', () => {
    fc.assert(fc.property(fc.constantFrom('__proto__', 'prototype', 'constructor'), (unsafeKey) => {
      expect(resolveWorkflowString(`{{output.${unsafeKey}.polluted}}`, { safe: true })).toBeUndefined();
    }));
  });
});

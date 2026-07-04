function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getPath(root: unknown, path: string): unknown {
  const trimmed = path.trim();
  const withoutRoot = trimmed.startsWith('output.') ? trimmed.slice('output.'.length) : trimmed === 'output' ? '' : trimmed;
  if (!withoutRoot) return root;
  const parts = withoutRoot.split('.').filter(Boolean);
  let cursor: unknown = root;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor)) return undefined;
    if (part === '__proto__' || part === 'prototype' || part === 'constructor') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function stringifyBoundValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function resolveWorkflowString(input: string, output: unknown): unknown {
  const trimmed = input.trim();
  const wholeMatch = trimmed.match(/^\{\{\s*([^{}]+)\s*\}\}$/);
  const expressionMatch = trimmed.match(/^=\{\{\s*([^{}]+)\s*\}\}$/);
  const path = expressionMatch?.[1] || wholeMatch?.[1];
  if (path) return getPath(output, path);

  return input.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_match, pathText: string) => {
    return stringifyBoundValue(getPath(output, pathText));
  });
}

export function resolveWorkflowBindings<T>(value: T, output: unknown): T {
  if (typeof value === 'string') return resolveWorkflowString(value, output) as T;
  if (Array.isArray(value)) return value.map(item => resolveWorkflowBindings(item, output)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveWorkflowBindings(item, output)]),
    ) as T;
  }
  return value;
}

export function selectOutputPath(output: unknown, path: string): unknown {
  return getPath(output, path);
}

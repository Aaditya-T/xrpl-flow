import type { Edge, Node } from '@xyflow/react';
import { getNodeDef } from './nodeRegistry';
import { validateWorkflowStructure } from './workflowEngine';

export type GeneratedWorkflow = { name: string; nodes: Node[]; edges: Edge[] };

const JSON_TEXTAREA_FIELDS = new Set([
  'AcceptedCredentials',
  'AuthAccounts',
  'AuthorizeCredentials',
  'CredentialIDs',
  'Memos',
  'NFTokenOffers',
  'Paths',
  'Permissions',
  'PriceDataSeries',
  'SignerEntries',
  'UnauthorizeCredentials',
  'RequestJson',
]);

function utf8ToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function normalizeMemos(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value);
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return JSON.stringify([{ Memo: { MemoData: utf8ToHex(trimmed) } }], null, 2);
  }
}

function normalizeJsonTextarea(fieldName: string, value: unknown, nodeLabel: string): unknown {
  if (value === undefined || value === null || value === '') return value;
  if (fieldName === 'Memos') return normalizeMemos(value);
  if (typeof value !== 'string') return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    throw new Error(`AI returned invalid JSON for ${fieldName} on ${nodeLabel}.`);
  }
}

export function sanitizeGeneratedWorkflow(raw: any): GeneratedWorkflow {
  if (!raw?.workflow || typeof raw.workflow.name !== 'string' || !Array.isArray(raw.workflow.nodes) || !Array.isArray(raw.workflow.edges)) throw new Error('The model did not return a workflow.');
  if (raw.workflow.nodes.length === 0 || raw.workflow.nodes.length > 100 || raw.workflow.edges.length > 200) throw new Error('Generated workflow exceeds safety limits.');
  const ids = new Set<string>();
  const nodes: Node[] = raw.workflow.nodes.map((candidate: any, index: number) => {
    const id = String(candidate.id || `ai-node-${index + 1}`);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate generated node ID: ${id}`);
    ids.add(id);
    const definition = getNodeDef(String(candidate.type));
    if (!definition) throw new Error(`AI proposed unsupported node type: ${String(candidate.type)}`);
    if (definition.id === 'BatchContainer') throw new Error('AI proposed BatchContainer, but Batch is coming soon and disabled.');
    let config: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(candidate.configJson || '{}'));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      const allowed = new Set(definition.fields.map(field => field.name));
      config = Object.fromEntries(Object.entries(parsed).filter(([key]) => allowed.has(key)));
      for (const [key, value] of Object.entries(config)) {
        if (JSON_TEXTAREA_FIELDS.has(key)) config[key] = normalizeJsonTextarea(key, value, definition.label);
      }
    } catch (error) {
      if (error instanceof Error && /invalid json/i.test(error.message)) throw error;
      throw new Error(`AI returned invalid configuration JSON for ${definition.label}.`);
    }
    const x = Number.isFinite(candidate.x) ? Math.max(-5000, Math.min(5000, candidate.x)) : 120 + (index % 4) * 240;
    const y = Number.isFinite(candidate.y) ? Math.max(-5000, Math.min(5000, candidate.y)) : 100 + Math.floor(index / 4) * 150;
    return {
      id,
      type: definition.id,
      position: { x, y },
      data: { label: String(candidate.label || definition.label).slice(0, 100), config },
      ...(candidate.parentId ? { parentId: String(candidate.parentId), extent: 'parent' as const } : {}),
      ...(definition.id === 'BatchContainer' || definition.id === 'LoopContainer' ? { style: { width: 480, height: 260 } } : {}),
    };
  });
  for (const node of nodes.filter(node => node.parentId)) {
    const parent = nodes.find(candidate => candidate.id === node.parentId);
    if (!parent || parent.type !== 'LoopContainer') throw new Error(`Invalid container parent for ${node.id}.`);
  }
  const edgeIds = new Set<string>();
  const edges: Edge[] = raw.workflow.edges.map((candidate: any, index: number) => {
    const id = String(candidate.id || `ai-edge-${index + 1}`);
    if (edgeIds.has(id)) throw new Error(`Duplicate generated edge ID: ${id}`);
    edgeIds.add(id);
    if (!ids.has(String(candidate.source)) || !ids.has(String(candidate.target))) throw new Error(`Generated edge ${id} references a missing node.`);
    const sourceNode = nodes.find(node => node.id === String(candidate.source));
    const proposedHandle = candidate.sourceHandle === null ? undefined : String(candidate.sourceHandle);
    const sourceHandle = sourceNode?.type === 'ConditionBranch' ? proposedHandle : undefined;
    if (sourceNode?.type === 'ConditionBranch' && sourceHandle !== 'true' && sourceHandle !== 'false') {
      throw new Error(`Condition edge ${id} must use the true or false output.`);
    }
    return { id, source: String(candidate.source), target: String(candidate.target), ...(sourceHandle ? { sourceHandle } : {}) };
  });
  const structuralErrors = validateWorkflowStructure(nodes, edges);
  if (structuralErrors.length) throw new Error(`Generated graph is unsafe: ${structuralErrors[0].nodeLabel} - ${structuralErrors[0].fieldLabel}`);
  return { name: raw.workflow.name.trim().slice(0, 100) || 'AI Generated Workflow', nodes, edges };
}

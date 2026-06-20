import { useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { Bot, Check, KeyRound, Loader2, Send, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react';
import { NODE_REGISTRY, getNodeDef } from '@/lib/nodeRegistry';
import { validateWorkflowStructure } from '@/lib/workflowEngine';
import { useWorkflowStore } from '@/store/workflowStore';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
type GeneratedWorkflow = { name: string; nodes: Node[]; edges: Edge[] };

const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['message', 'workflow'],
  properties: {
    message: { type: 'string' },
    workflow: {
      type: 'object', additionalProperties: false, required: ['name', 'nodes', 'edges'],
      properties: {
        name: { type: 'string' },
        nodes: {
          type: 'array', maxItems: 100, items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'type', 'label', 'configJson', 'parentId', 'x', 'y'],
            properties: {
              id: { type: 'string' }, type: { type: 'string' }, label: { type: 'string' },
              configJson: { type: 'string' }, parentId: { type: ['string', 'null'] },
              x: { type: 'number' }, y: { type: 'number' },
            },
          },
        },
        edges: {
          type: 'array', maxItems: 200, items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'source', 'target', 'sourceHandle'],
            properties: {
              id: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' },
              sourceHandle: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
} as const;

function sanitizeGeneratedWorkflow(raw: any): GeneratedWorkflow {
  if (!raw?.workflow || typeof raw.workflow.name !== 'string' || !Array.isArray(raw.workflow.nodes) || !Array.isArray(raw.workflow.edges)) throw new Error('The model did not return a workflow.');
  if (raw.workflow.nodes.length === 0 || raw.workflow.nodes.length > 100 || raw.workflow.edges.length > 200) throw new Error('Generated workflow exceeds safety limits.');
  const ids = new Set<string>();
  const nodes: Node[] = raw.workflow.nodes.map((candidate: any, index: number) => {
    const id = String(candidate.id || `ai-node-${index + 1}`);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate generated node ID: ${id}`);
    ids.add(id);
    const definition = getNodeDef(String(candidate.type));
    if (!definition) throw new Error(`AI proposed unsupported node type: ${String(candidate.type)}`);
    let config: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(candidate.configJson || '{}'));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      const allowed = new Set(definition.fields.map(field => field.name));
      config = Object.fromEntries(Object.entries(parsed).filter(([key]) => allowed.has(key)));
    } catch { throw new Error(`AI returned invalid configuration JSON for ${definition.label}.`); }
    const x = Number.isFinite(candidate.x) ? Math.max(-5000, Math.min(5000, candidate.x)) : 120 + (index % 4) * 240;
    const y = Number.isFinite(candidate.y) ? Math.max(-5000, Math.min(5000, candidate.y)) : 100 + Math.floor(index / 4) * 150;
    return {
      id, type: definition.id, position: { x, y }, data: { label: String(candidate.label || definition.label).slice(0, 100), config },
      ...(candidate.parentId ? { parentId: String(candidate.parentId), extent: 'parent' as const } : {}),
      ...(definition.id === 'BatchContainer' || definition.id === 'LoopContainer' ? { style: { width: 480, height: 260 } } : {}),
    };
  });
  for (const node of nodes.filter(node => node.parentId)) {
    const parent = nodes.find(candidate => candidate.id === node.parentId);
    if (!parent || (parent.type !== 'BatchContainer' && parent.type !== 'LoopContainer')) throw new Error(`Invalid container parent for ${node.id}.`);
  }
  const edgeIds = new Set<string>();
  const edges: Edge[] = raw.workflow.edges.map((candidate: any, index: number) => {
    const id = String(candidate.id || `ai-edge-${index + 1}`);
    if (edgeIds.has(id)) throw new Error(`Duplicate generated edge ID: ${id}`);
    edgeIds.add(id);
    if (!ids.has(String(candidate.source)) || !ids.has(String(candidate.target))) throw new Error(`Generated edge ${id} references a missing node.`);
    const sourceHandle = candidate.sourceHandle === null ? undefined : String(candidate.sourceHandle);
    return { id, source: String(candidate.source), target: String(candidate.target), ...(sourceHandle ? { sourceHandle } : {}) };
  });
  const structuralErrors = validateWorkflowStructure(nodes, edges);
  if (structuralErrors.length) throw new Error(`Generated graph is unsafe: ${structuralErrors[0].nodeLabel} — ${structuralErrors[0].fieldLabel}`);
  return { name: raw.workflow.name.trim().slice(0, 100) || 'AI Generated Workflow', nodes, edges };
}

export function AIWorkflowAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apiKeyRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [model, setModel] = useState('gpt-5.4-mini');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingWorkflow, setPendingWorkflow] = useState<GeneratedWorkflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { nodes, edges, currentWorkflowName, createWorkflow } = useWorkflowStore();

  const registryContext = useMemo(() => NODE_REGISTRY.map(definition => ({
    type: definition.id, description: definition.description, availability: definition.networkGating,
    fields: definition.fields.map(field => ({ name: field.name, type: field.type, required: field.required, options: field.options })),
  })), []);

  if (!open) return null;
  const rememberKeyForTab = () => {
    const key = keyInput.trim();
    if (!key.startsWith('sk-') || key.length < 20) { setError('Enter a valid OpenAI API key.'); return; }
    apiKeyRef.current = key;
    setKeyInput(''); setConnected(true); setError('');
  };
  const forgetKey = () => { apiKeyRef.current = ''; setConnected(false); setKeyInput(''); setError(''); };

  const submit = async () => {
    const userPrompt = prompt.trim();
    if (!userPrompt || !connected || loading) return;
    setPrompt(''); setError(''); setPendingWorkflow(null); setLoading(true);
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', text: userPrompt }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: apiKeyRef.current, dangerouslyAllowBrowser: true });
      const currentGraph = { name: currentWorkflowName, nodes: nodes.map(node => ({ id: node.id, type: node.type, parentId: node.parentId, config: node.data?.config })), edges: edges.map(edge => ({ source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle })) };
      const response = await client.responses.create({
        model,
        instructions: `You design safe XRPL Flow v2 workflow graphs. Return a useful short message and a complete workflow. Use only registry node types. Never use XChain or LedgerStateFix. Exactly one trigger is required. Ordinary nodes have at most one outgoing edge; branching uses ConditionBranch or ParallelSplit. Condition edges must use sourceHandle true/false. ParallelSplit needs at least two branches. Container children use parentId and have no graph edges. Batch needs 2-8 transaction children and is Devnet-only. Loop children execute in position order. Leave unknown addresses/hashes as empty strings and explain what the user must fill in. Amount config objects use {"type":"xrp","drops":"..."}, {"type":"token","currency":"USD","issuer":"","value":"..."}, or {"type":"mpt","issuanceId":"","value":"..."}. Each configJson must itself be a valid serialized JSON object. Lay nodes out left-to-right with generous spacing. Available registry: ${JSON.stringify(registryContext)}. Current workflow, which may be replaced or adapted if relevant: ${JSON.stringify(currentGraph)}.`,
        input: [...messages.slice(-6).map(message => ({ role: message.role, content: message.text } as const)), { role: 'user', content: userPrompt }],
        text: { format: { type: 'json_schema', name: 'xrpl_workflow', strict: true, schema: RESPONSE_SCHEMA } },
      }, { signal: controller.signal });
      const parsed = JSON.parse(response.output_text);
      const workflow = sanitizeGeneratedWorkflow(parsed);
      setPendingWorkflow(workflow);
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text: String(parsed.message || `I created “${workflow.name}”. Review and apply it when ready.`) }]);
    } catch (reason: any) {
      if (reason?.name !== 'AbortError') setError(reason?.message || 'The assistant could not generate a workflow.');
    } finally { abortRef.current = null; setLoading(false); }
  };

  return <div className="fixed inset-y-0 right-0 z-[65] flex w-full max-w-[420px] flex-col border-l border-[#293044] bg-[#0c0f17] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="ai-workflow-title">
    <header className="flex items-center gap-3 border-b border-[#242b3b] px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15 text-violet-400"><Sparkles size={16} /></div><div><h2 id="ai-workflow-title" className="text-[13px] font-semibold text-slate-100">AI Workflow Builder</h2><p className="text-[9px] text-slate-500">Prompt → validate → preview → apply</p></div><button type="button" onClick={onClose} className="ml-auto rounded p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Close AI assistant"><X size={16} /></button></header>

    {!connected ? <div className="flex flex-1 flex-col justify-center p-6">
      <div className="mb-5 rounded-lg border border-amber-800/50 bg-amber-950/25 p-4"><div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-amber-300"><ShieldAlert size={15} />Local BYOK security warning</div><p className="text-[10px] leading-relaxed text-amber-200/70">Your key stays only in this tab's memory and is sent directly to OpenAI. It is never saved by XRPL Flow. Browser extensions, injected scripts, or devtools may still observe it—use a restricted project key and never do this on an untrusted deployment.</p></div>
      <label className="mb-1 text-[10px] text-slate-400">OpenAI API key</label><input autoFocus type="password" autoComplete="off" spellCheck={false} value={keyInput} onChange={event => setKeyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') rememberKeyForTab(); }} placeholder="sk-…" className="rounded-md border border-[#30384b] bg-[#080a10] px-3 py-2.5 font-mono text-[11px] text-slate-200 outline-none focus:border-violet-500/60" />
      {error && <p className="mt-2 text-[10px] text-red-400">{error}</p>}<button type="button" onClick={rememberKeyForTab} className="mt-3 flex items-center justify-center gap-2 rounded-md bg-violet-600 py-2.5 text-[11px] font-medium text-white hover:bg-violet-500"><KeyRound size={13} />Use for this tab only</button>
    </div> : <>
      <div className="flex items-center gap-2 border-b border-[#202635] px-4 py-2"><span className="flex items-center gap-1 text-[9px] text-emerald-400"><Check size={10} />Session key active</span><select value={model} onChange={event => setModel(event.target.value)} className="ml-auto rounded border border-[#293044] bg-[#10141e] px-2 py-1 text-[9px] text-slate-400"><option value="gpt-5.4-mini">GPT-5.4 mini</option><option value="gpt-5.5">GPT-5.5</option></select><button type="button" onClick={forgetKey} title="Forget API key" className="rounded p-1 text-slate-600 hover:text-red-400"><Trash2 size={11} /></button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <div className="rounded-lg border border-dashed border-[#30374a] p-4 text-center"><Bot size={22} className="mx-auto mb-2 text-violet-500" /><p className="text-[11px] text-slate-300">Describe the workflow you need</p><p className="mt-1 text-[9px] leading-relaxed text-slate-600">Try: “Create a Testnet flow that sends XRP, waits for a ledger close, then logs the result.”</p></div>}{messages.map(message => <div key={message.id} className={`max-w-[90%] rounded-lg px-3 py-2 text-[10px] leading-relaxed ${message.role === 'user' ? 'ml-auto bg-blue-600/20 text-blue-100' : 'border border-[#293044] bg-[#121722] text-slate-300'}`}>{message.text}</div>)}{loading && <div className="flex items-center gap-2 text-[10px] text-violet-400"><Loader2 size={12} className="animate-spin" />Designing and validating workflow…</div>}{pendingWorkflow && <div className="rounded-lg border border-emerald-700/45 bg-emerald-950/20 p-3"><p className="text-[11px] font-medium text-emerald-300">{pendingWorkflow.name}</p><p className="mt-1 text-[9px] text-emerald-200/60">{pendingWorkflow.nodes.length} nodes · {pendingWorkflow.edges.length} connections</p><button type="button" onClick={() => { createWorkflow(pendingWorkflow.name, pendingWorkflow.nodes, pendingWorkflow.edges); setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text: `Applied “${pendingWorkflow.name}” to the canvas as a new workflow.` }]); setPendingWorkflow(null); }} className="mt-3 w-full rounded bg-emerald-600 py-2 text-[10px] font-medium text-white hover:bg-emerald-500">Apply to canvas</button></div>}{error && <div className="rounded border border-red-800/50 bg-red-950/25 px-3 py-2 text-[10px] text-red-300">{error}</div>}</div>
      <div className="border-t border-[#242b3b] p-3"><div className="flex items-end gap-2"><textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={3} placeholder="Describe or refine your workflow…" className="min-h-16 flex-1 resize-none rounded-lg border border-[#30384b] bg-[#080a10] px-3 py-2 text-[11px] text-slate-200 outline-none focus:border-violet-500/60" /><button type="button" disabled={!prompt.trim() || loading} onClick={() => void submit()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40" aria-label="Send prompt"><Send size={14} /></button></div><p className="mt-1.5 text-[8px] text-slate-600">Your prompt and current workflow structure are sent to OpenAI. Seeds are never included.</p></div>
    </>}
  </div>;
}

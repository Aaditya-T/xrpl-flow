import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, KeyRound, Loader2, RefreshCw, Send, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react';
import { NODE_REGISTRY } from '@/lib/nodeRegistry';
import { useWorkflowStore } from '@/store/workflowStore';
import { createFreeAiWorkflow, getFreeAiUsage, type AiUsage, type MarketplaceUser } from '@/lib/marketplaceClient';
import {
  AI_PROVIDER_PRESETS,
  fetchAiProviderModels,
  generateCustomAiWorkflow,
  presetForProvider,
  type AiProviderId,
} from '@/lib/aiProviders';
import { formatXrplKnowledge } from '@/lib/xrplKnowledge';
import { sanitizeGeneratedWorkflow, type GeneratedWorkflow } from '@/lib/aiWorkflowSanitizer';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };

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

function buildAIWorkflowInstructions(registryContext: unknown, currentGraph: unknown, prompt: string, messages: Array<{ role: string; text: string }>): string {
  const xrplDocsContext = formatXrplKnowledge({ prompt, messages, currentGraph });
  return `You design safe XRPL Flow v2 workflow graphs. Return a useful short message and a complete workflow. Use only registry node types. Never use XChain, LedgerStateFix, or BatchContainer. Exactly one trigger is required. Ordinary nodes have at most one outgoing edge; branching uses ConditionBranch or ParallelSplit. Condition edges must use sourceHandle "true" or "false". Every other edge, including every ParallelSplit edge, must set sourceHandle to null. ParallelSplit needs at least two branches. Container children use parentId and have no graph edges. Batch is coming soon and disabled, including on Devnet. Loop children execute in position order from left to right / top to bottom, then the LoopContainer continues downstream once.

XRPL transaction selection knowledge:
- When the user asks for an end-to-end lifecycle, include the concrete protocol transaction nodes for setup, execution, repayment/settlement, and cleanup. Do not collapse protocol-specific actions into generic Payment or LogOutput nodes.
- For Devnet-only protocol features such as Vaults and Lending Protocol, use the matching Devnet-only nodes and leave required IDs blank when they are produced by earlier transactions. Explain those ID handoffs in the assistant message.
- AMM swap, token swap, swap XRP for token, swap token for XRP, buy/sell through AMM/DEX, or currency conversion should normally use Payment, not AMMDeposit. In XRPL, swaps are path/cross-currency Payments that can consume offers and AMM liquidity.
- For a swap/currency conversion where the sender receives the output asset, set Payment Destination to the sender account. Set Amount or DeliverMax to the desired receive asset and SendMax to the maximum spend asset. Leave Paths empty unless the user provides explicit paths; rippled can choose the default path.
- Use tfPartialPayment plus DeliverMin only when the user asks for slippage tolerance or "receive at least". Use tfLimitQuality when the user gives a minimum acceptable quality/rate. Do not set tfPartialPayment for normal exact-delivery transfers.
- AMMDeposit adds liquidity to a pool and mints LP tokens. AMMWithdraw removes liquidity. AMMCreate creates a pool. AMMVote changes the trading fee. AMMBid bids for the auction slot. These are not swaps.
- Place limit orders with OfferCreate and cancel with OfferCancel. Create trust lines with TrustSet before token receives when needed. Send tokens, XRP, and MPTs with Payment. NFT trades use NFTokenCreateOffer, NFTokenAcceptOffer, and NFTokenCancelOffer.
- For airdrops, prefer query or CSV preparation first; only build actual Payment loops when the user explicitly asks to submit transactions, and keep them testnet/devnet unless they clearly request mainnet.
- If issuer, currency, destination, rate, or amount is unknown, leave the specific field blank and explain what the user must fill in.
- JSON textarea fields must contain valid JSON only. Never put prose directly in Memos, SignerEntries, NFTokenOffers, Paths, Permissions, PriceDataSeries, CredentialIDs, or RequestJson. For human-readable memos, use XRPL Memo JSON, e.g. [{"Memo":{"MemoData":"68656C6C6F"}}] where MemoData is UTF-8 hex.

Relevant XRPL docs context selected for this request:
${xrplDocsContext}

Query and data-flow guidance:
- Prefer Ledger Query nodes for read-only workflows. Query-only workflows do not require a wallet.
- For trustline holder exports, use AccountLinesQuery -> FormatTrustLines -> ExportCsv.
- For pagination, XRPL returns marker. Put AccountLinesQuery and AccumulateItems inside a LoopContainer. AccountLinesQuery should use Marker "{{output.data.marker}}" and MarkerEndpoint "{{output.data.markerEndpoint}}". AccumulateItems should preserve marker and markerEndpoint. The LoopContainer should use LoopMode "until-condition", a bounded Iterations value, and Condition "!output.data.marker".
- MarkerEndpoint matters because a marker from one endpoint should be continued on that same endpoint.
- For friendly CSVs, use ExportCsv Columns like "holder=holder,balance=balance,currency=currency" or newline-separated mappings.
- For issuer-holder snapshots, use FormatTrustLines with Perspective "issuer", AbsoluteBalances true, IncludeZeroBalances false.
- For one-page account trustline exports, AccountLinesQuery Limit 200 is fine; for all holders, use the loop pattern above.
- Clio-only NFT methods include NFTInfoQuery, NFTHistoryQuery, and NFTsByIssuerQuery; keep LedgerIndex as "validated" unless the user gives a specific validated ledger.
- Loop wiring is strict: graph edges may connect to or from the LoopContainer node itself, but never to or from nodes that have parentId. Child nodes run only by containment order. For "repeat every N minutes", set LoopContainer DelayBetween to N minutes in milliseconds, e.g. 300000 for 5 minutes, and keep contained nodes edge-free.
- For one-time waiting such as "wait 1 minute then repay", use a Delay node with DelayMode "ms" and Duration 60000. Use LoopContainer DelayBetween only for repeated checks, polling, or repeated execution.

Leave unknown addresses/hashes as empty strings and explain what the user must fill in. Amount config objects use {"type":"xrp","drops":"..."}, {"type":"token","currency":"USD","issuer":"","value":"..."}, or {"type":"mpt","issuanceId":"","value":"..."}. Each configJson must itself be a valid serialized JSON object. Lay nodes out left-to-right with generous spacing. Available registry: ${JSON.stringify(registryContext)}. Current workflow, which may be replaced or adapted if relevant: ${JSON.stringify(currentGraph)}.`;
}

export function AIWorkflowAssistant({
  open,
  onClose,
  marketplaceUser,
  onRequestXamanSignIn,
}: {
  open: boolean;
  onClose: () => void;
  marketplaceUser: MarketplaceUser | null;
  onRequestXamanSignIn: () => void;
}) {
  const customKeyRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<'free' | 'custom'>('free');
  const [provider, setProvider] = useState<AiProviderId>('openai');
  const [endpoint, setEndpoint] = useState(() => presetForProvider('openai').endpoint);
  const [model, setModel] = useState(() => presetForProvider('openai').models[0]);
  const [customModel, setCustomModel] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [keyInput, setKeyInput] = useState('');
  const [customConnected, setCustomConnected] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingWorkflow, setPendingWorkflow] = useState<GeneratedWorkflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usageNote, setUsageNote] = useState('');
  const [freeUsage, setFreeUsage] = useState<AiUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const { nodes, edges, currentWorkflowName, createWorkflow } = useWorkflowStore();

  const registryContext = useMemo(() => NODE_REGISTRY.map(definition => ({
    type: definition.id,
    description: definition.description,
    availability: definition.networkGating,
    fields: definition.fields.map(field => ({ name: field.name, type: field.type, required: field.required, options: field.options })),
  })), []);

  const selectedPreset = presetForProvider(provider);
  const modelOptions = useMemo(() => [...new Set([...selectedPreset.models, ...fetchedModels])], [fetchedModels, selectedPreset.models]);
  const effectiveModel = customModel.trim() || model;

  useEffect(() => {
    const preset = presetForProvider(provider);
    setEndpoint(preset.endpoint);
    setModel(preset.models[0] || '');
    setCustomModel('');
    setFetchedModels([]);
    setError('');
  }, [provider]);

  useEffect(() => {
    if (!open || mode !== 'free' || !marketplaceUser) {
      setFreeUsage(null);
      return;
    }
    let cancelled = false;
    setUsageLoading(true);
    getFreeAiUsage()
      .then(usage => {
        if (!cancelled) setFreeUsage(usage);
      })
      .catch(() => {
        if (!cancelled) setFreeUsage(null);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, marketplaceUser?.address]);

  if (!open) return null;

  const rememberCustomKeyForTab = () => {
    const key = keyInput.trim();
    if (key.length < 12) {
      setError('Enter a valid provider API key.');
      return;
    }
    customKeyRef.current = key;
    setKeyInput('');
    setCustomConnected(true);
    setError('');
  };

  const forgetCustomKey = () => {
    customKeyRef.current = '';
    setCustomConnected(false);
    setKeyInput('');
    setError('');
  };

  const currentGraph = () => ({
    name: currentWorkflowName,
    nodes: nodes.map(node => ({ id: node.id, type: node.type, parentId: node.parentId, config: node.data?.config })),
    edges: edges.map(edge => ({ source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle })),
  });

  const loadModels = async () => {
    setError('');
    setFetchingModels(true);
    try {
      const models = await fetchAiProviderModels({
        provider,
        endpoint,
        model: effectiveModel,
        apiKey: customKeyRef.current || keyInput.trim(),
      });
      setFetchedModels(models);
      if (!effectiveModel && models[0]) setModel(models[0]);
    } catch (reason: any) {
      setError(reason?.message || 'Could not fetch models. Enter a model name manually.');
    } finally {
      setFetchingModels(false);
    }
  };

  const submit = async () => {
    const userPrompt = prompt.trim();
    if (!userPrompt || loading) return;
    if (mode === 'free' && !marketplaceUser) {
      setError('Sign in with Xaman to use the free AI beta allowance.');
      return;
    }
    if (mode === 'custom' && !customConnected) {
      setError('Add your provider API key for this tab first.');
      return;
    }

    setPrompt('');
    setError('');
    setUsageNote('');
    setPendingWorkflow(null);
    setLoading(true);
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', text: userPrompt }]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messages.slice(-6).map(message => ({ role: message.role, text: message.text }));
      const workflowPayload = {
        instructions: buildAIWorkflowInstructions(registryContext, currentGraph(), userPrompt, history),
        messages: history,
        prompt: userPrompt,
        responseSchema: RESPONSE_SCHEMA,
      };
      const result = mode === 'free'
        ? await createFreeAiWorkflow({ prompt: userPrompt, messages: history, registryContext, currentGraph: currentGraph() })
        : await generateCustomAiWorkflow({
          provider,
          endpoint,
          model: effectiveModel,
          apiKey: customKeyRef.current,
        }, workflowPayload, controller.signal) as any;
      const workflow = sanitizeGeneratedWorkflow(result);
      setPendingWorkflow(workflow);
      if (mode === 'free' && result.usage?.limit) {
        setFreeUsage({
          used: result.usage.used ?? Math.max(0, result.usage.limit - (result.usage.remaining ?? 0)),
          remaining: result.usage.remaining ?? 0,
          limit: result.usage.limit,
        });
        setUsageNote(`${result.usage.remaining ?? 0} of ${result.usage.limit} free messages left today.`);
      }
      setMessages(previous => [...previous, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: String(result.message || `I created "${workflow.name}". Review and apply it when ready.`),
      }]);
    } catch (reason: any) {
      if (reason?.name !== 'AbortError') setError(reason?.message || 'The assistant could not generate a workflow.');
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const inputClass = 'w-full rounded-md border border-[#30384b] bg-[#080a10] px-3 py-2 text-[10px] text-slate-200 outline-none focus:border-violet-500/60';
  const reportableAiError = /Generated graph is unsafe|AI proposed|AI returned|model did not return|generated edge|generated node|duplicate generated|unsupported node/i.test(error);

  return <div className="fixed inset-y-0 right-0 z-[65] flex w-full max-w-[460px] flex-col border-l border-[#293044] bg-[#0c0f17] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="ai-workflow-title">
    <header className="flex items-center gap-3 border-b border-[#242b3b] px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15 text-violet-400"><Sparkles size={16} /></div>
      <div><h2 id="ai-workflow-title" className="text-[13px] font-semibold text-slate-100">AI Workflow Builder</h2><p className="text-[9px] text-slate-500">Prompt - validate - preview - apply</p></div>
      <button type="button" onClick={onClose} className="ml-auto rounded p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Close AI assistant"><X size={16} /></button>
    </header>

    <div className="border-b border-[#202635] p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#293044] bg-[#080a10] p-1">
        <button type="button" onClick={() => setMode('free')} className={`rounded-md px-3 py-1.5 text-[10px] font-medium ${mode === 'free' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-200'}`}>Free beta</button>
        <button type="button" onClick={() => setMode('custom')} className={`rounded-md px-3 py-1.5 text-[10px] font-medium ${mode === 'custom' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-200'}`}>Custom</button>
      </div>

      {mode === 'free' ? (
        <div className="mt-3 rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-[10px] leading-relaxed text-blue-100/75">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium text-blue-200"><Bot size={13} />Free AI messages</div>
            {marketplaceUser && <span className="rounded border border-blue-800/60 bg-blue-950/35 px-2 py-0.5 font-mono text-[9px] text-blue-100">{usageLoading ? 'Checking...' : `${freeUsage?.remaining ?? 0}/${freeUsage?.limit ?? 5} left`}</span>}
          </div>
          {marketplaceUser ? (
            <div className="space-y-2">
              <p>Signed in with Xaman.</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-blue-950">
                <div className="h-full rounded-full bg-blue-400" style={{ width: `${freeUsage ? Math.max(0, Math.min(100, (freeUsage.remaining / Math.max(1, freeUsage.limit)) * 100)) : 0}%` }} />
              </div>
              <p className="text-[9px] text-blue-200/60">{freeUsage ? `${freeUsage.used} used today. Resets daily.` : usageLoading ? 'Loading today\'s message limit...' : 'Message limit will appear after the first request.'}</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3"><span>Sign in with Xaman to use 5 free AI messages per day.</span><button type="button" onClick={onRequestXamanSignIn} className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-blue-500">Sign in</button></div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/25 p-3">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-amber-300"><ShieldAlert size={13} />Direct browser provider mode</div>
            <p className="text-[9px] leading-relaxed text-amber-200/70">Custom AI requests go directly from this browser to your selected provider. XRPL Flow does not receive, proxy, log, or store your key.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[9px] uppercase tracking-wide text-slate-500">Provider<select value={provider} onChange={event => setProvider(event.target.value as AiProviderId)} className={`${inputClass} mt-1`}>
              {AI_PROVIDER_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select></label>
            <label className="block text-[9px] uppercase tracking-wide text-slate-500">Model<select value={model} onChange={event => { setModel(event.target.value); setCustomModel(''); }} className={`${inputClass} mt-1`}>
              {modelOptions.length ? modelOptions.map(option => <option key={option} value={option}>{option}</option>) : <option value="">Manual only</option>}
            </select></label>
          </div>
          <label className="block text-[9px] uppercase tracking-wide text-slate-500">Endpoint<input value={endpoint} onChange={event => setEndpoint(event.target.value)} className={`${inputClass} mt-1 font-mono`} /></label>
          <label className="block text-[9px] uppercase tracking-wide text-slate-500">Custom model name<input value={customModel} onChange={event => setCustomModel(event.target.value)} placeholder="Overrides dropdown when filled" className={`${inputClass} mt-1 font-mono`} /></label>
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-[9px] uppercase tracking-wide text-slate-500">API key<input type="password" autoComplete="off" spellCheck={false} value={keyInput} onChange={event => setKeyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') rememberCustomKeyForTab(); }} placeholder="Provider key" className={`${inputClass} mt-1 font-mono`} /></label>
            <button type="button" onClick={rememberCustomKeyForTab} className="flex h-9 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-[10px] font-medium text-white hover:bg-violet-500"><KeyRound size={12} />Use</button>
            <button type="button" onClick={loadModels} disabled={fetchingModels} title="Fetch model list" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#30384b] text-slate-400 hover:text-white disabled:opacity-50"><RefreshCw size={12} className={fetchingModels ? 'animate-spin' : ''} /></button>
            {customConnected && <button type="button" onClick={forgetCustomKey} title="Forget API key" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#30384b] text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>}
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>{customConnected ? 'Session key active' : 'No session key active'}</span>
            <span className="font-mono text-slate-600">{effectiveModel || 'no-model'}</span>
          </div>
        </div>
      )}
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && <div className="rounded-lg border border-dashed border-[#30374a] p-4 text-center"><Bot size={22} className="mx-auto mb-2 text-violet-500" /><p className="text-[11px] text-slate-300">Describe the workflow you need</p><p className="mt-1 text-[9px] leading-relaxed text-slate-600">Try: Create a Testnet flow that sends XRP, waits for a ledger close, then logs the result.</p></div>}
      {messages.map(message => <div key={message.id} className={`max-w-[90%] rounded-lg px-3 py-2 text-[10px] leading-relaxed ${message.role === 'user' ? 'ml-auto bg-blue-600/20 text-blue-100' : 'border border-[#293044] bg-[#121722] text-slate-300'}`}>{message.text}</div>)}
      {loading && <div className="flex items-center gap-2 text-[10px] text-violet-400"><Loader2 size={12} className="animate-spin" />Designing and validating workflow...</div>}
      {pendingWorkflow && <div className="rounded-lg border border-emerald-700/45 bg-emerald-950/20 p-3"><p className="text-[11px] font-medium text-emerald-300">{pendingWorkflow.name}</p><p className="mt-1 text-[9px] text-emerald-200/60">{pendingWorkflow.nodes.length} nodes, {pendingWorkflow.edges.length} connections</p><button type="button" onClick={() => { createWorkflow(pendingWorkflow.name, pendingWorkflow.nodes, pendingWorkflow.edges); setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text: `Applied "${pendingWorkflow.name}" to the canvas as a new workflow.` }]); setPendingWorkflow(null); }} className="mt-3 w-full rounded bg-emerald-600 py-2 text-[10px] font-medium text-white hover:bg-emerald-500">Apply to canvas</button></div>}
      {usageNote && <div className="rounded border border-blue-900/45 bg-blue-950/20 px-3 py-2 text-[10px] text-blue-200/80">{usageNote}</div>}
      {error && <div className="rounded border border-red-800/50 bg-red-950/25 px-3 py-2 text-[10px] text-red-300"><p>{error}</p>{reportableAiError && <p className="mt-2 text-[9px] text-red-200/70">If you encountered this error, please take a screenshot and report it to the devs.</p>}</div>}
    </div>

    <div className="border-t border-[#242b3b] p-3">
      <div className="flex items-end gap-2">
        <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={3} placeholder="Describe or refine your workflow..." className="min-h-16 flex-1 resize-none rounded-lg border border-[#30384b] bg-[#080a10] px-3 py-2 text-[11px] text-slate-200 outline-none focus:border-violet-500/60" />
        <button type="button" disabled={!prompt.trim() || loading} onClick={() => void submit()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40" aria-label="Send prompt"><Send size={14} /></button>
      </div>
      <p className="mt-1.5 text-[8px] text-slate-600">{mode === 'free' ? 'Free beta prompts route through XRPL Flow backend. Seeds are never included.' : 'Custom prompts route directly from your browser to the selected provider. Seeds are never included.'}</p>
    </div>
  </div>;
}

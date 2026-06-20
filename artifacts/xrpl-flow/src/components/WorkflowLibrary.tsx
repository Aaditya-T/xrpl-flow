import { useEffect, useMemo, useState } from 'react';
import { Boxes, Copy, Search, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';

const TEMPLATE_DETAILS: Record<string, { description: string; tags: string[]; author: string }> = {
  'Send XRP': { description: 'A minimal payment flow with a manual trigger and result logging.', tags: ['Beginner', 'Payments'], author: 'XRPL Flow' },
  'Issue Token (2 Wallets)': { description: 'Configure an issuer, establish a trust line, and distribute an issued token.', tags: ['Tokens', 'Multi-wallet'], author: 'XRPL Flow' },
  'Parallel Branches': { description: 'Run two transaction branches concurrently and synchronize their results.', tags: ['Parallel', 'Control flow'], author: 'XRPL Flow' },
  'Loop 3×': { description: 'Repeat a contained transaction safely with a bounded loop.', tags: ['Loop', 'Control flow'], author: 'XRPL Flow' },
  'Delay Between Txns': { description: 'Sequence transactions with an abort-aware delay between them.', tags: ['Timing', 'Payments'], author: 'XRPL Flow' },
  'Conditional Branch': { description: 'Route execution through true and false paths using a safe expression.', tags: ['Conditions', 'Control flow'], author: 'XRPL Flow' },
  'Batch Txns (Devnet)': { description: 'Bundle multiple inner transactions with XRPL Batch semantics.', tags: ['Devnet', 'Batch'], author: 'XRPL Flow' },
  'Mint & List NFT': { description: 'Mint an NFT and create a sell offer in one guided workflow.', tags: ['NFT', 'Marketplace'], author: 'XRPL Flow' },
  'Create AMM Pool': { description: 'Create and seed an automated market maker pool.', tags: ['AMM', 'DEX'], author: 'XRPL Flow' },
  'Escrow Create & Finish': { description: 'Create an XRP escrow, wait, and finish it.', tags: ['Escrow', 'Payments'], author: 'XRPL Flow' },
};

type LibraryFilter = 'templates' | 'mine' | 'all';

export function WorkflowLibrary({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('templates');
  const { savedWorkflows, currentWorkflowId, loadWorkflow, duplicateWorkflow, deleteWorkflow } = useWorkflowStore();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  const workflows = useMemo(() => Object.values(savedWorkflows)
    .map(document => ({ document, template: document.id.startsWith('example-'), details: TEMPLATE_DETAILS[document.name] }))
    .filter(item => filter === 'all' || (filter === 'templates' ? item.template : !item.template))
    .filter(item => {
      const haystack = [item.document.name, item.details?.description, item.details?.author, ...(item.details?.tags || [])].join(' ').toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => Number(b.template) - Number(a.template) || b.document.updatedAt - a.document.updatedAt), [savedWorkflows, filter, query]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex bg-[#07090e]/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="workflow-library-title">
    <aside className="hidden w-56 flex-shrink-0 border-r border-[#242a39] bg-[#0c0f17] p-5 md:block">
      <div className="mb-7 flex items-center gap-2 text-sm font-semibold text-slate-100"><Boxes size={17} className="text-blue-400" />Workflow Library</div>
      <nav className="space-y-1">
        {([
          ['templates', 'Explore templates', Sparkles],
          ['mine', 'My workflows', UserRound],
          ['all', 'All workflows', Boxes],
        ] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] transition-colors ${filter === value ? 'bg-blue-600/15 text-blue-300' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}><Icon size={13} />{label}</button>)}
      </nav>
      <div className="mt-6 border-t border-[#202635] pt-5">
        <button type="button" onClick={onImport} className="flex w-full items-center justify-center gap-2 rounded-md border border-[#30384c] px-3 py-2 text-[10px] text-slate-300 hover:bg-white/5"><Upload size={12} />Import shared workflow</button>
        <p className="mt-3 text-[9px] leading-relaxed text-slate-600">Imported v2 workflows appear under My workflows. Community publishing can use the same document format.</p>
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-[#242a39] bg-[#0d1018] px-5 py-4">
        <div className="md:hidden"><Boxes size={17} className="text-blue-400" /></div>
        <div className="min-w-0"><h2 id="workflow-library-title" className="text-sm font-semibold text-slate-100">{filter === 'templates' ? 'Explore workflows' : filter === 'mine' ? 'My workflows' : 'All workflows'}</h2><p className="text-[10px] text-slate-500">Start from a proven flow or open one of your own.</p></div>
        <div className="relative ml-auto w-full max-w-xs"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search workflows, tags, authors…" className="w-full rounded-md border border-[#293044] bg-[#080b12] py-2 pl-8 pr-3 text-[11px] text-slate-200 outline-none focus:border-blue-500/60" /></div>
        <button type="button" onClick={onClose} aria-label="Close workflow library" className="rounded-md p-2 text-slate-500 hover:bg-white/5 hover:text-slate-200"><X size={17} /></button>
      </header>

      <div className="flex gap-1 border-b border-[#202635] px-4 py-2 md:hidden">
        {(['templates', 'mine', 'all'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded px-3 py-1 text-[10px] capitalize ${filter === value ? 'bg-blue-600/20 text-blue-300' : 'text-slate-500'}`}>{value}</button>)}
        <button onClick={onImport} className="ml-auto rounded px-3 py-1 text-[10px] text-slate-400"><Upload size={11} /></button>
      </div>

      <section className="flex-1 overflow-y-auto p-5">
        {workflows.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center"><Boxes size={30} className="mb-3 text-slate-700" /><p className="text-sm text-slate-400">No workflows found</p><p className="mt-1 text-[10px] text-slate-600">Try another search or import a shared v2 workflow.</p></div> :
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">{workflows.map(({ document, template, details }) => {
            const txCount = document.nodes.filter(node => !['ManualTrigger', 'AccountEventTrigger', 'ConditionBranch', 'ParallelSplit', 'SyncJoin', 'LoopContainer', 'Delay', 'LogOutput', 'BatchContainer'].includes(String(node.type))).length;
            return <article key={document.id} className={`group flex min-h-52 flex-col rounded-xl border bg-[#10141e] p-4 transition-colors hover:border-blue-500/45 ${document.id === currentWorkflowId ? 'border-blue-500/60' : 'border-[#252c3c]'}`}>
              <div className="mb-4 flex items-start gap-3"><div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${template ? 'bg-blue-600/15 text-blue-400' : 'bg-violet-600/15 text-violet-400'}`}>{template ? <Sparkles size={17} /> : <UserRound size={17} />}</div><div className="min-w-0"><h3 className="truncate text-[13px] font-semibold text-slate-100">{document.name}</h3><p className="mt-0.5 text-[9px] text-slate-500">by {details?.author || 'You'} {document.id === currentWorkflowId && <span className="ml-1 text-blue-400">• open</span>}</p></div></div>
              <p className="mb-4 line-clamp-3 text-[10px] leading-relaxed text-slate-400">{details?.description || 'A local XRPL Flow v2 workflow. Export it to share with other builders.'}</p>
              <div className="mb-4 flex flex-wrap gap-1.5">{(details?.tags || ['Local']).map(tag => <span key={tag} className="rounded-full border border-[#30384a] bg-[#171c28] px-2 py-0.5 text-[8px] text-slate-400">{tag}</span>)}</div>
              <div className="mt-auto flex items-center gap-2 border-t border-[#222938] pt-3"><span className="mr-auto text-[9px] text-slate-600">{document.nodes.length} nodes · {txCount} transactions</span>{!template && <><button type="button" onClick={() => duplicateWorkflow(document.name)} title="Duplicate" className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200"><Copy size={12} /></button><button type="button" onClick={() => { if (confirm(`Delete “${document.name}”?`)) deleteWorkflow(document.name); }} title="Delete" className="rounded p-1.5 text-slate-500 hover:bg-red-950/50 hover:text-red-300"><Trash2 size={12} /></button></>}<button type="button" onClick={() => { template ? duplicateWorkflow(document.name) : loadWorkflow(document.name); onClose(); }} className="rounded-md bg-blue-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-blue-500">{template ? 'Use template' : 'Open'}</button></div>
            </article>;
          })}</div>}
      </section>
    </main>
  </div>;
}

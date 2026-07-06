import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Check, Copy, Search, Send, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { getTransactionAdapter } from '@/lib/transactionAdapters';
import { createExampleWorkflowDocuments } from '@/lib/exampleWorkflows';
import { WORKFLOW_VERSION, type WorkflowDocumentV2 } from '@/lib/workflowTypes';
import {
  deleteMarketplaceTemplate,
  listMarketplaceTemplates,
  publishMarketplaceTemplate,
  type MarketplaceTemplate,
  type MarketplaceUser,
} from '@/lib/marketplaceClient';

const TEMPLATE_DETAILS: Record<string, { description: string; tags: string[]; author: string }> = {
  'Send XRP': { description: 'A minimal payment flow with a manual trigger and result logging.', tags: ['Beginner', 'Payments'], author: 'XRPL Flow' },
  'Issue Token (2 Wallets)': { description: 'Configure an issuer, establish a trust line, and distribute an issued token.', tags: ['Tokens', 'Multi-wallet'], author: 'XRPL Flow' },
  'Parallel Branches': { description: 'Run two transaction branches concurrently and synchronize their results.', tags: ['Parallel', 'Control flow'], author: 'XRPL Flow' },
  'Loop 3×': { description: 'Repeat a contained transaction safely with a bounded loop.', tags: ['Loop', 'Control flow'], author: 'XRPL Flow' },
  'Delay Between Txns': { description: 'Sequence transactions with an abort-aware delay between them.', tags: ['Timing', 'Payments'], author: 'XRPL Flow' },
  'Conditional Branch': { description: 'Route execution through true and false paths using a safe expression.', tags: ['Conditions', 'Control flow'], author: 'XRPL Flow' },
  'Mint & List NFT': { description: 'Mint an NFT and create a sell offer in one guided workflow.', tags: ['NFT', 'Marketplace'], author: 'XRPL Flow' },
  'Create AMM Pool': { description: 'Create and seed an automated market maker pool.', tags: ['AMM', 'DEX'], author: 'XRPL Flow' },
  'Escrow Create & Finish': { description: 'Create an XRP escrow, wait, and finish it.', tags: ['Escrow', 'Payments'], author: 'XRPL Flow' },
  'Token Holder Snapshot': { description: 'Query trust lines, filter active holders, and log a reusable holder snapshot.', tags: ['Queries', 'Tokens', 'Growth'], author: 'XRPL Flow' },
  'Airdrop Prep: Query Eligible Wallets': { description: 'Use transaction history to build a deduped candidate list before a campaign airdrop.', tags: ['Airdrop', 'Clio', 'Community'], author: 'XRPL Flow' },
  'NFT Issuer Analytics (Clio)': { description: 'Use a Clio-only method to inspect NFTs minted by an issuer.', tags: ['NFT', 'Clio', 'Analytics'], author: 'XRPL Flow' },
  'Guarded Treasury Payout': { description: 'Check treasury balance first, then branch into a payout or a safe stop.', tags: ['Treasury', 'Safety', 'Payments'], author: 'XRPL Flow' },
  'Fetch Trustlines CSV': { description: 'Fetch the first 200 trust lines for an account and export friendly CSV columns.', tags: ['CSV', 'Trustlines', 'Export'], author: 'XRPL Flow' },
  'Fetch All Holders by Issuer CSV': { description: 'Loop through account_lines markers, accumulate every page, format holders, and export CSV.', tags: ['Pagination', 'Holders', 'CSV'], author: 'XRPL Flow' },
  'Vault Lifecycle Test Case (Devnet)': { description: 'Create a single-asset vault, then test deposit, withdraw, and delete steps with explicit VaultID handoff.', tags: ['Test Cases', 'Devnet', 'Vaults', 'Lifecycle'], author: 'XRPL Flow' },
  'Private Vault Configuration Test': { description: 'Exercise private/non-transferable vault setup and VaultSet metadata/config updates.', tags: ['Test Cases', 'Devnet', 'Vaults', 'Permissions'], author: 'XRPL Flow' },
  'Vault Clawback Test Case': { description: 'Template for issuer clawback validation against a vault holder.', tags: ['Test Cases', 'Devnet', 'Vaults', 'Compliance'], author: 'XRPL Flow' },
  'Loan Broker Setup Test Case': { description: 'Create vault collateral rails, configure a loan broker, and deposit first-loss cover.', tags: ['Test Cases', 'Devnet', 'Lending', 'Borrow'], author: 'XRPL Flow' },
  'Loan Origination Test Case': { description: 'Create a loan agreement with borrower counterparty fields and common fee/rate knobs.', tags: ['Test Cases', 'Devnet', 'Lending', 'Borrow'], author: 'XRPL Flow' },
  'Loan Payment Modes Test Matrix': { description: 'Run separate payment-mode branches for normal, late, overpayment, and full early payment cases.', tags: ['Test Cases', 'Devnet', 'Lending', 'Repayment'], author: 'XRPL Flow' },
  'Loan State Management Test Case': { description: 'Exercise impair, unimpaired, default, and delete management steps for a loan.', tags: ['Test Cases', 'Devnet', 'Lending', 'Failure Modes'], author: 'XRPL Flow' },
  'Cover Withdraw & Clawback Test': { description: 'Validate broker cover withdrawal and cover clawback operations.', tags: ['Test Cases', 'Devnet', 'Lending', 'Compliance'], author: 'XRPL Flow' },
  'Check Payment Lifecycle': { description: 'Create, cash, and optionally cancel checks for deferred-payment testing.', tags: ['Payments', 'Checks', 'Test Cases'], author: 'XRPL Flow' },
  'NFT Offer Lifecycle Test': { description: 'Mint, list, accept/cancel, and burn NFT flows for marketplace testing.', tags: ['NFT', 'Marketplace', 'Test Cases'], author: 'XRPL Flow' },
  'Account Audit CSV': { description: 'Query account objects and transaction history, then export audit-friendly CSV snapshots.', tags: ['Queries', 'CSV', 'Audit'], author: 'XRPL Flow' },
  'DEX Offer Placement Test': { description: 'Create an offer, wait for a ledger close, then log/query the result for DEX smoke tests.', tags: ['DEX', 'Offers', 'Test Cases'], author: 'XRPL Flow' },
};

type LibraryFilter = 'templates' | 'marketplace' | 'mine' | 'all';

type LibraryItemKind = 'template' | 'marketplace' | 'local';

type LibraryItem = {
  kind: LibraryItemKind;
  document: WorkflowDocumentV2;
  details?: { description: string; tags: string[]; author: string };
  marketplaceId?: string;
  authorAddress?: string;
  /** Set on local items that the signed-in user has already published. */
  publishedTemplateId?: string;
};

const KIND_STYLES: Record<LibraryItemKind, { icon: string; chip: string; label: string }> = {
  template: { icon: 'bg-blue-600/15 text-blue-400', chip: 'border-blue-700/60 bg-blue-600/15 text-blue-300', label: 'Official template' },
  marketplace: { icon: 'bg-emerald-600/15 text-emerald-400', chip: 'border-emerald-700/60 bg-emerald-600/15 text-emerald-300', label: 'Community' },
  local: { icon: 'bg-violet-600/15 text-violet-400', chip: 'border-violet-700/60 bg-violet-600/15 text-violet-300', label: 'My workflow' },
};

const MARKETPLACE_TAG_OPTIONS = [
  'Beginner', 'Payments', 'Queries', 'Tokens', 'NFT', 'DEX', 'AMM', 'CSV',
  'Airdrop', 'Analytics', 'Audit', 'Treasury', 'Safety', 'Loop',
  'Control flow', 'Timing', 'Test Cases', 'Devnet', 'Clio', 'Export',
  'Marketplace', 'Community', 'Compliance', 'Lending', 'Vaults',
];

type PublishDraft = {
  workflow: WorkflowDocumentV2;
  name: string;
  description: string;
  tags: string[];
  authorName: string;
  /** When set, the previous published version is removed after a successful publish. */
  replaceTemplateId?: string;
} | null;

const workflowUsesBatch = (document: WorkflowDocumentV2, tags: string[] = []) =>
  document.nodes.some(node => node.type === 'BatchContainer') ||
  [document.name, ...tags].some(value => /batch/i.test(value));

export function WorkflowLibrary({
  open,
  onClose,
  onImport,
  marketplaceUser,
  marketplaceAuthError,
  onRequestXamanSignIn,
  onSignOutXaman,
}: {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  marketplaceUser: MarketplaceUser | null;
  marketplaceAuthError: string;
  onRequestXamanSignIn: () => Promise<void>;
  onSignOutXaman: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('templates');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [marketplaceTemplates, setMarketplaceTemplates] = useState<MarketplaceTemplate[]>([]);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishDraft, setPublishDraft] = useState<PublishDraft>(null);
  const [selectedLocalWorkflows, setSelectedLocalWorkflows] = useState<string[]>([]);
  const {
    savedWorkflows, currentWorkflowId, currentWorkflowName, currentWorkflowCreatedAt,
    nodes, edges,
    loadWorkflow, duplicateWorkflow, deleteWorkflow, deleteWorkflows, createWorkflow,
  } = useWorkflowStore();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    void listMarketplaceTemplates()
      .then(result => setMarketplaceTemplates(result.templates))
      .catch(error => setMarketplaceError(error instanceof Error ? error.message : 'Could not load marketplace.'));
  }, [open]);

  const exampleWorkflows = useMemo(() => Object.values(createExampleWorkflowDocuments()), []);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of exampleWorkflows) {
      if (workflowUsesBatch(document, TEMPLATE_DETAILS[document.name]?.tags)) continue;
      for (const tag of TEMPLATE_DETAILS[document.name]?.tags || ['Template']) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const localCount = Object.keys(savedWorkflows).length;
    if (localCount > 0) counts.set('Local', (counts.get('Local') || 0) + localCount);
    for (const template of marketplaceTemplates) {
      if (workflowUsesBatch(template.workflow, template.tags)) continue;
      for (const tag of template.tags || ['Marketplace']) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [exampleWorkflows, savedWorkflows, marketplaceTemplates]);

  const toggleTag = (tag: string) => {
    setActiveTags(previous => previous.includes(tag) ? previous.filter(item => item !== tag) : [...previous, tag]);
  };

  const toggleLocalSelection = (name: string) => {
    setSelectedLocalWorkflows(previous => previous.includes(name) ? previous.filter(item => item !== name) : [...previous, name]);
  };

  const deleteSelectedLocalWorkflows = () => {
    const names = selectedLocalWorkflows.filter(name => {
      const document = savedWorkflows[name];
      return document && !document.id.startsWith('example-');
    });
    if (names.length === 0) return;
    if (!confirm(`Delete ${names.length} workflow${names.length === 1 ? '' : 's'}?`)) return;
    deleteWorkflows(names);
    setSelectedLocalWorkflows([]);
  };

  // Local workflows the signed-in user already published are linked by the
  // workflow document id embedded in the published template.
  const publishedByWorkflowId = useMemo(() => {
    const map = new Map<string, string>();
    if (!marketplaceUser) return map;
    for (const template of marketplaceTemplates) {
      if (template.authorAddress !== marketplaceUser.address) continue;
      const workflowId = (template.workflow as WorkflowDocumentV2 | undefined)?.id;
      if (workflowId) map.set(workflowId, template.id);
    }
    return map;
  }, [marketplaceTemplates, marketplaceUser]);

  const workflows = useMemo(() => {
    const items: LibraryItem[] = [
      ...exampleWorkflows.map((document): LibraryItem => ({ kind: 'template', document, details: TEMPLATE_DETAILS[document.name] })),
      ...Object.values(savedWorkflows).map((document): LibraryItem => ({
        kind: 'local',
        document,
        publishedTemplateId: publishedByWorkflowId.get(document.id),
      })),
      ...marketplaceTemplates.map((template): LibraryItem => ({
        kind: 'marketplace',
        document: template.workflow,
        details: { description: template.description, tags: template.tags, author: template.authorName || template.authorAddress },
        marketplaceId: template.id,
        authorAddress: template.authorAddress,
      })),
    ];

    const kindRank: Record<LibraryItemKind, number> = { template: 0, marketplace: 1, local: 2 };
    return items
      .filter(item => item.kind === 'local' || !workflowUsesBatch(item.document, item.details?.tags))
      .filter(item => {
        if (filter === 'all') return true;
        if (filter === 'templates') return item.kind === 'template';
        if (filter === 'marketplace') return item.kind === 'marketplace';
        // "My workflows" shows only local documents; a published one carries a
        // "Published" chip instead of appearing twice.
        return item.kind === 'local';
      })
      .filter(item => activeTags.length === 0 || activeTags.every(tag => (item.details?.tags || ['Local']).includes(tag)))
      .filter(item => {
        const haystack = [item.document.name, item.details?.description, item.details?.author, ...(item.details?.tags || [])].join(' ').toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => kindRank[a.kind] - kindRank[b.kind] || b.document.updatedAt - a.document.updatedAt);
  }, [exampleWorkflows, savedWorkflows, marketplaceTemplates, filter, query, activeTags, publishedByWorkflowId]);

  const openPublishDialog = async (workflow: WorkflowDocumentV2, replaceTemplateId?: string) => {
    if (!marketplaceUser) {
      await onRequestXamanSignIn();
      return;
    }
    const existing = replaceTemplateId ? marketplaceTemplates.find(template => template.id === replaceTemplateId) : undefined;
    setMarketplaceError('');
    setPublishDraft({
      workflow,
      name: workflow.name,
      description: existing?.description || '',
      tags: (existing?.tags?.length ? existing.tags : ['Community']).slice(0, 8),
      authorName: existing?.authorName || marketplaceUser.displayName || '',
      replaceTemplateId,
    });
  };

  const togglePublishTag = (tag: string) => {
    setPublishDraft(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        tags: previous.tags.includes(tag)
          ? previous.tags.filter(item => item !== tag)
          : [...previous.tags, tag].slice(0, 12),
      };
    });
  };

  const updatePublishDraft = (patch: Partial<NonNullable<PublishDraft>>) => {
    setPublishDraft(previous => previous ? { ...previous, ...patch } : previous);
  };

  const submitPublishDraft = async () => {
    if (!publishDraft) return;
    if (!marketplaceUser) {
      await onRequestXamanSignIn();
      return;
    }
    const name = publishDraft.name.trim();
    const description = publishDraft.description.trim();
    const authorName = publishDraft.authorName.trim();
    const tags = publishDraft.tags.map(tag => tag.trim()).filter(Boolean);
    if (!name) {
      setMarketplaceError('Template name is required.');
      return;
    }
    if (!description) {
      setMarketplaceError('Add a short description so users know what this template does.');
      return;
    }
    if (publishDraft.workflow.nodes.length === 0) {
      setMarketplaceError('Add at least one node before publishing this workflow.');
      return;
    }
    if (tags.length === 0) {
      setMarketplaceError('Select at least one tag before publishing.');
      return;
    }
    setPublishing(true);
    setMarketplaceError('');
    try {
      const workflow: WorkflowDocumentV2 = {
        ...publishDraft.workflow,
        name,
        updatedAt: Date.now(),
      };
      if (workflowUsesBatch(workflow, tags)) {
        throw new Error('Batch templates are disabled for now. Remove Batch nodes before publishing.');
      }
      const { template } = await publishMarketplaceTemplate({ name, description, tags, authorName, workflow });
      const replacedId = publishDraft.replaceTemplateId;
      if (replacedId) {
        // Republish = replace: remove the previous version so the marketplace
        // never shows two copies of the same workflow.
        await deleteMarketplaceTemplate(replacedId).catch(() => {});
      }
      setMarketplaceTemplates(previous => [template, ...previous.filter(item => item.id !== replacedId)]);
      setFilter('marketplace');
      setPublishDraft(null);
    } catch (error) {
      setMarketplaceError(error instanceof Error ? error.message : 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  const deletePublishedTemplate = async (id: string) => {
    if (!confirm('Delete this published marketplace template?')) return;
    setMarketplaceError('');
    try {
      await deleteMarketplaceTemplate(id);
      setMarketplaceTemplates(previous => previous.filter(template => template.id !== id));
    } catch (error) {
      setMarketplaceError(error instanceof Error ? error.message : 'Could not delete marketplace template.');
    }
  };

  const currentWorkflowDocument: WorkflowDocumentV2 = {
    version: WORKFLOW_VERSION,
    id: currentWorkflowId,
    name: currentWorkflowName,
    createdAt: currentWorkflowCreatedAt,
    updatedAt: Date.now(),
    nodes: nodes as WorkflowDocumentV2['nodes'],
    edges,
  };

  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex bg-[#07090e]/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="workflow-library-title">
    <aside className="hidden w-56 flex-shrink-0 border-r border-[#242a39] bg-[#0c0f17] p-5 md:block">
      <div className="mb-7 flex items-center gap-2 text-sm font-semibold text-slate-100"><Boxes size={17} className="text-blue-400" />Workflow Library</div>
      <nav className="space-y-1">
        {([
          ['templates', 'Explore templates', Sparkles],
          ['marketplace', 'Marketplace', Boxes],
          ['mine', 'My workflows', UserRound],
          ['all', 'All workflows', Boxes],
        ] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] transition-colors ${filter === value ? 'bg-blue-600/15 text-blue-300' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}><Icon size={13} />{label}</button>)}
      </nav>
      <div className="mt-6 border-t border-[#202635] pt-5">
        <button type="button" onClick={onImport} className="flex w-full items-center justify-center gap-2 rounded-md border border-[#30384c] px-3 py-2 text-[10px] text-slate-300 hover:bg-white/5"><Upload size={12} />Import shared workflow</button>
        <p className="mt-3 text-[9px] leading-relaxed text-slate-600">Imported v2 workflows appear under My workflows. Community publishing can use the same document format.</p>
      </div>
      <div className="mt-4 rounded-lg border border-violet-900/40 bg-violet-950/20 p-3">
        <p className="text-[10px] font-semibold text-violet-200">Marketplace</p>
        <p className="mt-1 text-[9px] leading-relaxed text-violet-100/70">{marketplaceUser ? `Signed in as ${marketplaceUser.displayName || marketplaceUser.address}` : 'Sign in with Xaman to publish your workflow templates.'}</p>
        {marketplaceUser ? <button type="button" onClick={onSignOutXaman} className="mt-3 w-full rounded border border-violet-800/50 px-2 py-1.5 text-[9px] text-violet-200 hover:bg-violet-900/30">Sign out</button> : <button type="button" onClick={onRequestXamanSignIn} className="mt-3 flex w-full items-center justify-center gap-1 rounded bg-violet-600 px-2 py-1.5 text-[9px] font-medium text-white hover:bg-violet-500">Sign in with Xaman</button>}
        <button type="button" onClick={() => openPublishDialog(currentWorkflowDocument, publishedByWorkflowId.get(currentWorkflowId))} disabled={publishing} className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-emerald-800/50 px-2 py-1.5 text-[9px] text-emerald-200 hover:bg-emerald-900/25 disabled:opacity-50"><Send size={10} />Publish open workflow</button>
        {marketplaceAuthError && <p className="mt-2 text-left text-[9px] leading-relaxed text-red-300">{marketplaceAuthError}</p>}
        {marketplaceError && <button type="button" onClick={() => setMarketplaceError('')} className="mt-2 text-left text-[9px] leading-relaxed text-red-300">{marketplaceError}</button>}
      </div>
      <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
        <p className="text-[10px] font-semibold text-amber-200">Beta mode</p>
        <p className="mt-1 text-[9px] leading-relaxed text-amber-100/70">XRPL Flow is in beta. Bugs, validation gaps, and endpoint issues can appear. Test on Testnet or Devnet first.</p>
      </div>
      <div className="mt-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
        <p className="text-[10px] font-semibold text-emerald-200">Tutorial mode</p>
        <p className="mt-1 text-[9px] leading-relaxed text-emerald-100/70">Start with read-only query templates on Testnet, then graduate to guarded Mainnet workflows with review prompts.</p>
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-[#242a39] bg-[#0d1018] px-5 py-4">
        <div className="md:hidden"><Boxes size={17} className="text-blue-400" /></div>
        <div className="min-w-0"><h2 id="workflow-library-title" className="text-sm font-semibold text-slate-100">{filter === 'templates' ? 'Explore workflows' : filter === 'marketplace' ? 'Marketplace' : filter === 'mine' ? 'My workflows' : 'All workflows'}</h2><p className="text-[10px] text-slate-500">Start from a proven flow or open one of your own.</p></div>
        <div className="relative ml-auto w-full max-w-xs"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search workflows, tags, authors…" className="w-full rounded-md border border-[#293044] bg-[#080b12] py-2 pl-8 pr-3 text-[11px] text-slate-200 outline-none focus:border-blue-500/60" /></div>
        <button type="button" onClick={onClose} aria-label="Close workflow library" className="rounded-md p-2 text-slate-500 hover:bg-white/5 hover:text-slate-200"><X size={17} /></button>
      </header>

      <div className="flex items-center gap-2 border-b border-[#202635] px-5 py-2">
        <span className="flex-shrink-0 text-[9px] font-mono uppercase tracking-wider text-slate-600">Tags</span>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5">
          {allTags.map(([tag, count]) => {
            const selected = activeTags.includes(tag);
            return <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-[8px] transition-colors ${selected ? 'border-blue-500 bg-blue-600/20 text-blue-200' : 'border-[#30384a] bg-[#171c28] text-slate-500 hover:border-blue-600/60 hover:text-slate-300'}`}>{tag} <span className="ml-1 text-slate-600">{count}</span></button>;
          })}
        </div>
        {activeTags.length > 0 && <button type="button" onClick={() => setActiveTags([])} className="flex-shrink-0 text-[8px] text-blue-400 hover:text-blue-300">clear</button>}
        {selectedLocalWorkflows.length > 0 && (
          <button type="button" onClick={deleteSelectedLocalWorkflows} className="ml-2 flex-shrink-0 rounded border border-red-800/60 bg-red-950/30 px-2 py-1 text-[9px] text-red-200 hover:bg-red-900/40">
            Delete selected ({selectedLocalWorkflows.length})
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-[#202635] px-4 py-2 md:hidden">
        {(['templates', 'marketplace', 'mine', 'all'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded px-3 py-1 text-[10px] capitalize ${filter === value ? 'bg-blue-600/20 text-blue-300' : 'text-slate-500'}`}>{value}</button>)}
        <button onClick={onImport} className="ml-auto rounded px-3 py-1 text-[10px] text-slate-400"><Upload size={11} /></button>
      </div>
      {activeTags.length > 0 && <div className="flex flex-wrap items-center gap-1 border-b border-[#202635] px-5 py-2"><span className="mr-1 text-[9px] text-slate-600">Filtering:</span>{activeTags.map(tag => <button key={tag} type="button" onClick={() => toggleTag(tag)} className="rounded-full border border-blue-700/60 bg-blue-600/15 px-2 py-0.5 text-[8px] text-blue-200">{tag} ×</button>)}<button type="button" onClick={() => setActiveTags([])} className="ml-1 text-[8px] text-slate-500 hover:text-slate-300">clear all</button></div>}

      <section className="flex-1 overflow-y-auto p-5">
        {workflows.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center"><Boxes size={30} className="mb-3 text-slate-700" /><p className="text-sm text-slate-400">No workflows found</p><p className="mt-1 text-[10px] text-slate-600">Try another search or import a shared v2 workflow.</p></div> :
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">{workflows.map((item) => {
            const { kind, document, details } = item;
            const txCount = document.nodes.filter(node => Boolean(getTransactionAdapter(String(node.type)))).length;
            const queryCount = document.nodes.filter(node => String(node.type).includes('Query')).length;
            const cardKey = `${kind}:${document.id}:${item.marketplaceId || 'local'}`;
            const isLocal = kind === 'local';
            const selected = selectedLocalWorkflows.includes(document.name);
            const ownMarketplace = kind === 'marketplace' && Boolean(marketplaceUser?.address) && marketplaceUser?.address === item.authorAddress;
            const style = KIND_STYLES[kind];
            const author = kind === 'template' ? (details?.author || 'XRPL Flow') : kind === 'marketplace' ? (details?.author || 'Community builder') : 'You';
            return <article key={cardKey} className={`group flex min-h-52 flex-col rounded-xl border bg-[#10141e] p-4 transition-colors hover:border-blue-500/45 ${document.id === currentWorkflowId ? 'border-blue-500/60' : 'border-[#252c3c]'}`}>
              <div className="mb-3 flex items-start gap-3">
                {isLocal && <input type="checkbox" checked={selected} onChange={() => toggleLocalSelection(document.name)} aria-label={`Select ${document.name}`} className="mt-3 h-3.5 w-3.5 rounded border-[#30384a] bg-[#171c28] accent-blue-600" />}
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${style.icon}`}>{kind === 'template' ? <Sparkles size={17} /> : <UserRound size={17} />}</div>
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-semibold text-slate-100">{document.name}</h3>
                  <p className="mt-0.5 text-[9px] text-slate-500">by {author} {document.id === currentWorkflowId && <span className="ml-1 text-blue-400">• open</span>}</p>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[8px] font-medium ${style.chip}`}>{style.label}</span>
                {ownMarketplace && <span className="rounded-full border border-emerald-700/60 bg-emerald-600/15 px-2 py-0.5 text-[8px] font-medium text-emerald-300">Yours</span>}
                {isLocal && item.publishedTemplateId && <span className="rounded-full border border-emerald-700/60 bg-emerald-600/15 px-2 py-0.5 text-[8px] font-medium text-emerald-300">Published</span>}
              </div>
              <p className="mb-4 line-clamp-3 text-[10px] leading-relaxed text-slate-400">{details?.description || 'A local XRPL Flow v2 workflow. Export it to share with other builders.'}</p>
              <div className="mb-4 flex flex-wrap gap-1.5">{(details?.tags || ['Local']).map(tag => <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`rounded-full border px-2 py-0.5 text-[8px] transition-colors ${activeTags.includes(tag) ? 'border-blue-500 bg-blue-600/20 text-blue-200' : 'border-[#30384a] bg-[#171c28] text-slate-400 hover:border-blue-600/60 hover:text-blue-200'}`}>{tag}</button>)}</div>
              <div className="mt-auto flex items-center gap-2 border-t border-[#222938] pt-3">
                <span className="mr-auto text-[9px] text-slate-600">{document.nodes.length} nodes · {queryCount} queries · {txCount} txns</span>
                {isLocal && <button type="button" onClick={() => openPublishDialog(document, item.publishedTemplateId)} className="rounded-md border border-emerald-800/60 px-2.5 py-1.5 text-[10px] font-medium text-emerald-200 hover:bg-emerald-900/25">{item.publishedTemplateId ? 'Update published' : 'Publish'}</button>}
                {ownMarketplace && item.marketplaceId && <button type="button" onClick={() => deletePublishedTemplate(item.marketplaceId!)} title="Remove from marketplace" className="rounded p-1.5 text-slate-500 hover:bg-red-950/50 hover:text-red-300"><Trash2 size={12} /></button>}
                {isLocal && <>
                  <button type="button" onClick={() => duplicateWorkflow(document.name)} title="Duplicate" className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200"><Copy size={12} /></button>
                  <button type="button" onClick={() => { if (confirm(`Delete “${document.name}”?`)) deleteWorkflow(document.name); }} title="Delete" className="rounded p-1.5 text-slate-500 hover:bg-red-950/50 hover:text-red-300"><Trash2 size={12} /></button>
                </>}
                <button type="button" onClick={() => { if (isLocal) loadWorkflow(document.name); else createWorkflow(document.name, document.nodes as any, document.edges, { autosave: false }); onClose(); }} className="rounded-md bg-blue-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-blue-500">{isLocal ? 'Open' : 'Use as draft'}</button>
              </div>
            </article>;
          })}</div>}
      </section>
    </main>
    {publishDraft && (
      <div className="absolute inset-0 z-[75] flex items-center justify-center bg-black/55 p-4">
        <div className="w-full max-w-xl rounded-xl border border-[#2a3245] bg-[#0d1018] shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-[#202635] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{publishDraft.replaceTemplateId ? 'Update published template' : 'Publish workflow template'}</h3>
              <p className="mt-1 text-[10px] text-slate-500">{publishDraft.replaceTemplateId ? 'This replaces your previously published version in the marketplace.' : 'Share this workflow with the community. It stays editable in My workflows.'}</p>
            </div>
            <button type="button" onClick={() => setPublishDraft(null)} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200" aria-label="Close publish dialog"><X size={16} /></button>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="rounded-md border border-amber-800/50 bg-amber-950/20 px-3 py-2">
              <div className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-300" />
                <p className="text-[11px] leading-relaxed text-amber-100/80">XRPL Flow marketplace publishing is beta. Templates may contain bugs or require setup, so describe assumptions clearly and test on Testnet or Devnet first.</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] font-mono text-slate-400">Template name</span>
              <input value={publishDraft.name} onChange={event => updatePublishDraft({ name: event.target.value })} className="w-full rounded border border-[#293044] bg-[#080b12] px-3 py-2 text-[12px] text-slate-100 outline-none focus:border-blue-500/60" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-mono text-slate-400">Display name</span>
              <input value={publishDraft.authorName} onChange={event => updatePublishDraft({ authorName: event.target.value })} placeholder={marketplaceUser?.address || 'Shown as author'} className="w-full rounded border border-[#293044] bg-[#080b12] px-3 py-2 text-[12px] text-slate-100 outline-none focus:border-blue-500/60 placeholder:text-slate-600" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-mono text-slate-400">Description</span>
              <textarea value={publishDraft.description} onChange={event => updatePublishDraft({ description: event.target.value })} rows={4} placeholder="What does this template do? What should users fill before running it?" className="w-full resize-none rounded border border-[#293044] bg-[#080b12] px-3 py-2 text-[12px] leading-5 text-slate-100 outline-none focus:border-blue-500/60 placeholder:text-slate-600" />
            </label>

            <div>
              <span className="mb-2 block text-[10px] font-mono text-slate-400">Tags</span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {publishDraft.tags.length === 0 ? <span className="text-[10px] text-slate-600">Select at least one tag.</span> : publishDraft.tags.map(tag => (
                  <button key={tag} type="button" onClick={() => togglePublishTag(tag)} className="inline-flex items-center gap-1 rounded-full border border-blue-700/60 bg-blue-600/15 px-2 py-0.5 text-[9px] text-blue-200">
                    <Check size={10} />{tag} ×
                  </button>
                ))}
              </div>
              <div className="max-h-28 overflow-y-auto rounded border border-[#293044] bg-[#080b12] p-2">
                <div className="flex flex-wrap gap-1.5">
                  {MARKETPLACE_TAG_OPTIONS.map(tag => {
                    const selected = publishDraft.tags.includes(tag);
                    return <button key={tag} type="button" onClick={() => togglePublishTag(tag)} className={`rounded-full border px-2 py-1 text-[9px] transition-colors ${selected ? 'border-blue-500 bg-blue-600/20 text-blue-200' : 'border-[#30384a] text-slate-400 hover:border-blue-600/60 hover:text-blue-200'}`}>{tag}</button>;
                  })}
                </div>
              </div>
            </div>

            {marketplaceError && <button type="button" onClick={() => setMarketplaceError('')} className="w-full rounded border border-red-800/50 bg-red-950/20 px-3 py-2 text-left text-[11px] leading-relaxed text-red-300">{marketplaceError}</button>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#202635] px-5 py-4">
            <button type="button" onClick={() => setPublishDraft(null)} className="rounded border border-[#30384c] px-3 py-2 text-[11px] text-slate-300 hover:bg-white/5">Cancel</button>
            <button type="button" onClick={submitPublishDraft} disabled={publishing} className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"><Send size={12} />{publishing ? 'Publishing...' : publishDraft.replaceTemplateId ? 'Update template' : 'Publish template'}</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

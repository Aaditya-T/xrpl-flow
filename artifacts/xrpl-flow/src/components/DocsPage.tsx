import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Play, Search } from 'lucide-react';
import { DOCS_PAGES, type DocsBlock, findDocsPage, findDocsSection } from '@/lib/docsContent';
import { navigateToApp, navigateToDocs } from '@/lib/docsRoute';
import { EXAMPLE_WORKFLOWS, type ExampleWorkflow } from '@/lib/exampleWorkflows';
import { QUICK_TRY_WORKFLOWS, runDocsQuickTry } from '@/lib/docsQuickTry';
import { getNodeDef } from '@/lib/nodeRegistry';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

function cloneWorkflow<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getNodeBounds(workflow: ExampleWorkflow) {
  const nodeMap = new Map(workflow.nodes.map(node => [node.id, node]));
  const absolute = workflow.nodes.map(node => {
    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined;
    const x = node.position.x + (parent?.position.x || 0);
    const y = node.position.y + (parent?.position.y || 0);
    const width = Number(node.style?.width || (node.type === 'LoopContainer' || node.type === 'BatchContainer' ? 190 : 118));
    const height = Number(node.style?.height || (node.type === 'LoopContainer' || node.type === 'BatchContainer' ? 96 : 42));
    return { node, x, y, width, height };
  });
  const minX = Math.min(...absolute.map(item => item.x));
  const minY = Math.min(...absolute.map(item => item.y));
  const maxX = Math.max(...absolute.map(item => item.x + item.width));
  const maxY = Math.max(...absolute.map(item => item.y + item.height));
  return { absolute, minX, minY, maxX, maxY };
}

function WorkflowPreview({ workflow }: { workflow: ExampleWorkflow }) {
  const bounds = getNodeBounds(workflow);
  const viewBox = `${bounds.minX - 40} ${bounds.minY - 40} ${Math.max(420, bounds.maxX - bounds.minX + 80)} ${Math.max(180, bounds.maxY - bounds.minY + 80)}`;
  const nodeById = new Map(bounds.absolute.map(item => [item.node.id, item]));

  return (
    <svg viewBox={viewBox} className="h-32 w-full rounded border border-[#273044] bg-[#080b12]" role="img" aria-label={`${workflow.name} workflow preview`}>
      <defs>
        <marker id={`arrow-${workflow.name.replace(/[^a-z0-9]/gi, '')}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
        </marker>
      </defs>
      {workflow.edges.map(edge => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        const sourceX = source.x + source.width;
        const sourceY = source.y + source.height / 2;
        const targetX = target.x;
        const targetY = target.y + target.height / 2;
        const midX = sourceX + Math.max(35, (targetX - sourceX) / 2);
        return (
          <path
            key={edge.id}
            d={`M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`}
            fill="none"
            stroke="#64748b"
            strokeWidth="3"
            markerEnd={`url(#arrow-${workflow.name.replace(/[^a-z0-9]/gi, '')})`}
          />
        );
      })}
      {bounds.absolute.map(({ node, x, y, width, height }) => {
        const definition = getNodeDef(node.type as string);
        const color = definition?.color || '#64748b';
        const isContainer = node.type === 'LoopContainer' || node.type === 'BatchContainer';
        return (
          <g key={node.id}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx="8"
              fill={isContainer ? '#111827' : '#0f172a'}
              stroke={color}
              strokeWidth={isContainer ? 3 : 2}
              opacity={node.parentId ? 0.92 : 1}
            />
            <circle cx={x + 17} cy={y + 20} r="5" fill={color} />
            <text x={x + 30} y={y + 24} fill="#dbeafe" fontSize="18" fontFamily="Inter, sans-serif">
              {String(node.data?.label || definition?.label || node.type).slice(0, 22)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function WorkflowExamples({ block }: { block: Extract<DocsBlock, { type: 'workflow-examples' }> }) {
  const createWorkflow = useWorkflowStore(state => state.createWorkflow);
  const quickStore = useWorkflowStore();
  const [runningExample, setRunningExample] = useState('');
  const [runMessage, setRunMessage] = useState('');
  const [runError, setRunError] = useState('');
  const examples = block.examples
    .map(name => EXAMPLE_WORKFLOWS.find(workflow => workflow.name === name))
    .filter((workflow): workflow is ExampleWorkflow => Boolean(workflow));

  if (examples.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#263047] bg-[#0d111b] p-4">
      {block.title && <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-blue-300">{block.title}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {examples.map(workflow => {
          const quickTryEnabled = QUICK_TRY_WORKFLOWS.has(workflow.name);
          const isRunning = runningExample === workflow.name;
          const nodeCount = workflow.nodes.length;
          const transactionCount = workflow.nodes.filter(node => {
            const category = getNodeDef(node.type as string)?.category || '';
            return !['Triggers', 'Control Flow', 'Output', 'Data Utilities', 'Ledger Queries'].includes(category);
          }).length;
          const queryCount = workflow.nodes.filter(node => getNodeDef(node.type as string)?.category === 'Ledger Queries').length;
          return (
            <div key={workflow.name} className="rounded-md border border-[#2a344b] bg-[#0a0d14] p-3">
              <WorkflowPreview workflow={workflow} />
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-100">{workflow.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {nodeCount} nodes
                    {queryCount ? ` · ${queryCount} queries` : ''}
                    {transactionCount ? ` · ${transactionCount} tx nodes` : ''}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {quickTryEnabled ? 'Quick try runs on Testnet or Devnet with docs-funded wallets.' : 'Needs values or setup first.'}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col gap-1.5">
                  {quickTryEnabled && (
                    <button
                      type="button"
                      disabled={Boolean(runningExample)}
                      onClick={async () => {
                        setRunningExample(workflow.name);
                        setRunMessage('');
                        setRunError('');
                        try {
                          const result = await runDocsQuickTry(workflow.name, cloneWorkflow(workflow.nodes), cloneWorkflow(workflow.edges), quickStore);
                          setRunMessage(`${workflow.name} ran on ${result.network}. Source and destination docs wallets are in the Wallets panel.`);
                        } catch (error) {
                          setRunError(error instanceof Error ? error.message : 'Quick try failed.');
                        } finally {
                          setRunningExample('');
                        }
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Play size={12} fill="currentColor" />
                      {isRunning ? 'Running' : 'Quick try'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(runningExample)}
                    onClick={() => {
                    createWorkflow(`Docs: ${workflow.name}`, cloneWorkflow(workflow.nodes), cloneWorkflow(workflow.edges), { autosave: false });
                      navigateToApp();
                    }}
                    className="inline-flex items-center justify-center rounded border border-[#2d3850] bg-[#111827] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-blue-500/60 hover:text-blue-200 disabled:opacity-60"
                  >
                    Open in editor
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {(runMessage || runError) && (
        <div className={cn('mt-3 rounded border px-3 py-2 text-[12px]', runError ? 'border-red-800/50 bg-red-950/20 text-red-300' : 'border-emerald-800/50 bg-emerald-950/20 text-emerald-300')}>
          {runError || runMessage}
        </div>
      )}
    </div>
  );
}

function DocsBlockView({ block }: { block: DocsBlock }) {
  if (block.type === 'p') {
    return <p className="text-[14px] leading-7 text-slate-300">{block.text}</p>;
  }
  if (block.type === 'ul') {
    return (
      <ul className="space-y-2 pl-5 text-[14px] leading-7 text-slate-300">
        {block.items.map(item => <li key={item} className="list-disc">{item}</li>)}
      </ul>
    );
  }
  if (block.type === 'code') {
    return (
      <pre className="overflow-x-auto rounded-md border border-[#273044] bg-[#080b12] p-3 text-[12px] leading-6 text-blue-100">
        <code>{block.code}</code>
      </pre>
    );
  }
  if (block.type === 'workflow-examples') {
    return <WorkflowExamples block={block} />;
  }
  return (
    <div className="rounded-md border border-blue-800/40 bg-blue-950/20 p-3">
      <p className="text-[12px] font-semibold text-blue-200">{block.title}</p>
      <p className="mt-1 text-[13px] leading-6 text-blue-100/80">{block.text}</p>
    </div>
  );
}

export function DocsPage({ pageId, sectionId }: { pageId: string; sectionId?: string }) {
  const [query, setQuery] = useState('');
  const activeSectionRef = useRef<HTMLElement | null>(null);
  const page = findDocsPage(pageId);
  const activeSection = findDocsSection(page, sectionId) || page.sections[0];
  const normalizedQuery = query.trim().toLowerCase();

  const filteredPages = useMemo(() => {
    if (!normalizedQuery) return DOCS_PAGES;
    return DOCS_PAGES.filter(candidate => {
      const haystack = [
        candidate.title,
        candidate.summary,
        ...candidate.sections.flatMap(section => [
          section.title,
          ...section.blocks.flatMap(block => {
            if (block.type === 'ul') return block.items;
            if (block.type === 'code') return [block.code];
            if (block.type === 'callout') return [block.title, block.text];
            if (block.type === 'workflow-examples') return [block.title || '', ...block.examples];
            return [block.text];
          }),
        ]),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  useEffect(() => {
    document.title = `${page.title} - XRPL Flow Docs`;
  }, [page.title]);

  useEffect(() => {
    if (!sectionId) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    requestAnimationFrame(() => {
      activeSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [page.id, sectionId]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a0b0d] text-slate-100">
      <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-[#1e2130] bg-[#0e1018] px-4">
        <button
          type="button"
          onClick={navigateToApp}
          className="flex items-center gap-1.5 rounded border border-[#2e3448] bg-[#1e2130] px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-[#252b3b] hover:text-white"
        >
          <ArrowLeft size={13} />
          App
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={16} className="text-blue-400" />
          <span className="text-[13px] font-semibold tracking-tight">XRPL Flow Docs</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex max-h-[40vh] w-full flex-shrink-0 flex-col border-b border-[#1e2130] bg-[#0e1018] md:max-h-none md:w-[300px] md:border-b-0 md:border-r">
          <div className="border-b border-[#1e2130] p-3">
            <label className="flex items-center gap-2 rounded-md border border-[#273044] bg-[#080b12] px-2.5 py-2">
              <Search size={13} className="text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search docs"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600"
              />
            </label>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Docs topics">
            {filteredPages.map(candidate => (
              <div key={candidate.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => navigateToDocs(candidate.id)}
                  className={cn(
                    'w-full rounded px-2 py-2 text-left text-[12px] font-medium transition-colors',
                    candidate.id === page.id ? 'bg-blue-600/15 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                  )}
                >
                  {candidate.title}
                </button>
                {candidate.id === page.id && (
                  <div className="mb-1 ml-2 border-l border-[#273044] pl-2">
                    {candidate.sections.map(section => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => navigateToDocs(`${candidate.id}#${section.id}`)}
                        className={cn(
                          'block w-full rounded px-2 py-1.5 text-left text-[11px] transition-colors',
                          section.id === activeSection.id ? 'text-blue-300' : 'text-slate-500 hover:text-slate-300',
                        )}
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
            <div className="mb-8 rounded-lg border border-[#263047] bg-[#0d111b] p-5 shadow-xl md:p-6">
              <p className="mb-2 text-[11px] font-mono uppercase tracking-widest text-blue-400">XRPL Flow Docs</p>
              <h1 className="text-[30px] font-semibold tracking-tight text-slate-50">{page.title}</h1>
              <p className="mt-3 max-w-[720px] text-[15px] leading-7 text-slate-400">{page.summary}</p>
              <p className="mt-3 max-w-[720px] rounded-md border border-amber-800/45 bg-amber-950/20 px-3 py-2 text-[12px] leading-6 text-amber-100/80">Beta mode: XRPL Flow is still evolving. Bugs, endpoint issues, and template assumptions can appear, so try examples on Testnet or Devnet before adapting them for real funds.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {page.sections.slice(0, 4).map(section => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => navigateToDocs(`${page.id}#${section.id}`)}
                    className="rounded-full border border-[#2d3850] bg-[#111827] px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-blue-500/60 hover:text-blue-200"
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-10">
              {page.sections.map(section => (
                <section
                  key={section.id}
                  id={section.id}
                  ref={section.id === activeSection.id ? activeSectionRef : undefined}
                  className="scroll-mt-6"
                >
                  <h2 className="mb-3 text-[20px] font-semibold text-slate-100">{section.title}</h2>
                  <div className="space-y-4">
                    {section.blocks.map((block, index) => <DocsBlockView key={`${section.id}-${index}`} block={block} />)}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}

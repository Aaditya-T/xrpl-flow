import { useState } from 'react';
import { Search } from 'lucide-react';
import { NODE_REGISTRY, CATEGORY_ORDER, NodeTypeDef } from '@/lib/nodeRegistry';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

interface PaletteItemProps {
  def: NodeTypeDef;
  isDevnetWarning: boolean;
  onInsert: (def: NodeTypeDef) => void;
}

function PaletteItem({ def, isDevnetWarning, onInsert }: PaletteItemProps) {
  const onDragStart = (e: React.DragEvent) => {
    if (isDevnetWarning) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/reactflow/type', def.id);
    e.dataTransfer.setData('application/reactflow/label', def.label);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable={!isDevnetWarning}
      onDragStart={onDragStart}
      role="button"
      tabIndex={isDevnetWarning ? -1 : 0}
      aria-disabled={isDevnetWarning}
      onKeyDown={event => { if (!isDevnetWarning && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onInsert(def); } }}
      data-testid={`palette-item-${def.id}`}
      className={cn(
        'flex items-start gap-2 px-2.5 py-2 rounded cursor-grab',
        'hover:bg-[#1e2130] transition-colors duration-100 active:cursor-grabbing',
        isDevnetWarning && 'opacity-40',
      )}
      title={def.description}
    >
      <div
        className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0"
        style={{ backgroundColor: def.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-200 font-medium truncate">{def.label}</span>
          {def.networkGating === 'devnet-only' && (
            <span className="text-[8px] font-mono bg-lime-900/40 text-lime-500 border border-lime-800/40 px-1 rounded flex-shrink-0">
              DEV
            </span>
          )}
        </div>
        <p className="text-[9px] text-slate-500 truncate mt-0.5">{def.description}</p>
      </div>
    </div>
  );
}

export function NodePalette() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Triggers', 'Payments & Channels', 'Control Flow']));
  const { network, nodes, setNodes, pushToUndoStack } = useWorkflowStore();

  const insertNode = (def: NodeTypeDef) => {
    if (def.networkGating === 'devnet-only' && network !== 'devnet') return;
    pushToUndoStack();
    const index = nodes.length;
    setNodes([...nodes, {
      id: `node_${crypto.randomUUID()}`,
      type: def.id,
      position: { x: 120 + (index % 4) * 220, y: 100 + Math.floor(index / 4) * 150 },
      data: { label: def.label, config: {} },
      ...(def.id === 'BatchContainer' || def.id === 'LoopContainer' ? { style: { width: 480, height: 260 } } : {}),
    }]);
  };

  const filtered = search
    ? NODE_REGISTRY.filter(n =>
        n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.category.toLowerCase().includes(search.toLowerCase()) ||
        n.description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const toggle = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const grouped = CATEGORY_ORDER.reduce<Record<string, NodeTypeDef[]>>((acc, cat) => {
    const nodes = NODE_REGISTRY.filter(n => n.category === cat);
    if (nodes.length > 0) acc[cat] = nodes;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-[#0e1018] border-r border-[#1e2130]" data-testid="node-palette">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#1e2130]">
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Nodes</p>
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            placeholder="Search nodes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="palette-search"
            className="w-full bg-[#151820] border border-[#1e2130] rounded text-[11px] text-slate-200 pl-7 pr-2 py-1.5 outline-none focus:border-blue-500/50 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto">
        {filtered ? (
          /* Search results — flat list */
          <div className="py-1">
            {filtered.length === 0 && (
              <p className="text-[11px] text-slate-600 text-center py-6">No results</p>
            )}
            {filtered.map(def => (
              <PaletteItem
                key={def.id}
                def={def}
                isDevnetWarning={def.networkGating === 'devnet-only' && network !== 'devnet'}
                onInsert={insertNode}
              />
            ))}
          </div>
        ) : (
          /* Grouped accordion */
          CATEGORY_ORDER.map(cat => {
            const nodes = grouped[cat];
            if (!nodes) return null;
            const isOpen = expanded.has(cat);
            const color = nodes[0]?.color || '#6b7280';
            const devnetCount = nodes.filter(n => n.networkGating === 'devnet-only').length;
            const allDevnet = devnetCount === nodes.length;

            return (
              <div key={cat} className="border-b border-[#1e2130]/60">
                <button
                  onClick={() => toggle(cat)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#1e2130]/40 transition-colors"
                  data-testid={`category-${cat}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[10px] font-medium text-slate-300">{cat}</span>
                    {allDevnet && (
                      <span className="text-[8px] font-mono text-lime-600">DEV</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-600">{nodes.length}</span>
                    <span className="text-slate-600 text-[10px]">{isOpen ? '▾' : '▸'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="pb-1">
                    {nodes.map(def => (
                      <PaletteItem
                        key={def.id}
                        def={def}
                        isDevnetWarning={def.networkGating === 'devnet-only' && network !== 'devnet'}
                        onInsert={insertNode}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer tip */}
      <div className="px-3 py-2 border-t border-[#1e2130] text-[9px] text-slate-600 font-mono">
        drag nodes or focus one and press Enter
      </div>
    </div>
  );
}

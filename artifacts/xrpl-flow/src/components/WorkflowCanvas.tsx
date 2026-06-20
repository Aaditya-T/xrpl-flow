import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  Connection,
  NodeTypes,
  Node,
  SelectionMode,
} from '@xyflow/react';
import { MousePointer2, Trash2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore } from '@/store/workflowStore';
import { getNodeDef, NODE_REGISTRY } from '@/lib/nodeRegistry';
import { initializeExamplesIfNeeded } from '@/lib/exampleWorkflows';
import { NodePalette } from './NodePalette';
import { ConfigPanel } from './ConfigPanel';
import { WalletPanel } from './WalletPanel';
import { ExecutionLog } from './ExecutionLog';
import { Header } from './Header';
import { XRPLNode } from './nodes/XRPLNode';
import { BatchContainerNode } from './nodes/BatchContainerNode';
import { LoopContainerNode } from './nodes/LoopContainerNode';
import { TransactionReviewDialog } from './TransactionReviewDialog';

const NODE_TYPES: NodeTypes = Object.fromEntries(
  NODE_REGISTRY.map(definition => [
    definition.id,
    definition.id === 'BatchContainer' ? BatchContainerNode : definition.id === 'LoopContainer' ? LoopContainerNode : XRPLNode,
  ]),
);

/** Default size for a newly-dropped BatchContainer group */
const BATCH_DEFAULT_W = 480;
const BATCH_DEFAULT_H = 260;
const LOOP_DEFAULT_W = 480;
const LOOP_DEFAULT_H = 260;

let nodeIdCounter = Date.now();
const newNodeId = () => `node_${nodeIdCounter++}`;

/**
 * Returns the BatchContainer node (if any) that fully contains the given
 * flow-space point (cx, cy).
 */
function findParentBatch(nodes: Node[], cx: number, cy: number): Node | undefined {
  return nodes.find((n) => {
    if (n.type !== 'BatchContainer' && n.type !== 'LoopContainer') return false;
    const w = (n.style?.width as number) || (n.type === 'LoopContainer' ? LOOP_DEFAULT_W : BATCH_DEFAULT_W);
    const h = (n.style?.height as number) || (n.type === 'LoopContainer' ? LOOP_DEFAULT_H : BATCH_DEFAULT_H);
    return (
      cx >= n.position.x &&
      cx <= n.position.x + w &&
      cy >= n.position.y &&
      cy <= n.position.y + h
    );
  });
}

function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  const [showLog, setShowLog] = useState(false);
  const [rightTab, setRightTab] = useState<'config' | 'wallets'>('wallets');
  const [isConnecting, setIsConnecting] = useState(false);

  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setSelectedNodeId, selectedNodeId,
    loadWorkflow, loadInitialWorkflows, savedWorkflows,
    pushToUndoStack, undo, redo, saveWorkflow, dirty,
  } = useWorkflowStore();
  const selectedNodes = nodes.filter(node => node.selected);

  // Initialize example workflows on first load
  useEffect(() => {
    const workflows = initializeExamplesIfNeeded();
    if (Object.keys(workflows).length > 0) {
      loadInitialWorkflows(workflows);
      if (nodes.length === 0) {
        const first = Object.keys(workflows)[0];
        if (first) loadWorkflow(first);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist v2 documents after a short idle period. Config fields already update
  // node data live, so switching selection cannot discard edits.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(saveWorkflow, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, nodes, edges, saveWorkflow]);

  // Global keyboard shortcuts: Cmd/Ctrl+S → save, Cmd/Ctrl+Z → undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 's') {
        e.preventDefault();
        saveWorkflow();
      }
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveWorkflow, undo, redo]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
    setRightTab('config');
  }, [setSelectedNodeId]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setRightTab('wallets');
  }, [setSelectedNodeId]);

  const handleConnect = useCallback((connection: Connection) => {
    onConnect(connection);
  }, [onConnect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType  = e.dataTransfer.getData('application/reactflow/type');
    const nodeLabel = e.dataTransfer.getData('application/reactflow/label');
    if (!nodeType) return;

    pushToUndoStack();

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const def = getNodeDef(nodeType);

    // Detect if we're dropping inside a BatchContainer's bounds
    const parentBatch = nodeType !== 'BatchContainer' && nodeType !== 'LoopContainer'
      ? findParentBatch(nodes, position.x, position.y)
      : undefined;

    const newNode: Node = {
      id: newNodeId(),
      type: nodeType,
      position: parentBatch
        ? {
            x: position.x - parentBatch.position.x,
            y: position.y - parentBatch.position.y,
          }
        : position,
      data: {
        label: nodeLabel || def?.label || nodeType,
        config: {},
      },
      ...(nodeType === 'BatchContainer' && {
        style: { width: BATCH_DEFAULT_W, height: BATCH_DEFAULT_H },
      }),
      ...(nodeType === 'LoopContainer' && {
        style: { width: LOOP_DEFAULT_W, height: LOOP_DEFAULT_H },
      }),
      ...(parentBatch && {
        parentId: parentBatch.id,
        extent: 'parent' as const,
      }),
    };

    onNodesChange([{ type: 'add', item: newNode }]);
  }, [screenToFlowPosition, onNodesChange, nodes, pushToUndoStack]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0b0d]">
      <Header onToggleLog={() => setShowLog(p => !p)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Node Palette */}
        <div className="w-[240px] flex-shrink-0 overflow-hidden">
          <NodePalette />
        </div>

        {/* Center: Canvas */}
        <div
          ref={reactFlowWrapper}
          className={`flex-1 relative ${isConnecting ? 'is-connecting' : ''}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          data-testid="canvas"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onConnectStart={() => setIsConnecting(true)}
            onConnectEnd={() => setIsConnecting(false)}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            defaultEdgeOptions={{ style: { stroke: 'hsl(210 100% 50% / 0.5)', strokeWidth: 1.5 } }}
            connectionLineStyle={{ stroke: '#0085ff', strokeWidth: 1.5 }}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            panActivationKeyCode="Space"
            deleteKeyCode={['Delete', 'Backspace']}
            snapToGrid={true}
            snapGrid={[10, 10]}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="hsl(225 20% 14%)"
            />
            <Controls position="bottom-right" />
            <MiniMap
              position="bottom-left"
              nodeColor={(node) => {
                if (node.type === 'BatchContainer') return '#ef4444';
                const def = getNodeDef(node.type as string);
                return def?.color || '#6b7280';
              }}
              maskColor="rgba(10,11,13,0.7)"
            />
          </ReactFlow>

          {selectedNodes.length > 1 && (
            <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#30374a] bg-[#111520]/95 px-2.5 py-1.5 shadow-xl backdrop-blur" role="toolbar" aria-label="Multiple node selection">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-300"><MousePointer2 size={11} className="text-blue-400" />{selectedNodes.length} nodes selected</span>
              <div className="h-4 w-px bg-[#30374a]" />
              <button type="button" onClick={() => deleteElements({ nodes: selectedNodes.map(node => ({ id: node.id })) })} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-red-300 transition-colors hover:bg-red-950/60 hover:text-red-200" title="Delete selected nodes (Delete)"><Trash2 size={11} />Delete</button>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-[#252b3b]/80 bg-[#0d1018]/85 px-2.5 py-1 text-[9px] text-slate-500 backdrop-blur">
            Drag empty canvas to select · Space-drag to pan · Delete removes selection
          </div>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-[13px] text-slate-600 font-medium">Drop nodes from the palette</p>
                <p className="text-[11px] text-slate-700 mt-1">or load an example workflow from the header</p>
                <p className="text-[10px] text-slate-700 mt-1 font-mono">⌘S save · ⌘Z undo · hover node → × to delete</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Config / Wallet panel */}
        <div className="w-[280px] flex-shrink-0 flex flex-col border-l border-[#1e2130] bg-[#0e1018]">
          <div className="flex border-b border-[#1e2130] flex-shrink-0">
            <button
              onClick={() => setRightTab('config')}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${rightTab === 'config' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
              data-testid="tab-config"
            >
              Config
            </button>
            <button
              onClick={() => setRightTab('wallets')}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${rightTab === 'wallets' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
              data-testid="tab-wallets"
            >
              Wallets
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === 'config' ? <ConfigPanel /> : <WalletPanel />}
          </div>
        </div>
      </div>

      {showLog && (
        <div className="h-[220px] flex-shrink-0">
          <ExecutionLog onClose={() => setShowLog(false)} />
        </div>
      )}
      <TransactionReviewDialog />
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}

import { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  addEdge,
  Connection,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore } from '@/store/workflowStore';
import { getNodeDef } from '@/lib/nodeRegistry';
import { initializeExamplesIfNeeded } from '@/lib/exampleWorkflows';
import { NodePalette } from './NodePalette';
import { ConfigPanel } from './ConfigPanel';
import { WalletPanel } from './WalletPanel';
import { ExecutionLog } from './ExecutionLog';
import { Header } from './Header';
import { XRPLNode } from './nodes/XRPLNode';

const NODE_TYPES: NodeTypes = {
  ManualTrigger: XRPLNode,
  AccountEventTrigger: XRPLNode,
  AccountSet: XRPLNode,
  AccountDelete: XRPLNode,
  SetRegularKey: XRPLNode,
  SignerListSet: XRPLNode,
  DepositPreauth: XRPLNode,
  TicketCreate: XRPLNode,
  Payment: XRPLNode,
  EscrowCreate: XRPLNode,
  EscrowFinish: XRPLNode,
  EscrowCancel: XRPLNode,
  PaymentChannelCreate: XRPLNode,
  PaymentChannelFund: XRPLNode,
  PaymentChannelClaim: XRPLNode,
  TrustSet: XRPLNode,
  OfferCreate: XRPLNode,
  OfferCancel: XRPLNode,
  Clawback: XRPLNode,
  AMMCreate: XRPLNode,
  AMMDeposit: XRPLNode,
  AMMWithdraw: XRPLNode,
  AMMVote: XRPLNode,
  AMMBid: XRPLNode,
  AMMDelete: XRPLNode,
  AMMClawback: XRPLNode,
  MPTokenIssuanceCreate: XRPLNode,
  MPTokenIssuanceDestroy: XRPLNode,
  MPTokenIssuanceSet: XRPLNode,
  MPTokenAuthorize: XRPLNode,
  CredentialCreate: XRPLNode,
  CredentialAccept: XRPLNode,
  CredentialDelete: XRPLNode,
  PermissionedDomainSet: XRPLNode,
  PermissionedDomainDelete: XRPLNode,
  DIDSet: XRPLNode,
  DIDDelete: XRPLNode,
  OracleSet: XRPLNode,
  OracleDelete: XRPLNode,
  NFTokenMint: XRPLNode,
  NFTokenBurn: XRPLNode,
  NFTokenCreateOffer: XRPLNode,
  NFTokenCancelOffer: XRPLNode,
  NFTokenAcceptOffer: XRPLNode,
  NFTokenModify: XRPLNode,
  CheckCreate: XRPLNode,
  CheckCash: XRPLNode,
  CheckCancel: XRPLNode,
  VaultCreate: XRPLNode,
  VaultUpdate: XRPLNode,
  VaultDeposit: XRPLNode,
  VaultWithdraw: XRPLNode,
  VaultDelete: XRPLNode,
  VaultClawback: XRPLNode,
  LoanBrokerSet: XRPLNode,
  LoanBrokerDelete: XRPLNode,
  LoanBrokerDeposit: XRPLNode,
  LoanBrokerWithdraw: XRPLNode,
  LoanBrokerClawback: XRPLNode,
  LoanSet: XRPLNode,
  LoanPay: XRPLNode,
  LoanManage: XRPLNode,
  LoanDelete: XRPLNode,
  BatchContainer: XRPLNode,
  ConditionBranch: XRPLNode,
  ParallelSplit: XRPLNode,
  SyncJoin: XRPLNode,
  Loop: XRPLNode,
  Delay: XRPLNode,
  LogOutput: XRPLNode,
};

let nodeIdCounter = Date.now();
const newNodeId = () => `node_${nodeIdCounter++}`;

function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [showLog, setShowLog] = useState(false);
  const [rightTab, setRightTab] = useState<'config' | 'wallets'>('wallets');

  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    setSelectedNodeId, selectedNodeId, loadWorkflow, loadInitialWorkflows, savedWorkflows,
  } = useWorkflowStore();

  // Initialize example workflows on first load
  useEffect(() => {
    const workflows = initializeExamplesIfNeeded();
    if (Object.keys(workflows).length > 0) {
      loadInitialWorkflows(workflows);
      // Load first example if canvas is empty
      if (nodes.length === 0) {
        const first = Object.keys(workflows)[0];
        if (first) loadWorkflow(first);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a node is selected, switch right panel to config
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
    const nodeType = e.dataTransfer.getData('application/reactflow/type');
    const nodeLabel = e.dataTransfer.getData('application/reactflow/label');
    if (!nodeType) return;

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const def = getNodeDef(nodeType);

    const newNode = {
      id: newNodeId(),
      type: nodeType,
      position,
      data: {
        label: nodeLabel || def?.label || nodeType,
        config: {},
      },
    };

    onNodesChange([{ type: 'add', item: newNode }]);
  }, [screenToFlowPosition, onNodesChange]);

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
          className="flex-1 relative"
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
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            defaultEdgeOptions={{ style: { stroke: 'hsl(210 100% 50% / 0.5)', strokeWidth: 1.5 } }}
            connectionLineStyle={{ stroke: '#0085ff', strokeWidth: 1.5 }}
            deleteKeyCode="Delete"
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
                const def = getNodeDef(node.type as string);
                return def?.color || '#6b7280';
              }}
              maskColor="rgba(10,11,13,0.7)"
            />
          </ReactFlow>

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-[13px] text-slate-600 font-medium">Drop nodes from the palette</p>
                <p className="text-[11px] text-slate-700 mt-1">or load an example workflow from the header</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Config / Wallet panel */}
        <div className="w-[280px] flex-shrink-0 flex flex-col border-l border-[#1e2130] bg-[#0e1018]">
          {/* Tab switcher */}
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

      {/* Bottom: Execution Log */}
      {showLog && (
        <div className="h-[220px] flex-shrink-0">
          <ExecutionLog onClose={() => setShowLog(false)} />
        </div>
      )}
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

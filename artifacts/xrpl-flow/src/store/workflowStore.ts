import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  Node,
  Edge,
  Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import * as XRPL from 'xrpl';

export type NetworkType    = 'mainnet' | 'testnet' | 'devnet';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type NodeStatus     = 'idle' | 'running' | 'success' | 'failed';

export interface WalletInfo {
  id: string;
  name: string;
  address: string;
  publicKey: string;
  seed?: string;
  balance?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  nodeId: string;
  nodeLabel: string;
  message: string;
  txHash?: string;
  status: 'running' | 'success' | 'failed' | 'info';
}

export interface SavedWorkflow {
  name: string;
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 30;

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  undoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  selectedNodeId: string | null;
  nodeStatus: Record<string, { status: NodeStatus; error?: string }>;
  executionLog: LogEntry[];
  wallets: WalletInfo[];
  activeWalletId: string | null;
  network: NetworkType;
  xrplClient: XRPL.Client | null;
  connectionStatus: ConnectionStatus;
  savedWorkflows: Record<string, SavedWorkflow>;
  currentWorkflowName: string;

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Direct setters (for drop/undo)
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;

  // Selection
  setSelectedNodeId: (id: string | null) => void;
  updateNodeData: (id: string, data: any) => void;

  // Status / log
  setNodeStatus: (id: string, status: NodeStatus, error?: string) => void;
  resetNodeStatuses: () => void;
  addLogEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLog: () => void;

  // Undo
  pushToUndoStack: () => void;
  undo: () => void;

  // Network / XRPL
  setNetwork: (network: NetworkType) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setClient: (client: XRPL.Client | null) => void;

  // Wallets
  addWallet: (wallet: WalletInfo) => void;
  setActiveWallet: (id: string | null) => void;
  updateWalletBalance: (id: string, balance: string) => void;
  removeWallet: (id: string) => void;

  // Workflows
  setCurrentWorkflowName: (name: string) => void;
  saveWorkflow: () => void;
  loadWorkflow: (name: string) => void;
  loadInitialWorkflows: (workflows: Record<string, SavedWorkflow>) => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  immer((set, get) => ({
    nodes: [],
    edges: [],
    undoStack: [],
    selectedNodeId: null,
    nodeStatus: {},
    executionLog: [],
    wallets: [],
    activeWalletId: null,
    network: (localStorage.getItem('xrplFlow_network') as NetworkType) || 'testnet',
    xrplClient: null,
    connectionStatus: 'disconnected',
    savedWorkflows: {},
    currentWorkflowName: 'Untitled Workflow',

    onNodesChange: (changes) => {
      set((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes);
      });
    },
    onEdgesChange: (changes) => {
      set((state) => {
        state.edges = applyEdgeChanges(changes, state.edges);
      });
    },
    onConnect: (connection) => {
      get().pushToUndoStack();
      set((state) => {
        state.edges = addEdge(connection, state.edges);
      });
    },

    setNodes: (nodes) => {
      set((state) => { state.nodes = nodes; });
    },
    setEdges: (edges) => {
      set((state) => { state.edges = edges; });
    },

    setSelectedNodeId: (id) => {
      set((state) => { state.selectedNodeId = id; });
    },
    updateNodeData: (id, data) => {
      set((state) => {
        const node = state.nodes.find(n => n.id === id);
        if (node) node.data = { ...node.data, ...data };
      });
    },

    setNodeStatus: (id, status, error) => {
      set((state) => { state.nodeStatus[id] = { status, error }; });
    },
    resetNodeStatuses: () => {
      set((state) => { state.nodeStatus = {}; });
    },
    addLogEntry: (entry) => {
      set((state) => {
        state.executionLog.push({
          ...entry,
          id: Math.random().toString(36).substring(2, 11),
          timestamp: Date.now(),
        });
      });
    },
    clearLog: () => {
      set((state) => { state.executionLog = []; });
    },

    pushToUndoStack: () => {
      set((state) => {
        const snapshot = { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) };
        state.undoStack = [...state.undoStack.slice(-(MAX_HISTORY - 1)), snapshot];
      });
    },
    undo: () => {
      set((state) => {
        if (state.undoStack.length === 0) return;
        const prev = state.undoStack[state.undoStack.length - 1];
        state.nodes = prev.nodes;
        state.edges = prev.edges;
        state.undoStack = state.undoStack.slice(0, -1);
        state.selectedNodeId = null;
      });
    },

    setNetwork: (network) => {
      set((state) => { state.network = network; });
      localStorage.setItem('xrplFlow_network', network);
    },
    setConnectionStatus: (status) => {
      set((state) => { state.connectionStatus = status; });
    },
    setClient: (client) => {
      set((state) => { state.xrplClient = client as any; });
    },

    addWallet: (wallet) => {
      set((state) => {
        state.wallets.push(wallet);
        if (!state.activeWalletId) state.activeWalletId = wallet.id;
      });
    },
    setActiveWallet: (id) => {
      set((state) => { state.activeWalletId = id; });
    },
    updateWalletBalance: (id, balance) => {
      set((state) => {
        const w = state.wallets.find(w => w.id === id);
        if (w) w.balance = balance;
      });
    },
    removeWallet: (id) => {
      set((state) => {
        state.wallets = state.wallets.filter(w => w.id !== id);
        if (state.activeWalletId === id) {
          state.activeWalletId = state.wallets[0]?.id || null;
        }
      });
    },

    setCurrentWorkflowName: (name) => {
      set((state) => { state.currentWorkflowName = name; });
    },
    saveWorkflow: () => {
      set((state) => {
        const name = state.currentWorkflowName;
        state.savedWorkflows[name] = { name, nodes: state.nodes, edges: state.edges };
        try {
          localStorage.setItem('xrplFlow_workflows', JSON.stringify(state.savedWorkflows));
        } catch { /* ignore */ }
      });
    },
    loadWorkflow: (name) => {
      set((state) => {
        const wf = state.savedWorkflows[name];
        if (wf) {
          state.nodes = wf.nodes;
          state.edges = wf.edges;
          state.currentWorkflowName = name;
          state.selectedNodeId = null;
          state.undoStack = [];
        }
      });
    },
    loadInitialWorkflows: (workflows) => {
      set((state) => { state.savedWorkflows = workflows; });
      try { localStorage.setItem('xrplFlow_workflows', JSON.stringify(workflows)); } catch { /* ignore */ }
    },
  }))
);

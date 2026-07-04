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
import {
  WORKFLOW_STORAGE_KEY,
  WORKFLOW_VERSION,
  type TransactionReviewRequest,
  type WorkflowDocumentV2,
} from '@/lib/workflowTypes';
import type { NetworkType } from '@/lib/xrplClient';

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

export type SavedWorkflow = WorkflowDocumentV2;

const MAX_HISTORY = 30;

// Immer exposes proxied draft values inside store producers. Browser
// structuredClone intentionally rejects proxies, while workflow graphs are
// JSON documents by contract, so serialize them into detached plain data.
function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  undoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  redoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
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
  currentWorkflowId: string;
  currentWorkflowCreatedAt: number;
  dirty: boolean;
  reviewRequest: TransactionReviewRequest | null;

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
  redo: () => void;

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
  deleteWorkflow: (name: string) => void;
  deleteWorkflows: (names: string[]) => void;
  duplicateWorkflow: (name: string) => void;
  createWorkflow: (name: string, nodes: Node[], edges: Edge[]) => void;
  requestTransactionReview: (request: TransactionReviewRequest) => Promise<boolean>;
  resolveTransactionReview: (approved: boolean) => void;
}

let reviewResolver: ((approved: boolean) => void) | null = null;
let reviewQueue: Promise<void> = Promise.resolve();

export const useWorkflowStore = create<WorkflowState>()(
  immer((set, get) => ({
    nodes: [],
    edges: [],
    undoStack: [],
    redoStack: [],
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
    currentWorkflowId: crypto.randomUUID(),
    currentWorkflowCreatedAt: Date.now(),
    dirty: false,
    reviewRequest: null,

    onNodesChange: (changes) => {
      if (changes.some(change => change.type === 'remove' || (change.type === 'position' && !change.dragging) || change.type === 'dimensions')) get().pushToUndoStack();
      set((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes);
        state.dirty = true;
      });
    },
    onEdgesChange: (changes) => {
      if (changes.some(change => change.type === 'remove' || change.type === 'add' || change.type === 'replace')) get().pushToUndoStack();
      set((state) => {
        state.edges = applyEdgeChanges(changes, state.edges);
        state.dirty = true;
      });
    },
    onConnect: (connection) => {
      get().pushToUndoStack();
      set((state) => {
        state.edges = addEdge(connection, state.edges);
        state.dirty = true;
      });
    },

    setNodes: (nodes) => {
      set((state) => { state.nodes = nodes; state.dirty = true; });
    },
    setEdges: (edges) => {
      set((state) => { state.edges = edges; state.dirty = true; });
    },

    setSelectedNodeId: (id) => {
      set((state) => { state.selectedNodeId = id; });
    },
    updateNodeData: (id, data) => {
      get().pushToUndoStack();
      set((state) => {
        const node = state.nodes.find(n => n.id === id);
        if (node) node.data = { ...node.data, ...data };
        state.dirty = true;
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
        const snapshot = { nodes: clonePlain(state.nodes), edges: clonePlain(state.edges) };
        state.undoStack = [...state.undoStack.slice(-(MAX_HISTORY - 1)), snapshot];
        state.redoStack = [];
      });
    },
    undo: () => {
      set((state) => {
        if (state.undoStack.length === 0) return;
        const prev = state.undoStack[state.undoStack.length - 1];
        state.redoStack = [...state.redoStack.slice(-(MAX_HISTORY - 1)), { nodes: clonePlain(state.nodes), edges: clonePlain(state.edges) }];
        state.nodes = prev.nodes;
        state.edges = prev.edges;
        state.undoStack = state.undoStack.slice(0, -1);
        state.selectedNodeId = null;
        state.dirty = true;
      });
    },
    redo: () => {
      set((state) => {
        if (state.redoStack.length === 0) return;
        const next = state.redoStack[state.redoStack.length - 1];
        state.undoStack = [...state.undoStack.slice(-(MAX_HISTORY - 1)), { nodes: clonePlain(state.nodes), edges: clonePlain(state.edges) }];
        state.nodes = next.nodes;
        state.edges = next.edges;
        state.redoStack = state.redoStack.slice(0, -1);
        state.selectedNodeId = null;
        state.dirty = true;
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
      set((state) => { state.currentWorkflowName = name; state.dirty = true; });
    },
    saveWorkflow: () => {
      set((state) => {
        const now = Date.now();
        let name = state.currentWorkflowName;
        const previousEntry = Object.entries(state.savedWorkflows).find(([, document]) => document.id === state.currentWorkflowId);
        const previous = previousEntry?.[1] || state.savedWorkflows[name];
        const forkingTemplate = state.currentWorkflowId.startsWith('example-');
        // Curated fixtures are immutable. The first edit automatically forks a
        // personal copy so the library template always remains pristine.
        if (forkingTemplate) {
          const baseName = `${name} Copy`;
          name = baseName;
          let suffix = 2;
          while (state.savedWorkflows[name]) name = `${baseName} ${suffix++}`;
          state.currentWorkflowName = name;
          state.currentWorkflowId = crypto.randomUUID();
          state.currentWorkflowCreatedAt = now;
        } else if (previousEntry && previousEntry[0] !== name) {
          delete state.savedWorkflows[previousEntry[0]];
        }
        state.savedWorkflows[name] = {
          version: WORKFLOW_VERSION,
          id: state.currentWorkflowId,
          name,
          createdAt: forkingTemplate ? now : previous?.createdAt || state.currentWorkflowCreatedAt,
          updatedAt: now,
          nodes: clonePlain(state.nodes) as any,
          edges: clonePlain(state.edges),
        };
        state.dirty = false;
        try {
          localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(state.savedWorkflows));
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
          state.currentWorkflowId = wf.id;
          state.currentWorkflowCreatedAt = wf.createdAt;
          state.selectedNodeId = null;
          state.undoStack = [];
          state.redoStack = [];
          state.dirty = false;
        }
      });
    },
    loadInitialWorkflows: (workflows) => {
      set((state) => { state.savedWorkflows = workflows; });
      try { localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflows)); } catch { /* ignore */ }
    },
    deleteWorkflow: (name) => {
      set((state) => {
        delete state.savedWorkflows[name];
        if (state.currentWorkflowName === name) {
          state.currentWorkflowName = 'Untitled Workflow';
          state.currentWorkflowId = crypto.randomUUID();
          state.currentWorkflowCreatedAt = Date.now();
          state.nodes = [];
          state.edges = [];
          state.dirty = false;
        }
        localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(state.savedWorkflows));
      });
    },
    deleteWorkflows: (names) => {
      set((state) => {
        const toDelete = new Set(names);
        for (const name of toDelete) delete state.savedWorkflows[name];
        if (toDelete.has(state.currentWorkflowName)) {
          state.currentWorkflowName = 'Untitled Workflow';
          state.currentWorkflowId = crypto.randomUUID();
          state.currentWorkflowCreatedAt = Date.now();
          state.nodes = [];
          state.edges = [];
          state.dirty = false;
        }
        localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(state.savedWorkflows));
      });
    },
    duplicateWorkflow: (name) => {
      set((state) => {
        const source = state.savedWorkflows[name];
        if (!source) return;
        let copyName = `${name} Copy`;
        let suffix = 2;
        while (state.savedWorkflows[copyName]) copyName = `${name} Copy ${suffix++}`;
        const now = Date.now();
        const copy = { ...clonePlain(source), id: crypto.randomUUID(), name: copyName, createdAt: now, updatedAt: now };
        state.savedWorkflows[copyName] = copy;
        state.nodes = clonePlain(copy.nodes);
        state.edges = clonePlain(copy.edges);
        state.currentWorkflowName = copyName;
        state.currentWorkflowId = copy.id;
        state.currentWorkflowCreatedAt = copy.createdAt;
        state.selectedNodeId = null;
        state.undoStack = [];
        state.redoStack = [];
        state.dirty = false;
        localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(state.savedWorkflows));
      });
    },
    createWorkflow: (name, nodes, edges) => {
      set((state) => {
        const baseName = name.trim() || 'AI Generated Workflow';
        state.currentWorkflowName = baseName;
        state.currentWorkflowId = crypto.randomUUID();
        state.currentWorkflowCreatedAt = Date.now();
        state.nodes = clonePlain(nodes);
        state.edges = clonePlain(edges);
        state.selectedNodeId = null;
        state.undoStack = [];
        state.redoStack = [];
        state.dirty = true;
      });
    },
    requestTransactionReview: (request) => {
      const queued = reviewQueue.then(() => new Promise<boolean>((resolve) => {
        reviewResolver = resolve;
        set(state => { state.reviewRequest = structuredClone(request); });
      }));
      reviewQueue = queued.then(() => undefined, () => undefined);
      return queued;
    },
    resolveTransactionReview: (approved) => {
      const resolve = reviewResolver;
      reviewResolver = null;
      set(state => { state.reviewRequest = null; });
      resolve?.(approved);
    },
  }))
);

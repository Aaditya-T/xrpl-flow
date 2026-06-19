import { useState, useRef } from 'react';
import { Play, Save, FolderOpen, Download, Upload, Pencil, Check, X, Wifi, WifiOff } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NETWORK_URLS } from '@/lib/xrplClient';
import * as XRPL from 'xrpl';
import { runWorkflow } from '@/lib/workflowEngine';
import { EXPLORER_URLS } from '@/lib/xrplClient';
import { cn } from '@/lib/utils';

function XRPLLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" stroke="#0085ff" strokeWidth="4" />
      <path d="M25 30 L50 65 L75 30" stroke="#0085ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M35 70 L50 50 L65 70" stroke="#0085ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
    </svg>
  );
}

export function Header({ onToggleLog }: { onToggleLog: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    currentWorkflowName, setCurrentWorkflowName, saveWorkflow, loadWorkflow,
    savedWorkflows, nodes, edges, loadInitialWorkflows,
    network, setNetwork, xrplClient, connectionStatus, setConnectionStatus, setClient,
    wallets, activeWalletId, setNodeStatus, addLogEntry, resetNodeStatuses,
  } = useWorkflowStore();

  const activeWallet = wallets.find(w => w.id === activeWalletId);
  const hasTrigger = nodes.some(n => n.type === 'ManualTrigger' || n.type === 'AccountEventTrigger');
  const canRun = connectionStatus === 'connected' && hasTrigger && !!activeWallet;

  const startEditName = () => {
    setNameInput(currentWorkflowName);
    setEditingName(true);
  };
  const saveName = () => {
    if (nameInput.trim()) setCurrentWorkflowName(nameInput.trim());
    setEditingName(false);
  };
  const cancelEditName = () => setEditingName(false);

  const handleSave = () => {
    saveWorkflow();
  };

  const handleExport = () => {
    const data = JSON.stringify({ name: currentWorkflowName, nodes, edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentWorkflowName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wf = JSON.parse(ev.target?.result as string);
        if (wf.nodes && wf.edges) {
          loadInitialWorkflows({
            ...savedWorkflows,
            [wf.name || 'Imported']: { name: wf.name || 'Imported', nodes: wf.nodes, edges: wf.edges },
          });
          loadWorkflow(wf.name || 'Imported');
        }
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const connectNetwork = async (net: typeof network) => {
    setNetwork(net);
    if (xrplClient) {
      try { await xrplClient.disconnect(); } catch { /* ignore */ }
      setClient(null);
    }
    setConnectionStatus('connecting');
    try {
      const client = new XRPL.Client(NETWORK_URLS[net]);
      await client.connect();
      setClient(client);
      setConnectionStatus('connected');
    } catch {
      setConnectionStatus('error');
    }
  };

  const handleRun = async () => {
    if (!canRun || !xrplClient || !activeWallet?.seed) {
      setRunError(!activeWallet?.seed ? 'Active wallet has no seed (import or generate a wallet)' : 'Connect to XRPL first');
      setTimeout(() => setRunError(''), 4000);
      return;
    }
    setRunning(true);
    setRunError('');
    resetNodeStatuses();
    try {
      await runWorkflow(
        nodes, edges, xrplClient, activeWallet,
        activeWallet.seed,
        {
          setNodeStatus,
          addLogEntry,
          getExplorerUrl: (hash) => `${EXPLORER_URLS[network]}${hash}`,
          network,
        },
        wallets,
      );
    } catch (e: any) {
      setRunError(e.message || 'Run failed');
      setTimeout(() => setRunError(''), 5000);
    } finally {
      setRunning(false);
    }
  };

  const statusColor = {
    disconnected: '#6b7280',
    connecting: '#f59e0b',
    connected: '#10b981',
    error: '#ef4444',
  }[connectionStatus];

  const workflowNames = Object.keys(savedWorkflows);

  return (
    <header className="flex items-center gap-2 px-3 h-11 bg-[#0e1018] border-b border-[#1e2130] flex-shrink-0" data-testid="header">
      {/* Logo */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <XRPLLogo />
        <span className="text-[13px] font-semibold text-slate-100 tracking-tight">XRPL Flow</span>
      </div>

      <div className="w-px h-5 bg-[#1e2130] mx-1 flex-shrink-0" />

      {/* Workflow name */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {editingName ? (
          <>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEditName(); }}
              data-testid="workflow-name-input"
              className="bg-[#1e2130] border border-blue-500/50 rounded text-[11px] text-slate-200 px-2 py-1 outline-none w-36"
            />
            <button type="button" onClick={saveName} className="text-emerald-400 hover:text-emerald-300"><Check size={11} /></button>
            <button type="button" onClick={cancelEditName} className="text-slate-500 hover:text-slate-300"><X size={11} /></button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEditName}
            data-testid="workflow-name"
            className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-slate-100 transition-colors"
          >
            {currentWorkflowName}
            <Pencil size={9} className="text-slate-600" />
          </button>
        )}
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        data-testid="save-workflow"
        title="Save workflow"
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 bg-[#1e2130] hover:bg-[#252b3b] border border-[#2e3448] rounded transition-colors"
      >
        <Save size={10} />Save
      </button>

      {/* Load */}
      {workflowNames.length > 0 && (
        <select
          onChange={e => { if (e.target.value) loadWorkflow(e.target.value); }}
          value=""
          data-testid="load-workflow"
          className="bg-[#1e2130] border border-[#2e3448] rounded text-[10px] text-slate-400 px-2 py-1 outline-none cursor-pointer hover:bg-[#252b3b] transition-colors"
        >
          <option value="" disabled>Load workflow...</option>
          {workflowNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      )}

      {/* Export */}
      <button
        type="button"
        onClick={handleExport}
        data-testid="export-workflow"
        title="Export JSON"
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 bg-[#1e2130] hover:bg-[#252b3b] border border-[#2e3448] rounded transition-colors"
      >
        <Download size={10} />
      </button>

      {/* Import */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        data-testid="import-workflow"
        title="Import JSON"
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 bg-[#1e2130] hover:bg-[#252b3b] border border-[#2e3448] rounded transition-colors"
      >
        <Upload size={10} />
      </button>
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Run error */}
      {runError && (
        <span className="text-[10px] text-red-400 font-mono truncate max-w-[200px]">{runError}</span>
      )}

      {/* Log toggle */}
      <button
        type="button"
        onClick={onToggleLog}
        data-testid="toggle-log"
        className="px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 bg-[#1e2130] hover:bg-[#252b3b] border border-[#2e3448] rounded transition-colors font-mono"
      >
        Log
      </button>

      {/* Network selector */}
      <select
        value={network}
        onChange={e => connectNetwork(e.target.value as typeof network)}
        data-testid="network-selector"
        className="bg-[#1e2130] border border-[#2e3448] rounded text-[10px] text-slate-400 px-2 py-1 outline-none cursor-pointer hover:bg-[#252b3b] transition-colors"
      >
        <option value="mainnet">Mainnet</option>
        <option value="testnet">Testnet</option>
        <option value="devnet">Devnet</option>
      </select>

      {/* Connection status */}
      <div
        className="flex items-center gap-1 px-2 py-1 bg-[#1e2130] border border-[#2e3448] rounded cursor-pointer"
        data-testid="connection-status"
        title={`${connectionStatus} — ${NETWORK_URLS[network]}`}
      >
        {connectionStatus === 'connected'
          ? <Wifi size={11} style={{ color: statusColor }} />
          : <WifiOff size={11} style={{ color: statusColor }} />
        }
        <span className="text-[10px] font-mono capitalize" style={{ color: statusColor }}>
          {connectionStatus === 'connected' ? network : connectionStatus}
        </span>
      </div>

      {/* Run button */}
      <button
        type="button"
        onClick={handleRun}
        disabled={!canRun || running}
        data-testid="run-workflow"
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-colors',
          canRun && !running
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
            : 'bg-[#1e2130] text-slate-600 cursor-not-allowed',
        )}
      >
        <Play size={11} fill="currentColor" />
        {running ? 'Running...' : 'Run'}
      </button>
    </header>
  );
}

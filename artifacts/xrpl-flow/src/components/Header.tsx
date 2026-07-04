import { useEffect, useState, useRef } from 'react';
import { Play, Square, Save, Download, Upload, Pencil, Check, X, Wifi, WifiOff, Copy, Trash2, LayoutTemplate, Sparkles, LogIn, UserRound } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import {
  EXPLORER_URLS,
  PUBLIC_ENDPOINTS,
  getNetworkProfile,
  isPlainPublicEndpointUrl,
  saveNetworkProfile,
  type NetworkProfile,
  type NetworkType,
} from '@/lib/xrplClient';
import { runWorkflow, validateWorkflowGraph } from '@/lib/workflowEngine';
import { cn } from '@/lib/utils';
import { getNodeDef } from '@/lib/nodeRegistry';
import { getTransactionAdapter } from '@/lib/transactionAdapters';
import { WORKFLOW_VERSION, type WorkflowDocumentV2 } from '@/lib/workflowTypes';
import { connectXRPL } from '@/lib/networkConnection';
import { beginXamanSignIn, captureMarketplaceSessionFromUrl, getMarketplaceUser, setMarketplaceSession, type MarketplaceUser } from '@/lib/marketplaceClient';
import { WorkflowLibrary } from './WorkflowLibrary';
import { AIWorkflowAssistant } from './AIWorkflowAssistant';

function XRPLLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" stroke="#0085ff" strokeWidth="4" />
      <path d="M25 30 L50 65 L75 30" stroke="#0085ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M35 70 L50 50 L65 70" stroke="#0085ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
    </svg>
  );
}

function AdvancedNetworkSettings({ network, onSaved }: { network: NetworkType; onSaved: () => void }) {
  const [profile, setProfile] = useState<NetworkProfile>(() => getNetworkProfile(network));
  const [error, setError] = useState('');

  useEffect(() => {
    setProfile(getNetworkProfile(network));
    setError('');
  }, [network]);

  const publicEndpoints = PUBLIC_ENDPOINTS.filter(endpoint => endpoint.network === network);
  const rippledEndpoints = publicEndpoints.filter(endpoint => endpoint.kind !== 'clio');
  const clioEndpoints = publicEndpoints.filter(endpoint => endpoint.kind === 'clio');

  const update = (patch: Partial<NetworkProfile>) => setProfile(prev => ({ ...prev, ...patch }));
  const save = () => {
    setError('');
    try {
      saveNetworkProfile(profile);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save endpoint settings.');
    }
  };

  const inputClass = 'w-full rounded border border-[#2e3448] bg-[#080b12] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-500/60';

  return (
    <div className="absolute right-3 top-12 z-[80] w-[420px] rounded-lg border border-[#2e3448] bg-[#0b0e15] p-3 shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-slate-100">Network routing</p>
          <p className="text-[9px] leading-relaxed text-slate-500">Automatic routing uses live rippled for submissions/subscriptions and Clio/full-history endpoints for validated query blocks.</p>
        </div>
        <button type="button" onClick={onSaved} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200"><X size={13} /></button>
      </div>

      {network !== 'custom' ? (
        <div className="space-y-2">
          <label className="block text-[9px] uppercase tracking-wider text-slate-500">Primary live / submit node</label>
          <select value={profile.primaryUrl} onChange={event => update({ primaryUrl: event.target.value })} className={inputClass}>
            {[...rippledEndpoints, ...clioEndpoints].map(endpoint => <option key={endpoint.id} value={endpoint.url}>{endpoint.label}</option>)}
          </select>
          <label className="block text-[9px] uppercase tracking-wider text-slate-500">Fallback node</label>
          <select value={profile.fallbackUrls[0] || ''} onChange={event => update({ fallbackUrls: event.target.value ? [event.target.value] : [] })} className={inputClass}>
            <option value="">Automatic defaults</option>
            {publicEndpoints.filter(endpoint => endpoint.url !== profile.primaryUrl).map(endpoint => <option key={endpoint.id} value={endpoint.url}>{endpoint.label}</option>)}
          </select>
          <label className="block text-[9px] uppercase tracking-wider text-slate-500">Historical / Clio query node</label>
          <select value={profile.clioUrls[0] || ''} onChange={event => update({ clioUrls: event.target.value ? [event.target.value] : [] })} className={inputClass}>
            <option value="">Automatic if available</option>
            {clioEndpoints.map(endpoint => <option key={endpoint.id} value={endpoint.url}>{endpoint.label}</option>)}
          </select>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-[9px] uppercase tracking-wider text-slate-500">Custom primary URL</label>
          <input value={profile.primaryUrl} onChange={event => update({ primaryUrl: event.target.value })} placeholder="wss://your-rippled.example.com/" className={inputClass} />
          <label className="block text-[9px] uppercase tracking-wider text-slate-500">Custom fallback URL</label>
          <input value={profile.fallbackUrls[0] || ''} onChange={event => update({ fallbackUrls: event.target.value ? [event.target.value] : [] })} placeholder="wss://fallback.example.com/" className={inputClass} />
          <label className="block text-[9px] uppercase tracking-wider text-slate-500">Custom Clio URL for history queries</label>
          <input value={profile.clioUrls[0] || ''} onChange={event => update({ clioUrls: event.target.value ? [event.target.value] : [] })} placeholder="wss://your-clio.example.com/" className={inputClass} />
        </div>
      )}

      <div className="mt-3 rounded border border-blue-900/40 bg-blue-950/20 p-2 text-[9px] leading-relaxed text-blue-200/80">
        Public servers can rate-limit or become unavailable. For heavier workflows, use your own rippled/Clio node or a managed provider.
      </div>
      {error && <p className="mt-2 text-[9px] text-red-400">{error}</p>}
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-[9px] ${isPlainPublicEndpointUrl(profile.primaryUrl) ? 'text-emerald-400' : 'text-amber-400'}`}>{isPlainPublicEndpointUrl(profile.primaryUrl) ? 'Primary URL looks valid' : 'Primary plain URL required'}</span>
        <button type="button" onClick={save} className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-blue-500">Save routing</button>
      </div>
    </div>
  );
}

export function Header({ onToggleLog }: { onToggleLog: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [importError, setImportError] = useState('');
  const [showWorkflowLibrary, setShowWorkflowLibrary] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showNetworkSettings, setShowNetworkSettings] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ nodeLabel: string; fieldLabel: string }[]>([]);
  const [marketplaceUser, setMarketplaceUser] = useState<MarketplaceUser | null>(null);
  const [marketplaceAuthError, setMarketplaceAuthError] = useState('');
  const [marketplaceAuthBusy, setMarketplaceAuthBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    currentWorkflowName, currentWorkflowId, currentWorkflowCreatedAt, setCurrentWorkflowName, saveWorkflow, loadWorkflow,
    savedWorkflows, nodes, edges, loadInitialWorkflows, deleteWorkflow, duplicateWorkflow, dirty,
    network, setNetwork, xrplClient, connectionStatus, setConnectionStatus, setClient,
    wallets, activeWalletId, setNodeStatus, addLogEntry, resetNodeStatuses,
    requestTransactionReview,
  } = useWorkflowStore();

  const activeWallet = wallets.find(w => w.id === activeWalletId);
  const hasTrigger = nodes.some(n => n.type === 'ManualTrigger' || n.type === 'AccountEventTrigger');
  const hasTransactionNodes = nodes.some(node => Boolean(getTransactionAdapter(node.type as string)));
  const canRun = connectionStatus === 'connected' && hasTrigger && (!hasTransactionNodes || !!activeWallet);

  useEffect(() => {
    captureMarketplaceSessionFromUrl();
    getMarketplaceUser()
      .then(user => setMarketplaceUser(user))
      .catch(() => setMarketplaceUser(null));
  }, []);

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

  const connectXaman = async () => {
    setMarketplaceAuthBusy(true);
    setMarketplaceAuthError('');
    try {
      await beginXamanSignIn();
    } catch (error) {
      setMarketplaceAuthError(error instanceof Error ? error.message : 'Could not start Xaman sign-in.');
    } finally {
      setMarketplaceAuthBusy(false);
    }
  };

  const disconnectXaman = () => {
    setMarketplaceSession('');
    setMarketplaceUser(null);
    setMarketplaceAuthError('');
  };

  const handleExport = () => {
    const saved = savedWorkflows[currentWorkflowName];
    const now = Date.now();
    const workflowDocument: WorkflowDocumentV2 = {
      version: WORKFLOW_VERSION,
      id: saved?.id || currentWorkflowId,
      name: currentWorkflowName,
      createdAt: saved?.createdAt || currentWorkflowCreatedAt,
      updatedAt: now,
      nodes: nodes as WorkflowDocumentV2['nodes'],
      edges,
    };
    const data = JSON.stringify(workflowDocument, null, 2);
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
    setImportError('');
    if (file.size > 2_000_000) {
      setImportError('Import rejected: workflow files are limited to 2 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wf = JSON.parse(ev.target?.result as string) as Partial<WorkflowDocumentV2>;
        if (wf.version !== WORKFLOW_VERSION) throw new Error('v1 workflows are incompatible with XRPL Flow v2 and cannot be imported.');
        if (!wf.id || !wf.name || !Number.isFinite(wf.createdAt) || !Number.isFinite(wf.updatedAt) || !Array.isArray(wf.nodes) || !Array.isArray(wf.edges)) {
          throw new Error('Malformed v2 workflow document.');
        }
        if (wf.nodes.length > 500 || wf.edges.length > 1_000) throw new Error('Workflow exceeds the 500-node / 1,000-edge safety limit.');
        const unknown = wf.nodes.find(node => !node.type || !getNodeDef(node.type));
        if (unknown) throw new Error(`Unsupported node type: ${String(unknown.type)}`);
        const graphErrors = validateWorkflowGraph(wf.nodes, wf.edges);
        if (graphErrors.length) throw new Error(`Invalid workflow: ${graphErrors[0].nodeLabel} — ${graphErrors[0].fieldLabel}`);
        loadInitialWorkflows({ ...savedWorkflows, [wf.name]: wf as WorkflowDocumentV2 });
        loadWorkflow(wf.name);
        setShowWorkflowLibrary(false);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Could not import this workflow.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const connectNetwork = async (net: typeof network) => {
    setNetwork(net);
    try {
      await connectXRPL(net, xrplClient, { setClient, setStatus: setConnectionStatus });
    } catch {
      // The shared service publishes the failure state.
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRun = async () => {
    if (!canRun || !xrplClient || (hasTransactionNodes && !activeWallet?.seed)) {
      setRunError(hasTransactionNodes && !activeWallet?.seed ? 'Active wallet has no seed (import or generate a wallet)' : 'Connect to XRPL first');
      setTimeout(() => setRunError(''), 4000);
      return;
    }

    // Pre-run field validation
    const errors = validateWorkflowGraph(nodes, edges);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);

    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setRunError('');
    resetNodeStatuses();
    const runtimeWallet = activeWallet || {
      id: 'readonly',
      name: 'Read-only',
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      publicKey: '',
    };
    try {
      await runWorkflow(
        nodes, edges, xrplClient, runtimeWallet,
        activeWallet?.seed || '',
        {
          setNodeStatus,
          addLogEntry,
          getExplorerUrl: (hash) => `${EXPLORER_URLS[network]}${hash}`,
          network,
          reviewTransaction: async (transaction, simulation, signerAddresses, nodeId, nodeLabel) => requestTransactionReview({
            id: crypto.randomUUID(), nodeId, nodeLabel, network, transaction, simulation,
            signerAddresses,
            warnings: [
              transaction.TransactionType === 'Payment' ? 'Verify the destination and amount before continuing.' : 'This transaction changes Mainnet ledger state.',
              Number(transaction.Fee || 0) > 1000 ? `High fee: ${String(transaction.Fee)} drops` : '',
              typeof transaction.Amount === 'string' && Number(transaction.Amount) >= 100_000_000 ? `Large XRP amount: ${(Number(transaction.Amount) / 1_000_000).toLocaleString()} XRP` : '',
            ].filter(Boolean),
          }),
        },
        wallets,
        controller.signal,
      );
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        addLogEntry({ nodeId: '', nodeLabel: 'Workflow', message: '⏹ Stopped by user', status: 'failed' });
      } else {
        setRunError(e.message || 'Run failed');
        setTimeout(() => setRunError(''), 5000);
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  const statusColor = {
    disconnected: '#6b7280',
    connecting: '#f59e0b',
    connected: '#10b981',
    error: '#ef4444',
  }[connectionStatus];
  const activeProfile = getNetworkProfile(network);
  const xamanLabel = marketplaceUser?.address
    ? `${marketplaceUser.address.slice(0, 6)}…${marketplaceUser.address.slice(-4)}`
    : 'Sign in';

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
        <Save size={10} />{dirty ? 'Save*' : 'Saved'}
      </button>

      {savedWorkflows[currentWorkflowName] && <>
        <button type="button" title="Duplicate workflow" aria-label="Duplicate workflow" onClick={() => duplicateWorkflow(currentWorkflowName)} className="p-1.5 text-slate-400 hover:text-slate-100"><Copy size={11} /></button>
        <button type="button" title="Delete workflow" aria-label="Delete workflow" onClick={() => { if (confirm(`Delete “${currentWorkflowName}”?`)) deleteWorkflow(currentWorkflowName); }} className="p-1.5 text-slate-400 hover:text-red-400"><Trash2 size={11} /></button>
      </>}

      <button type="button" onClick={() => setShowWorkflowLibrary(true)} data-testid="open-workflow-library" className="flex items-center gap-1.5 rounded border border-[#2e3448] bg-[#1e2130] px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-blue-500/40 hover:bg-[#252b3b] hover:text-white"><LayoutTemplate size={11} className="text-blue-400" />Workflows</button>
      <button type="button" onClick={() => setShowAIAssistant(true)} data-testid="open-ai-assistant" className="flex items-center gap-1.5 rounded border border-violet-700/40 bg-violet-950/25 px-2 py-1 text-[10px] text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-900/30 hover:text-violet-200"><Sparkles size={11} />Ask AI</button>

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

      <WorkflowLibrary
        open={showWorkflowLibrary}
        onClose={() => setShowWorkflowLibrary(false)}
        onImport={() => fileInputRef.current?.click()}
        marketplaceUser={marketplaceUser}
        marketplaceAuthError={marketplaceAuthError}
        onRequestXamanSignIn={connectXaman}
        onSignOutXaman={disconnectXaman}
      />
      <AIWorkflowAssistant open={showAIAssistant} onClose={() => setShowAIAssistant(false)} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="flex items-start gap-1.5 bg-amber-900/30 border border-amber-700/50 rounded px-2.5 py-1.5 max-w-[340px]">
          <span className="text-amber-400 text-[10px] flex-shrink-0 mt-px">⚠</span>
          <div className="min-w-0">
            <p className="text-[10px] text-amber-300 font-medium leading-tight mb-0.5">Missing required fields:</p>
            <ul className="space-y-0">
              {validationErrors.map((e, i) => (
                <li key={i} className="text-[9px] text-amber-400/80 font-mono truncate">
                  {e.nodeLabel} → {e.fieldLabel}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setValidationErrors([])}
            className="text-amber-600 hover:text-amber-400 flex-shrink-0 ml-1"
          ><X size={9} /></button>
        </div>
      )}

      {/* Run error */}
      {runError && (
        <span className="text-[10px] text-red-400 font-mono truncate max-w-[200px]">{runError}</span>
      )}
      {importError && (
        <button type="button" onClick={() => setImportError('')} title={importError} className="text-[10px] text-red-400 font-mono truncate max-w-[280px]">{importError}</button>
      )}
      {marketplaceAuthError && (
        <button type="button" onClick={() => setMarketplaceAuthError('')} title={marketplaceAuthError} className="text-[10px] text-red-400 font-mono truncate max-w-[320px]">{marketplaceAuthError}</button>
      )}

      {/* Xaman account */}
      {marketplaceUser ? (
        <button
          type="button"
          onClick={disconnectXaman}
          title={`Connected with Xaman as ${marketplaceUser.address}. Click to disconnect.`}
          className="flex items-center gap-1.5 rounded border border-violet-700/50 bg-violet-950/30 px-2 py-1 text-[10px] text-violet-200 transition-colors hover:border-violet-500/70 hover:bg-violet-900/40"
        >
          <UserRound size={11} />
          {marketplaceUser.displayName && marketplaceUser.displayName !== marketplaceUser.address ? marketplaceUser.displayName : xamanLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={connectXaman}
          disabled={marketplaceAuthBusy}
          data-testid="connect-xaman"
          className="flex items-center gap-1.5 rounded bg-violet-600 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          <LogIn size={11} />
          {marketplaceAuthBusy ? 'Signing in…' : 'Sign in'}
        </button>
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
        className={cn('rounded text-[10px] px-2 py-1 outline-none cursor-pointer transition-colors', network === 'mainnet' ? 'bg-red-950 border-2 border-red-500 text-red-200 font-bold' : 'bg-[#1e2130] border border-[#2e3448] text-slate-400 hover:bg-[#252b3b]')}
      >
        <option value="mainnet">Mainnet</option>
        <option value="testnet">Testnet</option>
        <option value="devnet">Devnet</option>
        <option value="custom">Custom</option>
      </select>
      <button type="button" onClick={() => setShowNetworkSettings(value => !value)} className="rounded border border-[#2e3448] bg-[#1e2130] px-2 py-1 text-[10px] text-slate-400 hover:bg-[#252b3b] hover:text-slate-200">Advanced</button>
      {showNetworkSettings && <AdvancedNetworkSettings network={network} onSaved={() => setShowNetworkSettings(false)} />}

      {/* Connection status */}
      <div
        className="flex items-center gap-1 px-2 py-1 bg-[#1e2130] border border-[#2e3448] rounded cursor-pointer"
        data-testid="connection-status"
        title={`${connectionStatus} — ${activeProfile.primaryUrl || 'no endpoint configured'}`}
      >
        {connectionStatus === 'connected'
          ? <Wifi size={11} style={{ color: statusColor }} />
          : <WifiOff size={11} style={{ color: statusColor }} />
        }
        <span className="text-[10px] font-mono capitalize" style={{ color: statusColor }}>
          {connectionStatus === 'connected' ? network : connectionStatus}
        </span>
      </div>

      {/* Run / Stop button */}
      {running ? (
        <button
          type="button"
          onClick={handleStop}
          data-testid="stop-workflow"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-colors bg-red-700 hover:bg-red-600 text-white cursor-pointer"
        >
          <Square size={11} fill="currentColor" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          data-testid="run-workflow"
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-colors',
            canRun
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
              : 'bg-[#1e2130] text-slate-600 cursor-not-allowed',
          )}
        >
          <Play size={11} fill="currentColor" />
          Run
        </button>
      )}
    </header>
  );
}

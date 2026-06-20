import { useState, useEffect, useCallback } from 'react';
import * as XRPL from 'xrpl';
import { Plus, Key, Droplets, Copy, Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NETWORK_URLS, EXPLORER_URLS, fundWalletWithFaucet } from '@/lib/xrplClient';
import { cn } from '@/lib/utils';
import { connectXRPL, disconnectXRPL } from '@/lib/networkConnection';

const BALANCE_POLL_MS = 30_000;

function truncate(s: string, len = 14) {
  if (s.length <= len) return s;
  return s.slice(0, 6) + '…' + s.slice(-6);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={copy} className="text-slate-500 hover:text-slate-300 transition-colors" title="Copy">
      {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
    </button>
  );
}

function WalletCard({ wallet }: { wallet: { id: string; name: string; address: string; publicKey: string; seed?: string; balance?: string } }) {
  const { activeWalletId, setActiveWallet, updateWalletBalance, removeWallet, network, xrplClient } = useWorkflowStore();
  const [expanded, setExpanded] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState('');
  const isActive = wallet.id === activeWalletId;

  const fetchBalance = useCallback(async () => {
    if (!xrplClient) return;
    try {
      const res = await xrplClient.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' });
      const bal = (Number((res.result.account_data as any).Balance) / 1_000_000).toFixed(6);
      updateWalletBalance(wallet.id, bal);
    } catch {
      updateWalletBalance(wallet.id, '—');
    }
  }, [xrplClient, wallet.id, wallet.address, updateWalletBalance]);

  useEffect(() => {
    if (!xrplClient) return;
    fetchBalance();
    const interval = setInterval(fetchBalance, BALANCE_POLL_MS);
    return () => clearInterval(interval);
  }, [xrplClient, fetchBalance]);

  const handleFund = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (network === 'mainnet' || funding) return;
    setFunding(true);
    setFundError('');
    try {
      await fundWalletWithFaucet(network, wallet.address);
      setTimeout(() => fetchBalance(), 4000);
    } catch (err: any) {
      setFundError(err.message || 'Faucet failed');
      setTimeout(() => setFundError(''), 4000);
    } finally {
      setFunding(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded border transition-colors',
        isActive ? 'border-blue-500/50 bg-blue-900/10' : 'border-[#1e2130] bg-[#0e1018]',
      )}
      data-testid={`wallet-${wallet.id}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Active dot */}
        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', isActive ? 'bg-blue-500' : 'bg-slate-600')} />

        {/* Name + address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-200 truncate">{wallet.name}</span>
            {isActive && (
              <span className="text-[8px] font-mono bg-blue-800/50 text-blue-300 border border-blue-700/40 px-1 rounded flex-shrink-0">ACTIVE</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] font-mono text-slate-500">{truncate(wallet.address)}</span>
            <CopyButton text={wallet.address} />
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {wallet.balance !== undefined && (
            <span className="text-[10px] font-mono text-slate-400">{wallet.balance} XRP</span>
          )}
          <button
            type="button"
            onClick={fetchBalance}
            title="Refresh balance"
            className="text-slate-600 hover:text-slate-300 transition-colors text-[9px]"
          >↻</button>

          {/* Fund button — inline, no expand needed */}
          {network !== 'mainnet' && (
            <button
              type="button"
              onClick={handleFund}
              disabled={funding}
              title={`Fund via ${network} faucet`}
              className={cn(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors',
                funding
                  ? 'text-emerald-500/50 border-emerald-900/30 cursor-wait'
                  : 'text-emerald-400 border-emerald-800/40 hover:bg-emerald-900/20',
              )}
            >
              <Droplets size={9} />
              {funding ? '…' : 'Fund'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded(p => !p)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* Fund error */}
      {fundError && (
        <div className="mx-2.5 mb-1.5 text-[9px] text-red-400 font-mono bg-red-900/20 border border-red-800/30 px-2 py-1 rounded">
          {fundError}
        </div>
      )}

      {expanded && (
        <div className="px-2.5 pb-2.5 border-t border-[#1e2130] pt-2 space-y-1.5">
          <div>
            <span className="text-[9px] font-mono text-slate-600">ADDRESS</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-mono text-slate-400 break-all">{wallet.address}</span>
              <CopyButton text={wallet.address} />
            </div>
          </div>
          <div>
            <span className="text-[9px] font-mono text-slate-600">PUBLIC KEY</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-mono text-slate-500 break-all">{truncate(wallet.publicKey, 20)}</span>
              <CopyButton text={wallet.publicKey} />
            </div>
          </div>
          <div className="flex gap-1.5 mt-1">
            {!isActive && (
              <button
                type="button"
                onClick={() => setActiveWallet(wallet.id)}
                data-testid={`set-active-${wallet.id}`}
                className="flex-1 py-1 text-[10px] text-blue-400 border border-blue-700/40 rounded hover:bg-blue-900/20 transition-colors"
              >
                Set as Active
              </button>
            )}
            <button
              type="button"
              onClick={() => removeWallet(wallet.id)}
              className="py-1 px-2 text-[10px] text-red-400/60 border border-red-900/30 rounded hover:bg-red-900/20 hover:text-red-400 transition-colors"
              title="Remove wallet"
            >
              <Trash2 size={9} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WalletPanel() {
  const [tab, setTab] = useState<'wallets' | 'network'>('wallets');
  const [importSeed, setImportSeed] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    wallets, addWallet, updateWalletBalance,
    network, setNetwork, xrplClient, connectionStatus,
    setConnectionStatus, setClient,
  } = useWorkflowStore();

  const generateWallet = () => {
    const w = XRPL.Wallet.generate();
    addWallet({
      id: crypto.randomUUID(),
      name: `Wallet ${wallets.length + 1}`,
      address: w.address,
      publicKey: w.publicKey,
      seed: w.seed,
    });
  };

  const importWallet = () => {
    const seed = importSeed.trim();
    if (!seed) return;
    setImportSeed('');
    setImportLoading(true);
    setError('');
    try {
      const w = XRPL.Wallet.fromSeed(seed);
      addWallet({
        id: crypto.randomUUID(),
        name: `Imported ${wallets.length + 1}`,
        address: w.address,
        publicKey: w.publicKey,
        seed,
      });
    } catch (e: any) {
      setError(e.message || 'Invalid seed');
    } finally {
      setImportLoading(false);
    }
  };

  /** Create a brand-new funded wallet when none exist */
  const createFundedWallet = async () => {
    if (network === 'mainnet') return;
    setFaucetLoading(true);
    setError('');
    try {
      const res = await fundWalletWithFaucet(network);
      const acct = res.account;
      const w = XRPL.Wallet.fromSeed(acct.secret);
      addWallet({
        id: crypto.randomUUID(),
        name: `Faucet ${wallets.length + 1}`,
        address: acct.classicAddress || w.address,
        publicKey: w.publicKey,
        seed: acct.secret,
        balance: '1000',
      });
    } catch (e: any) {
      setError(e.message || 'Faucet failed');
    } finally {
      setFaucetLoading(false);
    }
  };

  const connect = async (net: typeof network) => {
    setError('');
    try {
      await connectXRPL(net, xrplClient, { setClient, setStatus: setConnectionStatus });
    } catch (e: any) {
      setError(e.message || 'Connection failed');
    }
  };

  const disconnect = async () => {
    await disconnectXRPL(xrplClient, { setClient, setStatus: setConnectionStatus });
  };

  const handleNetworkChange = async (net: typeof network) => {
    setNetwork(net);
    if (connectionStatus === 'connected') await connect(net);
  };

  const statusColor = {
    disconnected: 'text-slate-500',
    connecting: 'text-yellow-400',
    connected: 'text-emerald-400',
    error: 'text-red-400',
  }[connectionStatus];

  const statusDot = {
    disconnected: '○',
    connecting: '◎',
    connected: '●',
    error: '✗',
  }[connectionStatus];

  return (
    <div className="flex flex-col h-full" data-testid="wallet-panel">
      {/* Sub-tabs */}
      <div className="flex border-b border-[#1e2130] flex-shrink-0">
        {(['wallets', 'network'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors',
              tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300',
            )}
            data-testid={`tab-${t}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'wallets' && (
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
          {wallets.length === 0 ? (
            <p className="text-[11px] text-slate-600 text-center py-4">No wallets yet</p>
          ) : (
            <div className="space-y-1.5">
              {wallets.map(w => <WalletCard key={w.id} wallet={w} />)}
            </div>
          )}

          {error && (
            <div className="text-[10px] text-red-400 bg-red-900/20 border border-red-800/40 px-2.5 py-1.5 rounded font-mono">
              {error}
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <div role="note" className="rounded border border-amber-800/40 bg-amber-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-amber-300">
              Secrets stay in this browser tab's memory and are cleared on refresh. Never use a seed you cannot afford to expose on this device.
            </div>
            <button
              type="button"
              onClick={generateWallet}
              data-testid="generate-wallet"
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-slate-200 bg-[#1e2130] hover:bg-[#252b3b] border border-[#2e3448] rounded transition-colors"
            >
              <Plus size={11} />Generate Wallet
            </button>

            <div className="flex gap-1.5">
              <input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={importSeed}
                onChange={e => setImportSeed(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') importWallet(); }}
                placeholder="Seed / secret..."
                data-testid="import-seed"
                className="flex-1 bg-[#0e1018] border border-[#1e2130] rounded text-[11px] text-slate-200 px-2 py-1.5 outline-none focus:border-blue-500/50 placeholder:text-slate-600 font-mono"
              />
              <button
                type="button"
                onClick={importWallet}
                disabled={importLoading}
                data-testid="import-wallet"
                className="px-2 py-1.5 text-[11px] text-slate-200 bg-[#1e2130] hover:bg-[#252b3b] border border-[#2e3448] rounded transition-colors flex items-center gap-1"
              >
                <Key size={10} />Import
              </button>
            </div>

            {network !== 'mainnet' && (
              <button
                type="button"
                onClick={createFundedWallet}
                disabled={faucetLoading}
                data-testid="fund-faucet"
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/30 border border-emerald-800/40 rounded transition-colors"
              >
                <Droplets size={11} />
                {faucetLoading ? 'Requesting...' : 'Create Funded Wallet'}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'network' && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <div>
            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Network</p>
            <div className="space-y-1">
              {(['mainnet', 'testnet', 'devnet'] as const).map(net => (
                <button
                  key={net}
                  type="button"
                  onClick={() => handleNetworkChange(net)}
                  data-testid={`network-${net}`}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-2 rounded border text-[11px] transition-colors',
                    network === net
                      ? 'border-blue-500/50 bg-blue-900/15 text-blue-300'
                      : 'border-[#1e2130] text-slate-400 hover:border-[#2e3448]'
                  )}
                >
                  <span className="font-medium capitalize">{net}</span>
                  {net === 'devnet' && (
                    <span className="text-[8px] text-lime-500 font-mono">DEVNET</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0e1018] rounded border border-[#1e2130] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className={cn('text-[11px] font-mono', statusColor)}>
                {statusDot} {connectionStatus}
              </span>
              {connectionStatus === 'connected' ? (
                <button
                  type="button"
                  onClick={disconnect}
                  data-testid="disconnect-btn"
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => connect(network)}
                  disabled={connectionStatus === 'connecting'}
                  data-testid="connect-btn"
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
            <p className="text-[9px] text-slate-600 font-mono mt-1">{NETWORK_URLS[network]}</p>
          </div>

          {error && (
            <div className="text-[10px] text-red-400 bg-red-900/20 border border-red-800/40 px-2.5 py-1.5 rounded font-mono">
              {error}
            </div>
          )}

          <div className="text-[9px] text-slate-600 font-mono">
            Explorer: <a href={EXPLORER_URLS[network]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{EXPLORER_URLS[network]}</a>
          </div>
        </div>
      )}
    </div>
  );
}

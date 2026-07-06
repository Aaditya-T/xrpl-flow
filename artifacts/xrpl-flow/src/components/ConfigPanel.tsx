import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { getNodeDef, FieldDef } from '@/lib/nodeRegistry';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import { buildValidatedTransaction, getTransactionAdapter } from '@/lib/transactionAdapters';
import { navigateToDocs } from '@/lib/docsRoute';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const STRUCTURED_FIELD_NAMES = new Set([
  'AcceptedCredentials', 'AuthAccounts', 'AuthorizeCredentials', 'CredentialIDs',
  'Memos', 'NFTokenOffers', 'Paths', 'Permissions', 'PriceDataSeries',
  'RequestJson', 'SignerEntries', 'UnauthorizeCredentials',
]);

function StructuredJsonInput({ field, value, onChange, className }: { field: FieldDef; value: unknown; onChange: (value: string) => void; className: string }) {
  const text = typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : '';
  let error = '';
  if (text.trim()) {
    try { JSON.parse(text); } catch (reason) { error = reason instanceof Error ? reason.message : 'Invalid JSON'; }
  }
  return <div className="space-y-1">
    <textarea value={text} onChange={event => onChange(event.target.value)} placeholder={field.description || ''} data-testid={`field-${field.name}`} rows={5} aria-invalid={Boolean(error)} className={cn(className, 'resize-y', error && 'border-red-600/70')} />
    <div className="flex items-center justify-between gap-2">
      <span className={cn('text-[9px] font-mono', error ? 'text-red-400' : 'text-emerald-500')}>{error || (text.trim() ? 'Valid JSON' : 'JSON')}</span>
      <button type="button" disabled={Boolean(error) || !text.trim()} onClick={() => onChange(JSON.stringify(JSON.parse(text), null, 2))} className="text-[9px] text-blue-400 disabled:text-slate-700">Format</button>
    </div>
  </div>;
}

function AmountInput({ field, value, onChange }: {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
}) {
  const baseInput = 'w-full bg-[#0e1018] border border-[#1e2130] rounded text-[11px] text-slate-200 px-2 py-1.5 outline-none focus:border-blue-500/50 placeholder:text-slate-600 font-mono';
  const amtType = value?.type || 'xrp';

  const setField = (key: string, val: string) =>
    onChange({ type: amtType, ...value, [key]: val });

  return (
    <div className="space-y-1.5">
      {/* XRP / IOU / MPT toggle */}
      <div className="flex rounded overflow-hidden border border-[#1e2130] text-[10px]">
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={field.label}
          onClick={() => onChange({ type: 'xrp', drops: value?.drops || '' })}
          className={cn(
            'flex-1 py-1 font-mono transition-colors',
            amtType === 'xrp'
              ? 'bg-blue-600/30 text-blue-300 border-r border-[#1e2130]'
              : 'bg-[#0e1018] text-slate-500 hover:text-slate-300 border-r border-[#1e2130]',
          )}
        >
          XRP
        </button>
        <button
          type="button"
          onClick={() => onChange({ type: 'token', currency: value?.currency || '', issuer: value?.issuer || '', value: value?.value || '' })}
          className={cn(
            'flex-1 py-1 font-mono transition-colors',
            amtType === 'token'
              ? 'bg-blue-600/30 text-blue-300'
              : 'bg-[#0e1018] text-slate-500 hover:text-slate-300',
          )}
        >
          Token (IOU)
        </button>
        <button
          type="button"
          onClick={() => onChange({ type: 'mpt', issuanceId: value?.issuanceId || '', value: value?.value || '' })}
          className={cn('flex-1 py-1 font-mono transition-colors border-l border-[#1e2130]', amtType === 'mpt' ? 'bg-blue-600/30 text-blue-300' : 'bg-[#0e1018] text-slate-500 hover:text-slate-300')}
        >MPT</button>
      </div>

      {amtType === 'xrp' ? (
        <input
          type="number"
          value={value?.drops ?? ''}
          onChange={e => setField('drops', e.target.value)}
          placeholder="drops  (1 XRP = 1,000,000)"
          className={baseInput}
        />
      ) : amtType === 'token' ? (
        <div className="space-y-1">
          <input
            value={value?.currency ?? ''}
            onChange={e => setField('currency', e.target.value.toUpperCase())}
            placeholder="Currency  e.g. USD  (hex if > 3 chars)"
            className={baseInput}
          />
          <input
            value={value?.issuer ?? ''}
            onChange={e => setField('issuer', e.target.value)}
            placeholder="Issuer address  r…"
            className={baseInput}
          />
          <input
            value={value?.value ?? ''}
            onChange={e => setField('value', e.target.value)}
            placeholder="Value  e.g. 100"
            className={baseInput}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <input value={value?.issuanceId ?? ''} onChange={e => setField('issuanceId', e.target.value.toUpperCase())} placeholder="MPT issuance ID" className={baseInput} />
          <input value={value?.value ?? ''} onChange={e => setField('value', e.target.value)} placeholder="Value" className={baseInput} />
        </div>
      )}
    </div>
  );
}

function IssueInput({ value, onChange }: { value: any; onChange: (value: any) => void }) {
  const type = value?.type || 'xrp';
  const inputClass = 'w-full bg-[#0e1018] border border-[#1e2130] rounded text-[11px] text-slate-200 px-2 py-1.5 outline-none focus:border-blue-500/50 font-mono';
  return <div className="space-y-1.5">
    <select value={type} onChange={event => {
      const next = event.target.value;
      onChange(next === 'xrp' ? { type: 'xrp', currency: 'XRP' } : next === 'mpt' ? { type: 'mpt', issuanceId: '' } : { type: 'token', currency: '', issuer: '' });
    }} className={inputClass}>
      <option value="xrp">XRP</option><option value="token">Issued Token</option><option value="mpt">MPT</option>
    </select>
    {type === 'token' && <>
      <input value={value?.currency ?? ''} onChange={e => onChange({ ...value, type, currency: e.target.value.toUpperCase() })} placeholder="Currency" className={inputClass} />
      <input value={value?.issuer ?? ''} onChange={e => onChange({ ...value, type, issuer: e.target.value })} placeholder="Issuer address" className={inputClass} />
    </>}
    {type === 'mpt' && <input value={value?.issuanceId ?? ''} onChange={e => onChange({ ...value, type, issuanceId: e.target.value.toUpperCase() })} placeholder="MPT issuance ID" className={inputClass} />}
  </div>;
}

function WalletPicker({ value, onChange, wallets }: {
  value: string;
  onChange: (addr: string) => void;
  wallets: { id: string; name: string; address: string }[];
}) {
  function truncAddr(s: string) {
    return s.length > 16 ? s.slice(0, 6) + '…' + s.slice(-6) : s;
  }
  const matched = wallets.find(w => w.address === value);
  return (
    <select
      value={matched ? matched.id : ''}
      onChange={e => {
        const w = wallets.find(x => x.id === e.target.value);
        if (w) onChange(w.address);
      }}
      className="w-full bg-[#0e1018] border border-[#1e2130] rounded text-[10px] text-slate-300 px-2 py-1.5 outline-none focus:border-blue-500/50 font-mono cursor-pointer mb-1"
    >
      <option value="">— pick wallet —</option>
      {wallets.map(w => (
        <option key={w.id} value={w.id}>
          {w.name}  ({truncAddr(w.address)})
        </option>
      ))}
    </select>
  );
}

function FieldLabel({ field }: { field: FieldDef }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{field.label}</span>
      {field.required && <span className="text-red-500">*</span>}
      {field.docsId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigateToDocs(field.docsId!)}
              aria-label={`Open docs for ${field.label}`}
              className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
            >
              <Info size={11} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111827] text-slate-100">
            Open docs for this field
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function FieldInput({ field, value, onChange, wallets }: {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
  wallets: { id: string; name: string; address: string }[];
}) {
  const baseInput = 'w-full bg-[#0e1018] border border-[#1e2130] rounded text-[11px] text-slate-200 px-2 py-1.5 outline-none focus:border-blue-500/50 placeholder:text-slate-600 font-mono';

  if (field.type === 'amount') {
    return <AmountInput field={field} value={value} onChange={onChange} />;
  }

  if (field.type === 'issue') return <IssueInput value={value} onChange={onChange} />;

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onChange(!value)}
          data-testid={`field-${field.name}`}
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70',
            value ? 'bg-blue-600' : 'bg-[#1e2130]'
          )}
        >
          <span className={cn(
            'pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            value ? 'translate-x-4' : 'translate-x-0'
          )} />
        </button>
        <span className="min-w-0 text-[11px] leading-5 text-slate-400">{value ? 'true' : 'false'}</span>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        data-testid={`field-${field.name}`}
        className={cn(baseInput, 'cursor-pointer')}
      >
        <option value="">Select...</option>
        {field.options?.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'textarea') {
    if (STRUCTURED_FIELD_NAMES.has(field.name)) return <StructuredJsonInput field={field} value={value} onChange={onChange} className={baseInput} />;
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.description || ''}
        data-testid={`field-${field.name}`}
        rows={3}
        className={cn(baseInput, 'resize-none')}
      />
    );
  }

  if (field.type === 'address') {
    return (
      <div>
        {wallets.length > 0 && (
          <WalletPicker value={value ?? ''} onChange={onChange} wallets={wallets} />
        )}
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.description || 'r...'}
          data-testid={`field-${field.name}`}
          className={baseInput}
        />
      </div>
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      value={value ?? ''}
      onChange={e => onChange(field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      placeholder={field.description || (field.type === 'drops' ? 'drops' : '')}
      data-testid={`field-${field.name}`}
      className={baseInput}
    />
  );
}

export function ConfigPanel() {
  const { selectedNodeId, nodes, updateNodeData, network, wallets, activeWalletId } = useWorkflowStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({});

  const node = nodes.find(n => n.id === selectedNodeId);
  const def = node ? getNodeDef(node.type as string) : null;

  useEffect(() => {
    if (node) {
      const cfg = (node.data?.config as Record<string, any>) || {};
      const withDefaults: Record<string, any> = {};
      if (def) {
        for (const f of def.fields) {
          if (f.type === 'amount') {
            withDefaults[f.name] = cfg[f.name] !== undefined
              ? cfg[f.name]
              : (f.defaultValue ?? { type: 'xrp', drops: '' });
          } else if (f.type === 'issue') {
            withDefaults[f.name] = cfg[f.name] !== undefined ? cfg[f.name] : { type: 'xrp', currency: 'XRP' };
          } else {
            withDefaults[f.name] = cfg[f.name] !== undefined ? cfg[f.name] : (f.defaultValue ?? '');
          }
        }
      }
      setLocalConfig({ ...cfg, ...withDefaults });
    }
  }, [selectedNodeId, def]);

  const preview = useMemo(() => {
    if (!node || !getTransactionAdapter(node.type as string)) return null;
    const fallback = wallets.find(wallet => wallet.id === activeWalletId)?.address || 'rINVALID';
    try {
      return { transaction: buildValidatedTransaction(node.type as string, localConfig, fallback), error: '' };
    } catch (error) {
      return { transaction: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [node, localConfig, wallets, activeWalletId]);

  if (!node || !def) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 text-[11px] gap-2 px-4 text-center">
        <div className="w-8 h-8 rounded-lg bg-[#1e2130] flex items-center justify-center mb-1">
          <span className="text-slate-500 text-lg">↗</span>
        </div>
        <p className="font-medium text-slate-400">Select a node</p>
        <p>Click any node on the canvas to configure it here</p>
      </div>
    );
  }

  const isDevnetOnly = def.networkGating === 'devnet-only';
  const requiredFields = def.fields.filter(f => f.required);
  const optionalFields = def.fields.filter(f => !f.required);
  const adapter = getTransactionAdapter(node.type as string);
  const signing = (node.data?.signing as { mode?: 'single' | 'multi'; signerWalletIds?: string[]; counterpartyWalletId?: string } | undefined) || { mode: 'single', signerWalletIds: [] };

  const handleChange = (name: string, val: any) => {
    const next = { ...localConfig, [name]: val };
    setLocalConfig(next);
    updateNodeData(node.id, { config: next, label: def.label });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="config-panel">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#1e2130] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: def.color }} />
          <span className="text-[12px] font-semibold text-slate-100 truncate">{def.label}</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 ml-4">{def.description}</p>
      </div>

      {/* Warnings */}
      {isDevnetOnly && network !== 'devnet' && (
        <div className="mx-3 mt-2 px-2.5 py-2 bg-lime-900/20 border border-lime-800/40 rounded text-[10px] text-lime-400 flex-shrink-0">
          This node requires Devnet. Switch network to use it.
        </div>
      )}

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {def.fields.length === 0 && (
          <p className="text-[11px] text-slate-600 text-center py-4">No configuration needed</p>
        )}

        {/* Required fields */}
        {requiredFields.length > 0 && (
          <div className="space-y-2.5 mb-3">
            {requiredFields.map(field => (
              <div key={field.name}>
                <label className="flex items-center gap-1 text-[10px] text-slate-400 mb-1 font-mono">
                  <FieldLabel field={field} />
                </label>
                <FieldInput
                  field={field}
                  value={localConfig[field.name]}
                  onChange={val => handleChange(field.name, val)}
                  wallets={wallets}
                />
              </div>
            ))}
          </div>
        )}

        {/* Optional fields (collapsible) */}
        {optionalFields.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(p => !p)}
              className="w-full flex items-center justify-between py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              data-testid="advanced-toggle"
            >
              <span className="font-mono uppercase tracking-wider">Advanced ({optionalFields.length})</span>
              {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showAdvanced && (
              <div className="space-y-2.5 mt-1.5">
                {optionalFields.map(field => (
                  <div key={field.name}>
                    <label className="flex items-center gap-1 text-[10px] text-slate-400 mb-1 font-mono">
                      <FieldLabel field={field} />
                    </label>
                    <FieldInput
                      field={field}
                      value={localConfig[field.name]}
                      onChange={val => handleChange(field.name, val)}
                      wallets={wallets}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {adapter && (
          <div className="mt-4 border-t border-[#1e2130] pt-3 space-y-2">
            <label className="block text-[10px] text-slate-400 font-mono">Signing Mode</label>
            <select value={signing.mode || 'single'} onChange={event => updateNodeData(node.id, { signing: { ...signing, mode: event.target.value } })} className="w-full bg-[#0e1018] border border-[#1e2130] rounded text-[11px] px-2 py-1.5">
              <option value="single">Single local wallet</option>
              <option value="multi">XRPL multisign</option>
            </select>
            {signing.mode === 'multi' && <div className="space-y-1">
              <p className="text-[9px] text-slate-500">Select imported wallets whose ledger signer weights meet quorum.</p>
              {wallets.map(wallet => {
                const checked = (signing.signerWalletIds || []).includes(wallet.id);
                return <label key={wallet.id} className="flex items-center gap-2 text-[10px] text-slate-300">
                  <input type="checkbox" checked={checked} onChange={() => updateNodeData(node.id, { signing: { ...signing, mode: 'multi', signerWalletIds: checked ? (signing.signerWalletIds || []).filter(id => id !== wallet.id) : [...(signing.signerWalletIds || []), wallet.id] } })} />
                  {wallet.name} <span className="font-mono text-slate-600">{wallet.address.slice(0, 8)}…</span>
                </label>;
              })}
            </div>}
            {node.type === 'LoanSet' && <div>
              <label className="block text-[10px] text-slate-400 font-mono mb-1">Counterparty Wallet</label>
              <select value={signing.counterpartyWalletId || ''} onChange={event => updateNodeData(node.id, { signing: { ...signing, counterpartyWalletId: event.target.value } })} className="w-full bg-[#0e1018] border border-[#1e2130] rounded text-[11px] px-2 py-1.5">
                <option value="">Select local counterparty…</option>
                {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
              </select>
            </div>}
          </div>
        )}
        {preview && (
          <div className="mt-4 border-t border-[#1e2130] pt-3">
            <p className={`text-[10px] font-mono mb-2 ${preview.error ? 'text-amber-400' : 'text-emerald-400'}`}>
              {preview.error ? `Validation: ${preview.error}` : '✓ Transaction payload is valid'}
            </p>
            {preview.transaction && <pre className="text-[9px] leading-relaxed text-slate-400 bg-[#090b11] border border-[#1e2130] rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(preview.transaction, null, 2)}</pre>}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-[#1e2130] text-[10px] text-slate-500">Changes save automatically</div>
    </div>
  );
}

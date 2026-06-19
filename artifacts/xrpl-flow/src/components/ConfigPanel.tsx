import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getNodeDef, FieldDef } from '@/lib/nodeRegistry';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

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
      {/* XRP / Token toggle */}
      <div className="flex rounded overflow-hidden border border-[#1e2130] text-[10px]">
        <button
          type="button"
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
      </div>

      {amtType === 'xrp' ? (
        <input
          type="number"
          value={value?.drops ?? ''}
          onChange={e => setField('drops', e.target.value)}
          placeholder="drops  (1 XRP = 1,000,000)"
          className={baseInput}
        />
      ) : (
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
      )}
    </div>
  );
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

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(!value)}
          data-testid={`field-${field.name}`}
          className={cn(
            'w-8 h-4 rounded-full transition-colors relative',
            value ? 'bg-blue-600' : 'bg-[#1e2130]'
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5'
          )} />
        </button>
        <span className="text-[11px] text-slate-400">{value ? 'true' : 'false'}</span>
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
      onChange={e => onChange(field.type === 'number' ? Number(e.target.value) || '' : e.target.value)}
      placeholder={field.description || (field.type === 'drops' ? 'drops' : '')}
      data-testid={`field-${field.name}`}
      className={baseInput}
    />
  );
}

export function ConfigPanel() {
  const { selectedNodeId, nodes, updateNodeData, network, wallets } = useWorkflowStore();
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
          } else {
            withDefaults[f.name] = cfg[f.name] !== undefined ? cfg[f.name] : (f.defaultValue ?? '');
          }
        }
      }
      setLocalConfig({ ...cfg, ...withDefaults });
    }
  }, [selectedNodeId]);

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
  const isBatch = node.type === 'BatchContainer';
  const requiredFields = def.fields.filter(f => f.required);
  const optionalFields = def.fields.filter(f => !f.required);

  const handleSave = () => {
    updateNodeData(node.id, { config: localConfig, label: def.label });
  };

  const handleChange = (name: string, val: any) => {
    setLocalConfig(prev => ({ ...prev, [name]: val }));
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
      {isBatch && (
        <div className="mx-3 mt-2 px-2.5 py-2 bg-red-900/20 border border-red-800/40 rounded text-[10px] text-red-400 flex-shrink-0">
          BatchV1_1 is pending re-activation after the Feb 2026 security patch.
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
                  {field.label}
                  <span className="text-red-500">*</span>
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
                    <label className="block text-[10px] text-slate-400 mb-1 font-mono">{field.label}</label>
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
      </div>

      {/* Save button */}
      <div className="px-3 py-2.5 border-t border-[#1e2130] flex-shrink-0">
        <button
          type="button"
          onClick={handleSave}
          data-testid="save-node-config"
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded transition-colors"
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}

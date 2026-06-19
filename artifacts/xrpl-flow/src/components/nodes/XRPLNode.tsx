import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap, ArrowRightLeft, Repeat2, GitFork, Clock, Layers, Shield, Database, Globe, BarChart2, Landmark, Coins, FileCheck, GitMerge, AlertTriangle, Hash, Link, Terminal, Flame } from 'lucide-react';
import { getNodeDef } from '@/lib/nodeRegistry';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Triggers': <Zap size={12} />,
  'Account Management': <Shield size={12} />,
  'Payments & Channels': <ArrowRightLeft size={12} />,
  'DEX / Offers': <Repeat2 size={12} />,
  'AMM': <BarChart2 size={12} />,
  'MPTs': <Coins size={12} />,
  'Credentials': <FileCheck size={12} />,
  'Permissioned Domains': <Globe size={12} />,
  'DIDs': <Hash size={12} />,
  'Price Oracles': <BarChart2 size={12} />,
  'NFTs': <Layers size={12} />,
  'Checks': <FileCheck size={12} />,
  'Vaults': <Database size={12} />,
  'Lending Protocol': <Landmark size={12} />,
  'Batch': <Layers size={12} />,
  'Control Flow': <GitFork size={12} />,
  'Output': <Terminal size={12} />,
};

interface XRPLNodeData {
  label: string;
  config?: Record<string, any>;
  [key: string]: unknown;
}

function XRPLNodeInner({ id, type, data, selected }: NodeProps) {
  const nodeData = data as XRPLNodeData;
  const def = getNodeDef(type as string);
  const { nodeStatus, network } = useWorkflowStore();
  const statusInfo = nodeStatus[id];
  const status = statusInfo?.status || 'idle';

  const color = def?.color || '#6b7280';
  const category = def?.category || 'Control Flow';
  const isDevnetOnly = def?.networkGating === 'devnet-only';
  const isBatch = type === 'BatchContainer';
  const label = nodeData.label || def?.label || type;
  const isCondition = type === 'ConditionBranch';
  const isParallelSplit = type === 'ParallelSplit';

  const statusRing = {
    idle: '',
    running: 'node-running ring-2 ring-blue-500',
    success: 'ring-2 ring-emerald-500',
    failed: 'ring-2 ring-red-500',
  }[status];

  const devnetWarning = isDevnetOnly && network !== 'devnet';

  return (
    <div
      className={cn(
        'relative flex flex-col min-w-[160px] max-w-[220px] rounded-md overflow-hidden',
        'bg-[#151820] border border-[#1e2130] text-xs text-slate-200 select-none',
        'shadow-lg transition-all duration-150',
        selected && 'border-blue-500/60',
        statusRing,
        devnetWarning && 'opacity-50',
      )}
      data-testid={`node-${id}`}
    >
      {/* Left color accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 pl-4 pt-2 pb-1.5">
        <span style={{ color }} className="flex-shrink-0">{CATEGORY_ICONS[category] || <Flame size={12} />}</span>
        <span className="font-medium truncate text-slate-100 text-[11px] leading-tight">{label}</span>
      </div>

      {/* Category label */}
      <div className="px-4 pb-2">
        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">{category}</span>
      </div>

      {/* Status bar */}
      {status !== 'idle' && (
        <div className={cn(
          'px-4 pb-1.5 text-[9px] font-mono',
          status === 'running' && 'text-blue-400',
          status === 'success' && 'text-emerald-400',
          status === 'failed' && 'text-red-400',
        )}>
          {status === 'running' && '● running...'}
          {status === 'success' && '✓ success'}
          {status === 'failed' && `✗ ${statusInfo?.error?.substring(0, 28) || 'failed'}`}
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        {isDevnetOnly && (
          <span className="text-[8px] font-mono bg-lime-900/60 text-lime-400 border border-lime-800/50 px-1 py-0.5 rounded">
            DEVNET
          </span>
        )}
        {isBatch && (
          <span className="text-[8px] font-mono bg-red-900/60 text-red-400 border border-red-800/50 px-1 py-0.5 rounded flex items-center gap-0.5">
            <AlertTriangle size={7} />PENDING
          </span>
        )}
      </div>

      {/* Handles */}
      {/* Target (input) — left */}
      {type !== 'ManualTrigger' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: color, borderColor: '#0a0b0d', left: -5 }}
        />
      )}

      {/* Source (output) — right */}
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ background: '#10b981', borderColor: '#0a0b0d', top: '35%', right: -5 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ background: '#ef4444', borderColor: '#0a0b0d', top: '65%', right: -5 }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: color, borderColor: '#0a0b0d', right: -5 }}
        />
      )}
    </div>
  );
}

export const XRPLNode = memo(XRPLNodeInner);
export default XRPLNode;

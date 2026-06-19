import { memo, useState } from 'react';
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from '@xyflow/react';
import { Layers, AlertTriangle, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';

const BATCH_COLOR = '#ef4444';

interface BatchContainerData {
  label?: string;
  config?: Record<string, any>;
  [key: string]: unknown;
}

function BatchContainerNodeInner({ id, data, selected }: NodeProps) {
  const d = data as BatchContainerData;
  const { nodeStatus, network } = useWorkflowStore();
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const statusInfo = nodeStatus[id];
  const status = statusInfo?.status || 'idle';
  const mode = d.config?.ExecutionMode || 'ALLORNOTHING';

  const statusBorder = {
    idle: selected ? 'border-red-500/60' : 'border-dashed border-red-800/50',
    running: 'border-blue-500 border-dashed node-running',
    success: 'border-emerald-500 border-dashed',
    failed: 'border-red-500 border-dashed',
  }[status];

  return (
    <div
      className={`relative w-full h-full rounded-lg border-2 ${statusBorder} bg-red-950/10`}
      data-testid={`batch-node-${id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeResizer
        color={BATCH_COLOR}
        isVisible={selected}
        minWidth={280}
        minHeight={180}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: BATCH_COLOR }}
        lineStyle={{ border: `1px solid ${BATCH_COLOR}` }}
      />

      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-800/40 bg-red-950/20 rounded-t-lg">
        <Layers size={12} style={{ color: BATCH_COLOR }} />
        <span className="text-[11px] font-medium text-slate-100">Batch Container</span>
        <span className="text-[9px] font-mono bg-red-900/60 text-red-400 border border-red-800/50 px-1.5 py-0.5 rounded ml-auto">
          {mode}
        </span>
        {network !== 'devnet' && (
          <span className="text-[8px] font-mono bg-lime-900/60 text-lime-400 border border-lime-800/50 px-1 py-0.5 rounded flex items-center gap-0.5">
            <AlertTriangle size={7} />DEVNET
          </span>
        )}
        {(hovered || selected) && (
          <button
            className="flex items-center justify-center w-4 h-4 rounded bg-[#1e2130] hover:bg-red-600/80 text-slate-400 hover:text-white transition-colors nodrag"
            title="Delete batch container"
            onMouseDown={e => {
              e.stopPropagation();
              deleteElements({ nodes: [{ id }] });
            }}
          >
            <X size={9} />
          </button>
        )}
      </div>

      {/* Warning banner */}
      <div className="mx-2 mt-2 px-2 py-1 bg-red-900/20 border border-red-800/30 rounded text-[9px] text-red-400 font-mono flex items-center gap-1">
        <AlertTriangle size={9} />
        BatchV1_1 pending re-activation — drop inner tx nodes below
      </div>

      {/* Status */}
      {status !== 'idle' && (
        <div className={`px-3 mt-1 text-[9px] font-mono ${
          status === 'running' ? 'text-blue-400' : status === 'success' ? 'text-emerald-400' : 'text-red-400'
        }`}>
          {status === 'running' ? '● executing batch...' : status === 'success' ? '✓ batch submitted' : `✗ ${statusInfo?.error?.slice(0, 40) || 'failed'}`}
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: BATCH_COLOR, borderColor: '#0a0b0d', left: -5, top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: BATCH_COLOR, borderColor: '#0a0b0d', right: -5, top: '50%' }}
      />
    </div>
  );
}

export const BatchContainerNode = memo(BatchContainerNodeInner);
export default BatchContainerNode;

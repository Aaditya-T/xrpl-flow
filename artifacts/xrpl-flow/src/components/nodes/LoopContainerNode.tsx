import { memo } from 'react';
import { Handle, NodeProps, NodeResizer, Position } from '@xyflow/react';
import { Repeat2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';

function LoopContainerNodeInner({ id, data, selected }: NodeProps) {
  const status = useWorkflowStore(state => state.nodeStatus[id]?.status || 'idle');
  const config = (data.config || {}) as Record<string, unknown>;
  return <div className={`connection-node relative w-full h-full rounded-lg border-2 border-dashed ${status === 'failed' ? 'border-red-500' : status === 'success' ? 'border-emerald-500' : 'border-violet-700/60'} bg-violet-950/10`}>
    <NodeResizer isVisible={selected} minWidth={280} minHeight={180} color="#8b5cf6" />
    <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-800/40 bg-violet-950/20 rounded-t-lg">
      <Repeat2 size={12} className="text-violet-400" />
      <span className="text-[11px] font-medium text-slate-100">Loop Container</span>
      <span className="ml-auto text-[9px] font-mono text-violet-300">{String(config.LoopMode || 'count')}</span>
    </div>
    <div className="px-3 py-2 text-[9px] text-violet-400/80">Drop the nodes to repeat inside this container.</div>
    <Handle className="connection-handle" type="target" position={Position.Left} aria-label="Connect into Loop Container" style={{ background: '#8b5cf6', borderColor: '#f8fafc', left: -5 }} />
    <Handle className="connection-handle" type="source" position={Position.Right} aria-label="Connect from Loop Container" style={{ background: '#8b5cf6', borderColor: '#f8fafc', right: -5 }} />
  </div>;
}

export const LoopContainerNode = memo(LoopContainerNodeInner);

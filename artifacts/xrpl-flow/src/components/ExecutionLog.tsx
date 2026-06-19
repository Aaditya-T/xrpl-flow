import { useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { EXPLORER_URLS } from '@/lib/xrplClient';
import { cn } from '@/lib/utils';

export function ExecutionLog({ onClose }: { onClose: () => void }) {
  const { executionLog, clearLog, network } = useWorkflowStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionLog.length]);

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex flex-col h-full bg-[#0a0b0d] border-t border-[#1e2130]" data-testid="execution-log">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e2130] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Execution Log</span>
          <span className="text-[9px] font-mono bg-[#1e2130] text-slate-500 px-1.5 rounded">{executionLog.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {executionLog.length > 0 && (
            <button
              type="button"
              onClick={clearLog}
              data-testid="clear-log"
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors font-mono"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            data-testid="close-log"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {executionLog.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-slate-700 font-mono">
            no output yet — run a workflow to see logs
          </div>
        ) : (
          <table className="w-full text-[10px] font-mono">
            <tbody>
              {executionLog.map(entry => (
                <tr
                  key={entry.id}
                  data-testid={`log-entry-${entry.id}`}
                  className={cn(
                    'border-b border-[#1e2130]/40 hover:bg-[#1e2130]/30 transition-colors',
                    entry.status === 'running' && 'bg-blue-900/10',
                    entry.status === 'success' && 'bg-emerald-900/10',
                    entry.status === 'failed' && 'bg-red-900/10',
                  )}
                >
                  {/* Time */}
                  <td className="px-2.5 py-1 text-slate-600 whitespace-nowrap w-[80px]">
                    {fmt(entry.timestamp)}
                  </td>
                  {/* Status indicator */}
                  <td className="py-1 w-[14px]">
                    <span className={cn(
                      entry.status === 'running' && 'text-blue-400',
                      entry.status === 'success' && 'text-emerald-400',
                      entry.status === 'failed' && 'text-red-400',
                      entry.status === 'info' && 'text-slate-400',
                    )}>
                      {entry.status === 'running' ? '●' : entry.status === 'success' ? '✓' : entry.status === 'failed' ? '✗' : '·'}
                    </span>
                  </td>
                  {/* Node label */}
                  <td className="py-1 pr-2 text-slate-400 whitespace-nowrap w-[140px] truncate max-w-[140px]">
                    {entry.nodeLabel}
                  </td>
                  {/* Message */}
                  <td className="py-1 text-slate-300 break-all">
                    {entry.message}
                  </td>
                  {/* TX hash */}
                  <td className="py-1 px-2.5 whitespace-nowrap w-[80px]">
                    {entry.txHash && (
                      <a
                        href={`${EXPLORER_URLS[network]}${entry.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors"
                        title={entry.txHash}
                      >
                        <span>{entry.txHash.slice(0, 6)}…</span>
                        <ExternalLink size={9} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

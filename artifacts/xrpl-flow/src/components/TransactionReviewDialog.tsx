import { AlertTriangle, Check, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';

export function TransactionReviewDialog() {
  const request = useWorkflowStore(state => state.reviewRequest);
  const resolve = useWorkflowStore(state => state.resolveTransactionReview);
  if (!request) return null;
  const tx = request.transaction;
  return <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="transaction-review-title">
    <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-red-700/60 bg-[#10131c] shadow-2xl">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-red-900/60">
        <AlertTriangle className="text-red-400" size={20} />
        <div><h2 id="transaction-review-title" className="text-base font-semibold text-white">Review Mainnet Transaction</h2><p className="text-xs text-red-300">This action signs and submits real value to Mainnet.</p></div>
      </div>
      <div className="p-5 overflow-y-auto space-y-4 text-sm">
        <dl className="grid grid-cols-[120px_1fr] gap-2 text-xs">
          <dt className="text-slate-500">Node</dt><dd>{request.nodeLabel}</dd>
          <dt className="text-slate-500">Network</dt><dd className="font-bold uppercase text-red-300">{request.network}</dd>
          <dt className="text-slate-500">Type</dt><dd className="font-mono">{String(tx.TransactionType)}</dd>
          <dt className="text-slate-500">Account</dt><dd className="font-mono break-all">{String(tx.Account)}</dd>
          {'Destination' in tx && <><dt className="text-slate-500">Destination</dt><dd className="font-mono break-all">{String(tx.Destination)}</dd></>}
          {'Amount' in tx && <><dt className="text-slate-500">Amount</dt><dd className="font-mono break-all">{typeof tx.Amount === 'string' ? tx.Amount : JSON.stringify(tx.Amount)}</dd></>}
          <dt className="text-slate-500">Fee</dt><dd className="font-mono">{String(tx.Fee || 'autofill')}</dd>
          <dt className="text-slate-500">Flags</dt><dd className="font-mono">{String(tx.Flags ?? 0)}</dd>
          <dt className="text-slate-500">Signer(s)</dt><dd className="font-mono break-all">{request.signerAddresses.join(', ')}</dd>
        </dl>
        {request.warnings.map(warning => <div key={warning} className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">{warning}</div>)}
        <div><p className="text-xs text-slate-400 mb-1">Simulation</p><pre className="max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] text-slate-300">{request.simulation ? JSON.stringify(request.simulation, null, 2) : 'Simulation unavailable — review carefully.'}</pre></div>
        <div><p className="text-xs text-slate-400 mb-1">Exact transaction JSON</p><pre className="max-h-64 overflow-auto rounded bg-black/40 p-3 text-[10px] text-slate-300">{JSON.stringify(tx, null, 2)}</pre></div>
      </div>
      <div className="flex justify-end gap-3 px-5 py-4 border-t border-[#252b3b]">
        <button autoFocus onClick={() => resolve(false)} className="flex items-center gap-2 px-4 py-2 rounded border border-slate-600 text-slate-200"><X size={14} />Cancel</button>
        <button onClick={() => resolve(true)} className="flex items-center gap-2 px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-semibold"><Check size={14} />Sign & Submit</button>
      </div>
    </div>
  </div>;
}

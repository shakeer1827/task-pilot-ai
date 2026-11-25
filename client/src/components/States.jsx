import React from 'react';
import { Loader2, AlertTriangle, Inbox } from 'lucide-react';

export function LoadingState({ message = 'Loading workspace data...' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
      <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
      <p className="mt-3 text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Something went wrong</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          {onRetry && (
            <button onClick={onRetry} className="btn-secondary mt-3 text-xs">
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

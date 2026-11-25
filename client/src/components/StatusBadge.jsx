import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  PauseCircle,
  StopCircle,
  HelpCircle,
  ShieldCheck,
  FileEdit,
} from 'lucide-react';

const STATUS_STYLES = {
  completed: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Completed',
    Icon: CheckCircle2,
  },
  running: {
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Running',
    Icon: Loader2,
    spin: true,
  },
  pending: {
    bg: 'bg-slate-100 text-slate-600 border-slate-200',
    label: 'Pending',
    Icon: Clock,
  },
  failed: {
    bg: 'bg-red-50 text-red-700 border-red-200',
    label: 'Failed',
    Icon: AlertCircle,
  },
  waiting_for_input: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Waiting for Input',
    Icon: HelpCircle,
  },
  waiting: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Waiting',
    Icon: HelpCircle,
  },
  awaiting_approval: {
    bg: 'bg-violet-50 text-violet-700 border-violet-200',
    label: 'Awaiting Approval',
    Icon: ShieldCheck,
  },
  paused: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Paused',
    Icon: PauseCircle,
  },
  stopped: {
    bg: 'bg-slate-100 text-slate-700 border-slate-300',
    label: 'Stopped',
    Icon: StopCircle,
  },
  interrupted: {
    bg: 'bg-orange-50 text-orange-700 border-orange-200',
    label: 'Interrupted',
    Icon: StopCircle,
  },
  approved: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Approved',
    Icon: ShieldCheck,
  },
  draft: {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    label: 'Draft',
    Icon: FileEdit,
  },
  warning: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Warning',
    Icon: AlertCircle,
  },
  info: {
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Info',
    Icon: Clock,
  },
};

export function StatusBadge({ status }) {
  const key = String(status || 'pending').toLowerCase();
  const cfg = STATUS_STYLES[key] || {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    label: status || 'Unknown',
    Icon: Clock,
  };
  const Icon = cfg.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.bg}`}
    >
      <Icon className={`h-3.5 w-3.5 ${cfg.spin ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

import React from 'react';
import { CloudSun, Calculator, Database, ClipboardList, UserCheck } from 'lucide-react';

const TOOL_META = {
  weather_forecast: {
    label: 'Open-Meteo Weather',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
    Icon: CloudSun,
  },
  budget_calculator: {
    label: 'Budget Calculator',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
    Icon: Calculator,
  },
  database_save: {
    label: 'Database Save',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Icon: Database,
  },
  logistics_planner: {
    label: 'Logistics Planner',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: ClipboardList,
  },
  none: {
    label: 'Human Action',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: UserCheck,
  },
};

export function ToolBadge({ toolName }) {
  const meta = TOOL_META[toolName] || TOOL_META.none;
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

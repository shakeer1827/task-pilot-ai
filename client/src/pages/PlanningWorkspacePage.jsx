import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  Play,
  Save,
  HelpCircle,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { StatusBadge } from '../components/StatusBadge';
import { ToolBadge } from '../components/ToolBadge';
import { LoadingState, ErrorState } from '../components/States';

const TOOL_OPTIONS = [
  { value: 'weather_forecast', label: 'Open-Meteo Weather API' },
  { value: 'budget_calculator', label: 'Budget Calculator' },
  { value: 'logistics_planner', label: 'Logistics & Checklist Planner' },
  { value: 'database_save', label: 'Database Save Checkpoint' },
  { value: 'none', label: 'Human / Manual Step' },
];

export default function PlanningWorkspacePage() {
  const { planId } = useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [clarifications, setClarifications] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/plans/${planId}`);
      setPlan(data.plan);
      setGoal(data.goal);
      setTasks(data.tasks || []);
      setClarifications(data.goal?.clarifications_json || {});
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const updateTaskField = (idx, field, value) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
    setDirty(true);
  };

  const moveTask = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= tasks.length) return;
    const copy = [...tasks];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed);
    const reindexed = copy.map((t, i) => ({ ...t, execution_order: i + 1 }));
    setTasks(reindexed);
    setDirty(true);
  };

  const deleteTask = (idx) => {
    if (tasks.length <= 1) {
      setError('A plan must contain at least one task.');
      return;
    }
    const copy = tasks.filter((_, i) => i !== idx).map((t, i) => ({ ...t, execution_order: i + 1 }));
    setTasks(copy);
    setDirty(true);
  };

  const addTask = () => {
    const nextOrder = tasks.length + 1;
    setTasks((prev) => [
      ...prev,
      {
        title: 'Custom Organizer Task',
        description: 'Describe what this task should accomplish.',
        execution_order: nextOrder,
        tool_name: 'logistics_planner',
        dependencies: [],
        expected_result: 'Task output verified.',
        failure_handling: 'Flag for human organizer review.',
        requires_human_action: false,
        status: 'pending',
        input_payload: {},
      },
    ]);
    setDirty(true);
  };

  const saveEdits = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = tasks.map((t, i) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        execution_order: i + 1,
        tool_name: t.tool_name,
        dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
        expected_result: t.expected_result || '',
        failure_handling: t.failure_handling || '',
        requires_human_action: Boolean(t.requires_human_action),
        input_payload: t.input_payload || {},
      }));
      const { data } = await apiClient.put(`/plans/${planId}`, { tasks: payload });
      setPlan(data.plan);
      setTasks(data.tasks);
      setDirty(false);
      return data.plan;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setBusyAction('regenerating');
    setError('');
    try {
      const { data } = await apiClient.post('/plans/generate', {
        goalId: goal.id,
        clarifications,
      });
      navigate(`/plans/${data.plan.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleApproveAndStart = async () => {
    setBusyAction('starting');
    setError('');
    try {
      if (dirty) {
        const saved = await saveEdits();
        if (!saved) {
          setBusyAction('');
          return;
        }
      }
      if (Object.keys(clarifications).length > 0) {
        await apiClient.patch(`/goals/${goal.id}`, {
          location: clarifications.location || goal.location,
          event_date: clarifications.event_date || goal.event_date,
          budget: clarifications.budget ? Number(clarifications.budget) : goal.budget,
          participants: clarifications.participants ? Number(clarifications.participants) : goal.participants,
          clarifications_json: clarifications,
        });
      }
      await apiClient.post(`/plans/${planId}/approve`);
      const execRes = await apiClient.post('/executions/start', { planId });
      navigate(`/executions/${execRes.data.execution.id}`);
    } catch (err) {
      setError(err.message);
      setBusyAction('');
    }
  };

  const missingInfo = plan?.plan_json?.missing_info || goal?.missing_info_json || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {loading ? (
          <LoadingState message="Loading AI planning workspace..." />
        ) : error && !plan ? (
          <ErrorState message={error} onRetry={loadPlan} />
        ) : (
          <>
            {/* Top Summary Card */}
            <div className="card p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                      PLAN v{plan.version}
                    </span>
                    <StatusBadge status={plan.approval_status} />
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                      <Cpu className="h-3.5 w-3.5 text-blue-600" />
                      Planner Engine: {plan.ai_provider}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{goal?.title}</h1>
                  <p className="text-sm text-slate-600">{plan.plan_json?.goal_summary || goal?.description}</p>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs text-slate-500">
                    <span>Location: {goal?.location || 'Not set'}</span>
                    <span>•</span>
                    <span>Date: {goal?.event_date || 'Not set'}</span>
                    <span>•</span>
                    <span>Budget: {goal?.budget ? `₹${Number(goal.budget).toLocaleString()}` : 'Not set'}</span>
                    <span>•</span>
                    <span>Participants: {goal?.participants || 'Not set'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={handleRegenerate}
                    disabled={Boolean(busyAction)}
                    className="btn-secondary"
                  >
                    <RefreshCw className={`h-4 w-4 ${busyAction === 'regenerating' ? 'animate-spin' : ''}`} />
                    Regenerate Plan
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={!dirty || saving || Boolean(busyAction)}
                    className="btn-secondary"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : dirty ? 'Save Edits' : 'Saved'}
                  </button>
                  <button
                    onClick={handleApproveAndStart}
                    disabled={Boolean(busyAction)}
                    className="btn-primary"
                  >
                    {busyAction === 'starting' ? (
                      'Starting Agent...'
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Approve & Execute Plan
                        <Play className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Missing Information Follow-up Panel */}
            {missingInfo.length > 0 && (
              <div className="card border-amber-200 bg-amber-50/50 p-5">
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <h2 className="text-sm font-semibold text-amber-900">
                      Planner Detected Missing Information ({missingInfo.length})
                    </h2>
                    <p className="mt-0.5 text-xs text-amber-800">
                      Supplying these details helps tools (like Open-Meteo and Budget Calculator) avoid pausing during execution.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {missingInfo.map((item) => (
                        <div key={item.field} className="rounded-lg border border-amber-200/80 bg-white p-3">
                          <label className="block text-xs font-semibold text-slate-800">
                            {item.question}{' '}
                            {item.required && <span className="text-amber-700">(Recommended)</span>}
                          </label>
                          <input
                            type={item.field === 'event_date' ? 'date' : item.field === 'budget' || item.field === 'participants' ? 'number' : 'text'}
                            value={clarifications[item.field] ?? ''}
                            onChange={(e) =>
                              setClarifications((prev) => ({ ...prev, [item.field]: e.target.value }))
                            }
                            placeholder={`Enter ${item.field}...`}
                            className="input-field mt-1.5 py-1.5 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        disabled={Boolean(busyAction)}
                        className="btn-secondary border-amber-300 bg-white py-1.5 text-xs text-amber-900 hover:bg-amber-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Update Goal & Regenerate Plan
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Editable Tasks List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Ordered Execution Steps ({tasks.length})
                </h2>
                <button type="button" onClick={addTask} className="btn-secondary py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add Task
                </button>
              </div>

              {tasks.map((task, idx) => (
                <div key={task.id || idx} className="card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="flex items-center gap-2 lg:flex-col">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white">
                        #{task.execution_order}
                      </span>
                      <div className="flex gap-1 lg:flex-col">
                        <button
                          type="button"
                          onClick={() => moveTask(idx, -1)}
                          disabled={idx === 0}
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          title="Move Up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(idx, 1)}
                          disabled={idx === tasks.length - 1}
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          title="Move Down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-7">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Task Title
                          </label>
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => updateTaskField(idx, 'title', e.target.value)}
                            className="input-field py-2 font-medium"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Required Tool
                          </label>
                          <select
                            value={task.tool_name}
                            onChange={(e) => updateTaskField(idx, 'tool_name', e.target.value)}
                            className="input-field py-2"
                          >
                            {TOOL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end justify-between gap-2 sm:col-span-2">
                          <StatusBadge status={task.status} />
                          <button
                            type="button"
                            onClick={() => deleteTask(idx)}
                            className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                            title="Delete task"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={task.description}
                          onChange={(e) => updateTaskField(idx, 'description', e.target.value)}
                          className="input-field py-2 text-sm"
                        />
                      </div>

                      <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
                        <div>
                          <span className="font-semibold text-slate-700">Dependencies: </span>
                          {task.dependencies?.length > 0
                            ? task.dependencies.map((d) => `Step #${d}`).join(', ')
                            : 'None (Independent)'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Expected Result: </span>
                          {task.expected_result || 'Verified tool output'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Failure Handling: </span>
                          {task.failure_handling || 'Bounded replan or ask user'}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <ToolBadge toolName={task.tool_name} />
                        {task.id && (
                          <span className="font-mono text-[11px] text-slate-400">ID: {task.id.slice(0, 8)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

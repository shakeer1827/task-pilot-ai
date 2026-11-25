import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Pause,
  Play,
  Square,
  RotateCcw,
  FileBarChart2,
  ChevronDown,
  ChevronRight,
  Terminal,
  HelpCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { apiClient, getExecutionStreamUrl } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { StatusBadge } from '../components/StatusBadge';
import { ToolBadge } from '../components/ToolBadge';
import { LoadingState, ErrorState } from '../components/States';

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasPayload = Boolean(log.input_json || log.output_json);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-400">
            [{new Date(log.created_at).toLocaleTimeString()}]
          </span>
          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-semibold text-white">{log.agent_name}</span>
          {log.tool_name && <ToolBadge toolName={log.tool_name} />}
          <StatusBadge status={log.status} />
          {log.duration_ms !== null && log.duration_ms !== undefined && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
              <Clock className="h-3 w-3" />
              {log.duration_ms}ms
            </span>
          )}
        </div>
        {hasPayload && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {expanded ? 'Hide Details' : 'Inspect Details'}
          </button>
        )}
      </div>

      <p className="mt-2 text-sm font-medium text-slate-800">{log.action}</p>

      {expanded && hasPayload && (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
          {log.input_json && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Input Summary</p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] text-slate-100">
                {JSON.stringify(log.input_json, null, 2)}
              </pre>
            </div>
          )}
          {log.output_json && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Output Summary</p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-300">
                {JSON.stringify(log.output_json, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExecutionWorkspacePage() {
  const { executionId } = useParams();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [clarificationText, setClarificationText] = useState({
    location: '',
    event_date: '',
  });

  const fetchState = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/executions/${executionId}`);
      setState(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Live SSE stream + fallback refresh while running
  useEffect(() => {
    const streamUrl = getExecutionStreamUrl(executionId);
    const es = new EventSource(streamUrl);

    const refresh = () => {
      fetchState();
    };

    es.addEventListener('snapshot', (e) => {
      try {
        setState(JSON.parse(e.data));
        setLoading(false);
      } catch {
        refresh();
      }
    });
    es.addEventListener('log', refresh);
    es.addEventListener('task_update', refresh);
    es.addEventListener('task_added', refresh);
    es.addEventListener('waiting_for_input', refresh);
    es.addEventListener('paused', refresh);
    es.addEventListener('done', refresh);

    return () => {
      es.close();
    };
  }, [executionId, fetchState]);

  useEffect(() => {
    if (state?.execution?.status !== 'running') return undefined;
    const timer = setInterval(fetchState, 2000);
    return () => clearInterval(timer);
  }, [state?.execution?.status, fetchState]);

  const sendControl = async (action, body = {}) => {
    setActionBusy(action);
    setError('');
    try {
      const { data } = await apiClient.post(`/executions/${executionId}/${action}`, body);
      setState(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  };

  const handleClarifySubmit = async (e) => {
    e.preventDefault();
    const payload = {};
    if (clarificationText.location.trim()) payload.location = clarificationText.location.trim();
    if (clarificationText.event_date.trim()) payload.event_date = clarificationText.event_date.trim();
    await sendControl('clarify', { clarifications: payload });
  };

  if (loading) {
    return (
      <AppLayout>
        <LoadingState message="Connecting to autonomous execution workspace..." />
      </AppLayout>
    );
  }

  if (error && !state) {
    return (
      <AppLayout>
        <ErrorState message={error} onRetry={fetchState} />
      </AppLayout>
    );
  }

  const { execution, goal, tasks = [], logs = [] } = state;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => ['failed', 'interrupted'].includes(t.status));
  const pendingTasks = tasks.filter((t) => ['pending', 'waiting_for_input', 'awaiting_approval'].includes(t.status));
  const currentTask = tasks.find((t) => t.id === execution.current_task_id || t.status === 'running');
  const progressPct = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Goal & Controls Header */}
        <div className="card p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge status={execution.status} />
                <span className="font-mono text-xs text-slate-500">Execution {execution.id.slice(0, 8)}</span>
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">{goal?.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{goal?.description}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {execution.status === 'running' && (
                <button
                  onClick={() => sendControl('pause')}
                  disabled={Boolean(actionBusy)}
                  className="btn-secondary"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
              )}
              {execution.status === 'paused' && (
                <button
                  onClick={() => sendControl('resume')}
                  disabled={Boolean(actionBusy)}
                  className="btn-primary"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </button>
              )}
              {['running', 'paused', 'waiting_for_input'].includes(execution.status) && (
                <button
                  onClick={() => sendControl('stop')}
                  disabled={Boolean(actionBusy)}
                  className="btn-danger"
                >
                  <Square className="h-4 w-4" />
                  Stop Execution
                </button>
              )}
              {failedTasks.length > 0 && execution.status !== 'running' && (
                <button
                  onClick={() => sendControl('retry')}
                  disabled={Boolean(actionBusy)}
                  className="btn-secondary"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry Failed Task
                </button>
              )}
              {['completed', 'failed', 'stopped'].includes(execution.status) && (
                <Link to={`/reports/${execution.id}`} className="btn-primary">
                  <FileBarChart2 className="h-4 w-4" />
                  View Final Report
                </Link>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
              <span>
                Progress: {completedTasks.length} of {tasks.length} tasks completed
              </span>
              <span className="font-mono">{progressPct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Waiting for User Clarification Banner */}
        {execution.status === 'waiting_for_input' && (
          <form onSubmit={handleClarifySubmit} className="card border-amber-300 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="flex-1">
                <h2 className="text-base font-semibold text-amber-950">Agent Requires User Clarification</h2>
                <p className="mt-1 text-sm text-amber-900">
                  {tasks.find((t) => t.status === 'waiting_for_input')?.error_message ||
                    'Please supply the missing event location or date so the agent can proceed safely without guessing.'}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-amber-900">City / Venue Location</label>
                    <input
                      type="text"
                      value={clarificationText.location}
                      onChange={(e) => setClarificationText((p) => ({ ...p, location: e.target.value }))}
                      className="input-field bg-white"
                      placeholder="e.g., Bengaluru"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-amber-900">Event Date (Optional)</label>
                    <input
                      type="date"
                      value={clarificationText.event_date}
                      onChange={(e) => setClarificationText((p) => ({ ...p, event_date: e.target.value }))}
                      className="input-field bg-white"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button type="submit" disabled={Boolean(actionBusy)} className="btn-primary">
                    Submit Clarification & Resume Execution
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Two-column Workspace: Tasks + Live Trace */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Task Status Column */}
          <div className="space-y-4 lg:col-span-5">
            <div className="card p-5">
              <h2 className="text-base font-semibold text-slate-900">Task Status Breakdown</h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <p className="font-mono text-lg font-bold text-emerald-700">{completedTasks.length}</p>
                  <p className="text-emerald-700">Completed</p>
                </div>
                <div className="rounded-lg bg-slate-100 p-2.5">
                  <p className="font-mono text-lg font-bold text-slate-700">{pendingTasks.length}</p>
                  <p className="text-slate-600">Pending/Wait</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2.5">
                  <p className="font-mono text-lg font-bold text-red-700">{failedTasks.length}</p>
                  <p className="text-red-700">Failed/Stop</p>
                </div>
              </div>

              {currentTask && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs">
                  <p className="font-semibold uppercase text-blue-700">Current Active Task</p>
                  <p className="mt-1 font-semibold text-slate-900">{currentTask.title}</p>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">#{task.execution_order}</span>
                        <h3 className="text-sm font-semibold text-slate-900">{task.title}</h3>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <ToolBadge toolName={task.tool_name} />
                      {task.replan_attempts > 0 && (
                        <span className="text-[11px] font-medium text-violet-700">
                          Replanned ({task.replan_attempts}x)
                        </span>
                      )}
                    </div>
                    {task.error_message && (
                      <p className="mt-2 rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                        {task.error_message}
                      </p>
                    )}
                    {task.status === 'failed' && execution.status !== 'running' && (
                      <button
                        type="button"
                        onClick={() => sendControl('retry', { taskId: task.id })}
                        className="btn-secondary mt-2 py-1 text-xs"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry This Task
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live Agent Trace Column */}
          <div className="lg:col-span-7">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-900">Visible Agent Execution Trace</h2>
                </div>
                <span className="font-mono text-xs text-slate-500">{logs.length} real backend events</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Every timestamp, tool call, input payload, and observer verdict is recorded directly from backend execution.
              </p>

              <div className="mt-4 space-y-2.5">
                {logs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">Waiting for agent trace logs...</p>
                ) : (
                  logs.map((log) => <LogEntry key={log.id} log={log} />)
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

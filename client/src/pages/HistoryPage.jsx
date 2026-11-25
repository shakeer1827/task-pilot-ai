import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, ExternalLink, FileBarChart2, Clock } from 'lucide-react';
import { apiClient } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rerunningId, setRerunningId] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/history');
      setHistory(data.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRerun = async (executionId) => {
    setRerunningId(executionId);
    setError('');
    try {
      const { data } = await apiClient.post(`/history/${executionId}/rerun`);
      navigate(`/plans/${data.plan.id}`);
    } catch (err) {
      setError(err.message);
      setRerunningId('');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Execution & Task History</h1>
            <p className="mt-1 text-sm text-slate-600">
              Audit past autonomous runs, inspect logs, review final reports, or rerun goals safely as new versions.
            </p>
          </div>
          <Link to="/goals/new" className="btn-primary">
            + Create New Goal
          </Link>
        </div>

        {loading ? (
          <LoadingState message="Loading execution history..." />
        ) : error ? (
          <ErrorState message={error} onRetry={loadHistory} />
        ) : history.length === 0 ? (
          <EmptyState
            title="No execution history yet"
            description="Once you approve and execute a goal plan, every run and its agent logs are preserved here."
            action={
              <Link to="/goals/new" className="btn-primary">
                Create a Goal
              </Link>
            }
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">Goal</th>
                    <th className="px-5 py-3.5 font-semibold">Created</th>
                    <th className="px-5 py-3.5 font-semibold">Status</th>
                    <th className="px-5 py-3.5 font-semibold">Completed / Failed</th>
                    <th className="px-5 py-3.5 font-semibold">Duration</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{item.goal_title}</p>
                        <p className="text-xs text-slate-500">
                          Plan v{item.plan_version}
                          {item.goal_location ? ` • ${item.goal_location}` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <span className="font-semibold text-emerald-700">{item.completed_tasks} completed</span>
                        <span className="mx-1.5 text-slate-300">/</span>
                        <span className="font-semibold text-red-600">{item.failed_tasks} failed</span>
                        <span className="ml-1 text-slate-400">({item.total_tasks} total)</span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatDuration(item.duration_ms)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <Link
                            to={`/executions/${item.id}`}
                            className="btn-secondary px-2.5 py-1.5 text-xs"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Trace
                          </Link>
                          <Link
                            to={`/reports/${item.id}`}
                            className="btn-secondary px-2.5 py-1.5 text-xs"
                          >
                            <FileBarChart2 className="h-3.5 w-3.5" />
                            Report
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleRerun(item.id)}
                            disabled={rerunningId === item.id}
                            className="btn-secondary px-2.5 py-1.5 text-xs"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${rerunningId === item.id ? 'animate-spin' : ''}`} />
                            Rerun
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

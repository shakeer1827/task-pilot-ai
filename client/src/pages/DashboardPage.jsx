import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusCircle,
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Activity,
  History,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from '../components/AppLayout';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/dashboard');
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = data?.stats || {
    totalPlans: 0,
    completedTasks: 0,
    pendingTasks: 0,
    failedTasks: 0,
  };

  const chartData = [
    { name: 'Completed', count: stats.completedTasks },
    { name: 'Pending', count: stats.pendingTasks },
    { name: 'Failed', count: stats.failedTasks },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="card flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back, {user?.name?.split(' ')[0]}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Give a goal and watch your autonomous agents plan, verify, adapt, and report.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/history" className="btn-secondary">
              <History className="h-4 w-4" />
              View History
            </Link>
            <Link to="/goals/new" className="btn-primary">
              <PlusCircle className="h-4 w-4" />
              Create New Goal
            </Link>
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading live workspace metrics from database..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchDashboard} />
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Plans</span>
                  <Layers className="h-4 w-4 text-blue-600" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">{stats.totalPlans}</p>
                <p className="mt-1 text-xs text-slate-500">{stats.totalGoals || 0} goals created</p>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Completed Tasks</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">{stats.completedTasks}</p>
                <p className="mt-1 text-xs text-slate-500">Verified by Observer agent</p>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Tasks</span>
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">{stats.pendingTasks}</p>
                <p className="mt-1 text-xs text-slate-500">Awaiting approval, run, or input</p>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Failed Tasks</span>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">{stats.failedTasks}</p>
                <p className="mt-1 text-xs text-slate-500">Trackable & retryable</p>
              </div>
            </div>

            {/* Chart + Quick Plans */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="card p-6 lg:col-span-5">
                <h2 className="text-base font-semibold text-slate-900">Task Outcomes Breakdown</h2>
                <p className="mt-0.5 text-xs text-slate-500">Aggregated directly from persisted task records</p>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card p-6 lg:col-span-7">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Quick Access to Plans</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Open, edit, or approve your recent plans</p>
                  </div>
                  <Link to="/goals/new" className="text-xs font-semibold text-blue-600 hover:underline">
                    + New Goal
                  </Link>
                </div>

                {data?.recentPlans?.length > 0 ? (
                  <div className="mt-4 divide-y divide-slate-100">
                    {data.recentPlans.map((plan) => (
                      <div key={plan.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/plans/${plan.id}`}
                            className="truncate text-sm font-medium text-slate-900 hover:text-blue-600"
                          >
                            {plan.goal_title}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-500">
                            v{plan.version} • {plan.task_count} tasks • {new Date(plan.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={plan.approval_status} />
                          <Link to={`/plans/${plan.id}`} className="btn-secondary px-2.5 py-1.5 text-xs">
                            Open
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      title="No plans generated yet"
                      description="Create your first goal to generate an editable autonomous execution plan."
                      action={
                        <Link to="/goals/new" className="btn-primary">
                          Create First Goal
                        </Link>
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Recent Executions + Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="card p-6 lg:col-span-7">
                <h2 className="text-base font-semibold text-slate-900">Recent Executions</h2>
                {data?.recentExecutions?.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                          <th className="pb-2 font-medium">Goal</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Tasks</th>
                          <th className="pb-2 font-medium text-right">Workspace</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recentExecutions.map((ex) => (
                          <tr key={ex.id}>
                            <td className="py-3 pr-3">
                              <p className="font-medium text-slate-900">{ex.goal_title}</p>
                              <p className="text-xs text-slate-500">{new Date(ex.created_at).toLocaleString()}</p>
                            </td>
                            <td className="py-3 pr-3">
                              <StatusBadge status={ex.status} />
                            </td>
                            <td className="py-3 pr-3 text-xs text-slate-600">
                              {ex.completed_count}/{ex.total_tasks} done
                              {ex.failed_count > 0 && (
                                <span className="ml-1.5 text-red-600">({ex.failed_count} failed)</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <Link
                                to={`/executions/${ex.id}`}
                                className="text-xs font-semibold text-blue-600 hover:underline"
                              >
                                Inspect →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No executions run yet.</p>
                )}
              </div>

              <div className="card p-6 lg:col-span-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-600" />
                  <h2 className="text-base font-semibold text-slate-900">Recent Agent Activity</h2>
                </div>
                {data?.recentActivity?.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {data.recentActivity.slice(0, 6).map((log) => (
                      <div key={log.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{log.agent_name}</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-600">{log.action}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Agent trace events will appear here during execution.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

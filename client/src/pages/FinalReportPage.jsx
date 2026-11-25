import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  UserCheck,
  CloudSun,
  IndianRupee,
  Wrench,
  ArrowLeft,
  Printer,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { apiClient } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState } from '../components/States';

export default function FinalReportPage() {
  const { executionId } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/reports/${executionId}`);
      setPayload(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <AppLayout>
        <LoadingState message="Compiling verified final report..." />
      </AppLayout>
    );
  }

  if (error || !payload?.report) {
    return (
      <AppLayout>
        <ErrorState message={error || 'Report unavailable.'} onRetry={loadReport} />
      </AppLayout>
    );
  }

  const { report, execution } = payload;
  const budget = report.budgetSummary;
  const weather = report.weatherFindings;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={`/executions/${executionId}`} className="btn-secondary py-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Execution Trace
          </Link>
          <button type="button" onClick={() => window.print()} className="btn-secondary py-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />
            Print / Save PDF
          </button>
        </div>

        {/* Executive Summary */}
        <div className="card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Final Execution Report
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{report.originalGoal?.title}</h1>
            </div>
            <StatusBadge status={execution.status} />
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-700">{report.executionSummary?.narrative}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Completed</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {report.executionSummary?.completedCount}/{report.executionSummary?.totalTasks}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Failed</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{report.executionSummary?.failedCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Human Action Required</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">
                {report.tasksRequiringUserAction?.length || 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Duration</p>
              <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                {report.executionSummary?.durationMs != null
                  ? `${(report.executionSummary.durationMs / 1000).toFixed(2)}s`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Budget + Weather Grid */}
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="card p-6 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-violet-600" />
                <h2 className="text-base font-semibold text-slate-900">Budget Summary</h2>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Costs marked as Estimates unless quoted
              </span>
            </div>

            {budget ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Budget Limit</p>
                    <p className="font-bold text-slate-900">
                      {budget.currency} {Number(budget.totalBudget).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Estimated Total</p>
                    <p className="font-bold text-slate-900">
                      {budget.currency} {Number(budget.totalEstimated).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Remaining</p>
                    <p className={`font-bold ${budget.remainingBudget < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {budget.currency} {Number(budget.remainingBudget).toLocaleString()}
                    </p>
                  </div>
                </div>

                {budget.categoryBreakdown?.length > 0 && (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={budget.categoryBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                        <Tooltip />
                        <Bar dataKey="amount" fill="#6D28D9" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No budget calculation data was recorded in this execution.</p>
            )}
          </div>

          <div className="card p-6 lg:col-span-5">
            <div className="flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-sky-600" />
              <h2 className="text-base font-semibold text-slate-900">Weather Findings</h2>
            </div>

            {weather ? (
              weather.note ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {weather.note}
                </div>
              ) : weather.forecastAvailable === false ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Forecast unavailable for {weather.eventDate} ({weather.daysAhead} days ahead; Open-Meteo supports up to 16 days). Check again closer to the event.
                </div>
              ) : (
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3.5">
                    <p className="text-xs text-slate-500">Location & Date</p>
                    <p className="font-semibold text-slate-900">
                      {weather.resolvedLocation} • {weather.forecastDate}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Condition</p>
                      <p className="font-semibold text-slate-900">{weather.condition}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Temperature</p>
                      <p className="font-semibold text-slate-900">
                        {weather.temperatureMinC}°C – {weather.temperatureMaxC}°C
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Rain Probability</p>
                      <p className="font-semibold text-slate-900">{weather.precipitationProbabilityPct}%</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Outdoor Risk</p>
                      <p className="font-semibold uppercase text-slate-900">{weather.outdoorRisk}</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <p className="mt-4 text-sm text-slate-500">Weather verification was not completed in this run.</p>
            )}
          </div>
        </div>

        {/* Completed, Failed, Human Action */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <h2 className="text-base font-semibold text-slate-900">Tasks Completed</h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {report.tasksCompleted?.length > 0 ? (
                report.tasksCompleted.map((t) => (
                  <li key={t.id} className="rounded-lg bg-emerald-50/70 p-3">
                    <p className="font-medium text-slate-900">{t.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{t.resultSummary}</p>
                  </li>
                ))
              ) : (
                <li className="text-slate-500">No tasks completed.</li>
              )}
            </ul>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <h2 className="text-base font-semibold text-slate-900">Failed & Incomplete Work</h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {report.incompleteWork?.length > 0 ? (
                report.incompleteWork.map((t) => (
                  <li key={t.id} className="rounded-lg bg-red-50/70 p-3">
                    <p className="font-medium text-slate-900">{t.title}</p>
                    <p className="mt-0.5 text-xs text-red-700">
                      [{t.status}] {t.reason}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-slate-500">All planned tasks finished without unresolved failures.</li>
              )}
            </ul>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 text-amber-700">
              <UserCheck className="h-4 w-4" />
              <h2 className="text-base font-semibold text-slate-900">Requires Human Action</h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {report.tasksRequiringUserAction?.length > 0 ? (
                report.tasksRequiringUserAction.map((t) => (
                  <li key={t.id} className="rounded-lg bg-amber-50/70 p-3">
                    <p className="font-medium text-slate-900">{t.title}</p>
                    <p className="mt-0.5 text-xs text-amber-900">{t.reason}</p>
                  </li>
                ))
              ) : (
                <li className="text-slate-500">No additional human actions flagged.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Tools, Observations, Next Steps */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-semibold text-slate-900">Tools Invoked</h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {report.toolsUsed?.map((t) => (
                <li key={t.tool} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">{t.tool}</span>
                  <span className="text-xs text-slate-500">{t.calls} call(s)</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Important Observations</h2>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-700">
              {report.importantObservations?.length > 0 ? (
                report.importantObservations.map((obs, idx) => <li key={idx}>{obs}</li>)
              ) : (
                <li>No anomalies detected.</li>
              )}
            </ul>
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Suggested Next Steps</h2>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-700">
              {report.suggestedNextSteps?.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

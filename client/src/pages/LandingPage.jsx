import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  ArrowRight,
  CheckCircle2,
  CloudSun,
  Calculator,
  Database,
  RefreshCw,
  ShieldCheck,
  ListChecks,
  Terminal,
  FileBarChart2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Bot className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              TaskPilot <span className="text-blue-600">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#how-it-works" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:inline">
              How It Works
            </a>
            {user ? (
              <Link to="/dashboard" className="btn-primary">
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  Login
                </Link>
                <Link to="/register" className="btn-primary">
                  Start Planning
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-slate-200 bg-slate-50/70 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Autonomous Task Agents • Built for Student Clubs & Teams
              </span>
              <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Turn Your Goals Into Completed Work.
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Give a goal. Watch your agent make it happen. TaskPilot AI turns high-level event goals into
                editable execution plans, invokes real weather and budget tools, observes failures, replans
                autonomously, and delivers a verified final report.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to={user ? '/goals/new' : '/register'} className="btn-primary px-6 py-3 text-base">
                  Start Planning
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#how-it-works" className="btn-secondary px-6 py-3 text-base">
                  See How It Works
                </a>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4 text-sm text-slate-600 sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  Human Plan Approval
                </div>
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-violet-600" />
                  Live Agent Trace
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-emerald-600" />
                  Bounded Auto-Replan
                </div>
              </div>
            </div>

            {/* Sample Live Execution Preview Card */}
            <div className="lg:col-span-5">
              <div className="card overflow-hidden border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-900 px-5 py-3.5 text-white">
                  <p className="text-xs font-medium text-slate-400">EXAMPLE AUTONOMOUS TRACE</p>
                  <p className="mt-0.5 text-sm font-semibold">
                    “Organize a college cultural event for 200 students next Saturday with a budget of ₹50,000.”
                  </p>
                </div>
                <div className="space-y-3 p-5 font-mono text-xs">
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800">Planner</span>
                    <span>Detected missing city location; generated 6 ordered tasks.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">Approved</span>
                    <span>User edited & approved execution plan.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">Tool</span>
                    <span>Open-Meteo Weather API → Verified forecast & outdoor risk.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800">Tool</span>
                    <span>Budget Calculator → Itemized estimate within ₹50,000 limit.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Observer</span>
                    <span>Flagged vendor bookings as Human Action Required.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-slate-700">
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 font-semibold text-white">Reporter</span>
                    <span>Saved execution history & generated final report.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Genuine Multi-Agent Execution, Not Simulated Chat
            </h2>
            <p className="mt-3 text-slate-600">
              Every step passes through a backend-controlled Planner → Executor → Observer → Replanner → Reporter loop.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ListChecks className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">Structured Planning</h3>
              <p className="mt-2 text-sm text-slate-600">
                Breaks goals into ordered tasks with dependencies, detects missing info, and requires your approval
                before running.
              </p>
            </div>

            <div className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <CloudSun className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">Real Open-Meteo API</h3>
              <p className="mt-2 text-sm text-slate-600">
                Geocodes your venue and retrieves live weather forecasts to assess outdoor rain, heat, or wind risks.
              </p>
            </div>

            <div className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Calculator className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">Budget & Overrun Guard</h3>
              <p className="mt-2 text-sm text-slate-600">
                Calculates category estimates, detects budget overruns, and automatically triggers cost-reduction
                replanning.
              </p>
            </div>

            <div className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <RefreshCw className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">Bounded Replanning</h3>
              <p className="mt-2 text-sm text-slate-600">
                Diagnoses tool failures, switches to indoor contingencies, pauses for clarification, and caps retries at
                2 attempts.
              </p>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900">End-to-End Autonomous Workflow</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { step: '01', title: 'Goal & Gap Check', desc: 'Submit goal; agent flags missing city, date, or budget.' },
                { step: '02', title: 'Edit & Approve', desc: 'Reorder, edit, or add tasks before approving execution.' },
                { step: '03', title: 'Live Tool Execution', desc: 'Backend invokes Open-Meteo, Budget Calculator & DB.' },
                { step: '04', title: 'Observe & Replan', desc: 'Detects overruns or API failures and adapts safely.' },
                { step: '05', title: 'Verified Report', desc: 'Clearly separates completed work from human actions.' },
              ].map((item) => (
                <div key={item.step} className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-mono text-xs font-semibold text-blue-600">STEP {item.step}</span>
                  <h4 className="mt-1.5 text-sm font-semibold text-slate-900">{item.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-400" />
            <span>TaskPilot AI — Autonomous Task Agents</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Verified Tool Calls
            </span>
            <span className="inline-flex items-center gap-1">
              <FileBarChart2 className="h-4 w-4 text-blue-600" /> Auditable Reports
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

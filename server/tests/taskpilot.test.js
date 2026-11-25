import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Ensure test mode uses heuristic planner cleanly without inventing Gemini credentials
process.env.NODE_ENV = 'test';
process.env.AI_FALLBACK_MODE = 'heuristic';
process.env.JWT_SECRET = 'test-suite-jwt-secret-minimum-32-characters-long';

const { Repository } = await import('../src/db/repository.js');
const { ExecutionEngine } = await import('../src/services/executionEngine.js');
const { createApp } = await import('../src/app.js');
const { runWeatherTool } = await import('../src/tools/weatherTool.js');
const { runBudgetTool } = await import('../src/tools/budgetTool.js');

async function startTestServer(toolContextOverrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskpilot-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const repository = new Repository({ sqlitePath: dbPath });
  const engine = new ExecutionEngine(repository, { toolContextOverrides });
  const { app } = createApp({ repository, engine });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    repository,
    engine,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      try {
        repository.sqlite?.close();
      } catch {
        // ignore
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function api(baseUrl, route, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

function createMockWeatherFetch({ ok = true, precipProb = 15, tempMax = 28 } = {}) {
  return async (url) => {
    const str = String(url);
    if (!ok) {
      return { ok: false, status: 503, async json() { return {}; } };
    }
    if (str.includes('geocoding-api.open-meteo.com')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              {
                name: 'Bengaluru',
                admin1: 'Karnataka',
                country: 'India',
                latitude: 12.9716,
                longitude: 77.5946,
                timezone: 'Asia/Kolkata',
              },
            ],
          };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        const targetDate = new URL(str).searchParams.get('start_date') || '2026-11-28';
        return {
          timezone: 'Asia/Kolkata',
          daily: {
            time: [targetDate],
            weather_code: [precipProb >= 50 ? 63 : 1],
            temperature_2m_max: [tempMax],
            temperature_2m_min: [19],
            precipitation_probability_max: [precipProb],
            precipitation_sum: [precipProb >= 50 ? 8.4 : 0],
            wind_speed_10m_max: [14],
          },
        };
      },
    };
  };
}

describe('TaskPilot AI Tools', () => {
  test('Weather tool rejects unclear location and out-of-range dates without inventing data', async () => {
    const unclear = await runWeatherTool({ location: 'TBD' });
    assert.equal(unclear.ok, false);
    assert.equal(unclear.requiresUserInput, true);
    assert.equal(unclear.errorCode, 'UNCLEAR_LOCATION');

    const now = new Date('2026-11-25T00:00:00Z');
    const farFuture = await runWeatherTool(
      { location: 'Bengaluru', event_date: '2026-12-30' },
      { nowDate: now }
    );
    assert.equal(farFuture.ok, false);
    assert.equal(farFuture.errorCode, 'FORECAST_OUT_OF_RANGE');
    assert.equal(farFuture.data.forecastAvailable, false);
  });

  test('Weather tool parses valid Open-Meteo response and evaluates outdoor risk', async () => {
    const now = new Date('2026-11-25T00:00:00Z');
    const res = await runWeatherTool(
      { location: 'Bengaluru', event_date: '2026-11-28' },
      { nowDate: now, fetchImpl: createMockWeatherFetch({ ok: true, precipProb: 75 }) }
    );
    assert.equal(res.ok, true);
    assert.equal(res.data.outdoorRisk, 'high');
    assert.equal(res.data.contingencyRequired, true);
  });

  test('Budget calculator detects overrun and computes remaining budget accurately', async () => {
    const over = await runBudgetTool({
      totalBudget: 25000,
      participants: 200,
      currency: 'INR',
    });
    assert.equal(over.ok, false);
    assert.equal(over.errorCode, 'BUDGET_OVERRUN');
    assert.equal(over.data.isOverBudget, true);
    assert.ok(over.data.overrunAmount > 0);

    const within = await runBudgetTool({
      totalBudget: 80000,
      participants: 200,
      currency: 'INR',
    });
    assert.equal(within.ok, true);
    assert.equal(within.data.isOverBudget, false);
    assert.ok(within.data.remainingBudget > 0);
  });
});

describe('TaskPilot AI End-to-End API & Autonomous Agent Flows', () => {
  let ctx;

  before(async () => {
    ctx = await startTestServer({
      fetchImpl: createMockWeatherFetch({ ok: true, precipProb: 15 }),
      nowDate: new Date('2026-11-25T00:00:00Z'),
    });
  });

  after(async () => {
    await ctx.close();
  });

  test('Auth, protected routes, user isolation, plan approval gate, full execution, history & rerun', async () => {
    // 1. Protected route rejects unauthenticated access
    const unauth = await api(ctx.baseUrl, '/api/dashboard');
    assert.equal(unauth.status, 401);

    // 2. Register User A and User B
    const regA = await api(ctx.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Alice', email: 'alice@college.edu', password: 'Password123!' },
    });
    assert.equal(regA.status, 201);
    assert.ok(regA.data.token);

    const regB = await api(ctx.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Bob', email: 'bob@college.edu', password: 'Password123!' },
    });
    assert.equal(regB.status, 201);

    // Invalid login fails
    const badLogin = await api(ctx.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@college.edu', password: 'WrongPassword' },
    });
    assert.equal(badLogin.status, 401);

    // 3. Create sample goal as Alice
    const goalRes = await api(ctx.baseUrl, '/api/goals', {
      method: 'POST',
      token: regA.data.token,
      body: {
        title: 'College Cultural Event',
        description: 'Organize a college cultural event for 200 students next Saturday with a budget of ₹50,000.',
        location: 'Bengaluru',
        event_date: '2026-11-28',
        budget: 50000,
        participants: 200,
      },
    });
    assert.equal(goalRes.status, 201);
    const goalId = goalRes.data.goal.id;

    // Bob cannot access Alice's goal
    const bobRead = await api(ctx.baseUrl, `/api/goals/${goalId}`, {
      token: regB.data.token,
    });
    assert.equal(bobRead.status, 404);

    // 4. Generate plan
    const planRes = await api(ctx.baseUrl, '/api/plans/generate', {
      method: 'POST',
      token: regA.data.token,
      body: { goalId },
    });
    assert.equal(planRes.status, 201);
    const planId = planRes.data.plan.id;
    assert.ok(planRes.data.tasks.length >= 4);

    // 5. Execution blocked before approval
    const blockedStart = await api(ctx.baseUrl, '/api/executions/start', {
      method: 'POST',
      token: regA.data.token,
      body: { planId, waitForCompletion: true },
    });
    assert.equal(blockedStart.status, 400);

    // 6. Edit plan (update title of task 1)
    const editedTasks = planRes.data.tasks.map((t, idx) =>
      idx === 0 ? { ...t, title: 'Verify Bengaluru Saturday Weather' } : t
    );
    const editRes = await api(ctx.baseUrl, `/api/plans/${planId}`, {
      method: 'PUT',
      token: regA.data.token,
      body: { tasks: editedTasks },
    });
    assert.equal(editRes.status, 200);
    assert.equal(editRes.data.tasks[0].title, 'Verify Bengaluru Saturday Weather');

    // 7. Approve plan & execute to completion
    const approveRes = await api(ctx.baseUrl, `/api/plans/${planId}/approve`, {
      method: 'POST',
      token: regA.data.token,
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.plan.approval_status, 'approved');

    const execRes = await api(ctx.baseUrl, '/api/executions/start', {
      method: 'POST',
      token: regA.data.token,
      body: { planId, waitForCompletion: true },
    });
    assert.equal(execRes.status, 201);
    assert.equal(execRes.data.execution.status, 'completed');
    assert.ok(execRes.data.logs.length >= 10);
    assert.ok(execRes.data.execution.final_report);

    // 8. Report & History & Rerun
    const reportRes = await api(ctx.baseUrl, `/api/reports/${execRes.data.execution.id}`, {
      token: regA.data.token,
    });
    assert.equal(reportRes.status, 200);
    assert.ok(reportRes.data.report.weatherFindings);
    assert.ok(reportRes.data.report.budgetSummary);

    const historyRes = await api(ctx.baseUrl, '/api/history', { token: regA.data.token });
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.data.history.length, 1);

    const rerunRes = await api(ctx.baseUrl, `/api/history/${execRes.data.execution.id}/rerun`, {
      method: 'POST',
      token: regA.data.token,
    });
    assert.equal(rerunRes.status, 201);
    assert.equal(rerunRes.data.plan.version, 2);
  });

  test('Scenario 1 & 2: Weather API error triggers contingency replan + Budget overrun triggers cost scaling', async () => {
    const failingCtx = await startTestServer({
      fetchImpl: createMockWeatherFetch({ ok: false }),
      nowDate: new Date('2026-11-25T00:00:00Z'),
    });

    try {
      const reg = await api(failingCtx.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'Replan Tester', email: 'replan@college.edu', password: 'Password123!' },
      });
      const token = reg.data.token;

      // Low budget (30,000 for 200 students -> triggers BUDGET_OVERRUN -> Replanner scales down)
      const goalRes = await api(failingCtx.baseUrl, '/api/goals', {
        method: 'POST',
        token,
        body: {
          title: 'Low Budget Fest',
          description: 'College cultural fest for 200 students in Bengaluru with tight budget of 30000.',
          location: 'Bengaluru',
          event_date: '2026-11-28',
          budget: 30000,
          participants: 200,
        },
      });
      const planRes = await api(failingCtx.baseUrl, '/api/plans/generate', {
        method: 'POST',
        token,
        body: { goalId: goalRes.data.goal.id },
      });
      const planId = planRes.data.plan.id;

      await api(failingCtx.baseUrl, `/api/plans/${planId}/approve`, { method: 'POST', token });
      const execRes = await api(failingCtx.baseUrl, '/api/executions/start', {
        method: 'POST',
        token,
        body: { planId, waitForCompletion: true },
      });

      assert.equal(execRes.status, 201);
      // Weather task failed & inserted contingency task; independent budget task detected overrun, replanned, and succeeded
      const budgetTask = execRes.data.tasks.find((t) => t.tool_name === 'budget_calculator');
      assert.equal(budgetTask.status, 'completed');
      assert.ok(budgetTask.replan_attempts >= 1);
      assert.equal(budgetTask.result.data.isOverBudget, false);

      const weatherTask = execRes.data.tasks.find((t) => t.tool_name === 'weather_forecast');
      assert.equal(weatherTask.status, 'failed');

      const contingencyInserted = execRes.data.tasks.find((t) =>
        t.title.toLowerCase().includes('fallback indoor contingency')
      );
      assert.ok(contingencyInserted);
      assert.equal(contingencyInserted.status, 'completed');
    } finally {
      await failingCtx.close();
    }
  });

  test('Scenario 3: Unclear location pauses in waiting_for_input and resumes on clarification', async () => {
    const reg = await api(ctx.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Clarify Tester', email: 'clarify@college.edu', password: 'Password123!' },
    });
    const token = reg.data.token;

    const goalRes = await api(ctx.baseUrl, '/api/goals', {
      method: 'POST',
      token,
      body: {
        title: 'Tech Meetup',
        description: 'Organize a student tech meetup for 80 attendees with budget ₹40,000.',
        location: 'TBD',
        event_date: '2026-11-28',
        budget: 40000,
        participants: 80,
      },
    });
    const planRes = await api(ctx.baseUrl, '/api/plans/generate', {
      method: 'POST',
      token,
      body: { goalId: goalRes.data.goal.id },
    });
    const planId = planRes.data.plan.id;
    await api(ctx.baseUrl, `/api/plans/${planId}/approve`, { method: 'POST', token });

    const execRes = await api(ctx.baseUrl, '/api/executions/start', {
      method: 'POST',
      token,
      body: { planId, waitForCompletion: true },
    });
    assert.equal(execRes.data.execution.status, 'waiting_for_input');

    const resumed = await api(ctx.baseUrl, `/api/executions/${execRes.data.execution.id}/clarify`, {
      method: 'POST',
      token,
      body: { clarifications: { location: 'Bengaluru' }, waitForCompletion: true },
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.execution.status, 'completed');
  });

  test('Scenario 4 & 5: Database failure is reported honestly and Stop halts execution safely', async () => {
    const dbFailCtx = await startTestServer({
      fetchImpl: createMockWeatherFetch({ ok: true, precipProb: 10 }),
      nowDate: new Date('2026-11-25T00:00:00Z'),
      simulateDbFailure: true,
    });

    try {
      const reg = await api(dbFailCtx.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { name: 'DB Fail Tester', email: 'dbfail@college.edu', password: 'Password123!' },
      });
      const token = reg.data.token;

      const goalRes = await api(dbFailCtx.baseUrl, '/api/goals', {
        method: 'POST',
        token,
        body: {
          title: 'DB Resilience Test',
          description: 'Plan a workshop in Bengaluru for 100 students with budget ₹45,000.',
          location: 'Bengaluru',
          event_date: '2026-11-28',
          budget: 45000,
          participants: 100,
        },
      });
      const planRes = await api(dbFailCtx.baseUrl, '/api/plans/generate', {
        method: 'POST',
        token,
        body: { goalId: goalRes.data.goal.id },
      });
      const planId = planRes.data.plan.id;
      await api(dbFailCtx.baseUrl, `/api/plans/${planId}/approve`, { method: 'POST', token });

      const execRes = await api(dbFailCtx.baseUrl, '/api/executions/start', {
        method: 'POST',
        token,
        body: { planId, waitForCompletion: true },
      });
      const dbTask = execRes.data.tasks.find((t) => t.tool_name === 'database_save');
      assert.equal(dbTask.status, 'failed');
      assert.match(dbTask.error_message, /Simulated database write failure/i);

      // Test Stop Execution flow on a paused/waiting execution
      const goal2 = await api(dbFailCtx.baseUrl, '/api/goals', {
        method: 'POST',
        token,
        body: {
          title: 'Stop Test',
          description: 'Plan a hackathon for 100 students with budget ₹40,000.',
          location: 'TBD',
          event_date: '2026-11-28',
          budget: 40000,
          participants: 100,
        },
      });
      const plan2 = await api(dbFailCtx.baseUrl, '/api/plans/generate', {
        method: 'POST',
        token,
        body: { goalId: goal2.data.goal.id },
      });
      await api(dbFailCtx.baseUrl, `/api/plans/${plan2.data.plan.id}/approve`, { method: 'POST', token });
      const exec2 = await api(dbFailCtx.baseUrl, '/api/executions/start', {
        method: 'POST',
        token,
        body: { planId: plan2.data.plan.id, waitForCompletion: true },
      });
      assert.equal(exec2.data.execution.status, 'waiting_for_input');

      const stopped = await api(dbFailCtx.baseUrl, `/api/executions/${exec2.data.execution.id}/stop`, {
        method: 'POST',
        token,
      });
      assert.equal(stopped.status, 200);
      assert.equal(stopped.data.execution.status, 'stopped');
      assert.ok(stopped.data.execution.final_report);
    } finally {
      await dbFailCtx.close();
    }
  });
});

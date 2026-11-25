import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class SqliteRepository {
  constructor(dbPath) {
    this.mode = 'local_sqlite';
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        event_date TEXT NULL,
        location TEXT NULL,
        budget REAL NULL,
        participants INTEGER NULL,
        additional_instructions TEXT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        plan_json TEXT NOT NULL DEFAULT '{}',
        missing_info_json TEXT NOT NULL DEFAULT '[]',
        ai_provider TEXT NOT NULL DEFAULT 'gemini',
        approval_status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        execution_order INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        dependencies TEXT NOT NULL DEFAULT '[]',
        tool_name TEXT NOT NULL,
        expected_result TEXT NULL,
        failure_handling TEXT NULL,
        replan_count INTEGER NOT NULL DEFAULT 0,
        result TEXT NULL,
        error_message TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'running',
        current_task_id TEXT NULL REFERENCES tasks(id) ON DELETE SET NULL,
        pause_requested INTEGER NOT NULL DEFAULT 0,
        stop_requested INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT NULL,
        duration_ms INTEGER NULL,
        final_report TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_logs (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_name TEXT NOT NULL,
        action TEXT NOT NULL,
        tool_name TEXT NULL,
        input_json TEXT NULL,
        output_json TEXT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
  }

  _now() {
    return new Date().toISOString();
  }

  _parseJson(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }

  _hydratePlan(row) {
    if (!row) return null;
    return {
      ...row,
      plan_json: this._parseJson(row.plan_json, {}),
      missing_info_json: this._parseJson(row.missing_info_json, []),
    };
  }

  _hydrateTask(row) {
    if (!row) return null;
    return {
      ...row,
      dependencies: this._parseJson(row.dependencies, []),
      result: this._parseJson(row.result, null),
    };
  }

  _hydrateExecution(row) {
    if (!row) return null;
    return {
      ...row,
      pause_requested: Boolean(row.pause_requested),
      stop_requested: Boolean(row.stop_requested),
      final_report: this._parseJson(row.final_report, null),
    };
  }

  _hydrateLog(row) {
    if (!row) return null;
    return {
      ...row,
      input_json: this._parseJson(row.input_json, null),
      output_json: this._parseJson(row.output_json, null),
    };
  }

  async healthCheck() {
    this.db.prepare('SELECT 1 AS ok').get();
    return { ok: true, mode: 'local_sqlite' };
  }

  async createUser({ name, email, passwordHash }) {
    const id = crypto.randomUUID();
    const now = this._now();
    this.db
      .prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, email.toLowerCase(), passwordHash, now);
    return { id, name, email: email.toLowerCase(), created_at: now };
  }

  async findUserByEmail(email) {
    return (
      this.db
        .prepare('SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?')
        .get(email.toLowerCase()) || null
    );
  }

  async findUserById(id) {
    return (
      this.db
        .prepare('SELECT id, name, email, created_at FROM users WHERE id = ?')
        .get(id) || null
    );
  }

  async createGoal(userId, data) {
    const id = crypto.randomUUID();
    const now = this._now();
    this.db
      .prepare(
        `INSERT INTO goals (id, user_id, title, description, event_date, location, budget, participants, additional_instructions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        data.title,
        data.description,
        data.eventDate || null,
        data.location || null,
        data.budget ?? null,
        data.participants ?? null,
        data.additionalInstructions || null,
        now
      );
    return this.getGoalById(userId, id);
  }

  async listGoals(userId) {
    return this.db
      .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);
  }

  async getGoalById(userId, goalId) {
    return (
      this.db
        .prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
        .get(goalId, userId) || null
    );
  }

  async updateGoal(userId, goalId, patch) {
    const existing = await this.getGoalById(userId, goalId);
    if (!existing) return null;
    const next = {
      location: patch.location !== undefined ? patch.location : existing.location,
      event_date: patch.eventDate !== undefined ? patch.eventDate : existing.event_date,
      budget: patch.budget !== undefined ? patch.budget : existing.budget,
      participants: patch.participants !== undefined ? patch.participants : existing.participants,
      additional_instructions:
        patch.additionalInstructions !== undefined
          ? patch.additionalInstructions
          : existing.additional_instructions,
    };
    this.db
      .prepare(
        `UPDATE goals SET location = ?, event_date = ?, budget = ?, participants = ?, additional_instructions = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        next.location,
        next.event_date,
        next.budget,
        next.participants,
        next.additional_instructions,
        goalId,
        userId
      );
    return this.getGoalById(userId, goalId);
  }

  async createPlan(userId, planData, tasksData) {
    const latest = this.db
      .prepare('SELECT MAX(version) AS max_v FROM plans WHERE goal_id = ? AND user_id = ?')
      .get(planData.goalId, userId);
    const nextVersion = (latest?.max_v || 0) + 1;
    const planId = crypto.randomUUID();
    const now = this._now();

    this.db
      .prepare(
        `INSERT INTO plans (id, goal_id, user_id, version, plan_json, missing_info_json, ai_provider, approval_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
      )
      .run(
        planId,
        planData.goalId,
        userId,
        nextVersion,
        JSON.stringify(planData.planJson || {}),
        JSON.stringify(planData.missingInfo || []),
        planData.aiProvider || 'gemini',
        now
      );

    const insertTask = this.db.prepare(
      `INSERT INTO tasks (id, plan_id, user_id, title, description, execution_order, status, dependencies, tool_name, expected_result, failure_handling, replan_count, result, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`
    );

    tasksData.forEach((t, index) => {
      insertTask.run(
        crypto.randomUUID(),
        planId,
        userId,
        t.title,
        t.description,
        t.executionOrder ?? index + 1,
        t.status || 'Pending',
        JSON.stringify(t.dependencies || []),
        t.toolName,
        t.expectedResult || null,
        t.failureHandling || null,
        now,
        now
      );
    });

    return this.getPlanById(userId, planId);
  }

  async getPlanById(userId, planId) {
    const row = this.db
      .prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?')
      .get(planId, userId);
    if (!row) return null;
    const plan = this._hydratePlan(row);
    const taskRows = this.db
      .prepare('SELECT * FROM tasks WHERE plan_id = ? AND user_id = ? ORDER BY execution_order ASC')
      .all(planId, userId);
    const goal = await this.getGoalById(userId, plan.goal_id);
    return {
      ...plan,
      tasks: taskRows.map((t) => this._hydrateTask(t)),
      goal,
    };
  }

  async listPlansByGoal(userId, goalId) {
    const rows = this.db
      .prepare('SELECT * FROM plans WHERE goal_id = ? AND user_id = ? ORDER BY version DESC')
      .all(goalId, userId);
    return rows.map((r) => this._hydratePlan(r));
  }

  async listPlans(userId) {
    const rows = this.db
      .prepare(
        `SELECT p.*, g.title AS g_title, g.description AS g_description, g.event_date AS g_event_date,
                g.location AS g_location, g.budget AS g_budget, g.participants AS g_participants
         FROM plans p
         JOIN goals g ON g.id = p.goal_id
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC`
      )
      .all(userId);
    return rows.map((r) => ({
      ...this._hydratePlan(r),
      goals: {
        id: r.goal_id,
        title: r.g_title,
        description: r.g_description,
        event_date: r.g_event_date,
        location: r.g_location,
        budget: r.g_budget,
        participants: r.g_participants,
      },
    }));
  }

  async updatePlanTasks(userId, planId, tasksData, planJsonPatch) {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) return null;
    const now = this._now();

    this.db.prepare('DELETE FROM tasks WHERE plan_id = ? AND user_id = ?').run(planId, userId);

    const insertTask = this.db.prepare(
      `INSERT INTO tasks (id, plan_id, user_id, title, description, execution_order, status, dependencies, tool_name, expected_result, failure_handling, replan_count, result, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    tasksData.forEach((t, index) => {
      insertTask.run(
        t.id || crypto.randomUUID(),
        planId,
        userId,
        t.title,
        t.description,
        t.executionOrder ?? index + 1,
        t.status || 'Pending',
        JSON.stringify(t.dependencies || []),
        t.toolName,
        t.expectedResult || null,
        t.failureHandling || null,
        t.replanCount ?? 0,
        t.result !== undefined && t.result !== null ? JSON.stringify(t.result) : null,
        t.errorMessage ?? null,
        t.created_at || now,
        now
      );
    });

    if (planJsonPatch) {
      const merged = { ...(plan.plan_json || {}), ...planJsonPatch };
      this.db
        .prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND user_id = ?')
        .run(JSON.stringify(merged), planId, userId);
    }

    return this.getPlanById(userId, planId);
  }

  async approvePlan(userId, planId) {
    const res = this.db
      .prepare("UPDATE plans SET approval_status = 'approved' WHERE id = ? AND user_id = ?")
      .run(planId, userId);
    if (res.changes === 0) return null;
    return this.getPlanById(userId, planId);
  }

  async updateTask(userId, taskId, patch) {
    const existingRow = this.db
      .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
      .get(taskId, userId);
    if (!existingRow) return null;
    const existing = this._hydrateTask(existingRow);

    const next = {
      title: patch.title !== undefined ? patch.title : existing.title,
      description: patch.description !== undefined ? patch.description : existing.description,
      execution_order: patch.executionOrder !== undefined ? patch.executionOrder : existing.execution_order,
      status: patch.status !== undefined ? patch.status : existing.status,
      dependencies: patch.dependencies !== undefined ? patch.dependencies : existing.dependencies,
      tool_name: patch.toolName !== undefined ? patch.toolName : existing.tool_name,
      expected_result: patch.expectedResult !== undefined ? patch.expectedResult : existing.expected_result,
      failure_handling: patch.failureHandling !== undefined ? patch.failureHandling : existing.failure_handling,
      replan_count: patch.replanCount !== undefined ? patch.replanCount : existing.replan_count,
      result: patch.result !== undefined ? patch.result : existing.result,
      error_message: patch.errorMessage !== undefined ? patch.errorMessage : existing.error_message,
      updated_at: this._now(),
    };

    this.db
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, execution_order = ?, status = ?, dependencies = ?,
         tool_name = ?, expected_result = ?, failure_handling = ?, replan_count = ?, result = ?, error_message = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        next.title,
        next.description,
        next.execution_order,
        next.status,
        JSON.stringify(next.dependencies || []),
        next.tool_name,
        next.expected_result,
        next.failure_handling,
        next.replan_count,
        next.result !== undefined && next.result !== null ? JSON.stringify(next.result) : null,
        next.error_message,
        next.updated_at,
        taskId,
        userId
      );

    const updated = this.db
      .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
      .get(taskId, userId);
    return this._hydrateTask(updated);
  }

  async addTaskToPlan(userId, planId, t) {
    const id = crypto.randomUUID();
    const now = this._now();
    this.db
      .prepare(
        `INSERT INTO tasks (id, plan_id, user_id, title, description, execution_order, status, dependencies, tool_name, expected_result, failure_handling, replan_count, result, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
      )
      .run(
        id,
        planId,
        userId,
        t.title,
        t.description,
        t.executionOrder,
        t.status || 'Pending',
        JSON.stringify(t.dependencies || []),
        t.toolName,
        t.expectedResult || null,
        t.failureHandling || null,
        t.replanCount ?? 0,
        now,
        now
      );
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return this._hydrateTask(row);
  }

  async createExecution(userId, { planId, status = 'running' }) {
    const id = crypto.randomUUID();
    const now = this._now();
    this.db
      .prepare(
        `INSERT INTO executions (id, plan_id, user_id, status, pause_requested, stop_requested, started_at)
         VALUES (?, ?, ?, ?, 0, 0, ?)`
      )
      .run(id, planId, userId, status, now);
    const row = this.db.prepare('SELECT * FROM executions WHERE id = ?').get(id);
    return this._hydrateExecution(row);
  }

  async getExecutionById(userId, executionId) {
    const row = this.db
      .prepare('SELECT * FROM executions WHERE id = ? AND user_id = ?')
      .get(executionId, userId);
    if (!row) return null;
    const execution = this._hydrateExecution(row);
    const plan = await this.getPlanById(userId, execution.plan_id);
    const logs = await this.listAgentLogs(userId, executionId);
    return { ...execution, plan, logs };
  }

  async listExecutions(userId) {
    const rows = this.db
      .prepare('SELECT * FROM executions WHERE user_id = ? ORDER BY started_at DESC')
      .all(userId);
    const hydrated = rows.map((r) => this._hydrateExecution(r));
    const enriched = await Promise.all(
      hydrated.map(async (ex) => {
        const plan = await this.getPlanById(userId, ex.plan_id);
        const tasks = plan?.tasks || [];
        return {
          ...ex,
          goal: plan?.goal || null,
          plan_version: plan?.version || 1,
          task_counts: {
            total: tasks.length,
            completed: tasks.filter((t) => t.status === 'Completed').length,
            failed: tasks.filter((t) => t.status === 'Failed').length,
            pending: tasks.filter((t) => t.status === 'Pending').length,
            waiting: tasks.filter((t) => t.status === 'Waiting for input' || t.status === 'Awaiting approval').length,
          },
        };
      })
    );
    return enriched;
  }

  async updateExecution(userId, executionId, patch) {
    const row = this.db
      .prepare('SELECT * FROM executions WHERE id = ? AND user_id = ?')
      .get(executionId, userId);
    if (!row) return null;
    const existing = this._hydrateExecution(row);

    const next = {
      status: patch.status !== undefined ? patch.status : existing.status,
      current_task_id: patch.currentTaskId !== undefined ? patch.currentTaskId : existing.current_task_id,
      pause_requested: patch.pauseRequested !== undefined ? (patch.pauseRequested ? 1 : 0) : (existing.pause_requested ? 1 : 0),
      stop_requested: patch.stopRequested !== undefined ? (patch.stopRequested ? 1 : 0) : (existing.stop_requested ? 1 : 0),
      completed_at: patch.completedAt !== undefined ? patch.completedAt : existing.completed_at,
      duration_ms: patch.durationMs !== undefined ? patch.durationMs : existing.duration_ms,
      final_report: patch.finalReport !== undefined ? patch.finalReport : existing.final_report,
    };

    this.db
      .prepare(
        `UPDATE executions SET status = ?, current_task_id = ?, pause_requested = ?, stop_requested = ?,
         completed_at = ?, duration_ms = ?, final_report = ? WHERE id = ? AND user_id = ?`
      )
      .run(
        next.status,
        next.current_task_id,
        next.pause_requested,
        next.stop_requested,
        next.completed_at,
        next.duration_ms,
        next.final_report !== undefined && next.final_report !== null ? JSON.stringify(next.final_report) : null,
        executionId,
        userId
      );

    const updated = this.db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId);
    return this._hydrateExecution(updated);
  }

  async createAgentLog(userId, log) {
    const id = crypto.randomUUID();
    const now = this._now();
    this.db
      .prepare(
        `INSERT INTO agent_logs (id, execution_id, user_id, agent_name, action, tool_name, input_json, output_json, status, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        log.executionId,
        userId,
        log.agentName,
        log.action,
        log.toolName || null,
        log.inputJson !== undefined && log.inputJson !== null ? JSON.stringify(log.inputJson) : null,
        log.outputJson !== undefined && log.outputJson !== null ? JSON.stringify(log.outputJson) : null,
        log.status,
        log.durationMs ?? 0,
        now
      );
    const row = this.db.prepare('SELECT * FROM agent_logs WHERE id = ?').get(id);
    return this._hydrateLog(row);
  }

  async listAgentLogs(userId, executionId) {
    const rows = this.db
      .prepare('SELECT * FROM agent_logs WHERE execution_id = ? AND user_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(executionId, userId);
    return rows.map((r) => this._hydrateLog(r));
  }

  async getDashboardStats(userId) {
    const plans = this.db
      .prepare('SELECT id, goal_id, approval_status, created_at FROM plans WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);
    const tasks = this.db
      .prepare('SELECT id, status FROM tasks WHERE user_id = ?')
      .all(userId);
    const executions = await this.listExecutions(userId);
    const recentLogRows = this.db
      .prepare('SELECT * FROM agent_logs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 12')
      .all(userId);
    const recentPlans = await this.listPlans(userId);

    return {
      totalPlans: plans.length,
      completedTasks: tasks.filter((t) => t.status === 'Completed').length,
      pendingTasks: tasks.filter((t) => ['Pending', 'Running', 'Waiting for input', 'Awaiting approval'].includes(t.status)).length,
      failedTasks: tasks.filter((t) => t.status === 'Failed').length,
      totalExecutions: executions.length,
      recentExecutions: executions.slice(0, 5),
      recentActivity: recentLogRows.map((r) => this._hydrateLog(r)),
      recentPlans: recentPlans.slice(0, 6),
    };
  }
}

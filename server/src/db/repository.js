import crypto from 'node:crypto';
import { env, isSupabaseConfigured } from '../config/env.js';
import { createSqliteDatabase } from './sqliteClient.js';
import { getSupabaseClient } from './supabaseClient.js';

function nowIso() {
  return new Date().toISOString();
}

function parseJson(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function toJsonString(val, fallback = {}) {
  if (val === undefined || val === null) return JSON.stringify(fallback);
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function mapGoal(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    event_date: row.event_date || null,
    location: row.location || null,
    budget: row.budget !== null && row.budget !== undefined ? Number(row.budget) : null,
    participants: row.participants !== null && row.participants !== undefined ? Number(row.participants) : null,
    additional_instructions: row.additional_instructions || null,
    missing_info_json: parseJson(row.missing_info_json, []),
    clarifications_json: parseJson(row.clarifications_json, {}),
    is_demo: Boolean(row.is_demo),
    created_at: row.created_at,
  };
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    goal_id: row.goal_id,
    user_id: row.user_id,
    version: Number(row.version),
    plan_json: parseJson(row.plan_json, {}),
    approval_status: row.approval_status,
    ai_provider: row.ai_provider || 'gemini',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    execution_order: Number(row.execution_order),
    status: row.status,
    dependencies: parseJson(row.dependencies, []),
    tool_name: row.tool_name || 'none',
    expected_result: row.expected_result || '',
    failure_handling: row.failure_handling || '',
    input_payload: parseJson(row.input_payload, {}),
    result: parseJson(row.result, null),
    error_message: row.error_message || null,
    replan_attempts: Number(row.replan_attempts || 0),
    requires_human_action: Boolean(row.requires_human_action),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapExecution(row) {
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    goal_id: row.goal_id,
    user_id: row.user_id,
    status: row.status,
    current_task_id: row.current_task_id || null,
    stop_requested: Boolean(row.stop_requested),
    pause_requested: Boolean(row.pause_requested),
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    duration_ms: row.duration_ms !== null && row.duration_ms !== undefined ? Number(row.duration_ms) : null,
    final_report: parseJson(row.final_report, null),
    created_at: row.created_at,
  };
}

function mapLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    execution_id: row.execution_id,
    task_id: row.task_id || null,
    user_id: row.user_id,
    agent_name: row.agent_name,
    action: row.action,
    tool_name: row.tool_name || null,
    input_json: parseJson(row.input_json, null),
    output_json: parseJson(row.output_json, null),
    status: row.status,
    duration_ms: row.duration_ms !== null && row.duration_ms !== undefined ? Number(row.duration_ms) : null,
    created_at: row.created_at,
  };
}

export class Repository {
  constructor({ sqlitePath, supabaseClient } = {}) {
    this.supabase = supabaseClient !== undefined ? supabaseClient : getSupabaseClient();
    this.mode = this.supabase ? 'supabase' : 'sqlite';
    this.sqlite = this.supabase ? null : createSqliteDatabase(sqlitePath || env.localDbPath);
  }

  getStorageInfo() {
    return {
      mode: this.mode,
      supabaseConfigured: isSupabaseConfigured(),
    };
  }

  // ---------------- USERS ----------------
  async createUser({ name, email, passwordHash, isDemo = false }) {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const normalizedEmail = email.trim().toLowerCase();

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .insert({ id, name, email: normalizedEmail, password_hash: passwordHash, is_demo: isDemo, created_at: createdAt })
        .select('id, name, email, is_demo, created_at')
        .single();
      if (error) throw new Error(`Supabase createUser failed: ${error.message}`);
      return { ...data, is_demo: Boolean(data.is_demo) };
    }

    this.sqlite
      .prepare('INSERT INTO users (id, name, email, password_hash, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, normalizedEmail, passwordHash, isDemo ? 1 : 0, createdAt);
    return { id, name, email: normalizedEmail, is_demo: isDemo, created_at: createdAt };
  }

  async findUserByEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (error) throw new Error(`Supabase findUserByEmail failed: ${error.message}`);
      return data ? { ...data, is_demo: Boolean(data.is_demo) } : null;
    }

    const row = this.sqlite.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    return row ? { ...row, is_demo: Boolean(row.is_demo) } : null;
  }

  async findUserById(id) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, name, email, is_demo, created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Supabase findUserById failed: ${error.message}`);
      return data ? { ...data, is_demo: Boolean(data.is_demo) } : null;
    }

    const row = this.sqlite.prepare('SELECT id, name, email, is_demo, created_at FROM users WHERE id = ?').get(id);
    return row ? { ...row, is_demo: Boolean(row.is_demo) } : null;
  }

  // ---------------- GOALS ----------------
  async createGoal(userId, payload) {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const record = {
      id,
      user_id: userId,
      title: payload.title,
      description: payload.description,
      event_date: payload.event_date || null,
      location: payload.location || null,
      budget: payload.budget !== undefined && payload.budget !== null ? Number(payload.budget) : null,
      participants: payload.participants !== undefined && payload.participants !== null ? Number(payload.participants) : null,
      additional_instructions: payload.additional_instructions || null,
      missing_info_json: payload.missing_info_json || [],
      clarifications_json: payload.clarifications_json || {},
      is_demo: Boolean(payload.is_demo),
      created_at: createdAt,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('goals').insert(record).select('*').single();
      if (error) throw new Error(`Supabase createGoal failed: ${error.message}`);
      return mapGoal(data);
    }

    this.sqlite
      .prepare(
        `INSERT INTO goals (
          id, user_id, title, description, event_date, location, budget, participants,
          additional_instructions, missing_info_json, clarifications_json, is_demo, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.user_id,
        record.title,
        record.description,
        record.event_date,
        record.location,
        record.budget,
        record.participants,
        record.additional_instructions,
        toJsonString(record.missing_info_json, []),
        toJsonString(record.clarifications_json, {}),
        record.is_demo ? 1 : 0,
        record.created_at
      );

    return mapGoal(record);
  }

  async listGoalsByUser(userId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Supabase listGoalsByUser failed: ${error.message}`);
      return (data || []).map(mapGoal);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);
    return rows.map(mapGoal);
  }

  async getGoalById(userId, goalId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('goals')
        .select('*')
        .eq('id', goalId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Supabase getGoalById failed: ${error.message}`);
      return mapGoal(data);
    }

    const row = this.sqlite
      .prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
      .get(goalId, userId);
    return mapGoal(row);
  }

  async updateGoal(userId, goalId, updates) {
    const existing = await this.getGoalById(userId, goalId);
    if (!existing) return null;

    const merged = {
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      event_date: updates.event_date !== undefined ? updates.event_date : existing.event_date,
      location: updates.location !== undefined ? updates.location : existing.location,
      budget: updates.budget !== undefined ? updates.budget : existing.budget,
      participants: updates.participants !== undefined ? updates.participants : existing.participants,
      additional_instructions:
        updates.additional_instructions !== undefined
          ? updates.additional_instructions
          : existing.additional_instructions,
      missing_info_json:
        updates.missing_info_json !== undefined ? updates.missing_info_json : existing.missing_info_json,
      clarifications_json:
        updates.clarifications_json !== undefined ? updates.clarifications_json : existing.clarifications_json,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('goals')
        .update(merged)
        .eq('id', goalId)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw new Error(`Supabase updateGoal failed: ${error.message}`);
      return mapGoal(data);
    }

    this.sqlite
      .prepare(
        `UPDATE goals SET
          title = ?, description = ?, event_date = ?, location = ?, budget = ?, participants = ?,
          additional_instructions = ?, missing_info_json = ?, clarifications_json = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        merged.title,
        merged.description,
        merged.event_date,
        merged.location,
        merged.budget,
        merged.participants,
        merged.additional_instructions,
        toJsonString(merged.missing_info_json, []),
        toJsonString(merged.clarifications_json, {}),
        goalId,
        userId
      );

    return this.getGoalById(userId, goalId);
  }

  // ---------------- PLANS ----------------
  async createPlan(userId, { goalId, version = 1, planJson = {}, approvalStatus = 'draft', aiProvider = 'gemini' }) {
    const id = crypto.randomUUID();
    const now = nowIso();
    const record = {
      id,
      goal_id: goalId,
      user_id: userId,
      version,
      plan_json: planJson,
      approval_status: approvalStatus,
      ai_provider: aiProvider,
      created_at: now,
      updated_at: now,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('plans').insert(record).select('*').single();
      if (error) throw new Error(`Supabase createPlan failed: ${error.message}`);
      return mapPlan(data);
    }

    this.sqlite
      .prepare(
        `INSERT INTO plans (id, goal_id, user_id, version, plan_json, approval_status, ai_provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.goal_id,
        record.user_id,
        record.version,
        toJsonString(record.plan_json, {}),
        record.approval_status,
        record.ai_provider,
        record.created_at,
        record.updated_at
      );
    return mapPlan(record);
  }

  async getPlanById(userId, planId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Supabase getPlanById failed: ${error.message}`);
      return mapPlan(data);
    }

    const row = this.sqlite.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(planId, userId);
    return mapPlan(row);
  }

  async listPlansByGoal(userId, goalId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('plans')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .order('version', { ascending: false });
      if (error) throw new Error(`Supabase listPlansByGoal failed: ${error.message}`);
      return (data || []).map(mapPlan);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM plans WHERE goal_id = ? AND user_id = ? ORDER BY version DESC')
      .all(goalId, userId);
    return rows.map(mapPlan);
  }

  async listPlansByUser(userId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('plans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Supabase listPlansByUser failed: ${error.message}`);
      return (data || []).map(mapPlan);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);
    return rows.map(mapPlan);
  }

  async updatePlan(userId, planId, updates) {
    const existing = await this.getPlanById(userId, planId);
    if (!existing) return null;

    const now = nowIso();
    const merged = {
      plan_json: updates.plan_json !== undefined ? updates.plan_json : existing.plan_json,
      approval_status: updates.approval_status !== undefined ? updates.approval_status : existing.approval_status,
      ai_provider: updates.ai_provider !== undefined ? updates.ai_provider : existing.ai_provider,
      updated_at: now,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('plans')
        .update(merged)
        .eq('id', planId)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw new Error(`Supabase updatePlan failed: ${error.message}`);
      return mapPlan(data);
    }

    this.sqlite
      .prepare('UPDATE plans SET plan_json = ?, approval_status = ?, ai_provider = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(
        toJsonString(merged.plan_json, {}),
        merged.approval_status,
        merged.ai_provider,
        merged.updated_at,
        planId,
        userId
      );
    return this.getPlanById(userId, planId);
  }

  // ---------------- TASKS ----------------
  async replacePlanTasks(userId, planId, tasksInput) {
    const now = nowIso();
    const records = tasksInput.map((t, index) => ({
      id: t.id || crypto.randomUUID(),
      plan_id: planId,
      user_id: userId,
      title: t.title,
      description: t.description || '',
      execution_order: t.execution_order ?? index + 1,
      status: t.status || 'pending',
      dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
      tool_name: t.tool_name || 'none',
      expected_result: t.expected_result || '',
      failure_handling: t.failure_handling || '',
      input_payload: t.input_payload || {},
      result: t.result ?? null,
      error_message: t.error_message || null,
      replan_attempts: t.replan_attempts ?? 0,
      requires_human_action: Boolean(t.requires_human_action),
      created_at: t.created_at || now,
      updated_at: now,
    }));

    if (this.mode === 'supabase') {
      const { error: delError } = await this.supabase
        .from('tasks')
        .delete()
        .eq('plan_id', planId)
        .eq('user_id', userId);
      if (delError) throw new Error(`Supabase delete tasks failed: ${delError.message}`);

      if (records.length > 0) {
        const { data, error: insError } = await this.supabase.from('tasks').insert(records).select('*');
        if (insError) throw new Error(`Supabase insert tasks failed: ${insError.message}`);
        return (data || []).map(mapTask).sort((a, b) => a.execution_order - b.execution_order);
      }
      return [];
    }

    this.sqlite.prepare('DELETE FROM tasks WHERE plan_id = ? AND user_id = ?').run(planId, userId);
    const stmt = this.sqlite.prepare(
      `INSERT INTO tasks (
        id, plan_id, user_id, title, description, execution_order, status, dependencies,
        tool_name, expected_result, failure_handling, input_payload, result, error_message,
        replan_attempts, requires_human_action, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of records) {
      stmt.run(
        r.id,
        r.plan_id,
        r.user_id,
        r.title,
        r.description,
        r.execution_order,
        r.status,
        toJsonString(r.dependencies, []),
        r.tool_name,
        r.expected_result,
        r.failure_handling,
        toJsonString(r.input_payload, {}),
        r.result !== null ? toJsonString(r.result) : null,
        r.error_message,
        r.replan_attempts,
        r.requires_human_action ? 1 : 0,
        r.created_at,
        r.updated_at
      );
    }
    return this.listTasksByPlan(userId, planId);
  }

  async insertTask(userId, planId, taskInput) {
    const now = nowIso();
    const record = {
      id: taskInput.id || crypto.randomUUID(),
      plan_id: planId,
      user_id: userId,
      title: taskInput.title,
      description: taskInput.description || '',
      execution_order: taskInput.execution_order,
      status: taskInput.status || 'pending',
      dependencies: Array.isArray(taskInput.dependencies) ? taskInput.dependencies : [],
      tool_name: taskInput.tool_name || 'none',
      expected_result: taskInput.expected_result || '',
      failure_handling: taskInput.failure_handling || '',
      input_payload: taskInput.input_payload || {},
      result: taskInput.result ?? null,
      error_message: taskInput.error_message || null,
      replan_attempts: taskInput.replan_attempts ?? 0,
      requires_human_action: Boolean(taskInput.requires_human_action),
      created_at: now,
      updated_at: now,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('tasks').insert(record).select('*').single();
      if (error) throw new Error(`Supabase insertTask failed: ${error.message}`);
      return mapTask(data);
    }

    this.sqlite
      .prepare(
        `INSERT INTO tasks (
          id, plan_id, user_id, title, description, execution_order, status, dependencies,
          tool_name, expected_result, failure_handling, input_payload, result, error_message,
          replan_attempts, requires_human_action, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.plan_id,
        record.user_id,
        record.title,
        record.description,
        record.execution_order,
        record.status,
        toJsonString(record.dependencies, []),
        record.tool_name,
        record.expected_result,
        record.failure_handling,
        toJsonString(record.input_payload, {}),
        record.result !== null ? toJsonString(record.result) : null,
        record.error_message,
        record.replan_attempts,
        record.requires_human_action ? 1 : 0,
        record.created_at,
        record.updated_at
      );

    return mapTask(record);
  }

  async listTasksByPlan(userId, planId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('tasks')
        .select('*')
        .eq('plan_id', planId)
        .eq('user_id', userId)
        .order('execution_order', { ascending: true });
      if (error) throw new Error(`Supabase listTasksByPlan failed: ${error.message}`);
      return (data || []).map(mapTask);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM tasks WHERE plan_id = ? AND user_id = ? ORDER BY execution_order ASC')
      .all(planId, userId);
    return rows.map(mapTask);
  }

  async getTaskById(userId, taskId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Supabase getTaskById failed: ${error.message}`);
      return mapTask(data);
    }

    const row = this.sqlite.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    return mapTask(row);
  }

  async updateTask(userId, taskId, updates) {
    const existing = await this.getTaskById(userId, taskId);
    if (!existing) return null;

    const now = nowIso();
    const merged = {
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      execution_order: updates.execution_order ?? existing.execution_order,
      status: updates.status ?? existing.status,
      dependencies: updates.dependencies ?? existing.dependencies,
      tool_name: updates.tool_name ?? existing.tool_name,
      expected_result: updates.expected_result ?? existing.expected_result,
      failure_handling: updates.failure_handling ?? existing.failure_handling,
      input_payload: updates.input_payload ?? existing.input_payload,
      result: updates.result !== undefined ? updates.result : existing.result,
      error_message: updates.error_message !== undefined ? updates.error_message : existing.error_message,
      replan_attempts: updates.replan_attempts ?? existing.replan_attempts,
      requires_human_action:
        updates.requires_human_action !== undefined
          ? Boolean(updates.requires_human_action)
          : existing.requires_human_action,
      updated_at: now,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('tasks')
        .update(merged)
        .eq('id', taskId)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw new Error(`Supabase updateTask failed: ${error.message}`);
      return mapTask(data);
    }

    this.sqlite
      .prepare(
        `UPDATE tasks SET
          title = ?, description = ?, execution_order = ?, status = ?, dependencies = ?,
          tool_name = ?, expected_result = ?, failure_handling = ?, input_payload = ?,
          result = ?, error_message = ?, replan_attempts = ?, requires_human_action = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        merged.title,
        merged.description,
        merged.execution_order,
        merged.status,
        toJsonString(merged.dependencies, []),
        merged.tool_name,
        merged.expected_result,
        merged.failure_handling,
        toJsonString(merged.input_payload, {}),
        merged.result !== null ? toJsonString(merged.result) : null,
        merged.error_message,
        merged.replan_attempts,
        merged.requires_human_action ? 1 : 0,
        merged.updated_at,
        taskId,
        userId
      );

    return this.getTaskById(userId, taskId);
  }

  // ---------------- EXECUTIONS ----------------
  async createExecution(userId, { planId, goalId, status = 'idle' }) {
    const id = crypto.randomUUID();
    const now = nowIso();
    const record = {
      id,
      plan_id: planId,
      goal_id: goalId,
      user_id: userId,
      status,
      current_task_id: null,
      stop_requested: false,
      pause_requested: false,
      started_at: now,
      completed_at: null,
      duration_ms: null,
      final_report: null,
      created_at: now,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('executions').insert(record).select('*').single();
      if (error) throw new Error(`Supabase createExecution failed: ${error.message}`);
      return mapExecution(data);
    }

    this.sqlite
      .prepare(
        `INSERT INTO executions (
          id, plan_id, goal_id, user_id, status, current_task_id, stop_requested,
          pause_requested, started_at, completed_at, duration_ms, final_report, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.plan_id,
        record.goal_id,
        record.user_id,
        record.status,
        record.current_task_id,
        0,
        0,
        record.started_at,
        record.completed_at,
        record.duration_ms,
        null,
        record.created_at
      );

    return mapExecution(record);
  }

  async getExecutionById(userId, executionId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('executions')
        .select('*')
        .eq('id', executionId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Supabase getExecutionById failed: ${error.message}`);
      return mapExecution(data);
    }

    const row = this.sqlite
      .prepare('SELECT * FROM executions WHERE id = ? AND user_id = ?')
      .get(executionId, userId);
    return mapExecution(row);
  }

  async updateExecution(userId, executionId, updates) {
    const existing = await this.getExecutionById(userId, executionId);
    if (!existing) return null;

    const merged = {
      status: updates.status !== undefined ? updates.status : existing.status,
      current_task_id: updates.current_task_id !== undefined ? updates.current_task_id : existing.current_task_id,
      stop_requested: updates.stop_requested !== undefined ? Boolean(updates.stop_requested) : existing.stop_requested,
      pause_requested: updates.pause_requested !== undefined ? Boolean(updates.pause_requested) : existing.pause_requested,
      started_at: updates.started_at !== undefined ? updates.started_at : existing.started_at,
      completed_at: updates.completed_at !== undefined ? updates.completed_at : existing.completed_at,
      duration_ms: updates.duration_ms !== undefined ? updates.duration_ms : existing.duration_ms,
      final_report: updates.final_report !== undefined ? updates.final_report : existing.final_report,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('executions')
        .update(merged)
        .eq('id', executionId)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw new Error(`Supabase updateExecution failed: ${error.message}`);
      return mapExecution(data);
    }

    this.sqlite
      .prepare(
        `UPDATE executions SET
          status = ?, current_task_id = ?, stop_requested = ?, pause_requested = ?,
          started_at = ?, completed_at = ?, duration_ms = ?, final_report = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        merged.status,
        merged.current_task_id,
        merged.stop_requested ? 1 : 0,
        merged.pause_requested ? 1 : 0,
        merged.started_at,
        merged.completed_at,
        merged.duration_ms,
        merged.final_report !== null ? toJsonString(merged.final_report) : null,
        executionId,
        userId
      );

    return this.getExecutionById(userId, executionId);
  }

  async listExecutionsByUser(userId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('executions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Supabase listExecutionsByUser failed: ${error.message}`);
      return (data || []).map(mapExecution);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM executions WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);
    return rows.map(mapExecution);
  }

  // ---------------- AGENT LOGS ----------------
  async createAgentLog(userId, logInput) {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const record = {
      id,
      execution_id: logInput.execution_id,
      task_id: logInput.task_id || null,
      user_id: userId,
      agent_name: logInput.agent_name,
      action: logInput.action,
      tool_name: logInput.tool_name || null,
      input_json: logInput.input_json ?? null,
      output_json: logInput.output_json ?? null,
      status: logInput.status || 'info',
      duration_ms: logInput.duration_ms !== undefined && logInput.duration_ms !== null ? Number(logInput.duration_ms) : null,
      created_at: createdAt,
    };

    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('agent_logs').insert(record).select('*').single();
      if (error) throw new Error(`Supabase createAgentLog failed: ${error.message}`);
      return mapLog(data);
    }

    this.sqlite
      .prepare(
        `INSERT INTO agent_logs (
          id, execution_id, task_id, user_id, agent_name, action, tool_name,
          input_json, output_json, status, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.execution_id,
        record.task_id,
        record.user_id,
        record.agent_name,
        record.action,
        record.tool_name,
        record.input_json !== null ? toJsonString(record.input_json) : null,
        record.output_json !== null ? toJsonString(record.output_json) : null,
        record.status,
        record.duration_ms,
        record.created_at
      );

    return mapLog(record);
  }

  async listAgentLogsByExecution(userId, executionId) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('agent_logs')
        .select('*')
        .eq('execution_id', executionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Supabase listAgentLogsByExecution failed: ${error.message}`);
      return (data || []).map(mapLog);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM agent_logs WHERE execution_id = ? AND user_id = ? ORDER BY created_at ASC')
      .all(executionId, userId);
    return rows.map(mapLog);
  }

  async listRecentLogsByUser(userId, limit = 15) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('agent_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Supabase listRecentLogsByUser failed: ${error.message}`);
      return (data || []).map(mapLog);
    }

    const rows = this.sqlite
      .prepare('SELECT * FROM agent_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit);
    return rows.map(mapLog);
  }

  // ---------------- DASHBOARD & HISTORY AGGREGATION ----------------
  async getDashboardData(userId) {
    const [goals, plans, executions, recentLogs] = await Promise.all([
      this.listGoalsByUser(userId),
      this.listPlansByUser(userId),
      this.listExecutionsByUser(userId),
      this.listRecentLogsByUser(userId, 12),
    ]);

    const goalMap = new Map(goals.map((g) => [g.id, g]));
    const planMap = new Map(plans.map((p) => [p.id, p]));

    let allTasks = [];
    if (this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('tasks').select('*').eq('user_id', userId);
      if (error) throw new Error(`Supabase listTasksByUser failed: ${error.message}`);
      allTasks = (data || []).map(mapTask);
    } else {
      const rows = this.sqlite.prepare('SELECT * FROM tasks WHERE user_id = ?').all(userId);
      allTasks = rows.map(mapTask);
    }

    const tasksByPlan = new Map();
    for (const task of allTasks) {
      const list = tasksByPlan.get(task.plan_id) || [];
      list.push(task);
      tasksByPlan.set(task.plan_id, list);
    }

    const stats = {
      totalGoals: goals.length,
      totalPlans: plans.length,
      totalExecutions: executions.length,
      completedTasks: allTasks.filter((t) => t.status === 'completed').length,
      pendingTasks: allTasks.filter((t) =>
        ['pending', 'running', 'waiting_for_input', 'awaiting_approval'].includes(t.status)
      ).length,
      failedTasks: allTasks.filter((t) => ['failed', 'interrupted'].includes(t.status)).length,
    };

    const enrichedExecutions = executions.slice(0, 10).map((ex) => {
      const goal = goalMap.get(ex.goal_id);
      const plan = planMap.get(ex.plan_id);
      const tasks = tasksByPlan.get(ex.plan_id) || [];
      return {
        ...ex,
        goal_title: goal?.title || 'Untitled Goal',
        goal_location: goal?.location || null,
        goal_budget: goal?.budget ?? null,
        plan_version: plan?.version || 1,
        completed_count: tasks.filter((t) => t.status === 'completed').length,
        failed_count: tasks.filter((t) => t.status === 'failed').length,
        total_tasks: tasks.length,
      };
    });

    const recentPlans = plans.slice(0, 6).map((p) => {
      const goal = goalMap.get(p.goal_id);
      const tasks = tasksByPlan.get(p.id) || [];
      return {
        ...p,
        goal_title: goal?.title || 'Untitled Goal',
        goal_description: goal?.description || '',
        task_count: tasks.length,
      };
    });

    return {
      stats,
      recentExecutions: enrichedExecutions,
      recentPlans,
      recentActivity: recentLogs,
      storageMode: this.mode,
    };
  }
}

export const defaultRepository = new Repository();

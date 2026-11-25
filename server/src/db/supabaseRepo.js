import { createClient } from '@supabase/supabase-js';

export class SupabaseRepository {
  constructor({ url, serviceRoleKey }) {
    this.mode = 'supabase';
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  _unwrap(res, context) {
    if (res.error) {
      const err = new Error(`Supabase error (${context}): ${res.error.message}`);
      err.code = res.error.code;
      err.status = 500;
      throw err;
    }
    return res.data;
  }

  async healthCheck() {
    const { error } = await this.client.from('users').select('id').limit(1);
    if (error) {
      throw new Error(`Supabase health check failed: ${error.message}`);
    }
    return { ok: true, mode: 'supabase' };
  }

  async createUser({ name, email, passwordHash }) {
    const res = await this.client
      .from('users')
      .insert({ name, email: email.toLowerCase(), password_hash: passwordHash })
      .select('id, name, email, created_at')
      .single();
    return this._unwrap(res, 'createUser');
  }

  async findUserByEmail(email) {
    const res = await this.client
      .from('users')
      .select('id, name, email, password_hash, created_at')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    return this._unwrap(res, 'findUserByEmail');
  }

  async findUserById(id) {
    const res = await this.client
      .from('users')
      .select('id, name, email, created_at')
      .eq('id', id)
      .maybeSingle();
    return this._unwrap(res, 'findUserById');
  }

  async createGoal(userId, data) {
    const res = await this.client
      .from('goals')
      .insert({
        user_id: userId,
        title: data.title,
        description: data.description,
        event_date: data.eventDate || null,
        location: data.location || null,
        budget: data.budget ?? null,
        participants: data.participants ?? null,
        additional_instructions: data.additionalInstructions || null,
      })
      .select('*')
      .single();
    return this._unwrap(res, 'createGoal');
  }

  async listGoals(userId) {
    const res = await this.client
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return this._unwrap(res, 'listGoals');
  }

  async getGoalById(userId, goalId) {
    const res = await this.client
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .eq('user_id', userId)
      .maybeSingle();
    return this._unwrap(res, 'getGoalById');
  }

  async createPlan(userId, planData, tasksData) {
    const existingRes = await this.client
      .from('plans')
      .select('version')
      .eq('goal_id', planData.goalId)
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1);
    const existing = this._unwrap(existingRes, 'createPlan.version');
    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

    const planRes = await this.client
      .from('plans')
      .insert({
        goal_id: planData.goalId,
        user_id: userId,
        version: nextVersion,
        plan_json: planData.planJson,
        missing_info_json: planData.missingInfo || [],
        ai_provider: planData.aiProvider || 'gemini',
        approval_status: 'draft',
      })
      .select('*')
      .single();
    const plan = this._unwrap(planRes, 'createPlan.insert');

    const taskRows = tasksData.map((t, index) => ({
      plan_id: plan.id,
      user_id: userId,
      title: t.title,
      description: t.description,
      execution_order: t.executionOrder ?? index + 1,
      status: t.status || 'Pending',
      dependencies: t.dependencies || [],
      tool_name: t.toolName,
      expected_result: t.expectedResult || null,
      failure_handling: t.failureHandling || null,
      replan_count: 0,
    }));

    let tasks = [];
    if (taskRows.length > 0) {
      const tasksRes = await this.client
        .from('tasks')
        .insert(taskRows)
        .select('*')
        .order('execution_order', { ascending: true });
      tasks = this._unwrap(tasksRes, 'createPlan.insertTasks');
    }

    return { ...plan, tasks };
  }

  async getPlanById(userId, planId) {
    const planRes = await this.client
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();
    const plan = this._unwrap(planRes, 'getPlanById');
    if (!plan) return null;

    const tasksRes = await this.client
      .from('tasks')
      .select('*')
      .eq('plan_id', planId)
      .eq('user_id', userId)
      .order('execution_order', { ascending: true });
    const tasks = this._unwrap(tasksRes, 'getPlanById.tasks');

    const goal = await this.getGoalById(userId, plan.goal_id);
    return { ...plan, tasks, goal };
  }

  async listPlansByGoal(userId, goalId) {
    const res = await this.client
      .from('plans')
      .select('*')
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .order('version', { ascending: false });
    return this._unwrap(res, 'listPlansByGoal');
  }

  async listPlans(userId) {
    const res = await this.client
      .from('plans')
      .select('*, goals(id, title, description, event_date, location, budget, participants)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return this._unwrap(res, 'listPlans');
  }

  async updatePlanTasks(userId, planId, tasksData, planJsonPatch) {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) return null;

    // Delete existing tasks for this draft/edited plan and insert updated set
    const delRes = await this.client
      .from('tasks')
      .delete()
      .eq('plan_id', planId)
      .eq('user_id', userId);
    this._unwrap(delRes, 'updatePlanTasks.delete');

    const rows = tasksData.map((t, index) => ({
      ...(t.id ? { id: t.id } : {}),
      plan_id: planId,
      user_id: userId,
      title: t.title,
      description: t.description,
      execution_order: t.executionOrder ?? index + 1,
      status: t.status || 'Pending',
      dependencies: t.dependencies || [],
      tool_name: t.toolName,
      expected_result: t.expectedResult || null,
      failure_handling: t.failureHandling || null,
      replan_count: t.replanCount ?? 0,
      result: t.result ?? null,
      error_message: t.errorMessage ?? null,
    }));

    let tasks = [];
    if (rows.length > 0) {
      const insRes = await this.client
        .from('tasks')
        .insert(rows)
        .select('*')
        .order('execution_order', { ascending: true });
      tasks = this._unwrap(insRes, 'updatePlanTasks.insert');
    }

    if (planJsonPatch) {
      const updRes = await this.client
        .from('plans')
        .update({
          plan_json: { ...(plan.plan_json || {}), ...planJsonPatch },
        })
        .eq('id', planId)
        .eq('user_id', userId)
        .select('*')
        .single();
      const updatedPlan = this._unwrap(updRes, 'updatePlanTasks.plan');
      return { ...updatedPlan, tasks, goal: plan.goal };
    }

    return { ...plan, tasks };
  }

  async approvePlan(userId, planId) {
    const res = await this.client
      .from('plans')
      .update({ approval_status: 'approved' })
      .eq('id', planId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    const plan = this._unwrap(res, 'approvePlan');
    if (!plan) return null;
    return this.getPlanById(userId, planId);
  }

  async updateGoal(userId, goalId, patch) {
    const payload = {};
    if (patch.location !== undefined) payload.location = patch.location;
    if (patch.eventDate !== undefined) payload.event_date = patch.eventDate;
    if (patch.budget !== undefined) payload.budget = patch.budget;
    if (patch.participants !== undefined) payload.participants = patch.participants;
    if (patch.additionalInstructions !== undefined) payload.additional_instructions = patch.additionalInstructions;

    const res = await this.client
      .from('goals')
      .update(payload)
      .eq('id', goalId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    return this._unwrap(res, 'updateGoal');
  }

  async updateTask(userId, taskId, patch) {
    const payload = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.executionOrder !== undefined) payload.execution_order = patch.executionOrder;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.dependencies !== undefined) payload.dependencies = patch.dependencies;
    if (patch.toolName !== undefined) payload.tool_name = patch.toolName;
    if (patch.expectedResult !== undefined) payload.expected_result = patch.expectedResult;
    if (patch.failureHandling !== undefined) payload.failure_handling = patch.failureHandling;
    if (patch.replanCount !== undefined) payload.replan_count = patch.replanCount;
    if (patch.result !== undefined) payload.result = patch.result;
    if (patch.errorMessage !== undefined) payload.error_message = patch.errorMessage;

    const res = await this.client
      .from('tasks')
      .update(payload)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    return this._unwrap(res, 'updateTask');
  }

  async addTaskToPlan(userId, planId, t) {
    const res = await this.client
      .from('tasks')
      .insert({
        plan_id: planId,
        user_id: userId,
        title: t.title,
        description: t.description,
        execution_order: t.executionOrder,
        status: t.status || 'Pending',
        dependencies: t.dependencies || [],
        tool_name: t.toolName,
        expected_result: t.expectedResult || null,
        failure_handling: t.failureHandling || null,
        replan_count: t.replanCount ?? 0,
      })
      .select('*')
      .single();
    return this._unwrap(res, 'addTaskToPlan');
  }

  async createExecution(userId, { planId, status = 'running' }) {
    const res = await this.client
      .from('executions')
      .insert({
        plan_id: planId,
        user_id: userId,
        status,
        pause_requested: false,
        stop_requested: false,
      })
      .select('*')
      .single();
    return this._unwrap(res, 'createExecution');
  }

  async getExecutionById(userId, executionId) {
    const res = await this.client
      .from('executions')
      .select('*')
      .eq('id', executionId)
      .eq('user_id', userId)
      .maybeSingle();
    const execution = this._unwrap(res, 'getExecutionById');
    if (!execution) return null;

    const plan = await this.getPlanById(userId, execution.plan_id);
    const logs = await this.listAgentLogs(userId, executionId);
    return { ...execution, plan, logs };
  }

  async listExecutions(userId) {
    const execRes = await this.client
      .from('executions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });
    const executions = this._unwrap(execRes, 'listExecutions');
    if (executions.length === 0) return [];

    const enriched = await Promise.all(
      executions.map(async (ex) => {
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
    const payload = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.currentTaskId !== undefined) payload.current_task_id = patch.currentTaskId;
    if (patch.pauseRequested !== undefined) payload.pause_requested = patch.pauseRequested;
    if (patch.stopRequested !== undefined) payload.stop_requested = patch.stopRequested;
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt;
    if (patch.durationMs !== undefined) payload.duration_ms = patch.durationMs;
    if (patch.finalReport !== undefined) payload.final_report = patch.finalReport;

    const res = await this.client
      .from('executions')
      .update(payload)
      .eq('id', executionId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    return this._unwrap(res, 'updateExecution');
  }

  async createAgentLog(userId, log) {
    const res = await this.client
      .from('agent_logs')
      .insert({
        execution_id: log.executionId,
        user_id: userId,
        agent_name: log.agentName,
        action: log.action,
        tool_name: log.toolName || null,
        input_json: log.inputJson ?? null,
        output_json: log.outputJson ?? null,
        status: log.status,
        duration_ms: log.durationMs ?? 0,
      })
      .select('*')
      .single();
    return this._unwrap(res, 'createAgentLog');
  }

  async listAgentLogs(userId, executionId) {
    const res = await this.client
      .from('agent_logs')
      .select('*')
      .eq('execution_id', executionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    return this._unwrap(res, 'listAgentLogs');
  }

  async getDashboardStats(userId) {
    const [plansRes, tasksRes, executions, logsRes] = await Promise.all([
      this.client.from('plans').select('id, goal_id, approval_status, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      this.client.from('tasks').select('id, status').eq('user_id', userId),
      this.listExecutions(userId),
      this.client.from('agent_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    ]);

    const plans = this._unwrap(plansRes, 'dashboard.plans');
    const tasks = this._unwrap(tasksRes, 'dashboard.tasks');
    const recentLogs = this._unwrap(logsRes, 'dashboard.logs');
    const recentPlans = await this.listPlans(userId);

    return {
      totalPlans: plans.length,
      completedTasks: tasks.filter((t) => t.status === 'Completed').length,
      pendingTasks: tasks.filter((t) => ['Pending', 'Running', 'Waiting for input', 'Awaiting approval'].includes(t.status)).length,
      failedTasks: tasks.filter((t) => t.status === 'Failed').length,
      totalExecutions: executions.length,
      recentExecutions: executions.slice(0, 5),
      recentActivity: recentLogs,
      recentPlans: recentPlans.slice(0, 6),
    };
  }
}

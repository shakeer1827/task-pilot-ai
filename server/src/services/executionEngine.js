import { EventEmitter } from 'node:events';
import { runExecutorAgent } from '../agents/executorAgent.js';
import { runObserverAgent } from '../agents/observerAgent.js';
import { runReplannerAgent } from '../agents/replannerAgent.js';
import { runReporterAgent } from '../agents/reporterAgent.js';

export class ExecutionEngine {
  constructor(repository, options = {}) {
    this.repository = repository;
    this.emitter = new EventEmitter();
    this.activeRuns = new Map(); // executionId -> Promise
    this.toolContextOverrides = options.toolContextOverrides || {};
  }

  subscribe(executionId, listener) {
    const channel = `exec:${executionId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  emitEvent(executionId, type, payload) {
    this.emitter.emit(`exec:${executionId}`, {
      type,
      executionId,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  async logAndEmit(userId, executionId, logData) {
    const saved = await this.repository.createAgentLog(userId, {
      execution_id: executionId,
      ...logData,
    });
    this.emitEvent(executionId, 'log', saved);
    return saved;
  }

  async startExecution(userId, planId, options = {}) {
    const plan = await this.repository.getPlanById(userId, planId);
    if (!plan) {
      const err = new Error('Plan not found.');
      err.statusCode = 404;
      throw err;
    }
    if (plan.approval_status !== 'approved') {
      const err = new Error('Plan must be approved by the user before execution can start.');
      err.statusCode = 400;
      throw err;
    }

    const goal = await this.repository.getGoalById(userId, plan.goal_id);
    if (!goal) {
      const err = new Error('Goal not found.');
      err.statusCode = 404;
      throw err;
    }

    // Reset non-completed tasks to pending if re-starting on same plan
    const existingTasks = await this.repository.listTasksByPlan(userId, planId);
    if (existingTasks.length === 0) {
      const err = new Error('Cannot execute an empty plan.');
      err.statusCode = 400;
      throw err;
    }

    const execution = await this.repository.createExecution(userId, {
      planId: plan.id,
      goalId: goal.id,
      status: 'running',
    });

    await this.logAndEmit(userId, execution.id, {
      agent_name: 'Orchestrator',
      action: `Execution started for goal "${goal.title}" (${existingTasks.length} approved tasks).`,
      status: 'info',
      input_json: { planId: plan.id, version: plan.version },
    });

    if (options.waitForCompletion) {
      await this.runLoop(userId, execution.id, options.toolOverrides);
      return this.getFullExecutionState(userId, execution.id);
    }

    const runPromise = this.runLoop(userId, execution.id, options.toolOverrides).catch((err) => {
      console.error('Execution loop error:', err);
    });
    this.activeRuns.set(execution.id, runPromise);
    runPromise.finally(() => this.activeRuns.delete(execution.id));

    return this.getFullExecutionState(userId, execution.id);
  }

  async pauseExecution(userId, executionId) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;
    if (execution.status !== 'running') {
      return execution;
    }
    const updated = await this.repository.updateExecution(userId, executionId, {
      pause_requested: true,
    });
    await this.logAndEmit(userId, executionId, {
      agent_name: 'Control',
      action: 'Pause requested by user. Will pause safely after current step.',
      status: 'warning',
    });
    this.emitEvent(executionId, 'state', updated);
    return updated;
  }

  async stopExecution(userId, executionId) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;
    if (['completed', 'stopped'].includes(execution.status)) {
      return execution;
    }

    const updated = await this.repository.updateExecution(userId, executionId, {
      stop_requested: true,
    });

    await this.logAndEmit(userId, executionId, {
      agent_name: 'Control',
      action: 'Stop requested by user. Halting further task scheduling safely.',
      status: 'warning',
    });

    // If not currently executing inside an active loop (e.g., paused or waiting_for_input), finalize stop immediately
    if (!this.activeRuns.has(executionId)) {
      await this.finalizeStop(userId, executionId);
    }

    return this.getFullExecutionState(userId, executionId);
  }

  async resumeExecution(userId, executionId, options = {}) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;

    if (['completed', 'stopped'].includes(execution.status)) {
      const err = new Error(`Execution in "${execution.status}" state cannot be resumed.`);
      err.statusCode = 400;
      throw err;
    }

    if (this.activeRuns.has(executionId)) {
      await this.repository.updateExecution(userId, executionId, {
        pause_requested: false,
        stop_requested: false,
        status: 'running',
      });
      return this.getFullExecutionState(userId, executionId);
    }

    await this.repository.updateExecution(userId, executionId, {
      pause_requested: false,
      stop_requested: false,
      status: 'running',
    });

    await this.logAndEmit(userId, executionId, {
      agent_name: 'Control',
      action: 'Execution resumed by user.',
      status: 'info',
    });

    if (options.waitForCompletion) {
      await this.runLoop(userId, executionId, options.toolOverrides);
      return this.getFullExecutionState(userId, executionId);
    }

    const runPromise = this.runLoop(userId, executionId, options.toolOverrides).catch((err) => {
      console.error('Resume loop error:', err);
    });
    this.activeRuns.set(executionId, runPromise);
    runPromise.finally(() => this.activeRuns.delete(executionId));

    return this.getFullExecutionState(userId, executionId);
  }

  async supplyClarificationAndResume(userId, executionId, clarifications, options = {}) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;

    const goal = await this.repository.getGoalById(userId, execution.goal_id);
    const mergedClarifications = {
      ...(goal.clarifications_json || {}),
      ...clarifications,
    };

    const goalUpdates = { clarifications_json: mergedClarifications };
    if (clarifications.location) goalUpdates.location = String(clarifications.location).trim();
    if (clarifications.event_date) goalUpdates.event_date = String(clarifications.event_date).trim();
    if (clarifications.budget) goalUpdates.budget = Number(clarifications.budget);
    if (clarifications.participants) goalUpdates.participants = Number(clarifications.participants);

    await this.repository.updateGoal(userId, goal.id, goalUpdates);

    const tasks = await this.repository.listTasksByPlan(userId, execution.plan_id);
    for (const t of tasks) {
      if (t.status === 'waiting_for_input') {
        await this.repository.updateTask(userId, t.id, {
          status: 'pending',
          error_message: null,
        });
      }
    }

    await this.logAndEmit(userId, executionId, {
      agent_name: 'User',
      action: 'User supplied missing clarification details.',
      status: 'info',
      input_json: clarifications,
    });

    return this.resumeExecution(userId, executionId, options);
  }

  async retryFailedTask(userId, executionId, taskId, options = {}) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;

    const tasks = await this.repository.listTasksByPlan(userId, execution.plan_id);
    const targetTasks = taskId
      ? tasks.filter((t) => t.id === taskId)
      : tasks.filter((t) => ['failed', 'waiting_for_input', 'interrupted'].includes(t.status));

    if (targetTasks.length === 0) {
      const err = new Error('No failed or interrupted task found to retry.');
      err.statusCode = 400;
      throw err;
    }

    for (const t of targetTasks) {
      await this.repository.updateTask(userId, t.id, {
        status: 'pending',
        error_message: null,
        replan_attempts: 0,
      });
    }

    await this.logAndEmit(userId, executionId, {
      agent_name: 'Control',
      action: `Retrying ${targetTasks.length} task(s): ${targetTasks.map((t) => t.title).join(', ')}`,
      status: 'info',
    });

    return this.resumeExecution(userId, executionId, options);
  }

  async finalizeStop(userId, executionId) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;

    const tasks = await this.repository.listTasksByPlan(userId, execution.plan_id);
    for (const task of tasks) {
      if (task.status === 'running') {
        await this.repository.updateTask(userId, task.id, {
          status: 'interrupted',
          error_message: 'Task interrupted when user stopped execution.',
        });
      }
    }

    const updatedTasks = await this.repository.listTasksByPlan(userId, execution.plan_id);
    const goal = await this.repository.getGoalById(userId, execution.goal_id);
    const logs = await this.repository.listAgentLogsByExecution(userId, executionId);

    const completedAt = new Date().toISOString();
    const durationMs = execution.started_at
      ? Math.max(0, Date.now() - new Date(execution.started_at).getTime())
      : 0;

    const stoppedExec = await this.repository.updateExecution(userId, executionId, {
      status: 'stopped',
      current_task_id: null,
      completed_at: completedAt,
      duration_ms: durationMs,
    });

    const report = await runReporterAgent({
      goal,
      execution: stoppedExec,
      tasks: updatedTasks,
      logs,
    });

    await this.repository.updateExecution(userId, executionId, { final_report: report });

    await this.logAndEmit(userId, executionId, {
      agent_name: 'Reporter',
      action: 'Execution stopped. Partial progress and final report saved.',
      status: 'warning',
      output_json: report.executionSummary,
    });

    this.emitEvent(executionId, 'done', { status: 'stopped', report });
    return stoppedExec;
  }

  findNextRunnableTask(tasks) {
    const byOrder = new Map(tasks.map((t) => [t.execution_order, t]));
    const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);

    for (const task of sorted) {
      if (task.status !== 'pending') continue;
      const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
      const depsSatisfied = deps.every((depOrder) => {
        const depTask = byOrder.get(depOrder);
        return depTask && depTask.status === 'completed';
      });
      if (depsSatisfied) {
        return task;
      }
    }
    return null;
  }

  collectPriorOutputs(tasks) {
    const outputs = {};
    for (const t of tasks) {
      if (t.status === 'completed' && t.result?.data) {
        if (t.tool_name === 'weather_forecast') outputs.weather = t.result.data;
        if (t.tool_name === 'budget_calculator') outputs.budget = t.result.data;
        if (t.tool_name === 'logistics_planner') outputs.logistics = t.result.data;
      }
    }
    return outputs;
  }

  async runLoop(userId, executionId, toolOverrides = {}) {
    const context = {
      repository: this.repository,
      userId,
      executionId,
      ...this.toolContextOverrides,
      ...toolOverrides,
    };

    while (true) {
      const execution = await this.repository.getExecutionById(userId, executionId);
      if (!execution) break;

      if (execution.stop_requested) {
        await this.finalizeStop(userId, executionId);
        break;
      }

      if (execution.pause_requested) {
        await this.repository.updateExecution(userId, executionId, {
          status: 'paused',
          current_task_id: null,
        });
        await this.logAndEmit(userId, executionId, {
          agent_name: 'Control',
          action: 'Execution paused safely.',
          status: 'warning',
        });
        this.emitEvent(executionId, 'paused', { status: 'paused' });
        break;
      }

      const goal = await this.repository.getGoalById(userId, execution.goal_id);
      const tasks = await this.repository.listTasksByPlan(userId, execution.plan_id);
      const nextTask = this.findNextRunnableTask(tasks);

      if (!nextTask) {
        const waitingTask = tasks.find((t) => t.status === 'waiting_for_input');
        if (waitingTask) {
          await this.repository.updateExecution(userId, executionId, {
            status: 'waiting_for_input',
            current_task_id: waitingTask.id,
          });
          this.emitEvent(executionId, 'waiting_for_input', { task: waitingTask });
          break;
        }

        // All runnable tasks have finished
        const hasFailures = tasks.some((t) => t.status === 'failed');
        const anyBlockedPending = tasks.some((t) => t.status === 'pending');
        const finalStatus = hasFailures && tasks.every((t) => t.status !== 'completed') ? 'failed' : hasFailures || anyBlockedPending ? 'completed' : 'completed';
        const completedAt = new Date().toISOString();
        const durationMs = execution.started_at
          ? Math.max(0, Date.now() - new Date(execution.started_at).getTime())
          : 0;

        const finishedExec = await this.repository.updateExecution(userId, executionId, {
          status: finalStatus,
          current_task_id: null,
          completed_at: completedAt,
          duration_ms: durationMs,
        });

        const logs = await this.repository.listAgentLogsByExecution(userId, executionId);
        const report = await runReporterAgent({
          goal,
          execution: finishedExec,
          tasks,
          logs,
          fetchImpl: context.fetchImpl,
        });

        await this.repository.updateExecution(userId, executionId, { final_report: report });

        await this.logAndEmit(userId, executionId, {
          agent_name: 'Reporter',
          action: `Final execution report generated (${report.executionSummary.completedCount}/${report.executionSummary.totalTasks} tasks completed).`,
          status: hasFailures ? 'warning' : 'completed',
          output_json: report.executionSummary,
        });

        this.emitEvent(executionId, 'done', { status: finalStatus, report });
        break;
      }

      // Mark task running
      await this.repository.updateTask(userId, nextTask.id, { status: 'running' });
      await this.repository.updateExecution(userId, executionId, {
        status: 'running',
        current_task_id: nextTask.id,
      });

      await this.logAndEmit(userId, executionId, {
        task_id: nextTask.id,
        agent_name: 'Executor',
        action: `Starting task #${nextTask.execution_order}: ${nextTask.title}`,
        tool_name: nextTask.tool_name,
        status: 'running',
      });
      this.emitEvent(executionId, 'task_update', { taskId: nextTask.id, status: 'running' });

      const priorOutputs = this.collectPriorOutputs(tasks);
      const execResult = await runExecutorAgent(nextTask, goal, priorOutputs, {
        ...context,
        planId: execution.plan_id,
      });

      await this.logAndEmit(userId, executionId, {
        task_id: nextTask.id,
        agent_name: 'Tool',
        action: `Tool called: ${execResult.toolResult.toolLabel || execResult.toolName}`,
        tool_name: execResult.toolName,
        input_json: execResult.inputPayload,
        output_json: execResult.toolResult,
        status: execResult.toolResult.ok ? 'completed' : 'failed',
        duration_ms: execResult.durationMs,
      });

      const observerResult = runObserverAgent(nextTask, execResult.toolResult);
      await this.logAndEmit(userId, executionId, {
        task_id: nextTask.id,
        agent_name: 'Observer',
        action: observerResult.reason,
        tool_name: execResult.toolName,
        output_json: observerResult,
        status:
          observerResult.verdict === 'completed'
            ? 'completed'
            : observerResult.verdict === 'waiting_for_input'
            ? 'waiting'
            : 'warning',
      });

      // Re-check stop right after tool invocation before scheduling anything else
      const refreshedExec = await this.repository.getExecutionById(userId, executionId);
      if (refreshedExec?.stop_requested) {
        if (observerResult.verdict === 'completed') {
          await this.repository.updateTask(userId, nextTask.id, {
            status: 'completed',
            result: execResult.toolResult,
            requires_human_action: observerResult.requiresHumanAction,
          });
        } else {
          await this.repository.updateTask(userId, nextTask.id, {
            status: 'interrupted',
            error_message: 'Interrupted due to user stop request.',
          });
        }
        await this.finalizeStop(userId, executionId);
        break;
      }

      if (observerResult.verdict === 'completed') {
        const updatedTask = await this.repository.updateTask(userId, nextTask.id, {
          status: 'completed',
          result: execResult.toolResult,
          error_message: null,
          requires_human_action: observerResult.requiresHumanAction,
        });
        await this.logAndEmit(userId, executionId, {
          task_id: nextTask.id,
          agent_name: 'Executor',
          action: `Completed task #${nextTask.execution_order}: ${nextTask.title}`,
          status: 'completed',
        });
        this.emitEvent(executionId, 'task_update', updatedTask);
        continue;
      }

      if (observerResult.verdict === 'waiting_for_input') {
        const waitingTask = await this.repository.updateTask(userId, nextTask.id, {
          status: 'waiting_for_input',
          result: execResult.toolResult,
          error_message: observerResult.reason,
        });
        await this.repository.updateExecution(userId, executionId, {
          status: 'waiting_for_input',
          current_task_id: nextTask.id,
        });
        this.emitEvent(executionId, 'waiting_for_input', {
          task: waitingTask,
          missingField: observerResult.missingField,
          question: observerResult.reason,
        });
        break;
      }

      // Failure or overrun -> invoke Replanner (bounded to MAX_REPLAN_ATTEMPTS = 2)
      const replan = await runReplannerAgent({
        task: nextTask,
        goal,
        observerResult,
        toolResult: execResult.toolResult,
        fetchImpl: context.fetchImpl,
      });

      await this.logAndEmit(userId, executionId, {
        task_id: nextTask.id,
        agent_name: 'Replanner',
        action: replan.diagnosis,
        status: replan.canContinue ? 'warning' : 'failed',
        output_json: replan,
      });

      if (replan.canContinue && replan.strategy === 'retry_with_adjusted_input') {
        const nextAttempts = (nextTask.replan_attempts || 0) + 1;
        await this.repository.updateTask(userId, nextTask.id, {
          status: 'pending',
          replan_attempts: nextAttempts,
          input_payload: replan.adjustedInputPayload || nextTask.input_payload,
          result: execResult.toolResult,
          error_message: `Replan attempt #${nextAttempts}: ${replan.diagnosis}`,
        });
        continue;
      }

      if (replan.canContinue && replan.strategy === 'insert_contingency_task' && replan.replacementTask) {
        const nextAttempts = (nextTask.replan_attempts || 0) + 1;
        await this.repository.updateTask(userId, nextTask.id, {
          status: 'failed',
          replan_attempts: nextAttempts,
          result: execResult.toolResult,
          error_message: observerResult.reason,
        });

        const maxOrder = Math.max(...tasks.map((t) => t.execution_order), 0);
        const contingencyOrder = maxOrder + 1;
        const inserted = await this.repository.insertTask(userId, execution.plan_id, {
          title: replan.replacementTask.title,
          description: replan.replacementTask.description,
          execution_order: contingencyOrder,
          status: 'pending',
          dependencies: [],
          tool_name: replan.replacementTask.tool_name,
          expected_result: 'Contingency guidance generated safely.',
          failure_handling: 'Mark for manual organizer review.',
          input_payload: replan.replacementTask.input_payload || {},
          requires_human_action: Boolean(replan.replacementTask.requires_human_action),
        });

        await this.logAndEmit(userId, executionId, {
          task_id: inserted.id,
          agent_name: 'Replanner',
          action: `Added contingency task #${contingencyOrder}: ${inserted.title}`,
          status: 'info',
        });
        this.emitEvent(executionId, 'task_added', inserted);
        continue;
      }

      // Could not automatically recover within bounded attempts
      const failedTask = await this.repository.updateTask(userId, nextTask.id, {
        status: 'failed',
        replan_attempts: (nextTask.replan_attempts || 0) + 1,
        result: execResult.toolResult,
        error_message: replan.diagnosis || observerResult.reason,
      });
      this.emitEvent(executionId, 'task_update', failedTask);
    }
  }

  async getFullExecutionState(userId, executionId) {
    const execution = await this.repository.getExecutionById(userId, executionId);
    if (!execution) return null;

    const [goal, plan, tasks, logs] = await Promise.all([
      this.repository.getGoalById(userId, execution.goal_id),
      this.repository.getPlanById(userId, execution.plan_id),
      this.repository.listTasksByPlan(userId, execution.plan_id),
      this.repository.listAgentLogsByExecution(userId, executionId),
    ]);

    return {
      execution,
      goal,
      plan,
      tasks,
      logs,
    };
  }
}

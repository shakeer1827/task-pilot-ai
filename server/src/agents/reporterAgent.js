import { callGeminiJson } from './geminiClient.js';
import { sanitizeUntrustedText } from '../tools/toolRegistry.js';

export async function runReporterAgent({ goal, execution, tasks, logs, fetchImpl }) {
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed');
  const interruptedTasks = tasks.filter((t) => t.status === 'interrupted');
  const waitingTasks = tasks.filter((t) => ['waiting_for_input', 'awaiting_approval'].includes(t.status));
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  const humanActionTasks = tasks.filter(
    (t) =>
      t.requires_human_action ||
      t.result?.requiresHumanAction ||
      t.status === 'waiting_for_input' ||
      t.status === 'awaiting_approval'
  );

  // Extract real observed tool results
  const weatherTask = tasks.find((t) => t.tool_name === 'weather_forecast' && t.result?.data);
  const budgetTask = tasks.find((t) => t.tool_name === 'budget_calculator' && t.result?.data);

  const toolsUsedMap = new Map();
  for (const log of logs) {
    if (log.tool_name) {
      toolsUsedMap.set(log.tool_name, (toolsUsedMap.get(log.tool_name) || 0) + 1);
    }
  }

  const toolsUsed = Array.from(toolsUsedMap.entries()).map(([tool, calls]) => ({ tool, calls }));

  const observations = [];
  if (execution.status === 'stopped') {
    observations.push('Execution was stopped by the user; remaining unstarted tasks were not executed.');
  }
  for (const t of tasks) {
    if (t.replan_attempts > 0) {
      observations.push(`Task "${t.title}" triggered ${t.replan_attempts} autonomous replan cycle(s).`);
    }
    if (t.status === 'failed' && t.error_message) {
      observations.push(`Task "${t.title}" failed: ${t.error_message}`);
    }
  }
  if (weatherTask?.result?.errorCode === 'FORECAST_OUT_OF_RANGE') {
    observations.push(weatherTask.result.message);
  }
  if (weatherTask?.result?.ok && weatherTask.result.data?.contingencyRequired) {
    observations.push(
      `Weather risk rated ${weatherTask.result.data.outdoorRisk} (${weatherTask.result.data.condition}). Backup indoor planning advised.`
    );
  }
  if (budgetTask?.result?.data) {
    observations.push(
      `Budget summary (${budgetTask.result.data.currency}): Estimated ${budgetTask.result.data.totalEstimated.toLocaleString()} vs limit ${budgetTask.result.data.totalBudget.toLocaleString()} (costs labeled as estimates unless actual quotes supplied).`
    );
  }

  const suggestedNextSteps = [];
  if (failedTasks.length > 0 || waitingTasks.length > 0) {
    suggestedNextSteps.push('Resolve failed or waiting tasks by supplying missing details and clicking Retry Failed Task.');
  }
  if (humanActionTasks.length > 0) {
    suggestedNextSteps.push('Review the human-action checklist items (venue confirmation, vendor quotes, approvals) — TaskPilot AI never performs external bookings automatically.');
  }
  if (weatherTask?.result?.errorCode === 'FORECAST_OUT_OF_RANGE') {
    suggestedNextSteps.push('Re-run weather verification within 14 days of the event date for live Open-Meteo conditions.');
  }
  if (suggestedNextSteps.length === 0) {
    suggestedNextSteps.push('Share the generated schedule and budget estimate with your organizing committee to begin vendor outreach.');
  }

  let executiveSummary = `Execution finished with status "${execution.status}". ${completedTasks.length} of ${tasks.length} tasks completed, ${failedTasks.length} failed, ${interruptedTasks.length} interrupted, and ${waitingTasks.length + pendingTasks.length} pending/waiting.`;

  // Optional Gemini narrative polish grounded strictly in observed task statuses
  try {
    const llm = await callGeminiJson({
      systemPrompt:
        'Summarize the verified execution report concisely in 2-3 sentences. Never invent completed actions or omit failures.',
      userPrompt: `<untrusted_data>
Goal: ${sanitizeUntrustedText(goal.title, 200)}
Status: ${execution.status}
Completed: ${completedTasks.map((t) => t.title).join('; ') || 'None'}
Failed: ${failedTasks.map((t) => `${t.title} (${t.error_message || 'error'})`).join('; ') || 'None'}
Waiting/Pending: ${[...waitingTasks, ...pendingTasks, ...interruptedTasks].map((t) => t.title).join('; ') || 'None'}
</untrusted_data>`,
      schemaDescription: `{ "executive_summary": "string" }`,
      fetchImpl,
    });
    if (!llm.usedFallback && llm.data?.executive_summary) {
      executiveSummary = String(llm.data.executive_summary);
    }
  } catch {
    // Keep deterministic grounded summary
  }

  return {
    generatedAt: new Date().toISOString(),
    originalGoal: {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      event_date: goal.event_date,
      location: goal.location,
      budget: goal.budget,
      participants: goal.participants,
    },
    executionSummary: {
      executionId: execution.id,
      status: execution.status,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
      durationMs: execution.duration_ms,
      totalTasks: tasks.length,
      completedCount: completedTasks.length,
      failedCount: failedTasks.length,
      waitingCount: waitingTasks.length,
      interruptedCount: interruptedTasks.length,
      pendingCount: pendingTasks.length,
      narrative: executiveSummary,
    },
    tasksCompleted: completedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      tool_name: t.tool_name,
      requires_human_action: t.requires_human_action,
      resultSummary: t.result?.message || t.expected_result,
    })),
    tasksFailed: failedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      tool_name: t.tool_name,
      error: t.error_message,
      replanAttempts: t.replan_attempts,
    })),
    tasksRequiringUserAction: humanActionTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      reason: t.error_message || 'Requires organizer confirmation or external vendor action.',
      items: t.result?.data?.humanActionItems || t.result?.data?.checklist || [],
    })),
    incompleteWork: [...failedTasks, ...waitingTasks, ...interruptedTasks, ...pendingTasks].map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      reason: t.error_message || 'Not completed during this execution run.',
    })),
    toolsUsed,
    weatherFindings: weatherTask?.result?.data || (weatherTask?.result?.message ? { note: weatherTask.result.message } : null),
    budgetSummary: budgetTask?.result?.data || null,
    importantObservations: observations,
    suggestedNextSteps,
  };
}

import { executeRegisteredTool } from '../tools/toolRegistry.js';

export async function runExecutorAgent(task, goal, priorOutputs = {}, context = {}) {
  const toolName = task.tool_name || 'none';
  const basePayload = { ...(task.input_payload || {}) };

  let validatedInput = basePayload;

  if (toolName === 'weather_forecast') {
    const location =
      goal.clarifications_json?.location ||
      goal.location ||
      basePayload.location ||
      '';
    const eventDate =
      goal.clarifications_json?.event_date ||
      goal.event_date ||
      basePayload.event_date ||
      null;

    validatedInput = {
      location: String(location || '').trim(),
      event_date: eventDate ? String(eventDate).trim() : null,
    };
  } else if (toolName === 'budget_calculator') {
    const totalBudget = Number(
      goal.clarifications_json?.budget ||
        goal.budget ||
        basePayload.totalBudget ||
        50000
    );
    const participants = Number(
      goal.clarifications_json?.participants ||
        goal.participants ||
        basePayload.participants ||
        100
    );
    const weatherRisk = priorOutputs.weather?.outdoorRisk || 'low';
    const indoorContingency =
      Boolean(basePayload.indoorContingency) ||
      weatherRisk === 'high' ||
      weatherRisk === 'moderate';

    validatedInput = {
      ...basePayload,
      totalBudget,
      participants,
      currency: basePayload.currency || 'INR',
      eventType: basePayload.eventType || goal.title,
      indoorContingency,
    };
  } else if (toolName === 'logistics_planner') {
    validatedInput = {
      focus: basePayload.focus || 'vendor_checklist',
      eventTitle: basePayload.eventTitle || goal.title,
      participants: Number(goal.clarifications_json?.participants || goal.participants || basePayload.participants || 100),
      location: goal.clarifications_json?.location || goal.location || basePayload.location || null,
      eventDate: goal.clarifications_json?.event_date || goal.event_date || basePayload.eventDate || null,
      weatherRisk: priorOutputs.weather?.outdoorRisk || basePayload.weatherRisk || null,
    };
  } else if (toolName === 'database_save') {
    validatedInput = {
      operation: basePayload.operation || 'save_checkpoint',
      summary: basePayload.summary || `Verified completion of task: ${task.title}`,
      metadata: {
        ...(basePayload.metadata || {}),
        weatherChecked: Boolean(priorOutputs.weather),
        budgetChecked: Boolean(priorOutputs.budget),
      },
    };
  }

  const toolResult = await executeRegisteredTool(toolName, validatedInput, context);

  return {
    toolName,
    inputPayload: validatedInput,
    toolResult,
    durationMs: toolResult.durationMs,
  };
}

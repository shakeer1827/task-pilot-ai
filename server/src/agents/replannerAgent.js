import { z } from 'zod';
import { callGeminiJson } from './geminiClient.js';
import { sanitizeUntrustedText } from '../tools/toolRegistry.js';

export const MAX_REPLAN_ATTEMPTS = 2;

const replanSchema = z.object({
  diagnosis: z.string().min(4),
  strategy: z.enum(['retry_with_adjusted_input', 'insert_contingency_task', 'ask_user', 'skip_and_continue']),
  adjusted_input_payload: z.record(z.unknown()).optional(),
  replacement_task: z
    .object({
      title: z.string(),
      description: z.string(),
      tool_name: z.enum(['weather_forecast', 'budget_calculator', 'logistics_planner', 'database_save', 'none']),
      input_payload: z.record(z.unknown()).default({}),
      requires_human_action: z.boolean().default(false),
    })
    .optional(),
  user_question: z.string().optional(),
});

export async function runReplannerAgent({ task, goal, observerResult, toolResult, fetchImpl }) {
  if ((task.replan_attempts || 0) >= MAX_REPLAN_ATTEMPTS) {
    return {
      canContinue: false,
      strategy: 'max_retries_reached',
      diagnosis: `Reached maximum automatic replan limit (${MAX_REPLAN_ATTEMPTS}) for "${task.title}". Human review required.`,
      userQuestion: observerResult.reason,
    };
  }

  // Deterministic handling for Budget Overrun (computes safe scaleFactor to fit user's budget)
  if (observerResult.failureType === 'BUDGET_OVERRUN' && toolResult?.data) {
    const { totalBudget, totalEstimated, participants } = toolResult.data;
    const safeScale = totalEstimated > 0 ? Number(((totalBudget * 0.94) / totalEstimated).toFixed(2)) : 0.8;
    const clampedScale = Math.max(0.4, Math.min(0.95, safeScale));

    return {
      canContinue: true,
      strategy: 'retry_with_adjusted_input',
      diagnosis: `Budget overrun detected (${totalEstimated} > ${totalBudget}). Scaling discretionary categories by ${clampedScale}x (catering & venue optimization) to fit within ${totalBudget}.`,
      adjustedInputPayload: {
        ...(task.input_payload || {}),
        totalBudget,
        participants,
        scaleFactor: clampedScale,
        indoorContingency: false,
      },
      note: 'Revised budget plan applied to fit limit; user can review adjusted category estimates.',
    };
  }

  // Deterministic handling for Weather Forecast Out of Range (>16 days)
  if (observerResult.failureType === 'FORECAST_OUT_OF_RANGE') {
    return {
      canContinue: true,
      strategy: 'insert_contingency_task',
      diagnosis: observerResult.reason,
      replacementTask: {
        title: 'Prepare weather-independent indoor backup & forecast reminder',
        description:
          'Open-Meteo forecast is unavailable beyond 16 days. Scheduled an indoor contingency checklist and flagged a reminder to re-check weather within 14 days of the event.',
        tool_name: 'logistics_planner',
        input_payload: {
          focus: 'contingency_plan',
          eventTitle: goal.title,
          participants: goal.participants || 100,
          location: goal.location || null,
          eventDate: goal.event_date || null,
          weatherRisk: 'forecast_unavailable_check_closer_to_date',
        },
        requires_human_action: true,
      },
    };
  }

  // Database save failure: safe retry once, otherwise escalate honestly
  if (observerResult.failureType === 'DATABASE_SAVE_FAILED') {
    if ((task.replan_attempts || 0) === 0) {
      return {
        canContinue: true,
        strategy: 'retry_with_adjusted_input',
        diagnosis: 'Database checkpoint write failed. Attempting one safe retry of checkpoint persistence.',
        adjustedInputPayload: task.input_payload || {},
      };
    }
    return {
      canContinue: false,
      strategy: 'ask_user',
      diagnosis: `Database persistence failed repeatedly: ${observerResult.reason}`,
      userQuestion: 'Database save failed. Please verify database connectivity and retry.',
    };
  }

  // Weather API failure (network / HTTP error)
  if (
    observerResult.failureType === 'GEOCODING_API_ERROR' ||
    observerResult.failureType === 'FORECAST_API_ERROR' ||
    observerResult.failureType === 'WEATHER_NETWORK_OR_TIMEOUT'
  ) {
    if ((task.replan_attempts || 0) === 0) {
      return {
        canContinue: true,
        strategy: 'retry_with_adjusted_input',
        diagnosis: `Weather API failed (${observerResult.reason}). Retrying weather lookup once before switching to indoor contingency.`,
        adjustedInputPayload: task.input_payload || {},
      };
    }
    return {
      canContinue: true,
      strategy: 'insert_contingency_task',
      diagnosis: `Weather API remained unavailable after retry (${observerResult.reason}). Switching to weather-resilient indoor contingency planning so independent tasks can continue.`,
      replacementTask: {
        title: 'Fallback indoor contingency plan (Weather API unavailable)',
        description: 'Prepare indoor hall backup and covered setup requirements since live weather data could not be retrieved.',
        tool_name: 'logistics_planner',
        input_payload: {
          focus: 'contingency_plan',
          eventTitle: goal.title,
          participants: goal.participants || 100,
          weatherRisk: 'api_unavailable_fallback',
        },
        requires_human_action: true,
      },
    };
  }

  // General Gemini-assisted replanning when configured
  try {
    const llm = await callGeminiJson({
      systemPrompt:
        'You are TaskPilot AI Replanner Agent. Diagnose a failed task and pick a safe recovery strategy without looping or inventing external results.',
      userPrompt: `<untrusted_data>
Task: ${sanitizeUntrustedText(task.title, 200)}
Tool: ${task.tool_name}
Error/Observation: ${sanitizeUntrustedText(observerResult.reason, 400)}
Attempt #: ${(task.replan_attempts || 0) + 1} of ${MAX_REPLAN_ATTEMPTS}
</untrusted_data>`,
      schemaDescription: `{
  "diagnosis": "string",
  "strategy": "retry_with_adjusted_input | insert_contingency_task | ask_user | skip_and_continue",
  "user_question": "optional string"
}`,
      fetchImpl,
    });

    if (!llm.usedFallback && llm.data) {
      const parsed = replanSchema.safeParse(llm.data);
      if (parsed.success) {
        return {
          canContinue: parsed.data.strategy !== 'ask_user',
          strategy: parsed.data.strategy,
          diagnosis: parsed.data.diagnosis,
          adjustedInputPayload: parsed.data.adjusted_input_payload,
          replacementTask: parsed.data.replacement_task,
          userQuestion: parsed.data.user_question,
        };
      }
    }
  } catch {
    // Fall through to safe manual escalation
  }

  return {
    canContinue: false,
    strategy: 'ask_user',
    diagnosis: observerResult.reason || 'Task failed and requires organizer input.',
    userQuestion: `Task "${task.title}" failed (${observerResult.reason}). Please update inputs or retry.`,
  };
}

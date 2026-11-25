import { z } from 'zod';
import { callGeminiJson } from './geminiClient.js';
import { sanitizeUntrustedText } from '../tools/toolRegistry.js';

const plannedTaskSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().min(4).max(1000),
  execution_order: z.number().int().positive(),
  tool_name: z.enum(['weather_forecast', 'budget_calculator', 'logistics_planner', 'database_save', 'none']),
  dependencies: z.array(z.number().int().positive()).default([]),
  expected_result: z.string().min(2).max(500),
  failure_handling: z.string().min(2).max(500),
  requires_human_action: z.boolean().default(false),
  input_payload: z.record(z.unknown()).default({}),
});

const plannerOutputSchema = z.object({
  goal_summary: z.string().min(4),
  inferred_details: z.object({
    event_date: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    budget: z.number().nullable().optional(),
    participants: z.number().int().nullable().optional(),
    event_type: z.string().nullable().optional(),
  }),
  missing_info: z
    .array(
      z.object({
        field: z.string(),
        question: z.string(),
        required: z.boolean().default(true),
      })
    )
    .default([]),
  tasks: z.array(plannedTaskSchema).min(3).max(12),
});

function resolveNextWeekday(targetDayIndex, now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentDay = date.getUTCDay();
  let delta = (targetDayIndex - currentDay + 7) % 7;
  if (delta === 0) delta = 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function extractGoalHints(goal, now = new Date()) {
  const text = `${goal.title || ''} ${goal.description || ''} ${goal.additional_instructions || ''}`;

  let budget = goal.budget !== null && goal.budget !== undefined ? Number(goal.budget) : null;
  if (!budget) {
    const budgetMatch = text.match(/(?:₹|rs\.?|inr|\$)\s*([\d,]+)/i) || text.match(/budget\s*(?:of|:)?\s*([\d,]+)/i);
    if (budgetMatch) {
      const parsed = Number(budgetMatch[1].replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) budget = parsed;
    }
  }

  let participants = goal.participants !== null && goal.participants !== undefined ? Number(goal.participants) : null;
  if (!participants) {
    const partMatch = text.match(/(\d{1,5})\s*(?:students|people|guests|attendees|participants|members)/i);
    if (partMatch) {
      const parsed = Number(partMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) participants = parsed;
    }
  }

  let eventDate = goal.event_date || null;
  let inferredDateNote = null;
  if (!eventDate) {
    const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      eventDate = isoMatch[1];
    } else if (/next\s+saturday/i.test(text)) {
      eventDate = resolveNextWeekday(6, now);
      inferredDateNote = `Inferred "next Saturday" as ${eventDate}`;
    } else if (/next\s+sunday/i.test(text)) {
      eventDate = resolveNextWeekday(0, now);
      inferredDateNote = `Inferred "next Sunday" as ${eventDate}`;
    }
  }

  let location = goal.location || null;
  if (!location) {
    const locMatch = text.match(/\b(?:in|at)\s+([A-Z][a-zA-Z\s]{2,30})(?:,|\.|for|next|with|$)/);
    if (locMatch && !/college|campus|university/i.test(locMatch[1])) {
      location = locMatch[1].trim();
    }
  }

  return { budget, participants, eventDate, location, inferredDateNote };
}

function buildMissingInfoList(goal, hints) {
  const missing = [];
  if (!hints.location) {
    missing.push({
      field: 'location',
      question: 'Which city or specific campus venue location will host the event? (Required for live weather verification)',
      required: true,
    });
  }
  if (!hints.eventDate) {
    missing.push({
      field: 'event_date',
      question: 'What is the exact event date (YYYY-MM-DD)?',
      required: true,
    });
  }
  if (!hints.budget) {
    missing.push({
      field: 'budget',
      question: 'What is your maximum total budget (e.g., 50000 INR)?',
      required: true,
    });
  }
  if (!hints.participants) {
    missing.push({
      field: 'participants',
      question: 'How many expected attendees/participants should we plan for?',
      required: false,
    });
  }
  if (!goal.additional_instructions || !/indoor|outdoor/i.test(goal.additional_instructions)) {
    missing.push({
      field: 'venue_setting',
      question: 'Is the preferred venue outdoor (courtyard/ground) or indoor (auditorium)?',
      required: false,
    });
  }
  return missing;
}

function buildDeterministicPlan(goal, hints, missingInfo) {
  const safeTitle = sanitizeUntrustedText(goal.title, 120);
  const participants = hints.participants || 100;
  const budget = hints.budget || 50000;
  const location = hints.location || null;
  const eventDate = hints.eventDate || null;

  const tasks = [
    {
      title: 'Verify live weather forecast & outdoor risk',
      description: location
        ? `Query Open-Meteo geocoding and forecast API for ${location}${eventDate ? ` on ${eventDate}` : ''} to assess rain, temperature, and wind risks.`
        : 'Attempt Open-Meteo weather check once a specific city/venue location is provided by the organizer.',
      execution_order: 1,
      tool_name: 'weather_forecast',
      dependencies: [],
      expected_result: 'Verified temperature range, precipitation probability, and outdoor risk rating from Open-Meteo.',
      failure_handling:
        'If location is missing, pause and ask the user. If Open-Meteo fails or date is beyond 16-day forecast range, switch to indoor contingency planning.',
      requires_human_action: false,
      input_payload: {
        location: location || '',
        event_date: eventDate,
      },
    },
    {
      title: 'Calculate itemized event budget & overrun check',
      description: `Estimate expenses across Venue, Food, Decorations, Sound System, Transportation, and Miscellaneous for ${participants} participants against the ${budget} budget.`,
      execution_order: 2,
      tool_name: 'budget_calculator',
      dependencies: [],
      expected_result: 'Itemized cost breakdown (marked as estimates), remaining budget, and overrun check.',
      failure_handling:
        'If total estimated cost exceeds budget, trigger Replanner to trim discretionary costs and propose budget-compliant alternatives.',
      requires_human_action: false,
      input_payload: {
        totalBudget: budget,
        participants,
        currency: 'INR',
        eventType: safeTitle,
      },
    },
    {
      title: 'Build weather & venue contingency plan',
      description: 'Prepare actionable indoor backup, tenting, and rapid-relocation guidelines informed by weather verification.',
      execution_order: 3,
      tool_name: 'logistics_planner',
      dependencies: [1],
      expected_result: 'Structured contingency checklist tailored to the observed weather risk.',
      failure_handling: 'Generate conservative indoor backup guidance if live weather data was unavailable.',
      requires_human_action: false,
      input_payload: {
        focus: 'contingency_plan',
        eventTitle: safeTitle,
        participants,
        location,
        eventDate,
      },
    },
    {
      title: 'Draft event run-of-show schedule',
      description: `Create a timed event schedule from setup (T-120 min) through closing for ${participants} attendees.`,
      execution_order: 4,
      tool_name: 'logistics_planner',
      dependencies: [2],
      expected_result: 'Ordered timeline covering setup, volunteer briefing, main program, refreshments, and wrap-up.',
      failure_handling: 'Retry schedule generation with default student event milestones.',
      requires_human_action: false,
      input_payload: {
        focus: 'schedule',
        eventTitle: safeTitle,
        participants,
      },
    },
    {
      title: 'Generate vendor outreach & human-action checklist',
      description: 'Compile vendor quote requests, campus permission steps, and booking confirmations that require human organizer approval.',
      execution_order: 5,
      tool_name: 'logistics_planner',
      dependencies: [2, 3],
      expected_result: 'Clear checklist distinguishing AI-prepared drafts from actions requiring human execution.',
      failure_handling: 'Flag manual steps clearly in final report.',
      requires_human_action: true,
      input_payload: {
        focus: 'human_action_review',
        eventTitle: safeTitle,
        participants,
        location,
        eventDate,
      },
    },
    {
      title: 'Persist verified plan & checkpoint to database',
      description: 'Save execution checkpoint and verified outputs to persistent storage for auditability and final reporting.',
      execution_order: 6,
      tool_name: 'database_save',
      dependencies: [1, 2, 3, 4, 5],
      expected_result: 'Database confirms checkpoint saved with timestamp.',
      failure_handling: 'Retry save up to 2 times; if persistence still fails, report actual DB error without claiming saved.',
      requires_human_action: false,
      input_payload: {
        operation: 'save_checkpoint',
        summary: `Completed planning verification for ${safeTitle}`,
      },
    },
  ];

  return {
    goal_summary: `Organize "${safeTitle}" for ${participants} participants${location ? ` in ${location}` : ''}${
      eventDate ? ` on ${eventDate}` : ''
    } with target budget ${budget} INR.${hints.inferredDateNote ? ` (${hints.inferredDateNote})` : ''}`,
    inferred_details: {
      event_date: eventDate,
      location,
      budget,
      participants,
      event_type: safeTitle,
    },
    missing_info: missingInfo,
    tasks,
  };
}

export async function runPlannerAgent(goal, options = {}) {
  const hints = extractGoalHints(goal, options.nowDate);
  const heuristicMissing = buildMissingInfoList(goal, hints);

  const systemPrompt = `You are TaskPilot AI's Planner Agent for autonomous student & team event planning.
Available tools ONLY:
- "weather_forecast": Open-Meteo live geocoding + weather forecast API (needs location and optional YYYY-MM-DD event_date).
- "budget_calculator": Computes itemized expense breakdown, overrun check, and savings suggestions.
- "logistics_planner": Builds run-of-show schedules, contingency plans, and human-action vendor checklists.
- "database_save": Persists and verifies execution checkpoints in the database.
- "none": Manual/human confirmation step (never claim an external booking or payment happened).

Break the user's goal into 4 to 7 ordered, realistic, verifiable tasks. Identify missing information honestly without inventing unknown locations or dates.`;

  const userPrompt = `<untrusted_data>
Title: ${sanitizeUntrustedText(goal.title, 200)}
Description: ${sanitizeUntrustedText(goal.description, 800)}
Provided event_date: ${sanitizeUntrustedText(goal.event_date || hints.eventDate || 'NOT_PROVIDED', 40)}
Provided location: ${sanitizeUntrustedText(goal.location || hints.location || 'NOT_PROVIDED', 100)}
Provided budget: ${goal.budget ?? hints.budget ?? 'NOT_PROVIDED'}
Provided participants: ${goal.participants ?? hints.participants ?? 'NOT_PROVIDED'}
Additional instructions: ${sanitizeUntrustedText(goal.additional_instructions || 'None', 400)}
Clarifications supplied: ${sanitizeUntrustedText(JSON.stringify(goal.clarifications_json || {}), 400)}
</untrusted_data>`;

  const schemaDescription = `{
  "goal_summary": "string",
  "inferred_details": {
    "event_date": "YYYY-MM-DD or null",
    "location": "string or null",
    "budget": "number or null",
    "participants": "integer or null",
    "event_type": "string or null"
  },
  "missing_info": [{ "field": "string", "question": "string", "required": true }],
  "tasks": [{
    "title": "string",
    "description": "string",
    "execution_order": 1,
    "tool_name": "weather_forecast | budget_calculator | logistics_planner | database_save | none",
    "dependencies": [1],
    "expected_result": "string",
    "failure_handling": "string",
    "requires_human_action": false,
    "input_payload": {}
  }]
}`;

  const llmResponse = await callGeminiJson({
    systemPrompt,
    userPrompt,
    schemaDescription,
    fetchImpl: options.fetchImpl,
  });

  if (llmResponse.usedFallback) {
    return {
      aiProvider: llmResponse.provider,
      plan: buildDeterministicPlan(goal, hints, heuristicMissing),
    };
  }

  const parsed = plannerOutputSchema.safeParse(llmResponse.data);
  if (!parsed.success) {
    // Safety fallback if LLM returns malformed JSON structure
    return {
      aiProvider: `${llmResponse.provider} (schema-normalized)`,
      plan: buildDeterministicPlan(goal, hints, heuristicMissing),
    };
  }

  const normalizedTasks = parsed.data.tasks
    .sort((a, b) => a.execution_order - b.execution_order)
    .map((task, idx) => ({
      ...task,
      execution_order: idx + 1,
    }));

  // Ensure critical missing info checks are preserved
  const mergedMissing = [...parsed.data.missing_info];
  for (const item of heuristicMissing) {
    if (item.required && !mergedMissing.some((m) => m.field === item.field)) {
      mergedMissing.push(item);
    }
  }

  return {
    aiProvider: llmResponse.provider,
    plan: {
      ...parsed.data,
      missing_info: mergedMissing,
      tasks: normalizedTasks,
    },
  };
}

import { runWeatherTool } from './weatherTool.js';
import { runBudgetTool } from './budgetTool.js';
import { runDatabaseTool } from './databaseTool.js';
import { runLogisticsTool } from './logisticsTool.js';

export function sanitizeUntrustedText(value, maxLen = 1000) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/(ignore\s+(all\s+)?previous\s+instructions|system\s*:|assistant\s*:)/gi, '[filtered]')
    .slice(0, maxLen)
    .trim();
}

export const TOOL_CATALOG = {
  weather_forecast: {
    name: 'weather_forecast',
    label: 'Open-Meteo Weather API',
    description: 'Fetches real geocoded weather forecast for an event location and date via Open-Meteo.',
    run: runWeatherTool,
  },
  budget_calculator: {
    name: 'budget_calculator',
    label: 'Budget Calculator',
    description: 'Calculates estimated event expenses, remaining budget, overrun checks, and cost-cutting options.',
    run: runBudgetTool,
  },
  database_save: {
    name: 'database_save',
    label: 'Database Persistence Tool',
    description: 'Persists and verifies plan checkpoints and execution summaries in the database.',
    run: runDatabaseTool,
  },
  logistics_planner: {
    name: 'logistics_planner',
    label: 'Logistics & Checklist Generator',
    description: 'Generates structured run-of-show schedules, contingencies, and human-action vendor checklists.',
    run: runLogisticsTool,
  },
  none: {
    name: 'none',
    label: 'Human / Manual Step',
    description: 'Represents a step requiring human confirmation or external action; never auto-completes external bookings.',
    run: async (input) => ({
      ok: true,
      tool: 'none',
      requiresHumanAction: true,
      data: {
        message: 'Prepared guidance for human action. External execution requires explicit user confirmation.',
        details: input || {},
      },
    }),
  },
};

export async function executeRegisteredTool(toolName, input, context = {}) {
  const normalized = toolName && TOOL_CATALOG[toolName] ? toolName : 'none';
  const tool = TOOL_CATALOG[normalized];
  const startedAt = Date.now();
  const result = await tool.run(input || {}, context);
  const durationMs = Date.now() - startedAt;

  return {
    toolName: normalized,
    toolLabel: tool.label,
    durationMs,
    ...result,
  };
}

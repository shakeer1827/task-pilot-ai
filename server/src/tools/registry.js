import { runWeatherTool } from './weatherTool.js';
import { runBudgetTool } from './budgetTool.js';
import { runDatabaseTool } from './databaseTool.js';
import { runHumanActionTool } from './humanActionTool.js';

export const TOOL_DEFINITIONS = {
  weather_forecast: {
    name: 'weather_forecast',
    label: 'Open-Meteo Weather API',
    description: 'Geocodes the event location and fetches real forecast data (temperature, precipitation probability, outdoor risk) from Open-Meteo.',
    handler: runWeatherTool,
  },
  budget_calculator: {
    name: 'budget_calculator',
    label: 'Budget Calculator',
    description: 'Computes estimated expenses across Venue, Food, Decorations, Sound system, Transportation, and Miscellaneous, detecting overruns and suggesting adjustments.',
    handler: runBudgetTool,
  },
  database_storage: {
    name: 'database_storage',
    label: 'Database Storage Tool',
    description: 'Persists and verifies plan records, execution snapshots, and task state in Supabase PostgreSQL (or local SQLite).',
    handler: runDatabaseTool,
  },
  human_action: {
    name: 'human_action',
    label: 'Human Action & Approval Gate',
    description: 'Prepares an external action checklist (venue booking, vendor outreach, permits) and pauses the task at Awaiting approval for real human confirmation.',
    handler: runHumanActionTool,
  },
};

export const ALLOWED_TOOLS = Object.keys(TOOL_DEFINITIONS);

export function getToolDefinition(toolName) {
  return TOOL_DEFINITIONS[toolName] || null;
}

export async function invokeTool(toolName, input, context = {}) {
  const def = getToolDefinition(toolName);
  if (!def) {
    return {
      ok: false,
      toolName,
      errorCode: 'UNKNOWN_TOOL',
      message: `Tool "${toolName}" is not registered in the TaskPilot AI allowlist.`,
    };
  }
  return def.handler(input, context);
}

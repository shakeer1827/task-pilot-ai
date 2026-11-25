export function runObserverAgent(task, toolResult) {
  if (!toolResult) {
    return {
      verdict: 'failed',
      reason: 'Tool returned no output.',
      shouldReplan: true,
      requiresUserInput: false,
    };
  }

  // Case 1: Missing or ambiguous user input (e.g. location unclear)
  if (toolResult.requiresUserInput) {
    return {
      verdict: 'waiting_for_input',
      reason: toolResult.message || 'Additional user input is required to execute this task.',
      missingField: toolResult.missingField || 'clarification',
      shouldReplan: false,
      requiresUserInput: true,
    };
  }

  // Case 2: Budget overrun detected by Budget Calculator
  if (toolResult.tool === 'budget_calculator' && toolResult.errorCode === 'BUDGET_OVERRUN') {
    return {
      verdict: 'needs_replan',
      failureType: 'BUDGET_OVERRUN',
      reason: toolResult.message,
      shouldReplan: true,
      requiresUserInput: false,
      observations: toolResult.data?.suggestedAdjustments || [],
    };
  }

  // Case 3: Weather forecast outside 16-day range
  if (toolResult.tool === 'weather_forecast' && toolResult.errorCode === 'FORECAST_OUT_OF_RANGE') {
    return {
      verdict: 'needs_replan',
      failureType: 'FORECAST_OUT_OF_RANGE',
      reason: toolResult.message,
      shouldReplan: true,
      requiresUserInput: false,
      observations: ['Forecast unavailable beyond 16 days; contingency planning recommended.'],
    };
  }

  // Case 4: External API / DB write / generic failure
  if (!toolResult.ok) {
    return {
      verdict: 'failed',
      failureType: toolResult.errorCode || 'TOOL_FAILURE',
      reason: toolResult.message || `Tool ${task.tool_name} failed.`,
      shouldReplan: true,
      requiresUserInput: false,
    };
  }

  // Case 5: Success with weather risk warning
  const observations = [];
  if (toolResult.tool === 'weather_forecast' && toolResult.data?.contingencyRequired) {
    observations.push(
      `Weather risk is ${toolResult.data.outdoorRisk} (${toolResult.data.condition}, ${toolResult.data.precipitationProbabilityPct}% precip). Indoor backup advised.`
    );
  }
  if (toolResult.requiresHumanAction) {
    observations.push('Task produced actionable checklist/draft; external actions remain pending human confirmation.');
  }

  return {
    verdict: 'completed',
    reason: 'Tool output validated against expected result.',
    shouldReplan: false,
    requiresUserInput: false,
    requiresHumanAction: Boolean(toolResult.requiresHumanAction || task.requires_human_action),
    observations,
  };
}

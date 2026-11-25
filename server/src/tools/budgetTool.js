import { z } from 'zod';

const budgetItemSchema = z.object({
  category: z.enum(['Venue', 'Food', 'Decorations', 'Sound System', 'Transportation', 'Miscellaneous']),
  name: z.string().min(1),
  estimatedCost: z.number().nonnegative(),
  actualQuote: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
});

export const budgetInputSchema = z.object({
  totalBudget: z.number().positive('A positive totalBudget is required.'),
  participants: z.number().int().positive().default(100),
  currency: z.string().trim().min(1).max(8).default('INR'),
  eventType: z.string().trim().optional().default('College Event'),
  scaleFactor: z.number().positive().max(2).optional().default(1),
  items: z.array(budgetItemSchema).optional(),
  indoorContingency: z.boolean().optional().default(false),
});

function buildBaselineEstimateItems(participants, scaleFactor, indoorContingency) {
  // Transparent heuristic cost model for student/college events (clearly tagged as estimates).
  const perHeadFood = 160; // INR per participant estimate for snacks + beverages
  const baseVenue = indoorContingency ? 15000 : 10000;
  const venueScale = participants > 250 ? 1.4 : participants > 150 ? 1.15 : 1;

  const rawItems = [
    {
      category: 'Venue',
      name: indoorContingency ? 'Indoor Auditorium / Backup Marquee Setup' : 'Campus Venue & Seating Arrangement',
      estimatedCost: Math.round(baseVenue * venueScale * scaleFactor),
      notes: indoorContingency ? 'Includes weather contingency shelter' : 'College hall / courtyard setup',
    },
    {
      category: 'Food',
      name: `Refreshments & Catering (${participants} attendees)`,
      estimatedCost: Math.round(participants * perHeadFood * scaleFactor),
      notes: `Estimated at ${perHeadFood}/attendee`,
    },
    {
      category: 'Decorations',
      name: 'Stage Backdrop, Banners & Lighting',
      estimatedCost: Math.round(5500 * scaleFactor),
      notes: 'Reusable college club props + print banners',
    },
    {
      category: 'Sound System',
      name: 'PA System, Microphones & AV Operator',
      estimatedCost: Math.round(7500 * scaleFactor),
      notes: 'Speakers, mixer, 2 wireless mics',
    },
    {
      category: 'Transportation',
      name: 'Equipment & Guest Logistics',
      estimatedCost: Math.round(3500 * scaleFactor),
      notes: 'Local pickup and drop',
    },
    {
      category: 'Miscellaneous',
      name: 'Certificates, Printing & Contingency Buffer',
      estimatedCost: Math.round(4500 * scaleFactor),
      notes: 'Badges, stationery, emergency buffer',
    },
  ];

  return rawItems;
}

export async function runBudgetTool(rawInput) {
  const parsed = budgetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      tool: 'budget_calculator',
      errorCode: 'INVALID_BUDGET_INPUT',
      requiresUserInput: true,
      missingField: 'budget',
      message: parsed.error.issues.map((i) => i.message).join(' '),
    };
  }

  const { totalBudget, participants, currency, eventType, scaleFactor, items, indoorContingency } = parsed.data;
  const lineItems = (items && items.length > 0 ? items : buildBaselineEstimateItems(participants, scaleFactor, indoorContingency)).map(
    (item) => {
      const hasActualQuote = typeof item.actualQuote === 'number' && Number.isFinite(item.actualQuote);
      const effectiveCost = hasActualQuote ? item.actualQuote : item.estimatedCost;
      return {
        category: item.category,
        name: item.name,
        estimatedCost: item.estimatedCost,
        actualQuote: hasActualQuote ? item.actualQuote : null,
        effectiveCost,
        costType: hasActualQuote ? 'ACTUAL_QUOTE' : 'ESTIMATE',
        notes: item.notes || '',
      };
    }
  );

  const totalEstimated = lineItems.reduce((sum, item) => sum + item.effectiveCost, 0);
  const remainingBudget = totalBudget - totalEstimated;
  const overrunAmount = remainingBudget < 0 ? Math.abs(remainingBudget) : 0;
  const isOverBudget = remainingBudget < 0;
  const utilizationPct = Number(((totalEstimated / totalBudget) * 100).toFixed(1));
  const perParticipantCost = Number((totalEstimated / participants).toFixed(2));

  const categoryMap = new Map();
  for (const item of lineItems) {
    categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + item.effectiveCost);
  }
  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, amount]) => ({
    category,
    amount,
    sharePct: totalEstimated > 0 ? Number(((amount / totalEstimated) * 100).toFixed(1)) : 0,
  }));

  const suggestedAdjustments = [];
  if (isOverBudget) {
    const foodItem = lineItems.find((i) => i.category === 'Food');
    if (foodItem) {
      const saved = Math.round(foodItem.effectiveCost * 0.2);
      suggestedAdjustments.push(
        `Switch to boxed snack combos instead of full buffet to save ~${currency} ${saved.toLocaleString()}.`
      );
    }
    const venueItem = lineItems.find((i) => i.category === 'Venue');
    if (venueItem) {
      const saved = Math.round(venueItem.effectiveCost * 0.3);
      suggestedAdjustments.push(
        `Use a student-subsidized campus auditorium slot to reduce venue cost by ~${currency} ${saved.toLocaleString()}.`
      );
    }
    suggestedAdjustments.push(
      `Total estimated overrun is ${currency} ${overrunAmount.toLocaleString()}. Trim non-essential decorations or request college sponsorship.`
    );
  } else {
    suggestedAdjustments.push(
      `Estimated spend is within budget with ${currency} ${remainingBudget.toLocaleString()} (${(100 - utilizationPct).toFixed(1)}%) buffer remaining.`
    );
  }

  return {
    ok: !isOverBudget,
    tool: 'budget_calculator',
    errorCode: isOverBudget ? 'BUDGET_OVERRUN' : null,
    message: isOverBudget
      ? `Estimated expenditure (${currency} ${totalEstimated.toLocaleString()}) exceeds budget (${currency} ${totalBudget.toLocaleString()}) by ${currency} ${overrunAmount.toLocaleString()}.`
      : `Estimated budget fits within ${currency} ${totalBudget.toLocaleString()} limit.`,
    data: {
      eventType,
      currency,
      totalBudget,
      participants,
      totalEstimated,
      remainingBudget,
      overrunAmount,
      isOverBudget,
      utilizationPct,
      perParticipantCost,
      costLabel: 'ALL_UNQUOTED_COSTS_ARE_ESTIMATES',
      lineItems,
      categoryBreakdown,
      suggestedAdjustments,
    },
  };
}

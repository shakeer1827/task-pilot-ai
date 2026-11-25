import { z } from 'zod';

export const logisticsInputSchema = z.object({
  focus: z.enum(['schedule', 'vendor_checklist', 'contingency_plan', 'human_action_review']).default('vendor_checklist'),
  eventTitle: z.string().min(1),
  participants: z.number().int().positive().optional().default(100),
  location: z.string().optional().nullable(),
  eventDate: z.string().optional().nullable(),
  weatherRisk: z.string().optional().nullable(),
});

export async function runLogisticsTool(rawInput) {
  const parsed = logisticsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      tool: 'logistics_planner',
      errorCode: 'INVALID_LOGISTICS_INPUT',
      message: parsed.error.issues.map((i) => i.message).join(' '),
    };
  }

  const { focus, eventTitle, participants, location, eventDate, weatherRisk } = parsed.data;

  if (focus === 'human_action_review') {
    return {
      ok: true,
      tool: 'logistics_planner',
      requiresHumanAction: true,
      data: {
        focus,
        notice: 'Prepared draft action items for human confirmation. No external bookings or payments were made.',
        humanActionItems: [
          `Confirm venue booking availability at ${location || 'selected campus venue'} for ${eventDate || 'target date'}.`,
          'Obtain formal vendor quotations for catering and AV sound system.',
          'Submit student council / faculty advisor budget approval form.',
          'Publish registration link to participants once venue is locked.',
        ],
      },
    };
  }

  if (focus === 'contingency_plan') {
    return {
      ok: true,
      tool: 'logistics_planner',
      data: {
        focus,
        weatherRisk: weatherRisk || 'unknown',
        contingencySteps: [
          'Hold a backup indoor seminar hall or auditorium on tentative reservation 72 hours prior.',
          'Arrange covered canopy/tenting for sound console and electrical distribution boards.',
          'Assign a 3-person rapid-shift student volunteer crew to relocate seating if rain exceeds 40% probability.',
          'Keep digital signage ready to notify attendees of hall changes.',
        ],
      },
    };
  }

  if (focus === 'schedule') {
    return {
      ok: true,
      tool: 'logistics_planner',
      data: {
        focus,
        eventTitle,
        runOfShow: [
          { slot: 'T-120 min', activity: 'Venue handover, stage & AV sound check' },
          { slot: 'T-45 min', activity: 'Volunteer briefing & registration desk setup' },
          { slot: 'T-00 min', activity: `Doors open for ${participants} participants & welcome note` },
          { slot: 'T+30 min', activity: 'Main cultural showcase / performances' },
          { slot: 'T+150 min', activity: 'Refreshments break & networking' },
          { slot: 'T+210 min', activity: 'Closing remarks, awards & cleanup' },
        ],
      },
    };
  }

  return {
    ok: true,
    tool: 'logistics_planner',
    requiresHumanAction: true,
    data: {
      focus,
      eventTitle,
      note: 'Generated vendor & preparation checklist (draft only; requires human outreach & sign-off).',
      checklist: [
        { item: 'Campus venue permission letter & power backup check', owner: 'Human Organizer', status: 'action_required' },
        { item: `Catering quote request for ${participants} attendees`, owner: 'Human Organizer', status: 'action_required' },
        { item: 'PA sound & wireless mic rental inquiry', owner: 'Human Organizer', status: 'action_required' },
        { item: 'Volunteer roster (registration, stage, hospitality)', owner: 'Student Team', status: 'drafted' },
        { item: 'First-aid kit & campus security notification', owner: 'Human Organizer', status: 'action_required' },
      ],
    },
  };
}

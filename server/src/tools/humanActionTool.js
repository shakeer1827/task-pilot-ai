import { z } from 'zod';

export const humanActionInputSchema = z.object({
  taskTitle: z.string().min(1),
  taskDescription: z.string().optional().default(''),
  goalTitle: z.string().optional().default(''),
});

export async function runHumanActionTool(rawInput) {
  const parsed = humanActionInputSchema.safeParse(rawInput || {});
  if (!parsed.success) {
    return {
      ok: false,
      toolName: 'human_action',
      errorCode: 'INVALID_INPUT',
      message: 'Invalid human action task payload.',
    };
  }

  const { taskTitle, taskDescription } = parsed.data;

  return {
    ok: true,
    toolName: 'human_action',
    requiresHumanAction: true,
    nextStatus: 'Awaiting approval',
    checklist: [
      `Review task requirements: ${taskTitle}`,
      taskDescription || 'Coordinate directly with campus administration, vendors, or team leads.',
      'Confirm completion or provide vendor/booking details in TaskPilot AI before finalizing.',
    ],
    disclaimer: 'TaskPilot AI does not perform external bookings, payments, or third-party messages autonomously.',
    summary: `Prepared action checklist for "${taskTitle}". Awaiting human confirmation.`,
  };
}

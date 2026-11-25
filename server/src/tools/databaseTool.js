import { z } from 'zod';

export const databaseToolInputSchema = z.object({
  operation: z.enum(['save_checkpoint', 'verify_plan_persistence', 'save_summary']).default('save_checkpoint'),
  summary: z.string().min(1),
  metadata: z.record(z.unknown()).optional().default({}),
});

export async function runDatabaseTool(rawInput, context = {}) {
  const parsed = databaseToolInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      tool: 'database_save',
      errorCode: 'INVALID_DB_INPUT',
      message: parsed.error.issues.map((i) => i.message).join(' '),
    };
  }

  const { repository, userId, planId, executionId } = context;
  if (!repository || !userId) {
    return {
      ok: false,
      tool: 'database_save',
      errorCode: 'DB_CONTEXT_MISSING',
      message: 'Database tool requires authenticated repository context.',
    };
  }

  try {
    if (context.simulateDbFailure) {
      throw new Error('Simulated database write failure for resilience testing.');
    }

    const plan = planId ? await repository.getPlanById(userId, planId) : null;
    if (planId && !plan) {
      return {
        ok: false,
        tool: 'database_save',
        errorCode: 'PLAN_NOT_FOUND',
        message: 'Could not verify plan record in database.',
      };
    }

    const updatedPlanJson = {
      ...(plan?.plan_json || {}),
      last_checkpoint: {
        executionId: executionId || null,
        operation: parsed.data.operation,
        summary: parsed.data.summary,
        metadata: parsed.data.metadata,
        savedAt: new Date().toISOString(),
      },
    };

    if (plan) {
      await repository.updatePlan(userId, plan.id, { plan_json: updatedPlanJson });
    }

    return {
      ok: true,
      tool: 'database_save',
      data: {
        storageMode: repository.getStorageInfo().mode,
        operation: parsed.data.operation,
        planId: plan?.id || null,
        executionId: executionId || null,
        verifiedAt: new Date().toISOString(),
        summary: parsed.data.summary,
      },
    };
  } catch (error) {
    return {
      ok: false,
      tool: 'database_save',
      errorCode: 'DATABASE_SAVE_FAILED',
      message: `Database persistence failed: ${error.message}`,
    };
  }
}

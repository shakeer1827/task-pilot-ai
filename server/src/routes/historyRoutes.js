import express from 'express';
import { runPlannerAgent } from '../agents/plannerAgent.js';

export function createHistoryRouter(repository, engine) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const [executions, goals, plans] = await Promise.all([
        repository.listExecutionsByUser(req.user.id),
        repository.listGoalsByUser(req.user.id),
        repository.listPlansByUser(req.user.id),
      ]);

      const goalMap = new Map(goals.map((g) => [g.id, g]));
      const planMap = new Map(plans.map((p) => [p.id, p]));

      const history = await Promise.all(
        executions.map(async (ex) => {
          const tasks = await repository.listTasksByPlan(req.user.id, ex.plan_id);
          const goal = goalMap.get(ex.goal_id);
          const plan = planMap.get(ex.plan_id);
          return {
            id: ex.id,
            plan_id: ex.plan_id,
            goal_id: ex.goal_id,
            goal_title: goal?.title || 'Untitled Goal',
            goal_location: goal?.location || null,
            goal_event_date: goal?.event_date || null,
            goal_budget: goal?.budget ?? null,
            plan_version: plan?.version || 1,
            status: ex.status,
            started_at: ex.started_at,
            completed_at: ex.completed_at,
            duration_ms: ex.duration_ms,
            created_at: ex.created_at,
            completed_tasks: tasks.filter((t) => t.status === 'completed').length,
            failed_tasks: tasks.filter((t) => ['failed', 'interrupted'].includes(t.status)).length,
            total_tasks: tasks.length,
            has_report: Boolean(ex.final_report),
          };
        })
      );

      res.json({ history });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const state = await engine.getFullExecutionState(req.user.id, req.params.id);
      if (!state) {
        return res.status(404).json({ error: 'Execution history record not found.' });
      }
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  // Rerun creates a brand-new plan version without overwriting the previous execution record
  router.post('/:id/rerun', async (req, res, next) => {
    try {
      const oldExecution = await repository.getExecutionById(req.user.id, req.params.id);
      if (!oldExecution) {
        return res.status(404).json({ error: 'Original execution record not found.' });
      }

      const goal = await repository.getGoalById(req.user.id, oldExecution.goal_id);
      if (!goal) {
        return res.status(404).json({ error: 'Original goal not found.' });
      }

      const existingPlans = await repository.listPlansByGoal(req.user.id, goal.id);
      const nextVersion = existingPlans.length > 0 ? Math.max(...existingPlans.map((p) => p.version)) + 1 : 1;

      const { aiProvider, plan: generated } = await runPlannerAgent(goal);
      const newPlan = await repository.createPlan(req.user.id, {
        goalId: goal.id,
        version: nextVersion,
        planJson: {
          goal_summary: generated.goal_summary,
          inferred_details: generated.inferred_details,
          missing_info: generated.missing_info,
          rerun_from_execution_id: oldExecution.id,
        },
        approvalStatus: 'draft',
        aiProvider,
      });

      const tasks = await repository.replacePlanTasks(req.user.id, newPlan.id, generated.tasks);
      res.status(201).json({ goal, plan: newPlan, tasks });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

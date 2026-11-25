import express from 'express';
import { z } from 'zod';
import { runPlannerAgent } from '../agents/plannerAgent.js';

const generatePlanSchema = z.object({
  goalId: z.string().uuid('Valid goalId is required.'),
  clarifications: z.record(z.unknown()).optional(),
});

const editTaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(1000),
  execution_order: z.number().int().positive(),
  tool_name: z.enum(['weather_forecast', 'budget_calculator', 'logistics_planner', 'database_save', 'none']).default('none'),
  dependencies: z.array(z.number().int().positive()).default([]),
  expected_result: z.string().max(500).optional().default(''),
  failure_handling: z.string().max(500).optional().default(''),
  requires_human_action: z.boolean().optional().default(false),
  input_payload: z.record(z.unknown()).optional().default({}),
});

const updatePlanSchema = z.object({
  tasks: z.array(editTaskSchema).min(1, 'Plan must contain at least one task.'),
});

export function createPlanRouter(repository) {
  const router = express.Router();

  router.post('/generate', async (req, res, next) => {
    try {
      const { goalId, clarifications } = generatePlanSchema.parse(req.body);
      let goal = await repository.getGoalById(req.user.id, goalId);
      if (!goal) {
        return res.status(404).json({ error: 'Goal not found.' });
      }

      if (clarifications && Object.keys(clarifications).length > 0) {
        const merged = { ...(goal.clarifications_json || {}), ...clarifications };
        const goalUpdates = { clarifications_json: merged };
        if (clarifications.location) goalUpdates.location = String(clarifications.location).trim();
        if (clarifications.event_date) goalUpdates.event_date = String(clarifications.event_date).trim();
        if (clarifications.budget) goalUpdates.budget = Number(clarifications.budget);
        if (clarifications.participants) goalUpdates.participants = Number(clarifications.participants);
        goal = await repository.updateGoal(req.user.id, goal.id, goalUpdates);
      }

      const existingPlans = await repository.listPlansByGoal(req.user.id, goal.id);
      const nextVersion = existingPlans.length > 0 ? Math.max(...existingPlans.map((p) => p.version)) + 1 : 1;

      const { aiProvider, plan: generated } = await runPlannerAgent(goal);

      // Update goal missing_info_json & inferred defaults if missing
      const goalPatch = {
        missing_info_json: generated.missing_info || [],
      };
      if (!goal.event_date && generated.inferred_details?.event_date) {
        goalPatch.event_date = generated.inferred_details.event_date;
      }
      if (!goal.location && generated.inferred_details?.location) {
        goalPatch.location = generated.inferred_details.location;
      }
      if (!goal.budget && generated.inferred_details?.budget) {
        goalPatch.budget = Number(generated.inferred_details.budget);
      }
      if (!goal.participants && generated.inferred_details?.participants) {
        goalPatch.participants = Number(generated.inferred_details.participants);
      }
      goal = await repository.updateGoal(req.user.id, goal.id, goalPatch);

      const savedPlan = await repository.createPlan(req.user.id, {
        goalId: goal.id,
        version: nextVersion,
        planJson: {
          goal_summary: generated.goal_summary,
          inferred_details: generated.inferred_details,
          missing_info: generated.missing_info,
        },
        approvalStatus: 'draft',
        aiProvider,
      });

      const savedTasks = await repository.replacePlanTasks(req.user.id, savedPlan.id, generated.tasks);

      res.status(201).json({
        goal,
        plan: savedPlan,
        tasks: savedTasks,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const plan = await repository.getPlanById(req.user.id, req.params.id);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found.' });
      }
      const [goal, tasks] = await Promise.all([
        repository.getGoalById(req.user.id, plan.goal_id),
        repository.listTasksByPlan(req.user.id, plan.id),
      ]);
      res.json({ plan, goal, tasks });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const plan = await repository.getPlanById(req.user.id, req.params.id);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found.' });
      }

      const { tasks } = updatePlanSchema.parse(req.body);
      const reordered = tasks
        .sort((a, b) => a.execution_order - b.execution_order)
        .map((t, idx) => ({
          ...t,
          execution_order: idx + 1,
          status: 'pending',
        }));

      const savedTasks = await repository.replacePlanTasks(req.user.id, plan.id, reordered);
      const updatedPlan = await repository.updatePlan(req.user.id, plan.id, {
        approval_status: 'draft',
      });

      res.json({ plan: updatedPlan, tasks: savedTasks });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/approve', async (req, res, next) => {
    try {
      const plan = await repository.getPlanById(req.user.id, req.params.id);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found.' });
      }
      const tasks = await repository.listTasksByPlan(req.user.id, plan.id);
      if (tasks.length === 0) {
        return res.status(400).json({ error: 'Cannot approve an empty plan.' });
      }

      const approved = await repository.updatePlan(req.user.id, plan.id, {
        approval_status: 'approved',
      });
      res.json({ plan: approved, tasks });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

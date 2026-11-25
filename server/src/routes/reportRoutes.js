import express from 'express';
import { runReporterAgent } from '../agents/reporterAgent.js';

export function createReportRouter(repository) {
  const router = express.Router();

  router.get('/:executionId', async (req, res, next) => {
    try {
      const execution = await repository.getExecutionById(req.user.id, req.params.executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found.' });
      }

      const [goal, plan, tasks, logs] = await Promise.all([
        repository.getGoalById(req.user.id, execution.goal_id),
        repository.getPlanById(req.user.id, execution.plan_id),
        repository.listTasksByPlan(req.user.id, execution.plan_id),
        repository.listAgentLogsByExecution(req.user.id, execution.id),
      ]);

      let report = execution.final_report;
      if (!report) {
        report = await runReporterAgent({ goal, execution, tasks, logs });
      }

      res.json({
        execution,
        goal,
        plan,
        tasks,
        logs,
        report,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

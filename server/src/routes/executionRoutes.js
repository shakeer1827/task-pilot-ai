import express from 'express';
import { z } from 'zod';

const isServerless = Boolean(process.env.VERCEL);

const startSchema = z.object({
  planId: z.string().uuid('Valid planId is required.'),
  waitForCompletion: z.boolean().optional().default(isServerless),
});

const retrySchema = z.object({
  taskId: z.string().uuid().optional(),
  waitForCompletion: z.boolean().optional().default(isServerless),
});

const clarifySchema = z.object({
  clarifications: z.record(z.unknown()),
  waitForCompletion: z.boolean().optional().default(isServerless),
});

export function createExecutionRouter(repository, engine) {
  const router = express.Router();

  router.post('/start', async (req, res, next) => {
    try {
      const { planId, waitForCompletion } = startSchema.parse(req.body);
      const state = await engine.startExecution(req.user.id, planId, { waitForCompletion });
      res.status(201).json(state);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const state = await engine.getFullExecutionState(req.user.id, req.params.id);
      if (!state) {
        return res.status(404).json({ error: 'Execution not found.' });
      }
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/stream', async (req, res, next) => {
    try {
      const execution = await repository.getExecutionById(req.user.id, req.params.id);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found.' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const initialState = await engine.getFullExecutionState(req.user.id, execution.id);
      res.write(`event: snapshot\ndata: ${JSON.stringify(initialState)}\n\n`);

      const unsubscribe = engine.subscribe(execution.id, (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe();
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/pause', async (req, res, next) => {
    try {
      const execution = await engine.pauseExecution(req.user.id, req.params.id);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found.' });
      }
      const state = await engine.getFullExecutionState(req.user.id, req.params.id);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/resume', async (req, res, next) => {
    try {
      const state = await engine.resumeExecution(req.user.id, req.params.id, {
        waitForCompletion: isServerless,
      });
      if (!state) {
        return res.status(404).json({ error: 'Execution not found.' });
      }
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/stop', async (req, res, next) => {
    try {
      const state = await engine.stopExecution(req.user.id, req.params.id);
      if (!state) {
        return res.status(404).json({ error: 'Execution not found.' });
      }
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/retry', async (req, res, next) => {
    try {
      const { taskId, waitForCompletion } = retrySchema.parse(req.body || {});
      const state = await engine.retryFailedTask(req.user.id, req.params.id, taskId, { waitForCompletion });
      if (!state) {
        return res.status(404).json({ error: 'Execution not found.' });
      }
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/clarify', async (req, res, next) => {
    try {
      const { clarifications, waitForCompletion } = clarifySchema.parse(req.body);
      const state = await engine.supplyClarificationAndResume(req.user.id, req.params.id, clarifications, {
        waitForCompletion,
      });
      if (!state) {
        return res.status(404).json({ error: 'Execution not found.' });
      }
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

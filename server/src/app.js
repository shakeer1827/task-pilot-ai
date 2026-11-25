import express from 'express';
import { z } from 'zod';
import cors from 'cors';
import helmet from 'helmet';
import { env, isGeminiConfigured, isSupabaseConfigured } from './config/env.js';
import { defaultRepository } from './db/repository.js';
import { ExecutionEngine } from './services/executionEngine.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createGoalRouter } from './routes/goalRoutes.js';
import { createPlanRouter } from './routes/planRoutes.js';
import { createExecutionRouter } from './routes/executionRoutes.js';
import { createHistoryRouter } from './routes/historyRoutes.js';
import { createReportRouter } from './routes/reportRoutes.js';

export function createApp({ repository = defaultRepository, engine } = {}) {
  const app = express();
  const executionEngine = engine || new ExecutionEngine(repository);
  const requireAuth = createAuthMiddleware(repository);

  const allowedOrigins = new Set(env.clientUrl.split(',').map((s) => s.trim()));
  if (process.env.VERCEL_URL) allowedOrigins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    allowedOrigins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin) || /\.vercel\.app$/i.test(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'taskpilot-ai-server',
      timestamp: new Date().toISOString(),
      storage: repository.getStorageInfo(),
      ai: {
        geminiConfigured: isGeminiConfigured(),
        model: env.geminiModel,
        fallbackMode: env.aiFallbackMode,
      },
      supabaseConfigured: isSupabaseConfigured(),
    });
  });

  app.use('/api/auth', createAuthRouter(repository, requireAuth));
  app.use('/api/goals', requireAuth, createGoalRouter(repository));
  app.use('/api/plans', requireAuth, createPlanRouter(repository));
  app.use('/api/executions', requireAuth, createExecutionRouter(repository, executionEngine));
  app.use('/api/history', requireAuth, createHistoryRouter(repository, executionEngine));
  app.use('/api/reports', requireAuth, createReportRouter(repository));

  app.get('/api/dashboard', requireAuth, async (req, res, next) => {
    try {
      const data = await repository.getDashboardData(req.user.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Agent execute convenience endpoint (requires approved plan)
  app.post('/api/agent/execute', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({
        planId: z.string().uuid(),
        waitForCompletion: z.boolean().optional().default(Boolean(process.env.VERCEL)),
      });
      const { planId, waitForCompletion } = schema.parse(req.body);
      const state = await executionEngine.startExecution(req.user.id, planId, { waitForCompletion });
      res.status(201).json(state);
    } catch (err) {
      next(err);
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, repository, executionEngine };
}

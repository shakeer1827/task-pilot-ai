import { ZodError } from 'zod';
import { GeminiConfigError } from '../agents/geminiClient.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof GeminiConfigError) {
    return res.status(503).json({
      error: err.message,
      errorCode: err.code,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? err.message || 'Internal server error' : err.message;
  if (statusCode >= 500) {
    console.error('[Server Error]', err);
  }
  res.status(statusCode).json({ error: message });
}

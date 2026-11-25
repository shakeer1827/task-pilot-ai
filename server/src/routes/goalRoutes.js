import express from 'express';
import { z } from 'zod';
import { extractGoalHints } from '../agents/plannerAgent.js';

const createGoalSchema = z.object({
  title: z.string().trim().min(3, 'Goal title must be at least 3 characters.').max(200).optional(),
  description: z.string().trim().min(10, 'Please describe your goal in at least 10 characters.').max(2000),
  event_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Event date must be YYYY-MM-DD')
    .optional()
    .nullable()
    .or(z.literal('')),
  location: z.string().trim().max(150).optional().nullable(),
  budget: z.coerce.number().positive().optional().nullable().or(z.literal('')),
  participants: z.coerce.number().int().positive().optional().nullable().or(z.literal('')),
  additional_instructions: z.string().trim().max(1000).optional().nullable(),
});

const patchGoalSchema = z.object({
  event_date: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  budget: z.coerce.number().positive().optional().nullable(),
  participants: z.coerce.number().int().positive().optional().nullable(),
  additional_instructions: z.string().trim().optional().nullable(),
  clarifications_json: z.record(z.unknown()).optional(),
});

export function createGoalRouter(repository) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createGoalSchema.parse(req.body);
      const rawTitle = parsed.title || parsed.description.split(/[.!?\n]/)[0].slice(0, 100).trim();
      const normalized = {
        title: rawTitle || 'Event Planning Goal',
        description: parsed.description,
        event_date: parsed.event_date ? parsed.event_date : null,
        location: parsed.location ? parsed.location : null,
        budget: parsed.budget !== '' && parsed.budget !== undefined && parsed.budget !== null ? Number(parsed.budget) : null,
        participants:
          parsed.participants !== '' && parsed.participants !== undefined && parsed.participants !== null
            ? Number(parsed.participants)
            : null,
        additional_instructions: parsed.additional_instructions || null,
        is_demo: Boolean(req.user.is_demo),
      };

      const hints = extractGoalHints(normalized);
      if (!normalized.event_date && hints.eventDate) normalized.event_date = hints.eventDate;
      if (!normalized.location && hints.location) normalized.location = hints.location;
      if (!normalized.budget && hints.budget) normalized.budget = hints.budget;
      if (!normalized.participants && hints.participants) normalized.participants = hints.participants;

      const goal = await repository.createGoal(req.user.id, normalized);
      res.status(201).json({ goal });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const goals = await repository.listGoalsByUser(req.user.id);
      res.json({ goals });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const goal = await repository.getGoalById(req.user.id, req.params.id);
      if (!goal) {
        return res.status(404).json({ error: 'Goal not found.' });
      }
      const plans = await repository.listPlansByGoal(req.user.id, goal.id);
      res.json({ goal, plans });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const updates = patchGoalSchema.parse(req.body);
      const existing = await repository.getGoalById(req.user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Goal not found.' });
      }
      const mergedClarifications = {
        ...(existing.clarifications_json || {}),
        ...(updates.clarifications_json || {}),
      };
      const updated = await repository.updateGoal(req.user.id, existing.id, {
        ...updates,
        clarifications_json: mergedClarifications,
      });
      res.json({ goal: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

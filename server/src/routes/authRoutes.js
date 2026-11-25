import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signAuthToken } from '../middleware/auth.js';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  email: z.string().trim().email('Please provide a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128, 'Password is too long.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export function createAuthRouter(repository, requireAuth) {
  const router = express.Router();

  router.post('/register', async (req, res, next) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await repository.findUserByEmail(data.email);
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const user = await repository.createUser({
        name: data.name,
        email: data.email,
        passwordHash,
        isDemo: false,
      });

      const token = signAuthToken(user);
      res.status(201).json({ user, token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const data = loginSchema.parse(req.body);
      const userWithHash = await repository.findUserByEmail(data.email);
      if (!userWithHash) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const valid = await bcrypt.compare(data.password, userWithHash.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const user = {
        id: userWithHash.id,
        name: userWithHash.name,
        email: userWithHash.email,
        is_demo: userWithHash.is_demo,
        created_at: userWithHash.created_at,
      };
      const token = signAuthToken(user);
      res.json({ user, token });
    } catch (err) {
      next(err);
    }
  });

  // Clearly labeled isolated Demo Evaluation Account (never mixes with real user accounts)
  router.post('/demo', async (req, res, next) => {
    try {
      const demoEmail = 'judge-demo@taskpilot.ai';
      let demoUser = await repository.findUserByEmail(demoEmail);
      if (!demoUser) {
        const passwordHash = await bcrypt.hash('DemoJudge!2026', 10);
        demoUser = await repository.createUser({
          name: 'Hackathon Judge (Demo)',
          email: demoEmail,
          passwordHash,
          isDemo: true,
        });
      }
      const user = {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        is_demo: true,
        created_at: demoUser.created_at,
      };
      const token = signAuthToken(user);
      res.json({
        user,
        token,
        demoNotice: 'Signed into isolated Demo Evaluation workspace. All tool executions still run live on the backend.',
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

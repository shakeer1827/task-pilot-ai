import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      isDemo: Boolean(user.is_demo),
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function createAuthMiddleware(repository) {
  return async function requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      let token = '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (typeof req.query?.token === 'string' && req.path.endsWith('/stream')) {
        token = req.query.token.trim();
      }

      if (!token) {
        return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
      }

      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await repository.findUserById(decoded.sub);
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session. User no longer exists.' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };
}

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(serverRoot, '.env') });
dotenv.config({ path: path.resolve(serverRoot, '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || '';

if (nodeEnv === 'production' && (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('replace-with'))) {
  throw new Error('FATAL: JWT_SECRET must be set to a strong secret (>= 32 chars) in production.');
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: jwtSecret || 'taskpilot-dev-only-secret-change-before-production-32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
  aiFallbackMode: (process.env.AI_FALLBACK_MODE || 'off').trim().toLowerCase(),
  supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  localDbPath: process.env.LOCAL_DB_PATH
    ? path.resolve(serverRoot, process.env.LOCAL_DB_PATH)
    : process.env.VERCEL
    ? '/tmp/taskpilot.db'
    : path.join(serverRoot, 'data', 'taskpilot.db'),
};

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isGeminiConfigured() {
  return Boolean(env.geminiApiKey);
}

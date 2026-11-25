import { env } from './config/env.js';
import { createApp } from './app.js';

const { app, repository } = createApp();

if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    const storage = repository.getStorageInfo();
    console.log(`TaskPilot AI backend listening on http://localhost:${env.port}`);
    console.log(`Storage mode: ${storage.mode} | Gemini configured: ${Boolean(env.geminiApiKey)} | AI fallback: ${env.aiFallbackMode}`);
  });
}

export default app;

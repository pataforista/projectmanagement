import { Hono } from 'hono';
import { AIController } from '../controllers/aiController.js';

export function createAIRoutes() {
  const router = new Hono();
  const controller = new AIController();

  // GET proxy (e.g. /api/ai/ollama/tags)
  router.get('/ollama/:endpoint', (c) => controller.proxyOllamaGet(c));

  // POST proxy (e.g. /api/ai/ollama/generate)
  router.post('/ollama/:endpoint', (c) => controller.proxyOllama(c));

  return router;
}

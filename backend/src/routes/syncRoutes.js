import { Hono } from 'hono';
import SyncController from '../controllers/syncController.js';
import { authMiddleware } from '../middleware/auth.js';

export function createSyncRoutes() {
  const router = new Hono();
  const syncController = new SyncController();

  router.use('*', authMiddleware);

  router.post('/push', (c) => syncController.pushChanges(c));
  router.get('/pull', (c) => syncController.pullChanges(c));

  return router;
}

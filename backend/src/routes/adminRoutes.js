import { Hono } from 'hono';
import AdminController from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/auth.js';

export function createAdminRoutes() {
  const router = new Hono();
  const adminController = new AdminController();

  // All admin endpoints require a valid session
  router.use('*', authMiddleware);

  // Admin key management
  router.get('/status', (c) => adminController.getStatus(c));
  router.post('/key', (c) => adminController.setKey(c));
  router.post('/verify-key', (c) => adminController.verifyKey(c));

  // Member management (critical — validated against admin key)
  router.patch('/members/:id/role', (c) => adminController.updateMemberRole(c));
  router.delete('/members/:id', (c) => adminController.deleteMember(c));

  // Audit log (requires admin key to read)
  router.get('/audit-log', (c) => adminController.getAuditLog(c));

  return router;
}

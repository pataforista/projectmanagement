import { Hono } from 'hono';
import AuthController from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

export function createAuthRoutes() {
  const router = new Hono();
  const authController = new AuthController();

  /**
   * POST /google
   * Login con Google ID Token
   */
  router.post('/google', async (c) => authController.login(c));

  /**
   * POST /refresh
   * Renovar access token
   */
  router.post('/refresh', async (c) => authController.refresh(c));

  /**
   * POST /logout
   * Logout
   */
  router.post('/logout', authMiddleware, async (c) => authController.logout(c));

  return router;
}

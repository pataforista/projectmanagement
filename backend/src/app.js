import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';

export function createApp() {
  const app = new Hono();

  // Middleware
  app.use('*', honoLogger());
  app.use('*', async (c, next) => {
    const origin = c.env?.CORS_ORIGIN || 'http://localhost:5173';
    return cors({
      origin: origin.split(','),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
      exposeHeaders: ['Content-Length'],
      maxAge: 600,
      credentials: true,
    })(c, next);
  });

  // Root route
  app.get('/', (c) => {
    return c.json({
      message: 'Workspace Backend - Cloudflare Worker',
      status: 'running',
      health: '/health'
    });
  });

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Placeholder for modular routes
  // app.route('/auth', authRoutes);
  // app.route('/api/sync', syncRoutes);

  app.onError((err, c) => {
    console.error(`[Error] ${err.message}`, err);
    return c.json({
      error: 'Internal Server Error',
      message: err.message,
    }, 500);
  });

  return app;
}

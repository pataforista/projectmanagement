import { createApp } from './app.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createSyncRoutes } from './routes/syncRoutes.js';
import { createAdminRoutes } from './routes/adminRoutes.js';

const app = createApp();

// Initialize routes with D1 bindings via middleware or direct injection if needed
// In Cloudflare, env is available in every request context 'c.env'
app.route('/auth', createAuthRoutes());
app.route('/api/sync', createSyncRoutes());
app.route('/api/admin', createAdminRoutes());

export default app;

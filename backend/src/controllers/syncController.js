import { SyncService } from '../services/syncService.js';

export default class SyncController {
  constructor() {
    this.syncService = new SyncService();
  }

  async pushChanges(c) {
    const userId = c.get('userId');
    const deviceId = c.req.header('x-device-id') || 'unknown';
    const body = await c.req.json();
    const changes = body.changes;

    if (!changes || !Array.isArray(changes)) {
      return c.json({ status: 'error', message: 'Invalid payload: changes array expected' }, 400);
    }

    try {
      const results = await this.syncService.processPush(c.env.DB, userId, deviceId, changes);
      return c.json({
        status: 'success',
        syncedAt: new Date().toISOString(),
        results
      });
    } catch (error) {
      console.error('[SyncController] Push error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }

  async pullChanges(c) {
    const userId = c.get('userId');
    const deviceId = c.req.header('x-device-id') || 'unknown';
    const lastSyncTime = c.req.query('lastSyncTime') || null;

    try {
      const pullData = await this.syncService.processPull(c.env.DB, userId, deviceId, lastSyncTime);
      return c.json({
        status: 'success',
        ...pullData
      });
    } catch (error) {
      console.error('[SyncController] Pull error:', error);
      return c.json({ status: 'error', message: error.message }, 500);
    }
  }
}

export class SyncService {
  constructor() {
    // Map of entity types to table names (for security and consistency)
    this.entityTables = {
      'project': 'projects',
      'task': 'tasks',
      'cycle': 'cycles',
      'decision': 'decisions',
      'document': 'documents',
      'member': 'members',
      'log': 'logs'
    };

    // Tables that have a user_id column for ownership scoping.
    // tasks, cycles, decisions, documents belong to a project (not directly to a user).
    this.tablesWithUserId = new Set(['projects', 'notes', 'members', 'logs']);
  }

  /**
   * Processes a batch of granular changes from a client.
   * In Cloudflare D1, we use db.batch() for atomic transactions.
   */
  async processPush(db, userId, deviceId, changes) {
    if (!changes || !Array.isArray(changes)) return [];
    
    const results = [];
    const statements = [];

    for (const change of changes) {
      try {
        const tableName = this.entityTables[change.entityType];
        if (!tableName) {
          throw new Error(`Unsupported entity type: ${change.entityType}`);
        }

        // 1. Prepare sync_queue statement
        const queueStmt = db.prepare(`
          INSERT INTO sync_queue (user_id, client_id, action, entity_type, entity_id, payload, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          userId,
          deviceId,
          change.action,
          change.entityType,
          change.entityId,
          JSON.stringify(change.payload || {}),
          Date.now()
        );
        statements.push(queueStmt);

        // 2. Prepare table application statement
        const applyStmt = this.prepareApplyStatement(db, userId, tableName, change);
        if (applyStmt) statements.push(applyStmt);
        
        results.push({ entityId: change.entityId, status: 'success' });
      } catch (error) {
        console.error(`[SyncService] Error preparing change ${change.entityId}:`, error);
        results.push({ entityId: change.entityId, status: 'error', error: error.message });
      }
    }

    if (statements.length > 0) {
      // Execute all statements as a single transaction
      await db.batch(statements);
    }

    await this.updateCursor(db, userId, deviceId);
    return results;
  }

  prepareApplyStatement(db, userId, tableName, change) {
    const payload = change.payload || {};
    const entityId = change.entityId;

    if (change.action === 'DELETE') {
      // Only tables that have a user_id column can be scoped by it.
      // Tables like tasks, cycles, decisions, documents belong to a project instead.
      if (this.tablesWithUserId.has(tableName)) {
        return db.prepare(`UPDATE ${tableName} SET _deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?`)
                 .bind(Date.now(), entityId, userId);
      }
      return db.prepare(`UPDATE ${tableName} SET _deleted = 1, updated_at = ? WHERE id = ?`)
               .bind(Date.now(), entityId);
    }

    // Generic UPSERT for D1
    // Filter out internal fields from payload
    const columns = Object.keys(payload).filter(col => !['id', 'user_id', 'created_at', 'updated_at', '_deleted'].includes(col));
    
    // Cloudflare D1 supports ON CONFLICT
    const now = Date.now();
    const cols = ['id', 'user_id', 'created_at', 'updated_at', ...columns];
    const placeHolders = cols.map(() => '?').join(', ');
    const updateAssigns = columns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
    
    const sql = `
      INSERT INTO ${tableName} (${cols.join(', ')})
      VALUES (${placeHolders})
      ON CONFLICT(id) DO UPDATE SET 
        ${updateAssigns},
        updated_at = EXCLUDED.updated_at,
        _deleted = 0
    `;

    const values = [
        entityId, 
        userId, 
        payload.createdAt || now, 
        now, 
        ...columns.map(col => {
            const val = payload[col];
            return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
        })
    ];

    return db.prepare(sql).bind(...values);
  }

  async processPull(db, userId, deviceId, lastSyncTime) {
    // Fetch all changes from sync_queue after lastSyncTime
    // Skip changes originating from the same deviceId
    const time = lastSyncTime ? (parseInt(lastSyncTime) || 0) : 0;
    
    const { results } = await db.prepare(`
      SELECT * FROM sync_queue 
      WHERE user_id = ? AND client_id != ? AND timestamp > ? 
      ORDER BY timestamp ASC 
      LIMIT 1000
    `).bind(userId, deviceId, time).all();

    const maxTimestamp = results.length > 0 ? results[results.length - 1].timestamp : time;

    return {
      lastSyncTime: maxTimestamp,
      changes: results.map(c => ({
        action: c.action,
        entityType: c.entity_type,
        entityId: c.entity_id,
        payload: JSON.parse(c.payload),
        timestamp: c.timestamp
      }))
    };
  }

  async updateCursor(db, userId, deviceId) {
    const now = Date.now();
    await db.prepare(`
      INSERT INTO sync_cursor (user_id, client_id, last_sync_time)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, client_id) DO UPDATE SET last_sync_time = EXCLUDED.last_sync_time
    `).bind(userId, deviceId, now).run();
  }
}

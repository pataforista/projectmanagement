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

    // Schema metadata: defines the owner column and available timestamp columns
    // per table so the generic UPSERT builds correct SQL for each table shape.
    this.tableSchema = {
      'projects':  { ownerCol: 'user_id',    hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
      'tasks':     { ownerCol: 'project_id', hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
      'cycles':    { ownerCol: 'project_id', hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
      'decisions': { ownerCol: 'project_id', hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
      'documents': { ownerCol: 'project_id', hasCreatedAt: false, hasUpdatedAt: true,  hasDeleted: true  },
      'members':   { ownerCol: null,         hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
      'logs':      { ownerCol: 'user_id',    hasCreatedAt: false, hasUpdatedAt: false, hasDeleted: false },
      'notes':     { ownerCol: 'user_id',    hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
    };
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
    const schema = this.tableSchema[tableName];

    if (!schema) {
      console.warn(`[SyncService] No schema metadata for table ${tableName}, skipping apply.`);
      return null;
    }

    // --- Special handling for 'logs' table (no _deleted, no updated_at, no created_at) ---
    if (tableName === 'logs') {
      if (change.action === 'DELETE') {
        // logs table has no _deleted column — skip
        return null;
      }
      // logs: INSERT OR IGNORE (id, user_id, type, message, timestamp)
      return db.prepare(`
        INSERT OR IGNORE INTO logs (id, user_id, type, message, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        entityId,
        userId,
        payload.type || 'sync',
        payload.message || '',
        payload.timestamp || Date.now()
      );
    }

    // --- DELETE ---
    if (change.action === 'DELETE') {
      if (!schema.hasDeleted) return null;

      if (this.tablesWithUserId.has(tableName)) {
        return db.prepare(`UPDATE ${tableName} SET _deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?`)
                 .bind(Date.now(), entityId, userId);
      }
      return db.prepare(`UPDATE ${tableName} SET _deleted = 1, updated_at = ? WHERE id = ?`)
               .bind(Date.now(), entityId);
    }

    // --- CREATE / UPDATE: Schema-aware UPSERT ---
    // Filter out internal/system fields from payload
    const systemFields = new Set(['id', 'user_id', 'project_id', 'created_at', 'updated_at', '_deleted']);
    const columns = Object.keys(payload).filter(col => !systemFields.has(col));

    const now = Date.now();

    // Build column list based on actual table schema
    const cols = ['id'];
    const vals = [entityId];

    // Owner column: user_id for user-owned tables, project_id for project-owned tables
    if (schema.ownerCol === 'user_id') {
      cols.push('user_id');
      vals.push(userId);
    } else if (schema.ownerCol === 'project_id') {
      cols.push('project_id');
      // project_id comes from the payload (the client knows which project this belongs to)
      vals.push(payload.project_id || payload.projectId || '');
    }

    if (schema.hasCreatedAt) {
      cols.push('created_at');
      vals.push(payload.createdAt || now);
    }
    if (schema.hasUpdatedAt) {
      cols.push('updated_at');
      vals.push(now);
    }

    // Add data columns
    cols.push(...columns);
    vals.push(...columns.map(col => {
      const val = payload[col];
      return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
    }));

    const placeHolders = cols.map(() => '?').join(', ');
    const updateAssigns = columns.map(col => `${col} = EXCLUDED.${col}`).join(', ');

    // Build ON CONFLICT update clause
    const updateParts = [];
    if (updateAssigns) updateParts.push(updateAssigns);
    if (schema.hasUpdatedAt) updateParts.push('updated_at = EXCLUDED.updated_at');
    if (schema.hasDeleted) updateParts.push('_deleted = 0');

    if (updateParts.length === 0) {
      // Nothing to update on conflict — just INSERT OR IGNORE
      const sql = `INSERT OR IGNORE INTO ${tableName} (${cols.join(', ')}) VALUES (${placeHolders})`;
      return db.prepare(sql).bind(...vals);
    }

    const sql = `
      INSERT INTO ${tableName} (${cols.join(', ')})
      VALUES (${placeHolders})
      ON CONFLICT(id) DO UPDATE SET
        ${updateParts.join(', ')}
    `;

    return db.prepare(sql).bind(...vals);
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

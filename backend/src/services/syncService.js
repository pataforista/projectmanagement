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
      'log': 'logs',
      'message': 'messages',
      'annotation': 'annotations',
      'snapshot': 'snapshots',
      'interconsultation': 'interconsultations',
      'calendar_event': 'calendar_events',
      'time_log': 'time_logs',
      'library_item': 'library_items',
      'notification': 'notifications'
    };

    // Tables that have a user_id column for ownership scoping.
    // tasks, cycles, decisions, documents, messages, annotations, snapshots,
    // interconsultations, calendar_events belong to a project (not directly to a user).
    // members also gets a user_id for the workspace owner who created them.
    this.tablesWithUserId = new Set([
      'projects', 'notes', 'members', 'logs',
      'time_logs', 'library_items', 'notifications'
    ]);

    // For members: we allow deletion by the workspace owner (user_id on the member record)
    this.tablesWithUserIdOwner = new Set(['members']);

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
      
      // Nuevas tablas
      'messages':           { ownerCol: 'project_id', hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'annotations':        { ownerCol: 'project_id', hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'snapshots':          { ownerCol: 'project_id', hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'interconsultations': { ownerCol: 'project_id', hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'calendar_events':    { ownerCol: 'project_id', hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'time_logs':          { ownerCol: 'user_id',    hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'library_items':      { ownerCol: 'user_id',    hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true },
      'notifications':      { ownerCol: 'user_id',    hasCreatedAt: true, hasUpdatedAt: true, hasDeleted: true }
    };
  }

  /**
   * Validates that user owns a project (SECURITY: Must validate project_id)
   */
  async validateProjectOwnership(db, userId, projectId) {
    if (!projectId) return false;
    const { results } = await db.prepare(`
      SELECT user_id FROM projects WHERE id = ?
    `).bind(projectId).all();
    return results.length > 0 && results[0].user_id === userId;
  }

  /**
   * Validates that user owns an entity in a table (for DELETE operations)
   */
  async validateEntityOwnership(db, userId, tableName, entityId) {
    const schema = this.tableSchema[tableName];
    if (!schema) return false;

    if (schema.ownerCol === 'user_id') {
      const { results } = await db.prepare(`
        SELECT user_id FROM ${tableName} WHERE id = ?
      `).bind(entityId).all();
      return results.length > 0 && results[0].user_id === userId;
    } else if (schema.ownerCol === 'project_id') {
      const { results } = await db.prepare(`
        SELECT project_id FROM ${tableName} WHERE id = ?
      `).bind(entityId).all();
      if (results.length === 0) return false;
      const projectId = results[0].project_id;
      return this.validateProjectOwnership(db, userId, projectId);
    } else if (schema.ownerCol === null && this.tablesWithUserIdOwner.has(tableName)) {
      // members: the user_id column tracks who created the member record
      const { results } = await db.prepare(`
        SELECT user_id FROM ${tableName} WHERE id = ?
      `).bind(entityId).all();
      return results.length > 0 && results[0].user_id === userId;
    }

    // Tables with no owner column and no user_id — deny deletion
    return false;
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

        // SECURITY: Validate ownership before processing
        const applyStmt = await this.prepareApplyStatement(db, userId, tableName, change);
        if (!applyStmt) {
          results.push({ entityId: change.entityId, status: 'error', error: 'Authorization denied or invalid' });
          continue;
        }

        // 1. Prepare sync_queue statement (id pk required, use device_id column)
        const queueStmt = db.prepare(`
          INSERT INTO sync_queue (id, user_id, device_id, action, entity_type, entity_id, payload, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          userId,
          deviceId,
          change.action,
          change.entityType,
          change.entityId,
          JSON.stringify(change.payload || {}),
          Date.now()
        );
        statements.push(queueStmt);

        // 2. Add table application statement
        statements.push(applyStmt);

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

  async prepareApplyStatement(db, userId, tableName, change) {
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

      // SECURITY: Validate ownership before DELETE
      const hasOwnership = await this.validateEntityOwnership(db, userId, tableName, entityId);
      if (!hasOwnership) {
        throw new Error(`User ${userId} does not own ${tableName}#${entityId}`);
      }

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
      // SECURITY: Validate that user owns the project before allowing assignment
      const projectId = payload.project_id || payload.projectId;

      if (!projectId) {
        throw new Error(`project_id is required for ${tableName}`);
      }

      const ownsProject = await this.validateProjectOwnership(db, userId, projectId);
      if (!ownsProject) {
        throw new Error(`User ${userId} does not own project ${projectId}`);
      }

      cols.push('project_id');
      vals.push(projectId);

      // Also store user_id so we can verify workspace membership later, if table has it
      if (this.tablesWithUserId.has(tableName) || this.tablesWithUserIdOwner.has(tableName)) {
        cols.push('user_id');
        vals.push(userId);
      }
    } else if (schema.ownerCol === null && this.tablesWithUserIdOwner.has(tableName)) {
      // members: null-ownerCol tables that still have a user_id FK for the creator
      cols.push('user_id');
      vals.push(userId);
    }

    if (schema.hasCreatedAt) {
      cols.push('created_at');
      vals.push(payload.createdAt || now);
    }
    if (schema.hasUpdatedAt) {
      cols.push('updated_at');
      vals.push(now);
    }

    // --- SECURITY: Only allow valid SQL identifier-safe column names ---
    // Reject payload keys with camelCase, spaces, or SQL keywords.
    // camelCase keys from the frontend (e.g. `projectId`) are accepted only if
    // they match an expected alias and are translated to their snake_case DB column.
    const camelToSnake = {
      projectId: 'project_id', userId: 'user_id', createdAt: 'created_at',
      updatedAt: 'updated_at', taskId: 'task_id', cycleId: 'cycle_id',
      parentId: 'parent_id', ownerId: 'owner_id', assigneeId: 'assignee_id',
      dueDate: 'due_date', viewType: 'view_type', relatedTaskIds: 'related_task_ids',
      elementId: 'element_id', isOpen: 'is_open', emailHash: 'email_hash',
    };
    // Columns already handled above and system keys to skip
    const skipKeys = new Set([
      'id', 'user_id', 'project_id', 'created_at', 'updated_at', '_deleted',
      'createdAt', 'updatedAt', 'projectId', 'userId',
    ]);
    const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

    const dataColumns = [];
    const dataValues = [];
    for (const [rawKey, val] of Object.entries(payload)) {
      if (skipKeys.has(rawKey)) continue;
      const colName = camelToSnake[rawKey] || rawKey;
      if (!SQL_IDENTIFIER.test(colName)) {
        console.warn(`[SyncService] Skipping unsafe field name: ${rawKey}`);
        continue;
      }
      dataColumns.push(colName);
      dataValues.push(
        (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val
      );
    }

    cols.push(...dataColumns);
    vals.push(...dataValues);

    const placeHolders = cols.map(() => '?').join(', ');
    const updateAssigns = dataColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');

    // Build ON CONFLICT update clause
    // IMPORTANT: Do NOT reset _deleted = 0 on conflict, as this would resurrect
    // soft-deleted records if a CREATE/UPDATE races with a DELETE.
    // Instead, preserve the existing _deleted value — the DELETE action will set it
    // explicitly via the dedicated UPDATE path above.
    const updateParts = [];
    if (updateAssigns) updateParts.push(updateAssigns);
    if (schema.hasUpdatedAt) updateParts.push('updated_at = EXCLUDED.updated_at');

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
    // Skip changes that originated from the same device (no echo)
    const time = lastSyncTime ? (parseInt(lastSyncTime) || 0) : 0;

    const { results } = await db.prepare(`
      SELECT * FROM sync_queue
      WHERE user_id = ? AND device_id != ? AND created_at > ?
      ORDER BY created_at ASC
      LIMIT 500
    `).bind(userId, deviceId, time).all();

    const maxTimestamp = results.length > 0 ? results[results.length - 1].created_at : time;

    return {
      lastSyncTime: maxTimestamp,
      changes: results.map(c => ({
        action: c.action,
        entityType: c.entity_type,
        entityId: c.entity_id,
        payload: JSON.parse(c.payload),
        timestamp: c.created_at
      }))
    };
  }

  async updateCursor(db, userId, deviceId) {
    const now = Date.now();
    await db.prepare(`
      INSERT INTO sync_cursor (id, user_id, device_id, last_sync_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, device_id) DO UPDATE SET last_sync_time = EXCLUDED.last_sync_time
    `).bind(crypto.randomUUID(), userId, deviceId, now).run();
  }
}

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
    this.tablesWithUserId = new Set(['projects', 'tasks', 'cycles', 'decisions', 'documents', 'members', 'interconsultations', 'sessions', 'time_logs', 'library_items', 'notifications', 'logs']);
    
    // Schema whitelist — allowed columns per table (prevents 'no such column' errors)
    this.tableColumns = {
      projects: new Set([
        'name', 'description', 'visibility', 'settings', 'type',
        'status', 'color', 'icon', 'view_type', 'parent_id',
        'owner_id', 'order', 'metadata', '_deleted'
      ]),
      tasks: new Set([
        'project_id', 'title', 'status', 'priority', 'payload',
        'cycle_id', 'parent_id', 'description', 'assignee_id',
        'tags', 'subtasks', 'dependencies', 'estimate',
        'due_date', 'visibility', '_deleted'
      ]),
      members: new Set([
        'project_id', 'user_id', 'name', 'email', 'role',
        '_deleted', 'created_at', 'updated_at', 'avatar', 'status'
      ]),
      logs: new Set([
        'user_id', 'type', 'message', 'action', 'entity_type', 'entity_id', 'payload', 'timestamp'
      ]),
      messages: new Set(['project_id', 'user_id', 'text', 'sender', 'visibility', 'timestamp', 'created_at', 'updated_at', '_deleted']),
      annotations: new Set(['project_id', 'user_id', 'content', 'created_at', 'updated_at', '_deleted']),
      snapshots: new Set(['project_id', 'user_id', 'content', 'timestamp', '_deleted', 'updated_at']),
      interconsultations: new Set(['project_id', 'user_id', 'name', 'status', 'visibility', 'created_at', 'updated_at', '_deleted']),
      sessions: new Set(['project_id', 'user_id', 'name', 'date', 'start_time', 'end_time', 'created_at', 'updated_at', '_deleted']),
      time_logs: new Set(['project_id', 'user_id', 'duration', 'date', 'created_at', 'updated_at', '_deleted']),
      library_items: new Set(['user_id', 'title', 'authors', 'year', 'url', 'created_at', 'updated_at', '_deleted']),
      notifications: new Set(['user_id', 'title', 'message', 'read', 'created_at', 'updated_at', '_deleted']),
      cycles: new Set(['name', 'description', 'status', 'start_date', 'end_date', '_deleted']),
      decisions: new Set(['title', 'content', 'status', 'tags', 'related_task_ids', '_deleted']),
      documents: new Set(['title', 'content', 'type', 'metadata', '_deleted'])
    };
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
      'members':   { ownerCol: 'project_id', hasCreatedAt: true,  hasUpdatedAt: true,  hasDeleted: true  },
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
    const batchedEntities = []; // Tracks which entityIds are in the current batch

    for (const change of changes) {
      try {
        const tableName = this.entityTables[change.entityType];
        if (!tableName) {
          throw new Error(`Unsupported entity type: ${change.entityType}`);
        }

        // 1. Prepare application statement (INSERT/UPDATE/DELETE)
        const applyStmt = await this.prepareApplyStatement(db, userId, tableName, change);

        if (!applyStmt) {
          results.push({ entityId: change.entityId, status: 'success', note: 'No-op' });
          continue;
        }

        // 2. Prepare sync_queue statement 
        statements.push(db.prepare(`
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
        ));

        // 3. Add table application statement
        statements.push(applyStmt);
        
        // Track for deferred success marking
        batchedEntities.push(change.entityId);

      } catch (error) {
        console.error(`[SyncService] Error preparing/validating change ${change.entityId}:`, error);
        results.push({ entityId: change.entityId, status: 'error', error: error.message });
      }
    }

    if (statements.length > 0) {
      try {
        // Execute all statements as a single transaction in D1
        await db.batch(statements);

        // Only now mark batched items as success
        for (const entityId of batchedEntities) {
          results.push({ entityId, status: 'success' });
        }

        // Only advance the cursor when data was actually written.
        // If the batch failed, the cursor must NOT advance — the client will
        // retry with the same changes and we must not skip them on the next pull.
        await this.updateCursor(db, userId, deviceId);
      } catch (batchError) {
        console.error('[SyncService] Batch execution failed:', batchError);
        // All items in this batch failed due to the atomic nature of db.batch()
        for (const entityId of batchedEntities) {
          results.push({ entityId, status: 'error', error: `Batch failed: ${batchError.message}` });
        }
        // We don't re-throw here so the controller can return the granular (though failed) results
      }
    }

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
      // logs: INSERT OR IGNORE (id, user_id, type, message, timestamp, action, entity_type, entity_id, payload)
      return db.prepare(`
        INSERT OR IGNORE INTO logs (id, user_id, type, message, timestamp, action, entity_type, entity_id, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        entityId,
        userId,
        payload.type || 'sync',
        payload.message || '',
        payload.timestamp || Date.now(),
        payload.action || change.action || null,
        payload.entity_type || payload.entityType || null,
        payload.entity_id || payload.entityId || null,
        payload.payload ? JSON.stringify(payload.payload) : (payload.data ? JSON.stringify(payload.data) : null)
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

    // --- CREATE / UPDATE: Distinct paths to handle partial payloads ---
    const now = Date.now();
    const skipKeys = new Set([
      'id', 'user_id', 'project_id', 'created_at', 'updated_at', '_deleted',
      'createdAt', 'updatedAt', 'projectId', 'userId',
      // Nexus Fortress client-side encryption fields
      '__encrypted', '__iv', '__tag', '__version', '__keyId', 'iv', 'data',
    ]);
    const camelToSnake = {
      projectId: 'project_id', userId: 'user_id', createdAt: 'created_at',
      updatedAt: 'updated_at', taskId: 'task_id', cycleId: 'cycle_id',
      parentId: 'parent_id', ownerId: 'owner_id', assigneeId: 'assignee_id',
      dueDate: 'due_date', viewType: 'view_type', relatedTaskIds: 'related_task_ids',
      elementId: 'element_id', isOpen: 'is_open', emailHash: 'email_hash',
    };
    const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

    // Resolve project/user context for validation
    let resolvedProjectId = payload.project_id || payload.projectId || null;
    if (!resolvedProjectId && change.action === 'UPDATE') {
      const existing = await db.prepare(`SELECT project_id FROM ${tableName} WHERE id = ?`).bind(entityId).first();
      if (existing) resolvedProjectId = existing.project_id;
    }

    // Tables that require a project_id to belong to a project (cannot be workspace-level)
    const TABLES_REQUIRING_PROJECT = new Set(['tasks', 'cycles', 'decisions', 'documents',
      'messages', 'annotations', 'snapshots', 'interconsultations', 'calendar_events']);

    // Security check for project-owned tables
    if (schema.ownerCol === 'project_id') {
      if (resolvedProjectId) {
        const ownsProject = await this.validateProjectOwnership(db, userId, resolvedProjectId);
        if (!ownsProject) {
          throw new Error(`User ${userId} does not own project ${resolvedProjectId} for ${tableName}#${entityId}`);
        }
      } else if (change.action === 'CREATE' && TABLES_REQUIRING_PROJECT.has(tableName)) {
        // Entities in these tables must always belong to a project.
        // Allowing a null project_id here would create orphan records with no ownership validation.
        throw new Error(`project_id is required when creating a ${tableName} record`);
      }
    }

    // MANDATORY FIELD VALIDATION (Fix for 500 errors)
    if (change.action === 'CREATE') {
       if (tableName === 'tasks' && !payload.title) throw new Error('Task title is required');
       if (tableName === 'projects' && !payload.name) throw new Error('Project name is required');
       if (tableName === 'cycles' && !payload.name) throw new Error('Cycle name is required');
       if (tableName === 'decisions' && !payload.title) throw new Error('Decision title is required');
    }

    // Bug 2 Fix: Prevent UPDATE from nullifying shared mandatory fields
    if (change.action === 'UPDATE') {
       const nullProtected = { tasks: ['title'], projects: ['name'], cycles: ['name'], decisions: ['title'] };
       const protectedCols = nullProtected[tableName] || [];
       for (const col of protectedCols) {
         const camelKey = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase()); // e.g. project_id -> projectId
         const val = payload.hasOwnProperty(col) ? payload[col] : (payload.hasOwnProperty(camelKey) ? payload[camelKey] : undefined);
         if (val === null || val === undefined || val === '') {
           if (payload.hasOwnProperty(col) || payload.hasOwnProperty(camelKey)) {
             throw new Error(`Field "${col}" cannot be null or empty in table "${tableName}" during update`);
           }
         }
       }
    }

    // Prepare data columns
    const dataColumns = [];
    const dataValues = [];
    for (const [key, value] of Object.entries(payload)) {
      if (skipKeys.has(key)) continue;
      const colName = camelToSnake[key] || key;
      if (skipKeys.has(colName)) continue; // Double check in case it's and also skip the snake_case version
      if (!SQL_IDENTIFIER.test(colName)) continue;
      dataColumns.push(colName);
      dataValues.push((typeof value === 'object' && value !== null) ? JSON.stringify(value) : value);
    }

    // --- Whitelist Filtering: Ensure columns exist in D1 ---
    const allowedCols = this.tableColumns[tableName];
    if (allowedCols) {
      const filtered = dataColumns.reduce((acc, col, i) => {
        if (allowedCols.has(col)) {
          acc.cols.push(col);
          acc.vals.push(dataValues[i]);
        }
        return acc;
      }, { cols: [], vals: [] });
      
      dataColumns.length = 0;
      dataValues.length = 0;
      dataColumns.push(...filtered.cols);
      dataValues.push(...filtered.vals);
    }

    if (dataColumns.length === 0 && change.action === 'UPDATE') {
      return null; // No actual columns to update
    }

    if (change.action === 'CREATE') {
      const cols = ['id'];
      const vals = [entityId];
      
      if (schema.ownerCol === 'user_id') {
        cols.push('user_id'); vals.push(userId);
      } else if (schema.ownerCol === 'project_id') {
        if (resolvedProjectId) {
          cols.push('project_id'); vals.push(resolvedProjectId);
        }
        // BUG FIX: Even if project_id is null (workspace-level), we MUST 
        // inject user_id if the table supports it so the record has an owner.
        if (this.tablesWithUserId.has(tableName) || this.tablesWithUserIdOwner.has(tableName)) {
          cols.push('user_id'); vals.push(userId);
        }
      } else if (schema.ownerCol === null && this.tablesWithUserIdOwner.has(tableName)) {
        cols.push('user_id'); vals.push(userId);
      }

      if (schema.hasCreatedAt) { cols.push('created_at'); vals.push(payload.createdAt || now); }
      if (schema.hasUpdatedAt) { cols.push('updated_at'); vals.push(now); }
      
      cols.push(...dataColumns);
      vals.push(...dataValues);

      const sql = `INSERT OR IGNORE INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      return db.prepare(sql).bind(...vals);

    } else {
      // UPDATE: Only patch provided columns
      const setParts = [];
      const vals = [];
      
      for (let i = 0; i < dataColumns.length; i++) {
        setParts.push(`${dataColumns[i]} = ?`);
        vals.push(dataValues[i]);
      }

      if (schema.hasUpdatedAt) {
        setParts.push('updated_at = ?');
        vals.push(now);
      }
      
      if (setParts.length === 0) return null;

      // WHERE clause: target the specific record, scope to owner, and only update non-deleted entities.
      // NOT setting _deleted = 0 here — an UPDATE from a stale/offline device must never
      // silently resurrect an entity that was soft-deleted on another device.
      let sql = `UPDATE ${tableName} SET ${setParts.join(', ')} WHERE id = ? AND _deleted = 0`;
      vals.push(entityId);

      if (schema.ownerCol === 'project_id' && resolvedProjectId) {
         sql += ` AND project_id = ?`;
         vals.push(resolvedProjectId);
      } else if (schema.ownerCol === 'user_id' || this.tablesWithUserId.has(tableName)) {
         sql += ` AND user_id = ?`;
         vals.push(userId);
      }

      return db.prepare(sql).bind(...vals);
    }
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

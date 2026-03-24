/**
 * AdminService
 *
 * Handles server-side admin key management and critical-change audit logging.
 *
 * The admin key hash is stored in the `workspace_config` table (key =
 * 'admin_key_hash'). All critical admin operations are recorded in
 * `audit_log` for accountability.
 */

export class AdminService {
  // ─── Admin Key ────────────────────────────────────────────────────────────

  /**
   * Hash a plain-text key with SHA-256 using the Web Crypto API
   * (available in both Cloudflare Workers and modern browsers).
   */
  async hashKey(plainKey) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Retrieve the stored admin key hash from workspace_config.
   * Returns null if no admin key has been configured yet.
   */
  async getAdminKeyHash(db) {
    const { results } = await db.prepare(
      `SELECT value FROM workspace_config WHERE key = 'admin_key_hash'`
    ).all();
    return results[0]?.value ?? null;
  }

  /**
   * Returns true when an admin key has been configured.
   */
  async hasAdminKey(db) {
    const hash = await this.getAdminKeyHash(db);
    return !!hash;
  }

  /**
   * Verify a plain-text key against the stored hash.
   * Returns true if no admin key is configured (open workspace).
   */
  async verifyAdminKey(env, plainKey) {
    const storedHash = await this.getAdminKeyHash(env.DB);
    if (!storedHash) return true; // no key configured → open
    const inputHash = await this.hashKey(plainKey);
    return inputHash === storedHash;
  }

  /**
   * Set or rotate the admin key.
   *
   * - If a key already exists, `currentKey` must be provided and correct.
   * - `newKey` must be at least 8 characters.
   * - Throws named errors so the controller can return precise HTTP codes.
   */
  async setAdminKey(db, userId, newKey, currentKey = null) {
    if (!newKey || newKey.length < 8) {
      throw new Error('KEY_TOO_SHORT');
    }

    const existingHash = await this.getAdminKeyHash(db);
    if (existingHash) {
      if (!currentKey) throw new Error('CURRENT_KEY_REQUIRED');
      const currentHash = await this.hashKey(currentKey);
      if (currentHash !== existingHash) throw new Error('INVALID_CURRENT_KEY');
    }

    const newHash = await this.hashKey(newKey);
    const now = Date.now();

    await db.prepare(`
      INSERT INTO workspace_config (key, value, updated_at, updated_by)
      VALUES ('admin_key_hash', ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value      = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
    `).bind(newHash, now, userId).run();
  }

  // ─── Audit Log ────────────────────────────────────────────────────────────

  /**
   * Append a record to the audit_log table.
   *
   * @param {object} db
   * @param {object} entry
   * @param {string}  entry.userId
   * @param {string}  entry.action       - e.g. SET_ADMIN_KEY | CHANGE_ROLE | DELETE_MEMBER
   * @param {string}  [entry.entityType] - e.g. 'member' | 'workspace_config'
   * @param {string}  [entry.entityId]
   * @param {any}     [entry.oldValue]   - serialised to JSON
   * @param {any}     [entry.newValue]   - serialised to JSON
   * @param {string}  [entry.ipAddress]
   * @param {string}  [entry.userAgent]
   */
  async addAuditLog(db, {
    userId,
    action,
    entityType = null,
    entityId = null,
    oldValue = null,
    newValue = null,
    ipAddress = null,
    userAgent = null,
  }) {
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO audit_log
        (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      userId,
      action,
      entityType,
      entityId,
      oldValue !== null ? JSON.stringify(oldValue) : null,
      newValue !== null ? JSON.stringify(newValue) : null,
      ipAddress,
      userAgent,
      Date.now(),
    ).run();
    return id;
  }

  /**
   * Retrieve the most recent audit log entries (descending timestamp).
   */
  async getAuditLog(db, { limit = 50 } = {}) {
    const { results } = await db.prepare(`
      SELECT * FROM audit_log
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(Math.min(limit, 200)).all();

    return results.map(r => ({
      ...r,
      old_value: r.old_value ? JSON.parse(r.old_value) : null,
      new_value: r.new_value ? JSON.parse(r.new_value) : null,
    }));
  }
}

export default AdminService;

/**
 * AdminService
 *
 * Handles server-side admin key management and critical-change audit logging.
 *
 * The admin key hash is stored in the `workspace_config` table (key =
 * 'admin_key_hash'). All critical admin operations are recorded in
 * `audit_log` for accountability.
 */

// PBKDF2 parameters — intentionally slow to resist brute-force attacks.
// SHA-256 alone (the previous approach) is far too fast for password hashing.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256-bit output

export class AdminService {
  // ─── Admin Key ────────────────────────────────────────────────────────────

  /**
   * Generate a cryptographically random hex salt.
   */
  #generateSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Derive a hash for `plainKey` using PBKDF2-SHA256 and the given hex `salt`.
   * Returns the hash as a hex string.
   */
  async #deriveKey(plainKey, saltHex) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(plainKey), 'PBKDF2', false, ['deriveBits']
    );
    const saltBytes = Uint8Array.from(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITERATIONS },
      keyMaterial,
      PBKDF2_KEY_LENGTH * 8
    );
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Retrieve the stored admin key hash and salt from workspace_config.
   * Returns { hash, salt } or null if no admin key has been configured.
   */
  async #getStoredKey(db) {
    const { results: hashRow } = await db.prepare(
      `SELECT value FROM workspace_config WHERE key = 'admin_key_hash'`
    ).all();
    const { results: saltRow } = await db.prepare(
      `SELECT value FROM workspace_config WHERE key = 'admin_key_salt'`
    ).all();
    const hash = hashRow[0]?.value ?? null;
    const salt = saltRow[0]?.value ?? null;
    if (!hash) return null;
    return { hash, salt };
  }

  /**
   * Returns true when an admin key has been configured.
   */
  async hasAdminKey(db) {
    const stored = await this.#getStoredKey(db);
    return !!stored;
  }

  /**
   * Verify a plain-text key against the stored PBKDF2 hash+salt.
   * Returns true if no admin key is configured (open workspace).
   */
  async verifyAdminKey(env, plainKey) {
    const stored = await this.#getStoredKey(env.DB);
    if (!stored) return true; // no key configured → open workspace

    if (!stored.salt) {
      // Legacy record hashed with plain SHA-256 (no salt). Accept it but force
      // a re-hash on next setAdminKey call. Compare with SHA-256 for now.
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(plainKey));
      const legacyHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      return legacyHash === stored.hash;
    }

    const inputHash = await this.#deriveKey(plainKey, stored.salt);
    return inputHash === stored.hash;
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

    const stored = await this.#getStoredKey(db);
    if (stored) {
      if (!currentKey) throw new Error('CURRENT_KEY_REQUIRED');
      // Verify using the correct path (PBKDF2 or legacy SHA-256)
      const valid = await this.verifyAdminKey({ DB: db }, currentKey);
      if (!valid) throw new Error('INVALID_CURRENT_KEY');
    }

    const salt = this.#generateSalt();
    const hash = await this.#deriveKey(newKey, salt);
    const now = Date.now();

    // Persist hash and salt as separate config entries
    await db.batch([
      db.prepare(`
        INSERT INTO workspace_config (key, value, updated_at, updated_by)
        VALUES ('admin_key_hash', ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
      `).bind(hash, now, userId),
      db.prepare(`
        INSERT INTO workspace_config (key, value, updated_at, updated_by)
        VALUES ('admin_key_salt', ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
      `).bind(salt, now, userId),
    ]);
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

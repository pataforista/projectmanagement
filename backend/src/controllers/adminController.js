/**
 * AdminController
 *
 * Handles all /api/admin/* endpoints:
 *   GET  /api/admin/status           — check whether an admin key is configured
 *   POST /api/admin/key              — set / rotate the admin key
 *   POST /api/admin/verify-key       — verify a candidate key
 *   PATCH /api/admin/members/:id/role — update a member's role (admin key required for 'admin')
 *   DELETE /api/admin/members/:id    — soft-delete a member (admin key always required)
 *   GET  /api/admin/audit-log        — retrieve recent audit entries
 *
 * Critical operations are validated server-side with the stored admin key hash
 * and recorded in the audit_log table via AdminService.
 */

import AdminService from '../services/adminService.js';

const VALID_ROLES = new Set(['member', 'admin', 'viewer']);

export class AdminController {
  constructor() {
    this.adminService = new AdminService();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  #ip(c) {
    return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  }

  #ua(c) {
    return c.req.header('user-agent') || null;
  }

  /**
   * Validate the x-admin-key header against the stored hash.
   * Returns null on success, or an error Response on failure.
   */
  async #requireAdminKey(c) {
    const hasKey = await this.adminService.hasAdminKey(c.env.DB);
    if (!hasKey) return null; // no key configured — open workspace, skip check

    const provided = c.req.header('x-admin-key');
    if (!provided) {
      return c.json({
        status: 'error',
        code: 'ADMIN_KEY_REQUIRED',
        message: 'x-admin-key header is required for this operation'
      }, 403);
    }

    const valid = await this.adminService.verifyAdminKey(c.env, provided);
    if (!valid) {
      return c.json({
        status: 'error',
        code: 'INVALID_ADMIN_KEY',
        message: 'Admin key is incorrect'
      }, 403);
    }

    return null; // OK
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/status
   * Returns whether an admin key is configured (does NOT expose the hash).
   */
  async getStatus(c) {
    try {
      const hasKey = await this.adminService.hasAdminKey(c.env.DB);
      return c.json({ status: 'success', hasAdminKey: hasKey });
    } catch (err) {
      console.error('[AdminController] getStatus:', err);
      return c.json({ status: 'error', message: 'Failed to get status' }, 500);
    }
  }

  /**
   * POST /api/admin/key
   * Body: { newKey: string, currentKey?: string }
   *
   * Sets or rotates the admin key.
   * If a key already exists, `currentKey` must be provided and correct.
   */
  async setKey(c) {
    try {
      const userId = c.get('userId');
      const body = await c.req.json();
      const { newKey, currentKey } = body;

      await this.adminService.setAdminKey(c.env.DB, userId, newKey, currentKey);

      await this.adminService.addAuditLog(c.env.DB, {
        userId,
        action: 'SET_ADMIN_KEY',
        entityType: 'workspace_config',
        entityId: 'admin_key_hash',
        ipAddress: this.#ip(c),
        userAgent: this.#ua(c),
      });

      return c.json({ status: 'success', message: 'Admin key updated' });
    } catch (err) {
      const codeMap = {
        KEY_TOO_SHORT: [400, 'Admin key must be at least 8 characters'],
        CURRENT_KEY_REQUIRED: [403, 'Current admin key is required to change the key'],
        INVALID_CURRENT_KEY: [403, 'Current admin key is incorrect'],
      };
      const [status, message] = codeMap[err.message] || [500, 'Failed to update admin key'];
      if (status === 500) console.error('[AdminController] setKey:', err);
      return c.json({ status: 'error', code: err.message, message }, status);
    }
  }

  /**
   * POST /api/admin/verify-key
   * Body: { key: string }
   *
   * Verifies whether a candidate key matches the stored hash.
   * Useful for clients that want to pre-validate before performing an operation.
   */
  async verifyKey(c) {
    try {
      const { key } = await c.req.json();
      if (!key) {
        return c.json({ status: 'error', message: 'key is required' }, 400);
      }

      const valid = await this.adminService.verifyAdminKey(c.env, key);
      if (!valid) {
        return c.json({ status: 'error', code: 'INVALID_KEY', message: 'Admin key is incorrect' }, 403);
      }

      return c.json({ status: 'success', valid: true });
    } catch (err) {
      console.error('[AdminController] verifyKey:', err);
      return c.json({ status: 'error', message: 'Verification failed' }, 500);
    }
  }

  /**
   * PATCH /api/admin/members/:id/role
   * Headers: x-admin-key (required when assigning the 'admin' role and a key is configured)
   * Body: { role: 'member' | 'admin' | 'viewer' }
   *
   * Updates a member's role. Promoting to 'admin' requires the admin key.
   */
  async updateMemberRole(c) {
    try {
      const userId = c.get('userId');
      const memberId = c.req.param('id');
      const { role } = await c.req.json();

      if (!role || !VALID_ROLES.has(role)) {
        return c.json({
          status: 'error',
          message: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}`
        }, 400);
      }

      // Promote-to-admin requires the admin key
      if (role === 'admin') {
        const denied = await this.#requireAdminKey(c);
        if (denied) return denied;
      }

      // Fetch current state for audit
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, email, role FROM members WHERE id = ? AND _deleted = 0`
      ).bind(memberId).all();

      if (!results || results.length === 0) {
        return c.json({ status: 'error', message: 'Member not found' }, 404);
      }

      const oldRole = results[0].role;
      const now = Date.now();

      await c.env.DB.prepare(
        `UPDATE members SET role = ?, updated_at = ? WHERE id = ?`
      ).bind(role, now, memberId).run();

      await this.adminService.addAuditLog(c.env.DB, {
        userId,
        action: 'CHANGE_ROLE',
        entityType: 'member',
        entityId: memberId,
        oldValue: { role: oldRole },
        newValue: { role },
        ipAddress: this.#ip(c),
        userAgent: this.#ua(c),
      });

      return c.json({ status: 'success', memberId, role });
    } catch (err) {
      console.error('[AdminController] updateMemberRole:', err);
      return c.json({ status: 'error', message: 'Failed to update role' }, 500);
    }
  }

  /**
   * DELETE /api/admin/members/:id
   * Headers: x-admin-key (always required when a key is configured)
   *
   * Soft-deletes a member (sets _deleted = 1).
   */
  async deleteMember(c) {
    try {
      const userId = c.get('userId');
      const memberId = c.req.param('id');

      // Deleting a member always requires the admin key
      const denied = await this.#requireAdminKey(c);
      if (denied) return denied;

      // Fetch current state for audit
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, email, role FROM members WHERE id = ? AND _deleted = 0`
      ).bind(memberId).all();

      if (!results || results.length === 0) {
        return c.json({ status: 'error', message: 'Member not found' }, 404);
      }

      const now = Date.now();
      await c.env.DB.prepare(
        `UPDATE members SET _deleted = 1, updated_at = ? WHERE id = ?`
      ).bind(now, memberId).run();

      await this.adminService.addAuditLog(c.env.DB, {
        userId,
        action: 'DELETE_MEMBER',
        entityType: 'member',
        entityId: memberId,
        oldValue: { name: results[0].name, email: results[0].email, role: results[0].role },
        newValue: { _deleted: true },
        ipAddress: this.#ip(c),
        userAgent: this.#ua(c),
      });

      return c.json({ status: 'success', memberId });
    } catch (err) {
      console.error('[AdminController] deleteMember:', err);
      return c.json({ status: 'error', message: 'Failed to delete member' }, 500);
    }
  }

  /**
   * GET /api/admin/audit-log?limit=50
   * Returns recent audit log entries (newest first).
   */
  async getAuditLog(c) {
    try {
      // Require the admin key to read the audit log
      const denied = await this.#requireAdminKey(c);
      if (denied) return denied;

      const limit = parseInt(c.req.query('limit') || '50', 10);
      const logs = await this.adminService.getAuditLog(c.env.DB, { limit });
      return c.json({ status: 'success', logs });
    } catch (err) {
      console.error('[AdminController] getAuditLog:', err);
      return c.json({ status: 'error', message: 'Failed to retrieve audit log' }, 500);
    }
  }
}

export default AdminController;

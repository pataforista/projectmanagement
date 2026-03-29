export class UserService {
  constructor() {}

  /**
   * Crear o actualizar usuario (Google login)
   */
  async upsertUser(db, googleClaims) {
    const existing = await this.getUserByGoogleSub(db, googleClaims.sub);
    const now = Date.now();

    if (existing) {
      const emailChanged = existing.email !== googleClaims.email;

      const updateUsers = db.prepare(`
        UPDATE users SET
          email = ?,
          name = ?,
          avatar = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        googleClaims.email,
        googleClaims.name,
        googleClaims.picture,
        now,
        existing.id
      );

      // ✅ FIX 1.1: ALWAYS use db.batch() for atomicity
      // This ensures users.email and sessions.email stay synchronized
      // even if one of the updates partially fails.
      const statements = [updateUsers];

      if (emailChanged) {
        // Keep active sessions in sync when the Google account email changes.
        // Without this, sessions.email would hold the old address while users.email
        // already reflects the new one, causing silent desynchronisation.
        const updateSessions = db.prepare(`
          UPDATE sessions SET email = ? WHERE user_id = ? AND is_active = 1
        `).bind(googleClaims.email, existing.id);

        const insertHistory = db.prepare(`
          INSERT INTO account_history (id, user_id, old_email, new_email, old_google_sub, new_google_sub, reason, same_sub, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          existing.id,
          existing.email,
          googleClaims.email,
          googleClaims.sub,
          googleClaims.sub,
          'email_alias_update',
          1,
          now
        );

        statements.push(updateSessions);
        statements.push(insertHistory);
      }

      await db.batch(statements);

      return { ...existing, email: googleClaims.email, name: googleClaims.name, avatar: googleClaims.picture };
    } else {
      const userId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO users (
          id, google_sub, email, name, avatar, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        googleClaims.sub,
        googleClaims.email,
        googleClaims.name,
        googleClaims.picture,
        now,
        now
      ).run();

      return {
        id: userId,
        email: googleClaims.email,
        name: googleClaims.name,
        avatar: googleClaims.picture
      };
    }
  }

  /**
   * Obtener usuario por Google Sub
   */
  async getUserByGoogleSub(db, googleSub) {
    const { results } = await db.prepare(`
      SELECT * FROM users WHERE google_sub = ?
    `).bind(googleSub).all();

    return results[0];
  }

  async getUserById(db, userId) {
    const { results } = await db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).all();
    return results[0];
  }
}

export default UserService;

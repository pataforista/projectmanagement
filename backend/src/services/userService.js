export class UserService {
  constructor() {}

  /**
   * Crear o actualizar usuario (Google login)
   */
  async upsertUser(db, googleClaims) {
    const existing = await this.getUserByGoogleSub(db, googleClaims.sub);
    const now = Date.now();

    if (existing) {
      await db.prepare(`
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
      ).run();

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

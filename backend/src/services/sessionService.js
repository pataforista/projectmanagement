export class SessionService {
  constructor() {}

  /**
   * Crear nueva sesión
   */
  async createSession(db, userId, email, googleSub, userAgent, ipAddress) {
    const sessionId = crypto.randomUUID();
    const deviceName = this.parseDeviceName(userAgent);
    const now = Date.now();

    await db.prepare(`
      INSERT INTO sessions (
        id, user_id, email, google_sub, user_agent, ip_address, device_name, is_active, created_at, last_activity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(sessionId, userId, email, googleSub, userAgent, ipAddress, deviceName, now, now).run();

    return {
      id: sessionId,
      userId,
      email,
      deviceName,
      createdAt: now,
    };
  }

  /**
   * Obtener sesión
   */
  async getSession(db, sessionId) {
    const { results } = await db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND is_active = 1
    `).bind(sessionId).all();

    return results[0];
  }

  /**
   * Obtener todas las sesiones de un usuario
   */
  async getUserSessions(db, userId) {
    const { results } = await db.prepare(`
      SELECT id, email, device_name, ip_address, last_activity, created_at
      FROM sessions
      WHERE user_id = ? AND is_active = 1
      ORDER BY last_activity DESC
    `).bind(userId).all();

    return results;
  }

  /**
   * Revocar sesión
   */
  async revokeSession(db, sessionId) {
    await db.prepare(`
      UPDATE sessions
      SET is_active = 0, revoked_at = ?
      WHERE id = ?
    `).bind(Date.now(), sessionId).run();
  }

  /**
   * Actualizar last_activity
   */
  async updateActivity(db, sessionId) {
    await db.prepare(`
      UPDATE sessions SET last_activity = ? WHERE id = ?
    `).bind(Date.now(), sessionId).run();
  }

  /**
   * Parsear nombre del dispositivo de User-Agent
   */
  parseDeviceName(userAgent) {
    if (!userAgent) return 'Unknown Device';
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Macintosh')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux PC';
    return 'Unknown Device';
  }
}

export default SessionService;

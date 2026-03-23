import * as jose from 'jose';

export class TokenService {
  constructor() {}

  /**
   * Generar JWT nuestro usando 'jose' (Cloudflare compatible)
   */
  async generateAccessToken(env, userId, email, sessionId) {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const alg = 'HS256';

    const jwt = await new jose.SignJWT({
      sub: userId,
      email,
      sid: sessionId,
      jti: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setIssuer('https://workspace.api')
      .setAudience('workspace-web-app')
      .setExpirationTime(env.JWT_EXPIRY || '15m')
      .sign(secret);

    return jwt;
  }

  /**
   * Generar refresh token (string aleatorio)
   */
  generateRefreshToken() {
    return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(16);
  }

  /**
   * Guardar refresh token en BD
   */
  async saveRefreshToken(db, sessionId, userId, token) {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    await db.prepare(`
      INSERT INTO refresh_tokens (id, session_id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), sessionId, userId, token, expiresAt).run();
  }

  /**
   * Obtener refresh token de BD
   */
  async getRefreshToken(db, token) {
    const now = Date.now();
    const { results } = await db.prepare(`
      SELECT * FROM refresh_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `).bind(token, now).all();

    return results[0];
  }

  /**
   * Revocar refresh token
   */
  async revokeRefreshToken(db, token) {
    await db.prepare(`
      UPDATE refresh_tokens
      SET revoked_at = ?
      WHERE token_hash = ?
    `).bind(Date.now(), token).run();
  }

  /**
   * Validar JWT nuestro usando 'jose'
   */
  async verifyAccessToken(env, token) {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    try {
      const { payload } = await jose.jwtVerify(token, secret, {
        issuer: 'https://workspace.api',
        audience: 'workspace-web-app',
      });
      return payload;
    } catch (error) {
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new Error('TOKEN_EXPIRED');
      }
      throw new Error('INVALID_TOKEN');
    }
  }
}

export default TokenService;

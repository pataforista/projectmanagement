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
   * Genera un refresh token de alta entropía (texto plano, para el cliente).
   */
  generateRefreshToken() {
    return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(16);
  }

  /**
   * Devuelve el SHA-256 hex del token (lo que se almacena en BD, nunca el token en crudo).
   */
  async hashToken(token) {
    const data = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Guardar refresh token en BD (solo se guarda el hash, nunca el token en crudo).
   */
  async saveRefreshToken(db, sessionId, userId, token) {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    const hash = await this.hashToken(token);
    await db.prepare(`
      INSERT INTO refresh_tokens (id, session_id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), sessionId, userId, hash, expiresAt).run();
  }

  /**
   * Obtener refresh token de BD (busca por hash del token recibido).
   */
  async getRefreshToken(db, token) {
    const now = Date.now();
    const hash = await this.hashToken(token);
    const { results } = await db.prepare(`
      SELECT * FROM refresh_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `).bind(hash, now).all();

    return results[0];
  }

  /**
   * Revocar refresh token (busca por hash del token recibido).
   */
  async revokeRefreshToken(db, token) {
    const hash = await this.hashToken(token);
    await db.prepare(`
      UPDATE refresh_tokens
      SET revoked_at = ?
      WHERE token_hash = ?
    `).bind(Date.now(), hash).run();
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

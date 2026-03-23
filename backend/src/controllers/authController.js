import GoogleAuthService from '../services/googleAuthService.js';
import UserService from '../services/userService.js';
import SessionService from '../services/sessionService.js';
import TokenService from '../services/tokenService.js';

export class AuthController {
  constructor() {
    this.googleAuth = new GoogleAuthService();
    this.userService = new UserService();
    this.sessionService = new SessionService();
    this.tokenService = new TokenService();
  }

  /**
   * POST /auth/google
   */
  async login(c) {
    try {
      const { idToken } = await c.req.json();
      if (!idToken) {
        return c.json({ status: 'error', message: 'idToken is required' }, 400);
      }

      // 1. Validar Google ID Token (ahora requiere env para Client ID)
      const googleClaims = await this.googleAuth.verifyIdToken(c.env, idToken);

      // 2. Crear o actualizar usuario
      const user = await this.userService.upsertUser(c.env.DB, googleClaims);

      // 3. Crear sesión
      const userAgent = c.req.header('user-agent');
      const ipAddress = c.req.header('cf-connecting-ip') || 'unknown';

      const session = await this.sessionService.createSession(
        c.env.DB,
        user.id,
        user.email,
        googleClaims.sub,
        userAgent,
        ipAddress
      );

      // 4. Generar tokens
      const accessToken = await this.tokenService.generateAccessToken(
        c.env,
        user.id,
        user.email,
        session.id
      );

      const refreshToken = this.tokenService.generateRefreshToken();
      await this.tokenService.saveRefreshToken(c.env.DB, session.id, user.id, refreshToken);

      return c.json({
        status: 'success',
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
        session: {
          id: session.id,
          createdAt: session.createdAt,
        },
      });

    } catch (error) {
      console.error('[AuthController] Login failed:', error.message);
      return c.json({
        status: 'error',
        message: error.message,
      }, error.message === 'INVALID_TOKEN' ? 401 : 500);
    }
  }

  /**
   * POST /auth/refresh
   */
  async refresh(c) {
    try {
      const { refreshToken } = await c.req.json();
      if (!refreshToken) {
        return c.json({ status: 'error', message: 'refreshToken is required' }, 400);
      }

      const record = await this.tokenService.getRefreshToken(c.env.DB, refreshToken);
      if (!record) {
        return c.json({ status: 'error', message: 'Invalid or expired refresh token' }, 401);
      }

      const user = await this.userService.getUserById(c.env.DB, record.user_id);
      if (!user) {
        return c.json({ status: 'error', message: 'User not found' }, 401);
      }

      const newAccessToken = await this.tokenService.generateAccessToken(
        c.env,
        user.id,
        user.email,
        record.session_id
      );

      return c.json({
        status: 'success',
        accessToken: newAccessToken,
        expiresIn: 900,
      });

    } catch (error) {
      console.error('[AuthController] Refresh failed:', error);
      return c.json({ status: 'error', message: 'Token refresh failed' }, 500);
    }
  }

  /**
   * POST /auth/logout
   */
  async logout(c) {
    try {
      const { refreshToken } = await c.req.json().catch(() => ({}));
      const sessionId = c.get('sessionId');

      if (refreshToken) {
        await this.tokenService.revokeRefreshToken(c.env.DB, refreshToken);
      }
      
      await this.sessionService.revokeSession(c.env.DB, sessionId);

      return c.json({
        status: 'success',
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('[AuthController] Logout failed:', error);
      return c.json({ status: 'error', message: 'Logout failed' }, 500);
    }
  }
}

export default AuthController;

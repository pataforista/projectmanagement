import TokenService from '../services/tokenService.js';
import SessionService from '../services/sessionService.js';

const tokenService = new TokenService();
const sessionService = new SessionService();

export async function authMiddleware(c, next) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        status: 'error',
        code: 'NO_TOKEN',
        message: 'No authentication token provided'
      }, 401);
    }

    const token = authHeader.substring(7);

    let decoded;
    try {
      decoded = await tokenService.verifyAccessToken(c.env, token);
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') {
        return c.json({
          status: 'error',
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired',
        }, 401);
      }

      return c.json({
        status: 'error',
        code: 'INVALID_TOKEN',
        message: 'Invalid token'
      }, 401);
    }

    const session = await sessionService.getSession(c.env.DB, decoded.sid);
    if (!session) {
      return c.json({
        status: 'error',
        code: 'SESSION_REVOKED',
        message: 'Session has been terminated'
      }, 401);
    }

    // Fire and forget activity update (optional: await if you want strictness)
    c.executionCtx.waitUntil(sessionService.updateActivity(c.env.DB, decoded.sid));

    c.set('userId', decoded.sub);
    c.set('email', decoded.email);
    c.set('sessionId', decoded.sid);

    await next();

  } catch (error) {
    console.error(`[AuthMiddleware] Error: ${error.message}`);
    return c.json({
      status: 'error',
      code: 'AUTH_ERROR',
      message: 'Authentication failed'
    }, 500);
  }
}

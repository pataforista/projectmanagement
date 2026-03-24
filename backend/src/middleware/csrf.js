/**
 * CSRF Protection Middleware
 *
 * Since all API endpoints require a Bearer token (which browsers cannot
 * attach cross-site without an explicit CORS preflight grant), traditional
 * CSRF is largely mitigated. This middleware adds defence-in-depth by:
 *
 *  1. Enforcing Content-Type: application/json on state-changing requests.
 *     HTML forms cannot set this type, so form-based CSRF attacks are blocked.
 *
 *  2. Verifying the Origin header (when present) against the CORS whitelist.
 *     This blocks cross-origin XHR/fetch that somehow bypasses CORS.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfMiddleware(c, next) {
  const method = c.req.method;

  // Safe HTTP verbs — no state change, skip checks
  if (SAFE_METHODS.has(method)) {
    return next();
  }

  // 1. Enforce application/json Content-Type for mutating requests
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({
      status: 'error',
      code: 'INVALID_CONTENT_TYPE',
      message: 'Content-Type must be application/json for this request'
    }, 400);
  }

  // 2. Validate Origin header when present
  const origin = c.req.header('origin');
  if (origin) {
    const allowedOrigins = (c.env?.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map(o => o.trim());

    if (!allowedOrigins.includes(origin)) {
      console.warn(`[CSRF] Rejected request from unauthorized origin: ${origin}`);
      return c.json({
        status: 'error',
        code: 'INVALID_ORIGIN',
        message: 'Request origin is not allowed'
      }, 403);
    }
  }

  return next();
}

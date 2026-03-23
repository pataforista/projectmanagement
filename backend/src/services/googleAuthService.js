import * as jose from 'jose';

export class GoogleAuthService {
  constructor() {
    this.JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  }

  /**
   * Validar Google ID Token usando 'jose' (Cloudflare compatible)
   */
  async verifyIdToken(env, idToken) {
    try {
      const { payload } = await jose.jwtVerify(idToken, this.JWKS, {
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
        audience: env.GOOGLE_CLIENT_ID,
      });

      if (!payload.email) {
        throw new Error('Email not present in Google token');
      }

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        email_verified: payload.email_verified,
        locale: payload.locale,
        iat: payload.iat,
        exp: payload.exp,
      };

    } catch (error) {
      console.error(`[GoogleAuth] Verification failed: ${error.message}`);
      throw new Error('INVALID_GOOGLE_TOKEN');
    }
  }
}

export default GoogleAuthService;

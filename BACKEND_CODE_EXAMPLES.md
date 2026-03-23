# Backend: Ejemplos de Código Detallados

**Documento de referencia técnica para implementación**

---

## 1. ESTRUCTURA DE CARPETAS Y DEPENDENCIAS

### package.json (Inicial)

```json
{
  "name": "workspace-backend",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "dev": "NODE_ENV=development nodemon src/server.js",
    "start": "node src/server.js",
    "test": "NODE_ENV=test jest --detectOpenHandles",
    "db:init": "node scripts/init-db.js",
    "db:migrate": "node scripts/migrate.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-async-errors": "^3.1.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.1.0",
    "google-auth-library": "^9.4.1",
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^9.0.0",
    "uuid": "^9.0.0",
    "axios": "^1.6.0",
    "morgan": "^1.10.0",
    "pino": "^8.16.0",
    "pino-pretty": "^10.2.0",
    "express-validator": "^7.0.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^7.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
```

### .env.example

```env
# Node
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000

# Database
DATABASE_URL=./workspace.db
DATABASE_LOG=true

# Google OAuth
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback

# JWT
JWT_SECRET=your-super-secret-key-minimum-32-characters-long-please
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000,https://app.example.com

# Session
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax

# Features
ENABLE_FIRESTORE=false
ENABLE_WEBSOCKET=false

# Logging
LOG_FORMAT=json
LOG_FILE=./logs/app.log
```

---

## 2. INICIALIZACIÓN DE BASE DE DATOS

### src/db/init.js

```javascript
/**
 * Inicializar esquema de base de datos
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DatabaseInit {
  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');  // Write-Ahead Logging para concurrencia
    this.db.pragma('foreign_keys = ON');   // Habilitar foreign keys
  }

  init() {
    console.log('Initializing database...');

    this.createUsers();
    this.createSessions();
    this.createRefreshTokens();
    this.createAccountHistory();
    this.createNotes();
    this.createSyncQueue();
    this.createSyncCursor();
    this.createIndexes();

    console.log('✓ Database initialized');
  }

  createUsers() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_sub TEXT UNIQUE NOT NULL,
        google_aud TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        picture TEXT,
        locale TEXT DEFAULT 'es-ES',
        email_verified BOOLEAN DEFAULT 0,
        two_factor_enabled BOOLEAN DEFAULT 0,
        encryption_key_iv TEXT,
        encrypted_key_hash TEXT,
        login_count INTEGER DEFAULT 0,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  createSessions() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        google_sub TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        device_name TEXT,
        access_token_hash TEXT,
        access_token_expires_at DATETIME,
        is_active BOOLEAN DEFAULT 1,
        is_revoked BOOLEAN DEFAULT 0,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  createRefreshTokens() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME,
        replaced_by_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  createAccountHistory() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        old_email TEXT,
        new_email TEXT NOT NULL,
        old_google_sub TEXT,
        new_google_sub TEXT,
        reason TEXT NOT NULL,
        same_sub BOOLEAN,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  createNotes() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        content_hash TEXT,
        type TEXT,
        tags TEXT,
        is_pinned BOOLEAN DEFAULT 0,
        links TEXT,
        frontmatter TEXT,
        encrypted BOOLEAN DEFAULT 0,
        encryption_iv TEXT,
        local_version INTEGER DEFAULT 1,
        remote_version INTEGER DEFAULT 0,
        synced_at DATETIME,
        conflict_state TEXT,
        conflict_remote_data TEXT,
        conflict_resolution_strategy TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  createSyncQueue() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        old_payload TEXT,
        status TEXT DEFAULT 'PENDING',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  createSyncCursor() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_cursor (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        last_sync_time DATETIME,
        last_entity_id TEXT,
        is_syncing BOOLEAN DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, device_id)
      );
    `);
  }

  createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id ON refresh_tokens(session_id);
      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_notes_user_synced ON notes(user_id, synced_at);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_user_status ON sync_queue(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_account_history_user_id ON account_history(user_id);
    `);
  }

  close() {
    this.db.close();
  }
}

// Ejecutar si se llama directamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dbPath = process.env.DATABASE_URL || './workspace.db';
  const init = new DatabaseInit(dbPath);
  init.init();
  init.close();
  console.log(`Database ready at ${dbPath}`);
}
```

---

## 3. SERVICIOS DE AUTENTICACIÓN

### src/services/googleAuthService.js

```javascript
/**
 * Validar ID Tokens firmados por Google
 */

import { OAuth2Client } from 'google-auth-library';
import logger from '../config/logger.js';

export class GoogleAuthService {
  constructor() {
    this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  /**
   * Validar Google ID Token
   *
   * @param {string} idToken - JWT firmado por Google
   * @returns {Promise<Object>} Claims del token
   */
  async verifyIdToken(idToken) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      // Validaciones adicionales
      if (!payload.email) {
        throw new Error('Email not present in Google token');
      }

      if (!payload.email_verified) {
        logger.warn(`Unverified email in Google token: ${payload.email}`);
        // Decidir si permitir emails no verificados
        // return null;  // Rechazar si no está verificado
      }

      return {
        sub: payload.sub,              // Google Subject ID (opaco)
        aud: payload.aud,              // Audience (nuestro CLIENT_ID)
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        email_verified: payload.email_verified,
        locale: payload.locale,
        iat: payload.iat,
        exp: payload.exp,
      };

    } catch (error) {
      logger.error(`Google token verification failed: ${error.message}`);

      if (error.message.includes('Token used too late')) {
        throw new Error('EXPIRED_TOKEN');
      }

      if (error.message.includes('Wrong number of segments')) {
        throw new Error('INVALID_TOKEN_FORMAT');
      }

      throw new Error('INVALID_GOOGLE_TOKEN');
    }
  }

  /**
   * Extraer claims de Google Token (sin validar - útil para debugging)
   */
  decodeToken(idToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const decoded = JSON.parse(
        Buffer.from(parts[1], 'base64').toString()
      );

      return decoded;
    } catch (error) {
      throw new Error('Failed to decode token');
    }
  }
}

export default new GoogleAuthService();
```

### src/services/tokenService.js

```javascript
/**
 * Gestionar JWT propios y refresh tokens
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import logger from '../config/logger.js';

export class TokenService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Generar JWT nuestro
   */
  generateAccessToken(userId, email, sessionId) {
    const payload = {
      sub: userId,
      email,
      sid: sessionId,  // Session ID para revocar si es necesario
      jti: uuidv4(),   // JWT ID para blacklist
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY || '15m',
      issuer: 'https://workspace.api',
      audience: 'workspace-web-app',
    });

    return token;
  }

  /**
   * Generar refresh token (string aleatorio)
   */
  generateRefreshToken() {
    return Buffer.from(
      uuidv4() + '-' + Date.now() + '-' + Math.random()
    ).toString('hex');
  }

  /**
   * Hashear refresh token (para almacenamiento seguro)
   */
  async hashToken(token) {
    const saltRounds = 10;
    return bcrypt.hash(token, saltRounds);
  }

  /**
   * Verificar refresh token
   */
  async verifyRefreshToken(token, tokenHash) {
    return bcrypt.compare(token, tokenHash);
  }

  /**
   * Guardar refresh token en BD
   */
  saveRefreshToken(sessionId, userId, tokenHash) {
    const stmt = this.db.prepare(`
      INSERT INTO refresh_tokens (id, session_id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, datetime('+7 days'))
    `);

    const tokenId = uuidv4();
    stmt.run(tokenId, sessionId, userId, tokenHash);

    return tokenId;
  }

  /**
   * Obtener refresh token de BD
   */
  getRefreshToken(tokenHash) {
    const stmt = this.db.prepare(`
      SELECT * FROM refresh_tokens
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `);

    return stmt.get(tokenHash);
  }

  /**
   * Revocar refresh token
   */
  revokeRefreshToken(tokenHash) {
    const stmt = this.db.prepare(`
      UPDATE refresh_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ?
    `);

    return stmt.run(tokenHash);
  }

  /**
   * Revocar TODOS los refresh tokens de un usuario
   */
  revokeAllUserTokens(userId) {
    const stmt = this.db.prepare(`
      UPDATE refresh_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revoked_at IS NULL
    `);

    return stmt.run(userId);
  }

  /**
   * Validar JWT nuestro
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('TOKEN_EXPIRED');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('INVALID_TOKEN');
      }
      throw error;
    }
  }
}

export default TokenService;
```

### src/services/sessionService.js

```javascript
/**
 * Gestionar sesiones de usuario
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import logger from '../config/logger.js';

export class SessionService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Crear nueva sesión
   */
  createSession(userId, email, googleSub, userAgent, ipAddress) {
    const sessionId = uuidv4();
    const deviceName = this.parseDeviceName(userAgent);

    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, user_id, email, google_sub, user_agent, ip_address, device_name, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(sessionId, userId, email, googleSub, userAgent, ipAddress, deviceName);

    return {
      id: sessionId,
      userId,
      email,
      deviceName,
      createdAt: new Date(),
    };
  }

  /**
   * Obtener sesión
   */
  getSession(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND is_active = 1
    `);

    return stmt.get(sessionId);
  }

  /**
   * Obtener todas las sesiones de un usuario
   */
  getUserSessions(userId) {
    const stmt = this.db.prepare(`
      SELECT id, email, device_name, ip_address, last_activity, created_at
      FROM sessions
      WHERE user_id = ? AND is_active = 1
      ORDER BY last_activity DESC
    `);

    return stmt.all(userId);
  }

  /**
   * Revocar sesión
   */
  revokeSession(sessionId) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET is_active = 0, is_revoked = 1, revoked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    return stmt.run(sessionId);
  }

  /**
   * Revocar TODAS las sesiones de un usuario
   */
  revokeAllUserSessions(userId) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET is_active = 0, is_revoked = 1, revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND is_active = 1
    `);

    return stmt.run(userId);
  }

  /**
   * Actualizar last_activity
   */
  updateActivity(sessionId) {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
    `);

    return stmt.run(sessionId);
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
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux PC';

    return 'Unknown Device';
  }
}

export default SessionService;
```

### src/services/userService.js

```javascript
/**
 * Gestionar usuarios
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import logger from '../config/logger.js';

export class UserService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Crear o actualizar usuario (Google login)
   */
  upsertUser(googleClaims) {
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, google_sub, google_aud, email, name, picture, locale,
        email_verified, login_count, last_login
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(google_sub) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        locale = excluded.locale,
        email_verified = excluded.email_verified,
        login_count = login_count + 1,
        last_login = CURRENT_TIMESTAMP
    `);

    const userId = uuidv4();

    stmt.run(
      userId,
      googleClaims.sub,
      googleClaims.aud,
      googleClaims.email,
      googleClaims.name,
      googleClaims.picture,
      googleClaims.locale || 'es-ES',
      googleClaims.email_verified ? 1 : 0
    );

    return this.getUserByGoogleSub(googleClaims.sub);
  }

  /**
   * Obtener usuario por Google Sub
   */
  getUserByGoogleSub(googleSub) {
    const stmt = this.db.prepare(`
      SELECT id, google_sub, email, name, picture, locale,
             email_verified, login_count, last_login, created_at
      FROM users
      WHERE google_sub = ?
    `);

    return stmt.get(googleSub);
  }

  /**
   * Obtener usuario por ID
   */
  getUserById(userId) {
    const stmt = this.db.prepare(`
      SELECT id, google_sub, email, name, picture, locale,
             email_verified, login_count, last_login, created_at
      FROM users
      WHERE id = ?
    `);

    return stmt.get(userId);
  }

  /**
   * Obtener usuario por email
   */
  getUserByEmail(email) {
    const stmt = this.db.prepare(`
      SELECT id, google_sub, email, name, picture, locale,
             email_verified, login_count, last_login, created_at
      FROM users
      WHERE email = ?
    `);

    return stmt.get(email);
  }

  /**
   * Detectar cambio de cuenta
   */
  detectAccountChange(userId, newEmail, newGoogleSub) {
    const user = this.getUserById(userId);
    if (!user) return null;

    const oldEmail = user.email;
    const oldGoogleSub = user.google_sub;

    // Caso 1: Cambio de cuenta (diferente google_sub)
    if (newGoogleSub !== oldGoogleSub) {
      return {
        reason: 'account_switched',
        oldEmail,
        newEmail,
        oldGoogleSub,
        newGoogleSub,
        sameSub: false,
      };
    }

    // Caso 2: Cambio de email (mismo google_sub)
    if (newEmail !== oldEmail) {
      return {
        reason: 'email_updated',
        oldEmail,
        newEmail,
        oldGoogleSub,
        newGoogleSub: oldGoogleSub,
        sameSub: true,
      };
    }

    return null;
  }

  /**
   * Registrar cambio de cuenta en historial
   */
  logAccountChange(userId, change) {
    const stmt = this.db.prepare(`
      INSERT INTO account_history (
        id, user_id, old_email, new_email, old_google_sub, new_google_sub,
        reason, same_sub, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      userId,
      change.oldEmail,
      change.newEmail,
      change.oldGoogleSub,
      change.newGoogleSub,
      change.reason,
      change.sameSub ? 1 : 0,
      `Switched from ${change.oldEmail} to ${change.newEmail}`
    );
  }
}

export default UserService;
```

---

## 4. CONTROLADORES

### src/controllers/authController.js

```javascript
/**
 * Controlador de autenticación
 */

import GoogleAuthService from '../services/googleAuthService.js';
import UserService from '../services/userService.js';
import SessionService from '../services/sessionService.js';
import TokenService from '../services/tokenService.js';
import logger from '../config/logger.js';

export class AuthController {
  constructor(db) {
    this.db = db;
    this.googleAuth = GoogleAuthService;
    this.userService = new UserService(db);
    this.sessionService = new SessionService(db);
    this.tokenService = new TokenService(db);
  }

  /**
   * POST /auth/google
   * Login inicial con Google
   */
  async login(req, res) {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_ID_TOKEN',
          message: 'idToken is required'
        });
      }

      // 1. Validar Google ID Token
      const googleClaims = await this.googleAuth.verifyIdToken(idToken);

      // 2. Crear o actualizar usuario
      const user = this.userService.upsertUser(googleClaims);

      // 3. Crear sesión
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.connection.remoteAddress;

      const session = this.sessionService.createSession(
        user.id,
        user.email,
        googleClaims.sub,
        userAgent,
        ipAddress
      );

      // 4. Generar tokens
      const accessToken = this.tokenService.generateAccessToken(
        user.id,
        user.email,
        session.id
      );

      const refreshTokenRaw = this.tokenService.generateRefreshToken();
      const refreshTokenHash = await this.tokenService.hashToken(refreshTokenRaw);

      this.tokenService.saveRefreshToken(session.id, user.id, refreshTokenHash);

      logger.info(`User logged in: ${user.email} (${user.id})`);

      return res.status(200).json({
        status: 'success',
        accessToken,
        refreshToken: refreshTokenRaw,
        expiresIn: 900,  // 15 minutos
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          emailVerified: user.email_verified,
        },
        session: {
          id: session.id,
          createdAt: session.createdAt,
        },
      });

    } catch (error) {
      logger.error(`Login failed: ${error.message}`);

      const errorMap = {
        'INVALID_GOOGLE_TOKEN': { code: 'INVALID_TOKEN', status: 401 },
        'EXPIRED_TOKEN': { code: 'EXPIRED_TOKEN', status: 401 },
        'INVALID_TOKEN_FORMAT': { code: 'INVALID_FORMAT', status: 400 },
      };

      const errorInfo = errorMap[error.message] || {
        code: 'AUTH_ERROR',
        status: 500
      };

      return res.status(errorInfo.status).json({
        status: 'error',
        code: errorInfo.code,
        message: error.message,
      });
    }
  }

  /**
   * POST /auth/refresh
   * Renovar access token
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_REFRESH_TOKEN',
          message: 'refreshToken is required'
        });
      }

      // 1. Buscar token en BD (por hash)
      // NOTA: En práctica, necesitaríamos hashear el token enviado
      // Para este ejemplo, asumimos que comparamos directo
      const refreshTokenRecord = this.tokenService.getRefreshToken(refreshToken);

      if (!refreshTokenRecord) {
        return res.status(401).json({
          status: 'error',
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token'
        });
      }

      // 2. Obtener usuario
      const user = this.userService.getUserById(refreshTokenRecord.user_id);
      if (!user) {
        return res.status(401).json({
          status: 'error',
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        });
      }

      // 3. Generar nuevo access token
      const newAccessToken = this.tokenService.generateAccessToken(
        user.id,
        user.email,
        refreshTokenRecord.session_id
      );

      logger.info(`Token refreshed for user: ${user.email}`);

      return res.status(200).json({
        status: 'success',
        accessToken: newAccessToken,
        expiresIn: 900,
        newRefreshToken: null,  // null = no rotar, string = nuevo token
      });

    } catch (error) {
      logger.error(`Token refresh failed: ${error.message}`);

      return res.status(500).json({
        status: 'error',
        code: 'REFRESH_ERROR',
        message: 'Failed to refresh token'
      });
    }
  }

  /**
   * POST /auth/logout
   * Logout y revocar tokens
   */
  async logout(req, res) {
    try {
      const { refreshToken, allSessions } = req.body;
      const userId = req.userId;  // Del middleware de auth

      if (!refreshToken) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_REFRESH_TOKEN',
          message: 'refreshToken is required'
        });
      }

      if (allSessions) {
        // Revocar todas las sesiones del usuario
        this.sessionService.revokeAllUserSessions(userId);
        this.tokenService.revokeAllUserTokens(userId);

        logger.info(`All sessions revoked for user: ${userId}`);

        return res.status(200).json({
          status: 'success',
          message: 'All sessions terminated',
          sessionsRevoked: 'all',
        });
      } else {
        // Revocar solo este token/sesión
        this.tokenService.revokeRefreshToken(refreshToken);
        const session = this.sessionService.getSession(req.sessionId);
        if (session) {
          this.sessionService.revokeSession(session.id);
        }

        logger.info(`Session revoked for user: ${userId}`);

        return res.status(200).json({
          status: 'success',
          message: 'Session terminated',
          sessionsRevoked: 1,
        });
      }

    } catch (error) {
      logger.error(`Logout failed: ${error.message}`);

      return res.status(500).json({
        status: 'error',
        code: 'LOGOUT_ERROR',
        message: 'Failed to logout'
      });
    }
  }
}

export default AuthController;
```

---

## 5. MIDDLEWARE

### src/middleware/auth.js

```javascript
/**
 * Middleware de autenticación JWT
 */

import TokenService from '../services/tokenService.js';
import SessionService from '../services/sessionService.js';
import logger from '../config/logger.js';

export function createAuthMiddleware(db) {
  const tokenService = new TokenService(db);
  const sessionService = new SessionService(db);

  return async (req, res, next) => {
    try {
      // Extraer token de header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          status: 'error',
          code: 'NO_TOKEN',
          message: 'No authentication token provided'
        });
      }

      const token = authHeader.substring(7);

      // Validar JWT
      let decoded;
      try {
        decoded = tokenService.verifyAccessToken(token);
      } catch (err) {
        if (err.message === 'TOKEN_EXPIRED') {
          return res.status(401).json({
            status: 'error',
            code: 'TOKEN_EXPIRED',
            message: 'Access token expired',
          });
        }

        return res.status(401).json({
          status: 'error',
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        });
      }

      // Validar sesión
      const session = sessionService.getSession(decoded.sid);
      if (!session) {
        return res.status(401).json({
          status: 'error',
          code: 'SESSION_REVOKED',
          message: 'Session has been terminated'
        });
      }

      // Actualizar activity
      sessionService.updateActivity(decoded.sid);

      // Inyectar en request
      req.userId = decoded.sub;
      req.email = decoded.email;
      req.sessionId = decoded.sid;
      req.tokenId = decoded.jti;

      next();

    } catch (error) {
      logger.error(`Auth middleware error: ${error.message}`);

      return res.status(500).json({
        status: 'error',
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      });
    }
  };
}
```

### src/middleware/errorHandler.js

```javascript
/**
 * Middleware centralizado de manejo de errores
 */

import logger from '../config/logger.js';

export function createErrorHandler() {
  return (err, req, res, next) => {
    logger.error(`Error: ${err.message}`, {
      path: req.path,
      method: req.method,
      userId: req.userId,
      stack: err.stack,
    });

    // Errores conocidos
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
      });
    }

    // Error genérico
    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message,
    });
  };
}
```

---

## 6. RUTAS

### src/routes/authRoutes.js

```javascript
/**
 * Rutas de autenticación
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import AuthController from '../controllers/authController.js';
import { createAuthMiddleware } from '../middleware/auth.js';

export function createAuthRoutes(db) {
  const router = express.Router();
  const authController = new AuthController(db);
  const authMiddleware = createAuthMiddleware(db);

  /**
   * POST /auth/google
   * Login con Google ID Token
   */
  router.post('/google',
    body('idToken').isString().notEmpty(),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          code: 'VALIDATION_ERROR',
          errors: errors.array()
        });
      }
      next();
    },
    (req, res) => authController.login(req, res)
  );

  /**
   * POST /auth/refresh
   * Renovar access token
   */
  router.post('/refresh',
    body('refreshToken').isString().notEmpty(),
    (req, res) => authController.refresh(req, res)
  );

  /**
   * POST /auth/logout
   * Logout
   */
  router.post('/logout',
    authMiddleware,
    body('refreshToken').isString(),
    body('allSessions').isBoolean().optional(),
    (req, res) => authController.logout(req, res)
  );

  return router;
}
```

---

## 7. EXPRESS APP

### src/app.js

```javascript
/**
 * Configuración de Express
 */

import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import logger from './config/logger.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createErrorHandler } from './middleware/errorHandler.js';

export function createApp(db) {
  const app = express();

  // Seguridad
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  }));

  // Compression
  app.use(compression());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 100,  // Límite de requests
  });
  app.use(limiter);

  // Logging
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message)
    }
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Routes
  app.use('/auth', createAuthRoutes(db));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
    });
  });

  // Error handler
  app.use(createErrorHandler());

  return app;
}
```

### src/server.js

```javascript
/**
 * Entry point del servidor
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { DatabaseInit } from './db/init.js';
import { createApp } from './app.js';
import logger from './config/logger.js';

const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DATABASE_URL || './workspace.db';

// Inicializar BD
const init = new DatabaseInit(DB_URL);
init.init();
const db = init.db;

// Crear app
const app = createApp(db);

// Escuchar
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => {
    logger.info('Server closed');
    db.close();
    process.exit(0);
  });
});
```

---

## 8. TESTING

### tests/auth.test.js

```javascript
/**
 * Tests para autenticación
 */

import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { DatabaseInit } from '../src/db/init.js';

describe('Auth endpoints', () => {
  let db, app;

  beforeAll(() => {
    const init = new DatabaseInit(':memory:');
    init.init();
    db = init.db;
    app = createApp(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('POST /auth/google', () => {
    it('should reject invalid idToken', async () => {
      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('should return error on missing idToken', async () => {
      const response = await request(app)
        .post('/auth/google')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return 400 on missing refreshToken', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
    });
  });
});
```

---

## PRÓXIMOS PASOS

1. Crear archivo `.env` basado en `.env.example`
2. Correr `npm install`
3. Correr `npm run db:init`
4. Correr `npm run dev`
5. Testear endpoints con Postman o curl

```bash
# Obtener configuración de Google en:
# https://console.cloud.google.com

# Variables de entorno requeridas:
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export JWT_SECRET="..." # Mínimo 32 caracteres
export DATABASE_URL="./workspace.db"
```

-- Migration: Add missing columns to sessions table
-- Adds device_id and other missing columns to align with current code

ALTER TABLE sessions ADD COLUMN device_id TEXT;
ALTER TABLE sessions ADD COLUMN is_revoked BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN access_token_hash TEXT;
ALTER TABLE sessions ADD COLUMN access_token_expires_at DATETIME;

-- Also update users table to include missing fields for later use
ALTER TABLE users ADD COLUMN google_aud TEXT;
ALTER TABLE users ADD COLUMN locale TEXT DEFAULT 'es-ES';
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login DATETIME;

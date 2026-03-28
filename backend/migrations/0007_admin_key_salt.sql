-- Migration: Admin Key Salt
-- Adds support for PBKDF2-hashed admin keys.
-- Previously the admin key was stored as a plain SHA-256 hash (no salt, fast hash).
-- This migration allows storing a per-workspace random salt alongside the hash so
-- the key derivation can use PBKDF2-SHA256 (100 000 iterations) which is far more
-- resistant to offline brute-force attacks.
--
-- The salt is stored as a separate key in workspace_config.
-- Existing SHA-256 hashes (no salt row) continue to work — the service detects
-- the missing salt and falls back to SHA-256 comparison, then re-hashes with
-- PBKDF2 on the next successful setAdminKey call.

-- workspace_config already exists (created in 0002_admin_audit.sql).
-- No schema change required — the salt is stored as key = 'admin_key_salt'.
-- This migration is intentionally a no-op SQL-wise; it documents the protocol change.
SELECT 1; -- no-op placeholder

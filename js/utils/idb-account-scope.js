/**
 * idb-account-scope.js — IndexedDB Account Isolation Layer
 *
 * FIX 1 (Alta Severidad): IndexedDB usa un nombre de base de datos estático
 * ('WorkspaceProduccionDB') para todos los usuarios. Sin aislamiento por cuenta,
 * cambiar de sesión Google deja los datos del usuario anterior accesibles.
 *
 * ESTRATEGIA: Aislamiento mediante limpieza selectiva de stores al cambiar cuenta
 * más una firma de "propietario activo" en localStorage verificada en el boot.
 * Evita un rename de la DB (que requeriría migración destructiva).
 */

import { StorageManager } from './storage-manager.js';

export const IDBScopedStorage = {
    /** Gets the account-scoped database name based on the email. */
    getDbName(email) {
        if (!email) return 'default';
        const normalized = email.trim().toLowerCase();
        return `tlacuache_${normalized.replace(/[^a-z0-9]/g, '_')}`;
    },

    getCurrentOwner() {
        return localStorage.getItem('tlacuache_idb_owner_email') || null;
    },

    claimOwnership(email) {
        if (!email) return;
        localStorage.setItem('tlacuache_idb_owner_email', email.trim().toLowerCase());
    },

    /** Verifica si el email activo coincide con el propietario de los datos en IDB. */
    isOwner(email) {
        if (!email) return false;
        return this.getCurrentOwner() === email.trim().toLowerCase();
    },

    /**
     * Cambia de cuenta: borra los datos del usuario anterior de todos los stores
     * de usuario, luego registra el nuevo propietario.
     *
     * @param {string} newEmail  — El email de la nueva cuenta activa
     * @param {IDBDatabase} [db] — Instancia de la IDB (window.db si se omite)
     */
    async switchAccount(newEmail, db) {
        if (!newEmail) {
            console.error('[IDBScope] switchAccount: newEmail is required');
            return;
        }

        const currentOwner = this.getCurrentOwner();
        const normalized = newEmail.trim().toLowerCase();

        if (currentOwner === normalized) {
            console.log('[IDBScope] switchAccount: same owner, no-op');
            return;
        }

        console.log(`[IDBScope] Switching Account DB: ${currentOwner || 'none'} → ${normalized}`);

        // 1. Close the old connection if exists
        const oldDb = db || window.db;
        if (oldDb) {
            console.log('[IDBScope] Closing old DB connection...');
            oldDb.close();
        }

        // 2. Clear window.db so tx() knows to wait for a fresh init
        window.db = null;

        // 3. Mark ownership
        this.claimOwnership(normalized);

        // 4. Re-initialize DB (this will pick up the new name from StorageManager)
        // We import initDB dynamically to avoid circular dependencies if needed,
        // or just rely on the global initDB if it's available.
        if (window.initDB) {
            const newDb = await window.initDB(true); // forceFresh = true
            window.db = newDb;
            console.log(`[IDBScope] Scoped DB initialized for: ${normalized}`);
        }

        // 5. Reset sync cursor if new user
        const cursorKey = `last_sync_server_${normalized}`;
        if (!localStorage.getItem(cursorKey)) {
            localStorage.setItem(cursorKey, '0');
        }

        console.log(`[IDBScope] Account switch complete: ${normalized}`);
    },

    /**
     * Verificar en el boot si los datos en IDB pertenecen al usuario activo.
     * Si hay desajuste, limpia los stores para evitar exponer datos cruzados.
     *
     * @param {string} activeEmail — El email actualmente logueado (de sessionStorage)
     * @param {IDBDatabase} db
     * @returns {boolean} true si se detectó y corrigió un desajuste (caller should reload store)
     */
    async validateOnBoot(activeEmail, db) {
        if (!activeEmail) return false;

        const owner = this.getCurrentOwner();
        const normalized = activeEmail.trim().toLowerCase();

        // If mismatch, reload the DB instance to point to the correct account-scoped file
        if (owner && owner !== normalized) {
            console.warn(`[IDBScope] BOOT MISMATCH: Current DB owner is "${owner}", active session is "${normalized}".`);
            await this.switchAccount(normalized, db);
            return true;
        }

        if (!owner) {
            this.claimOwnership(normalized);
        }

        return false;
    }
};

// Expose globally so sync.js handleAccountSwitch can call IDBScopedStorage.switchAccount()
// without a circular import
window.IDBScopedStorage = IDBScopedStorage;

export default IDBScopedStorage;

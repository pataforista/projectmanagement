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

// Stores que contienen datos de usuario y deben limpiarse al cambiar cuenta.
// 'sessions' se excluye — contiene las sesiones de SessionManager (multi-cuenta por diseño).
const USER_DATA_STORES = [
    'projects', 'tasks', 'cycles', 'decisions', 'documents',
    'members', 'logs', 'library', 'interconsultations',
    'timeLogs', 'snapshots', 'annotations', 'messages',
    'notifications', 'sync_push_queue',
];

const IDB_OWNER_KEY = 'nexus_idb_owner_email';

export const IDBScopedStorage = {
    /** Retorna el email del propietario actual de los datos en IDB. */
    getCurrentOwner() {
        return localStorage.getItem(IDB_OWNER_KEY) || null;
    },

    /** Registra el email activo como propietario de los datos en IDB. */
    claimOwnership(email) {
        if (!email) return;
        localStorage.setItem(IDB_OWNER_KEY, email.trim().toLowerCase());
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

        const targetDb = db || window.db;
        const normalized = newEmail.trim().toLowerCase();
        const previousOwner = this.getCurrentOwner();

        if (previousOwner === normalized) {
            console.log('[IDBScope] switchAccount: same owner, no-op');
            return;
        }

        console.log(`[IDBScope] Switching IDB scope: ${previousOwner || 'none'} → ${normalized}`);

        if (targetDb) {
            const clearPromises = USER_DATA_STORES
                .filter(name => targetDb.objectStoreNames.contains(name))
                .map(name => new Promise((resolve) => {
                    try {
                        const tx = targetDb.transaction(name, 'readwrite');
                        const req = tx.objectStore(name).clear();
                        req.onsuccess = () => resolve(name);
                        // non-fatal — continue clearing other stores even if one fails
                        req.onerror = () => {
                            console.warn(`[IDBScope] Could not clear store "${name}":`, req.error);
                            resolve(name);
                        };
                    } catch (e) {
                        console.warn(`[IDBScope] Exception clearing store "${name}":`, e);
                        resolve(name);
                    }
                }));

            await Promise.all(clearPromises);
            console.log('[IDBScope] User data stores cleared for account switch.');
        } else {
            console.warn('[IDBScope] DB not available — stores not cleared. Reload recommended.');
        }

        // Limpia la cola de push para evitar enviar cambios del usuario anterior
        if (targetDb && targetDb.objectStoreNames.contains('sync_push_queue')) {
            try {
                const tx = targetDb.transaction('sync_push_queue', 'readwrite');
                tx.objectStore('sync_push_queue').clear();
            } catch (e) {
                console.warn('[IDBScope] Could not clear sync_push_queue:', e);
            }
        }

        // Actualiza la firma de propietario
        this.claimOwnership(normalized);

        // Resetea el cursor de sincronización del nuevo usuario a 0 si no existe,
        // forzando un full-pull en lugar de un delta vacío
        const cursorKey = `last_sync_server_${normalized}`;
        if (!localStorage.getItem(cursorKey)) {
            localStorage.setItem(cursorKey, '0');
        }

        console.log(`[IDBScope] Account scope switched to: ${normalized}`);
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

        if (owner && owner !== normalized) {
            console.warn(
                `[IDBScope] BOOT MISMATCH: IDB owned by "${owner}" but active session is "${normalized}". Clearing stale data.`
            );
            await this.switchAccount(normalized, db);
            return true; // caller should reload the store
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

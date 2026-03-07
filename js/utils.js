const PROJECT_TYPES = {
    clase: { label: 'Clase', icon: 'book-open', color: '#16a085' },
    presentacion: { label: 'Presentación', icon: 'monitor', color: '#2980b9' },
    articulo: { label: 'Artículo', icon: 'file-text', color: '#5e6ad2' },
    capitulo: { label: 'Capítulo', icon: 'bookmark', color: '#8e44ad' },
    libro: { label: 'Libro', icon: 'book', color: '#c0392b' },
    curso: { label: 'Curso', icon: 'layers', color: '#d35400' },
    admin: { label: 'Administrativo', icon: 'briefcase', color: '#7f8c8d' },
    libre: { label: 'Libre', icon: 'star', color: '#f39c12' },
};

/**
 * utils.js — Shared helpers used across all views
 */

// ── Escaping ──────────────────────────────────────────────────────────────────
/**
 * Escapa caracteres HTML especiales para prevenir ataques XSS (Cross-Site Scripting).
 * @param {string} str - La cadena de texto de entrada.
 * @returns {string} Cadena de texto sanitizada.
 */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Parsea un documento en formato CSV manejando correctamente las comillas 
 * y los saltos de línea internos en cada celda.
 * @param {string} text - Contenido crudo del archivo CSV.
 * @returns {Array<Array<string>>} Matriz bidimensional con los datos parseados.
 */
function parseCsv(text) {
    const result = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];
        if (inQuotes) {
            if (char === '"' && next === '"') { cell += '"'; i++; }
            else if (char === '"') inQuotes = false;
            else cell += char;
        } else {
            if (char === '"') inQuotes = true;
            else if (char === ',') { row.push(cell.trim()); cell = ''; }
            else if (char === '\n' || char === '\r') {
                if (cell || row.length) { row.push(cell.trim()); result.push(row); }
                row = []; cell = '';
                if (char === '\r' && next === '\n') i++;
            } else cell += char;
        }
    }
    if (cell || row.length) { row.push(cell.trim()); result.push(row); }
    return result;
}

String.prototype.slugify = function () {
    return this.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

function downloadFile(name, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

function normalizeWorkspaceName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function computeIdentityKey({ email, memberId, name }) {
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail) return `email:${cleanEmail}`;
    if (memberId) return `member:${memberId}`;
    return `name:${normalizeWorkspaceName(name || 'usuario')}`;
}

function getCurrentWorkspaceUser() {
    const name = localStorage.getItem('workspace_user_name') || 'Carlos';
    const role = localStorage.getItem('workspace_user_role') || 'Owner';
    const avatar = localStorage.getItem('workspace_user_avatar') || name.charAt(0).toUpperCase();
    const memberId = localStorage.getItem('workspace_user_member_id') || '';
    const email = normalizeEmail(localStorage.getItem('workspace_user_email') || '');
    const team = localStorage.getItem('workspace_team_label') || 'General';
    const identityKey = computeIdentityKey({ email, memberId, name });
    return { name, role, avatar, memberId, email, team, identityKey };
}

function getCurrentWorkspaceActor() {
    const user = getCurrentWorkspaceUser();
    const label = user.email ? `${user.name} <${user.email}>` : user.name;
    return {
        id: user.identityKey,
        label,
        name: user.name,
        email: user.email,
        memberId: user.memberId,
        team: user.team,
    };
}

function getCurrentWorkspaceMember() {
    if (!window.store || !store.get || !store.get.members) return null;
    const members = store.get.members();
    const user = getCurrentWorkspaceUser();
    if (!members.length) return null;

    if (user.memberId) {
        const byId = members.find(m => m.id === user.memberId);
        if (byId) return byId;
    }

    if (user.email) {
        const byEmail = members.find(m => normalizeEmail(m.email) === user.email);
        if (byEmail) return byEmail;
    }

    const normalizedUserName = normalizeWorkspaceName(user.name);
    return members.find(m => normalizeWorkspaceName(m.name) === normalizedUserName)
        || null;
}

function isTaskAssignedToCurrentUser(task) {
    if (!task?.assigneeId) return false;
    const member = getCurrentWorkspaceMember();
    return !!member && task.assigneeId === member.id;
}

// ── Date formatting ───────────────────────────────────────────────────────────
function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_BADGE_CLASSES = {
    'Capturado': 'badge-neutral',
    'Definido': 'badge-info',
    'En preparación': 'badge-purple',
    'En elaboración': 'badge-warning',
    'En revisión': 'badge-teal',
    'En espera': 'badge-danger',
    'Terminado': 'badge-success',
    'Archivado': 'badge-neutral',
    'activo': 'badge-success',
    'planificado': 'badge-info',
    'pausado': 'badge-warning',
    'archivado': 'badge-neutral',
    'cerrado': 'badge-neutral',
};

function statusBadge(status) {
    const cls = STATUS_BADGE_CLASSES[status] || 'badge-neutral';
    return `<span class="badge ${cls}">${esc(status)}</span>`;
}

// ── Empty state helper ────────────────────────────────────────────────────────
function emptyState(icon, text) {
    return `<div class="empty-state"><i data-feather="${icon}"></i><p>${esc(text)}</p></div>`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
/**
 * Genera y muestra un elemento visual "Toast" temporal en la interfaz 
 * para dar retroalimentación de las acciones del usuario.
 * @param {string} message - Texto principal a mostrar.
 * @param {string} type - Variantes de estilo ('info', 'success', 'warning', 'error').
 * @param {boolean} force - Si es true, ignora el modo de poca retroalimentación.
 */
function showToast(message, type = 'info', force = false) {
    if (!force && (type === 'info' || type === 'success') && localStorage.getItem('low_feedback_enabled') === 'true') {
        return;
    }
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = 'all 0.3s'; }, 2800);
    setTimeout(() => el.remove(), 3200);
}

// ── Task checkbox binding ─────────────────────────────────────────────────────
function bindTaskCheckboxes(root) {
    root.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = cb.dataset.id;
            if (!id) return;
            const task = store.get.allTasks().find(t => t.id === id);
            if (!task) return;
            const newStatus = task.status === 'Terminado' ? 'En elaboración' : 'Terminado';
            cb.classList.toggle('checked', newStatus === 'Terminado');
            const titleEl = cb.closest('.task-item')?.querySelector('.task-title');
            if (titleEl) titleEl.classList.toggle('done', newStatus === 'Terminado');
            await store.dispatch('UPDATE_TASK', { id, status: newStatus });
        });
    });
}

// ── Cycle cards binding ───────────────────────────────────────────────────────
document.addEventListener('click', async e => {
    const closeBtn = e.target.closest('.cycle-close-btn');
    if (closeBtn) {
        const id = closeBtn.dataset.id;
        if (id) {
            await store.dispatch('UPDATE_CYCLE', { id, status: 'cerrado' });
            closeBtn.textContent = 'Cerrado';
            closeBtn.disabled = true;
        }
    }
});

// ── Obsidian Helper ──────────────────────────────────────────────────────────
function getObsidianFileName(uri) {
    if (!uri) return '';
    try {
        const url = new URL(uri);
        const file = url.searchParams.get('file');
        if (file) return file.split('/').pop() || file;
        return uri;
    } catch (e) {
        return uri;
    }
}

// ── Settings Sync ────────────────────────────────────────────────────────────
export const SYNCABLE_SETTINGS_KEYS = [
    'workspace_user_name',
    'workspace_user_role',
    'workspace_user_avatar',
    'workspace_user_member_id',
    'workspace_user_email',
    'workspace_team_label',
    'nexus_salt',
    'autolock_enabled',
    'low_feedback_enabled'
];

/**
 * Persiste los ajustes recibidos desde el cloud en el almacenamiento local.
 * Filtra solo las claves autorizadas para evitar inyecciones de configuración.
 * @param {Object} settings - Diccionario de ajustes clave-valor.
 */
function syncSettingsToLocalStorage(settings) {
    if (!settings || typeof settings !== 'object') return;

    let changed = false;
    let securityChanged = false;

    SYNCABLE_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
            const oldValue = localStorage.getItem(key);
            const newValue = String(settings[key]);
            if (oldValue !== newValue) {
                localStorage.setItem(key, newValue);
                changed = true;
                if (key === 'nexus_salt' || key === 'workspace_lock_hash') {
                    securityChanged = true;
                }
            }
        }
    });

    if (securityChanged) {
        console.warn('[Utils] Security context changed from remote. Forcing relock.');
        if (window.lockWorkspace) {
            window.lockWorkspace();
            showToast('Ajustes de seguridad actualizados desde otro dispositivo. Sesion bloqueada.', 'warning', true);
        } else {
            location.reload();
        }
    } else if (changed) {
        console.log('[Utils] Settings synchronized from remote.');
        if (window.updateUserProfileUI) window.updateUserProfileUI();
    }
}

// ── UUID ─────────────────────────────────────────────────────────────────────
export function generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ── Device Registry ───────────────────────────────────────────────────────────
const DEVICE_ID_KEY = 'workspace_device_id';
const DEVICE_NAME_KEY = 'workspace_device_name';
const DEVICES_REGISTRY_KEY = 'workspace_devices_registry';
const REVOKED_DEVICES_KEY = 'workspace_revoked_devices';

function _getDefaultDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua) && /Mobile/.test(ua)) return 'Android';
    if (/Android/.test(ua)) return 'Tablet Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Navegador';
}

/**
 * Returns or creates a persistent unique ID for this device.
 * Stored in localStorage so it survives page reloads.
 */
function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        id = 'dev-' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/**
 * Returns the user-defined or auto-generated name for this device.
 */
function getDeviceName() {
    return localStorage.getItem(DEVICE_NAME_KEY) || _getDefaultDeviceName();
}

/**
 * Sets a human-readable name for this device.
 * @param {string} name
 */
function setDeviceName(name) {
    localStorage.setItem(DEVICE_NAME_KEY, String(name).trim().slice(0, 40));
}

/**
 * Returns metadata object for the current device.
 */
function getDeviceInfo() {
    return {
        id: getOrCreateDeviceId(),
        name: getDeviceName(),
        platform: (/iPhone|iPad|iPod|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop'),
        browser: (() => {
            const ua = navigator.userAgent;
            if (/Edg\//.test(ua)) return 'Edge';
            if (/Chrome\//.test(ua)) return 'Chrome';
            if (/Firefox\//.test(ua)) return 'Firefox';
            if (/Safari\//.test(ua)) return 'Safari';
            return 'Navegador';
        })(),
        lastSeen: Date.now(),
        registeredAt: Number(localStorage.getItem('workspace_device_registered_at') || Date.now()),
    };
}

/**
 * Loads the full list of known devices from localStorage.
 * @returns {Array}
 */
function getDevicesRegistry() {
    try {
        return JSON.parse(localStorage.getItem(DEVICES_REGISTRY_KEY) || '[]');
    } catch { return []; }
}

/**
 * Updates the current device's entry in the local registry (upsert by id).
 * @returns {Array} Updated registry.
 */
function updateCurrentDeviceInRegistry() {
    const info = getDeviceInfo();
    if (!localStorage.getItem('workspace_device_registered_at')) {
        localStorage.setItem('workspace_device_registered_at', String(info.lastSeen));
        info.registeredAt = info.lastSeen;
    }
    const devices = getDevicesRegistry();
    const idx = devices.findIndex(d => d.id === info.id);
    if (idx >= 0) {
        devices[idx] = { ...devices[idx], ...info };
    } else {
        devices.push(info);
    }
    localStorage.setItem(DEVICES_REGISTRY_KEY, JSON.stringify(devices));
    return devices;
}

/**
 * Merges a remote devices array into the local registry.
 * Remote entries win only if their lastSeen is newer.
 * The current device always overwrites its own remote record.
 * @param {Array} remoteDevices
 * @returns {Array} Merged registry.
 */
function mergeDevicesFromRemote(remoteDevices) {
    if (!Array.isArray(remoteDevices) || remoteDevices.length === 0) {
        return updateCurrentDeviceInRegistry();
    }
    const currentId = getOrCreateDeviceId();
    const localMap = new Map(getDevicesRegistry().map(d => [d.id, d]));

    for (const rd of remoteDevices) {
        if (!rd || !rd.id) continue;
        // Never overwrite our own device with stale remote data
        if (rd.id === currentId) continue;
        const existing = localMap.get(rd.id);
        if (!existing || rd.lastSeen > existing.lastSeen) {
            localMap.set(rd.id, rd);
        }
    }

    // Always refresh current device
    const currentInfo = getDeviceInfo();
    localMap.set(currentId, { ...(localMap.get(currentId) || {}), ...currentInfo });

    const merged = Array.from(localMap.values());
    localStorage.setItem(DEVICES_REGISTRY_KEY, JSON.stringify(merged));
    return merged;
}

/**
 * Removes a device from the active registry and adds it to the revocation list.
 * Cannot revoke the current device.
 * @param {string} deviceId
 * @param {string} [deviceName] - Optional label for audit trail.
 */
function revokeDevice(deviceId, deviceName) {
    const currentId = getOrCreateDeviceId();
    if (deviceId === currentId) return;
    // Remove from active registry
    const devices = getDevicesRegistry().filter(d => d.id !== deviceId);
    localStorage.setItem(DEVICES_REGISTRY_KEY, JSON.stringify(devices));
    // Add to revocation list
    const revoked = getRevokedDevices();
    if (!revoked.find(r => r.id === deviceId)) {
        revoked.push({
            id: deviceId,
            name: deviceName || deviceId,
            revokedAt: Date.now(),
            revokedBy: getOrCreateDeviceId(),
        });
        localStorage.setItem(REVOKED_DEVICES_KEY, JSON.stringify(revoked));
    }
}

// ── Revocation List ───────────────────────────────────────────────────────────

/**
 * Returns the list of revoked device entries: [{id, name, revokedAt, revokedBy}].
 */
function getRevokedDevices() {
    try {
        return JSON.parse(localStorage.getItem(REVOKED_DEVICES_KEY) || '[]');
    } catch { return []; }
}

/**
 * Checks if a given device ID is in the revocation list.
 * @param {string} deviceId
 */
function isDeviceRevoked(deviceId) {
    return getRevokedDevices().some(r => r.id === deviceId);
}

/**
 * Returns true if the current device has been revoked by another device.
 */
function isCurrentDeviceRevoked() {
    return isDeviceRevoked(getOrCreateDeviceId());
}

/**
 * Removes a device from the revocation list (restores access).
 * @param {string} deviceId
 */
function unRevokeDevice(deviceId) {
    const revoked = getRevokedDevices().filter(r => r.id !== deviceId);
    localStorage.setItem(REVOKED_DEVICES_KEY, JSON.stringify(revoked));
}

/**
 * Merges a remote revocation list into the local one (union — revocations are sticky).
 * Un-revocations propagate via absence: if remote no longer lists an ID, it's restored.
 * @param {Array} remoteRevoked
 */
function mergeRevokedDevicesFromRemote(remoteRevoked) {
    if (!Array.isArray(remoteRevoked)) return;
    const currentId = getOrCreateDeviceId();
    const localMap = new Map(getRevokedDevices().map(r => [r.id, r]));
    for (const rr of remoteRevoked) {
        if (!rr || !rr.id) continue;
        if (!localMap.has(rr.id)) {
            localMap.set(rr.id, rr);
        }
    }
    // Current device cannot be in its own revocation list
    localMap.delete(currentId);
    localStorage.setItem(REVOKED_DEVICES_KEY, JSON.stringify(Array.from(localMap.values())));
}

// Attach to window
window.esc = esc;
window.parseCsv = parseCsv;
window.fmtDate = fmtDate;
window.statusBadge = statusBadge;
window.emptyState = emptyState;
window.showToast = showToast;
window.bindTaskCheckboxes = bindTaskCheckboxes;
window.getObsidianFileName = getObsidianFileName;
window.downloadFile = downloadFile;
window.PROJECT_TYPES = PROJECT_TYPES;
window.generateUID = generateUID;
window.getCurrentWorkspaceUser = getCurrentWorkspaceUser;
window.getCurrentWorkspaceMember = getCurrentWorkspaceMember;
window.isTaskAssignedToCurrentUser = isTaskAssignedToCurrentUser;
window.getCurrentWorkspaceActor = getCurrentWorkspaceActor;
window.SYNCABLE_SETTINGS_KEYS = SYNCABLE_SETTINGS_KEYS;
window.syncSettingsToLocalStorage = syncSettingsToLocalStorage;
window.getOrCreateDeviceId = getOrCreateDeviceId;
window.getDeviceName = getDeviceName;
window.setDeviceName = setDeviceName;
window.getDeviceInfo = getDeviceInfo;
window.getDevicesRegistry = getDevicesRegistry;
window.updateCurrentDeviceInRegistry = updateCurrentDeviceInRegistry;
window.mergeDevicesFromRemote = mergeDevicesFromRemote;
window.revokeDevice = revokeDevice;
window.getRevokedDevices = getRevokedDevices;
window.isDeviceRevoked = isDeviceRevoked;
window.isCurrentDeviceRevoked = isCurrentDeviceRevoked;
window.unRevokeDevice = unRevokeDevice;
window.mergeRevokedDevicesFromRemote = mergeRevokedDevicesFromRemote;

export { esc, parseCsv, fmtDate, statusBadge, emptyState, showToast, bindTaskCheckboxes, getObsidianFileName, downloadFile, PROJECT_TYPES, getCurrentWorkspaceUser, getCurrentWorkspaceMember, isTaskAssignedToCurrentUser, getCurrentWorkspaceActor, SYNCABLE_SETTINGS_KEYS, syncSettingsToLocalStorage, getOrCreateDeviceId, getDeviceName, setDeviceName, getDeviceInfo, getDevicesRegistry, updateCurrentDeviceInRegistry, mergeDevicesFromRemote, revokeDevice, getRevokedDevices, isDeviceRevoked, isCurrentDeviceRevoked, unRevokeDevice, mergeRevokedDevicesFromRemote };

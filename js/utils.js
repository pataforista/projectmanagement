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

/**
 * Solo permite URLs http/https para evitar esquemas peligrosos (ej. javascript:).
 * Retorna '#' cuando la URL no es válida o usa un protocolo no permitido.
 */
function safeExternalUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '#';
    try {
        const parsed = new URL(value, window.location.origin);
        const allowedProtocols = new Set(['http:', 'https:']);
        return allowedProtocols.has(parsed.protocol) ? parsed.href : '#';
    } catch {
        return '#';
    }
}

function computeIdentityKey({ email, memberId, name }) {
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail) return `email:${cleanEmail}`;
    if (memberId) return `member:${memberId}`;
    return `name:${normalizeWorkspaceName(name || 'usuario')}`;
}

function getCurrentWorkspaceUser() {
    const name = localStorage.getItem('workspace_user_name') || 'Usuario';
    const role = localStorage.getItem('workspace_user_role') || 'Miembro';
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

function isMobileRuntime() {
    const touchPoints = navigator.maxTouchPoints || 0;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const narrowViewport = window.matchMedia?.('(max-width: 900px)').matches;
    return !!(coarsePointer || touchPoints > 1 || narrowViewport);
}

function renderCompatibilityNotice({
    icon = 'smartphone',
    title = 'Función optimizada para escritorio',
    description = 'Esta función requiere mayor espacio de pantalla o rendimiento de CPU/GPU.'
} = {}) {
    return `
        <div class="compat-placeholder" role="status" aria-live="polite">
            <i data-feather="${esc(icon)}"></i>
            <div class="compat-placeholder-body">
                <p class="compat-placeholder-title">${esc(title)}</p>
                <p class="compat-placeholder-text">${esc(description)}</p>
            </div>
        </div>
    `;
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

// ── Network Fetch with Timeout ────────────────────────────────────────────────
/**
 * Ejecuta fetch() con un límite de tiempo para evitar que la UI se cuelgue 
 * si la red es muy lenta o inestable (ej. portales cautivos).
 * @param {string} url - URL destino
 * @param {object} options - Opciones de fetch, incluyendo 'timeout' (en ms)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}) {
    const { timeout = 12000, ...fetchOptions } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`La petición de red excedió el tiempo límite (${(timeout/1000).toFixed(1)}s). Verifica tu conexión.`);
        }
        throw error;
    }
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
/**
 * SECURITY POLICY: Which settings can be synchronized across devices via the shared Drive file?
 *
 * ✅ SYNCABLE (collaborative / non-sensitive):
 *    - workspace_user_* (name, role, avatar, email, member_id)
 *    - workspace_team_label, autolock_enabled, low_feedback_enabled
 *    These contain identity and preferences shared across the team.
 *
 * ❌ NEVER SYNCABLE (per-device / authentication secrets):
 *    - nexus_salt: PBKDF2 derivation parameter scoped to user email. Each device
 *                 derives its own key → salt never travels to Drive (crypto.js scopes it).
 *    - workspace_lock_hash: Master password hash. Each user has THEIR OWN local password,
 *                          independent of the team workspace. Importing a remote hash would
 *                          allow any collaborator with Drive access to replace another user's
 *                          password → take over their workspace. MUST NEVER SYNC.
 *    - workspace_recovery_hash: Same reason as workspace_lock_hash.
 *
 * References:
 *   - AUDIT_TEAM_SYNC.md §3.5 (Issue #3.5)
 *   - VALIDATION_LINKING_ENCRYPTION_SYNC_2026-03-16.md (Error E1.1)
 *   - app.js:286-290 (handleRemoteWorkspace)
 *   - sync.js:1349 (seedFromRemote → syncSettingsToLocalStorage)
 */
export const SYNCABLE_SETTINGS_KEYS = [
    'workspace_user_name',
    'workspace_user_role',
    'workspace_user_avatar',
    'workspace_user_member_id',
    'workspace_user_email',
    'workspace_team_label',
    'autolock_enabled',
    'low_feedback_enabled'
];

// These MUST NEVER be in SYNCABLE_SETTINGS_KEYS. Defensive check.
const FORBIDDEN_SYNC_KEYS = new Set(['workspace_lock_hash', 'workspace_recovery_hash', 'nexus_salt']);

/**
 * Persiste los ajustes recibidos desde el cloud en el almacenamiento local.
 * - Solo sincroniza claves en SYNCABLE_SETTINGS_KEYS (whitelist approach)
 * - Rechaza explícitamente claves de seguridad que podrían permitir account takeover
 * - Cada usuario mantiene su contraseña maestra local, independientemente del workspace compartido
 *
 * @param {Object} settings - Diccionario de ajustes clave-valor (untrusted from remote)
 */
function syncSettingsToLocalStorage(settings) {
    if (!settings || typeof settings !== 'object') return;

    let changed = false;

    // Defensive: detect and reject forbidden security keys in remote settings
    for (const forbiddenKey of FORBIDDEN_SYNC_KEYS) {
        if (Object.prototype.hasOwnProperty.call(settings, forbiddenKey)) {
            console.error(`[Utils] ⚠️ SECURITY: Attempted sync of forbidden key "${forbiddenKey}" from remote settings. Rejecting.`);
            // We intentionally do NOT import this key, protecting the user's local credential.
        }
    }

    // Whitelist: only import approved settings keys
    SYNCABLE_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
            const oldValue = localStorage.getItem(key);
            const newValue = String(settings[key]);
            if (oldValue !== newValue) {
                localStorage.setItem(key, newValue);
                changed = true;
            }
        }
    });

    if (changed) {
        console.log('[Utils] Settings synchronized from remote.');
        if (window.updateUserProfileUI) window.updateUserProfileUI();
    }
}

// ── UUID ─────────────────────────────────────────────────────────────────────
// ID COLLISION FIX: Use crypto.randomUUID() (122 bits, RFC 4122 v4).
// The previous implementation (timestamp + two Uint32 values = 64 bits) was
// practically collision-free, but crypto.randomUUID() is the standard and
// eliminates any residual risk for distributed multi-device record creation.
export function generateUID() {
    return crypto.randomUUID();
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
window.isMobileRuntime = isMobileRuntime;
window.renderCompatibilityNotice = renderCompatibilityNotice;
window.SYNCABLE_SETTINGS_KEYS = SYNCABLE_SETTINGS_KEYS;
window.syncSettingsToLocalStorage = syncSettingsToLocalStorage;
window.fetchWithTimeout = fetchWithTimeout;

export { esc, parseCsv, fmtDate, statusBadge, emptyState, showToast, bindTaskCheckboxes, getObsidianFileName, downloadFile, PROJECT_TYPES, getCurrentWorkspaceUser, getCurrentWorkspaceMember, isTaskAssignedToCurrentUser, getCurrentWorkspaceActor, isMobileRuntime, renderCompatibilityNotice, syncSettingsToLocalStorage };

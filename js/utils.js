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

const PROJECT_STATUSES = ['activo', 'planificado', 'pausado', 'archivado'];
const PROJECT_STATUS_COLORS = {
    activo: '#22c55e',
    planificado: '#3b82f6',
    pausado: '#f59e0b',
    archivado: '#4b5563'
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

function downloadFile(name, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
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
    // OPCIÓN 2: Try sessionStorage first (per-tab), fallback to localStorage
    const getWithFallback = (key) => {
        if (window.StorageManager && window.StorageManager.get) {
            return window.StorageManager.get(key, 'session') || localStorage.getItem(key);
        }
        return sessionStorage.getItem(key) || localStorage.getItem(key);
    };

    const name = getWithFallback('workspace_user_name') || 'Usuario';
    const role = getWithFallback('workspace_user_role') || 'Miembro';
    const avatar = getWithFallback('workspace_user_avatar') || name.charAt(0).toUpperCase();
    const memberId = getWithFallback('workspace_user_member_id') || '';
    const email = normalizeEmail(getWithFallback('workspace_user_email') || '');
    const emailHash = getWithFallback('workspace_user_email_hash') || '';
    const team = localStorage.getItem('workspace_team_label') || 'General';
    const identityKey = computeIdentityKey({ email, memberId, name });
    return { name, role, avatar, memberId, email, emailHash, team, identityKey };
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

/**
 * Check if current user has configured their workspace member ID.
 * memberId is required for proper audit trails and collaboration tracking.
 *
 * @returns {boolean} true if memberId is set
 */
function hasMemberId() {
    // OPCIÓN 2: Check sessionStorage first, fallback to localStorage
    if (window.StorageManager && window.StorageManager.get) {
        return !!window.StorageManager.get('workspace_user_member_id', 'session') ||
               !!localStorage.getItem('workspace_user_member_id');
    }
    return !!sessionStorage.getItem('workspace_user_member_id') ||
           !!localStorage.getItem('workspace_user_member_id');
}

/**
 * Set the current user's workspace member ID.
 * This creates the link between OAuth identity and workspace team member.
 *
 * @param {string} memberId - ID of the team member (from members store)
 * @returns {boolean} true if set successfully
 */
function setCurrentMemberId(memberId) {
    if (!memberId) {
        console.warn('[Utils] Attempted to set empty memberId');
        return false;
    }
    // OPCIÓN 2: Store in sessionStorage if available, else localStorage
    if (window.StorageManager && window.StorageManager.set) {
        window.StorageManager.set('workspace_user_member_id', memberId, 'session');
    } else {
        sessionStorage.setItem('workspace_user_member_id', memberId);
    }
    console.log(`[Utils] Configured memberId: ${memberId}`);
    return true;
}

function getCurrentWorkspaceMember() {
    if (!window.store || !store.get || !store.get.members) return null;
    const members = store.get.members();
    const user = getCurrentWorkspaceUser();
    if (!members.length) return null;

    // 1. Exact Match by Member ID (Strongest)
    if (user.memberId) {
        const byId = members.find(m => m.id === user.memberId);
        if (byId) return byId;
    }

    // 2. Exact Match by Email (Strong)
    if (user.email) {
        const byEmail = members.find(m => normalizeEmail(m.email) === user.email);
        if (byEmail) return byEmail;
    }

    // 3. Match by Email Hash (Strong - used for privacy/plaintext snapshots)
    if (user.emailHash) {
        const byHash = members.find(m => m.emailHash === user.emailHash);
        if (byHash) return byHash;
    }

    // 4. Fallback to Name (Fragile - only if name is specific enough)
    const genericNames = new Set(['usuario', 'admin', 'administrator', 'miembro', 'guest']);
    const normalizedLocalName = normalizeWorkspaceName(user.name || '');
    
    if (genericNames.has(normalizedLocalName)) {
        // DO NOT fallback by name if it is a generic default; this is the 
        // root cause of the "everyone is the first user" overwrite bug.
        return null; 
    }

    return members.find(m => normalizeWorkspaceName(m.name) === normalizedLocalName)
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
    const { timeout = 60000, ...fetchOptions } = options;
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
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
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

// Map status → dot color for better visual contrast
const STATUS_DOT_COLORS = {
    'Capturado':       'var(--text-muted)',
    'Definido':        'var(--accent-info)',
    'En preparación':  'var(--accent-purple)',
    'En elaboración':  'var(--accent-warning)',
    'En revisión':     'var(--accent-teal)',
    'En espera':       'var(--accent-danger)',
    'Terminado':       'var(--accent-success)',
    'Archivado':       'var(--text-muted)',
    'activo':          'var(--accent-success)',
    'planificado':     'var(--accent-info)',
    'pausado':         'var(--accent-warning)',
    'archivado':       'var(--text-muted)',
    'cerrado':         'var(--text-muted)',
};

function statusBadge(status) {
    const cls = STATUS_BADGE_CLASSES[status] || 'badge-neutral';
    const dotColor = STATUS_DOT_COLORS[status] || 'var(--text-muted)';
    return `<span class="badge ${cls}" style="gap:5px;">
        <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block;"></span>${esc(status)}
    </span>`;
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
    el.setAttribute('data-autofill-ignore', 'true');
    el.setAttribute('data-lpignore', 'true');
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
 * ✅ SYNCABLE (workspace-global / non-identity):
 *    - workspace_team_label: Team name, shared across all members.
 *    - autolock_enabled, low_feedback_enabled: Workspace-wide UI/security preferences.
 *
 * ❌ NEVER SYNCABLE — per-user identity (BUG FIX: user overwrite):
 *    - workspace_user_name, workspace_user_email, workspace_user_avatar,
 *      workspace_user_role, workspace_user_member_id:
 *      These fields identify the LOCAL authenticated user. They are set by
 *      syncIdentityToWorkspaceProfile() from the Google ID token on sign-in.
 *      Including them in the Drive snapshot caused every pull to overwrite the
 *      current user's identity with the last person who pushed — e.g. always
 *      reverting to the coordinating user regardless of who is logged in.
 *      MUST NEVER be imported from a remote snapshot.
 *
 * ❌ NEVER SYNCABLE — per-device authentication secrets:
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
    'workspace_team_label',
    'autolock_enabled',
    'low_feedback_enabled'
];

// These MUST NEVER be in SYNCABLE_SETTINGS_KEYS. Defensive check.
// Includes user identity keys to prevent the user-overwrite bug: remote snapshots
// must never replace the local authenticated user's identity.
const FORBIDDEN_SYNC_KEYS = new Set([
    'workspace_lock_hash',
    'workspace_recovery_hash',
    'nexus_salt',
    'workspace_user_name',
    'workspace_user_email',
    'workspace_user_avatar',
    'workspace_user_role',
    'workspace_user_member_id',
]);

/**
 * Persiste los ajustes recibidos desde el cloud en el almacenamiento local.
 * - Solo sincroniza claves en SYNCABLE_SETTINGS_KEYS (whitelist approach)
 * - Rechaza explícitamente claves de identidad de usuario: la identidad del usuario
 *   local se establece exclusivamente desde el token de Google (syncIdentityToWorkspaceProfile),
 *   nunca desde el snapshot de Drive. Importarlas causaría que cualquier sync sobreescriba
 *   al usuario actual con la identidad de quien hizo el último push (BUG: user-overwrite).
 * - Rechaza claves de autenticación que podrían permitir account takeover
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

/**
 * Genera una cadena en formato iCalendar (.ics) a partir de una lista de eventos.
 * Soporta eventos de todo el día (Tasks) y con hora específica (Sessions).
 */
export function generateICS(events) {
    const foldLine = (line) => {
        const parts = [];
        while (line.length > 75) {
            parts.push(line.slice(0, 75));
            line = ' ' + line.slice(75);
        }
        parts.push(line);
        return parts.join('\r\n');
    };

    const escapeICS = (str) => {
        if (!str) return '';
        return str.replace(/[\\,;]/g, (match) => '\\' + match).replace(/\n/g, '\\n');
    };

    const formatDate = (dateStr, timeStr) => {
        if (!dateStr) return '';
        const cleanDate = dateStr.replace(/-/g, '');
        if (!timeStr) return `${cleanDate}`; // All-day format: YYYYMMDD
        const cleanTime = timeStr.replace(/:/g, '');
        return `${cleanDate}T${cleanTime.padEnd(4, '0')}00`; // Timed format: YYYYMMDDTHHMMSS
    };

    let ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Nexus//ProjectManagement//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    events.forEach(event => {
        const uid = event.id || generateUID();
        const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        
        ics.push('BEGIN:VEVENT');
        ics.push(`UID:${uid}`);
        ics.push(`DTSTAMP:${dtstamp}`);
        
        if (event.start && event.isAllDay) {
            // All-day uses VALUE=DATE
            ics.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
            // ICS ends are exclusive for all-day, add 1 day if we had an end date, 
            // but for simplicity (one-day tasks), we just use one date.
        } else if (event.start) {
            ics.push(`DTSTART:${formatDate(event.start, event.startTime)}`);
            if (event.end || event.endTime) {
                ics.push(`DTEND:${formatDate(event.end || event.start, event.endTime)}`);
            }
        }

        ics.push(foldLine(`SUMMARY:${escapeICS(event.title)}`));
        if (event.description) {
            ics.push(foldLine(`DESCRIPTION:${escapeICS(event.description)}`));
        }
        if (event.location) {
            ics.push(foldLine(`LOCATION:${escapeICS(event.location)}`));
        }
        
        ics.push('END:VEVENT');
    });

    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
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
window.generateICS = generateICS;
window.getCurrentWorkspaceUser = getCurrentWorkspaceUser;
window.getCurrentWorkspaceMember = getCurrentWorkspaceMember;
window.isTaskAssignedToCurrentUser = isTaskAssignedToCurrentUser;
window.getCurrentWorkspaceActor = getCurrentWorkspaceActor;
window.isMobileRuntime = isMobileRuntime;
window.renderCompatibilityNotice = renderCompatibilityNotice;
window.SYNCABLE_SETTINGS_KEYS = SYNCABLE_SETTINGS_KEYS;
window.syncSettingsToLocalStorage = syncSettingsToLocalStorage;
window.fetchWithTimeout = fetchWithTimeout;

export { esc, parseCsv, fmtDate, statusBadge, emptyState, showToast, bindTaskCheckboxes, getObsidianFileName, downloadFile, PROJECT_TYPES, getCurrentWorkspaceUser, getCurrentWorkspaceMember, isTaskAssignedToCurrentUser, getCurrentWorkspaceActor, isMobileRuntime, renderCompatibilityNotice, syncSettingsToLocalStorage, hasMemberId, setCurrentMemberId };

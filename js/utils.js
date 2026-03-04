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
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
function showToast(message, type = 'info') {
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

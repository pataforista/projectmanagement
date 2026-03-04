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
    return `<div class="empty-state"><i data-feather="${icon}"></i><p>${text}</p></div>`;
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

window.esc = esc;
window.fmtDate = fmtDate;
window.statusBadge = statusBadge;
window.emptyState = emptyState;
window.showToast = showToast;
window.bindTaskCheckboxes = bindTaskCheckboxes;

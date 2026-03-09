/**
 * scripts/timeline.js
 *
 * Renderiza timeline de cambios en notas.
 * - Diferencia createdAt vs updatedAt
 * - Usa Intl.DateTimeFormat para localización
 * - Evita XSS al renderizar, usa textContent para datos de usuario
 */

const timelineFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

/**
 * Convierte valor a array si es necesario
 */
function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/**
 * Transforma notas a eventos de timeline
 *
 * @param {Array} allNotes - Array de notas
 * @param {object} options - { limit }
 * @returns {Array} Eventos de timeline ordenados por fecha
 */
export function getTimelineData(allNotes = [], options = {}) {
  const { limit = 50 } = options;

  return allNotes
    .filter(note => note && (note.updatedAt || note.createdAt))
    .map(note => {
      const createdAt = note.createdAt ? new Date(note.createdAt) : null;
      const updatedAt = note.updatedAt ? new Date(note.updatedAt) : createdAt;

      const isNew =
        createdAt &&
        updatedAt &&
        createdAt.getTime() === updatedAt.getTime();

      const category =
        note.metadata?.projectType ||
        note.metadata?.type ||
        normalizeArray(note.tags)[0] ||
        'general';

      return {
        id: note.id,
        title: String(note.title || 'Sin título'),
        user: String(note.updatedBy || note.createdBy || 'Usuario'),
        action: isNew ? 'creó' : 'actualizó',
        timeISO: updatedAt ? updatedAt.toISOString() : null,
        timeLabel: updatedAt ? timelineFormatter.format(updatedAt) : '',
        type: String(category)
      };
    })
    .sort((a, b) => new Date(b.timeISO) - new Date(a.timeISO))
    .slice(0, limit);
}

/**
 * Renderiza timeline en el DOM
 *
 * @param {string} containerId - ID del contenedor
 * @param {Array} timelineData - Datos del timeline
 */
export function renderTimeline(containerId, timelineData = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.textContent = '';

  const fragment = document.createDocumentFragment();

  for (const item of timelineData) {
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-item';
    wrapper.style.borderLeft = '2px solid var(--accent)';
    wrapper.style.padding = '10px';
    wrapper.style.marginBottom = '15px';

    const metaRow = document.createElement('div');
    metaRow.style.display = 'flex';
    metaRow.style.alignItems = 'center';
    metaRow.style.gap = '10px';

    const icon = document.createElement('i');
    icon.setAttribute('data-feather', 'clock');
    icon.style.width = '14px';

    const time = document.createElement('span');
    time.style.fontSize = '0.8rem';
    time.textContent = item.timeLabel;

    metaRow.append(icon, time);

    const p = document.createElement('p');
    p.style.margin = '5px 0';

    const strong = document.createElement('strong');
    strong.textContent = item.user;

    const text1 = document.createTextNode(` ${item.action} la nota `);

    const link = document.createElement('a');
    link.href = `#note-${encodeURIComponent(item.id)}`;
    link.textContent = `"${item.title}"`;

    p.append(strong, text1, link);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.type;

    wrapper.append(metaRow, p, badge);
    fragment.appendChild(wrapper);
  }

  container.appendChild(fragment);

  if (window.feather && typeof window.feather.replace === 'function') {
    window.feather.replace();
  }
}

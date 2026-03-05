/**
 * views/medical.js — Medical Interconsultation Tracker
 */

function renderMedical(root) {
  const interconsultations = store.get.interconsultations() || [];
  const projects = store.get.projects().filter(p => p.type === 'Médico' || p.type === 'Investigación');

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Panel de Interconsultas</h1>
          <p class="view-subtitle">Seguimiento de derivaciones y consultas especializadas.</p>
        </div>
        <div class="view-actions">
           <button class="btn btn-primary" onclick="openInterconsultationModal()">
             <i data-feather="plus"></i> Nueva Interconsulta
           </button>
        </div>
      </div>

      <div class="medical-stats" style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
        ${statPill(interconsultations.length, 'Totales', 'activity')}
        ${statPill(interconsultations.filter(i => i.status === 'Solicitada').length, 'Pendientes', 'clock')}
        ${statPill(interconsultations.filter(i => i.status === 'Respondida').length, 'Completadas', 'check-circle')}
      </div>

      <div class="card glass-panel" style="overflow:auto;">
        <table class="list-table" style="width:100%; text-align:left; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Paciente (ID)</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Especialidad</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Estado</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Último Cambio</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${interconsultations.length === 0
      ? `<tr><td colspan="5" style="padding:32px; text-align:center; color:var(--text-muted);">No hay interconsultas registradas.</td></tr>`
      : interconsultations.map(i => {
        const proj = store.get.projectById(i.projectId);
        return `
                <tr>
                  <td style="padding:12px; font-weight:500;">${esc(i.patientId || 'Ref-000')}</td>
                  <td style="padding:12px; color:var(--text-secondary); font-size:0.85rem;">${esc(i.specialty)}</td>
                  <td style="padding:12px;"><span class="badge ${getStatusBadgeClass(i.status)}">${i.status}</span></td>
                  <td style="padding:12px; color:var(--text-muted); font-size:0.8rem;">${i.createdAt ? new Date(i.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td style="padding:12px;">
                    <button class="btn btn-icon btn-sm" onclick="openInterconsultationModal('${i.id}')"><i data-feather="edit-2"></i></button>
                    ${i.obsidianUri ? `<a href="${i.obsidianUri}" class="btn btn-icon btn-sm" title="Ver en Obsidian"><i data-feather="external-link"></i></a>` : ''}
                  </td>
                </tr>
                `;
      }).join('')
    }
          </tbody>
        </table>
      </div>
    </div>
  `;

  feather.replace();
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Solicitada': return 'badge-warning';
    case 'En proceso': return 'badge-info';
    case 'Respondida': return 'badge-success';
    default: return 'badge-neutral';
  }
}

// Modal logic for interconsultations
window.openInterconsultationModal = function (id = null) {
  const item = id ? store.get.interconsultations().find(i => i.id === id) : null;
  const projects = store.get.projects().filter(p => p.type === 'Médico' || p.type === 'Investigación');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h2>${id ? 'Editar' : 'Nueva'} Interconsulta</h2>
        <button class="btn btn-icon" id="int-close"><i data-feather="x"></i></button>
      </div>
      <form id="int-form" class="modal-body">
        <div class="form-group">
          <label class="form-label">ID del Paciente (Privado)</label>
          <input class="form-input" name="patientId" value="${item ? esc(item.patientId) : ''}" placeholder="Ej. PAC-2024-001" required>
        </div>
        <div class="form-group">
          <label class="form-label">Especialidad Destino</label>
          <input class="form-input" name="specialty" value="${item ? esc(item.specialty) : ''}" placeholder="Ej. Cardiología" required>
        </div>
        <div class="form-group">
          <label class="form-label">Proyecto Vinculado</label>
          <select class="form-input" name="projectId">
            <option value="">Ninguno</option>
            ${projects.map(p => `<option value="${p.id}" ${item?.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-input" name="status">
            <option value="Solicitada" ${item?.status === 'Solicitada' ? 'selected' : ''}>Solicitada</option>
            <option value="En proceso" ${item?.status === 'En proceso' ? 'selected' : ''}>En proceso</option>
            <option value="Respondida" ${item?.status === 'Respondida' ? 'selected' : ''}>Respondida</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Contexto / Notas Cortas</label>
          <textarea class="form-input" name="notes" rows="3">${item ? esc(item.notes) : ''}</textarea>
        </div>
        <div class="modal-footer" style="padding:16px 0 0 0;">
          <button type="button" class="btn btn-ghost" id="int-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">${id ? 'Actualizar' : 'Crear'} Registro</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  feather.replace();

  overlay.querySelector('#int-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#int-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#int-form').onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (id) {
      store.dispatch('UPDATE_INTERCONSULTATION', { id, ...data });
    } else {
      store.dispatch('ADD_INTERCONSULTATION', data);
    }
    overlay.remove();
    renderMedical(document.getElementById('app-root'));
  };
};

window.renderMedical = renderMedical;

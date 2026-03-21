/**
 * views/medical.js — Medical Interconsultation Tracker
 */

function renderMedical(root) {
  const interconsultations = store.get.interconsultations() || [];
  const savedSheetsUrl = localStorage.getItem('cfg_med_csvUrl') || '';
  const isSyncing = root.dataset.syncing === 'true';

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Panel de Interconsultas</h1>
          <p class="view-subtitle">Seguimiento de derivaciones y consultas especializadas.</p>
        </div>
        <div class="view-actions" style="display:flex; gap:8px;">
           ${savedSheetsUrl ? `
             <button class="btn btn-secondary ${isSyncing ? 'btn-loading' : ''}" id="btn-sync-medical" onclick="syncInterconsultations()">
               <i data-feather="${isSyncing ? 'loader' : 'refresh-cw'}"></i> Sincronizar Excel
             </button>
             <button class="btn btn-ghost" id="btn-toggle-excel" onclick="toggleExcelEmbed()">
               <i data-feather="eye"></i> <span id="text-toggle-excel">Ver Excel</span>
             </button>
           ` : ''}
           <button class="btn btn-secondary" onclick="openImportInterconsultationModal()">
             <i data-feather="download"></i> Configurar Origen
           </button>
           <button class="btn btn-primary" onclick="openInterconsultationModal()">
             <i data-feather="plus"></i> Nueva
           </button>
        </div>
      </div>

      <div id="excel-embed-container" style="display:none; margin-bottom:20px; height:400px; border-radius:12px; overflow:hidden; border:1px solid var(--border-color);" class="glass-panel">
        <iframe id="medical-excel-iframe" src="" style="width:100%; height:100%; border:none;"></iframe>
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
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Fecha</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Nombre</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Expediente</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Observaciones</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Agenda</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Acepta</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Razón</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Estado</th>
              <th style="padding:12px; border-bottom:1px solid var(--border-color); font-size:0.8rem;">Acciones</th>
            </tr>
          </thead>
          <tbody class="animate-cascade">
            ${interconsultations.length === 0
      ? `<tr><td colspan="5" style="padding:32px; text-align:center; color:var(--text-muted);">No hay interconsultas registradas.</td></tr>`
      : interconsultations.map(i => {
        const proj = store.get.projectById(i.projectId);
        return `
                <tr>
                  <td style="padding:12px; font-size:0.8rem; color:var(--text-muted);">${esc(i.date || (i.createdAt ? new Date(i.createdAt).toLocaleDateString('es-MX') : '—'))}</td>
                  <td style="padding:12px; font-weight:500;">${esc(i.patientName || '—')}</td>
                  <td style="padding:12px; font-size:0.85rem;">${esc(i.patientId || '—')}</td>
                  <td style="padding:12px; font-size:0.85rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(i.notes || '')}">${esc(i.notes || '—')}</td>
                  <td style="padding:12px; font-size:0.85rem;">${esc(i.agenda || '—')}</td>
                  <td style="padding:12px; font-size:0.85rem;">${esc(i.acceptedBy || '—')}</td>
                  <td style="padding:12px; font-size:0.85rem;">${esc(i.reason || '—')}</td>
                  <td style="padding:12px;"><span class="badge ${getStatusBadgeClass(i.status)}">${i.status}</span></td>
                  <td style="padding:12px;">
                    <button class="btn btn-icon btn-sm" onclick="openInterconsultationModal('${i.id}')"><i data-feather="edit-2"></i></button>
                    ${i.obsidianUri ? `<a href="${esc(safeExternalUrl(i.obsidianUri))}" target="_blank" rel="noopener noreferrer" class="btn btn-icon btn-sm" title="Ver en Obsidian"><i data-feather="external-link"></i></a>` : ''}
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

window.openInterconsultationModal = function (id = null) {
  const item = id ? store.get.interconsultations().find(i => i.id === id) : null;
  const projects = store.get.projects().filter(p => p.type === 'Médico' || p.type === 'Investigación');
  const members = store.get.members();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h2>${id ? 'Editar' : 'Nueva'} Interconsulta</h2>
        <button class="btn btn-icon" id="int-close"><i data-feather="x"></i></button>
      </div>
      <form id="int-form" class="modal-body">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input class="form-input" name="date" type="date" value="${item?.date || (item?.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])}">
          </div>
          <div class="form-group">
            <label class="form-label">Expediente</label>
            <input class="form-input" name="patientId" value="${item ? esc(item.patientId) : ''}" placeholder="Ej. PAC-2024-001" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre del Paciente</label>
          <input class="form-input" name="patientName" value="${item ? esc(item.patientName) : ''}" placeholder="Nombre completo">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label">Especialidad</label>
            <input class="form-input" name="specialty" value="${item ? esc(item.specialty) : ''}" placeholder="Ej. Cardiología" required>
          </div>
          <div class="form-group">
            <label class="form-label">Agenda</label>
            <input class="form-input" name="agenda" value="${item ? esc(item.agenda) : ''}" placeholder="Ej. 11:30 AM">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label">Quien Acepta</label>
            <input class="form-input" name="acceptedBy" value="${item ? esc(item.acceptedBy) : ''}" placeholder="Nombre del médico">
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select class="form-select" name="status">
              <option value="Solicitada" ${item?.status === 'Solicitada' ? 'selected' : ''}>Solicitada</option>
              <option value="En proceso" ${item?.status === 'En proceso' ? 'selected' : ''}>En proceso</option>
              <option value="Respondida" ${item?.status === 'Respondida' ? 'selected' : ''}>Respondida</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Razón de la Interconsulta</label>
          <input class="form-input" name="reason" value="${item ? esc(item.reason) : ''}" placeholder="Motivo de la consulta">
        </div>
        <div class="form-group">
          <label class="form-label">Observaciones</label>
          <textarea class="form-textarea" name="notes" rows="3">${item ? esc(item.notes) : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Miembro Responsable (App)</label>
          <select class="form-select" name="assigneeId">
            <option value="">Sin asignar</option>
            ${members.map(m => `<option value="${m.id}" ${item?.assigneeId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-footer" style="padding:16px 0 0 0; display:flex; justify-content:space-between;">
          ${id ? `<button type="button" class="btn btn-ghost" id="int-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : '<div></div>'}
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary" id="int-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${id ? 'Actualizar' : 'Crear'} Registro</button>
          </div>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  feather.replace();

  if (id) {
    overlay.querySelector('#int-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta interconsulta?')) {
        store.dispatch('DELETE_INTERCONSULTATION', { id });
        overlay.remove();
        renderMedical(document.getElementById('app-root'));
      }
    });
  }

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

// Integrations logic
window.openImportInterconsultationModal = function () {
  const members = store.get.members();
  let savedCsv = localStorage.getItem('cfg_med_csvUrl') || '';
  let savedRedApi = localStorage.getItem('cfg_med_redApi') || '';
  let savedRedTok = localStorage.getItem('cfg_med_redToken') || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:550px;">
      <div class="modal-header">
        <h2><i data-feather="download"></i> Importar Interconsultas</h2>
        <button class="btn btn-icon" id="imp-close"><i data-feather="x"></i></button>
      </div>
      <div class="modal-body">

        <div class="form-group" style="padding:12px; background:var(--bg-surface-2); border-radius:8px; margin-bottom:16px;">
          <h3 style="margin:0 0 12px 0; font-size:1rem; display:flex; align-items:center; gap:6px;"><i data-feather="file-text" style="width:16px;height:16px;"></i> Importar de Google Sheets (Vía API)</h3>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
            Pega el enlace de tu hoja de cálculo. <b>Requiere estar conectado a Google Drive</b>. Columnas sugeridas: <b>fecha</b>, <b>nombre</b>, <b>expediente</b>, <b>observaciones</b>, <b>agenda</b>, <b>acepta</b>, <b>razon</b>.
          </p>
          <label class="form-label">Enlace de Google Sheets</label>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="imp-sheets-url" placeholder="https://docs.google.com/spreadsheets/d/1X2Y.../edit" value="${esc(savedCsv)}" style="flex:1;">
            <button class="btn btn-primary" id="btn-run-sheets"><i data-feather="play"></i> Traer de Sheets</button>
          </div>
        </div>

        <div class="form-group" style="padding:12px; background:var(--bg-surface-2); border-radius:8px; margin-bottom:16px;">
          <h3 style="margin:0 0 12px 0; font-size:1rem; display:flex; align-items:center; gap:6px;"><i data-feather="database" style="width:16px;height:16px;"></i> Importar de REDCap (Vía API)</h3>
          <label class="form-label">URL API REDCap</label>
          <input class="form-input" id="imp-red-url" placeholder="Ej. https://redcap.institucion.edu/api/" value="${esc(savedRedApi)}" style="margin-bottom:8px;">
          <label class="form-label">Token API REDCap</label>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="imp-red-tok" type="password" placeholder="Ej. A1B2C3D4E5..." value="${esc(savedRedTok)}" style="flex:1;">
            <button class="btn btn-primary" id="btn-run-redcap"><i data-feather="play"></i> Traer REDCap</button>
          </div>
        </div>

        <hr style="border:0; border-top:1px solid var(--border-color); margin:16px 0;">

        <div class="form-group">
          <label class="form-label"><i data-feather="user-check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>Asignar importaciones a:</label>
          <select class="form-select" id="imp-assignee">
            <option value="">Sin asignar (Dejar en blanco)</option>
            ${members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  feather.replace();

  overlay.querySelector('#imp-close').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#btn-run-sheets').addEventListener('click', async () => {
    const url = overlay.querySelector('#imp-sheets-url').value.trim();
    if (!url) return showToast('Por favor, ingresa una URL válida de Sheets', 'error');

    // Check for access token
    const token = window.syncManager?.getAccessToken?.();
    if (!token) {
      showToast('No estás conectado. Abre el panel "Sincronización" (abajo izquierda) y conecta tu Google Drive primero.', 'error');
      return;
    }

    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
      return showToast('Enlace no válido. Usa el enlace normal (https://docs.google.com/.../d/.../edit)', 'error');
    }
    const spreadsheetId = match[1];

    // Save preference
    localStorage.setItem('cfg_med_csvUrl', url);
    const assigneeId = overlay.querySelector('#imp-assignee').value || null;

    try {
      const btn = overlay.querySelector('#btn-run-sheets');
      btn.innerHTML = '<i class="feather" data-feather="loader"></i> Cargando...';

        const apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/A:Z';
      const res = await fetch(apiUrl, {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (!res.ok) {
        let errMsg = 'Error al descargar Sheets: ' + res.statusText;
        if (res.status === 401) {
          errMsg = 'Token expirado. Reconecta tu Google Drive desde el panel de Sincronización (ícono abajo izquierda) y vuelve a intentarlo.';
        } else if (res.status === 403) {
          errMsg = 'Permiso denegado. Desconecta y vuelve a conectar tu Google Drive para otorgar permisos de Google Sheets. El token actual puede no incluir ese scope.';
        } else if (res.status === 404) {
          errMsg = 'Hoja de cálculo no encontrada. Verifica que el enlace sea correcto y que tu cuenta tenga acceso.';
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const rows = data.values;
      if (!rows || rows.length < 2) throw new Error('La hoja está vacía o sin suficientes datos');

      const headers = rows[0].map(h => String(h).toLowerCase().trim());
      let imported = 0;

      for (let i = 1; i < rows.length; i++) {
        if (!rows[i] || rows[i].length === 0) continue;
        const vals = rows[i];
        const obj = {};
        headers.forEach((h, j) => obj[h] = vals[j] || '');

        if (obj.paciente || obj.patient || obj.id || obj.especialidad || obj.specialty || obj.nombre || obj.patientname) {
          await store.dispatch('ADD_INTERCONSULTATION', {
            date: obj.fecha || obj.date || '',
            patientName: obj.nombre || obj.patientname || '',
            patientId: obj.expediente || obj.paciente || obj.patient || obj.id || ('IMP-' + Date.now()),
            specialty: obj.especialidad || obj.specialty || 'General',
            notes: obj.observaciones || obj.notas || obj.notes || '',
            agenda: obj.agenda || '',
            acceptedBy: obj.acepta || obj.acceptedby || '',
            reason: obj.razon || obj.reason || '',
            status: obj.estado || obj.status || 'Solicitada',
            assigneeId: assigneeId
          });
          imported++;
        }
      }
      showToast('Importación exitosa. Se añadieron ' + imported + ' registros.', 'success');
      overlay.remove();
      renderMedical(document.getElementById('app-root'));
    } catch (err) {
      console.error(err);
      showToast('Error: ' + err.message, 'error');
      overlay.querySelector('#btn-run-sheets').innerHTML = '<i data-feather="play"></i> Traer de Sheets';
      feather.replace();
    }
  });

  overlay.querySelector('#btn-run-redcap').addEventListener('click', async () => {
    const url = overlay.querySelector('#imp-red-url').value.trim();
    const token = overlay.querySelector('#imp-red-tok').value.trim();
    if (!url || !token) return showToast('URL de API y Token son obligatorios.', 'error');

    // Save preference globally
    localStorage.setItem('cfg_med_redApi', url);
    localStorage.setItem('cfg_med_redToken', token);
    const assigneeId = overlay.querySelector('#imp-assignee').value || null;

    try {
      const btn = overlay.querySelector('#btn-run-redcap');
      btn.innerHTML = '<i class="feather" data-feather="loader"></i> Conectando...';

      const formData = new URLSearchParams();
      formData.append('token', token);
      formData.append('content', 'record');
      formData.append('action', 'export');
      formData.append('format', 'json');
      formData.append('type', 'flat');
      formData.append('csvDelimiter', '');
      formData.append('rawOrLabel', 'raw');
      formData.append('rawOrLabelHeaders', 'raw');
      formData.append('exportCheckboxLabel', 'false');
      formData.append('exportSurveyFields', 'false');
      formData.append('exportDataAccessGroups', 'false');
      formData.append('returnFormat', 'json');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: formData
      });

      if (!res.ok) throw new Error('Error al conectar con REDCap: ' + res.statusText);
      const data = await res.json();

      let imported = 0;
      for (const rec of data) {
        await store.dispatch('ADD_INTERCONSULTATION', {
          patientId: rec.record_id || rec.id || ('REDCAP-' + Date.now()),
          specialty: rec.especialidad || rec.specialty || 'General',
          status: 'Solicitada', // By default since REDCap schema is variable
          notes: rec.notas || JSON.stringify(rec),
          assigneeId: assigneeId
        });
        imported++;
      }

      showToast('Sincronización de REDCap exitosa. ' + imported + ' registros añadidos.', 'success');
      overlay.remove();
      renderMedical(document.getElementById('app-root'));
    } catch (err) {
      console.error(err);
      showToast('Error de REDCap: Verifica el enlace (CORS) y Token.', 'error');
      overlay.querySelector('#btn-run-redcap').innerHTML = '<i data-feather="play"></i> Traer REDCap';
      feather.replace();
    }
  });
};

// Sync Logic
window.syncInterconsultations = async function() {
    const url = localStorage.getItem('cfg_med_csvUrl');
    if (!url) return;

    const root = document.getElementById('app-root');
    root.dataset.syncing = 'true';
    renderMedical(root);

    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
        root.dataset.syncing = 'false';
        renderMedical(root);
        return showToast('URL de Sheets no válida', 'error');
    }
    const spreadsheetId = match[1];
    const token = window.syncManager?.getAccessToken?.();

    if (!token) {
        root.dataset.syncing = 'false';
        renderMedical(root);
        return showToast('No hay token de Google. Conecta Drive primero.', 'error');
    }

    try {
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z`;
        const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` }});
        if (!res.ok) throw new Error('Error al obtener datos: ' + res.status);

        const data = await res.json();
        const rows = data.values;
        if (!rows || rows.length < 2) throw new Error('No hay datos en la hoja.');

        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const existingRecords = store.get.interconsultations();
        let added = 0;
        let updated = 0;

        for (let i = 1; i < rows.length; i++) {
            const vals = rows[i];
            if (!vals || vals.length === 0) continue;
            const obj = {};
            headers.forEach((h, j) => obj[h] = vals[j] || '');

            const patientId = obj.expediente || obj.paciente || obj.patient || obj.id;
            if (!patientId) continue;

            // Simple duplicate detection: if patientId and date match a record, update it.
            // Otherwise add new.
            const date = obj.fecha || obj.date || '';
            const existing = existingRecords.find(r => r.patientId === patientId && r.date === date);

            const payload = {
                date: date,
                patientName: obj.nombre || obj.patientname || '',
                patientId: patientId,
                specialty: obj.especialidad || obj.specialty || 'General',
                notes: obj.observaciones || obj.notas || obj.notes || '',
                agenda: obj.agenda || '',
                acceptedBy: obj.acepta || obj.acceptedby || '',
                reason: obj.razon || obj.reason || '',
                status: obj.estado || obj.status || 'Solicitada',
                visibility: 'shared'
            };

            if (existing) {
                await store.dispatch('UPDATE_INTERCONSULTATION', { id: existing.id, ...payload });
                updated++;
            } else {
                await store.dispatch('ADD_INTERCONSULTATION', payload);
                added++;
            }
        }

        showToast(`Sincronización finalizada: ${added} nuevos, ${updated} actualizados.`, 'success');
        localStorage.setItem('cfg_med_lastSync', new Date().toISOString());
    } catch (err) {
        console.error(err);
        showToast('Fallo en sincronización: ' + err.message, 'error');
    } finally {
        root.dataset.syncing = 'false';
        renderMedical(root);
    }
};

window.toggleExcelEmbed = function() {
    const container = document.getElementById('excel-embed-container');
    const iframe = document.getElementById('medical-excel-iframe');
    const text = document.getElementById('text-toggle-excel');
    const url = localStorage.getItem('cfg_med_csvUrl');

    if (container.style.display === 'none') {
        container.style.display = 'block';
        text.textContent = 'Ocultar Excel';
        // Convert edit URL to preview URL
        const previewUrl = url.replace(/\/edit.*$/, '/preview');
        if (iframe.src !== previewUrl) iframe.src = previewUrl;
    } else {
        container.style.display = 'none';
        text.textContent = 'Ver Excel';
    }
};

window.renderMedical = renderMedical;

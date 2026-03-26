/**
 * views/logs.js — Activity Logs view
 */

function renderLogs(root) {
    const logs = store.get.logs && store.get.logs() || [];

    root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Registro de Actividad</h1>
          <p class="view-subtitle">Historial de cambios y eventos en el espacio de trabajo.</p>
        </div>
      </div>

      <div class="logs-container glass-panel" style="padding:20px; border-radius:var(--radius-md);">
        ${logs.length ? renderLogsList(logs) : emptyState('activity', 'No hay actividad registrada aún.')}
      </div>
    </div>`;

    feather.replace();
}

function renderLogsList(logs) {
    const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);
    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${sorted.map(log => {
            const icon = getLogIcon(log.type, log.entity_type);
            const entityLabel = log.entity_type ? `<span style="text-transform:uppercase; font-size:0.65rem; padding:2px 6px; border-radius:4px; background:var(--surface-3); color:var(--text-muted); margin-right:6px;">${log.entity_type}</span>` : '';
            
            return `
              <div style="display:flex; gap:12px; align-items:flex-start;" class="log-item">
                <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-primary-glow); color:var(--accent-primary); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  <i data-feather="${icon}" style="width:16px;height:16px;"></i>
                </div>
                <div style="flex:1;">
                  <div style="font-size:0.88rem; font-weight:500;">
                    ${entityLabel}${esc(log.message)}
                  </div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${fmtRelativeTime(log.timestamp)}</div>
                </div>
              </div>`;
        }).join('')}
      </div>`;
}

function getLogIcon(type, entityType) {
    // Entity-specific icons take precedence
    if (entityType === 'project') return 'folder';
    if (entityType === 'task') return 'check-square';
    if (entityType === 'member') return 'user';
    
    switch (type) {
        case 'create': return 'plus-circle';
        case 'update': return 'edit-3';
        case 'delete': return 'trash-2';
        case 'complete': return 'check-circle';
        default: return 'info';
    }
}

function fmtRelativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Hace un momento';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
    return new Date(ts).toLocaleDateString();
}

window.renderLogs = renderLogs;

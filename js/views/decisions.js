/**
 * views/decisions.js — Decisions registry
 */

function renderDecisions(root) {
  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Decisiones</h1>
          <p class="view-subtitle">Registro de decisiones clave con contexto y trazabilidad.</p>
        </div>
        <div class="view-actions">
          <select class="filter-select" id="dec-filter-proj">
            <option value="">Todos los proyectos</option>
            ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <select class="filter-select" id="dec-filter-impact">
            <option value="">Todos los impactos</option>
            <option value="alta">Alto</option>
            <option value="media">Medio</option>
            <option value="baja">Bajo</option>
          </select>
          <button class="btn btn-primary" id="new-dec-btn"><i data-feather="plus"></i> Nueva decisión</button>
        </div>
      </div>
      <div class="decisions-list" id="decisions-list">
        ${renderDecisionsList(store.get.allDecisions())}
      </div>
    </div>`;

  feather.replace();

  root.querySelector('#new-dec-btn').addEventListener('click', () => openDecisionModal());
  ['dec-filter-proj', 'dec-filter-impact'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('change', () => {
      const pid = root.querySelector('#dec-filter-proj')?.value || '';
      const impact = root.querySelector('#dec-filter-impact')?.value || '';
      let decs = store.get.allDecisions();
      if (pid) decs = decs.filter(d => d.projectId === pid);
      if (impact) decs = decs.filter(d => d.impact === impact);
      root.querySelector('#decisions-list').innerHTML = renderDecisionsList(decs);
      feather.replace();
      bindDecisionCards(root);
    });
  });

  bindDecisionCards(root);
}

function renderDecisionsList(decisions) {
  if (!decisions.length) return emptyState('zap', 'Sin decisiones. Registra la primera.');
  return decisions.map(d => decisionCard(d)).join('');
}

// decisionCard removed, now in components.js

function bindDecisionCards(root) {
  root.querySelectorAll('.dec-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (confirm('¿Eliminar esta decisión?')) {
        await store.dispatch('DELETE_DECISION', { id: btn.dataset.id });
        root.querySelector('#decisions-list').innerHTML = renderDecisionsList(store.get.allDecisions());
        feather.replace();
        bindDecisionCards(root);
      }
    });
  });
}

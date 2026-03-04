/**
 * views/cycles.js — Cycles view
 */

function renderCycles(root) {
  const allCycles = store.get.allCycles();

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Ciclos</h1>
          <p class="view-subtitle">Planificación temporal y timeboxing de producción.</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="new-cycle-btn"><i data-feather="plus"></i> Nuevo ciclo</button>
        </div>
      </div>

      <div class="filter-bar">
        <select class="filter-select" id="cycle-filter-proj">
          <option value="">Todos los proyectos</option>
          ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <select class="filter-select" id="cycle-filter-status">
          <option value="">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="cerrado">Cerrados</option>
        </select>
      </div>

      <div class="cycles-grid" id="cycles-grid">
        ${renderCyclesGrid(allCycles)}
      </div>
    </div>`;

  feather.replace();

  root.querySelector('#new-cycle-btn').addEventListener('click', () => openCycleModal());

  ['cycle-filter-proj', 'cycle-filter-status'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('change', () => {
      const pid = root.querySelector('#cycle-filter-proj')?.value || '';
      const status = root.querySelector('#cycle-filter-status')?.value || '';
      let filtered = store.get.allCycles();
      if (pid) filtered = filtered.filter(c => c.projectId === pid);
      if (status) filtered = filtered.filter(c => (c.status || 'activo') === status);
      const grid = root.querySelector('#cycles-grid');
      if (grid) {
        grid.innerHTML = renderCyclesGrid(filtered);
        feather.replace();
      }
    });
  });
}

function renderCyclesGrid(cycles) {
  if (!cycles.length) return emptyState('refresh-cw', 'No hay ciclos. Crea el primero.');
  return cycles.map(c => cycleCard(c)).join('');
}

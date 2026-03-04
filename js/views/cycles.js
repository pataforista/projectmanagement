/**
 * views/cycles.js — Cycles view
 */

function renderCycles(root) {
  const cycles = store.get.activeCycles().concat(
    store.get.allCycles ? store.get.allCycles() : []
  ).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);

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
      </div>

      <div class="cycles-grid" id="cycles-grid">
        ${cycles.length ? cycles.map(c => cycleCard(c)).join('') : emptyState('refresh-cw', 'No hay ciclos. Crea el primero.')}
      </div>
    </div>`;

  feather.replace();
  root.querySelector('#new-cycle-btn').addEventListener('click', () => openCycleModal());

  const projFilter = root.querySelector('#cycle-filter-proj');
  if (projFilter) {
    projFilter.addEventListener('change', e => {
      const pid = e.target.value;
      const all = store.get.activeCycles();
      const filtered = pid ? all.filter(c => c.projectId === pid) : all;
      const grid = root.querySelector('#cycles-grid');
      if (grid) {
        grid.innerHTML = filtered.length
          ? filtered.map(c => cycleCard(c)).join('')
          : emptyState('refresh-cw', 'Sin ciclos para este proyecto.');
        feather.replace();
      }
    });
  }
}

// Cycle card removed, now in components.js

// subscribe to store so cycles list updates
store.subscribe('cycles', () => {
  const grid = document.getElementById('cycles-grid');
  if (grid) {
    const cycles = store.get.activeCycles();
    grid.innerHTML = cycles.length ? cycles.map(c => cycleCard(c)).join('') : emptyState('refresh-cw', 'No hay ciclos.');
    feather.replace();
  }
});

/**
 * views/dashboard.js — Dashboard view
 */

function renderDashboard(root) {
  const tasks = store.get.activeTasks();
  const cycles = store.get.activeCycles();
  const blocked = store.get.blockedTasks();
  const upcoming = store.get.upcomingDeliverables(7);
  const projects = store.get.projects();

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1 id="dash-greeting">Dashboard</h1>
          <p class="view-subtitle" id="dash-subtitle">Resumen de tu actividad y próximos entregables. ✨</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="dash-new-task"><i data-feather="plus"></i> Nueva tarea</button>
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
        ${statPill(tasks.length, 'Tareas activas', 'check-square')}
        ${statPill(cycles.length, 'Ciclos en curso', 'refresh-cw')}
        ${statPill(blocked.length, 'Bloqueadas', 'alert-circle', blocked.length > 0 ? 'var(--accent-danger)' : null)}
        ${statPill(upcoming.length, 'Vencen en 7 días', 'calendar', upcoming.length > 3 ? 'var(--accent-warning)' : null)}
      </div>

      <div class="dashboard-grid">
        <!-- Active Tasks -->
        <div class="card glass-panel col-span-2">
          <div class="card-header">
            <h3>Mis Tareas Activas</h3>
            <span class="badge badge-neutral">${tasks.length}</span>
          </div>
          <div class="card-body">
            ${tasks.length === 0
      ? emptyState('check-circle', 'No hay tareas activas.')
      : `<ul class="task-list">${tasks.slice(0, 8).map(t => taskItem(t)).join('')}</ul>`
    }
          </div>
        </div>

        <!-- Cycles -->
        <div class="card glass-panel">
          <div class="card-header">
            <h3>Ciclos en Curso</h3>
          </div>
          <div class="card-body" style="display:flex; flex-direction:column; gap:16px;">
            ${cycles.length === 0
      ? emptyState('refresh-cw', 'No hay ciclos activos.')
      : cycles.map(c => cycleWidget(c)).join('')
    }
          </div>
        </div>

        <!-- Upcoming deliverables -->
        <div class="card glass-panel col-span-2">
          <div class="card-header">
            <h3>Entregables Próximos <span style="color:var(--text-muted); font-weight:400;">(7 días)</span></h3>
          </div>
          <div class="card-body">
            ${upcoming.length === 0
      ? emptyState('calendar', 'Sin entregables próximos.')
      : `<ul class="task-list">${upcoming.map(t => taskItem(t)).join('')}</ul>`
    }
          </div>
        </div>

        <!-- Blockers -->
        <div class="card glass-panel" style="border-left: 3px solid var(--accent-danger);">
          <div class="card-header">
            <h3>Bloqueos</h3>
            ${blocked.length > 0 ? `<span class="badge badge-danger">${blocked.length}</span>` : ''}
          </div>
          <div class="card-body">
            ${blocked.length === 0
      ? `<div class="empty-state" style="padding:24px 0;"><i data-feather="check-circle" class="c-green"></i><p>Sin bloqueos activos.</p></div>`
      : `<ul class="task-list">${blocked.map(t => taskItem(t)).join('')}</ul>`
    }
          </div>
        </div>

        <!-- Projects at a glance -->
        <div class="card glass-panel col-span-3">
          <div class="card-header">
            <h3>Proyectos Activos</h3>
            <a href="#/projects" class="btn btn-ghost btn-sm">Ver todos</a>
          </div>
          <div class="card-body">
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:12px;">
              ${projects.filter(p => p.status === 'activo').map(p => miniProjectCard(p)).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  feather.replace();
  
  // Playful Personalization
  const user = getCurrentWorkspaceUser();
  const greetingEl = root.querySelector('#dash-greeting');
  const subtitleEl = root.querySelector('#dash-subtitle');
  if (greetingEl) {
    const hour = new Date().getHours();
    let greet = '¡Hola';
    if (hour < 12) greet = '¡Buenos días';
    else if (hour < 18) greet = '¡Buenas tardes';
    else greet = '¡Buenas noches';
    greetingEl.textContent = `${greet}, ${user.name || 'de nuevo'}!`;
  }

  // Animated Counters
  root.querySelectorAll('.stat-pill .stat-value').forEach(el => {
    const target = parseInt(el.textContent, 10);
    if (isNaN(target)) return;
    let count = 0;
    const dur = 800;
    const step = target / (dur / 16);
    const timer = setInterval(() => {
      count += step;
      if (count >= target) {
        el.textContent = target;
        clearInterval(timer);
      } else {
        el.textContent = Math.floor(count);
      }
    }, 16);
  });

  bindTaskCheckboxes(root);
  root.querySelector('#dash-new-task')?.addEventListener('click', () => openTaskModal());
}

window.renderDashboard = renderDashboard;

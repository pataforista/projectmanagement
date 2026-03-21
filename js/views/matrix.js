/**
 * views/matrix.js — Eisenhower Matrix (Urgent/Important)
 */

function renderMatrix(root) {
    const tasks = store.get.activeTasks();
    const now = Date.now();
    const URGENT_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

    const quadrants = {
        q1: [], // Urgent & Important
        q2: [], // Not Urgent & Important
        q3: [], // Urgent & Not Important
        q4: [], // Not Urgent & Not Important
    };

    tasks.forEach(t => {
        const isImportant = t.priority === 'alta';
        const isUrgent = t.dueDate && (new Date(t.dueDate).getTime() - now < URGENT_THRESHOLD_MS);

        if (isImportant && isUrgent) quadrants.q1.push(t);
        else if (isImportant && !isUrgent) quadrants.q2.push(t);
        else if (!isImportant && isUrgent) quadrants.q3.push(t);
        else quadrants.q4.push(t);
    });

    root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Matriz de Eisenhower</h1>
          <p class="view-subtitle">Prioriza lo importante sobre lo urgente.</p>
        </div>
      </div>

      <div class="matrix-container">
        <div class="matrix-grid">

          <div class="matrix-quadrant q1">
            <div class="quadrant-header">
              <span class="quadrant-number">1</span>
              <div>
                <h3>Urgente e Importante</h3>
                <span class="quadrant-action">Hazlo ahora</span>
              </div>
            </div>
            <div class="quadrant-tasks">
              ${quadrants.q1.map(t => matrixTaskItem(t)).join('') || '<div class="empty-quadrant">Sin tareas</div>'}
            </div>
          </div>

          <div class="matrix-quadrant q2">
            <div class="quadrant-header">
              <span class="quadrant-number">2</span>
              <div>
                <h3>No Urgente e Importante</h3>
                <span class="quadrant-action">Planifícalo</span>
              </div>
            </div>
            <div class="quadrant-tasks">
              ${quadrants.q2.map(t => matrixTaskItem(t)).join('') || '<div class="empty-quadrant">Sin tareas</div>'}
            </div>
          </div>

          <div class="matrix-quadrant q3">
            <div class="quadrant-header">
              <span class="quadrant-number">3</span>
              <div>
                <h3>Urgente y No Importante</h3>
                <span class="quadrant-action">Delégalo</span>
              </div>
            </div>
            <div class="quadrant-tasks">
              ${quadrants.q3.map(t => matrixTaskItem(t)).join('') || '<div class="empty-quadrant">Sin tareas</div>'}
            </div>
          </div>

          <div class="matrix-quadrant q4">
            <div class="quadrant-header">
              <span class="quadrant-number">4</span>
              <div>
                <h3>No Urgente y No Importante</h3>
                <span class="quadrant-action">Elimínalo / Pospón</span>
              </div>
            </div>
            <div class="quadrant-tasks">
              ${quadrants.q4.map(t => matrixTaskItem(t)).join('') || '<div class="empty-quadrant">Sin tareas</div>'}
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

    feather.replace();
}

function matrixTaskItem(t) {
    const proj = store.get.projectById(t.projectId);
    return `
    <div class="matrix-task-item" onclick="openTaskModal('${t.id}')">
      <div class="task-color" style="background:${proj?.color || 'var(--accent-primary)'}"></div>
      <div class="task-info">
        <span class="task-title">${esc(t.title)}</span>
        <span class="task-project">${esc(proj?.name || 'Global')}</span>
      </div>
    </div>
  `;
}

window.renderMatrix = renderMatrix;

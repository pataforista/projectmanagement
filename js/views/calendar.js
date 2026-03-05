/**
 * views/calendar.js — Monthly calendar view
 */

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function renderCalendar(root) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  function build() {
    root.innerHTML = `
      <div class="view-inner">
        <div class="view-header">
          <div class="view-header-text">
            <h1>Calendario</h1>
            <p class="view-subtitle">Fechas límite, sesiones y entregas por mes.</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-secondary" id="cal-prev"><i data-feather="chevron-left"></i></button>
            <span id="cal-title" style="font-weight:700;font-size:1rem;min-width:160px;text-align:center;">${MONTH_NAMES[month]} ${year}</span>
            <button class="btn btn-secondary" id="cal-next"><i data-feather="chevron-right"></i></button>
            <button class="btn btn-ghost btn-sm" id="cal-today">Hoy</button>
            <button class="btn btn-primary btn-sm" id="cal-new-session"><i data-feather="plus"></i> Sesión</button>
          </div>
        </div>

        ${buildCalGrid(year, month)}

        <div id="cal-day-panel" style="margin-top:24px;"></div>
      </div>`;

    feather.replace();

    root.querySelector('#cal-prev').addEventListener('click', () => {
      month--; if (month < 0) { month = 11; year--; }
      build();
    });
    root.querySelector('#cal-next').addEventListener('click', () => {
      month++; if (month > 11) { month = 0; year++; }
      build();
    });
    root.querySelector('#cal-today').addEventListener('click', () => {
      year = now.getFullYear(); month = now.getMonth(); build();
    });
    root.querySelector('#cal-new-session').addEventListener('click', () => {
      openSessionModal();
    });

    root.querySelectorAll('.calendar-day[data-date]').forEach(cell => {
      cell.addEventListener('click', () => showDayTasks(root, cell.dataset.date));
    });
  }

  build();
}

function buildCalGrid(year, month) {
  const tasks = store.get.allTasks();
  const sessions = store.get.sessions();
  const today = new Date();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells = [];

  // Prev month overflow
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, cur: false, dateStr: null });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, cur: true, dateStr });
  }

  // Next month fill
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, cur: false, dateStr: null });
  }

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return `
    <div class="calendar-grid">
      ${DAY_NAMES.map(d => `<div class="calendar-dow">${d}</div>`).join('')}
      ${cells.map(cell => {
    if (!cell.cur) return `<div class="calendar-day other-month"><div class="day-number">${cell.day}</div></div>`;
    const isToday = cell.dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const dayTasks = tasks.filter(t => t.dueDate === cell.dateStr);
    return `
          <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${cell.dateStr}">
            <div class="day-number">${cell.day}</div>
            ${dayTasks.slice(0, 3).map(t => {
      const proj = store.get.projectById(t.projectId);
      const col = proj?.color || 'var(--accent-primary)';
      return `<div class="day-task-dot" title="${esc(t.title)}" style="background:${col}22; color:${col};">${esc(t.title)}</div>`;
    }).join('')}
            ${sessions.filter(s => s.date === cell.dateStr).map(s => `
              <div class="day-task-dot session-dot" title="${esc(s.type)}: ${esc(s.title)}" style="background:var(--accent-success)22; color:var(--accent-success); border-left:2px solid var(--accent-success);">
                ${esc(s.title)}
              </div>`).join('')}
            ${dayTasks.length > 3 ? `<div style="font-size:0.64rem;color:var(--text-muted);">+${dayTasks.length - 3} más</div>` : ''}
          </div>`;
  }).join('')}
    </div>`;
}

function showDayTasks(root, dateStr) {
  const tasks = store.get.allTasks().filter(t => t.dueDate === dateStr);
  const sessions = store.get.sessionsByDate(dateStr);
  const panel = root.querySelector('#cal-day-panel');
  if (!panel) return;

  if (!tasks.length && !sessions.length) {
    panel.innerHTML = `<div style="color:var(--text-muted);font-size:0.84rem;text-align:center;padding:16px;">Sin compromisos el ${fmtDate(dateStr)}.</div>`;
    return;
  }

  panel.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
      <div>
        <div class="section-label">Tareas (${tasks.length})</div>
        <ul class="task-list">${tasks.map(t => taskItem(t)).join('')}</ul>
      </div>
      <div>
        <div class="section-label">Sesiones (${sessions.length})</div>
        <div class="session-list">
          ${sessions.map(s => `
            <div class="session-item card" style="padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span class="badge badge-sm badge-neutral" style="margin-right:8px;">${s.type}</span>
                <strong>${esc(s.title)}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">${s.startTime || '--:--'} - ${s.endTime || '--:--'}</div>
              </div>
              <button class="btn btn-icon btn-sm" onclick="openSessionModal('${s.id}')"><i data-feather="edit-2"></i></button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;

  feather.replace();
  bindTaskCheckboxes(panel);
}

window.renderCalendar = renderCalendar;

/**
 * router.js — Hash-based SPA router
 * Routes: #/dashboard  #/projects  #/backlog  #/cycles
 *         #/board      #/calendar  #/decisions
 *         #/project/:id/document   #/project/:id
 */

const ROUTES = {
    '/dashboard': 'dashboard',
    '/projects': 'projects',
    '/backlog': 'backlog',
    '/cycles': 'cycles',
    '/board': 'board',
    '/calendar': 'calendar',
    '/decisions': 'decisions',
    '/library': 'library',
    '/logs': 'logs',
    '/matrix': 'matrix',
    '/writing': 'writing',
    '/medical': 'medical',
    '/integrations': 'integrations',
    '/canvas': 'canvas',
    '/graph': 'graph',
    '/collaboration': 'collaboration',
    '/notes-wiki': 'notes-wiki',
    '/admin': 'admin',
};

// Route meta for topbar breadcrumb + subtitle
const ROUTE_META = {
    dashboard: { label: 'Dashboard', subtitle: 'Resumen de actividad y próximos entregables.' },
    projects: { label: 'Proyectos', subtitle: 'Gestión de proyectos activos y archivados.' },
    backlog: { label: 'Backlog', subtitle: 'Captura y priorización de todo el trabajo pendiente.' },
    cycles: { label: 'Ciclos', subtitle: 'Planificación temporal y timeboxing.' },
    board: { label: 'Tablero', subtitle: 'Vista Kanban por estado del trabajo.' },
    calendar: { label: 'Calendario', subtitle: 'Fechas límite, sesiones y entregas.' },
    decisions: { label: 'Decisiones', subtitle: 'Registro de decisiones clave del workspace.' },
    library: { label: 'Biblioteca', subtitle: 'Recursos de investigación, docencia y gestión open-source.' },
    logs: { label: 'Actividad', subtitle: 'Registro de actividad del equipo.' },
    matrix: { label: 'Matriz', subtitle: 'Prioriza por urgencia e importancia.' },
    writing: { label: 'Escritura', subtitle: 'Modo manuscrito para artículos y libros.' },
    medical: { label: 'Panel Médico', subtitle: 'Seguimiento de interconsultas y derivaciones.' },
    integrations: { label: 'Integraciones', subtitle: 'Conecta con Google, Zotero y Todoist.' },
    canvas: { label: 'Canvas', subtitle: 'Tablero visual de ideas y proyectos.' },
    collaboration: { label: 'Colaboración', subtitle: 'Estado operativo del equipo, asignaciones y protocolos.' },
    'notes-wiki': { label: 'Wiki', subtitle: 'Documentación jerárquica: Libros, Capítulos y Páginas.' },
    graph: { label: 'Grafo', subtitle: 'Visualización de relaciones y conexiones entre elementos.' },
    admin: { label: 'Administración', subtitle: 'Configuración global, miembros e invitaciones del workspace.' },
    project: { label: 'Proyecto', subtitle: 'Vista de detalle del proyecto.' },
    document: { label: 'Documento', subtitle: 'Documento vivo del proyecto.' },
};

class Router {
    constructor() {
        this._current = null;
        this._handlers = {};
        window.addEventListener('hashchange', () => this._dispatch());
    }

    /**
     * Registra una función manejadora para una ruta/vista específica.
     * Permite el encadenamiento de llamadas (chaining).
     * @param {string} viewName - Nombre base de la ruta.
     * @param {Function} handler - Función de renderizado asociada.
     * @returns {Router}
     */
    on(viewName, handler) {
        this._handlers[viewName] = handler;
        return this;
    }

    get current() { return this._current; }

    /**
     * Cambia la ruta actual del navegador, lo que disparará asíncronamente
     * el evento hashchange y el subsiguiente _dispatch().
     * @param {string} path - URL base con formato hash (ej '/projects').
     */
    navigate(path) {
        window.location.hash = path;
    }

    /**
     * Extrae y normaliza el hash actual de la URL, determinando los
     * parámetros dinámicos (como projectOS ID) e invoca el renderizador.
     */
    _dispatch() {
        const hash = window.location.hash.replace('#', '') || '/dashboard';

        let viewName = null;
        let params = {};

        // Parametric routes
        if (hash.startsWith('/project/')) {
            const parts = hash.split('/');
            params.projectId = parts[2];
            viewName = parts[3] === 'document' ? 'document' : 'project';
        } else {
            viewName = ROUTES[hash] || 'dashboard';
        }

        this._current = { viewName, params };
        this._updateSidebar(viewName);
        this._updateTopbar(viewName, params);
        this._render(viewName, params);

        window.dispatchEvent(new CustomEvent('route:change', { detail: { viewName, params } }));
    }

    _updateSidebar(viewName) {
        document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(el => {
            el.classList.toggle('active', el.dataset.view === viewName);
        });
    }

    _updateTopbar(viewName, params) {
        const meta = ROUTE_META[viewName] || ROUTE_META.dashboard;
        const label = params.projectName || meta.label;
        const el = document.querySelector('.breadcrumbs .current');
        if (el) el.textContent = label;
        const sub = document.querySelector('.view-subtitle');
        if (sub) sub.textContent = meta.subtitle;
    }

    /**
     * Inyecta la vista en el contenedor raíz del DOM ("app-root").
     * Gestiona la ejecución segura de las funciones de limpieza (teardown)
     * devueltas por la vista anterior para evitar memory leaks (fugas de memoria).
     *
     * @param {string} viewName - Nombre de la vista.
     * @param {Object} params - Filtros/IDs de URL extraídos de la ruta.
     */
    _render(viewName, params) {
        const root = document.getElementById('app-root');
        if (!root) return;

        // Teardown previous view to prevent runaway memory leaks
        if (typeof this._currentCleanup === 'function') {
            try {
                this._currentCleanup();
            } catch (e) {
                console.error(`[Router] Error cleaning up view:`, e);
            }
        }
        this._currentCleanup = null;

        root.innerHTML = '';
        const handler = this._handlers[viewName];
        if (handler) {
            // If the handler returns a function, we assume it's a cleanup/teardown function
            this._currentCleanup = handler(root, params);
        } else {
            // ✅ SECURITY FIX: viewName derives from the URL hash (user-controlled).
            // Using innerHTML here was an XSS vector. textContent is always safe.
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            const p = document.createElement('p');
            p.textContent = `Vista no encontrada: ${viewName}`;
            empty.appendChild(p);
            root.appendChild(empty);
        }
    }

    /** Trigger initial render — always dispatches synchronously */
    init() {
        if (!window.location.hash || window.location.hash === '#') {
            history.replaceState(null, '', '#/dashboard');
        }
        // Always call _dispatch() directly so handlers registered via .on() are guaranteed available
        this._dispatch();
    }
}

window.router = new Router();

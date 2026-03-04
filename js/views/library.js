/**
 * views/library.js — Research & Library View
 * Resources for Biomedical Research, Teaching, and Project Management
 */

function renderLibrary(root) {
    root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Biblioteca de Recursos</h1>
          <p class="view-subtitle">Gestión del conocimiento, investigación y docencia.</p>
        </div>
      </div>

      <div class="library-grid">
        
        <!-- Section 0: Integraciones Activas -->
        <div class="card glass-panel library-card" style="grid-column: 1 / -1;">
          <div class="card-header">
            <div class="library-icon integ">
              <i data-feather="zap"></i>
            </div>
            <h3>Integraciones en vivo <span style="font-size:0.75rem;font-weight:400;background:rgba(var(--accent-primary-rgb),0.15);color:var(--accent-primary);padding:2px 8px;border-radius:12px;margin-left:8px;">Conectadas vía API</span></h3>
          </div>
          <div class="card-body">
            <p>Estas apps se sincronizan directamente desde el panel de <strong>Sync</strong> (ícono de nube en el sidebar). No requieren exportar archivos.</p>
            <div class="integration-grid">
              <div class="integration-item">
                <div class="integration-badge badge-gtasks">
                  <i data-feather="check-square" style="width:16px;height:16px;"></i>
                </div>
                <div>
                  <strong>Google Tasks</strong>
                  <p>Importa todas tus listas y tareas usando tu cuenta Google ya conectada. No requiere configuración adicional.</p>
                </div>
              </div>
              <div class="integration-item">
                <div class="integration-badge badge-todoist">
                  <i data-feather="check-circle" style="width:16px;height:16px;"></i>
                </div>
                <div>
                  <strong>Todoist (REST API)</strong>
                  <p>Sincroniza tareas activas con tu API Token. Obtén tu token en <em>todoist.com/prefs/integrations</em>.</p>
                </div>
              </div>
              <div class="integration-item">
                <div class="integration-badge badge-zotero">
                  <i data-feather="book" style="width:16px;height:16px;"></i>
                </div>
                <div>
                  <strong>Zotero (REST API)</strong>
                  <p>Importa hasta 50 referencias de tu biblioteca personal. Requiere API Key (zotero.org/settings/keys) y tu User ID numérico.</p>
                </div>
              </div>
            </div>
            <p style="font-size:0.82rem;color:var(--text-muted);margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);">
              <strong>Importación por archivo</strong> también disponible en Sync → Trello JSON, Notion CSV, Obsidian MD, Todoist CSV.
            </p>
          </div>
        </div>

        <!-- Section 1: Gestión Bibliográfica -->
        <div class="card glass-panel library-card">
          <div class="card-header">
            <div class="library-icon biol">
              <i data-feather="book"></i>
            </div>
            <h3>Gestión Bibliográfica e Investigación Biomédica</h3>
          </div>
          <div class="card-body">
            <p>Herramientas para manejar literatura científica y estructurar protocolos de investigación.</p>
            <ul class="resource-list">
              <li>
                <strong>Zotero:</strong> Gestor de referencias con API REST integrada en este workspace. Importa artículos directamente desde tu biblioteca. Complementa con el plugin Better BibTeX para exportar a Obsidian.
              </li>
              <li>
                <strong>Dataview:</strong> Motor de base de datos para crear tablas dinámicas que filtren artículos, seguimiento de pacientes o avances de tesis.
              </li>
              <li>
                <strong>Omnivore:</strong> Plataforma de lectura diferida (read-it-later) para guardar artículos científicos y sincronizar resaltados.
              </li>
            </ul>
          </div>
        </div>

        <!-- Section 2: Docencia y Preparación -->
        <div class="card glass-panel library-card">
          <div class="card-header">
            <div class="library-icon teach">
              <i data-feather="users"></i>
            </div>
            <h3>Docencia y Preparación de Clases</h3>
          </div>
          <div class="card-body">
            <p>Traslada tus apuntes de investigación directamente al aula y facilita la enseñanza.</p>
            <ul class="resource-list">
              <li>
                <strong>Advanced Slides:</strong> Crea presentaciones profesionales (Reveal.js) directamente desde tus archivos Markdown.
              </li>
              <li>
                <strong>Excalidraw:</strong> Pizarra virtual para diagramar flujos de diagnóstico y esquemas conceptuales compartibles.
              </li>
              <li>
                <strong>Spaced Repetition:</strong> Sistema de flashcards gamificado para repasar dosis, diagnósticos y clasificaciones de forma interactiva.
              </li>
            </ul>
          </div>
        </div>

        <!-- Section 3: Organización de Proyectos -->
        <div class="card glass-panel library-card">
          <div class="card-header">
            <div class="library-icon proj">
              <i data-feather="layout"></i>
            </div>
            <h3>Organización de Proyectos y Equipos</h3>
          </div>
          <div class="card-body">
            <p>Alternativas open-source para gestionar tareas y coordinar equipos con privacidad total.</p>
            <ul class="resource-list">
              <li>
                <strong>Kanban (Plugin):</strong> Tableros visuales locales para visualizar el avance de PWAs o distribución de tareas entre residentes.
              </li>
              <li>
                <strong>AppFlowy:</strong> Alternativa self-hosted a Notion para bases de datos, wikis y gestión de proyectos colaborativos.
              </li>
              <li>
                <strong>Focalboard:</strong> Orientado a la gestión de proyectos y asignación de tareas en entornos académicos o institucionales.
              </li>
            </ul>
          </div>
        </div>

        <!-- Section 4: Ecosistemas de Conocimiento -->
        <div class="card glass-panel library-card">
          <div class="card-header">
            <div class="library-icon eco">
              <i data-feather="share-2"></i>
            </div>
            <h3>Ecosistemas de Conocimiento Completos</h3>
          </div>
          <div class="card-body">
            <p>Estructuras alternativas para la captura y organización del conocimiento personal.</p>
            <ul class="resource-list">
              <li>
                <strong>Logseq:</strong> Outliner enfocado en privacidad y diarios, ideal para vincular conceptos complejos sin jerarquías rígidas.
              </li>
              <li>
                <strong>Joplin:</strong> Alternativa sólida y cifrada a Evernote para capturar información rápida y organizar clases con sincronización flexible.
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <style>
      .library-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }
      .library-card {
        display: flex;
        flex-direction: column;
      }
      .library-icon {
        width: 38px;
        height: 38px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 12px;
        flex-shrink: 0;
      }
      .library-icon.biol { background: rgba(var(--accent-primary-rgb), 0.15); color: var(--accent-primary); }
      .library-icon.teach { background: rgba(22, 160, 133, 0.15); color: #1abc9c; }
      .library-icon.proj { background: rgba(41, 128, 185, 0.15); color: #3498db; }
      .library-icon.eco { background: rgba(142, 68, 173, 0.15); color: #9b59b6; }
      .library-icon.integ { background: rgba(230, 126, 34, 0.15); color: #e67e22; }

      .integration-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 16px;
        margin-top: 12px;
      }
      .integration-item {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        background: rgba(var(--accent-primary-rgb), 0.04);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 12px;
      }
      .integration-item p {
        font-size: 0.82rem;
        color: var(--text-muted);
        margin: 2px 0 0;
        line-height: 1.45;
      }
      .integration-item strong {
        font-size: 0.9rem;
        color: var(--text-primary);
        display: block;
      }
      .integration-badge {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .badge-gtasks { background: rgba(52, 168, 83, 0.15); color: #34a853; }
      .badge-todoist { background: rgba(219, 68, 55, 0.15); color: #db4437; }
      .badge-zotero { background: rgba(204, 0, 0, 0.15); color: #cc0000; }
      
      .resource-list {
        list-style: none;
        padding: 0;
        margin: 12px 0 0 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .resource-list li {
        font-size: 0.88rem;
        line-height: 1.5;
        color: var(--text-muted);
        position: relative;
        padding-left: 14px;
      }
      .resource-list li::before {
        content: "•";
        position: absolute;
        left: 0;
        color: var(--accent-primary);
      }
      .resource-list li strong {
        color: var(--text-primary);
        font-weight: 600;
        display: block;
        margin-bottom: 2px;
      }
    </style>
  `;

    feather.replace();
}

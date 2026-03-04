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
                <strong>Zotero Integration:</strong> El estándar de oro para importar referencias, etiquetas y notas desde PDFs directamente a Obsidian.
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

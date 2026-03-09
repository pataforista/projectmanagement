/**
 * components/StatusBadge.js
 *
 * Componente para mostrar estado de procesamiento de notas.
 * Muestra cantidad de enlaces creados y si hay metadatos YAML.
 */

export function renderProcessingStatus(containerId, stats = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const linksCreated = Number(stats.linksCreated || 0);
  const hasMetadata = Boolean(stats.hasMetadata);

  container.innerHTML = `
    <div class="processing-badge" style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-secondary);">
      <i data-feather="zap" style="width:14px;"></i>
      <span>Procesado: ${linksCreated} enlaces nuevos</span>
      ${hasMetadata ? '<i data-feather="database" style="width:14px;"></i>' : ''}
    </div>
  `;

  if (window.feather && typeof window.feather.replace === 'function') {
    window.feather.replace();
  }
}

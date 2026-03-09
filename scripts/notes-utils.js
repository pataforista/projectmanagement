/**
 * scripts/notes-utils.js
 *
 * Utilidades complementarias:
 * - Generación de content hash (detección de cambios)
 * - Lazy-index de títulos (caché en memoria)
 * - Helpers para UUID y timestamps
 */

/**
 * Genera hash simple del contenido usando SubtleCrypto.
 * Útil para detectar si una nota cambió realmente (importante para sync).
 *
 * @param {string} content - Contenido a hashear
 * @returns {Promise<string>} Hash en hex
 */
export async function computeContentHash(content) {
  if (!content) return '';

  try {
    // SubtleCrypto.digest devuelve ArrayBuffer
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(content)
    );

    // Convierte ArrayBuffer a hex string
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Error computando hash:', error);
    // Fallback: hash simple y rápido si SubtleCrypto no está disponible
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Genera UUID v4 (para IDs de notas)
 * Usa crypto.getRandomValues si está disponible
 *
 * @returns {string} UUID v4
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: implementación simple
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * TitleIndex: caché en memoria de títulos para evitar
 * cargar todas las notas en cada guardado.
 *
 * Uso:
 *   index.add('nota-id', 'Título Ejemplo')
 *   index.getAll() → ['Título Ejemplo', ...]
 *   index.invalidate() → limpia caché
 */
export class TitleIndex {
  constructor() {
    this.map = new Map(); // id → title
  }

  /**
   * Agrega o actualiza un título
   */
  add(id, title) {
    if (!id || !title) return;
    this.map.set(id, String(title).trim());
  }

  /**
   * Elimina un título
   */
  remove(id) {
    this.map.delete(id);
  }

  /**
   * Obtiene lista única de todos los títulos
   */
  getAll() {
    return [...new Set(
      Array.from(this.map.values())
        .filter(Boolean)
        .map(t => String(t).trim())
        .filter(Boolean)
    )];
  }

  /**
   * Limpia el índice completamente
   */
  invalidate() {
    this.map.clear();
  }

  /**
   * Reconstruye el índice desde un array de notas
   */
  rebuild(notes) {
    this.invalidate();
    for (const note of notes) {
      if (note.id && note.title) {
        this.add(note.id, note.title);
      }
    }
  }

  /**
   * Devuelve tamaño actual del índice
   */
  size() {
    return this.map.size;
  }
}

/**
 * Comparador de notas para detectar cambios reales
 *
 * @param {object} noteA
 * @param {object} noteB
 * @returns {object} { changed: boolean, fields: { title, content, ... } }
 */
export function compareNotes(noteA, noteB) {
  if (!noteA || !noteB) return { changed: true, fields: {} };

  const fields = {};
  let changed = false;

  ['id', 'title', 'content', 'contentHash'].forEach(field => {
    const valA = noteA[field];
    const valB = noteB[field];

    if (valA !== valB) {
      fields[field] = { before: valA, after: valB };
      changed = true;
    }
  });

  return { changed, fields };
}

/**
 * Formatea timestamp ISO a fecha legible (local)
 *
 * @param {string} isoString - Fecha ISO 8601
 * @returns {string} Fecha formateada
 */
export function formatDate(isoString) {
  if (!isoString) return '';

  try {
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

/**
 * Validador básico de nota
 *
 * @param {object} note
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateNote(note) {
  const errors = [];

  if (!note) errors.push('Nota no definida');
  if (!note?.id) errors.push('Campo requerido: id');
  if (!note?.title) errors.push('Campo requerido: title');
  if (typeof note?.content !== 'string') errors.push('Campo requerido: content (debe ser string)');

  if (note?.title && note.title.length > 255) {
    errors.push('Título muy largo (máx 255 caracteres)');
  }

  if (note?.content && note.content.length > 10_000_000) {
    errors.push('Contenido muy grande (máx 10 MB)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Exporta nota a markdown con frontmatter
 *
 * @param {object} note - Nota procesada
 * @returns {string} Markdown con frontmatter
 */
export function noteToMarkdown(note) {
  let md = '';

  // Frontmatter YAML si hay metadata
  if (note.metadata && Object.keys(note.metadata).length > 0) {
    md += '---\n';
    for (const [key, value] of Object.entries(note.metadata)) {
      if (Array.isArray(value)) {
        md += `${key}:\n`;
        for (const item of value) {
          md += `  - ${item}\n`;
        }
      } else if (typeof value === 'object') {
        md += `${key}: ${JSON.stringify(value)}\n`;
      } else {
        md += `${key}: ${value}\n`;
      }
    }
    md += '---\n\n';
  }

  // Título como H1
  md += `# ${note.title}\n\n`;

  // Contenido
  md += note.content || '';

  // Metadatos al pie si existen
  if (note.links && note.links.length > 0) {
    md += '\n\n---\n\n';
    md += '**Links:** ' + note.links.map(l => `[[${l}]]`).join(', ') + '\n';
  }

  if (note.updatedAt) {
    md += `**Modificado:** ${formatDate(note.updatedAt)}\n`;
  }

  return md;
}

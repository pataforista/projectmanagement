/**
 * editor.js
 *
 * Manejadores de editor para autosave y procesamiento de notas.
 * Integra processor, db, timeline y status badge.
 */

import { NoteProcessor } from './scripts/processor.js';
import { renderProcessingStatus } from './components/StatusBadge.js';
import { getAllNotes } from './scripts/db.js';

/**
 * Obtiene todos los títulos excepto el de la nota actual
 *
 * @param {string} noteId - ID de la nota actual
 * @returns {Promise<Array>} Array de títulos
 */
async function getAllTitlesExcept(noteId) {
  const allNotes = await getAllNotes();
  return allNotes
    .filter(n => n.id !== noteId)
    .map(n => String(n.title || '').trim())
    .filter(Boolean);
}

/**
 * Maneja autosave con procesamiento de autolinks
 *
 * @param {string} noteId - ID de la nota
 * @param {string} currentText - Contenido actual
 * @param {string} currentTitle - Título actual (opcional)
 * @returns {Promise<object>} { linksCreated, hasMetadata, links }
 */
export async function handleAutoSave(noteId, currentText, currentTitle = '') {
  const titles = await getAllTitlesExcept(noteId);

  const result = NoteProcessor.autoLink(currentText, titles, {
    currentTitle,
    maxReplacements: 200
  });

  const processedText = result.content;
  const metadata = NoteProcessor.extractMetadata(processedText);
  const links = NoteProcessor.extractWikiLinks(processedText);

  // Aquí normalmente actualizarías la DB
  // await db.notes.update(noteId, { content: processedText, metadata, links });

  renderProcessingStatus('status-container', {
    linksCreated: result.linksCreated,
    hasMetadata: Object.keys(metadata).length > 0
  });

  return {
    linksCreated: result.linksCreated,
    hasMetadata: Object.keys(metadata).length > 0,
    links
  };
}

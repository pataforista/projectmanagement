/**
 * saveNote.js
 *
 * Flujo colaborativo de guardado de notas.
 * - No sobrescribe author (createdBy)
 * - Separa explícitamente createdBy/updatedBy
 * - Separa createdAt/updatedAt
 * - Actualiza timeline tras guardar
 */

import { saveNoteRaw } from './scripts/db.js';
import { getTimelineData, renderTimeline } from './scripts/timeline.js';

/**
 * Guarda una nota con metadata colaborativa
 *
 * @param {object} note - { id, title, content, metadata, ... }
 * @param {string} currentUser - Usuario actual que guarda
 * @returns {Promise<object>} Nota guardada con timestamps y metadata colaborativa
 */
export async function saveNote(note, currentUser) {
  if (!note || !note.id) {
    throw new Error('La nota debe tener al menos un id');
  }

  const now = new Date().toISOString();

  // En un entorno real, obtendrías la nota existente desde DB
  // Por ahora, asumimos que es una nueva nota si no tiene createdAt
  const isNewNote = !note.createdAt;

  const nextNote = {
    ...note,
    createdAt: note.createdAt || now,
    createdBy: note.createdBy || currentUser,
    updatedAt: now,
    updatedBy: currentUser,
    metadata: {
      ...(note.metadata || {})
    }
  };

  // Guarda en DB
  const saved = await saveNoteRaw(nextNote);

  // Actualiza timeline si es posible
  try {
    // En un entorno real, traerías todas las notas desde DB
    const timelineData = getTimelineData([saved], { limit: 30 });
    renderTimeline('timeline-sidebar', timelineData);
  } catch (error) {
    console.warn('No se pudo actualizar timeline:', error);
  }

  return saved;
}

/**
 * scripts/db-dexie.js
 *
 * ALTERNATIVA: Versión con Dexie (ORM para IndexedDB)
 * Requiere: npm install dexie
 *
 * Ventajas vs IndexedDB nativo:
 * - Sintaxis más limpia
 * - Hooks automáticos para timestamps y usuario
 * - Transacciones más simples
 *
 * Para usar: import { db } from './db-dexie.js' en lugar de './db.js'
 */

import Dexie from 'dexie';
import { NoteProcessor } from './processor.js';

export const db = new Dexie('notes-pwa');

db.version(1).stores({
  notes: 'id, updatedAt, createdAt, createdBy, updatedBy, status'
});

let currentUserProvider = () => 'Usuario';

/**
 * Establece la función que provee el usuario actual
 * Úsalo antes de cualquier operación:
 *   setCurrentUserProvider(() => getCurrentLoggedInUser())
 */
export function setCurrentUserProvider(fn) {
  currentUserProvider = fn;
}

// ────────────────────────────────────────────────────────────────
// Hooks automáticos para timestamps y usuario
// ────────────────────────────────────────────────────────────────

db.notes.hook('creating', function (primKey, obj) {
  const now = new Date().toISOString();
  obj.createdAt = obj.createdAt || now;
  obj.createdBy = obj.createdBy || currentUserProvider();
  obj.updatedAt = now;
  obj.updatedBy = currentUserProvider();
});

db.notes.hook('updating', function (changes, primKey) {
  const now = new Date().toISOString();
  changes.updatedAt = now;
  changes.updatedBy = currentUserProvider();
  // createdAt y createdBy NO se modifican
});

// ────────────────────────────────────────────────────────────────
// CRUD helpers
// ────────────────────────────────────────────────────────────────

export async function getAllNotes() {
  return await db.notes.toArray();
}

export async function getNoteById(id) {
  return await db.notes.get(id);
}

export async function deleteNote(id) {
  return await db.notes.delete(id);
}

/**
 * Guarda nota sin autolink
 */
export async function saveNoteRaw(note) {
  if (!note || !note.id) {
    throw new Error('La nota debe tener al menos un id');
  }

  const prepared = {
    ...note,
    title: String(note.title || '').trim(),
    content: String(note.content || '')
  };

  const allNotes = await db.notes.toArray();
  const titles = allNotes
    .map(n => String(n.title || '').trim())
    .filter(Boolean);

  const derived = NoteProcessor.buildDerivedFields(prepared, titles);

  await db.notes.put(derived);
  return derived;
}

/**
 * Guarda nota CON autolink automático
 */
export async function saveNote(note, options = {}) {
  if (!note || !note.id) {
    throw new Error('La nota debe tener al menos un id');
  }

  const { autoLink = true, onLinksChanged = null } = options;

  const prepared = {
    ...note,
    title: String(note.title || '').trim(),
    content: String(note.content || '')
  };

  const allNotes = await db.notes.toArray();
  const titles = allNotes
    .map(n => String(n.title || '').trim())
    .filter(Boolean);

  let finalContent = prepared.content;
  let linksCreated = 0;

  if (autoLink) {
    const result = NoteProcessor.autoLink(prepared.content, titles, {
      currentTitle: prepared.title,
      maxReplacements: 200
    });
    finalContent = result.content;
    linksCreated = result.linksCreated;
  }

  const withContent = {
    ...prepared,
    content: finalContent
  };

  const derived = NoteProcessor.buildDerivedFields(withContent, titles);

  await db.notes.put(derived);

  if (typeof onLinksChanged === 'function') {
    try {
      onLinksChanged({
        note: derived,
        linksCreated
      });
    } catch (error) {
      console.error('Error en onLinksChanged:', error);
    }
  }

  return {
    ...derived,
    linksCreated
  };
}

/**
 * Guarda nota CON sugerencias (sin autolink automático)
 */
export async function saveNoteWithSuggestions(note) {
  if (!note || !note.id) {
    throw new Error('La nota debe tener al menos un id');
  }

  const prepared = {
    ...note,
    title: String(note.title || '').trim(),
    content: String(note.content || '')
  };

  const allNotes = await db.notes.toArray();
  const titles = allNotes
    .map(n => String(n.title || '').trim())
    .filter(Boolean);

  const derived = NoteProcessor.buildDerivedFields(prepared, titles);

  await db.notes.put(derived);

  return {
    note: derived,
    suggestions: derived.backlinkCandidates || []
  };
}

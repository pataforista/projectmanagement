/**
 * scripts/db.js
 *
 * Capa de almacenamiento IndexedDB nativo.
 * - CRUD de notas
 * - Integración con NoteProcessor para campos derivados
 * - TitleIndex para optimizar búsquedas
 *
 * IMPORTANTE:
 * - IndexedDB es async, usa requestToPromise() y transactionToPromise()
 * - En multi-tab, si un tab cierra la DB, otros necesitan reabrir
 * - TitleIndex es volatile (vuelve a cargarse si se recarga la página)
 */

import { NoteProcessor } from './processor.js';
import {
  computeContentHash,
  generateUUID,
  TitleIndex,
  validateNote
} from './notes-utils.js';

const DB_NAME = 'workspace-notes';
const DB_VERSION = 1;
const NOTES_STORE = 'notes';

let dbInstance = null;
let titleIndex = new TitleIndex();

// ────────────────────────────────────────────────────────────────
// Helpers para IndexedDB nativo
// ────────────────────────────────────────────────────────────────

/**
 * Convierte IDBRequest a Promise
 */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      const error = request.error || new Error('IndexedDB request failed');
      reject(error);
    };
  });
}

/**
 * Convierte IDBTransaction a Promise
 */
function transactionToPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const error = tx.error || new Error('IndexedDB transaction failed');
      reject(error);
    };
    tx.onabort = () => {
      const error = tx.error || new Error('IndexedDB transaction aborted');
      reject(error);
    };
  });
}

/**
 * Abre o reutiliza conexión a IndexedDB
 *
 * NOTA: En multi-tab, solo el primer tab mantiene dbInstance.
 * Si otro tab cierra la DB, se limpian las referencias globales.
 */
function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const store = db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        // Índices para búsqueda rápida
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Si otro tab/worker actualiza la versión, cierra esta conexión
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`No se pudo abrir IndexedDB "${DB_NAME}": ${request.error?.message}`));
    };
  });
}

// ────────────────────────────────────────────────────────────────
// CRUD Base
// ────────────────────────────────────────────────────────────────

/**
 * Obtiene todas las notas
 *
 * @returns {Promise<Array>} Array de notas
 */
export async function getAllNotes() {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readonly');
    const store = tx.objectStore(NOTES_STORE);

    const result = await requestToPromise(store.getAll());
    await transactionToPromise(tx);

    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error en getAllNotes():', error);
    throw error;
  }
}

/**
 * Obtiene una nota por ID
 *
 * @param {string} id - ID de la nota
 * @returns {Promise<object|null>} Nota o null
 */
export async function getNoteById(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readonly');
    const store = tx.objectStore(NOTES_STORE);

    const note = await requestToPromise(store.get(id));
    await transactionToPromise(tx);

    return note || null;
  } catch (error) {
    console.error(`Error en getNoteById(${id}):`, error);
    throw error;
  }
}

/**
 * Obtiene notas por índice (ej: por título)
 *
 * @param {string} indexName - Nombre del índice
 * @param {string} value - Valor a buscar
 * @returns {Promise<Array>} Notas que coinciden
 */
export async function getNotesByIndex(indexName, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readonly');
    const store = tx.objectStore(NOTES_STORE);
    const index = store.index(indexName);

    const result = await requestToPromise(index.getAll(value));
    await transactionToPromise(tx);

    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error(`Error en getNotesByIndex(${indexName}, ${value}):`, error);
    throw error;
  }
}

/**
 * Elimina una nota por ID
 *
 * @param {string} id - ID de la nota
 * @returns {Promise<boolean>} true si se eliminó
 */
export async function deleteNote(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);

    store.delete(id);
    await transactionToPromise(tx);

    titleIndex.remove(id);
    return true;
  } catch (error) {
    console.error(`Error en deleteNote(${id}):`, error);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────
// Guardado de Notas (3 modos)
// ────────────────────────────────────────────────────────────────

/**
 * Guarda una nota SIN procesamiento (raw).
 * Útil si quieres modo 100% conservador.
 *
 * @param {object} note - { id, title, content, ... }
 * @returns {Promise<object>} Nota guardada con derivados
 */
export async function saveNoteRaw(note) {
  const validation = validateNote(note);
  if (!validation.valid) {
    throw new Error(`Validación fallida: ${validation.errors.join('; ')}`);
  }

  try {
    const now = new Date().toISOString();
    const contentHash = await computeContentHash(note.content);

    const prepared = {
      id: note.id,
      title: String(note.title || '').trim(),
      content: String(note.content || ''),
      contentHash,
      createdAt: note.createdAt || now,
      updatedAt: now,
      metadata: note.metadata || {},
      links: Array.isArray(note.links) ? note.links : [],
      summary: note.summary || ''
    };

    const derived = NoteProcessor.buildDerivedFields(prepared, []);

    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);

    store.put(derived);
    await transactionToPromise(tx);

    // Actualiza índice de títulos
    titleIndex.add(derived.id, derived.title);

    return derived;
  } catch (error) {
    console.error('Error en saveNoteRaw():', error);
    throw error;
  }
}

/**
 * Guarda una nota aplicando autolink automático.
 *
 * ADVERTENCIA: Muta el contenido al guardar.
 * Para casos donde aceptas cambios transparentes.
 *
 * @param {object} note - { id, title, content, ... }
 * @param {object} options - { autoLink, onLinksChanged }
 * @returns {Promise<object>} Nota guardada con links aplicados
 */
export async function saveNote(note, options = {}) {
  const validation = validateNote(note);
  if (!validation.valid) {
    throw new Error(`Validación fallida: ${validation.errors.join('; ')}`);
  }

  const {
    autoLink = true,
    onLinksChanged = null
  } = options;

  try {
    // Usa el índice en caché en lugar de cargar todas las notas
    let titles = titleIndex.getAll();
    if (titles.length === 0) {
      // Si el índice está vacío, reconstruye desde DB
      const allNotes = await getAllNotes();
      titleIndex.rebuild(allNotes);
      titles = titleIndex.getAll();
    }

    const now = new Date().toISOString();
    const originalContent = String(note.content || '');

    const autoLinkResult = autoLink
      ? NoteProcessor.autoLink(originalContent, titles, {
          currentTitle: note.title || '',
          maxReplacements: 200
        })
      : { content: originalContent, linksCreated: 0 };

    const content = autoLinkResult.content;
    const contentHash = await computeContentHash(content);

    const prepared = {
      id: note.id,
      title: String(note.title || '').trim(),
      content,
      contentHash,
      createdAt: note.createdAt || now,
      updatedAt: now
    };

    const derived = NoteProcessor.buildDerivedFields(prepared, titles);

    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);

    store.put(derived);
    await transactionToPromise(tx);

    // Actualiza índice
    titleIndex.add(derived.id, derived.title);

    // Callback opcional para actualizaciones en UI/grafo
    if (typeof onLinksChanged === 'function') {
      try {
        onLinksChanged(derived);
      } catch (err) {
        console.error('Error en onLinksChanged():', err);
      }
    }

    return derived;
  } catch (error) {
    console.error('Error en saveNote():', error);
    throw error;
  }
}

/**
 * Guarda nota con sugerencias de autolink SIN mutar automáticamente.
 * Modo más seguro: retorna sugerencias para que UI las muestre.
 *
 * @param {object} note - { id, title, content, ... }
 * @returns {Promise<object>} { note, suggestions }
 */
export async function saveNoteWithSuggestions(note) {
  const validation = validateNote(note);
  if (!validation.valid) {
    throw new Error(`Validación fallida: ${validation.errors.join('; ')}`);
  }

  try {
    let titles = titleIndex.getAll();
    if (titles.length === 0) {
      const allNotes = await getAllNotes();
      titleIndex.rebuild(allNotes);
      titles = titleIndex.getAll();
    }

    const now = new Date().toISOString();
    const contentHash = await computeContentHash(note.content);

    const prepared = {
      id: note.id,
      title: String(note.title || '').trim(),
      content: String(note.content || ''),
      contentHash,
      createdAt: note.createdAt || now,
      updatedAt: now
    };

    const derived = NoteProcessor.buildDerivedFields(prepared, titles);

    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);

    store.put(derived);
    await transactionToPromise(tx);

    titleIndex.add(derived.id, derived.title);

    return {
      note: derived,
      suggestions: derived.backlinkCandidates || []
    };
  } catch (error) {
    console.error('Error en saveNoteWithSuggestions():', error);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────
// Utilidades
// ────────────────────────────────────────────────────────────────

/**
 * Obtiene estadísticas del vault
 *
 * @returns {Promise<object>} { totalNotes, totalLinks, titleIndexSize }
 */
export async function getVaultStats() {
  try {
    const allNotes = await getAllNotes();
    const totalLinks = allNotes.reduce((sum, note) => sum + (note.links?.length || 0), 0);

    return {
      totalNotes: allNotes.length,
      totalLinks,
      titleIndexSize: titleIndex.size(),
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error en getVaultStats():', error);
    throw error;
  }
}

/**
 * Limpia completamente el vault (DESTRUCTIVO)
 *
 * @returns {Promise<boolean>}
 */
export async function clearVault() {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);

    store.clear();
    await transactionToPromise(tx);

    titleIndex.invalidate();
    return true;
  } catch (error) {
    console.error('Error en clearVault():', error);
    throw error;
  }
}

/**
 * Reconstruye el índice de títulos desde la DB
 * Útil si sospechas que está desincronizado
 *
 * @returns {Promise<number>} Cantidad de títulos indexados
 */
export async function rebuildTitleIndex() {
  try {
    const allNotes = await getAllNotes();
    titleIndex.rebuild(allNotes);
    return titleIndex.size();
  } catch (error) {
    console.error('Error en rebuildTitleIndex():', error);
    throw error;
  }
}

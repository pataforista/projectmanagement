/**
 * scripts/processor.js
 *
 * Utilidades para procesar notas:
 * - Extrae y protege frontmatter YAML
 * - Protege segmentos sensibles (código, links, wikilinks)
 * - Sugiere y aplica autolinks de forma conservadora
 * - Extrae metadatos, wikilinks y resúmenes
 */

import { parse as parseYAML } from 'https://cdn.jsdelivr.net/npm/yaml@2.8.2/+esm';

/**
 * Escapa caracteres especiales de regex
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normaliza saltos de línea (CRLF → LF)
 */
function normalizeLineEndings(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

/**
 * Deduplica y limpia array de strings
 */
function uniqueStrings(arr) {
  return [...new Set(arr.filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
}

/**
 * Ordena títulos por longitud descendente (evita overlaps al linkear)
 */
function sortTitlesForLinking(titles) {
  return uniqueStrings(titles).sort((a, b) => b.length - a.length);
}

/**
 * Protege segmentos que no deben alterarse.
 * Devuelve { text, restore(processedText) }
 *
 * Orden de protección importante:
 * 1. Frontmatter YAML (si existe)
 * 2. Code fences (``` ... ```)
 * 3. Inline code (`...`)
 * 4. Wikilinks existentes ([[...]])
 * 5. Links markdown ([texto](url))
 */
function protectSegments(content) {
  let text = content;
  const protectedChunks = [];

  const protect = (regex) => {
    text = text.replace(regex, (match) => {
      const token = `__PROTECTED_${protectedChunks.length}__`;
      protectedChunks.push(match);
      return token;
    });
  };

  // 1. Frontmatter YAML al inicio
  protect(/^---\n[\s\S]*?\n---\n?/);

  // 2. Fenced code blocks
  protect(/```[\s\S]*?```/g);

  // 3. Inline code
  protect(/`[^`\n]+`/g);

  // 4. Wikilinks ya existentes
  protect(/\[\[[^[\]]+\]\]/g);

  // 5. Links markdown [texto](url)
  protect(/\[[^\]]+\]\([^)]+\)/g);

  return {
    text,
    restore(processedText) {
      return processedText.replace(/__PROTECTED_(\d+)__/g, (_, i) => protectedChunks[Number(i)]);
    }
  };
}

/**
 * Extrae bloque frontmatter YAML del inicio
 */
function extractFrontmatterBlock(content) {
  const normalized = normalizeLineEndings(content);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? match[1] : null;
}

/**
 * Extrae todos los wikilinks del contenido.
 * Soporta alias: [[Destino|Alias]] → extrae "Destino"
 */
function extractWikiLinks(content) {
  const links = [];
  const regex = /\[\[([^[\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    // Soporte para alias estilo [[Destino|Alias]]
    const [target] = raw.split('|').map(s => s.trim());
    if (target) links.push(target);
  }

  return uniqueStrings(links);
}

/**
 * Genera resumen heurístico simple (no NLP real).
 * Extrae primeras N oraciones.
 *
 * @param {string} text - Contenido a resumir
 * @param {number} sentencesCount - Cantidad de oraciones (default 2)
 * @returns {string} Resumen
 */
function summarize(text, sentencesCount = 2) {
  const clean = normalizeLineEndings(text)
    .replace(/^---[\s\S]*?\n---\n?/, '')       // Elimina frontmatter
    .replace(/```[\s\S]*?```/g, ' ')          // Elimina code fences
    .replace(/`[^`\n]+`/g, ' ')               // Elimina inline code
    .replace(/\[\[([^[\]]+)\]\]/g, '$1')      // Resuelve wikilinks a texto plano
    .replace(/\s+/g, ' ')                     // Compacta espacios
    .trim();

  if (!clean) return '';

  // Extrae oraciones (simple regex, no perfecto)
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  if (sentences.length <= sentencesCount) return clean;

  if (sentencesCount <= 1) return sentences[0].trim();

  const first = sentences[0]?.trim() || '';
  const last = sentences[sentences.length - 1]?.trim() || '';

  if (!first) return clean;
  if (!last || first === last) return first;

  return `${first} […] ${last}`;
}

/**
 * Sugiere autolinks sin mutar el texto original.
 *
 * @param {string} content - Contenido a analizar
 * @param {string[]} titles - Títulos disponibles para linkear
 * @param {object} options - { currentTitle }
 * @returns {Array} Sugerencias: { title, index, match }
 */
function suggestAutoLinks(content, titles, options = {}) {
  const { currentTitle = '' } = options;
  const normalized = normalizeLineEndings(content);
  const protectedView = protectSegments(normalized);

  const suggestions = [];
  const sortedTitles = sortTitlesForLinking(titles);

  for (const title of sortedTitles) {
    if (!title) continue;
    if (currentTitle && title.toLowerCase() === currentTitle.toLowerCase()) continue;

    const escapedTitle = escapeRegExp(title);
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedTitle})(?=$|[^\\p{L}\\p{N}_])`, 'giu');

    let match;
    while ((match = regex.exec(protectedView.text)) !== null) {
      suggestions.push({
        title,
        index: match.index,
        match: match[2]
      });
    }
  }

  return suggestions;
}

/**
 * Aplica autolink de forma conservadora.
 *
 * - Protege segmentos antes de enlazar
 * - Ordena títulos por longitud (evita overlaps)
 * - No enlaza el título actual
 *
 * @param {string} content - Contenido original
 * @param {string[]} titles - Títulos disponibles
 * @param {object} options - { currentTitle, maxReplacements }
 * @returns {object} { content, linksCreated }
 */
function autoLink(content, titles, options = {}) {
  const {
    currentTitle = '',
    maxReplacements = 200
  } = options;

  const normalized = normalizeLineEndings(content);
  const protectedView = protectSegments(normalized);
  let tempContent = protectedView.text;
  let replacements = 0;

  const sortedTitles = sortTitlesForLinking(titles);

  for (const title of sortedTitles) {
    if (replacements >= maxReplacements) break;
    if (!title) continue;
    if (currentTitle && title.toLowerCase() === currentTitle.toLowerCase()) continue;

    const escapedTitle = escapeRegExp(title);
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedTitle})(?=$|[^\\p{L}\\p{N}_])`, 'giu');

    tempContent = tempContent.replace(regex, (full, before, match) => {
      if (replacements >= maxReplacements) return full;
      replacements += 1;
      return `${before}[[${match}]]`;
    });
  }

  return {
    content: protectedView.restore(tempContent),
    linksCreated: replacements
  };
}

/**
 * Extrae metadatos YAML del frontmatter
 *
 * @param {string} content - Contenido de la nota
 * @returns {object} Objeto metadatos parseado
 */
function extractMetadata(content) {
  const block = extractFrontmatterBlock(content);
  if (!block) return {};

  try {
    const parsed = parseYAML(block);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Error parseando YAML frontmatter:', error.message);
    return {};
  }
}

/**
 * Construye campos derivados para una nota.
 * Útil para indexación, grafo y búsqueda.
 *
 * @param {object} note - Nota base { id, title, content, ... }
 * @param {string[]} allTitles - Todos los títulos del vault (para sugerencias)
 * @returns {object} Nota enriquecida con campos derivados
 */
function buildDerivedFields(note, allTitles = []) {
  const content = normalizeLineEndings(note.content || '');
  const metadata = extractMetadata(content);
  const links = extractWikiLinks(content);
  const summary = summarize(content, 2);

  return {
    ...note,
    content,
    metadata,
    links,
    summary,
    backlinkCandidates: suggestAutoLinks(content, allTitles, {
      currentTitle: note.title || ''
    }).slice(0, 50) // tope defensivo para UI
  };
}

export const NoteProcessor = {
  escapeRegExp,
  normalizeLineEndings,
  uniqueStrings,
  sortTitlesForLinking,
  protectSegments,
  extractFrontmatterBlock,
  extractWikiLinks,
  summarize,
  suggestAutoLinks,
  autoLink,
  extractMetadata,
  buildDerivedFields
};

# 📝 Notes Wiki System

Sistema modular de notas con wikilinks, indexación y almacenamiento local (IndexedDB) para la PWA Workspace.

## 📁 Estructura

```
/scripts
  ├── processor.js      # Procesamiento de texto (YAML, wikilinks, autolinks)
  ├── db.js            # Capa IndexedDB con CRUD optimizado
  └── notes-utils.js   # Utilidades (hash, UUID, validación, índices)

/examples
  └── notes-example.html # Demo funcional
```

## 🚀 Características

- **Wikilinks**: `[[Nota relacionada]]` con soporte de alias `[[Destino|Alias]]`
- **Frontmatter YAML**: Metadatos estructurados en notas
- **Autolinks conservadores**: Sugerencias antes de mutar contenido
- **Protección de segmentos**: No toca código, links markdown existentes, inline code
- **TitleIndex**: Caché en memoria para búsquedas rápidas
- **Content Hash**: Detecta cambios reales (útil para sync)
- **Resúmenes heurísticos**: Extrae primeras oraciones automáticamente

## 📖 Uso Básico

### Opción 1: Guardado Conservador (Recomendado)

```javascript
import { saveNoteWithSuggestions } from './scripts/db.js';
import { generateUUID } from './scripts/notes-utils.js';

const result = await saveNoteWithSuggestions({
  id: generateUUID(),
  title: 'Esquizofrenia',
  content: `---
type: medico
area: psiquiatria
---

La esquizofrenia comparte características con psicosis temprana.
`
});

console.log('Nota guardada:', result.note);
console.log('Sugerencias de autolink:', result.suggestions);
```

**Ventajas:**
- No muta el contenido
- Retorna sugerencias para UI
- Ideal para evitar sorpresas

### Opción 2: Autolink Automático

```javascript
import { saveNote } from './scripts/db.js';

const saved = await saveNote(
  {
    id: generateUUID(),
    title: 'Psicosis',
    content: 'La esquizofrenia y psicosis temprana comparten síntomas.'
  },
  {
    autoLink: true,
    onLinksChanged: (note) => {
      console.log('Links aplicados:', note.links);
      updateGraph(note);
    }
  }
);
```

**Advertencia:**
- Modifica el contenido antes de guardar
- El texto pasará de `"esquizofrenia"` a `"[[esquizofrenia]]"`
- Útil para modo 100% automático

### Opción 3: Raw (Sin Procesamiento)

```javascript
import { saveNoteRaw } from './scripts/db.js';

const note = await saveNoteRaw({
  id: generateUUID(),
  title: 'Mi Nota',
  content: 'Contenido sin modificar'
});
```

## 🔍 Búsqueda y Recuperación

```javascript
import {
  getAllNotes,
  getNoteById,
  getNotesByIndex,
  getVaultStats
} from './scripts/db.js';

// Todas las notas
const notes = await getAllNotes();

// Una nota por ID
const note = await getNoteById('abc-123');

// Por índice (ej: por título)
const byTitle = await getNotesByIndex('title', 'Esquizofrenia');

// Estadísticas
const stats = await getVaultStats();
// { totalNotes, totalLinks, titleIndexSize, lastChecked }
```

## 🛡️ Protección de Segmentos

El procesador protege automáticamente:

```markdown
---
yaml: frontmatter
---

# No se toca

Pero `inline code` está protegido.

```
Code fences también:
```

Y [markdown links](http://example.com) no se tocan.

Ni [[wikilinks existentes]].

Sí se enlazan palabras sueltas como "esquizofrenia" → [[esquizofrenia]]
```

## 📊 TitleIndex

La clase `TitleIndex` optimiza búsquedas de títulos:

```javascript
import { TitleIndex } from './scripts/notes-utils.js';

const index = new TitleIndex();
index.add('id-1', 'Esquizofrenia');
index.add('id-2', 'Psicosis');

console.log(index.getAll());        // ['Esquizofrenia', 'Psicosis']
console.log(index.size());           // 2

index.remove('id-1');
index.invalidate();                 // limpia todo
```

## 🔐 Validación

```javascript
import { validateNote } from './scripts/notes-utils.js';

const validation = validateNote(note);
if (!validation.valid) {
  console.error(validation.errors);
  // ['Campo requerido: id', 'Campo requerido: title', ...]
}
```

## 🔨 Utilidades

### Content Hash

Detecta si una nota realmente cambió:

```javascript
import { computeContentHash } from './scripts/notes-utils.js';

const hash = await computeContentHash('contenido');
// '8f14e45fceea167a5a36dedd4bea2543ce1b8325f9d...'
```

### Generate UUID

```javascript
import { generateUUID } from './scripts/notes-utils.js';

const id = generateUUID(); // 'abc-123-def-456'
```

### Format Date

```javascript
import { formatDate } from './scripts/notes-utils.js';

formatDate('2024-03-09T14:30:00Z');
// "9 mar 14:30" (locale es-ES)
```

### Export a Markdown

```javascript
import { noteToMarkdown } from './scripts/notes-utils.js';

const md = noteToMarkdown(note);
// Retorna markdown con frontmatter, título y metadata
```

## 🗄️ IndexedDB

El sistema usa IndexedDB nativo correctamente:

- **DB**: `workspace-notes`
- **Store**: `notes` (keyPath: `id`)
- **Índices**: `title`, `updatedAt`, `createdAt`

**Limitaciones conocidas:**
- En multi-tab, solo el primer tab mantiene `dbInstance` global
- Si otro tab cierra la DB, se limpia el singleton
- El caché `TitleIndex` es volátil (se recarga por página)

## 🌐 Campos de una Nota Guardada

```javascript
{
  id: 'uuid',
  title: 'Título',
  content: 'Contenido con [[wikilinks]]',
  contentHash: 'sha256-hex',

  // Derivados (procesados automáticamente)
  metadata: { type: 'medico', ... },
  links: ['Esquizofrenia', 'Psicosis'],
  summary: 'Primeras oraciones...',
  backlinkCandidates: [
    { title: 'Esquizofrenia', index: 45, match: 'esquizofrenia' },
    ...
  ],

  // Timestamps
  createdAt: '2024-03-09T14:30:00Z',
  updatedAt: '2024-03-09T14:35:00Z'
}
```

## 📝 Processor API

```javascript
import { NoteProcessor } from './scripts/processor.js';

// Extrae frontmatter YAML
const metadata = NoteProcessor.extractMetadata(content);

// Extrae wikilinks
const links = NoteProcessor.extractWikiLinks(content);

// Genera resumen
const summary = NoteProcessor.summarize(content, 2);

// Sugiere autolinks sin mutar
const suggestions = NoteProcessor.suggestAutoLinks(
  content,
  allTitles,
  currentTitle
);

// Aplica autolinks
const linkedContent = NoteProcessor.autoLink(
  content,
  allTitles,
  currentTitle
);

// Construye derivados completos
const derived = NoteProcessor.buildDerivedFields(note, allTitles);
```

## 🔄 Flujo Recomendado

1. **Nuevo usuario crea nota** → `saveNoteWithSuggestions()`
2. **Muestra sugerencias en UI** → User revisa y acepta
3. **Si acepta** → Aplica manualmente `autoLink()` o guarda con `saveNote()`
4. **Si rechaza** → Solo `saveNoteRaw()`

Evita sorpresas y permite control del usuario sobre cambios.

## 🚨 Manejo de Errores

Todos los métodos lanzan excepciones en caso de error:

```javascript
try {
  const note = await saveNote(data);
} catch (error) {
  console.error('Guardado fallido:', error.message);
  // "Validación fallida: Campo requerido: id"
  // "IndexedDB transaction failed"
  // etc.
}
```

## 📦 Tamaño

- `processor.js` ~8 KB
- `db.js` ~6 KB
- `notes-utils.js` ~4 KB
- **Total:** ~18 KB (sin minify)

## 🔗 Dependencias Externas

- **YAML**: `yaml@2.8.2` vía jsDelivr (ESM)
- **IndexedDB**: API nativa del navegador
- **Crypto**: `crypto.subtle` para hash SHA-256

## 📚 Ejemplo Funcional

Ver `/examples/notes-example.html` para una demo minimalista que muestra:
- Crear notas
- Listar notas
- Autolink automático vs. con sugerencias
- Estadísticas del vault
- Limpiar todo

Abre en navegador: `file:///path/to/examples/notes-example.html`

---

**Status:** MVP estable. Listo para integrar en vistas de Workspace.
